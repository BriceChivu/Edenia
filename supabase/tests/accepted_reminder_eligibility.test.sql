begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
select is(private.reminder_study_threshold(),10,'server study policy requires ten XP');
select ok(not has_function_privilege('authenticated','public.refresh_reminder_eligibility_snapshots(integer,timestamptz)','execute'),'browser cannot run planner projection batches');
select ok(has_function_privilege('service_role','public.refresh_reminder_eligibility_snapshots(integer,timestamptz)','execute'),'service role can run bounded projections');
select ok(not has_function_privilege('authenticated','private.reminder_study_points(uuid,date)','execute'),'private study facts are not a browser data API');
insert into auth.users(id,email,email_confirmed_at) values
 ('52100000-0000-4000-8000-000000000001','accepted-projection@example.test',now()),
 ('52100000-0000-4000-8000-000000000002','unbound-projection@example.test',now());
update private.learner_profile_access_control set rollout_state='signed-in-public',record_write_interval_ms=5000 where singleton;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='52100000-0000-4000-8000-000000000001';
select * from public.resolve_my_learner_profile($profile${"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}$profile$::jsonb);
reset role;
insert into public.reminder_preferences(user_id,timezone,locale,consent_version,consent_source) values
 ('52100000-0000-4000-8000-000000000001','Asia/Taipei','en','test','test'),
 ('52100000-0000-4000-8000-000000000002','Asia/Taipei','en','test','test');
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'row creation alone has no accepted projection');
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z'),1,'bounded worker derives accepted empty profile');
select ok(private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'accepted empty projection names current head');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-27'),0::numeric,'missing accepted study day has zero XP');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000002','2026-10-27'),null::numeric,'missing head has unavailable authority instead of guessed zero');
set local role authenticated;
select lives_ok($$select public.sync_my_reminder_eligibility_snapshot('{"timezone":"UTC","locale":"en","studyDate":"2026-10-27","pointsToday":99999,"lastQualifiedStudyDate":"2026-10-27","currentStreakDays":9999,"channels":[]}'::jsonb)$$,'old client can request server recomputation without gaining authority');
reset role;
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-27'),0::numeric,'invented client XP cannot create a qualified day');
create temporary table projection_request(batch jsonb);
insert into projection_request values($batch${"exportedAt":"2026-10-27T02:00:00.000Z","units":[{"after":{"favorite":true,"hiddenFromGrid":false,"hiddenFromGridAt":null,"manuallyAdded":false,"pausedAt":null,"removedFromFeedAt":null,"resumeAtSeconds":null,"status":"unwatched","watchLater":false,"watchProgress":[{"id":"video:aaaaaaaaaaa:2026-10-27T01:00:00.000Z:300:1","watchedAt":"2026-10-27T01:00:00.000Z","studyDay":"2026-10-26","seconds":300,"experienceSeconds":300}],"watchProgressTracked":true,"watchedAt":null,"watchedConfirmationUnlockedAt":null},"afterPresent":true,"key":"aaaaaaaaaaa","kind":"video","metadata":{"aspectRatio":null,"channelId":"UCaaaaaaaaaaaaaaaaaaaaaa","channelImageUrl":"","channelTitle":"","duration":600,"id":"aaaaaaaaaaa","isShort":false,"publishedAt":"2026-10-26T00:00:00.000Z","source":null,"thumbnail":"","title":"Accepted lesson"}},{"after":{"created":0,"observedAt":"2026-10-27T01:00:00.000Z","reviewed":5,"experienceReviews":5,"experienceWatermark":5},"afterPresent":true,"key":"2026-10-26","kind":"anki"},{"kind":"anki","key":"2026-10-27","afterPresent":true,"after":{"created":0,"observedAt":"2026-10-27T01:00:00.000Z","reviewed":9,"experienceReviews":9,"experienceWatermark":9}},{"kind":"settings","key":"config","afterPresent":true,"after":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[{"catalogId":null,"id":"UCaaaaaaaaaaaaaaaaaaaaaa","imageUrl":"","name":"Accepted channel"}],"includeShorts":false,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4}},{"after":{"favorite":true,"hiddenFromGrid":false,"hiddenFromGridAt":null,"manuallyAdded":false,"pausedAt":null,"removedFromFeedAt":null,"resumeAtSeconds":null,"status":"unwatched","watchLater":false,"watchProgress":[],"watchProgressTracked":true,"watchedAt":null,"watchedConfirmationUnlockedAt":null},"afterPresent":true,"key":"bbbbbbbbbbb","kind":"video","metadata":{"aspectRatio":null,"channelId":"UCaaaaaaaaaaaaaaaaaaaaaa","channelImageUrl":"","channelTitle":"","duration":120,"id":"bbbbbbbbbbb","isShort":false,"publishedAt":"2026-10-27T00:00:00.000Z","source":null,"thumbnail":"","title":"Excluded short"}}],"version":1}$batch$::jsonb);
grant select on projection_request to authenticated;
create function pg_temp.send_projection_batch(p_batch jsonb) returns text language sql volatile as $$
 select r.status from public.learner_profile_heads h cross join lateral public.commit_my_learner_profile_records(
   extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,p_batch,false) r
 where h.user_id='52100000-0000-4000-8000-000000000001';
$$;
update public.learner_profile_heads set updated_at=clock_timestamp()-interval '40 seconds' where user_id='52100000-0000-4000-8000-000000000001';
set local role authenticated;
select is(pg_temp.send_projection_batch((select batch from projection_request)),'accepted','real typed commit accepts video and Anki study facts together');
reset role;
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'accepted relevant commit invalidates before any provider begin');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-27'),null::numeric,'invalidated study projection cannot report stale zero');
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z'),1,'worker rebuilds relevant accepted records');
select is((select count(*) from public.reminder_channel_follows where user_id='52100000-0000-4000-8000-000000000001'),1::bigint,'accepted settings alone own the followed-channel projection');
select is((select latest_video_id from public.reminder_channel_follows where user_id='52100000-0000-4000-8000-000000000001'),'aaaaaaaaaaa','optional candidate respects accepted three-minute Shorts visibility policy');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-26'),10::numeric,'immutable yesterday combines five video XP and five Anki XP despite current watchedAt');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-27'),9::numeric,'nine today remains below threshold');
select is((select last_qualified_study_date from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000001'),'2026-10-26'::date,'yesterday is the accepted qualified Study day');
select is((select current_streak_days from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000001'),1,'yesterday preserves a current streak without a browser visit today');
create temporary table projection_before as select * from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000001';
update public.learner_profile_heads set updated_at=clock_timestamp()-interval '40 seconds' where user_id='52100000-0000-4000-8000-000000000001';
set local role authenticated;
select is(pg_temp.send_projection_batch('{"version":1,"exportedAt":"2026-10-27T02:00:00.000Z","units":[{"kind":"island","key":"tinySwordsIsland","afterPresent":true,"after":{"version":38,"positions":[1,2,3]}}]}'::jsonb),'accepted','real accepted cosmetic island revision advances the shared head');
reset role;
select ok(private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'cosmetic revision carries projection to accepted head without rebuilding');
select is((select input_fingerprint from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000001'),(select input_fingerprint from projection_before),'cosmetic island revision preserves server input fingerprint');
select is((select updated_at from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000001'),(select updated_at from projection_before),'cosmetic island revision does not fake projection freshness');
-- A legacy full-envelope commit uses the same accepted head and retains exact
-- relevant inputs while changing only its opaque island.
select private.materialize_current_profile('52100000-0000-4000-8000-000000000001');
create temporary table projection_legacy as select private.make_current_profile_envelope(
 pg_catalog.jsonb_set(v.envelope->'profile','{tinySwordsIsland,positions}','[4,5,6]'),'2026-10-27T02:00:00.000Z') as envelope
 from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id
 where h.user_id='52100000-0000-4000-8000-000000000001';
grant select on projection_legacy to authenticated;
set local role authenticated;
select is((select r.status from public.learner_profile_heads h cross join projection_legacy p cross join lateral
 public.commit_my_learner_profile(extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,p.envelope) r
 where h.user_id='52100000-0000-4000-8000-000000000001'),'accepted','legacy writer accepts cosmetic full envelope');
reset role;
select ok(private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'legacy cosmetic revision carries server-verified projection');
-- Changes after claim must invalidate at the provider boundary even if an old
-- browser immediately uploads its former totals under a fresh wall clock.
update public.learner_profile_heads set updated_at=clock_timestamp()-interval '40 seconds' where user_id='52100000-0000-4000-8000-000000000001';
set local role authenticated;
select is(pg_temp.send_projection_batch('{"version":1,"exportedAt":"2026-10-27T02:00:00.000Z","units":[{"kind":"anki","key":"2026-10-27","afterPresent":true,"after":{"created":0,"observedAt":"2026-10-27T02:00:00.000Z","reviewed":10,"experienceReviews":10,"experienceWatermark":10}}]}'::jsonb),'accepted','new-device study accepts ten today');
select public.sync_my_reminder_eligibility_snapshot('{"timezone":"Asia/Taipei","locale":"en","pointsToday":0,"lastQualifiedStudyDate":"2026-10-26","currentStreakDays":1}'::jsonb);
reset role;
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-27'),10::numeric,'old-tab upload cannot regress newest accepted study');
select ok(private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'legacy to record authority remains exact after old client request');
-- An intentional reset and its explicit undo cannot reuse the earlier
-- generation's reminder facts, even while old work remains materialized.
create temporary table projection_blank as select private.make_current_profile_envelope($blank${"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":[],"level":null,"selectedChannelCatalogIds":[],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":false,"setupCompletedAt":null,"walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}}$blank$::jsonb,'2026-10-27T02:00:00.000Z') as envelope;
grant select on projection_blank to authenticated;
set local role authenticated;
create temporary table projection_reset as select r.* from public.learner_profile_heads h cross join projection_blank p cross join lateral
 public.start_over_my_learner_profile(extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,p.envelope,true) r
 where h.user_id='52100000-0000-4000-8000-000000000001';
select is((select status from projection_reset),'started_over','explicit reset advances to a fresh generation');
reset role;
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'reset immediately invalidates old-generation reminder work');
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-26'),0::numeric,'reset projection cannot resurrect yesterday study from protected history');
set local role authenticated;
select is((select status from public.undo_my_learner_profile_start_over((select reset_id from projection_reset),extensions.gen_random_uuid(),true)),'undone','explicit owner undo restores protected prior generation');
reset role;
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'explicit restore invalidates fresh-generation projection');
select public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-26'),10::numeric,'explicit restoration rebuilds only its newly accepted head');
-- Projection access is owner-isolated and cannot mutate learner progress.
set local role authenticated;
set local request.jwt.claim.sub='52100000-0000-4000-8000-000000000002';
select is((select count(*) from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000001'),0::bigint,'other owner cannot read accepted study projection');
select public.sync_my_reminder_eligibility_snapshot('{"pointsToday":99999}'::jsonb);
reset role;
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000002'),'client-only profile has no accepted eligibility even with invented XP');
-- Future client clocks cannot make migrated historical input fresh forever.
set local role authenticated;
select * from public.resolve_my_learner_profile($futurebase${"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}$futurebase$::jsonb);
reset role;
-- Simulate migration backfill before any cached input fingerprint exists.
update private.reminder_projection_sources set input_fingerprint=null,dirty=true,relevant_activity_at=null
 where user_id='52100000-0000-4000-8000-000000000002';
create temporary table projection_first_legacy as select private.make_current_profile_envelope(
 (v.envelope->'profile')||'{"tinySwordsIsland":{"version":38}}'::jsonb,'2026-10-27T02:00:00.000Z') as envelope
 from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id
 where h.user_id='52100000-0000-4000-8000-000000000002';
grant select on projection_first_legacy to authenticated;
set local role authenticated;
select is((select r.status from public.learner_profile_heads h cross join projection_first_legacy p cross join lateral
 public.commit_my_learner_profile(extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,p.envelope) r
 where h.user_id='52100000-0000-4000-8000-000000000002'),'accepted','first post-migration legacy cosmetic write is accepted normally');
reset role;
select is((select relevant_activity_at from private.reminder_projection_sources where user_id='52100000-0000-4000-8000-000000000002'),null::timestamptz,'first legacy cosmetic write does not invent recent settings activity');
select private.seed_current_profile_records('52100000-0000-4000-8000-000000000002');
update private.learner_profile_current_records set value=pg_catalog.jsonb_set(value,'{updatedAt}','"2099-01-01T00:00:00.000Z"')
 where user_id='52100000-0000-4000-8000-000000000002' and kind='section' and record_key='learnerProfile';
update private.reminder_projection_sources set relevant_activity_at=null where user_id='52100000-0000-4000-8000-000000000002';
select private.refresh_reminder_eligibility('52100000-0000-4000-8000-000000000002','2026-10-27T11:00:00Z');
select is((select relevant_activity_at from public.reminder_eligibility_snapshots where user_id='52100000-0000-4000-8000-000000000002'),null::timestamptz,'future client observation cannot authorize discovery freshness');
-- Retained legacy activity without XP provenance is neither earned XP nor
-- an error that may hide independently accepted new Study XP.
select private.seed_current_profile_records('52100000-0000-4000-8000-000000000001');
update private.learner_profile_current_records set value=pg_catalog.jsonb_set(value,'{watchProgress}',
 (value->'watchProgress')||'[{"watchedAt":"2026-08-01T01:00:00.000Z","seconds":600}]'::jsonb)
 where user_id='52100000-0000-4000-8000-000000000001' and kind='video' and record_key='aaaaaaaaaaa';
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z'),1,'uncredited retained activity without studyDay does not poison valid new XP');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-10-26'),10::numeric,'mixed legacy and earned facts retain exactly the credited XP');
select is(private.reminder_study_points('52100000-0000-4000-8000-000000000001','2026-08-01'),0::numeric,'uncredited old activity never gains retroactive XP');
-- A positive earned fact without a recorded day is unavailable authority;
-- guessing from today's timezone would move historical study after travel.
update private.learner_profile_current_records set value=pg_catalog.jsonb_set(value,'{watchProgress,0}',(value#>'{watchProgress,0}')-'studyDay')
 where user_id='52100000-0000-4000-8000-000000000001' and kind='video' and record_key='aaaaaaaaaaa';
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z'),0,'earned fact with unavailable studyDay fails closed instead of inventing a day');
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'missing credited day quarantines only derived authority');
update private.learner_profile_current_records set value=pg_catalog.jsonb_set(value,'{watchProgress,0,studyDay}','"2026-10-26"')
 where user_id='52100000-0000-4000-8000-000000000001' and kind='video' and record_key='aaaaaaaaaaa';
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z'),1,'new accepted relevant input retires obsolete quarantine backoff');
-- Simulate a corrupt accepted record after normal accepted commits. The worker
-- quarantines only derived eligibility and leaves learner records unchanged.
select private.seed_current_profile_records('52100000-0000-4000-8000-000000000001');
update private.learner_profile_current_records set value=pg_catalog.jsonb_set(value,'{experienceReviews}','"corrupt"')
 where user_id='52100000-0000-4000-8000-000000000001' and kind='anki' and record_key='2026-10-27';
update private.reminder_projection_sources set dirty=true where user_id='52100000-0000-4000-8000-000000000002';
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:00:00Z'),1,'one malformed accepted profile does not abort another owner projection');
select is((select failure_reason from private.reminder_projection_sources where user_id='52100000-0000-4000-8000-000000000001'),'invalid-accepted-input','operator sees bounded invalid-input reason');
select ok(not private.reminder_projection_matches_head('52100000-0000-4000-8000-000000000001'),'corrupt accepted facts cannot preserve old eligibility');
select is((select value->>'experienceReviews' from private.learner_profile_current_records where user_id='52100000-0000-4000-8000-000000000001' and kind='anki' and record_key='2026-10-27'),'corrupt','projection quarantine never repairs or rewrites learner progress');
select is(public.refresh_reminder_eligibility_snapshots(10,'2026-10-27T11:05:00Z'),0,'corrupt profile respects bounded retry delay');
select throws_ok($$select public.refresh_reminder_eligibility_snapshots(101,now())$$,'22023','Invalid reminder projection bound','worker rejects unbounded projection work');
select * from finish();
rollback;
