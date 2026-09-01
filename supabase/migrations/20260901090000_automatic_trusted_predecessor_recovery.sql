-- Automatically restore the newest trusted predecessor when a signed-in
-- profile head is present but its current version cannot be opened.
create or replace function private.restore_trusted_learner_profile_predecessor()
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_head public.learner_profile_heads%rowtype;
  current_version public.learner_profile_versions%rowtype;
  predecessor public.learner_profile_versions%rowtype;
  maximum_revision bigint;
  next_revision bigint;
  new_version_id uuid;
begin
  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;
  if not found then
    return query select
      'none'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  select version.* into current_version
  from public.learner_profile_versions as version
  where version.id = current_head.current_version_id
    and version.user_id = owner_id
    and version.profile_id = current_head.profile_id;
  if found
    and current_version.generation = current_head.generation
    and current_version.revision = current_head.revision
    and private.is_valid_learner_profile_envelope(current_version.envelope)
  then
    return query select
      'ready'::text,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      current_version.envelope;
    return;
  end if;

  select version.* into predecessor
  from public.learner_profile_versions as version
  where version.user_id = owner_id
    and version.profile_id = current_head.profile_id
    and version.generation = current_head.generation
    and version.revision < current_head.revision
    and private.is_valid_learner_profile_envelope(version.envelope)
  order by version.revision desc, version.created_at desc, version.id desc
  limit 1;
  if not found then
    return query select
      'none'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  select coalesce(max(version.revision), 0)
  into maximum_revision
  from public.learner_profile_versions as version
  where version.user_id = owner_id
    and version.profile_id = current_head.profile_id
    and version.generation = current_head.generation;

  next_revision := greatest(current_head.revision, maximum_revision);
  if current_version.id is not null
    or next_revision <= maximum_revision
  then
    next_revision := maximum_revision + 1;
  end if;

  perform private.assert_learner_profile_envelope(predecessor.envelope);
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
    predecessor.profile_id,
    predecessor.generation,
    next_revision,
    next_revision - 1,
    predecessor.envelope,
    predecessor.envelope #>> '{integrity,payloadSha256}',
    (predecessor.envelope #>> '{integrity,byteLength}')::integer
  );

  update public.learner_profile_heads as head
  set revision = next_revision,
      current_version_id = new_version_id,
      updated_at = pg_catalog.now()
  where head.user_id = owner_id
    and head.current_version_id = current_head.current_version_id;
  if not found then
    raise exception 'Learner profile head changed during automatic recovery'
      using errcode = '40001';
  end if;

  return query select
    'restored'::text,
    predecessor.profile_id,
    predecessor.generation,
    next_revision,
    predecessor.envelope;
end;
$$;

revoke execute on function private.restore_trusted_learner_profile_predecessor()
  from public, anon, authenticated, service_role;

create or replace function private.create_fresh_signed_in_learner_profile(
  p_onboarding_profile jsonb,
  p_require_creation_eligibility boolean
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_head public.learner_profile_heads%rowtype;
  current_version public.learner_profile_versions%rowtype;
  new_profile_id uuid;
  new_version_id uuid;
begin
  if p_onboarding_profile is null then
    return query select
      'onboarding_required'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  perform private.assert_initial_learner_profile_envelope(
    p_onboarding_profile
  );

  if p_require_creation_eligibility then
    update private.learner_profile_creation_eligibility as eligibility
    set consumed_at = pg_catalog.now()
    where eligibility.user_id = owner_id
      and eligibility.consumed_at is null;
    if not found then
      return query select
        'recovery_required'::text,
        null::uuid,
        null::bigint,
        null::bigint,
        null::jsonb;
      return;
    end if;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;

  if found then
    select version.* into current_version
    from public.learner_profile_versions as version
    where version.id = current_head.current_version_id
      and version.user_id = owner_id
      and version.profile_id = current_head.profile_id
      and version.generation = current_head.generation
      and version.revision = current_head.revision;
    if found
      and private.is_valid_learner_profile_envelope(current_version.envelope)
    then
      return query select
        'already_ready'::text,
        current_head.profile_id,
        current_head.generation,
        current_head.revision,
        current_version.envelope;
      return;
    end if;
  end if;

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
    p_onboarding_profile,
    p_onboarding_profile #>> '{integrity,payloadSha256}',
    (p_onboarding_profile #>> '{integrity,byteLength}')::integer
  );

  if current_head.user_id is null then
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
  else
    update public.learner_profile_heads as head
    set profile_id = new_profile_id,
        generation = 1,
        revision = 1,
        current_version_id = new_version_id,
        updated_at = pg_catalog.now()
    where head.user_id = owner_id
      and head.current_version_id = current_head.current_version_id;
    if not found then
      raise exception 'Learner profile head changed during fresh-profile creation'
        using errcode = '40001';
    end if;
  end if;

  return query select
    'profile_ready'::text,
    new_profile_id,
    1::bigint,
    1::bigint,
    p_onboarding_profile;
end;
$$;

revoke execute on function private.create_fresh_signed_in_learner_profile(
  jsonb,
  boolean
) from public, anon, authenticated, service_role;

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
  predecessor_resolution record;
  fresh_profile record;
  has_owner_history boolean;
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
  where head.user_id = owner_id
  for update;
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
      select * into predecessor_resolution
      from private.restore_trusted_learner_profile_predecessor();
      if predecessor_resolution.status in ('ready', 'restored') then
        return query select
          'profile_ready'::text,
          false,
          predecessor_resolution.profile_id,
          predecessor_resolution.generation,
          predecessor_resolution.revision,
          predecessor_resolution.envelope;
        return;
      end if;
      if p_onboarding_profile is not null then
        select * into fresh_profile
        from private.create_fresh_signed_in_learner_profile(
          p_onboarding_profile,
          false
        );
        if fresh_profile.status in ('already_ready', 'profile_ready') then
          return query select
            'profile_ready'::text,
            fresh_profile.status = 'profile_ready',
            fresh_profile.profile_id,
            fresh_profile.generation,
            fresh_profile.revision,
            fresh_profile.envelope;
          return;
        end if;
      end if;
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

  select exists (
    select 1
    from public.learner_profile_versions as version
    where version.user_id = owner_id
  ) or exists (
    select 1
    from public.state_backups as backup
    where backup.user_id = owner_id
  ) into has_owner_history;

  if not has_owner_history and not exists (
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

  select * into fresh_profile
  from private.create_fresh_signed_in_learner_profile(
    p_onboarding_profile,
    not has_owner_history
  );
  if fresh_profile.status not in ('already_ready', 'profile_ready') then
    return query select
      fresh_profile.status,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  return query select
    'profile_ready'::text,
    fresh_profile.status = 'profile_ready',
    fresh_profile.profile_id,
    fresh_profile.generation,
    fresh_profile.revision,
    fresh_profile.envelope;
end;
$$;
