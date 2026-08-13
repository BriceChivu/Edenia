-- Add an idempotent, provider-neutral event ledger before exposing any webhook
-- endpoint. The service stores only bounded event identifiers and delivery
-- references; it never persists provider payloads or recipient addresses. This
-- migration adds no webhook route, provider credential, Cron job, or live-send
-- enablement.
alter table private.reminder_suppressions
  drop constraint reminder_suppressions_reason_check,
  add constraint reminder_suppressions_reason_check check (
    reason in (
      'unsubscribed',
      'hard_bounce',
      'complaint',
      'provider_suppressed',
      'manual'
    )
  );

create table private.reminder_provider_events (
  provider_name text not null,
  event_id text not null,
  event_type text not null,
  delivery_id uuid not null,
  provider_message_id text not null,
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  action text not null,
  primary key (provider_name, event_id),
  constraint reminder_provider_events_delivery_id_fkey
    foreign key (delivery_id) references private.reminder_deliveries (id)
      on delete cascade,
  constraint reminder_provider_events_provider_name_check check (
    provider_name = 'resend'
  ),
  constraint reminder_provider_events_event_id_check check (
    char_length(event_id) between 1 and 200
    and event_id ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint reminder_provider_events_event_type_check check (
    event_type in (
      'email.sent',
      'email.delivered',
      'email.delivery_delayed',
      'email.failed',
      'email.bounced',
      'email.complained',
      'email.suppressed'
    )
  ),
  constraint reminder_provider_events_message_id_check check (
    char_length(provider_message_id) between 1 and 200
    and provider_message_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint reminder_provider_events_action_check check (
    action in ('observed', 'suppressed')
    and (
      (event_type in (
        'email.bounced',
        'email.complained',
        'email.suppressed'
      )) = (action = 'suppressed')
    )
  ),
  constraint reminder_provider_events_clock_check check (
    event_created_at <= received_at + interval '5 minutes'
  )
);

comment on table private.reminder_provider_events is
  'Idempotent provider event metadata correlated by a non-personal delivery tag. Contains no provider payload or recipient address.';

create index reminder_provider_events_delivery_id_idx
  on private.reminder_provider_events (delivery_id, event_created_at);
create index reminder_provider_events_received_at_idx
  on private.reminder_provider_events (received_at);

alter table private.reminder_provider_events enable row level security;
revoke all on table private.reminder_provider_events
  from public, anon, authenticated, service_role;

create function public.record_reminder_provider_event(
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

comment on function public.record_reminder_provider_event(
  text, text, text, uuid, text, timestamptz, timestamptz
) is
  'Idempotently records bounded signed-provider metadata, reconciles acceptance races, and atomically suppresses bounced, complained, or provider-suppressed reminder recipients.';

create or replace function public.record_reminder_suppression(
  p_user_id uuid,
  p_reason text,
  p_source text,
  p_suppressed_at timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_reason is null
      or p_source is null
      or p_suppressed_at is null
      or not (
        (
          p_reason in ('hard_bounce', 'complaint', 'provider_suppressed')
          and p_source = 'provider_webhook'
        )
        or (p_reason = 'manual' and p_source = 'operator')
      ) then
    return false;
  end if;

  return private.apply_reminder_suppression(
    p_user_id,
    p_reason,
    p_source,
    p_suppressed_at
  );
end;
$$;
