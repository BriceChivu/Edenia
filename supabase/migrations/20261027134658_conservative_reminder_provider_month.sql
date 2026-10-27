-- Provider monthly usage can follow an account billing period rather than a
-- UTC calendar month. Keep uncertain reservations for the full conservative
-- 31-day horizon when subtracting them from provider-wide monthly headroom.
-- Exact provider-observed reservations remain excluded from that subtraction.
-- CREATE OR REPLACE retains the existing function ownership and privileges;
-- the product daily/rolling caps, retry exclusion and evidence guards are unchanged.
create or replace function private.reminder_capacity_slots(p_at timestamptz,p_existing_delivery uuid default null)
returns integer language sql stable set search_path='' as $$
 with existing as (
  select q.id,q.provider_observed_at from private.reminder_quota_reservations q
  where q.delivery_id=p_existing_delivery and q.utc_date=(p_at at time zone 'UTC')::date
   and q.released_at is null
 ), counts as (
  select count(*) filter(where q.utc_date=(p_at at time zone 'UTC')::date) as day_total,
   count(*) filter(where q.reserved_at>p_at-interval '31 days') as rolling_total,
   count(*) filter(where q.utc_date=(p_at at time zone 'UTC')::date and q.provider_observed_at is null) as day_unobserved,
   count(*) filter(where q.reserved_at>p_at-interval '31 days' and q.provider_observed_at is null) as month_unobserved
  from private.reminder_quota_reservations q where q.released_at is null
   and q.id is distinct from (select e.id from existing e)
 )
 select coalesce((select case when c.verified_free and c.overage_disabled and c.sender_verified
  and c.stop_reason is null and c.attested_at is not null and c.attested_at<=p_at
  and c.api_key_digest is not null and c.sender_digest is not null
  and c.observed_at<=p_at and c.observed_at>=p_at-interval '10 minutes'
  and (c.observed_at at time zone 'UTC')::date=(p_at at time zone 'UTC')::date
  and c.daily_used is not null and c.monthly_used is not null
 then greatest(0,least(60-n.day_total,1800-n.rolling_total,
  60-c.daily_used+(select count(*) from existing e where e.provider_observed_at is not null)-n.day_unobserved,
  1800-c.monthly_used+(select count(*) from existing e where e.provider_observed_at is not null)-n.month_unobserved))::integer
 else 0 end from private.reminder_free_capacity c cross join counts n where c.singleton),0)
$$;
