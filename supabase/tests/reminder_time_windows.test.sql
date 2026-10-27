begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
\ir helpers/reminder_521_fixtures.sql
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
create temporary table window_cases(n int,zone text,day date,due timestamptz);
insert into window_cases values
 (1,'America/Los_Angeles','2026-03-07','2026-03-08T03:00:00Z'),
 (2,'America/Los_Angeles','2026-03-08','2026-03-09T02:00:00Z'),
 (3,'America/Los_Angeles','2026-10-31','2026-11-01T02:00:00Z'),
 (4,'America/Los_Angeles','2026-11-01','2026-11-02T03:00:00Z'),
 (5,'Asia/Kathmandu','2026-10-25','2026-10-25T13:15:00Z'),
 (6,'Australia/Adelaide','2026-10-25','2026-10-25T08:30:00Z'),
 (7,'Pacific/Chatham','2026-10-25','2026-10-25T05:15:00Z'),
 (8,'Pacific/Kiritimati','2026-10-25','2026-10-25T05:00:00Z');
select pg_temp.email_fixture(('52177000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,zone,day,9,10,true,false) from window_cases;
select private.refresh_reminder_eligibility(('52177000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,due) from window_cases;
select is((select c.scheduled_for from private.reminder_candidates((w.due at time zone 'UTC')::date,w.due) c
 where c.user_id=('52177000-0000-4000-8000-'||lpad(w.n::text,12,'0'))::uuid),w.due,
 '19:00 local is exact across DST/half/quarter-hour/extreme offsets: '||w.zone||' '||w.day) from window_cases w;
select ok(not exists(select 1 from private.reminder_candidates((w.due at time zone 'UTC')::date,w.due) c
 where c.user_id=('52177000-0000-4000-8000-'||lpad(w.n::text,12,'0'))::uuid
 and c.scheduled_for<=w.due-interval '1 microsecond'),
 'no send before the exact local due boundary: '||w.zone||' '||w.day) from window_cases w;
select throws_ok($$select * from public.claim_due_typed_reminder_live(now(),0,3600,300)$$,'P0001','reminder_claim_bounds','zero batch is rejected');
select throws_ok($$select * from public.claim_due_typed_reminder_live(now(),11,3600,300)$$,'P0001','reminder_claim_bounds','batch above ten is rejected');
select throws_ok($$select * from public.claim_due_typed_reminder_live(now(),1,3601,300)$$,'P0001','reminder_claim_bounds','catch-up window cannot exceed one hour');
update private.reminder_delivery_control set delivery_enabled=true;
select public.plan_typed_reminders('2026-10-25T14:16:00Z');
select is((select status from private.reminder_deliveries where user_id='52177000-0000-4000-8000-000000000005'),'suppressed','outage beyond the due window expires the occurrence');
select is((select reason from private.reminder_dispatch_skips where user_id='52177000-0000-4000-8000-000000000005'),'window_expired','outage has a durable operator reason');
select is((select count(*) from private.reminder_quota_reservations),0::bigint,'outage skips consume no quota');
select public.plan_typed_reminders('2026-10-26T14:16:00Z');
select is((select count(*) from private.reminder_deliveries where user_id='52177000-0000-4000-8000-000000000005'),1::bigint,'next day never creates a replacement for the missed reminder');
select * from finish();
rollback;
