-- Replace an owned profile only after its current cloud revision is protected.
create table private.learner_profile_import_backups (
  id uuid primary key,
  user_id uuid not null,
  operation_id uuid not null,
  profile_id uuid not null,
  generation bigint not null,
  base_revision bigint not null,
  previous_version_id uuid not null,
  imported_version_id uuid,
  restored_version_id uuid,
  imported_revision bigint not null,
  imported_payload_sha256 text not null,
  state text not null default 'protected',
  created_at timestamptz not null default pg_catalog.now(),
  protected_until timestamptz not null,
  rolled_back_at timestamptz,
  constraint learner_profile_import_backups_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_import_backups_previous_version_fkey
    foreign key (previous_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_import_backups_imported_version_fkey
    foreign key (imported_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_import_backups_restored_version_fkey
    foreign key (restored_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_import_backups_operation_key
    unique (user_id, operation_id),
  constraint learner_profile_import_backups_revision_check check (
    generation >= 1
    and base_revision >= 1
    and imported_revision = base_revision + 1
  ),
  constraint learner_profile_import_backups_digest_check check (
    imported_payload_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_import_backups_state_check check (
    protected_until >= created_at + interval '30 days'
    and (
      (
        state = 'protected'
        and imported_version_id is not null
        and restored_version_id is null
        and rolled_back_at is null
      )
      or (
        state = 'rolled-back'
        and imported_version_id is not null
        and restored_version_id is not null
        and rolled_back_at is not null
      )
    )
  )
);

comment on table private.learner_profile_import_backups is
  'Owner-scoped prior revisions retained before a deliberate portable-profile import.';

create index learner_profile_import_backups_previous_version_idx
  on private.learner_profile_import_backups (
    previous_version_id,
    user_id,
    profile_id
  );

create index learner_profile_import_backups_imported_version_idx
  on private.learner_profile_import_backups (
    imported_version_id,
    user_id,
    profile_id
  )
  where imported_version_id is not null;

create index learner_profile_import_backups_restored_version_idx
  on private.learner_profile_import_backups (
    restored_version_id,
    user_id,
    profile_id
  )
  where restored_version_id is not null;

create index learner_profile_import_backups_owner_state_idx
  on private.learner_profile_import_backups (
    user_id,
    state,
    protected_until desc,
    id desc
  );

alter table private.learner_profile_import_backups enable row level security;

revoke all on table private.learner_profile_import_backups
  from public, anon, authenticated, service_role;

create function private.current_learner_profile_owner()
returns uuid
language plpgsql
volatile
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
    raise exception 'Learner profile access is disabled'
      using errcode = '42501';
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false)
  for update;
  if not found then
    raise exception 'Verified account required' using errcode = '42501';
  end if;

  return owner_id;
end;
$$;

revoke execute on function private.current_learner_profile_owner()
  from public, anon, authenticated, service_role;

create function learner_profile_rpc.import_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb,
  p_confirmed boolean
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint,
  payload_sha256 text,
  protected_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner_id uuid := private.current_learner_profile_owner();
  current_head public.learner_profile_heads%rowtype;
  existing_backup private.learner_profile_import_backups%rowtype;
  previous_version public.learner_profile_versions%rowtype;
  imported_version public.learner_profile_versions%rowtype;
  committed record;
  protection_deadline timestamptz;
begin
  if p_operation_id is null
    or p_profile_id is null
    or p_generation is null
    or p_generation < 1
    or p_base_revision is null
    or p_base_revision < 1
  then
    raise exception 'Learner profile import identity is invalid'
      using errcode = '22023';
  end if;
  if p_confirmed is distinct from true then
    return query select
      'confirmation_required'::text,
      p_profile_id,
      p_generation,
      p_base_revision,
      p_base_revision,
      null::text,
      null::timestamptz;
    return;
  end if;

  perform private.assert_learner_profile_envelope(p_envelope);

  select backup.* into existing_backup
  from private.learner_profile_import_backups as backup
  where backup.user_id = owner_id
    and backup.operation_id = p_operation_id
  for update;
  if found then
    if existing_backup.profile_id is distinct from p_profile_id
      or existing_backup.generation is distinct from p_generation
      or existing_backup.base_revision is distinct from p_base_revision
      or existing_backup.imported_payload_sha256 is distinct from
        p_envelope #>> '{integrity,payloadSha256}'
    then
      raise exception 'Learner profile import operation was reused'
        using errcode = '22023';
    end if;
    if existing_backup.state = 'rolled-back' then
      return query select
        'already_rolled_back'::text,
        existing_backup.profile_id,
        existing_backup.generation,
        existing_backup.base_revision,
        existing_backup.base_revision,
        existing_backup.imported_payload_sha256,
        existing_backup.protected_until;
      return;
    end if;
    select head.* into current_head
    from public.learner_profile_heads as head
    where head.user_id = owner_id
    for update;
    return query select
      case
        when current_head.current_version_id =
          existing_backup.imported_version_id
          then 'already_replaced'::text
        else 'stale_revision'::text
      end,
      existing_backup.profile_id,
      existing_backup.generation,
      existing_backup.imported_revision,
      existing_backup.base_revision,
      existing_backup.imported_payload_sha256,
      existing_backup.protected_until;
    return;
  end if;

  if exists (
    select 1
    from public.learner_profile_write_receipts as receipt
    where receipt.user_id = owner_id
      and receipt.operation_id = p_operation_id
  ) then
    raise exception 'Learner profile import operation was reused'
      using errcode = '22023';
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      p_profile_id,
      p_generation,
      p_base_revision,
      p_base_revision,
      null::text,
      null::timestamptz;
    return;
  end if;
  if current_head.profile_id is distinct from p_profile_id
    or current_head.generation is distinct from p_generation
    or current_head.revision is distinct from p_base_revision
  then
    return query select
      'stale_revision'::text,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      p_base_revision,
      (
        select version.payload_sha256
        from public.learner_profile_versions as version
        where version.id = current_head.current_version_id
          and version.user_id = owner_id
          and version.profile_id = current_head.profile_id
      ),
      null::timestamptz;
    return;
  end if;

  select version.* into strict previous_version
  from public.learner_profile_versions as version
  where version.id = current_head.current_version_id
    and version.user_id = owner_id
    and version.profile_id = current_head.profile_id;
  perform private.assert_learner_profile_envelope(previous_version.envelope);

  select result.* into strict committed
  from learner_profile_rpc.commit_my_learner_profile(
    p_operation_id,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_envelope
  ) as result;
  if committed.status <> 'accepted'
    or committed.profile_id is distinct from p_profile_id
    or committed.generation is distinct from p_generation
    or committed.base_revision is distinct from p_base_revision
    or committed.revision is distinct from p_base_revision + 1
    or committed.payload_sha256 is distinct from
      p_envelope #>> '{integrity,payloadSha256}'
  then
    raise exception 'Learner profile import could not be committed'
      using errcode = '40001';
  end if;

  select version.* into strict imported_version
  from public.learner_profile_versions as version
  where version.user_id = owner_id
    and version.profile_id = p_profile_id
    and version.generation = p_generation
    and version.revision = committed.revision;
  protection_deadline := pg_catalog.now() + interval '30 days';
  insert into private.learner_profile_import_backups (
    id,
    user_id,
    operation_id,
    profile_id,
    generation,
    base_revision,
    previous_version_id,
    imported_version_id,
    imported_revision,
    imported_payload_sha256,
    protected_until
  ) values (
    extensions.gen_random_uuid(),
    owner_id,
    p_operation_id,
    p_profile_id,
    p_generation,
    p_base_revision,
    previous_version.id,
    imported_version.id,
    committed.revision,
    committed.payload_sha256,
    protection_deadline
  );

  return query select
    'replaced'::text,
    p_profile_id,
    p_generation,
    committed.revision::bigint,
    p_base_revision,
    committed.payload_sha256::text,
    protection_deadline;
end;
$$;

revoke execute on function learner_profile_rpc.import_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function learner_profile_rpc.import_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) to authenticated;

create function public.import_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb,
  p_confirmed boolean
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint,
  payload_sha256 text,
  protected_until timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.import_my_learner_profile(
    p_operation_id,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_envelope,
    p_confirmed
  );
$$;

revoke execute on function public.import_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.import_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) to authenticated;

comment on function public.import_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb,
  boolean
) is
  'Conditionally imports an owner-neutral profile and protects the prior revision.';

create function learner_profile_rpc.read_my_learner_profile_import_backup(
  p_operation_id uuid
)
returns table (
  status text,
  operation_id uuid,
  profile_id uuid,
  generation bigint,
  base_revision bigint,
  imported_revision bigint,
  previous_envelope jsonb,
  imported_envelope jsonb,
  protected_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner_id uuid := private.current_learner_profile_owner();
  stored_backup private.learner_profile_import_backups%rowtype;
  previous_envelope_value jsonb;
  imported_envelope_value jsonb;
begin
  if p_operation_id is null then
    raise exception 'Learner profile import operation is invalid'
      using errcode = '22023';
  end if;
  select backup.* into stored_backup
  from private.learner_profile_import_backups as backup
  where backup.user_id = owner_id
    and backup.operation_id = p_operation_id;
  if not found then
    return query select
      'recovery_required'::text,
      p_operation_id,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  select version.envelope into strict previous_envelope_value
  from public.learner_profile_versions as version
  where version.id = stored_backup.previous_version_id
    and version.user_id = owner_id
    and version.profile_id = stored_backup.profile_id;
  perform private.assert_learner_profile_envelope(previous_envelope_value);
  if stored_backup.imported_version_id is not null then
    select version.envelope into strict imported_envelope_value
    from public.learner_profile_versions as version
    where version.id = stored_backup.imported_version_id
      and version.user_id = owner_id
      and version.profile_id = stored_backup.profile_id;
    perform private.assert_learner_profile_envelope(imported_envelope_value);
  end if;

  return query select
    stored_backup.state,
    stored_backup.operation_id,
    stored_backup.profile_id,
    stored_backup.generation,
    stored_backup.base_revision,
    stored_backup.imported_revision,
    previous_envelope_value,
    imported_envelope_value,
    stored_backup.protected_until;
end;
$$;

revoke execute on function
  learner_profile_rpc.read_my_learner_profile_import_backup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.read_my_learner_profile_import_backup(uuid)
  to authenticated;

create function public.read_my_learner_profile_import_backup(
  p_operation_id uuid
)
returns table (
  status text,
  operation_id uuid,
  profile_id uuid,
  generation bigint,
  base_revision bigint,
  imported_revision bigint,
  previous_envelope jsonb,
  imported_envelope jsonb,
  protected_until timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.read_my_learner_profile_import_backup(
    p_operation_id
  );
$$;

revoke execute on function
  public.read_my_learner_profile_import_backup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.read_my_learner_profile_import_backup(uuid)
  to authenticated;

comment on function public.read_my_learner_profile_import_backup(uuid) is
  'Reads one authenticated owner import backup for client-side verification.';

create function learner_profile_rpc.rollback_my_learner_profile_import(
  p_operation_id uuid
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner_id uuid := private.current_learner_profile_owner();
  stored_backup private.learner_profile_import_backups%rowtype;
  current_head public.learner_profile_heads%rowtype;
  previous_version public.learner_profile_versions%rowtype;
  new_restored_version_id uuid;
begin
  if p_operation_id is null then
    raise exception 'Learner profile import operation is invalid'
      using errcode = '22023';
  end if;
  select backup.* into stored_backup
  from private.learner_profile_import_backups as backup
  where backup.user_id = owner_id
    and backup.operation_id = p_operation_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint;
    return;
  end if;
  if stored_backup.state = 'rolled-back' then
    return query select
      'already_rolled_back'::text,
      stored_backup.profile_id,
      stored_backup.generation,
      stored_backup.imported_revision + 1,
      stored_backup.base_revision;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;
  if current_head.current_version_id is distinct from
      stored_backup.imported_version_id
    or current_head.profile_id is distinct from stored_backup.profile_id
    or current_head.generation is distinct from stored_backup.generation
    or current_head.revision is distinct from stored_backup.imported_revision
  then
    return query select
      'stale_revision'::text,
      stored_backup.profile_id,
      stored_backup.generation,
      current_head.revision,
      stored_backup.base_revision;
    return;
  end if;

  select version.* into strict previous_version
  from public.learner_profile_versions as version
  where version.id = stored_backup.previous_version_id
    and version.user_id = owner_id
    and version.profile_id = stored_backup.profile_id;
  perform private.assert_learner_profile_envelope(previous_version.envelope);

  new_restored_version_id := extensions.gen_random_uuid();
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
    stored_backup.profile_id,
    stored_backup.generation,
    stored_backup.imported_revision + 1,
    stored_backup.imported_revision,
    previous_version.envelope,
    previous_version.payload_sha256,
    previous_version.payload_bytes
  );

  update public.learner_profile_heads as head
  set generation = stored_backup.generation,
      revision = stored_backup.imported_revision + 1,
      current_version_id = new_restored_version_id,
      updated_at = pg_catalog.now()
  where head.user_id = owner_id
    and head.current_version_id = stored_backup.imported_version_id;
  if not found then
    raise exception 'Learner profile import head changed during rollback'
      using errcode = '40001';
  end if;

  update private.learner_profile_import_backups as backup
  set state = 'rolled-back',
      restored_version_id = new_restored_version_id,
      rolled_back_at = pg_catalog.now()
  where backup.id = stored_backup.id
    and backup.user_id = owner_id
    and backup.state = 'protected';
  if not found then
    raise exception 'Learner profile import protection changed during rollback'
      using errcode = '40001';
  end if;

  return query select
    'rolled_back'::text,
    stored_backup.profile_id,
    stored_backup.generation,
    stored_backup.imported_revision + 1,
    stored_backup.base_revision;
end;
$$;

revoke execute on function
  learner_profile_rpc.rollback_my_learner_profile_import(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.rollback_my_learner_profile_import(uuid)
  to authenticated;

create function public.rollback_my_learner_profile_import(
  p_operation_id uuid
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.rollback_my_learner_profile_import(
    p_operation_id
  );
$$;

revoke execute on function public.rollback_my_learner_profile_import(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rollback_my_learner_profile_import(uuid)
  to authenticated;

comment on function public.rollback_my_learner_profile_import(uuid) is
  'Restores the protected prior head when browser persistence cannot finish an import.';
