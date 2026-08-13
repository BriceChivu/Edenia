-- Build the private, server-owned half of reminder scheduling without adding a
-- dispatcher, Cron job, or email provider. Browser clients retain access only
-- to public.reminder_preferences through its existing owner RLS policies.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;

create table private.reminder_delivery_control (
  singleton boolean primary key default true,
  delivery_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint reminder_delivery_control_singleton_check check (singleton)
);

insert into private.reminder_delivery_control (singleton, delivery_enabled)
values (true, false);

comment on table private.reminder_delivery_control is
  'Server-only emergency switch for live reminder delivery. Seeded off.';

create table private.reminder_delivery_testers (
  user_id uuid primary key,
  created_at timestamptz not null default now(),
  constraint reminder_delivery_testers_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade
);

comment on table private.reminder_delivery_testers is
  'Server-managed UUID allowlist for reminder dispatch testing. Contains no email address.';

create table private.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scheduled_local_date date not null,
  scheduled_local_time time without time zone not null,
  scheduled_for timestamptz not null,
  timezone text not null,
  locale text not null,
  consent_version text not null,
  consent_granted_at timestamptz not null,
  status text not null default 'pending',
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_claimed_at timestamptz,
  dry_run_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_deliveries_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint reminder_deliveries_user_local_date_key
    unique (user_id, scheduled_local_date),
  constraint reminder_deliveries_timezone_check check (
    char_length(timezone) between 1 and 100
    and (
      timezone = 'UTC'
      or timezone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+$'
    )
    and pg_catalog.timezone(
      timezone,
      timestamp '2000-01-01 00:00:00'
    ) is not null
  ),
  constraint reminder_deliveries_locale_check check (
    locale in ('en', 'zh-Hant', 'zh-Hans', 'es', 'fr')
  ),
  constraint reminder_deliveries_consent_version_check check (
    char_length(consent_version) between 1 and 80
  ),
  constraint reminder_deliveries_status_check check (
    status in ('pending', 'claimed', 'dry_run_observed')
  ),
  constraint reminder_deliveries_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint reminder_deliveries_claim_state_check check (
    (
      status = 'claimed'
      and claim_token is not null
      and lease_expires_at is not null
      and last_claimed_at is not null
    )
    or (
      status <> 'claimed'
      and claim_token is null
      and lease_expires_at is null
    )
  ),
  constraint reminder_deliveries_dry_run_state_check check (
    (status = 'dry_run_observed') = (dry_run_observed_at is not null)
  ),
  constraint reminder_deliveries_schedule_snapshot_check check (
    (scheduled_local_date + scheduled_local_time) at time zone timezone
      = scheduled_for
  )
);

comment on table private.reminder_deliveries is
  'Private occurrence ledger and outbox. One user can have at most one occurrence per local date.';
comment on column private.reminder_deliveries.id is
  'Stable non-PII occurrence identifier for logs and future provider idempotency.';
comment on column private.reminder_deliveries.scheduled_for is
  'UTC instant computed from the saved local schedule and IANA timezone.';

create index reminder_deliveries_claimable_idx
  on private.reminder_deliveries (scheduled_for, id)
  where status in ('pending', 'claimed');

alter table private.reminder_delivery_control enable row level security;
alter table private.reminder_delivery_testers enable row level security;
alter table private.reminder_deliveries enable row level security;

revoke all on table private.reminder_delivery_control
  from public, anon, authenticated, service_role;
revoke all on table private.reminder_delivery_testers
  from public, anon, authenticated, service_role;
revoke all on table private.reminder_deliveries
  from public, anon, authenticated, service_role;

-- PostgreSQL resolves a nonexistent spring-forward wall time to the first
-- corresponding instant after the gap, and an ambiguous fall-back wall time to
-- the standard-time (later) instant. Keeping this calculation in PostgreSQL
-- gives every worker one deterministic policy backed by the installed tzdata.
create or replace function private.reminder_next_occurrence(
  p_days smallint[],
  p_local_time time without time zone,
  p_timezone text,
  p_not_before timestamptz
)
returns table (
  scheduled_local_date date,
  scheduled_for timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    candidate.local_date,
    occurrence.scheduled_for
  from pg_catalog.generate_series(0, 7) as offsets(day_offset)
  cross join lateral (
    select (
      (p_not_before at time zone p_timezone)::date
      + offsets.day_offset
    )::date as local_date
  ) as candidate
  cross join lateral (
    select (
      candidate.local_date + p_local_time
    ) at time zone p_timezone as scheduled_for
  ) as occurrence
  where extract(isodow from candidate.local_date)::smallint
      = any(p_days)
    and occurrence.scheduled_for >= p_not_before
  order by occurrence.scheduled_for, candidate.local_date
  limit 1
$$;

revoke execute on function private.reminder_next_occurrence(
  smallint[], time without time zone, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.reminder_delivery_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select control.delivery_enabled
      from private.reminder_delivery_control as control
      where control.singleton
    ),
    false
  )
$$;

revoke execute on function public.reminder_delivery_is_enabled()
  from public, anon, authenticated;
grant execute on function public.reminder_delivery_is_enabled()
  to service_role;

create or replace function public.claim_due_reminder_deliveries(
  p_now timestamptz default now(),
  p_batch_size integer default 50,
  p_due_window_seconds integer default 900,
  p_lease_seconds integer default 120
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
  timestamptz, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.claim_due_reminder_deliveries(
  timestamptz, integer, integer, integer
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
  returning true into completed;

  return coalesce(completed, false);
end;
$$;

revoke execute on function public.complete_reminder_dry_run(
  uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_reminder_dry_run(
  uuid, timestamptz
) to service_role;
