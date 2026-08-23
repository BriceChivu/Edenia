-- Attach a complete Accountless profile only to a verified owner with no
-- Signed-in profile or recovery history, with an exact-retry receipt.
create table private.learner_profile_accountless_migration_receipts (
  user_id uuid primary key,
  operation_id uuid not null unique,
  request_sha256 text not null,
  profile_id uuid not null,
  version_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint learner_profile_accountless_migration_receipts_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_accountless_migration_receipts_version_fkey
    foreign key (version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_accountless_migration_receipts_digest_check check (
    request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  )
);

comment on table private.learner_profile_accountless_migration_receipts is
  'Owner-scoped exact-retry receipts for accepted accountless learner-profile migrations.';

alter table private.learner_profile_accountless_migration_receipts
  enable row level security;

revoke all on table private.learner_profile_accountless_migration_receipts
  from public, anon, authenticated, service_role;

create function learner_profile_rpc.migrate_my_accountless_profile(
  p_operation_id uuid,
  p_envelope jsonb
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  payload_sha256 text,
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
  accepted_receipt
    private.learner_profile_accountless_migration_receipts%rowtype;
  accepted_envelope jsonb;
  new_profile_id uuid;
  new_version_id uuid;
  request_digest text;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null or p_envelope is null then
    raise exception 'Accountless profile migration is invalid'
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
      null::text,
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
      null::uuid,
      null::bigint,
      null::bigint,
      null::text,
      null::jsonb;
    return;
  end if;

  select receipt.* into accepted_receipt
  from private.learner_profile_accountless_migration_receipts as receipt
  where receipt.user_id = owner_id;
  if found then
    if accepted_receipt.operation_id <> p_operation_id then
      return query select
        'profile_present'::text,
        null::uuid,
        null::bigint,
        null::bigint,
        null::text,
        null::jsonb;
      return;
    end if;
    perform private.assert_learner_profile_envelope(p_envelope);
    request_digest := pg_catalog.rtrim(pg_catalog.translate(
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(
            private.canonical_jsonb_text(pg_catalog.jsonb_build_object(
              'envelope', p_envelope,
              'operationId', p_operation_id,
              'ownerId', owner_id
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
    if accepted_receipt.request_sha256 <> request_digest then
      raise exception 'Accountless profile operation identity was reused'
        using errcode = '22023';
    end if;
    select version.envelope into strict accepted_envelope
    from public.learner_profile_versions as version
    where version.id = accepted_receipt.version_id
      and version.user_id = owner_id
      and version.profile_id = accepted_receipt.profile_id;
    return query select
      'migrated'::text,
      accepted_receipt.profile_id,
      1::bigint,
      1::bigint,
      accepted_envelope #>> '{integrity,payloadSha256}',
      accepted_envelope;
    return;
  end if;

  if exists (
    select 1
    from public.learner_profile_heads as head
    where head.user_id = owner_id
  ) or exists (
    select 1
    from public.learner_profile_versions as version
    where version.user_id = owner_id
  ) or exists (
    select 1
    from public.state_backups as backup
    where backup.user_id = owner_id
  ) then
    return query select
      'profile_present'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::text,
      null::jsonb;
    return;
  end if;

  perform private.assert_learner_profile_envelope(p_envelope);
  request_digest := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          private.canonical_jsonb_text(pg_catalog.jsonb_build_object(
            'envelope', p_envelope,
            'operationId', p_operation_id,
            'ownerId', owner_id
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
  new_profile_id := extensions.gen_random_uuid();
  new_version_id := extensions.gen_random_uuid();

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
    p_envelope,
    p_envelope #>> '{integrity,payloadSha256}',
    (p_envelope #>> '{integrity,byteLength}')::integer
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

  insert into private.learner_profile_accountless_migration_receipts (
    user_id,
    operation_id,
    request_sha256,
    profile_id,
    version_id
  ) values (
    owner_id,
    p_operation_id,
    request_digest,
    new_profile_id,
    new_version_id
  );

  update private.learner_profile_creation_eligibility as eligibility
  set consumed_at = coalesce(eligibility.consumed_at, pg_catalog.now())
  where eligibility.user_id = owner_id;

  return query select
    'migrated'::text,
    new_profile_id,
    1::bigint,
    1::bigint,
    p_envelope #>> '{integrity,payloadSha256}',
    p_envelope;
end;
$$;

revoke execute on function
  learner_profile_rpc.migrate_my_accountless_profile(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.migrate_my_accountless_profile(uuid, jsonb)
  to authenticated;

create function public.migrate_my_accountless_profile(
  p_operation_id uuid,
  p_envelope jsonb
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  payload_sha256 text,
  envelope jsonb
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.migrate_my_accountless_profile(
    p_operation_id,
    p_envelope
  );
$$;

revoke execute on function
  public.migrate_my_accountless_profile(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.migrate_my_accountless_profile(uuid, jsonb)
  to authenticated;

comment on function
  public.migrate_my_accountless_profile(uuid, jsonb) is
  'Invoker wrapper for attachment when no Signed-in profile history exists.';
