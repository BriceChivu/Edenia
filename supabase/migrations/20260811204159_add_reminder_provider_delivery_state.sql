-- Add the durable provider hand-off state before any code is allowed to call an
-- email provider. The database records when the first potentially-live request
-- starts, limits safe retries to 23 hours, and fences acceptance/failure with
-- the current lease token. This migration does not add a provider client,
-- secret, public endpoint, Cron job, or live network path.
alter table private.reminder_deliveries
  add column provider_name text,
  add column send_started_at timestamptz,
  add column send_retry_deadline timestamptz,
  add column provider_accepted_at timestamptz,
  add column provider_message_id text,
  add column permanent_failure_at timestamptz,
  add column failure_code text,
  add column outcome_ambiguous_at timestamptz;

alter table private.reminder_deliveries
  drop constraint reminder_deliveries_status_check,
  add constraint reminder_deliveries_status_check check (
    status in (
      'pending',
      'claimed',
      'dry_run_observed',
      'suppressed',
      'provider_accepted',
      'permanent_failure',
      'outcome_ambiguous'
    )
  ),
  add constraint reminder_deliveries_provider_name_check check (
    provider_name is null
    or provider_name ~ '^[a-z][a-z0-9_-]{0,39}$'
  ),
  add constraint reminder_deliveries_provider_message_id_check check (
    provider_message_id is null
    or (
      char_length(provider_message_id) between 1 and 200
      and provider_message_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    )
  ),
  add constraint reminder_deliveries_failure_code_check check (
    failure_code is null
    or failure_code in (
      'recipient_unavailable',
      'provider_rejected',
      'configuration_invalid',
      'template_invalid'
    )
  ),
  add constraint reminder_deliveries_provider_attempt_state_check check (
    (
      provider_name is null
      and send_started_at is null
      and send_retry_deadline is null
    )
    or (
      provider_name is not null
      and send_started_at is not null
      and send_retry_deadline = send_started_at + interval '23 hours'
      and status in (
        'claimed',
        'suppressed',
        'provider_accepted',
        'permanent_failure',
        'outcome_ambiguous'
      )
    )
  ),
  add constraint reminder_deliveries_provider_accepted_state_check check (
    (status = 'provider_accepted') = (provider_accepted_at is not null)
    and (status = 'provider_accepted') = (provider_message_id is not null)
    and (
      provider_accepted_at is null
      or provider_accepted_at >= send_started_at
    )
  ),
  add constraint reminder_deliveries_permanent_failure_state_check check (
    (status = 'permanent_failure') = (permanent_failure_at is not null)
    and (status = 'permanent_failure') = (failure_code is not null)
    and (
      permanent_failure_at is null
      or permanent_failure_at >= send_started_at
    )
  ),
  add constraint reminder_deliveries_ambiguous_state_check check (
    (status = 'outcome_ambiguous') = (outcome_ambiguous_at is not null)
    and (
      outcome_ambiguous_at is null
      or outcome_ambiguous_at >= send_retry_deadline
    )
  );

create unique index reminder_deliveries_provider_message_id_key
  on private.reminder_deliveries (provider_name, provider_message_id)
  where provider_message_id is not null;

comment on column private.reminder_deliveries.send_started_at is
  'First instant a provider request may have started. Never reset during retries.';
comment on column private.reminder_deliveries.send_retry_deadline is
  'Fail-closed retry boundary, 23 hours after first send start and inside the provider idempotency window.';
comment on column private.reminder_deliveries.provider_accepted_at is
  'Provider API acceptance time, not proof of mailbox delivery.';
comment on column private.reminder_deliveries.outcome_ambiguous_at is
  'Set when provider acceptance is unknown after the safe retry window; requires operator review rather than another send.';

-- Add an explicit delivery mode to the shared claim primitive. Dry-run claims
-- remain the default for compatibility. Live claims are possible only while
-- the independent database switch is on. Already-started provider attempts
-- are never handed to the dry-run worker.
drop function public.claim_due_reminder_deliveries(
  timestamptz, integer, integer, integer
);

create function public.claim_due_reminder_deliveries(
  p_now timestamptz default now(),
  p_batch_size integer default 50,
  p_due_window_seconds integer default 900,
  p_lease_seconds integer default 120,
  p_delivery_mode text default 'dry_run'
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  user_id uuid,
  scheduled_local_date date,
  scheduled_for timestamptz,
  timezone text,
  locale text,
  consent_version text,
  attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery_enabled boolean;
begin
  if p_now is null then
    raise exception 'reminder_claim_now_required' using errcode = '22023';
  end if;
  if p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'reminder_claim_batch_out_of_range' using errcode = '22023';
  end if;
  if p_due_window_seconds < 60 or p_due_window_seconds > 3600 then
    raise exception 'reminder_claim_due_window_out_of_range' using errcode = '22023';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'reminder_claim_lease_out_of_range' using errcode = '22023';
  end if;
  if p_delivery_mode not in ('dry_run', 'live') then
    raise exception 'reminder_claim_mode_invalid' using errcode = '22023';
  end if;

  select coalesce(control.delivery_enabled, false)
  into v_delivery_enabled
  from private.reminder_delivery_control as control
  where control.singleton;
  v_delivery_enabled := coalesce(v_delivery_enabled, false);

  if p_delivery_mode = 'live' and not v_delivery_enabled then
    raise exception 'reminder_live_delivery_disabled' using errcode = '55000';
  end if;
  if p_delivery_mode = 'dry_run' and v_delivery_enabled then
    raise exception 'reminder_dry_run_delivery_enabled' using errcode = '55000';
  end if;

  if p_delivery_mode = 'live' then
    update private.reminder_deliveries as delivery
    set status = 'outcome_ambiguous',
        claim_token = null,
        lease_expires_at = null,
        outcome_ambiguous_at = p_now,
        updated_at = p_now
    where delivery.status = 'claimed'
      and delivery.lease_expires_at <= p_now
      and delivery.send_started_at is not null
      and delivery.send_retry_deadline <= p_now;
  end if;

  insert into private.reminder_deliveries (
    user_id,
    scheduled_local_date,
    scheduled_local_time,
    scheduled_for,
    timezone,
    locale,
    consent_version,
    consent_granted_at
  )
  select
    preference.user_id,
    occurrence.scheduled_local_date,
    preference.local_time,
    occurrence.scheduled_for,
    preference.timezone,
    preference.locale,
    preference.consent_version,
    preference.consent_granted_at
  from public.reminder_preferences as preference
  join private.reminder_delivery_testers as tester
    on tester.user_id = preference.user_id
  cross join lateral private.reminder_next_occurrence(
    preference.days,
    preference.local_time,
    preference.timezone,
    p_now - pg_catalog.make_interval(secs => p_due_window_seconds)
  ) as occurrence
  where preference.enabled
    and preference.consent_granted_at is not null
    and preference.consent_revoked_at is null
    and not exists (
      select 1
      from private.reminder_suppressions as suppression
      where suppression.user_id = preference.user_id
    )
    and occurrence.scheduled_for <= p_now
  on conflict on constraint reminder_deliveries_user_local_date_key do nothing;

  return query
  with candidates as materialized (
    select delivery.id
    from private.reminder_deliveries as delivery
    join private.reminder_delivery_testers as tester
      on tester.user_id = delivery.user_id
    join public.reminder_preferences as preference
      on preference.user_id = delivery.user_id
    where delivery.scheduled_for <= p_now
      and (
        delivery.status = 'pending'
        or (
          delivery.status = 'claimed'
          and delivery.lease_expires_at <= p_now
        )
      )
      and (
        (
          p_delivery_mode = 'dry_run'
          and delivery.send_started_at is null
        )
        or (
          p_delivery_mode = 'live'
          and (
            delivery.send_started_at is null
            or delivery.send_retry_deadline > p_now
          )
        )
      )
      and preference.enabled
      and preference.consent_granted_at is not null
      and preference.consent_revoked_at is null
      and not exists (
        select 1
        from private.reminder_suppressions as suppression
        where suppression.user_id = delivery.user_id
      )
      and preference.timezone = delivery.timezone
      and preference.local_time = delivery.scheduled_local_time
      and preference.locale = delivery.locale
      and preference.consent_version = delivery.consent_version
      and preference.consent_granted_at = delivery.consent_granted_at
      and extract(
        isodow from delivery.scheduled_local_date
      )::smallint = any(preference.days)
    order by delivery.scheduled_for, delivery.id
    for update of delivery skip locked
    limit p_batch_size
  ),
  claimed as (
    update private.reminder_deliveries as delivery
    set status = 'claimed',
        claim_token = gen_random_uuid(),
        lease_expires_at = p_now
          + pg_catalog.make_interval(secs => p_lease_seconds),
        attempt_count = delivery.attempt_count + 1,
        last_claimed_at = p_now,
        updated_at = p_now
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select
    claimed.id,
    claimed.claim_token,
    claimed.user_id,
    claimed.scheduled_local_date,
    claimed.scheduled_for,
    claimed.timezone,
    claimed.locale,
    claimed.consent_version,
    claimed.attempt_count
  from claimed
  order by claimed.scheduled_for, claimed.id;
end;
$$;

revoke execute on function public.claim_due_reminder_deliveries(
  timestamptz, integer, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.claim_due_reminder_deliveries(
  timestamptz, integer, integer, integer, text
) to service_role;

create or replace function public.complete_reminder_dry_run(
  p_claim_token uuid,
  p_observed_at timestamptz default now()
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
  if p_claim_token is null or p_observed_at is null then
    return false;
  end if;

  update private.reminder_deliveries as delivery
  set status = 'dry_run_observed',
      claim_token = null,
      lease_expires_at = null,
      dry_run_observed_at = p_observed_at,
      updated_at = p_observed_at
  where delivery.status = 'claimed'
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_observed_at
    and delivery.send_started_at is null
    and not exists (
      select 1
      from private.reminder_delivery_control as control
      where control.singleton
        and control.delivery_enabled
    )
  returning true into completed;

  return coalesce(completed, false);
end;
$$;

create function public.begin_reminder_provider_attempt(
  p_claim_token uuid,
  p_provider_name text,
  p_started_at timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  started boolean := false;
begin
  if p_claim_token is null
      or p_provider_name is null
      or p_provider_name !~ '^[a-z][a-z0-9_-]{0,39}$'
      or p_started_at is null then
    return false;
  end if;
  if not exists (
    select 1
    from private.reminder_delivery_control as control
    where control.singleton
      and control.delivery_enabled
  ) then
    return false;
  end if;

  update private.reminder_deliveries as delivery
  set provider_name = coalesce(delivery.provider_name, p_provider_name),
      send_started_at = coalesce(delivery.send_started_at, p_started_at),
      send_retry_deadline = coalesce(
        delivery.send_retry_deadline,
        p_started_at + interval '23 hours'
      ),
      updated_at = case
        when delivery.send_started_at is null then p_started_at
        else delivery.updated_at
      end
  where delivery.status = 'claimed'
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_started_at
    and (
      delivery.send_started_at is null
      or (
        delivery.provider_name = p_provider_name
        and p_started_at >= delivery.send_started_at
        and delivery.send_retry_deadline > p_started_at
      )
    )
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
  returning true into started;

  return coalesce(started, false);
end;
$$;

create function public.complete_reminder_provider_acceptance(
  p_claim_token uuid,
  p_provider_name text,
  p_provider_message_id text,
  p_accepted_at timestamptz default now()
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
      or p_provider_name is null
      or p_provider_message_id is null
      or char_length(p_provider_message_id) not between 1 and 200
      or p_provider_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or p_accepted_at is null then
    return false;
  end if;

  update private.reminder_deliveries as delivery
  set status = 'provider_accepted',
      claim_token = null,
      lease_expires_at = null,
      provider_accepted_at = p_accepted_at,
      provider_message_id = p_provider_message_id,
      updated_at = p_accepted_at
  where delivery.status = 'claimed'
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_accepted_at
    and delivery.provider_name = p_provider_name
    and delivery.send_started_at <= p_accepted_at
    and delivery.send_retry_deadline > p_accepted_at
  returning true into completed;

  return coalesce(completed, false);
end;
$$;

create function public.complete_reminder_provider_failure(
  p_claim_token uuid,
  p_provider_name text,
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
      or p_provider_name is null
      or p_failure_code is null
      or p_failure_code not in (
        'recipient_unavailable',
        'provider_rejected',
        'configuration_invalid',
        'template_invalid'
      )
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
    and delivery.provider_name = p_provider_name
    and delivery.send_started_at <= p_failed_at
    and delivery.send_retry_deadline > p_failed_at
  returning true into completed;

  return coalesce(completed, false);
end;
$$;

revoke execute on function public.begin_reminder_provider_attempt(
  uuid, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.complete_reminder_provider_acceptance(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.complete_reminder_provider_failure(
  uuid, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.begin_reminder_provider_attempt(
  uuid, text, timestamptz
) to service_role;
grant execute on function public.complete_reminder_provider_acceptance(
  uuid, text, text, timestamptz
) to service_role;
grant execute on function public.complete_reminder_provider_failure(
  uuid, text, text, timestamptz
) to service_role;
