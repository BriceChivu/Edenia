-- Strengthen the database boundary required by a future live dispatcher. Token
-- binding now requires the current claim fencing token, and a claim can end as
-- recipient_unavailable without falsely recording that a provider request may
-- have started. This migration does not add a provider call, credential, Cron
-- schedule, or reachable live-delivery path.
drop function public.store_reminder_unsubscribe_token(
  uuid, bytea, timestamptz
);

create function public.store_reminder_unsubscribe_token(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_token_digest bytea,
  p_created_at timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claim_valid boolean := false;
  v_existing_digest bytea;
begin
  if p_delivery_id is null
      or p_claim_token is null
      or p_token_digest is null
      or octet_length(p_token_digest) <> 32
      or p_created_at is null then
    return false;
  end if;

  select true
  into v_claim_valid
  from private.reminder_deliveries as delivery
  join private.reminder_delivery_testers as tester
    on tester.user_id = delivery.user_id
  join public.reminder_preferences as preference
    on preference.user_id = delivery.user_id
  where delivery.id = p_delivery_id
    and delivery.status = 'claimed'
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_created_at
    and preference.enabled
    and preference.consent_granted_at is not null
    and preference.consent_revoked_at is null
    and preference.timezone = delivery.timezone
    and preference.local_time = delivery.scheduled_local_time
    and preference.locale = delivery.locale
    and preference.consent_version = delivery.consent_version
    and preference.consent_granted_at = delivery.consent_granted_at
    and extract(
      isodow from delivery.scheduled_local_date
    )::smallint = any(preference.days)
    and not exists (
      select 1
      from private.reminder_suppressions as suppression
      where suppression.user_id = delivery.user_id
    )
  for update of delivery;

  if not coalesce(v_claim_valid, false) then
    return false;
  end if;

  select token.token_digest
  into v_existing_digest
  from private.reminder_unsubscribe_tokens as token
  where token.delivery_id = p_delivery_id
  for update;

  if found then
    return v_existing_digest = p_token_digest;
  end if;

  insert into private.reminder_unsubscribe_tokens (
    token_digest,
    delivery_id,
    user_id,
    created_at
  )
  select
    p_token_digest,
    delivery.id,
    delivery.user_id,
    p_created_at
  from private.reminder_deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.status = 'claimed'
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_created_at
  on conflict do nothing;

  return exists (
    select 1
    from private.reminder_unsubscribe_tokens as token
    where token.delivery_id = p_delivery_id
      and token.token_digest = p_token_digest
  );
end;
$$;

revoke execute on function public.store_reminder_unsubscribe_token(
  uuid, uuid, bytea, timestamptz
) from public, anon, authenticated;
grant execute on function public.store_reminder_unsubscribe_token(
  uuid, uuid, bytea, timestamptz
) to service_role;

comment on function public.store_reminder_unsubscribe_token(
  uuid, uuid, bytea, timestamptz
) is
  'Binds one digest to a live claim only while its current lease, tester, consent, preference, and suppression fences remain valid.';

create function public.complete_reminder_without_send(
  p_claim_token uuid,
  p_failure_code text,
  p_failed_at timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  completed boolean := false;
begin
  if p_claim_token is null
      or p_failure_code is null
      or p_failure_code <> 'recipient_unavailable'
      or p_failed_at is null then
    return false;
  end if;

  update private.reminder_deliveries as delivery
  set status = 'permanent_failure',
      claim_token = null,
      lease_expires_at = null,
      permanent_failure_at = p_failed_at,
      failure_code = p_failure_code,
      updated_at = p_failed_at
  where delivery.status = 'claimed'
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_failed_at
    and delivery.provider_name is null
    and delivery.send_started_at is null
    and delivery.send_retry_deadline is null
    and exists (
      select 1
      from private.reminder_delivery_testers as tester
      where tester.user_id = delivery.user_id
    )
    and exists (
      select 1
      from public.reminder_preferences as preference
      where preference.user_id = delivery.user_id
        and preference.enabled
        and preference.consent_granted_at is not null
        and preference.consent_revoked_at is null
        and preference.timezone = delivery.timezone
        and preference.local_time = delivery.scheduled_local_time
        and preference.locale = delivery.locale
        and preference.consent_version = delivery.consent_version
        and preference.consent_granted_at = delivery.consent_granted_at
        and extract(
          isodow from delivery.scheduled_local_date
        )::smallint = any(preference.days)
    )
    and not exists (
      select 1
      from private.reminder_suppressions as suppression
      where suppression.user_id = delivery.user_id
    )
  returning true into completed;

  return coalesce(completed, false);
end;
$$;

revoke execute on function public.complete_reminder_without_send(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_reminder_without_send(
  uuid, text, timestamptz
) to service_role;

comment on function public.complete_reminder_without_send(
  uuid, text, timestamptz
) is
  'Ends the current live claim only for a confirmed missing recipient, without recording provider attempt state.';
