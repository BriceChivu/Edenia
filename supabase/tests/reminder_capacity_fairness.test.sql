begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
\ir helpers/reminder_521_fixtures.sql
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
update private.reminder_delivery_control set delivery_enabled=true,admission_mode='public';
create function pg_temp.email_next_day(p_user uuid,p_day date) returns void language plpgsql as $$
declare profile jsonb; v_status text;
begin
 select v.envelope->'profile' into profile from public.learner_profile_heads h
 join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=p_user;
 profile:=jsonb_set(profile,'{anki}',coalesce(profile->'anki','{}'::jsonb)||jsonb_build_object(
  (p_day-1)::text,jsonb_build_object('created',0,'reviewed',10,'experienceReviews',10,'experienceWatermark',10,'observedAt',(p_day-1)::text||'T10:00:00.000Z'),
  p_day::text,jsonb_build_object('created',0,'reviewed',9,'experienceReviews',9,'experienceWatermark',9,'observedAt',p_day::text||'T10:00:00.000Z')));
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 update public.learner_profile_heads set updated_at=now()-interval '40 seconds' where user_id=p_user;
 select r.status into v_status from public.learner_profile_heads h cross join lateral public.commit_my_learner_profile(
 extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,private.make_current_profile_envelope(profile,p_day::text||'T10:00:00.000Z')) r where h.user_id=p_user;
 if v_status<>'accepted' then raise exception 'fixture commit was not accepted'; end if;
end $$;
create temporary table fair_owners as select
 ('52140000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid as id,
 case when n<=40 then 'Asia/Taipei' when n<=80 then 'America/Los_Angeles' else 'Pacific/Honolulu' end as zone
 from generate_series(1,120) n;
select pg_temp.email_fixture(id,zone,('2026-10-23T00:00:00Z'::timestamptz at time zone zone)::date,9,10,true,false) from fair_owners;
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-23T00:00:00Z');
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-23T00:00:00Z');
select pg_temp.email_capacity('2026-10-23T00:00:00Z');
select public.plan_typed_reminders('2026-10-23T00:00:00Z');
select is((select count(*) from private.reminder_deliveries),120::bigint,'planner considers all120known windows before choosing due work');
select is((select count(*) from private.reminder_capacity_admissions where utc_date='2026-10-23' and released_at is null),60::bigint,'daily admission cap covers at most60known recipients');
select is((select count(distinct f.zone) from private.reminder_capacity_admissions a join fair_owners f on f.id=a.user_id),3::bigint,'first daily tokens include later timezone windows');
select public.plan_typed_reminders('2026-10-23T00:05:00Z');
select is((select count(*) from private.reminder_capacity_admissions where utc_date='2026-10-23' and released_at is null),60::bigint,'overlapping/repeated planning cannot mint extra daily tokens');
select pg_temp.email_capacity('2026-10-23T00:05:01Z',59,59);
select public.plan_typed_reminders('2026-10-23T00:05:01Z');
select is((select count(*) from private.reminder_capacity_admissions where utc_date='2026-10-23' and released_at is null),1::bigint,'rising Authusage shrinks an earlier60token pool to its actualone remaining slot');
select is((select user_id from private.reminder_capacity_admissions where utc_date='2026-10-23' and released_at is null),
 (select id from fair_owners order by md5(id::text) limit 1),'shrunkpool selects globally before duewindows and retains deterministic fairrank');
select pg_temp.email_capacity('2026-10-23T00:06:00Z');
select public.plan_typed_reminders('2026-10-23T00:06:00Z');
select pg_temp.email_next_day(id,('2026-10-24T00:00:00Z'::timestamptz at time zone zone)::date) from fair_owners;
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-24T00:00:00Z');
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-24T00:00:00Z');
select pg_temp.email_capacity('2026-10-24T00:00:00Z');
select public.plan_typed_reminders('2026-10-24T00:00:00Z');
select is((select count(*) from private.reminder_capacity_admissions where utc_date='2026-10-24' and released_at is null),60::bigint,'nextUTCdaygets60rotating admissiontokens');
select is((select count(distinct user_id) from private.reminder_capacity_admissions),120::bigint,'all120eligible owners gain admission within two days');
select is((select count(*) from private.reminder_capacity_admissions a join private.reminder_capacity_admissions b using(user_id)
 where a.utc_date='2026-10-23' and b.utc_date='2026-10-24'),0::bigint,'previously unadmitted recipients precede recentadmissions');
select is((select count(*) from private.reminder_quota_reservations),0::bigint,'fair capacity skips/admissions consume no provider allowance');
-- Clean transaction-local fairness fixtures for a real60recipient throughput run.
delete from auth.users where id in(select id from fair_owners);
-- Under heavy Auth traffic only one optional slot is available each day.
-- Admission, rather than due-time ordering, must rotate that scarce slot.
update private.reminder_free_capacity set observed_at=null;
create temporary table scarce_owners as select ('52142000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid as id,
 case n when 1 then 'Asia/Taipei' when 2 then 'America/Los_Angeles' else 'Pacific/Honolulu' end as zone from generate_series(1,3) n;
select pg_temp.email_fixture(id,zone,('2026-10-15T00:00:00Z'::timestamptz at time zone zone)::date,9,10,true,false) from scarce_owners;
do $$ declare day_offset integer; at_time timestamptz; o record;
begin
 for day_offset in 0..2 loop
  at_time:='2026-10-15T00:00:00Z'::timestamptz+make_interval(days=>day_offset);
  if day_offset>0 then for o in select * from scarce_owners loop
   perform pg_temp.email_next_day(o.id,(at_time at time zone o.zone)::date);
  end loop; end if;
  perform public.refresh_reminder_eligibility_snapshots(100,at_time);
  perform pg_temp.email_capacity(at_time,59,59);
  perform public.plan_typed_reminders(at_time);
 end loop;
end $$;
select is((select count(*) from private.reminder_capacity_admissions where utc_date between '2026-10-15' and '2026-10-17'),3::bigint,'Authtraffic59leaves exactlyone daily admission, not sixty due-only contenders');
select is((select count(distinct user_id) from private.reminder_capacity_admissions where utc_date between '2026-10-15' and '2026-10-17'),3::bigint,'scarce actualcapacity rotates across all three timezonewindows within threedays');
delete from auth.users where id in(select id from scarce_owners);
select pg_temp.email_fixture(('52141000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Asia/Taipei','2026-10-25',9,10,true,false) from generate_series(1,60) n;
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-25T11:00:00Z');
create temporary table throughput(n integer,attempted integer);
do $$ declare tick integer; c record; sent integer; at_time timestamptz;
begin
 for tick in 0..5 loop
  at_time:='2026-10-25T11:00:00Z'::timestamptz+make_interval(mins=>tick*5);
  -- A fake provider gives exact observedIDs with its aggregate counters. The
  -- reconciliation API counts each accepted email once, retaining all product
  -- reservations, so known accepted traffic is not double-counted.
  perform public.record_reminder_free_capacity(true,true,true,tick*10,tick*10,at_time,
   extensions.digest('re_test_key_1234567890','sha256'),extensions.digest('Edenia <reminders@example.test>','sha256'),
   array(select id from private.reminder_deliveries where provider_accepted_at is not null));
  sent:=0;
  for c in select * from public.claim_due_typed_reminder_live(at_time,10,3600,300) loop
   if not pg_temp.bind_email(c.claim_token,at_time) then raise exception 'fixture payload failed'; end if;
   if not public.begin_typed_reminder_provider_attempt(c.claim_token,'resend',at_time) then raise exception 'fixture final fence failed'; end if;
   if not public.complete_reminder_provider_acceptance(c.claim_token,'resend','fake-'||c.delivery_id::text,at_time) then raise exception 'fixture acceptance failed'; end if;
   sent:=sent+1;
  end loop;
  insert into throughput values(tick,sent);
 end loop;
end $$;
select is((select sum(attempted)::integer from throughput),60,'six5minute ticks deliver60same-timezone fakeprovider acceptances within25minutes');
select is((select min(attempted) from throughput),10,'each tick remains bounded to ten claims');
select is((select count(*) from private.reminder_quota_reservations),60::bigint,'sixty accepted emails retain sixty product reservations');
select is((select count(*) from private.reminder_quota_reservations where provider_observed_at is not null),50::bigint,'reconciliation matches previously observed emails without counting them twice');
select is((select count(*) from public.claim_due_typed_reminder_live('2026-10-25T11:30:00Z')),0::bigint,'no repeatedtick exceeds same-local-date or dailybudget');
select * from finish();
rollback;
