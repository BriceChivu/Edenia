begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
\ir helpers/reminder_521_fixtures.sql
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
select ok(not has_table_privilege('authenticated','private.reminder_free_capacity','select'),'billing evidence is private');
select ok(not has_function_privilege('authenticated','public.record_reminder_free_capacity(boolean,boolean,boolean,integer,integer,timestamptz,bytea,bytea,uuid[])','execute'),'browser cannot attest a plan');
select ok(not has_function_privilege('authenticated','public.bind_reminder_payload(uuid,bytea,bytea,bytea,text,text,bytea,text,timestamptz)','execute'),'browser cannot bind delivery payloads');
select ok(not has_function_privilege('authenticated','public.plan_typed_reminders(timestamptz)','execute'),'browser cannot materialize email work');
select is(private.reminder_capacity_reason('2026-10-26T11:00:00Z'),'capacity_unknown','unknown Free account/usage fails closed');
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'available','fresh Free account and shared usage allow bounded optional mail');
select ok(public.reminder_provider_attestation_is_current(extensions.digest('re_test_key_1234567890','sha256'),extensions.digest('Edenia <reminders@example.test>','sha256'),'2026-10-26T11:01:00Z','canary'),'canaryenvironment matches explicit database admissionmode');
select ok(not public.reminder_provider_attestation_is_current(extensions.digest('re_test_key_1234567890','sha256'),extensions.digest('Edenia <reminders@example.test>','sha256'),'2026-10-26T11:01:00Z','public'),'publicenvironment cannot bypass database canary exactrecipient gate');
select is(private.reminder_capacity_reason('2026-10-26T11:10:01Z'),'capacity_unknown','usage expires after ten minutes');
select is(private.reminder_capacity_reason('2026-10-26T10:59:59Z'),'capacity_unknown','future usage observation is not accepted evidence');
select pg_temp.email_capacity('2026-10-26T11:00:00Z',60,0);
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'capacity_exhausted','Auth and other shared daily traffic stop optional mail early');
select pg_temp.email_capacity('2026-10-26T11:00:00Z',0,1800);
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'capacity_exhausted','shared monthly traffic preserves conservative Auth headroom');
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
update private.reminder_free_capacity set overage_disabled=false;
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'capacity_unknown','unknown or enabled overage is never a purchase fallback');
update private.reminder_free_capacity set overage_disabled=true;
select ok(not public.refresh_reminder_provider_usage(decode(repeat('00',32),'hex'),extensions.digest('Edenia <reminders@example.test>','sha256'),0,0,'2026-10-26T11:01:00Z'),'usage from a different key cannot borrow another account attestation');
select ok(not public.refresh_reminder_provider_usage(extensions.digest('re_test_key_1234567890','sha256'),decode(repeat('00',32),'hex'),0,0,'2026-10-26T11:01:00Z'),'a different sender cannot borrow verified-domain evidence');
update private.reminder_free_capacity set attested_at='2026-10-25T10:59:59Z';
select ok(not public.refresh_reminder_provider_usage(extensions.digest('re_test_key_1234567890','sha256'),extensions.digest('Edenia <reminders@example.test>','sha256'),0,0,'2026-10-26T11:01:00Z'),'live usage readback cannot renew expired billing attestation');
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
-- Rolling quota includes prior calendar months and uncertain attempts.
insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at,consumed_at)
select extensions.gen_random_uuid(),'2026-09-26','2026-09-26T11:01:00Z','2026-09-26T11:01:00Z' from generate_series(1,1800);
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'capacity_exhausted','rolling31 cap includes previous month uncertain sends');
update private.reminder_quota_reservations set reserved_at='2026-09-25T11:01:00Z';
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'available','exactly31day-old reservations expire from rolling cap');
delete from private.reminder_quota_reservations;
update private.reminder_free_capacity set observed_at=null;
select pg_temp.email_capacity('2026-10-25T23:59:00Z');
select ok(private.reserve_reminder_capacity('52130000-0000-4000-8000-000000000099','2026-10-25T23:59:00Z'),'first quota period reserves capacity');
select ok(private.reserve_reminder_capacity('52130000-0000-4000-8000-000000000099','2026-10-25T23:59:30Z'),'same period reuses capacity');
select pg_temp.email_capacity('2026-10-26T00:01:00Z');
select ok(private.reserve_reminder_capacity('52130000-0000-4000-8000-000000000099','2026-10-26T00:01:00Z'),'a retry crossingUTCmidnight acquires newday capacity');
select is((select count(*) from private.reminder_quota_reservations),2::bigint,'one occurrence uses one reservation per quota period');
delete from private.reminder_quota_reservations;
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
-- Qualification boundaries use accepted Anki facts, not uploaded totals.
select pg_temp.email_fixture(('52130000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Asia/Taipei','2026-10-26',xp,10,true,false)
from (values(1,0),(2,4),(3,5),(4,9),(5,10),(6,11)) v(n,xp);
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-26T11:00:00Z');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),4::bigint,'0/4/5/9 qualify for reminder;10/11already protect the day');
update private.reminder_delivery_control set delivery_enabled=true;
create temporary table final_slot_claims as select * from public.claim_due_typed_reminder_live('2026-10-26T11:00:00Z',10,3600,300);
select is((select count(*) from final_slot_claims),4::bigint,'live planning can claim all four accepted below-threshold owners');
select pg_temp.bind_email(claim_token,'2026-10-26T11:00:00Z') from final_slot_claims;
insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at,consumed_at)
select extensions.gen_random_uuid(),'2026-10-26','2026-10-26T10:59:00Z','2026-10-26T10:59:00Z' from generate_series(1,59);
select is((select count(*) from final_slot_claims where public.begin_typed_reminder_provider_attempt(claim_token,'resend','2026-10-26T11:00:00Z')),1::bigint,'atomic final-slot admission allows exactly one of four competing attempts');
select is((select count(*) from private.reminder_quota_reservations where utc_date='2026-10-26'),60::bigint,'atomic reservation never overshoots daily60cap');
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'capacity_exhausted','unknown outcomes retain all sixty consumed slots');
-- Deleting a learner cannot recover capacity that may already be billed.
delete from auth.users where id=(select user_id from private.reminder_deliveries where send_started_at is not null limit 1);
select is((select count(*) from private.reminder_quota_reservations),60::bigint,'account deletion preserves provider usage reservations');
delete from private.reminder_free_capacity;
select is(private.reminder_capacity_reason('2026-10-26T11:01:00Z'),'capacity_unknown','missingcontrolrow is unknown rather than SQLNULLfailopen');
select ok(not private.reserve_reminder_capacity('52130000-0000-4000-8000-000000000099','2026-10-26T11:01:00Z'),'missingcontrolrow cannot mint capacity');
select * from finish();
rollback;
