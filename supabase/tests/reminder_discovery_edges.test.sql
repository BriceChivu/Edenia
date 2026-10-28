begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
-- This suite deliberately tests one reviewed channel per language.
delete from private.reminder_discovery_channels where channel_id not in ('UCC_fdR7zZ_5SU--xuOrEdKw','UCu6sZrHyl4hSS2PvlUo2XZA','UC5r3WHrX4Z7peSYpDlgktGw','UCouyFdE9-Lrjo3M_2idKq1A','UCVzyfpNuFF4ENY8zNTIW7ug','UCbxb2fqe9oNgglAoYqsYOtQ','UC2L7vR43LKuBXXV2AentEMw');
\ir helpers/reminder_521_fixtures.sql
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
create function pg_temp.change_email_profile(p_user uuid,p_path text[],p_value jsonb) returns void language plpgsql as $$
declare profile jsonb; v_status text;
begin
 select v.envelope->'profile' into profile from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=p_user;
 profile:=jsonb_set(profile,p_path,p_value);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 update public.learner_profile_heads set updated_at=now()-interval '40 seconds' where user_id=p_user;
 select r.status into v_status from public.learner_profile_heads h cross join lateral public.commit_my_learner_profile(
 extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,private.make_current_profile_envelope(profile,'2026-10-26T10:00:00.000Z')) r where h.user_id=p_user;
 if v_status<>'accepted' then raise exception 'fixture change was not accepted'; end if;
end $$;
create function pg_temp.discovery_history(p_user uuid,p_at timestamptz,p_type text default 'discovery',p_channel text default 'UCC_fdR7zZ_5SU--xuOrEdKw') returns uuid language plpgsql as $$
declare v_id uuid:=extensions.gen_random_uuid(); v_zone text; v_date date;
begin
 select timezone into v_zone from public.reminder_preferences where user_id=p_user;
 v_date:=(p_at at time zone v_zone)::date;
 insert into private.reminder_deliveries(id,user_id,scheduled_local_date,scheduled_local_time,scheduled_for,timezone,locale,
 consent_version,consent_granted_at,status,email_type,learning_language,channel_id,channel_name,channel_summary,
 eligibility_snapshot_updated_at,enrollment_epoch,choice_version,provider_name,send_started_at,send_retry_deadline,
 outcome_ambiguous_at,may_have_sent,provider_attempt_count)
 values(v_id,p_user,v_date,'19:00',(v_date+time '19:00') at time zone v_zone,v_zone,'en','edenia-email-enrollment-v3',p_at-interval '1 day',
 'outcome_ambiguous',p_type,'mandarin',case when p_type='discovery' then p_channel end,
 case when p_type='discovery' then 'Reviewed prior channel' end,case when p_type='discovery' then 'Reviewed prior summary' end,
 p_at,0,0,'resend',p_at,p_at+interval '23 hours',p_at+interval '23 hours',true,1);
 return v_id;
end $$;
select pg_temp.email_fixture('52160000-0000-4000-8000-000000000001','Asia/Taipei','2026-10-26',10,10,false,true);
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-26T11:00:00Z');
select is((select count(*) from public.reminder_channel_follows),0::bigint,'new learner has no peer or owned channel follow prerequisite');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),1::bigint,'singleeligible learner receives reviewed discovery without any peers');
select is((select channel_id from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),'UCC_fdR7zZ_5SU--xuOrEdKw','primary selected language selects the reviewed Mandarin channel');
select ok((select video_id is null and video_title is null and video_published_at is null from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),'missing current video permits a useful reviewed channel-only link');
select * from public.evaluate_reminder_shadow('2026-10-26T11:00:00Z');
select is((select count(*) from private.reminder_deliveries),0::bigint,'preview consumes neither recommendation history nor real occurrence');
create temporary table old_discovery(id uuid);
insert into old_discovery select pg_temp.discovery_history('52160000-0000-4000-8000-000000000001','2026-10-20T11:00:00Z','discovery','UCVzyfpNuFF4ENY8zNTIW7ug');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'sixlocaldates since potentiallysent discovery does not satisfy weekly cadence');
update private.reminder_deliveries set scheduled_local_date='2026-10-19',scheduled_for='2026-10-19T11:00:00Z',send_started_at='2026-10-19T11:00:00Z',send_retry_deadline='2026-10-20T10:00:00Z',outcome_ambiguous_at='2026-10-20T10:00:00Z' where id=(select id from old_discovery);
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),1::bigint,'exactlysevenlocaldates permits a different channel');
delete from private.reminder_deliveries where id=(select id from old_discovery);truncate old_discovery;
insert into old_discovery select pg_temp.discovery_history('52160000-0000-4000-8000-000000000001','2026-07-28T11:01:00Z');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'singlechannel catalog stays silent until full90day exclusion expires');
update private.reminder_deliveries set may_have_sent=false where id=(select id from old_discovery);
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),1::bigint,'definitive nosend releases90day channel exclusion');
update private.reminder_deliveries set may_have_sent=true,send_started_at='2026-07-28T11:00:00Z',send_retry_deadline='2026-07-29T10:00:00Z' where id=(select id from old_discovery);
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),1::bigint,'singlechannel becomes eligible at exact90day expiry');
delete from private.reminder_deliveries where id=(select id from old_discovery);truncate old_discovery;
insert into old_discovery select pg_temp.discovery_history('52160000-0000-4000-8000-000000000001','2026-10-25T11:01:00Z','streak');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'rolling24hour limit applies across streak and discovery');
update private.reminder_deliveries set send_started_at='2026-10-25T11:00:00Z',send_retry_deadline='2026-10-26T10:00:00Z' where id=(select id from old_discovery);
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),1::bigint,'exact24hours can admit a different localdate');
delete from private.reminder_deliveries where id=(select id from old_discovery);truncate old_discovery;
-- Changing accepted preferences, rather than a client-only snapshot, changes discovery.
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000001',array['config','channels'],'[{"catalogId":"mandarin-grace","id":"UCC_fdR7zZ_5SU--xuOrEdKw","imageUrl":"","name":"Grace Mandarin Chinese"}]'::jsonb);
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-26T11:00:00Z');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'following all catalog channels yields no irrelevant fallback');
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000001',array['config','channels'],'[]'::jsonb);
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000001',array['learnerProfile','languages'],'[]'::jsonb);
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-26T11:00:00Z');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'no selectedlearninglanguage yields no invented recommendation');
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000001',array['learnerProfile','languages'],'["other"]'::jsonb);
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-26T11:00:00Z');
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'unsupported primary language skips sparse catalog');
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000001',array['learnerProfile','languages'],'["mandarin"]'::jsonb);
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-26T11:00:00Z');
create temporary table saved_catalog as select * from private.reminder_discovery_channels;
delete from private.reminder_discovery_channels;
select is((select count(*) from private.reminder_candidates('2026-10-26','2026-10-26T11:00:00Z')),0::bigint,'empty reviewed catalog consumes no provider budget');
insert into private.reminder_discovery_channels select * from saved_catalog;
select is((select count(*) from private.reminder_quota_reservations),0::bigint,'all empty/sparse/preview evaluations retain provider allowance');
-- Fresh occurrences demonstrate final fences and a late-arriving streak.
select pg_temp.email_fixture('52160000-0000-4000-8000-000000000002','Asia/Taipei','2026-10-26',9,0,true,true);
select pg_temp.email_fixture('52160000-0000-4000-8000-000000000003','Asia/Taipei','2026-10-26',10,10,false,true);
select pg_temp.email_fixture('52160000-0000-4000-8000-000000000004','Asia/Taipei','2026-10-26',10,10,false,true);
select pg_temp.email_fixture('52160000-0000-4000-8000-000000000005','Asia/Taipei','2026-10-26',10,10,false,true);
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00:00Z');
update private.reminder_delivery_control set delivery_enabled=true;
select pg_temp.email_capacity('2026-10-26T11:00:00Z');
create temporary table discovery_claims as select * from public.claim_due_typed_reminder_live('2026-10-26T11:00:00Z',10,3600,300);
select is((select count(*) from discovery_claims),4::bigint,'four fresh learners can receive discovery; the earlier deletion remains excluded');
select pg_temp.bind_email(claim_token,'2026-10-26T11:00:00Z') from discovery_claims;
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000002',array['anki','2026-10-25'],'{"created":0,"reviewed":10,"experienceReviews":10,"experienceWatermark":10,"observedAt":"2026-10-25T10:00:00.000Z"}'::jsonb);
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00:01Z');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from discovery_claims where user_id='52160000-0000-4000-8000-000000000002'),'resend','2026-10-26T11:00:02Z'),'late accepted yesterday qualification blocks lowerpriority discovery at final fence');
select public.plan_typed_reminders('2026-10-26T11:00:02Z');
create temporary table streak_reclaim as select * from public.claim_due_typed_reminder_live('2026-10-26T11:00:02Z');
select is((select email_type from streak_reclaim),'streak','unstarted discovery is replanned as streak with a fresh claim token');
select is((select delivery_id from streak_reclaim),(select delivery_id from discovery_claims where user_id='52160000-0000-4000-8000-000000000002'),'priority change retains stable owner/localdate occurrence UUID');
select ok(not exists(select 1 from private.reminder_payload_bindings where delivery_id=(select delivery_id from streak_reclaim)),'never-sent lowerpriority binding is retired before replacement claim');
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000001',array['learnerProfile','languages'],'["french"]'::jsonb);
select pg_temp.change_email_profile('52160000-0000-4000-8000-000000000003',array['config','channels'],'[{"catalogId":"mandarin-grace","id":"UCC_fdR7zZ_5SU--xuOrEdKw","imageUrl":"","name":"Grace Mandarin Chinese"}]'::jsonb);
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00:03Z');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from discovery_claims where user_id='52160000-0000-4000-8000-000000000001'),'resend','2026-10-26T11:00:04Z'),'accepted languagechange after claim fences former recommendation');
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from discovery_claims where user_id='52160000-0000-4000-8000-000000000003'),'resend','2026-10-26T11:00:04Z'),'accepted follow after claim fences recommendation of newlyfollowed channel');
select ok(public.begin_typed_reminder_provider_attempt((select claim_token from discovery_claims where user_id='52160000-0000-4000-8000-000000000004'),'resend','2026-10-26T11:00:04Z'),'potentiallysent discovery crosses provider-begin boundary');
select ok((select may_have_sent from private.reminder_deliveries where user_id='52160000-0000-4000-8000-000000000004'),'ambiguous delivery consumes recommendationhistory conservatively');
select ok(public.complete_typed_reminder_rejection((select claim_token from discovery_claims where user_id='52160000-0000-4000-8000-000000000004'),'provider_rejected',true,'2026-10-26T11:00:05Z'),'definitive firstattempt rejection is recorded');
select ok(not(select may_have_sent from private.reminder_deliveries where user_id='52160000-0000-4000-8000-000000000004'),'confirmednosend releases discovery history while retaining consumed quota');
update private.reminder_discovery_channels set channel_name='Reviewed channel name changed' where learning_language='mandarin';
select ok(not public.begin_typed_reminder_provider_attempt((select claim_token from discovery_claims where user_id='52160000-0000-4000-8000-000000000005'),'resend','2026-10-26T11:00:06Z'),'changed reviewed metadata cannot silently rewrite an already frozen occurrence');
select is((select count(*) from private.reminder_quota_reservations),1::bigint,'language/follow/metadata/priority fences consume no extra provider budget');
select * from finish();
rollback;
