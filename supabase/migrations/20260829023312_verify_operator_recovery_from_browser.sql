-- Let the exact recovered owner verify sanitized restored-head metadata while
-- the global profile-data gate remains off. This is deliberately narrower
-- than the normal profile resolver and never returns the portable profile.

create or replace function public.verify_my_operator_recovery(
  p_incident_id uuid
)
returns table (
  status text,
  incident_id uuid,
  restored_version_id uuid,
  profile_id uuid,
  generation bigint,
  revision bigint,
  payload_sha256 text,
  payload_bytes integer,
  restored_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  incident private.learner_profile_operator_recovery_incidents%rowtype;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_incident_id is null then
    raise exception 'Recovery verification identity is invalid'
      using errcode = '22023';
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false);
  if not found then
    raise exception 'Verified account required' using errcode = '42501';
  end if;

  select recovery_incident.* into incident
  from private.learner_profile_operator_recovery_incidents as recovery_incident
  where recovery_incident.incident_id = p_incident_id
    and recovery_incident.incident_kind = 'profile-recovery'
    and recovery_incident.status = 'restored'
    and recovery_incident.server_gate_after = 'off'
    and recovery_incident.target_user_id = owner_id;
  if not found then
    raise exception 'Recovery verification is not available'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from private.learner_profile_access_control as access_control
    where access_control.singleton
      and access_control.rollout_state = 'off'
  ) then
    raise exception 'Recovery verification requires the server gate to be off'
      using errcode = '42501';
  end if;

  return query
  select
    'verified'::text,
    incident.incident_id,
    version.id,
    version.profile_id,
    version.generation,
    version.revision,
    version.payload_sha256,
    version.payload_bytes,
    recovery.restored_at,
    head.updated_at
  from public.learner_profile_heads as head
  join public.learner_profile_versions as version
    on version.id = head.current_version_id
   and version.user_id = head.user_id
   and version.profile_id = head.profile_id
   and version.generation = head.generation
   and version.revision = head.revision
  join private.learner_profile_recoveries as recovery
    on recovery.user_id = head.user_id
   and recovery.operation_id = incident.restore_operation_id
   and recovery.restored_version_id = version.id
   and recovery.source = 'operator'
  where head.user_id = owner_id
    and head.current_version_id = incident.restored_version_id;

  if not found then
    raise exception 'Recovered learner profile head could not be verified'
      using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.verify_my_operator_recovery(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_my_operator_recovery(uuid)
  to authenticated;

comment on function public.verify_my_operator_recovery(uuid) is
  'Lets the exact authenticated recovered owner verify metadata for the restored current head while the global profile-data gate remains off.';
