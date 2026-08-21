-- Activate one deliberate conflict choice only after both inputs are protected.
create function learner_profile_rpc.choose_my_learner_profile_conflict(
  p_conflict_id uuid,
  p_selected_side text,
  p_confirmed boolean
)
returns table (
  status text,
  conflict_id uuid,
  selected_side text,
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
  stored_conflict private.learner_profile_conflicts%rowtype;
  current_head public.learner_profile_heads%rowtype;
  chosen_envelope jsonb;
  chosen_profile_id uuid;
  chosen_generation bigint;
  chosen_base_revision bigint;
  chosen_revision bigint;
  new_version_id uuid;
  resolved_time timestamptz;
  protection_deadline timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_conflict_id is null
    or p_selected_side not in ('device', 'cloud')
  then
    raise exception 'Learner profile conflict choice is invalid'
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
      p_conflict_id,
      null::text,
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
      p_conflict_id,
      null::text,
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
      p_conflict_id,
      null::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  select conflict.* into stored_conflict
  from private.learner_profile_conflicts as conflict
  where conflict.id = p_conflict_id
    and conflict.user_id = owner_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      p_conflict_id,
      null::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  if stored_conflict.state = 'resolved' then
    return query
    select
      'already_chosen'::text,
      stored_conflict.id,
      stored_conflict.selected_side,
      stored_conflict.selected_profile_id,
      version.generation,
      version.revision,
      version.envelope,
      stored_conflict.protected_until
    from public.learner_profile_versions as version
    where version.id = stored_conflict.selected_version_id
      and version.user_id = owner_id
      and version.profile_id = stored_conflict.selected_profile_id;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id
  for update;
  if not found then
    return query select
      'recovery_required'::text,
      stored_conflict.id,
      null::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;
  if current_head.current_version_id is distinct from
      stored_conflict.cloud_version_id
    or current_head.profile_id is distinct from
      stored_conflict.cloud_profile_id
    or current_head.generation is distinct from
      stored_conflict.cloud_generation
    or current_head.revision is distinct from
      stored_conflict.cloud_revision
  then
    update private.learner_profile_conflicts as conflict
    set cloud_version_id = current_head.current_version_id,
        cloud_profile_id = current_head.profile_id,
        cloud_generation = current_head.generation,
        cloud_revision = current_head.revision
    where conflict.id = stored_conflict.id
      and conflict.user_id = owner_id
      and conflict.state = 'open';
    if not found then
      raise exception 'Learner profile conflict changed during refresh'
        using errcode = '40001';
    end if;
    return query select
      'conflict_changed'::text,
      stored_conflict.id,
      null::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb,
      null::timestamptz;
    return;
  end if;

  select version.envelope into strict chosen_envelope
  from public.learner_profile_versions as version
  where version.id = stored_conflict.cloud_version_id
    and version.user_id = owner_id
    and version.profile_id = stored_conflict.cloud_profile_id;

  perform private.assert_learner_profile_envelope(
    stored_conflict.device_envelope
  );
  perform private.assert_learner_profile_envelope(chosen_envelope);

  if p_selected_side = 'device' then
    chosen_envelope := stored_conflict.device_envelope;
    chosen_profile_id := stored_conflict.profile_id;
    chosen_generation := stored_conflict.generation;
  else
    chosen_profile_id := stored_conflict.cloud_profile_id;
    chosen_generation := stored_conflict.cloud_generation;
  end if;

  select coalesce(pg_catalog.max(version.revision), 0)
  into chosen_base_revision
  from public.learner_profile_versions as version
  where version.user_id = owner_id
    and version.profile_id = chosen_profile_id
    and version.generation = chosen_generation;
  chosen_revision := chosen_base_revision + 1;
  new_version_id := extensions.gen_random_uuid();
  resolved_time := pg_catalog.now();
  protection_deadline := resolved_time + interval '30 days';

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
    chosen_profile_id,
    chosen_generation,
    chosen_revision,
    chosen_base_revision,
    chosen_envelope,
    chosen_envelope #>> '{integrity,payloadSha256}',
    (chosen_envelope #>> '{integrity,byteLength}')::integer
  );

  update private.learner_profile_conflicts as conflict
  set state = 'resolved',
      selected_side = p_selected_side,
      selected_profile_id = chosen_profile_id,
      selected_version_id = new_version_id,
      resolved_at = resolved_time,
      protected_until = protection_deadline
  where conflict.id = stored_conflict.id
    and conflict.user_id = owner_id
    and conflict.state = 'open';
  if not found then
    raise exception 'Learner profile conflict protection changed'
      using errcode = '40001';
  end if;

  update public.learner_profile_heads as head
  set profile_id = chosen_profile_id,
      generation = chosen_generation,
      revision = chosen_revision,
      current_version_id = new_version_id,
      updated_at = resolved_time
  where head.user_id = owner_id
    and head.current_version_id = stored_conflict.cloud_version_id;
  if not found then
    raise exception 'Learner profile head changed during conflict choice'
      using errcode = '40001';
  end if;

  return query select
    'chosen'::text,
    stored_conflict.id,
    p_selected_side,
    chosen_profile_id,
    chosen_generation,
    chosen_revision,
    chosen_envelope,
    protection_deadline;
end;
$$;

revoke execute on function
  learner_profile_rpc.choose_my_learner_profile_conflict(uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  learner_profile_rpc.choose_my_learner_profile_conflict(uuid, text, boolean)
  to authenticated;

create function public.choose_my_learner_profile_conflict(
  p_conflict_id uuid,
  p_selected_side text,
  p_confirmed boolean
)
returns table (
  status text,
  conflict_id uuid,
  selected_side text,
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
  from learner_profile_rpc.choose_my_learner_profile_conflict(
    p_conflict_id,
    p_selected_side,
    p_confirmed
  );
$$;

revoke execute on function
  public.choose_my_learner_profile_conflict(uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  public.choose_my_learner_profile_conflict(uuid, text, boolean)
  to authenticated;

comment on function
  public.choose_my_learner_profile_conflict(uuid, text, boolean) is
  'Confirms one owner choice only after retaining both conflict inputs for at least 30 days.';
