begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
\ir helpers/reminder_521_fixtures.sql
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
update private.reminder_delivery_control set delivery_enabled=true;
select pg_temp.email_fixture(('52150000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Asia/Taipei','2026-10-26',9,10,true,false) from generate_series(1,10) n;
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00:00Z');
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
create temporary table fence_claims as select * from public.claim_due_typed_reminder_live('2026-10-26T11:00:00Z',10,3600,300);
select is((select count(*) from fence_claims),10::bigint,'all fence fixtures begin as real eligible claimed occurrences');
select pg_temp.bind_email(claim_token,'2026-10-26T11:00:00Z') from fence_claims;
update public.reminder_preferences set timezone='UTC' where user_id='52150000-0000-4000-8000-000000000001';
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000001'),'resend','2026-10-26T11:00:01Z'),'travel after claim fences stale19:00schedule');
update auth.users set email='changed-recipient@example.test' where id='52150000-0000-4000-8000-000000000002';
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000002'),'resend','2026-10-26T11:00:01Z'),'verified recipient changed after binding stops provider attempt');
update public.reminder_preferences set streak_enrollment_version=null,enrollment_epoch=enrollment_epoch+1 where user_id='52150000-0000-4000-8000-000000000003';
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000003'),'resend','2026-10-26T11:00:01Z'),'unenrollment after claim fences stale tab');
create temporary table newer_study as select private.make_current_profile_envelope(jsonb_set(v.envelope->'profile','{anki,2026-10-26}',
 '{"created":0,"reviewed":10,"experienceReviews":10,"experienceWatermark":10,"observedAt":"2026-10-26T10:00:00.000Z"}'::jsonb),'2026-10-26T10:00:00.000Z') as envelope
 from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id='52150000-0000-4000-8000-000000000004';
select set_config('request.jwt.claim.sub','52150000-0000-4000-8000-000000000004',true);
update public.learner_profile_heads set updated_at=now()-interval '40 seconds' where user_id='52150000-0000-4000-8000-000000000004';
select is((select r.status from public.learner_profile_heads h cross join newer_study n cross join lateral public.commit_my_learner_profile(
 extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,n.envelope) r where h.user_id='52150000-0000-4000-8000-000000000004'),'accepted','new-device accepted study advances head between claim and send');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000004'),'resend','2026-10-26T11:00:01Z'),'stale accepted revision fences before bounded projection rebuild');
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00:01Z');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000004'),'resend','2026-10-26T11:00:02Z'),'ten accepted XP fences even after current-head projection rebuild');
select public.record_reminder_suppression('52150000-0000-4000-8000-000000000005','complaint','provider_webhook','2026-10-26T11:00:01Z');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000005'),'resend','2026-10-26T11:00:02Z'),'complaint suppression wins after claim');
select ok(not public.bind_reminder_payload((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000006'),
 extensions.digest('52150000-0000-4000-8000-000000000006@example.test','sha256'),extensions.digest('Edenia <reminders@example.test>','sha256'),
 extensions.digest('stable-payload','sha256'),'edenia-reminder-v3','rotated-key-v2',extensions.digest('re_test_key_1234567890','sha256'),'canary','2026-10-26T11:00:01Z'),'unsubscribe key changes cannot reconstruct old frozen payload');
select ok(not public.bind_reminder_payload((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000007'),
 extensions.digest('52150000-0000-4000-8000-000000000007@example.test','sha256'),extensions.digest('new-sender@example.test','sha256'),
 extensions.digest('stable-payload','sha256'),'edenia-reminder-v3','test-key-v1',extensions.digest('re_test_key_1234567890','sha256'),'canary','2026-10-26T11:00:01Z'),'sender changes cannot reuse old idempotency key');
update private.reminder_delivery_control set admission_mode='public';
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000006'),'resend','2026-10-26T11:00:01Z'),'changing serveradmissionmode after payloadbinding fences the oldworker');
update private.reminder_delivery_control set admission_mode='canary';
update private.reminder_free_capacity set api_key_digest=extensions.digest('re_different_account_key','sha256');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000007'),'resend','2026-10-26T11:00:01Z'),'changing accountkey attestation after binding fences the oldprovider key');
update private.reminder_free_capacity set api_key_digest=extensions.digest('re_test_key_1234567890','sha256');
select ok(public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000008'),'resend','2026-10-26T11:00:01Z'),'unknown-response fixture reaches actual provider-begin boundary');
select ok(public.complete_typed_reminder_rejection((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000008'),'configuration_invalid',false,'2026-10-26T11:00:02Z'),'nondefinitive idempotency conflict records ambiguity');
select is((select status from private.reminder_deliveries where user_id='52150000-0000-4000-8000-000000000008'),'outcome_ambiguous','ambiguous conflict remains eligible for receipt reconciliation');
select is(public.record_reminder_provider_event('resend','evt_521_ambiguous_bounce','email.bounced',
 (select delivery_id from fence_claims where user_id='52150000-0000-4000-8000-000000000008'),'accepted-after-timeout',
 '2026-10-26T11:00:02Z','2026-10-26T11:00:03Z'),'suppressed','signed late bounce can suppress ambiguous idempotency conflict');
select ok(public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000009'),'resend','2026-10-26T11:00:01Z'),'rate-limited fixture reaches boundary');
select public.defer_typed_reminder((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000009'),600,true,false,'2026-10-26T11:00:02Z');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000009'),'resend','2026-10-26T11:00:03Z'),'server final fence enforces Retry-After even for still-known old claim token');
update private.reminder_deliveries set lease_expires_at='2026-10-26T12:05:00Z' where user_id='52150000-0000-4000-8000-000000000010';
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000010'),'resend','2026-10-26T12:00:00Z'),'occurrence cutoff wins even if a worker still owns an artificially long lease');
select is((select count(*) from private.reminder_quota_reservations),2::bigint,'fenced attempts consume no provider quota');
select pg_temp.email_capacity('2026-10-26T11:00:02Z',59,59);
update private.reminder_deliveries set next_attempt_at='2026-10-26T11:00:00Z',lease_expires_at='2026-10-26T11:05:00Z'
 where user_id='52150000-0000-4000-8000-000000000009';
select ok(not private.reserve_reminder_capacity((select delivery_id from fence_claims where user_id='52150000-0000-4000-8000-000000000009'),'2026-10-26T11:00:03Z'),'reservationreuse excludes exactlyitsownslot and retains competing unknownusage');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from fence_claims where user_id='52150000-0000-4000-8000-000000000009'),'resend','2026-10-26T11:00:03Z'),'provider finalfence stops retry when othertraffic exhausts shared capacity');
select * from finish();
rollback;
