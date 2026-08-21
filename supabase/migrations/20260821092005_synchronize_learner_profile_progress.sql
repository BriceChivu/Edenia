-- Accept one owner-derived, idempotent learner-profile revision at a time.
create table public.learner_profile_write_receipts (
  user_id uuid not null,
  operation_id uuid not null,
  request_sha256 text not null,
  profile_id uuid not null,
  generation bigint not null,
  base_revision bigint not null,
  accepted_revision bigint not null,
  result_sha256 text not null,
  accepted_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, operation_id),
  constraint learner_profile_write_receipts_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_write_receipts_revision_check check (
    generation >= 1
    and base_revision >= 1
    and accepted_revision = base_revision + 1
  ),
  constraint learner_profile_write_receipts_request_digest_check check (
    request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_write_receipts_result_digest_check check (
    result_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  )
);

comment on table public.learner_profile_write_receipts is
  'Bounded owner-scoped receipts for exact learner-profile commit retries.';

create index learner_profile_write_receipts_owner_accepted_idx
  on public.learner_profile_write_receipts (
    user_id,
    accepted_at desc,
    operation_id desc
  );

alter table public.learner_profile_write_receipts enable row level security;

revoke all on table public.learner_profile_write_receipts
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.learner_profile_write_receipts
  to service_role;

create or replace function private.assert_learner_profile_envelope(
  p_envelope jsonb
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  profile jsonb := p_envelope -> 'profile';
  integrity jsonb := p_envelope -> 'integrity';
  canonical_envelope text;
  canonical_payload text;
  expected_digest text;
  claimed_bytes integer;
begin
  if not private.jsonb_has_exact_keys(
    p_envelope,
    array['exportedAt', 'integrity', 'profile', 'schema', 'version']
  )
    or coalesce(p_envelope ->> 'schema', '')
      <> 'edenia-portable-learner-profile'
    or coalesce(p_envelope ->> 'version', '') <> '1'
    or coalesce(p_envelope ->> 'exportedAt', '')
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or not private.jsonb_has_exact_keys(
      integrity,
      array['algorithm', 'byteLength', 'payloadSha256']
    )
    or coalesce(integrity ->> 'algorithm', '') <> 'SHA-256'
    or coalesce(integrity ->> 'byteLength', '') !~ '^\d+$'
    or coalesce(integrity ->> 'payloadSha256', '')
      !~ '^[A-Za-z0-9_-]{43}$'
    or not private.jsonb_has_exact_keys(
      profile,
      array[
        'activityLog', 'anki', 'cityProgress', 'config', 'learnerProfile',
        'noAnkiFrequentUserPrompt', 'onboarding', 'videos'
      ]
    )
    or pg_catalog.jsonb_typeof(profile -> 'activityLog') <> 'array'
    or pg_catalog.jsonb_typeof(profile -> 'anki') <> 'object'
    or pg_catalog.jsonb_typeof(profile -> 'cityProgress') <> 'object'
    or pg_catalog.jsonb_typeof(profile -> 'config') <> 'object'
    or pg_catalog.jsonb_typeof(profile -> 'learnerProfile') <> 'object'
    or pg_catalog.jsonb_typeof(
      profile -> 'noAnkiFrequentUserPrompt'
    ) <> 'object'
    or pg_catalog.jsonb_typeof(profile -> 'onboarding') <> 'object'
    or pg_catalog.jsonb_typeof(profile -> 'videos') <> 'object'
  then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  claimed_bytes := (integrity ->> 'byteLength')::integer;
  canonical_envelope := private.canonical_jsonb_text(p_envelope);
  if claimed_bytes not between 1 and 2097152
    or pg_catalog.octet_length(
      pg_catalog.convert_to(canonical_envelope, 'UTF8')
    ) <> claimed_bytes
  then
    raise exception 'Learner profile byte length is invalid'
      using errcode = '22023';
  end if;

  canonical_payload := private.canonical_jsonb_text(
    pg_catalog.jsonb_build_object(
      'exportedAt', p_envelope -> 'exportedAt',
      'profile', profile,
      'schema', p_envelope -> 'schema',
      'version', p_envelope -> 'version'
    )
  );
  expected_digest := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(canonical_payload, 'UTF8'),
        'sha256'
      ),
      'base64'
    ),
    '+/',
    '-_'
  ), '=');
  if integrity ->> 'payloadSha256' <> expected_digest then
    raise exception 'Learner profile integrity is invalid'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.assert_learner_profile_envelope(jsonb)
  from public, anon, authenticated, service_role;

create or replace function learner_profile_rpc.commit_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint,
  payload_sha256 text
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
  prior_receipt public.learner_profile_write_receipts%rowtype;
  new_version_id uuid;
  request_digest text;
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
    raise exception 'Learner profile commit identity is invalid'
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
      null::bigint,
      null::text;
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
      null::bigint,
      null::text;
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

  select receipt.* into prior_receipt
  from public.learner_profile_write_receipts as receipt
  where receipt.user_id = owner_id
    and receipt.operation_id = p_operation_id;
  if found then
    if prior_receipt.request_sha256 <> request_digest then
      raise exception 'Learner profile operation identity was reused'
        using errcode = '22023';
    end if;
    return query select
      'already_accepted'::text,
      prior_receipt.profile_id,
      prior_receipt.generation,
      prior_receipt.accepted_revision,
      prior_receipt.base_revision,
      prior_receipt.result_sha256;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id;
  if not found then
    return query select
      'recovery_required'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      p_base_revision,
      null::text;
    return;
  end if;

  if current_head.profile_id is distinct from p_profile_id
    or current_head.generation is distinct from p_generation
    or current_head.revision is distinct from p_base_revision
  then
    return query select
      'conflict'::text,
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
      );
    return;
  end if;

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
    p_profile_id,
    p_generation,
    p_base_revision + 1,
    p_base_revision,
    p_envelope,
    p_envelope #>> '{integrity,payloadSha256}',
    (p_envelope #>> '{integrity,byteLength}')::integer
  );

  update public.learner_profile_heads as head
  set revision = p_base_revision + 1,
      current_version_id = new_version_id,
      updated_at = pg_catalog.now()
  where head.user_id = owner_id
    and head.profile_id = p_profile_id
    and head.generation = p_generation
    and head.revision = p_base_revision;
  if not found then
    raise exception 'Learner profile head changed during commit'
      using errcode = '40001';
  end if;

  insert into public.learner_profile_write_receipts (
    user_id,
    operation_id,
    request_sha256,
    profile_id,
    generation,
    base_revision,
    accepted_revision,
    result_sha256
  ) values (
    owner_id,
    p_operation_id,
    request_digest,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_base_revision + 1,
    p_envelope #>> '{integrity,payloadSha256}'
  );

  delete from public.learner_profile_write_receipts as receipt
  where receipt.user_id = owner_id
    and receipt.operation_id in (
      select stale.operation_id
      from public.learner_profile_write_receipts as stale
      where stale.user_id = owner_id
      order by stale.accepted_at desc, stale.operation_id desc
      offset 256
    );

  return query select
    'accepted'::text,
    p_profile_id,
    p_generation,
    p_base_revision + 1,
    p_base_revision,
    p_envelope #>> '{integrity,payloadSha256}';
end;
$$;

revoke execute on function learner_profile_rpc.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function learner_profile_rpc.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) to authenticated;

create or replace function public.commit_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint,
  payload_sha256 text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.commit_my_learner_profile(
    p_operation_id,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_envelope
  );
$$;

revoke execute on function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) to authenticated;

comment on function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) is
  'Invoker wrapper for one idempotent, owner-derived learner-profile commit.';
