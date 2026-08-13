-- Restore the additive database objects required by the repository's hardened
-- Stripe webhook. This deliberately does not change checkout availability,
-- subscription status, or any existing subscription identifiers.

create table if not exists public.stripe_webhook_events (
  event_id text not null,
  event_type text not null,
  livemode boolean not null,
  claim_id uuid not null,
  claimed_at timestamptz not null,
  processed_at timestamptz,
  constraint stripe_webhook_events_pkey primary key (event_id),
  constraint stripe_webhook_events_event_id_check
    check (event_id ~ '^evt_[A-Za-z0-9_]{6,250}$'),
  constraint stripe_webhook_events_event_type_check
    check (char_length(event_type) between 1 and 200)
);

create index if not exists stripe_webhook_events_processed_at_idx
  on public.stripe_webhook_events (processed_at)
  where processed_at is not null;

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.stripe_webhook_events
  to service_role;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_claim_id uuid,
  p_stale_before timestamptz,
  p_claimed_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]{6,250}$'
    or char_length(p_event_type) not between 1 and 200
    or p_claim_id is null
    or p_stale_before >= p_claimed_at
  then
    raise exception 'invalid_stripe_webhook_claim';
  end if;

  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    livemode,
    claim_id,
    claimed_at
  )
  values (p_event_id, p_event_type, p_livemode, p_claim_id, p_claimed_at)
  on conflict (event_id) do nothing
  returning * into v_event;

  if found then
    return 'claimed';
  end if;

  select * into v_event
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if v_event.event_type <> p_event_type or v_event.livemode <> p_livemode then
    raise exception 'stripe_webhook_event_identity_mismatch';
  end if;

  if v_event.processed_at is not null then
    return 'processed';
  end if;

  if v_event.claimed_at >= p_stale_before then
    return 'in_progress';
  end if;

  update public.stripe_webhook_events
  set claim_id = p_claim_id, claimed_at = p_claimed_at
  where event_id = p_event_id;
  return 'claimed';
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text,
  p_claim_id uuid,
  p_processed_at timestamptz default now()
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.stripe_webhook_events
    set processed_at = p_processed_at
    where event_id = p_event_id
      and claim_id = p_claim_id
      and processed_at is null
    returning event_id
  )
  select exists (select 1 from completed);
$$;

create or replace function public.release_stripe_webhook_event(
  p_event_id text,
  p_claim_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    delete from public.stripe_webhook_events
    where event_id = p_event_id
      and claim_id = p_claim_id
      and processed_at is null
    returning event_id
  )
  select exists (select 1 from released);
$$;

revoke all on function public.claim_stripe_webhook_event(
  text,
  text,
  boolean,
  uuid,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(
  text,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.release_stripe_webhook_event(text, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(
  text,
  text,
  boolean,
  uuid,
  timestamptz,
  timestamptz
) to service_role;
grant execute on function public.complete_stripe_webhook_event(
  text,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.release_stripe_webhook_event(text, uuid)
  to service_role;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.cancel_at_period_end is
  'Current Stripe subscription cancellation-at-period-end state, synchronized by billing webhooks.';
