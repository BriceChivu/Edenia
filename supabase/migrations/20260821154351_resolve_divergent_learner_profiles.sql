-- Preserve both owner-scoped inputs when a learner-profile commit diverges.
create table private.learner_profile_conflicts (
  id uuid primary key,
  user_id uuid not null,
  operation_id uuid not null,
  request_sha256 text not null,
  profile_id uuid not null,
  generation bigint not null,
  base_revision bigint not null,
  device_revision bigint not null,
  device_envelope jsonb not null,
  device_payload_sha256 text not null,
  device_payload_bytes integer not null,
  cloud_version_id uuid not null,
  cloud_profile_id uuid not null,
  cloud_generation bigint not null,
  cloud_revision bigint not null,
  state text not null default 'open',
  selected_side text,
  selected_profile_id uuid,
  selected_version_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  protected_until timestamptz,
  constraint learner_profile_conflicts_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_conflicts_cloud_version_fkey
    foreign key (cloud_version_id, user_id, cloud_profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_conflicts_selected_version_fkey
    foreign key (selected_version_id, user_id, selected_profile_id)
    references public.learner_profile_versions (id, user_id, profile_id),
  constraint learner_profile_conflicts_operation_key
    unique (user_id, operation_id),
  constraint learner_profile_conflicts_revision_check check (
    generation >= 1
    and base_revision >= 1
    and device_revision = base_revision + 1
    and cloud_generation >= 1
    and cloud_revision >= 1
  ),
  constraint learner_profile_conflicts_digest_check check (
    request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
    and device_payload_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_conflicts_size_check check (
    device_payload_bytes between 1 and 2097152
  ),
  constraint learner_profile_conflicts_state_check check (
    (
      state = 'open'
      and selected_side is null
      and selected_profile_id is null
      and selected_version_id is null
      and resolved_at is null
      and protected_until is null
    )
    or (
      state = 'resolved'
      and selected_side in ('device', 'cloud')
      and selected_profile_id is not null
      and selected_version_id is not null
      and resolved_at is not null
      and protected_until >= resolved_at + interval '30 days'
    )
  )
);

comment on table private.learner_profile_conflicts is
  'Owner-scoped device candidates and immutable cloud heads retained for deliberate learner-profile conflict resolution.';

create index learner_profile_conflicts_owner_state_created_idx
  on private.learner_profile_conflicts (
    user_id,
    state,
    created_at desc,
    id desc
  );

alter table private.learner_profile_conflicts enable row level security;

revoke all on table private.learner_profile_conflicts
  from public, anon, authenticated, service_role;

drop function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
);
drop function learner_profile_rpc.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
);

create function learner_profile_rpc.commit_my_learner_profile(
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
  payload_sha256 text,
  conflict_id uuid
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
  prior_conflict private.learner_profile_conflicts%rowtype;
  new_version_id uuid;
  new_conflict_id uuid;
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
      null::text,
      null::uuid;
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
      null::text,
      null::uuid;
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
      prior_receipt.result_sha256,
      null::uuid;
    return;
  end if;

  select conflict.* into prior_conflict
  from private.learner_profile_conflicts as conflict
  where conflict.user_id = owner_id
    and conflict.operation_id = p_operation_id;
  if found then
    if prior_conflict.request_sha256 <> request_digest then
      raise exception 'Learner profile operation identity was reused'
        using errcode = '22023';
    end if;
    return query select
      'conflict'::text,
      prior_conflict.cloud_profile_id,
      prior_conflict.cloud_generation,
      prior_conflict.cloud_revision,
      prior_conflict.base_revision,
      (
        select version.payload_sha256
        from public.learner_profile_versions as version
        where version.id = prior_conflict.cloud_version_id
          and version.user_id = owner_id
          and version.profile_id = prior_conflict.cloud_profile_id
      ),
      prior_conflict.id;
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
      null::bigint,
      null::bigint,
      p_base_revision,
      null::text,
      null::uuid;
    return;
  end if;

  if current_head.profile_id is distinct from p_profile_id
    or current_head.generation is distinct from p_generation
    or current_head.revision is distinct from p_base_revision
  then
    new_conflict_id := extensions.gen_random_uuid();
    insert into private.learner_profile_conflicts (
      id,
      user_id,
      operation_id,
      request_sha256,
      profile_id,
      generation,
      base_revision,
      device_revision,
      device_envelope,
      device_payload_sha256,
      device_payload_bytes,
      cloud_version_id,
      cloud_profile_id,
      cloud_generation,
      cloud_revision
    ) values (
      new_conflict_id,
      owner_id,
      p_operation_id,
      request_digest,
      p_profile_id,
      p_generation,
      p_base_revision,
      p_base_revision + 1,
      p_envelope,
      p_envelope #>> '{integrity,payloadSha256}',
      (p_envelope #>> '{integrity,byteLength}')::integer,
      current_head.current_version_id,
      current_head.profile_id,
      current_head.generation,
      current_head.revision
    );
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
      ),
      new_conflict_id;
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
    p_envelope #>> '{integrity,payloadSha256}',
    null::uuid;
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

create function public.commit_my_learner_profile(
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
  payload_sha256 text,
  conflict_id uuid
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
  'Invoker wrapper for one idempotent owner-derived learner-profile commit or preserved conflict candidate.';

create function learner_profile_rpc.read_my_learner_profile_conflict(
  p_conflict_id uuid
)
returns table (
  status text,
  conflict_id uuid,
  operation_id uuid,
  profile_id uuid,
  device_generation bigint,
  device_revision bigint,
  device_envelope jsonb,
  cloud_generation bigint,
  cloud_revision bigint,
  cloud_envelope jsonb,
  selected_side text,
  protected_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_conflict_id is null then
    raise exception 'Learner profile conflict identity is invalid'
      using errcode = '22023';
  end if;

  return query
  select
    case
      when conflict.state = 'resolved'
        and conflict.protected_until <= pg_catalog.now()
        then 'expired'::text
      else conflict.state
    end,
    conflict.id,
    conflict.operation_id,
    conflict.profile_id,
    conflict.generation,
    conflict.device_revision,
    case
      when conflict.state = 'resolved'
        and conflict.protected_until <= pg_catalog.now()
        then null::jsonb
      else conflict.device_envelope
    end,
    conflict.cloud_generation,
    conflict.cloud_revision,
    case
      when conflict.state = 'resolved'
        and conflict.protected_until <= pg_catalog.now()
        then null::jsonb
      else version.envelope
    end,
    conflict.selected_side,
    conflict.protected_until
  from private.learner_profile_conflicts as conflict
  join public.learner_profile_versions as version
    on version.id = conflict.cloud_version_id
   and version.user_id = conflict.user_id
   and version.profile_id = conflict.cloud_profile_id
  where conflict.id = p_conflict_id
    and conflict.user_id = owner_id;
end;
$$;

revoke execute on function
  learner_profile_rpc.read_my_learner_profile_conflict(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.read_my_learner_profile_conflict(uuid)
  to authenticated;

create function public.read_my_learner_profile_conflict(
  p_conflict_id uuid
)
returns table (
  status text,
  conflict_id uuid,
  operation_id uuid,
  profile_id uuid,
  device_generation bigint,
  device_revision bigint,
  device_envelope jsonb,
  cloud_generation bigint,
  cloud_revision bigint,
  cloud_envelope jsonb,
  selected_side text,
  protected_until timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.read_my_learner_profile_conflict(p_conflict_id);
$$;

revoke execute on function public.read_my_learner_profile_conflict(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_my_learner_profile_conflict(uuid)
  to authenticated;

comment on function public.read_my_learner_profile_conflict(uuid) is
  'Returns both unchanged inputs for one authenticated owner conflict.';
