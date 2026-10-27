-- Optional email is off after upgrade. Neither this migration nor a UI flag
-- schedules or authorizes a provider request. Activation is a separate action.
update private.reminder_delivery_control set delivery_enabled = false;
alter table private.reminder_delivery_control
  add column admission_mode text not null default 'canary'
    check (admission_mode in ('canary','public'));

alter table private.reminder_deliveries
  add column next_attempt_at timestamptz,
  add column enrollment_epoch bigint,
  add column choice_version bigint,
  add column may_have_sent boolean not null default false,
  add column provider_attempt_count integer not null default 0,
  add column skip_reason text,
  drop constraint reminder_deliveries_typed_payload_check,
  add constraint reminder_deliveries_typed_payload_check check (
    (email_type is null and learning_language is null and channel_id is null
      and channel_name is null and channel_summary is null and video_id is null
      and video_title is null and video_published_at is null
      and eligibility_snapshot_updated_at is null)
    or (email_type='streak' and eligibility_snapshot_updated_at is not null
      and channel_summary is null and ((channel_id is null and channel_name is null
        and video_id is null and video_title is null and video_published_at is null)
        or (channel_id is not null and channel_name is not null and video_id is not null
        and video_title is not null and video_published_at is not null)))
    or (email_type='discovery' and learning_language is not null and channel_id is not null
      and channel_name is not null and channel_summary is not null
      and eligibility_snapshot_updated_at is not null
      and ((video_id is null and video_title is null and video_published_at is null)
        or (video_id is not null and video_title is not null and video_published_at is not null)))
  ),
  drop constraint reminder_deliveries_ambiguous_state_check,
  add constraint reminder_deliveries_ambiguous_state_check check (
    (status='outcome_ambiguous')=(outcome_ambiguous_at is not null)
    and (outcome_ambiguous_at is null or outcome_ambiguous_at>=send_started_at)
  );
-- Preserve ambiguity from a deployment before this migration.
update private.reminder_deliveries set may_have_sent=true
where send_started_at is not null and status<>'permanent_failure';

create table private.reminder_free_capacity (
  singleton boolean primary key default true check(singleton),
  verified_free boolean not null default false,
  overage_disabled boolean not null default false,
  sender_verified boolean not null default false,
  observed_at timestamptz,
  daily_used integer check(daily_used>=0),
  monthly_used integer check(monthly_used>=0),
  stop_reason text,
  attested_at timestamptz,
  api_key_digest bytea check(api_key_digest is null or octet_length(api_key_digest)=32),
  sender_digest bytea check(sender_digest is null or octet_length(sender_digest)=32)
);
insert into private.reminder_free_capacity(singleton) values(true);
-- No owner or recipient data: reservations survive account deletion, because
-- deleting an account must never create fictitious provider capacity.
create table private.reminder_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null,
  utc_date date not null,
  reserved_at timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  provider_observed_at timestamptz,
  unique(delivery_id,utc_date),
  check(not(consumed_at is not null and released_at is not null))
);
create index reminder_quota_active_idx on private.reminder_quota_reservations(utc_date,reserved_at)
where released_at is null;
create table private.reminder_capacity_admissions (
  delivery_id uuid primary key references private.reminder_deliveries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  utc_date date not null,
  admitted_at timestamptz not null,
  released_at timestamptz,
  unique(user_id,utc_date)
);
create index reminder_admissions_day_idx on private.reminder_capacity_admissions(utc_date)
where released_at is null;
create table private.reminder_dispatch_skips (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  reason text not null check(reason in ('capacity_unknown','capacity_exhausted',
    'capacity_not_admitted','window_expired','eligibility_changed','payload_changed')),
  observed_at timestamptz not null,
  primary key(user_id,local_date,reason)
);
create table private.reminder_payload_bindings (
  delivery_id uuid primary key references private.reminder_deliveries(id) on delete cascade,
  recipient_digest bytea not null check(octet_length(recipient_digest)=32),
  sender_digest bytea not null check(octet_length(sender_digest)=32),
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  template_version text not null check(length(template_version) between 1 and 80),
  unsubscribe_key_version text not null check(length(unsubscribe_key_version) between 1 and 80),
  created_at timestamptz not null,
  api_key_digest bytea not null check(octet_length(api_key_digest)=32),
  admission_mode text not null check(admission_mode in ('canary','public'))
);
-- These are private capability ledgers, never browser APIs.
alter table private.reminder_free_capacity enable row level security;
alter table private.reminder_quota_reservations enable row level security;
alter table private.reminder_capacity_admissions enable row level security;
alter table private.reminder_dispatch_skips enable row level security;
alter table private.reminder_payload_bindings enable row level security;
revoke all on private.reminder_free_capacity,private.reminder_quota_reservations,
 private.reminder_capacity_admissions,private.reminder_dispatch_skips,
 private.reminder_payload_bindings from public,anon,authenticated,service_role;

-- Available capacity excludes at most the exact reservation being reused.
-- It never treats exhaustion caused by other reservations as the caller's slot.
create function private.reminder_capacity_slots(p_at timestamptz,p_existing_delivery uuid default null)
returns integer language sql stable set search_path='' as $$
 with existing as (
  select q.id,q.provider_observed_at from private.reminder_quota_reservations q
  where q.delivery_id=p_existing_delivery and q.utc_date=(p_at at time zone 'UTC')::date
   and q.released_at is null
 ), counts as (
  select count(*) filter(where q.utc_date=(p_at at time zone 'UTC')::date) as day_total,
   count(*) filter(where q.reserved_at>p_at-interval '31 days') as rolling_total,
   count(*) filter(where q.utc_date=(p_at at time zone 'UTC')::date and q.provider_observed_at is null) as day_unobserved,
   count(*) filter(where q.utc_date>=date_trunc('month',p_at at time zone 'UTC')::date and q.provider_observed_at is null) as month_unobserved
  from private.reminder_quota_reservations q where q.released_at is null
   and q.id is distinct from (select e.id from existing e)
 )
 select coalesce((select case when c.verified_free and c.overage_disabled and c.sender_verified
  and c.stop_reason is null and c.attested_at<=p_at and c.attested_at>=p_at-interval '24 hours'
  and c.api_key_digest is not null and c.sender_digest is not null
  and c.observed_at<=p_at and c.observed_at>=p_at-interval '10 minutes'
  and (c.observed_at at time zone 'UTC')::date=(p_at at time zone 'UTC')::date
  and c.daily_used is not null and c.monthly_used is not null
 then greatest(0,least(60-n.day_total,1800-n.rolling_total,
  60-c.daily_used+(select count(*) from existing e where e.provider_observed_at is not null)-n.day_unobserved,
  1800-c.monthly_used+(select count(*) from existing e where e.provider_observed_at is not null)-n.month_unobserved))::integer
 else 0 end from private.reminder_free_capacity c cross join counts n where c.singleton),0)
$$;

create function private.reminder_capacity_reason(p_at timestamptz)
returns text language sql stable set search_path='' as $$
 select coalesce((select case
  when not c.verified_free or not c.overage_disabled or not c.sender_verified
    or c.attested_at is null or c.attested_at>p_at or c.attested_at<p_at-interval '24 hours'
    or c.api_key_digest is null or c.sender_digest is null
    or c.observed_at is null or c.observed_at>p_at or c.observed_at<p_at-interval '10 minutes'
    or (c.observed_at at time zone 'UTC')::date<>(p_at at time zone 'UTC')::date
    or c.daily_used is null or c.monthly_used is null then 'capacity_unknown'
  when c.stop_reason is not null then 'capacity_exhausted'
  when private.reminder_capacity_slots(p_at)<=0
    then 'capacity_exhausted'
  else 'available' end
 from private.reminder_free_capacity c where c.singleton),'capacity_unknown')
$$;
-- The public limits are 100/day and 3000/month. Product limits leave 40/day
-- and 1200/month headroom for Auth and shared traffic; neither is a guarantee
-- of sign-in availability. Unknown account/usage evidence prevents sending.
create function public.record_reminder_free_capacity(
 p_verified_free boolean,p_overage_disabled boolean,p_sender_verified boolean,
 p_daily_used integer,p_monthly_used integer,p_observed_at timestamptz,
 p_api_key_digest bytea,p_sender_digest bytea,
 p_observed_delivery_ids uuid[] default '{}'::uuid[]
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_observed_at is null or p_observed_at>now()+interval '1 minute'
  or p_daily_used<0 or p_monthly_used<0 or p_daily_used is null or p_monthly_used is null
  or cardinality(p_observed_delivery_ids)>3000 or p_api_key_digest is null or p_sender_digest is null
  or octet_length(p_api_key_digest)<>32 or octet_length(p_sender_digest)<>32 then return false; end if;
 perform 1 from private.reminder_free_capacity where singleton for update;
 if exists(select 1 from private.reminder_free_capacity where singleton and observed_at>p_observed_at)
 then return false; end if;
 -- Reconcile exact provider-observed IDs. Never subtract an aggregate estimate:
 -- otherwise the same accepted email could be counted twice or not at all.
 update private.reminder_quota_reservations q set provider_observed_at=p_observed_at
 where q.delivery_id=any(p_observed_delivery_ids) and q.consumed_at<=p_observed_at
 and exists(select 1 from private.reminder_deliveries d where d.id=q.delivery_id
   and (d.provider_accepted_at is not null or exists(select 1 from private.reminder_provider_events e
     where e.delivery_id=d.id)));
 update private.reminder_free_capacity set verified_free=coalesce(p_verified_free,false),
  overage_disabled=coalesce(p_overage_disabled,false),sender_verified=coalesce(p_sender_verified,false),
  daily_used=p_daily_used,monthly_used=p_monthly_used,observed_at=p_observed_at,stop_reason=null,
  attested_at=p_observed_at,api_key_digest=p_api_key_digest,sender_digest=p_sender_digest
 where singleton;
 return true;
end $$;
-- A GET /usage refresh can update counters, never attest a plan, key or sender.
create function public.reminder_provider_attestation_is_current(p_api_key_digest bytea,p_sender_digest bytea,
 p_now timestamptz default now(),p_admission_mode text default 'canary') returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.reminder_free_capacity c where c.singleton
  and c.api_key_digest=p_api_key_digest and c.sender_digest=p_sender_digest
  and c.verified_free and c.overage_disabled and c.sender_verified
  and c.attested_at<=p_now and c.attested_at>=p_now-interval '24 hours'
  and exists(select 1 from private.reminder_delivery_control ctl where ctl.singleton
    and ctl.admission_mode=p_admission_mode))
$$;
create function public.refresh_reminder_provider_usage(p_api_key_digest bytea,p_sender_digest bytea,
 p_daily_used integer,p_monthly_used integer,p_observed_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_observed_at is null or p_observed_at>now()+interval '1 minute' or p_daily_used is null
  or p_daily_used<0 or p_monthly_used is null or p_monthly_used<0 then return false; end if;
 update private.reminder_free_capacity set daily_used=p_daily_used,monthly_used=p_monthly_used,
 observed_at=p_observed_at
 where singleton and api_key_digest=p_api_key_digest and sender_digest=p_sender_digest
  and verified_free and overage_disabled and sender_verified
  and attested_at>=p_observed_at-interval '24 hours' and attested_at<=p_observed_at
  and (observed_at is null or observed_at<=p_observed_at);
 return found;
end $$;
create function public.reminder_capacity_status(p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('reason',private.reminder_capacity_reason(p_now),
 'daily_product_cap',60,'rolling_31_day_product_cap',1800,
 'usage_fresh_for_seconds',600,'admission_mode',c.admission_mode)
 from private.reminder_delivery_control c where c.singleton
$$;

create function private.reminder_candidates(p_utc_date date,p_at timestamptz)
returns table(user_id uuid,local_date date,scheduled_for timestamptz,timezone text,
 locale text,learning_language text,consent_version text,consent_granted_at timestamptz,
 snapshot_updated_at timestamptz,enrollment_epoch bigint,choice_version bigint,
 email_type text,channel_id text,channel_name text,channel_summary text,
 video_id text,video_title text,video_published_at timestamptz)
language sql stable set search_path='' as $$
 with owners as materialized (
  select p.*,s.timezone as accepted_timezone,s.locale as accepted_locale,s.learning_language,
   s.updated_at as snapshot_updated_at,s.relevant_activity_at,
   (((p_utc_date+o.day_offset)+time '19:00') at time zone s.timezone) as due,
   (p_utc_date+o.day_offset)::date as local_date
  from public.reminder_preferences p join public.reminder_eligibility_snapshots s using(user_id)
  cross join (values(-1),(0),(1)) o(day_offset)
  cross join private.reminder_delivery_control ctl
  where s.timezone=p.timezone
   and private.reminder_projection_matches_head(p.user_id)
   and (ctl.admission_mode='public' or exists(select 1 from private.reminder_delivery_testers t
     where t.user_id=p.user_id))
 ), eligible as (
  select o.*,case when public.reminder_type_enrolled(o.user_id,'streak')
   and private.reminder_study_points(o.user_id,o.local_date-1)>=private.reminder_study_threshold()
   and coalesce(private.reminder_study_points(o.user_id,o.local_date),0)<private.reminder_study_threshold()
   then 'streak' when public.reminder_type_enrolled(o.user_id,'discovery')
   and o.learning_language is not null and o.relevant_activity_at>=p_at-interval '30 days'
   and not exists(select 1 from private.reminder_deliveries d where d.user_id=o.user_id
     and d.email_type='discovery' and d.may_have_sent
     and d.scheduled_local_date>o.local_date-7 and d.scheduled_local_date<=o.local_date)
   then 'discovery' end as kind
  from owners o where (o.due at time zone 'UTC')::date=p_utc_date
   and not exists(select 1 from private.reminder_deliveries d where d.user_id=o.user_id
     and d.may_have_sent and d.send_started_at>o.due-interval '24 hours'
     and d.send_started_at<=o.due)
 )
 select e.user_id,e.local_date,e.due,e.accepted_timezone,e.accepted_locale,e.learning_language,
  e.consent_version,e.consent_granted_at,e.snapshot_updated_at,e.enrollment_epoch,
  case e.kind when 'streak' then e.streak_choice_version else e.discovery_choice_version end,
  e.kind,c.channel_id,c.channel_name,c.summary,
  null::text,null::text,null::timestamptz
 from eligible e left join lateral (
  select r.* from private.reminder_discovery_channels r
  where e.kind='discovery' and r.learning_language=e.learning_language
   and not exists(select 1 from public.reminder_channel_follows f
     where f.user_id=e.user_id and f.channel_id=r.channel_id)
   and not exists(select 1 from private.reminder_deliveries d where d.user_id=e.user_id
     and d.email_type='discovery' and d.channel_id=r.channel_id and d.may_have_sent
     and d.send_started_at>e.due-interval '90 days')
  order by md5(e.user_id::text||r.channel_id),r.channel_id limit 1
 ) c on true
 where e.kind='streak' or (e.kind='discovery' and c.channel_id is not null)
$$;

create or replace function private.typed_reminder_delivery_is_current(p_delivery_id uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.reminder_deliveries d
 join public.reminder_preferences p on p.user_id=d.user_id
 join public.reminder_eligibility_snapshots s on s.user_id=d.user_id
 join private.reminder_delivery_control ctl on ctl.singleton
 where d.id=p_delivery_id and d.email_type is not null and p_at is not null
 and p_at>=d.scheduled_for and p_at<d.scheduled_for+interval '1 hour'
 and (p_at at time zone d.timezone)::date=d.scheduled_local_date
 and (ctl.admission_mode='public' or exists(select 1 from private.reminder_delivery_testers t where t.user_id=d.user_id))
 and public.reminder_type_enrolled(d.user_id,d.email_type)
 and p.enrollment_epoch=d.enrollment_epoch
 and (case d.email_type when 'streak' then p.streak_choice_version else p.discovery_choice_version end)=d.choice_version
 and private.reminder_projection_matches_head(d.user_id)
 and s.timezone=d.timezone and s.locale=d.locale and p.timezone=d.timezone
 and not exists(select 1 from private.reminder_deliveries previous where previous.user_id=d.user_id
   and previous.id<>d.id and previous.may_have_sent and previous.send_started_at>p_at-interval '24 hours')
 and ((d.email_type='streak' and private.reminder_study_points(d.user_id,d.scheduled_local_date-1)>=private.reminder_study_threshold()
   and coalesce(private.reminder_study_points(d.user_id,d.scheduled_local_date),0)<private.reminder_study_threshold())
 or (d.email_type='discovery'
   and not(public.reminder_type_enrolled(d.user_id,'streak')
     and private.reminder_study_points(d.user_id,d.scheduled_local_date-1)>=private.reminder_study_threshold()
     and coalesce(private.reminder_study_points(d.user_id,d.scheduled_local_date),0)<private.reminder_study_threshold())
   and s.learning_language=d.learning_language
   and s.relevant_activity_at>=p_at-interval '30 days'
   and exists(select 1 from private.reminder_discovery_channels r where r.channel_id=d.channel_id
     and r.learning_language=d.learning_language and r.channel_name=d.channel_name and r.summary=d.channel_summary)
   and not exists(select 1 from public.reminder_channel_follows f where f.user_id=d.user_id and f.channel_id=d.channel_id)
   and not exists(select 1 from private.reminder_deliveries previous where previous.user_id=d.user_id
     and previous.id<>d.id and previous.email_type='discovery' and previous.may_have_sent
     and ((previous.scheduled_local_date>d.scheduled_local_date-7)
       or (previous.channel_id=d.channel_id and previous.send_started_at>p_at-interval '90 days'))))))
$$;

-- Preview has no inserts/claims/leases/admissions. A dry-run cannot consume a
-- real owner/local-date occurrence. It returns aggregate counts, never PII.
create function public.evaluate_reminder_shadow(p_now timestamptz default now())
returns table(email_type text,candidate_count bigint)
language sql stable security definer set search_path='' as $$
 select c.email_type,count(*) from private.reminder_candidates((p_now at time zone 'UTC')::date,p_now) c
 where c.scheduled_for<=p_now and c.scheduled_for>p_now-interval '1 hour'
 group by c.email_type order by c.email_type
$$;

create function public.plan_typed_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare v_day date := (p_now at time zone 'UTC')::date; v_count integer; v_slots integer; v_replanned uuid;
begin
 if p_now is null then raise exception 'reminder_now_required'; end if;
 perform 1 from private.reminder_delivery_control where singleton and delivery_enabled for share;
 if not found then return 0; end if;
 -- All admissions and quota reservations serialize on one tiny control row.
 -- Candidate ranking includes every timezone window in this UTC day, before
 -- due work is selected, avoiding first-come starvation of later timezones.
 perform 1 from private.reminder_free_capacity where singleton for update;
 insert into private.reminder_deliveries(user_id,scheduled_local_date,scheduled_local_time,
 scheduled_for,timezone,locale,consent_version,consent_granted_at,email_type,learning_language,
 channel_id,channel_name,channel_summary,video_id,video_title,video_published_at,
 eligibility_snapshot_updated_at,enrollment_epoch,choice_version)
 select c.user_id,c.local_date,time '19:00',c.scheduled_for,c.timezone,c.locale,c.consent_version,
 c.consent_granted_at,c.email_type,c.learning_language,c.channel_id,c.channel_name,c.channel_summary,
 c.video_id,c.video_title,c.video_published_at,c.snapshot_updated_at,c.enrollment_epoch,c.choice_version
 from private.reminder_candidates(v_day,p_now) c
 on conflict on constraint reminder_deliveries_user_local_date_key do nothing;
 get diagnostics v_count=row_count;
 -- A later accepted study head can make streak protection take priority
 -- over an earlier planned discovery. Replace only before provider-begin,
 -- retire the old claim token, and discard never-used payload bindings.
 for v_replanned in
  update private.reminder_deliveries d set email_type=c.email_type,
   channel_id=c.channel_id,channel_name=c.channel_name,channel_summary=c.channel_summary,
   video_id=c.video_id,video_title=c.video_title,video_published_at=c.video_published_at,
   choice_version=c.choice_version,eligibility_snapshot_updated_at=c.snapshot_updated_at,
   status='pending',claim_token=null,lease_expires_at=null,updated_at=p_now
  from private.reminder_candidates(v_day,p_now) c where d.user_id=c.user_id
   and d.scheduled_local_date=c.local_date and d.email_type='discovery' and c.email_type='streak'
   and d.status in ('pending','claimed') and d.send_started_at is null
   and d.enrollment_epoch=c.enrollment_epoch
  returning d.id
 loop
  delete from private.reminder_payload_bindings where delivery_id=v_replanned;
 end loop;
 update private.reminder_deliveries d set status=case when d.send_started_at is null then 'suppressed' else 'outcome_ambiguous' end,
  suppressed_at=case when d.send_started_at is null then p_now else null end,
  outcome_ambiguous_at=case when d.send_started_at is not null then p_now else null end,
  claim_token=null,lease_expires_at=null,skip_reason='window_expired',updated_at=p_now
 where d.email_type is not null and d.status in ('pending','claimed')
  and d.scheduled_for+interval '1 hour'<=p_now;
 update private.reminder_deliveries d set status='suppressed',suppressed_at=p_now,
  claim_token=null,lease_expires_at=null,skip_reason='eligibility_changed',updated_at=p_now
 where d.email_type is not null and d.send_started_at is null and d.status in ('pending','claimed')
  and d.scheduled_for<=p_now and d.scheduled_for+interval '1 hour'>p_now
  and not private.typed_reminder_delivery_is_current(d.id,p_now);
 insert into private.reminder_dispatch_skips(user_id,local_date,reason,observed_at)
 select d.user_id,d.scheduled_local_date,'window_expired',p_now from private.reminder_deliveries d
 where d.skip_reason='window_expired' on conflict do nothing;
 -- Explicitly release unused admission tokens only for occurrences for which
 -- no provider-begin ever succeeded. Expired leases alone release nothing.
 update private.reminder_capacity_admissions a set released_at=p_now
 from private.reminder_deliveries d where a.delivery_id=d.id and a.released_at is null
 and d.send_started_at is null and d.status='suppressed';
 -- Re-elect unstarted tokens whenever shared traffic changes. Otherwise a
 -- pool admitted against an earlier larger budget would revert to due-time
 -- first-come dispatch after Auth consumes that budget. Provider-begin checks
 -- the active token again. Leases alone never release consumed reservations.
 update private.reminder_capacity_admissions a set released_at=p_now
 from private.reminder_deliveries d where a.delivery_id=d.id and a.utc_date=v_day
  and a.released_at is null and d.send_started_at is null;
 v_slots:=greatest(0,least(
  60-(select count(*) from private.reminder_capacity_admissions a where a.utc_date=v_day and a.released_at is null),
  private.reminder_capacity_slots(p_now)));
 if private.reminder_capacity_reason(p_now)='available' then
  insert into private.reminder_capacity_admissions(delivery_id,user_id,utc_date,admitted_at)
  select d.id,d.user_id,v_day,p_now from private.reminder_deliveries d
  where (d.scheduled_for at time zone 'UTC')::date=v_day
   and d.send_started_at is null and d.status in ('pending','claimed')
   and d.scheduled_for+interval '1 hour'>p_now
   and exists(select 1 from private.reminder_candidates(v_day,p_now) c where c.user_id=d.user_id
     and c.local_date=d.scheduled_local_date and c.email_type=d.email_type)
  order by (select max(a.admitted_at) from private.reminder_capacity_admissions a
    where a.user_id=d.user_id and a.utc_date<v_day) nulls first,
   (select max(pr.send_started_at) from private.reminder_deliveries pr
    where pr.user_id=d.user_id and pr.may_have_sent) nulls first,
   md5(d.user_id::text),d.id limit v_slots
  on conflict(user_id,utc_date) do update set delivery_id=excluded.delivery_id,released_at=null;
 end if;
 insert into private.reminder_dispatch_skips(user_id,local_date,reason,observed_at)
 select d.user_id,d.scheduled_local_date,
  case when private.reminder_capacity_reason(p_now)='available' then 'capacity_not_admitted'
    else private.reminder_capacity_reason(p_now) end,p_now
 from private.reminder_deliveries d where d.status='pending' and d.scheduled_for<=p_now
 and not exists(select 1 from private.reminder_capacity_admissions a where a.delivery_id=d.id and a.released_at is null)
 on conflict do nothing;
 return v_count;
end $$;

create or replace function public.claim_due_typed_reminder_live(
 p_now timestamptz default now(),p_batch_size integer default 10,
 p_due_window_seconds integer default 3600,p_lease_seconds integer default 300
) returns table(delivery_id uuid,claim_token uuid,user_id uuid,scheduled_local_date date,
 scheduled_for timestamptz,timezone text,locale text,consent_version text,attempt_count integer,
 email_type text,learning_language text,channel_id text,channel_name text,channel_summary text,
 video_id text,video_title text,video_published_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if p_now is null or p_batch_size is null or p_batch_size not between 1 and 10
 or p_due_window_seconds is null or p_due_window_seconds not between 60 and 3600
 or p_lease_seconds is null or p_lease_seconds not between 60 and 300
 then raise exception 'reminder_claim_bounds'; end if;
 if not public.reminder_delivery_is_enabled() then raise exception 'reminder_delivery_disabled'; end if;
 perform public.plan_typed_reminders(p_now);
 return query with candidates as materialized (
  select d.id from private.reminder_deliveries d
  join private.reminder_capacity_admissions a on a.delivery_id=d.id and a.released_at is null
  where d.email_type is not null and d.scheduled_for<=p_now
   and d.scheduled_for>p_now-make_interval(secs=>p_due_window_seconds)
   and ((d.send_started_at is not null and private.reminder_capacity_slots(p_now,d.id)>0)
     or (d.send_started_at is null and private.reminder_capacity_reason(p_now)='available'))
   and (d.next_attempt_at is null or d.next_attempt_at<=p_now)
   and (d.status='pending' or(d.status='claimed' and d.lease_expires_at<=p_now))
   and (d.send_started_at is null or d.send_retry_deadline>p_now)
   and private.typed_reminder_delivery_is_current(d.id,p_now)
  order by d.scheduled_for,d.id for update of d skip locked limit p_batch_size
 ), claimed as(
  update private.reminder_deliveries d set status='claimed',claim_token=gen_random_uuid(),
   lease_expires_at=p_now+make_interval(secs=>p_lease_seconds),attempt_count=d.attempt_count+1,
   last_claimed_at=p_now,updated_at=p_now from candidates c where c.id=d.id returning d.*
 ) select c.id,c.claim_token,c.user_id,c.scheduled_local_date,c.scheduled_for,c.timezone,c.locale,
 c.consent_version,c.attempt_count,c.email_type,c.learning_language,c.channel_id,c.channel_name,
 c.channel_summary,c.video_id,c.video_title,c.video_published_at from claimed c order by c.scheduled_for,c.id;
end $$;

create function public.bind_reminder_payload(p_claim_token uuid,p_recipient_digest bytea,
 p_sender_digest bytea,p_payload_digest bytea,p_template_version text,p_unsubscribe_key_version text,
 p_api_key_digest bytea,p_admission_mode text,
 p_at timestamptz default now()) returns boolean
language plpgsql security definer set search_path='' as $$
declare d private.reminder_deliveries; b private.reminder_payload_bindings;
begin
 if p_at is null or octet_length(p_recipient_digest)<>32 or octet_length(p_sender_digest)<>32
 or octet_length(p_payload_digest)<>32 or p_template_version is null or p_unsubscribe_key_version is null
 or p_api_key_digest is null or octet_length(p_api_key_digest)<>32
 or p_admission_mode is null or p_admission_mode not in ('canary','public')
 then return false; end if;
 select * into d from private.reminder_deliveries where claim_token=p_claim_token for update;
 if not found or d.status<>'claimed' or d.lease_expires_at<=p_at
  or not private.typed_reminder_delivery_is_current(d.id,p_at) then return false; end if;
 select * into b from private.reminder_payload_bindings where delivery_id=d.id;
 if found then return b.recipient_digest=p_recipient_digest and b.sender_digest=p_sender_digest
  and b.payload_digest=p_payload_digest and b.template_version=p_template_version
  and b.unsubscribe_key_version=p_unsubscribe_key_version
  and b.api_key_digest=p_api_key_digest and b.admission_mode=p_admission_mode; end if;
 if d.send_started_at is not null then return false; end if;
 insert into private.reminder_payload_bindings values(d.id,p_recipient_digest,p_sender_digest,
  p_payload_digest,p_template_version,p_unsubscribe_key_version,p_at,p_api_key_digest,p_admission_mode);
 return true;
end $$;

create function private.reserve_reminder_capacity(p_delivery_id uuid,p_at timestamptz)
returns boolean language plpgsql set search_path='' as $$
declare v_day date:=(p_at at time zone 'UTC')::date;
begin
 perform 1 from private.reminder_free_capacity where singleton for update;
 if exists(select 1 from private.reminder_quota_reservations q where q.delivery_id=p_delivery_id
  and q.utc_date=v_day and q.released_at is null) then
  -- Ignore precisely this existing reservation, retain all competing slots
  -- and provider-wide Auth/shared usage, and require fresh account evidence.
  return private.reminder_capacity_slots(p_at,p_delivery_id)>0;
 end if;
 if private.reminder_capacity_reason(p_at) is distinct from 'available' then return false; end if;
 insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at)
 values(p_delivery_id,v_day,p_at) on conflict(delivery_id,utc_date) do update
 set released_at=null,reserved_at=p_at where private.reminder_quota_reservations.consumed_at is null;
 return found;
end $$;

create function public.release_unstarted_reminder_capacity(p_delivery_id uuid,p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.reminder_free_capacity where singleton for update;
 perform 1 from private.reminder_deliveries d where d.id=p_delivery_id
  and d.send_started_at is null and d.status in ('suppressed','permanent_failure') for update;
 if not found then return false; end if;
 update private.reminder_quota_reservations set released_at=p_at
 where delivery_id=p_delivery_id and consumed_at is null and released_at is null;
 return found;
end $$;

-- The delivery row serializes first insertion. A retry only reads the
-- immutable token digest: taking its row lock here would invert unsubscribe's
-- token -> preference -> delivery order and deadlock a real retry/opt-out race.
create or replace function public.store_typed_reminder_unsubscribe_token(
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
  where token.delivery_id = p_delivery_id;

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

create or replace function public.begin_typed_reminder_provider_attempt(
 p_claim_token uuid,p_provider_name text,p_started_at timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid; d private.reminder_deliveries; b private.reminder_payload_bindings; v_email text;
begin
 if p_started_at is null or p_provider_name is distinct from 'resend' then return false; end if;
 select x.user_id into v_user from private.reminder_deliveries x where x.claim_token=p_claim_token;
 if not found then return false; end if;
 -- The accepted-progress writer takes this same owner lock. No new progress,
 -- reset, enrollment or suppression can pass the final check concurrently.
 select lower(btrim(u.email)) into v_email from auth.users u where u.id=v_user
  and u.email_confirmed_at is not null and u.deleted_at is null for update;
 if not found then return false; end if;
 perform 1 from public.reminder_preferences where user_id=v_user for share;
 perform 1 from private.reminder_free_capacity where singleton for update;
 select * into d from private.reminder_deliveries where claim_token=p_claim_token for update;
 if not found or d.status<>'claimed' or d.lease_expires_at<=p_started_at
  or d.next_attempt_at>p_started_at
  or not public.reminder_delivery_is_enabled()
  or not private.typed_reminder_delivery_is_current(d.id,p_started_at)
  or not exists(select 1 from private.reminder_capacity_admissions a where a.delivery_id=d.id and a.released_at is null)
  or (d.send_started_at is not null and (d.provider_name<>p_provider_name
    or d.send_retry_deadline<=p_started_at)) then return false; end if;
 select * into b from private.reminder_payload_bindings where delivery_id=d.id;
 if not found or b.recipient_digest<>extensions.digest(v_email,'sha256')
  or not exists(select 1 from private.reminder_free_capacity c where c.singleton
    and c.sender_digest=b.sender_digest and c.api_key_digest=b.api_key_digest)
  or not exists(select 1 from private.reminder_delivery_control ctl where ctl.singleton
    and ctl.admission_mode=b.admission_mode) then return false; end if;
 if private.reserve_reminder_capacity(d.id,p_started_at) is distinct from true then return false; end if;
 update private.reminder_quota_reservations set consumed_at=coalesce(consumed_at,p_started_at)
 where delivery_id=d.id and utc_date=(p_started_at at time zone 'UTC')::date and released_at is null;
 update private.reminder_deliveries set provider_name=p_provider_name,
 send_started_at=coalesce(send_started_at,p_started_at),
 send_retry_deadline=coalesce(send_retry_deadline,p_started_at+interval '23 hours'),
 may_have_sent=true,provider_attempt_count=provider_attempt_count+1,updated_at=p_started_at
 where id=d.id;
 return true;
end $$;

create function public.defer_typed_reminder(p_claim_token uuid,p_retry_after_seconds integer,
 p_definitive_no_send boolean default false,p_stop_capacity boolean default false,
 p_at timestamptz default now()) returns boolean
language plpgsql security definer set search_path='' as $$
declare d private.reminder_deliveries; v_next timestamptz;
begin
 if p_at is null or p_retry_after_seconds is null or p_retry_after_seconds not between 1 and 86400
 then return false; end if;
 perform 1 from private.reminder_free_capacity where singleton for update;
 select * into d from private.reminder_deliveries where claim_token=p_claim_token for update;
 if not found or d.status<>'claimed' or d.send_started_at is null then return false; end if;
 v_next:=p_at+make_interval(secs=>p_retry_after_seconds);
 update private.reminder_deliveries set next_attempt_at=v_next,
 lease_expires_at=least(v_next,scheduled_for+interval '1 hour'),
 may_have_sent=case when p_definitive_no_send and provider_attempt_count=1 then false else may_have_sent end,
 updated_at=p_at where id=d.id;
 if p_stop_capacity then update private.reminder_free_capacity set stop_reason='provider_quota' where singleton; end if;
 return true;
end $$;

create function public.complete_typed_reminder_rejection(p_claim_token uuid,p_failure_code text,
 p_definitive_no_send boolean,p_at timestamptz default now()) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_done boolean; v_delivery uuid;
begin
 select id into v_delivery from private.reminder_deliveries where claim_token=p_claim_token for update;
 if not found then return false; end if;
 if not p_definitive_no_send then
  update private.reminder_deliveries set status='outcome_ambiguous',claim_token=null,
   lease_expires_at=null,outcome_ambiguous_at=p_at,updated_at=p_at
  where id=v_delivery and status='claimed' and send_started_at is not null;
  return found;
 end if;
 v_done:=public.complete_reminder_provider_failure(p_claim_token,'resend',p_failure_code,p_at);
 -- A definite rejection on the first attempt releases discovery exclusions,
 -- never the consumed quota; uncertain earlier attempts remain conservative.
 if v_done and p_definitive_no_send then
  update private.reminder_deliveries set may_have_sent=false
  where id=v_delivery and provider_attempt_count=1;
 end if;
 return v_done;
end $$;

-- Retire mutating dry-run entry points. Existing delivery rows are retained;
-- the replacement read-only shadow evaluator never creates an occurrence.
revoke execute on function public.claim_due_typed_reminder_dry_runs(timestamptz,integer,integer,integer)
 from public,anon,authenticated,service_role;
revoke execute on function public.complete_typed_reminder_dry_run(uuid,timestamptz)
 from public,anon,authenticated,service_role;
-- Retired generic schedule live RPCs cannot bypass enrollment/quota fencing.
revoke execute on function public.claim_due_reminder_deliveries(timestamptz,integer,integer,integer,text)
 from public,anon,authenticated,service_role;
revoke execute on function public.begin_reminder_provider_attempt(uuid,text,timestamptz)
 from public,anon,authenticated,service_role;

revoke all on function private.reminder_capacity_slots(timestamptz,uuid),
 private.reminder_capacity_reason(timestamptz),
 private.reminder_candidates(date,timestamptz),private.reserve_reminder_capacity(uuid,timestamptz)
 from public,anon,authenticated,service_role;
revoke all on function public.record_reminder_free_capacity(boolean,boolean,boolean,integer,integer,timestamptz,bytea,bytea,uuid[]),
 public.reminder_provider_attestation_is_current(bytea,bytea,timestamptz,text),
 public.refresh_reminder_provider_usage(bytea,bytea,integer,integer,timestamptz),
 public.reminder_capacity_status(timestamptz),public.evaluate_reminder_shadow(timestamptz),
 public.plan_typed_reminders(timestamptz),public.bind_reminder_payload(uuid,bytea,bytea,bytea,text,text,bytea,text,timestamptz),
 public.defer_typed_reminder(uuid,integer,boolean,boolean,timestamptz),
 public.release_unstarted_reminder_capacity(uuid,timestamptz),
 public.complete_typed_reminder_rejection(uuid,text,boolean,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.record_reminder_free_capacity(boolean,boolean,boolean,integer,integer,timestamptz,bytea,bytea,uuid[]),
 public.reminder_provider_attestation_is_current(bytea,bytea,timestamptz,text),
 public.refresh_reminder_provider_usage(bytea,bytea,integer,integer,timestamptz),
 public.reminder_capacity_status(timestamptz),public.evaluate_reminder_shadow(timestamptz),
 public.plan_typed_reminders(timestamptz),public.bind_reminder_payload(uuid,bytea,bytea,bytea,text,text,bytea,text,timestamptz),
 public.defer_typed_reminder(uuid,integer,boolean,boolean,timestamptz),
 public.release_unstarted_reminder_capacity(uuid,timestamptz),
 public.complete_typed_reminder_rejection(uuid,text,boolean,timestamptz)
 to service_role;
