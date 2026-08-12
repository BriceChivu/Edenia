-- Add a deliberately narrow live path for the first typed-reminder canary.
-- Live delivery can claim only a current typed occurrence that the dry-run
-- dispatcher already materialized. Enabling the database kill switch alone
-- therefore cannot create new email work. No provider credential, email
-- address, network call, or Cron schedule is stored in the database.

alter table private.reminder_deliveries
  drop constraint reminder_deliveries_failure_code_check,
  add constraint reminder_deliveries_failure_code_check check (
    failure_code is null
    or failure_code in (
      'recipient_unavailable',
      'recipient_not_allowlisted',
      'provider_rejected',
      'configuration_invalid',
      'template_invalid'
    )
  );

create function public.claim_due_typed_reminder_live(
  p_now timestamptz default now(),
  p_batch_size integer default 5,
  p_due_window_seconds integer default 900,
  p_lease_seconds integer default 300
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
  attempt_count integer,
  email_type text,
  learning_language text,
  channel_id text,
  channel_name text,
  channel_summary text,
  video_id text,
  video_title text,
  video_published_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_now is null then
    raise exception 'typed_reminder_live_now_required' using errcode = '22023';
  end if;
  if p_batch_size < 1 or p_batch_size > 10 then
    raise exception 'typed_reminder_live_batch_out_of_range' using errcode = '22023';
  end if;
  if p_due_window_seconds < 60 or p_due_window_seconds > 3600 then
    raise exception 'typed_reminder_live_due_window_out_of_range' using errcode = '22023';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'typed_reminder_live_lease_out_of_range' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from private.reminder_delivery_control as control
    where control.singleton and control.delivery_enabled
  ) then
    raise exception 'typed_reminder_live_delivery_disabled'
      using errcode = '55000';
  end if;

  -- Once a provider call may have started, never turn an expired occurrence
  -- back into ordinary work after the provider idempotency window closes.
  update private.reminder_deliveries as delivery
  set status = 'outcome_ambiguous',
      claim_token = null,
      lease_expires_at = null,
      outcome_ambiguous_at = p_now,
      updated_at = p_now
  where delivery.email_type is not null
    and delivery.status = 'claimed'
    and delivery.lease_expires_at <= p_now
    and delivery.send_started_at is not null
    and delivery.send_retry_deadline <= p_now;

  -- Preference changes, suppression, stale snapshots, and changed study state
  -- invalidate unsent occurrences before they can be reclaimed.
  update private.reminder_deliveries as delivery
  set status = 'suppressed',
      claim_token = null,
      lease_expires_at = null,
      suppressed_at = p_now,
      updated_at = p_now
  where delivery.email_type is not null
    and delivery.send_started_at is null
    and (
      delivery.status = 'pending'
      or (
        delivery.status = 'claimed'
        and delivery.lease_expires_at <= p_now
      )
    )
    and not private.typed_reminder_delivery_is_current(delivery.id, p_now);

  return query
  with candidates as materialized (
    select delivery.id
    from private.reminder_deliveries as delivery
    where delivery.email_type is not null
      and delivery.scheduled_for <= p_now
      and (
        delivery.send_started_at is not null
        or delivery.scheduled_for
          >= p_now - pg_catalog.make_interval(secs => p_due_window_seconds)
      )
      and (
        delivery.status = 'pending'
        or (
          delivery.status = 'claimed'
          and delivery.lease_expires_at <= p_now
        )
      )
      and (
        delivery.send_started_at is null
        or delivery.send_retry_deadline > p_now
      )
      and private.typed_reminder_delivery_is_current(delivery.id, p_now)
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
    claimed.attempt_count,
    claimed.email_type,
    claimed.learning_language,
    claimed.channel_id,
    claimed.channel_name,
    claimed.channel_summary,
    claimed.video_id,
    claimed.video_title,
    claimed.video_published_at
  from claimed
  order by claimed.scheduled_for, claimed.id;
end;
$$;

revoke all on function public.claim_due_typed_reminder_live(
  timestamptz, integer, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_due_typed_reminder_live(
  timestamptz, integer, integer, integer
) to service_role;

create function public.store_typed_reminder_unsubscribe_token(
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
  v_existing_digest bytea;
begin
  if p_delivery_id is null
      or p_claim_token is null
      or p_token_digest is null
      or octet_length(p_token_digest) <> 32
      or p_created_at is null then
    return false;
  end if;
  if not exists (
    select 1
    from private.reminder_delivery_control as control
    where control.singleton and control.delivery_enabled
  ) then
    return false;
  end if;

  perform 1
  from private.reminder_deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.status = 'claimed'
    and delivery.email_type is not null
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_created_at
    and (
      delivery.send_started_at is null
      or delivery.send_retry_deadline > p_created_at
    )
    and private.typed_reminder_delivery_is_current(
      delivery.id,
      p_created_at
    )
  for update of delivery;

  if not found then
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

  if exists (
    select 1
    from private.reminder_deliveries as delivery
    where delivery.id = p_delivery_id
      and delivery.send_started_at is not null
  ) then
    return false;
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
    and delivery.email_type is not null
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_created_at
    and delivery.send_started_at is null
  on conflict do nothing;

  return exists (
    select 1
    from private.reminder_unsubscribe_tokens as token
    where token.delivery_id = p_delivery_id
      and token.token_digest = p_token_digest
  );
end;
$$;

revoke all on function public.store_typed_reminder_unsubscribe_token(
  uuid, uuid, bytea, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.store_typed_reminder_unsubscribe_token(
  uuid, uuid, bytea, timestamptz
) to service_role;

create function public.complete_typed_reminder_without_send(
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
      or p_failure_code not in (
        'recipient_unavailable',
        'recipient_not_allowlisted'
      )
      or p_failed_at is null then
    return false;
  end if;
  if not exists (
    select 1
    from private.reminder_delivery_control as control
    where control.singleton and control.delivery_enabled
  ) then
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
    and delivery.email_type is not null
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_failed_at
    and delivery.provider_name is null
    and delivery.send_started_at is null
    and delivery.send_retry_deadline is null
    and private.typed_reminder_delivery_is_current(
      delivery.id,
      p_failed_at
    )
  returning true into completed;

  return coalesce(completed, false);
end;
$$;

revoke all on function public.complete_typed_reminder_without_send(
  uuid, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_typed_reminder_without_send(
  uuid, text, timestamptz
) to service_role;

create function public.begin_typed_reminder_provider_attempt(
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
    where control.singleton and control.delivery_enabled
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
    and delivery.email_type is not null
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
    and private.typed_reminder_delivery_is_current(
      delivery.id,
      p_started_at
    )
  returning true into started;

  return coalesce(started, false);
end;
$$;

revoke all on function public.begin_typed_reminder_provider_attempt(
  uuid, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.begin_typed_reminder_provider_attempt(
  uuid, text, timestamptz
) to service_role;

comment on function public.claim_due_typed_reminder_live(
  timestamptz, integer, integer, integer
) is
  'Leases only previously materialized, current typed occurrences while the independent live switch is enabled.';
comment on function public.store_typed_reminder_unsubscribe_token(
  uuid, uuid, bytea, timestamptz
) is
  'Binds one opaque unsubscribe capability after rechecking a current typed claim and before provider state begins.';
comment on function public.complete_typed_reminder_without_send(
  uuid, text, timestamptz
) is
  'Terminates a current typed claim for a missing or non-allowlisted recipient without recording provider state.';
comment on function public.begin_typed_reminder_provider_attempt(
  uuid, text, timestamptz
) is
  'Performs the final typed eligibility and kill-switch check before any provider network request may begin.';
