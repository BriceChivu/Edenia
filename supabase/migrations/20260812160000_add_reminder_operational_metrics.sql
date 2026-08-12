-- Add privacy-safe, service-only reminder health metrics. This migration does
-- not add a schedule, provider credential, browser route, or delivery path.

alter table private.reminder_provider_events
  add column duplicate_count integer not null default 0,
  add column last_duplicate_at timestamptz,
  add constraint reminder_provider_events_duplicate_count_check check (
    duplicate_count between 0 and 2147483647
  ),
  add constraint reminder_provider_events_duplicate_state_check check (
    (duplicate_count = 0) = (last_duplicate_at is null)
    and (
      last_duplicate_at is null
      or last_duplicate_at >= received_at
    )
  );

comment on column private.reminder_provider_events.duplicate_count is
  'Number of exact signed-provider event replays rejected after the first accepted event.';

create or replace function public.record_reminder_provider_event(
  p_provider_name text,
  p_event_id text,
  p_event_type text,
  p_delivery_id uuid,
  p_provider_message_id text,
  p_event_created_at timestamptz,
  p_received_at timestamptz default now()
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery record;
  v_existing record;
  v_action text;
  v_inserted boolean := false;
  v_suppression_reason text;
begin
  if p_provider_name is null
      or p_provider_name <> 'resend'
      or p_event_id is null
      or char_length(p_event_id) not between 1 and 200
      or p_event_id !~ '^[A-Za-z0-9_-]+$'
      or p_event_type is null
      or p_event_type not in (
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.failed',
        'email.bounced',
        'email.complained',
        'email.suppressed'
      )
      or p_delivery_id is null
      or p_provider_message_id is null
      or char_length(p_provider_message_id) not between 1 and 200
      or p_provider_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      or p_event_created_at is null
      or p_received_at is null
      or p_event_created_at > p_received_at + interval '5 minutes' then
    return 'invalid';
  end if;

  v_action := case
    when p_event_type in (
      'email.bounced',
      'email.complained',
      'email.suppressed'
    ) then 'suppressed'
    else 'observed'
  end;

  select event.*
  into v_existing
  from private.reminder_provider_events as event
  where event.provider_name = p_provider_name
    and event.event_id = p_event_id;

  if found then
    if v_existing.event_type = p_event_type
        and v_existing.delivery_id = p_delivery_id
        and v_existing.provider_message_id = p_provider_message_id
        and v_existing.event_created_at = p_event_created_at
        and v_existing.action = v_action then
      update private.reminder_provider_events as event
      set duplicate_count = least(
            event.duplicate_count::bigint + 1,
            2147483647
          )::integer,
          last_duplicate_at = greatest(
            event.received_at,
            coalesce(event.last_duplicate_at, event.received_at),
            p_received_at
          )
      where event.provider_name = p_provider_name
        and event.event_id = p_event_id;
      return 'duplicate';
    end if;
    return 'event_conflict';
  end if;

  select
    delivery.id,
    delivery.user_id,
    delivery.status,
    delivery.provider_name,
    delivery.provider_message_id,
    delivery.send_started_at
  into v_delivery
  from private.reminder_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;

  if not found
      or v_delivery.provider_name <> p_provider_name
      or v_delivery.send_started_at is null
      or p_received_at < v_delivery.send_started_at
      or p_event_created_at < v_delivery.send_started_at - interval '5 minutes'
      or v_delivery.status not in (
        'claimed',
        'suppressed',
        'provider_accepted',
        'outcome_ambiguous'
      )
      or (
        v_delivery.provider_message_id is not null
        and v_delivery.provider_message_id <> p_provider_message_id
      ) then
    return 'unmatched';
  end if;

  if exists (
    select 1
    from private.reminder_deliveries as other_delivery
    where other_delivery.provider_name = p_provider_name
      and other_delivery.provider_message_id = p_provider_message_id
      and other_delivery.id <> p_delivery_id
  ) then
    return 'event_conflict';
  end if;

  insert into private.reminder_provider_events (
    provider_name,
    event_id,
    event_type,
    delivery_id,
    provider_message_id,
    event_created_at,
    received_at,
    action
  ) values (
    p_provider_name,
    p_event_id,
    p_event_type,
    p_delivery_id,
    p_provider_message_id,
    p_event_created_at,
    p_received_at,
    v_action
  )
  on conflict (provider_name, event_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    select event.*
    into v_existing
    from private.reminder_provider_events as event
    where event.provider_name = p_provider_name
      and event.event_id = p_event_id;

    if found
        and v_existing.event_type = p_event_type
        and v_existing.delivery_id = p_delivery_id
        and v_existing.provider_message_id = p_provider_message_id
        and v_existing.event_created_at = p_event_created_at
        and v_existing.action = v_action then
      update private.reminder_provider_events as event
      set duplicate_count = least(
            event.duplicate_count::bigint + 1,
            2147483647
          )::integer,
          last_duplicate_at = greatest(
            event.received_at,
            coalesce(event.last_duplicate_at, event.received_at),
            p_received_at
          )
      where event.provider_name = p_provider_name
        and event.event_id = p_event_id;
      return 'duplicate';
    end if;
    return 'event_conflict';
  end if;

  if v_delivery.status in ('claimed', 'outcome_ambiguous') then
    update private.reminder_deliveries as delivery
    set status = 'provider_accepted',
        claim_token = null,
        lease_expires_at = null,
        provider_accepted_at = p_received_at,
        provider_message_id = p_provider_message_id,
        outcome_ambiguous_at = null,
        updated_at = greatest(delivery.updated_at, p_received_at)
    where delivery.id = p_delivery_id;
  end if;

  if v_action = 'suppressed' then
    v_suppression_reason := case p_event_type
      when 'email.bounced' then 'hard_bounce'
      when 'email.complained' then 'complaint'
      else 'provider_suppressed'
    end;

    if not private.apply_reminder_suppression(
      v_delivery.user_id,
      v_suppression_reason,
      'provider_webhook',
      p_received_at
    ) then
      raise exception 'reminder_provider_suppression_failed'
        using errcode = '55000';
    end if;
    return 'suppressed';
  end if;

  return 'recorded';
end;
$$;

revoke execute on function public.record_reminder_provider_event(
  text, text, text, uuid, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_reminder_provider_event(
  text, text, text, uuid, text, timestamptz, timestamptz
) to service_role;

create function public.get_reminder_operational_metrics(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_oldest_due_at timestamptz;
begin
  if p_now is null then
    raise exception 'reminder_metrics_now_required' using errcode = '22023';
  end if;

  select min(delivery.scheduled_for)
  into v_oldest_due_at
  from private.reminder_deliveries as delivery
  where delivery.status in ('pending', 'claimed')
    and delivery.scheduled_for <= p_now;

  return jsonb_build_object(
    'schema_version', 1,
    'generated_at', p_now,
    'delivery_enabled', coalesce((
      select control.delivery_enabled
      from private.reminder_delivery_control as control
      where control.singleton
    ), false),
    'queue', jsonb_build_object(
      'due_occurrences', (
        select count(*)
        from private.reminder_deliveries as delivery
        where delivery.status in ('pending', 'claimed')
          and delivery.scheduled_for <= p_now
      ),
      'oldest_due_at', v_oldest_due_at,
      'oldest_age_seconds', case
        when v_oldest_due_at is null then null
        else greatest(
          0,
          floor(extract(epoch from p_now - v_oldest_due_at))::bigint
        )
      end
    ),
    'deliveries', jsonb_build_object(
      'provider_accepted', (
        select count(*)
        from private.reminder_deliveries as delivery
        where delivery.status = 'provider_accepted'
      ),
      'permanent_failure', (
        select count(*)
        from private.reminder_deliveries as delivery
        where delivery.status = 'permanent_failure'
      ),
      'outcome_ambiguous', (
        select count(*)
        from private.reminder_deliveries as delivery
        where delivery.status = 'outcome_ambiguous'
      )
    ),
    'duplicate_provider_events_prevented', coalesce((
      select sum(event.duplicate_count)
      from private.reminder_provider_events as event
    ), 0),
    'suppressions', (
      select count(*)
      from private.reminder_suppressions
    )
  );
end;
$$;

revoke execute on function public.get_reminder_operational_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_reminder_operational_metrics(timestamptz)
  to service_role;

comment on function public.get_reminder_operational_metrics(timestamptz) is
  'Returns aggregate queue, delivery, replay-prevention, and suppression health without user identifiers or recipient addresses.';
