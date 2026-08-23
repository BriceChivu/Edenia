-- Protect one generation before atomically starting the owner's next one.
create table private.learner_profile_resets (
  id uuid primary key,
  user_id uuid not null,
  operation_id uuid not null,
  request_sha256 text not null,
  profile_id uuid not null,
  prior_generation bigint not null,
  prior_revision bigint not null,
  prior_version_id uuid not null,
  reset_generation bigint not null,
  reset_revision bigint not null,
  reset_version_id uuid not null,
  state text not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  protected_until timestamptz not null,
  undone_at timestamptz,
  undo_operation_id uuid,
  restored_version_id uuid,
  constraint learner_profile_resets_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_resets_prior_version_fkey
    foreign key (prior_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_resets_reset_version_fkey
    foreign key (reset_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_resets_restored_version_fkey
    foreign key (restored_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_resets_operation_key
    unique (user_id, operation_id),
  constraint learner_profile_resets_undo_operation_key
    unique (user_id, undo_operation_id),
  constraint learner_profile_resets_generation_check check (
    prior_generation >= 1
    and prior_revision >= 1
    and reset_generation = prior_generation + 1
    and reset_revision = 1
  ),
  constraint learner_profile_resets_digest_check check (
    request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_resets_protection_check check (
    protected_until >= created_at + interval '30 days'
  ),
  constraint learner_profile_resets_state_check check (
    (
      state = 'active'
      and undone_at is null
      and undo_operation_id is null
      and restored_version_id is null
    )
    or (
      state = 'undone'
      and undone_at is not null
      and undo_operation_id is not null
      and restored_version_id is not null
    )
  )
);

comment on table private.learner_profile_resets is
  'Owner-scoped prior generations retained for 30-day Start over recovery.';

create index learner_profile_resets_owner_state_created_idx
  on private.learner_profile_resets (
    user_id,
    state,
    created_at desc,
    id desc
  );

create index learner_profile_resets_prior_version_idx
  on private.learner_profile_resets (prior_version_id, user_id, profile_id);

create index learner_profile_resets_reset_version_idx
  on private.learner_profile_resets (reset_version_id, user_id, profile_id);

create index learner_profile_resets_restored_version_idx
  on private.learner_profile_resets (restored_version_id, user_id, profile_id)
  where restored_version_id is not null;

alter table private.learner_profile_resets enable row level security;

revoke all on table private.learner_profile_resets
  from public, anon, authenticated, service_role;

create function learner_profile_rpc.start_over_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb,
  p_confirmed boolean
)
returns table (
  status text,
  reset_id uuid,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb,
  protected_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  access_control private.learner_profile_access_control%rowtype;
  current_head public.learner_profile_heads%rowtype;
  current_envelope jsonb;
  prior_reset private.learner_profile_resets%rowtype;
  new_reset_id uuid;
  new_version_id uuid;
  request_digest text;
  reset_time timestamptz;
  protection_deadline timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null
    or p_profile_id is null
    or p_generation is null
    or p_generation < 1
    or p_base_revision is null
    or p_base_revision < 1
  then
    raise exception 'Learner profile reset identity is invalid'
      using errcode = '22023';
  end if;

  select value.* into strict access_control
  from private.learner_profile_access_control as value
  where value.singleton;
  if access_control.rollout_state = 'off'
    or (
      access_control.rollout_state = 'developer-canary'
      and access_control.developer_user_id is distinct from owner_id
    )
  then
    return query select
      'access_disabled'::text,
      null::uuid,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false)
  for update;
  if not found then
    return query select
      'verified_account_required'::text,
      null::uuid,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  if p_confirmed is distinct from true then
    return query select
      'confirmation_required'::text,
      null::uuid,
      p_profile_id,
      p_generation,
      p_base_revision,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  perform private.assert_learner_profile_envelope(p_envelope);
  request_digest := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          private.canonical_jsonb_text(pg_catalog.jsonb_build_object(
            'baseRevision', p_base_revision,
            'envelope', p_envelope,
            'generation', p_generation,
            'operationId', p_operation_id,
            'ownerId', owner_id,
            'profileId', p_profile_id
          )),
          'UTF8'
        ),
        'sha256'
      ),
      'base64'
    ),
    '+/',
    '-_'
  ), '=');

  select reset.* into prior_reset
  from private.learner_profile_resets as reset
  where reset.user_id = owner_id
    and reset.operation_id = p_operation_id;
  if found then
    if prior_reset.request_sha256 <> request_digest then
      raise exception 'Learner profile reset operation identity was reused'
        using errcode = '22023';
    end if;
    return query
    select
      'already_started_over'::text,
      prior_reset.id,
      prior_reset.profile_id,
      prior_reset.reset_generation,
      prior_reset.reset_revision,
      version.envelope,
      prior_reset.protected_until
    from public.learner_profile_versions as version
    where version.id = prior_reset.reset_version_id
      and version.user_id = owner_id
      and version.profile_id = prior_reset.profile_id;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      null::uuid,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  select version.envelope into strict current_envelope
  from public.learner_profile_versions as version
  where version.id = current_head.current_version_id
    and version.user_id = owner_id
    and version.profile_id = current_head.profile_id;
  perform private.assert_learner_profile_envelope(current_envelope);

  if current_head.profile_id is distinct from p_profile_id
    or current_head.generation is distinct from p_generation
    or current_head.revision is distinct from p_base_revision
  then
    return query select
      'head_changed'::text,
      null::uuid,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      current_envelope,
      null::timestamptz;
    return;
  end if;

  new_reset_id := extensions.gen_random_uuid();
  new_version_id := extensions.gen_random_uuid();
  reset_time := pg_catalog.now();
  protection_deadline := reset_time + interval '30 days';

  insert into public.learner_profile_versions (
    id,
    user_id,
    profile_id,
    generation,
    revision,
    base_revision,
    envelope,
    payload_sha256,
    payload_bytes
  ) values (
    new_version_id,
    owner_id,
    p_profile_id,
    p_generation + 1,
    1,
    0,
    p_envelope,
    p_envelope #>> '{integrity,payloadSha256}',
    (p_envelope #>> '{integrity,byteLength}')::integer
  );

  insert into private.learner_profile_resets (
    id,
    user_id,
    operation_id,
    request_sha256,
    profile_id,
    prior_generation,
    prior_revision,
    prior_version_id,
    reset_generation,
    reset_revision,
    reset_version_id,
    created_at,
    protected_until
  ) values (
    new_reset_id,
    owner_id,
    p_operation_id,
    request_digest,
    p_profile_id,
    p_generation,
    p_base_revision,
    current_head.current_version_id,
    p_generation + 1,
    1,
    new_version_id,
    reset_time,
    protection_deadline
  );

  update public.learner_profile_heads as head
  set generation = p_generation + 1,
      revision = 1,
      current_version_id = new_version_id,
      updated_at = reset_time
  where head.user_id = owner_id
    and head.profile_id = p_profile_id
    and head.generation = p_generation
    and head.revision = p_base_revision
    and head.current_version_id = current_head.current_version_id;
  if not found then
    raise exception 'Learner profile head changed during reset'
      using errcode = '40001';
  end if;

  return query select
    'started_over'::text,
    new_reset_id,
    p_profile_id,
    p_generation + 1,
    1::bigint,
    p_envelope,
    protection_deadline;
end;
$$;

revoke execute on function
  learner_profile_rpc.start_over_my_learner_profile(
    uuid,
    uuid,
    bigint,
    bigint,
    jsonb,
    boolean
  ) from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.start_over_my_learner_profile(
    uuid,
    uuid,
    bigint,
    bigint,
    jsonb,
    boolean
  ) to authenticated;

create function public.start_over_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb,
  p_confirmed boolean
)
returns table (
  status text,
  reset_id uuid,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb,
  protected_until timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.start_over_my_learner_profile(
    p_operation_id,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_envelope,
    p_confirmed
  );
$$;

revoke execute on function public.start_over_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.start_over_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) to authenticated;

comment on function public.start_over_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) is
  'Starts one confirmed blank generation after protecting the exact owner head for 30 days.';

create function learner_profile_rpc.read_my_latest_learner_profile_reset()
returns table (
  status text,
  reset_id uuid,
  profile_id uuid,
  prior_generation bigint,
  prior_revision bigint,
  reset_generation bigint,
  prior_envelope jsonb,
  protected_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  stored_reset private.learner_profile_resets%rowtype;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select reset.* into stored_reset
  from private.learner_profile_resets as reset
  where reset.user_id = owner_id
  order by reset.created_at desc, reset.id desc
  limit 1;
  if not found then
    return query select
      'none'::text,
      null::uuid,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;
  if stored_reset.state = 'undone' then
    return query select
      'undone'::text,
      stored_reset.id,
      stored_reset.profile_id,
      stored_reset.prior_generation,
      stored_reset.prior_revision,
      stored_reset.reset_generation,
      null::jsonb,
      stored_reset.protected_until;
    return;
  end if;
  if stored_reset.protected_until <= pg_catalog.now() then
    return query select
      'expired'::text,
      stored_reset.id,
      stored_reset.profile_id,
      stored_reset.prior_generation,
      stored_reset.prior_revision,
      stored_reset.reset_generation,
      null::jsonb,
      stored_reset.protected_until;
    return;
  end if;

  return query
  select
    'available'::text,
    stored_reset.id,
    stored_reset.profile_id,
    stored_reset.prior_generation,
    stored_reset.prior_revision,
    stored_reset.reset_generation,
    version.envelope,
    stored_reset.protected_until
  from public.learner_profile_versions as version
  where version.id = stored_reset.prior_version_id
    and version.user_id = owner_id
    and version.profile_id = stored_reset.profile_id;
end;
$$;

revoke execute on function
  learner_profile_rpc.read_my_latest_learner_profile_reset()
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.read_my_latest_learner_profile_reset()
  to authenticated;

create function public.read_my_latest_learner_profile_reset()
returns table (
  status text,
  reset_id uuid,
  profile_id uuid,
  prior_generation bigint,
  prior_revision bigint,
  reset_generation bigint,
  prior_envelope jsonb,
  protected_until timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.read_my_latest_learner_profile_reset();
$$;

revoke execute on function public.read_my_latest_learner_profile_reset()
  from public, anon, authenticated, service_role;
grant execute on function public.read_my_latest_learner_profile_reset()
  to authenticated;

comment on function public.read_my_latest_learner_profile_reset() is
  'Returns the owner latest Start over receipt and protected generation while Undo remains available.';

create function learner_profile_rpc.undo_my_learner_profile_start_over(
  p_reset_id uuid,
  p_operation_id uuid,
  p_confirmed boolean
)
returns table (
  status text,
  reset_id uuid,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  access_control private.learner_profile_access_control%rowtype;
  stored_reset private.learner_profile_resets%rowtype;
  current_head public.learner_profile_heads%rowtype;
  current_envelope jsonb;
  protected_envelope jsonb;
  new_restored_version_id uuid;
  restored_revision bigint;
  restored_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_reset_id is null or p_operation_id is null then
    raise exception 'Learner profile Undo identity is invalid'
      using errcode = '22023';
  end if;

  select value.* into strict access_control
  from private.learner_profile_access_control as value
  where value.singleton;
  if access_control.rollout_state = 'off'
    or (
      access_control.rollout_state = 'developer-canary'
      and access_control.developer_user_id is distinct from owner_id
    )
  then
    return query select
      'access_disabled'::text,
      p_reset_id,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false)
  for update;
  if not found then
    return query select
      'verified_account_required'::text,
      p_reset_id,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  if p_confirmed is distinct from true then
    return query select
      'confirmation_required'::text,
      p_reset_id,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  select reset.* into stored_reset
  from private.learner_profile_resets as reset
  where reset.id = p_reset_id
    and reset.user_id = owner_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      p_reset_id,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  if stored_reset.state = 'undone' then
    return query
    select
      'already_undone'::text,
      stored_reset.id,
      stored_reset.profile_id,
      version.generation,
      version.revision,
      version.envelope
    from public.learner_profile_versions as version
    where version.id = stored_reset.restored_version_id
      and version.user_id = owner_id
      and version.profile_id = stored_reset.profile_id;
    return;
  end if;

  if stored_reset.protected_until <= pg_catalog.now() then
    return query select
      'expired'::text,
      stored_reset.id,
      stored_reset.profile_id,
      stored_reset.reset_generation,
      stored_reset.reset_revision,
      null::jsonb;
    return;
  end if;

  select version.envelope into strict protected_envelope
  from public.learner_profile_versions as version
  where version.id = stored_reset.prior_version_id
    and version.user_id = owner_id
    and version.profile_id = stored_reset.profile_id;
  perform private.assert_learner_profile_envelope(protected_envelope);

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      stored_reset.id,
      stored_reset.profile_id,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  select version.envelope into strict current_envelope
  from public.learner_profile_versions as version
  where version.id = current_head.current_version_id
    and version.user_id = owner_id
    and version.profile_id = current_head.profile_id;
  perform private.assert_learner_profile_envelope(current_envelope);

  if current_head.profile_id is distinct from stored_reset.profile_id
    or current_head.generation is distinct from stored_reset.reset_generation
  then
    return query select
      'head_changed'::text,
      stored_reset.id,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      current_envelope;
    return;
  end if;

  new_restored_version_id := extensions.gen_random_uuid();
  restored_revision := current_head.revision + 1;
  restored_at := pg_catalog.now();

  insert into public.learner_profile_versions (
    id,
    user_id,
    profile_id,
    generation,
    revision,
    base_revision,
    envelope,
    payload_sha256,
    payload_bytes
  ) values (
    new_restored_version_id,
    owner_id,
    stored_reset.profile_id,
    current_head.generation,
    restored_revision,
    current_head.revision,
    protected_envelope,
    protected_envelope #>> '{integrity,payloadSha256}',
    (protected_envelope #>> '{integrity,byteLength}')::integer
  );

  update private.learner_profile_resets as reset
  set state = 'undone',
      undone_at = restored_at,
      undo_operation_id = p_operation_id,
      restored_version_id = new_restored_version_id
  where reset.id = stored_reset.id
    and reset.user_id = owner_id
    and reset.state = 'active';
  if not found then
    raise exception 'Learner profile reset protection changed during Undo'
      using errcode = '40001';
  end if;

  update public.learner_profile_heads as head
  set revision = restored_revision,
      current_version_id = new_restored_version_id,
      updated_at = restored_at
  where head.user_id = owner_id
    and head.profile_id = stored_reset.profile_id
    and head.generation = current_head.generation
    and head.revision = current_head.revision
    and head.current_version_id = current_head.current_version_id;
  if not found then
    raise exception 'Learner profile head changed during Undo'
      using errcode = '40001';
  end if;

  return query select
    'undone'::text,
    stored_reset.id,
    stored_reset.profile_id,
    current_head.generation,
    restored_revision,
    protected_envelope;
end;
$$;

revoke execute on function
  learner_profile_rpc.undo_my_learner_profile_start_over(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.undo_my_learner_profile_start_over(uuid, uuid, boolean)
  to authenticated;

create function public.undo_my_learner_profile_start_over(
  p_reset_id uuid,
  p_operation_id uuid,
  p_confirmed boolean
)
returns table (
  status text,
  reset_id uuid,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.undo_my_learner_profile_start_over(
    p_reset_id,
    p_operation_id,
    p_confirmed
  );
$$;

revoke execute on function
  public.undo_my_learner_profile_start_over(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  public.undo_my_learner_profile_start_over(uuid, uuid, boolean)
  to authenticated;

comment on function
  public.undo_my_learner_profile_start_over(uuid, uuid, boolean) is
  'Restores one protected generation as the current generation next accepted revision.';
