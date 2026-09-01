-- Let a verified owner with no profile history enter onboarding even when the
-- account predates the creation-eligibility trigger.
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
    false
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

  update private.learner_profile_creation_eligibility as eligibility
  set consumed_at = pg_catalog.now()
  where eligibility.user_id = owner_id
    and eligibility.consumed_at is null;

  return query select
    'profile_ready'::text,
    fresh_profile.status = 'profile_ready',
    fresh_profile.profile_id,
    fresh_profile.generation,
    fresh_profile.revision,
    fresh_profile.envelope;
end;
$$;

revoke execute on function learner_profile_rpc.resolve_my_learner_profile(jsonb)
  from public, anon, service_role;
grant execute on function learner_profile_rpc.resolve_my_learner_profile(jsonb)
  to authenticated;

create or replace function public.resolve_my_learner_profile(
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.resolve_my_learner_profile(p_onboarding_profile);
$$;

revoke execute on function public.resolve_my_learner_profile(jsonb)
  from public, anon, service_role;
grant execute on function public.resolve_my_learner_profile(jsonb)
  to authenticated;

comment on function learner_profile_rpc.resolve_my_learner_profile(jsonb) is
  'Resolve a verified owner profile; owners without profile history may start onboarding even when their account predates the creation-eligibility trigger.';
