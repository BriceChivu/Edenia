-- Distinguish trusted owner history with no current head from unsafe profile data.
create or replace function private.is_valid_learner_profile_envelope(
  p_envelope jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_learner_profile_envelope(p_envelope);
  return true;
exception
  when others then
    return false;
end;
$$;

revoke execute on function
  private.is_valid_learner_profile_envelope(jsonb)
  from public, anon, authenticated, service_role;

create or replace function learner_profile_rpc.list_my_learner_profile_recovery_candidates()
returns table (
  source text,
  candidate_id uuid,
  protected_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  access_control private.learner_profile_access_control%rowtype;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
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
    return;
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false);
  if not found then
    return;
  end if;

  return query
  select
    'protected'::text,
    candidate.conflict_id,
    candidate.protection_deadline
  from (
    select
      conflict.id as conflict_id,
      conflict.protected_until as protection_deadline,
      case conflict.selected_side
        when 'device' then version.envelope
        else conflict.device_envelope
      end as candidate_envelope
    from private.learner_profile_conflicts as conflict
    join public.learner_profile_versions as version
      on version.id = conflict.cloud_version_id
     and version.user_id = conflict.user_id
     and version.profile_id = conflict.cloud_profile_id
    where conflict.user_id = owner_id
      and conflict.state = 'resolved'
      and conflict.protected_until > pg_catalog.now()
  ) as candidate
  where private.is_valid_learner_profile_envelope(
    candidate.candidate_envelope
  )
  order by candidate.protection_deadline desc, candidate.conflict_id desc
  limit 8;
end;
$$;

revoke execute on function
  learner_profile_rpc.list_my_learner_profile_recovery_candidates()
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.list_my_learner_profile_recovery_candidates()
  to authenticated;

create or replace function public.list_my_learner_profile_recovery_candidates()
returns table (
  source text,
  candidate_id uuid,
  protected_until timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.list_my_learner_profile_recovery_candidates();
$$;

revoke execute on function
  public.list_my_learner_profile_recovery_candidates()
  from public, anon, authenticated, service_role;
grant execute on function
  public.list_my_learner_profile_recovery_candidates()
  to authenticated;

create or replace function learner_profile_rpc.read_my_learner_profile_recovery_candidate(
  p_candidate_id uuid
)
returns table (
  status text,
  candidate_id uuid,
  envelope jsonb,
  protected_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  access_control private.learner_profile_access_control%rowtype;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_candidate_id is null then
    raise exception 'Learner profile recovery candidate is invalid'
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
    return;
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false);
  if not found then
    return;
  end if;

  return query
  select
    'available'::text,
    conflict.id,
    candidate.envelope,
    conflict.protected_until
  from private.learner_profile_conflicts as conflict
  join public.learner_profile_versions as version
    on version.id = conflict.cloud_version_id
   and version.user_id = conflict.user_id
   and version.profile_id = conflict.cloud_profile_id
  cross join lateral (
    select case conflict.selected_side
      when 'device' then version.envelope
      else conflict.device_envelope
    end as envelope
  ) as candidate
  where conflict.id = p_candidate_id
    and conflict.user_id = owner_id
    and conflict.state = 'resolved'
    and conflict.protected_until > pg_catalog.now()
    and private.is_valid_learner_profile_envelope(candidate.envelope);
end;
$$;

revoke execute on function
  learner_profile_rpc.read_my_learner_profile_recovery_candidate(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.read_my_learner_profile_recovery_candidate(uuid)
  to authenticated;

create or replace function public.read_my_learner_profile_recovery_candidate(
  p_candidate_id uuid
)
returns table (
  status text,
  candidate_id uuid,
  envelope jsonb,
  protected_until timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.read_my_learner_profile_recovery_candidate(
    p_candidate_id
  );
$$;

revoke execute on function
  public.read_my_learner_profile_recovery_candidate(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.read_my_learner_profile_recovery_candidate(uuid)
  to authenticated;

create table if not exists private.learner_profile_recoveries (
  user_id uuid not null,
  operation_id uuid not null,
  request_sha256 text not null,
  source text not null,
  source_candidate_id uuid,
  source_profile_id uuid not null,
  source_generation bigint not null,
  source_revision bigint not null,
  restored_profile_id uuid not null,
  restored_generation bigint not null,
  restored_revision bigint not null,
  restored_version_id uuid not null,
  displaced_profile_id uuid,
  displaced_generation bigint,
  displaced_revision bigint,
  displaced_version_id uuid,
  restored_at timestamptz not null default pg_catalog.now(),
  protected_until timestamptz not null,
  primary key (user_id, operation_id),
  constraint learner_profile_recoveries_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_recoveries_source_candidate_fkey
    foreign key (source_candidate_id)
    references private.learner_profile_conflicts (id),
  constraint learner_profile_recoveries_restored_version_fkey
    foreign key (restored_version_id, user_id, restored_profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_recoveries_displaced_version_fkey
    foreign key (displaced_version_id, user_id, displaced_profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_recoveries_request_digest_check check (
    request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_recoveries_source_check check (
    (source = 'local' and source_candidate_id is null)
    or (source = 'protected' and source_candidate_id is not null)
  ),
  constraint learner_profile_recoveries_revision_check check (
    source_generation >= 1
    and source_revision >= 1
    and restored_generation >= 1
    and restored_revision >= 1
  ),
  constraint learner_profile_recoveries_displaced_check check (
    (
      displaced_version_id is null
      and displaced_profile_id is null
      and displaced_generation is null
      and displaced_revision is null
    ) or (
      displaced_version_id is not null
      and displaced_profile_id is not null
      and displaced_generation >= 1
      and displaced_revision >= 1
    )
  ),
  constraint learner_profile_recoveries_protection_check check (
    protected_until >= restored_at + interval '30 days'
  )
);

comment on table private.learner_profile_recoveries is
  'Owner-scoped, idempotent learner-profile restorations with displaced heads protected for at least 30 days.';

create index if not exists learner_profile_recoveries_owner_protection_idx
  on private.learner_profile_recoveries (
    user_id,
    protected_until desc,
    operation_id desc
  );

alter table private.learner_profile_recoveries enable row level security;

revoke all on table private.learner_profile_recoveries
  from public, anon, authenticated, service_role;

create or replace function learner_profile_rpc.restore_my_learner_profile(
  p_operation_id uuid,
  p_source text,
  p_candidate_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_revision bigint,
  p_envelope jsonb,
  p_confirmed boolean
)
returns table (
  status text,
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
  prior_recovery private.learner_profile_recoveries%rowtype;
  stored_conflict private.learner_profile_conflicts%rowtype;
  current_head public.learner_profile_heads%rowtype;
  candidate_envelope jsonb;
  candidate_profile_id uuid;
  candidate_generation bigint;
  candidate_revision bigint;
  next_revision bigint;
  new_version_id uuid;
  restored_time timestamptz;
  protection_deadline timestamptz;
  request_digest text;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_source not in ('local', 'protected') then
    raise exception 'Learner profile recovery identity is invalid'
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
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  request_digest := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          private.canonical_jsonb_text(pg_catalog.jsonb_build_object(
            'candidateId', p_candidate_id,
            'confirmed', p_confirmed,
            'envelope', p_envelope,
            'generation', p_generation,
            'operationId', p_operation_id,
            'ownerId', owner_id,
            'profileId', p_profile_id,
            'revision', p_revision,
            'source', p_source
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

  select recovery.* into prior_recovery
  from private.learner_profile_recoveries as recovery
  where recovery.user_id = owner_id
    and recovery.operation_id = p_operation_id;
  if found then
    if prior_recovery.request_sha256 <> request_digest then
      raise exception 'Learner profile recovery operation identity was reused'
        using errcode = '22023';
    end if;
    return query
    select
      'already_restored'::text,
      prior_recovery.restored_profile_id,
      prior_recovery.restored_generation,
      prior_recovery.restored_revision,
      version.envelope,
      prior_recovery.protected_until
    from public.learner_profile_versions as version
    where version.id = prior_recovery.restored_version_id
      and version.user_id = owner_id
      and version.profile_id = prior_recovery.restored_profile_id;
    return;
  end if;

  if p_source = 'local' then
    if p_candidate_id is not null
      or p_profile_id is null
      or p_generation is null
      or p_generation < 1
      or p_revision is null
      or p_revision < 1
      or p_envelope is null
    then
      raise exception 'Local learner profile recovery candidate is invalid'
        using errcode = '22023';
    end if;
    perform 1
    from public.learner_profile_versions as version
    where version.user_id = owner_id
      and version.profile_id = p_profile_id
      and version.generation = p_generation
      and version.revision = p_revision;
    if not found then
      return query select
        'recovery_required'::text,
        null::uuid,
        null::bigint,
        null::bigint,
        null::jsonb,
        null::timestamptz;
      return;
    end if;
    candidate_envelope := p_envelope;
    candidate_profile_id := p_profile_id;
    candidate_generation := p_generation;
    candidate_revision := p_revision;
  else
    if p_candidate_id is null
      or p_profile_id is not null
      or p_generation is not null
      or p_revision is not null
      or p_envelope is not null
    then
      raise exception 'Protected learner profile recovery candidate is invalid'
        using errcode = '22023';
    end if;
    select conflict.* into stored_conflict
    from private.learner_profile_conflicts as conflict
    where conflict.id = p_candidate_id
      and conflict.user_id = owner_id
      and conflict.state = 'resolved'
      and conflict.protected_until > pg_catalog.now()
    for update;
    if not found then
      return query select
        'recovery_required'::text,
        null::uuid,
        null::bigint,
        null::bigint,
        null::jsonb,
        null::timestamptz;
      return;
    end if;
    if stored_conflict.selected_side = 'device' then
      select version.envelope into candidate_envelope
      from public.learner_profile_versions as version
      where version.id = stored_conflict.cloud_version_id
        and version.user_id = owner_id
        and version.profile_id = stored_conflict.cloud_profile_id;
      candidate_profile_id := stored_conflict.cloud_profile_id;
      candidate_generation := stored_conflict.cloud_generation;
      candidate_revision := stored_conflict.cloud_revision;
    else
      candidate_envelope := stored_conflict.device_envelope;
      candidate_profile_id := stored_conflict.profile_id;
      candidate_generation := stored_conflict.generation;
      candidate_revision := stored_conflict.device_revision;
    end if;
  end if;

  if exists (
    select 1
    from public.learner_profile_versions as version
    where version.profile_id = candidate_profile_id
      and version.user_id <> owner_id
  ) then
    raise exception 'Learner profile recovery lineage ownership is invalid'
      using errcode = '22023';
  end if;
  perform private.assert_learner_profile_envelope(candidate_envelope);

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;

  select coalesce(pg_catalog.max(version.revision), 0) + 1
  into next_revision
  from public.learner_profile_versions as version
  where version.user_id = owner_id
    and version.profile_id = candidate_profile_id
    and version.generation = candidate_generation;
  if next_revision <= candidate_revision then
    next_revision := candidate_revision + 1;
  end if;

  new_version_id := extensions.gen_random_uuid();
  restored_time := pg_catalog.now();
  protection_deadline := restored_time + interval '30 days';

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
    candidate_profile_id,
    candidate_generation,
    next_revision,
    next_revision - 1,
    candidate_envelope,
    candidate_envelope #>> '{integrity,payloadSha256}',
    (candidate_envelope #>> '{integrity,byteLength}')::integer
  );

  insert into private.learner_profile_recoveries (
    user_id,
    operation_id,
    request_sha256,
    source,
    source_candidate_id,
    source_profile_id,
    source_generation,
    source_revision,
    restored_profile_id,
    restored_generation,
    restored_revision,
    restored_version_id,
    displaced_profile_id,
    displaced_generation,
    displaced_revision,
    displaced_version_id,
    restored_at,
    protected_until
  ) values (
    owner_id,
    p_operation_id,
    request_digest,
    p_source,
    p_candidate_id,
    candidate_profile_id,
    candidate_generation,
    candidate_revision,
    candidate_profile_id,
    candidate_generation,
    next_revision,
    new_version_id,
    current_head.profile_id,
    current_head.generation,
    current_head.revision,
    current_head.current_version_id,
    restored_time,
    protection_deadline
  );

  if current_head.user_id is null then
    insert into public.learner_profile_heads (
      user_id,
      profile_id,
      generation,
      revision,
      current_version_id,
      created_at,
      updated_at
    ) values (
      owner_id,
      candidate_profile_id,
      candidate_generation,
      next_revision,
      new_version_id,
      restored_time,
      restored_time
    );
  else
    update public.learner_profile_heads as head
    set profile_id = candidate_profile_id,
        generation = candidate_generation,
        revision = next_revision,
        current_version_id = new_version_id,
        updated_at = restored_time
    where head.user_id = owner_id
      and head.current_version_id = current_head.current_version_id;
    if not found then
      raise exception 'Learner profile head changed during recovery'
        using errcode = '40001';
    end if;
  end if;

  return query select
    'restored'::text,
    candidate_profile_id,
    candidate_generation,
    next_revision,
    candidate_envelope,
    protection_deadline;
end;
$$;

revoke execute on function learner_profile_rpc.restore_my_learner_profile(
  uuid,
  text,
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function learner_profile_rpc.restore_my_learner_profile(
  uuid,
  text,
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) to authenticated;

create or replace function public.restore_my_learner_profile(
  p_operation_id uuid,
  p_source text,
  p_candidate_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_revision bigint,
  p_envelope jsonb,
  p_confirmed boolean
)
returns table (
  status text,
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
  from learner_profile_rpc.restore_my_learner_profile(
    p_operation_id,
    p_source,
    p_candidate_id,
    p_profile_id,
    p_generation,
    p_revision,
    p_envelope,
    p_confirmed
  );
$$;

revoke execute on function public.restore_my_learner_profile(
  uuid,
  text,
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.restore_my_learner_profile(
  uuid,
  text,
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) to authenticated;

comment on function public.restore_my_learner_profile(
  uuid,
  text,
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) is
  'Restores one confirmed owner-bound local or protected candidate as a new protected revision.';

create or replace function learner_profile_rpc.resolve_my_learner_profile(
  p_onboarding_profile jsonb
)
returns table (
  status text,
  created boolean,
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
  current_head public.learner_profile_heads%rowtype;
  current_envelope jsonb;
  new_profile_id uuid;
  new_version_id uuid;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
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
      false,
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
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id;
  if found then
    select version.envelope into current_envelope
    from public.learner_profile_versions as version
    where version.id = current_head.current_version_id
      and version.user_id = owner_id
      and version.profile_id = current_head.profile_id
      and version.generation = current_head.generation
      and version.revision = current_head.revision;
    if not found
      or not private.is_valid_learner_profile_envelope(current_envelope)
    then
      return query select
        'current_head_unusable'::text,
        false,
        null::uuid,
        null::bigint,
        null::bigint,
        null::jsonb;
      return;
    end if;
    return query select
      'profile_ready'::text,
      false,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      current_envelope;
    return;
  end if;

  if exists (
    select 1
    from public.learner_profile_versions as version
    where version.user_id = owner_id
  ) or exists (
    select 1
    from public.state_backups as backup
    where backup.user_id = owner_id
  ) then
    return query select
      'current_head_missing'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  if not exists (
    select 1
    from private.learner_profile_creation_eligibility as eligibility
    where eligibility.user_id = owner_id
      and eligibility.consumed_at is null
  ) then
    return query select
      'recovery_required'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  if p_onboarding_profile is null then
    return query select
      'onboarding_required'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  perform private.assert_initial_learner_profile_envelope(
    p_onboarding_profile
  );
  new_profile_id := extensions.gen_random_uuid();
  new_version_id := extensions.gen_random_uuid();

  update private.learner_profile_creation_eligibility as eligibility
  set consumed_at = pg_catalog.now()
  where eligibility.user_id = owner_id
    and eligibility.consumed_at is null;
  if not found then
    return query select
      'recovery_required'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

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
    new_profile_id,
    1,
    1,
    0,
    p_onboarding_profile,
    p_onboarding_profile #>> '{integrity,payloadSha256}',
    (p_onboarding_profile #>> '{integrity,byteLength}')::integer
  );

  insert into public.learner_profile_heads (
    user_id,
    profile_id,
    generation,
    revision,
    current_version_id
  ) values (
    owner_id,
    new_profile_id,
    1,
    1,
    new_version_id
  );

  return query select
    'profile_ready'::text,
    true,
    new_profile_id,
    1::bigint,
    1::bigint,
    p_onboarding_profile;
end;
$$;
