begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
select has_table('public','reminder_eligibility_snapshots','accepted reminder eligibility table exists');
select has_table('public','reminder_channel_follows','accepted followed channels table exists');
select ok((select relrowsecurity from pg_catalog.pg_class where oid='public.reminder_eligibility_snapshots'::regclass),'eligibility snapshots have RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid='public.reminder_channel_follows'::regclass),'followed channels have RLS');
select policies_are('public','reminder_eligibility_snapshots',array['Users can view their own reminder eligibility snapshot'],'snapshot has exactly one owner read policy');
select policies_are('public','reminder_channel_follows',array['Users can view their own reminder channel follows'],'follows have exactly one owner read policy');
select hasnt_column('public','reminder_eligibility_snapshots','email','snapshot contains no recipient address');
select hasnt_column('public','reminder_channel_follows','email','followed channels contain no recipient address');
select has_function('public','sync_my_reminder_eligibility_snapshot',array['jsonb'],'old-client compatibility RPC remains available');
select ok(has_function_privilege('authenticated','public.sync_my_reminder_eligibility_snapshot(jsonb)','execute'),'verified clients may request accepted projection recomputation');
select ok(not has_function_privilege('anon','public.sync_my_reminder_eligibility_snapshot(jsonb)','execute'),'unauthenticated client cannot execute the snapshot RPC');
select ok(has_table_privilege('service_role','public.reminder_eligibility_snapshots','insert'),'trusted server may populate accepted snapshots');
select ok(has_table_privilege('service_role','public.reminder_channel_follows','insert'),'trusted server may populate followed channels');
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','snapshot-a@example.test',now()),
 ('22222222-2222-4222-8222-222222222222','snapshot-b@example.test',now());
-- Retained old rows deliberately lack accepted-head provenance. A migration
-- does not infer new authority or consent from an old client projection.
insert into public.reminder_eligibility_snapshots(user_id,timezone,locale,learning_language,study_date,points_today,last_qualified_study_date,current_streak_days)
 values('11111111-1111-4111-8111-111111111111','UTC','en','mandarin',current_date,4,current_date-1,1),
 ('22222222-2222-4222-8222-222222222222','UTC','fr','french',current_date,0,null,0);
insert into public.reminder_channel_follows(user_id,channel_id,channel_name)
 values('11111111-1111-4111-8111-111111111111','UCaaaaaaaaaaaaaaaaaaaaaa','Owner A'),
 ('22222222-2222-4222-8222-222222222222','UCbbbbbbbbbbbbbbbbbbbbbb','Owner B');
select ok(not private.reminder_projection_matches_head('11111111-1111-4111-8111-111111111111'),'old rows are not promoted to accepted authority');
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.reminder_eligibility_snapshots),1::bigint,'owner reads only own eligibility snapshot');
select is((select count(*) from public.reminder_eligibility_snapshots where user_id='22222222-2222-4222-8222-222222222222'),0::bigint,'user A cannot select user B snapshot data');
select is((select count(*) from public.reminder_channel_follows),1::bigint,'owner reads only own followed channels');
select lives_ok($$select public.sync_my_reminder_eligibility_snapshot('{"timezone":"UTC","locale":"en","studyDate":"2026-10-27","pointsToday":9999,"lastQualifiedStudyDate":"2026-10-27","currentStreakDays":999,"channels":[]}'::jsonb)$$,'user A may request recomputation without uploading study authority');
select is((select points_today from public.reminder_eligibility_snapshots),4,'unbound client totals cannot replace retained snapshot');
select is((select count(*) from public.reminder_channel_follows),1::bigint,'client replacement cannot erase server followed channels');
select throws_ok($$select public.sync_my_reminder_eligibility_snapshot('{"userId":"22222222-2222-4222-8222-222222222222"}'::jsonb)$$,'22023','Snapshot payload is invalid','client cannot submit or reassign an owner UUID');
select throws_ok($$update public.reminder_eligibility_snapshots set user_id='22222222-2222-4222-8222-222222222222'$$,'42501',null,'clients cannot reassign a stored owner UUID');
select throws_ok($$insert into public.reminder_channel_follows(user_id,channel_id,channel_name) values('11111111-1111-4111-8111-111111111111','UCcccccccccccccccccccccc','Forged')$$,'42501',null,'client cannot forge server followed channels');
select throws_ok($$select public.sync_my_reminder_eligibility_snapshot('[]'::jsonb)$$,'22023','Snapshot payload is invalid','nonobject snapshot request is rejected');
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select lives_ok($$select public.sync_my_reminder_eligibility_snapshot('{"timezone":"UTC","locale":"fr"}'::jsonb)$$,'user B may independently request accepted projection recomputation');
select is((select points_today from public.reminder_eligibility_snapshots),0,'user B retains separately owned snapshot');
reset role;
set local role anon;
select throws_ok($$select * from public.reminder_eligibility_snapshots$$,'42501',null,'unauthenticated client cannot select eligibility snapshots');
select throws_ok($$select * from public.reminder_channel_follows$$,'42501',null,'unauthenticated client cannot select followed channels');
select throws_ok($$insert into public.reminder_channel_follows(user_id,channel_id,channel_name) values('11111111-1111-4111-8111-111111111111','UCcccccccccccccccccccccc','Forged')$$,'42501',null,'unauthenticated client cannot insert followed channels');
reset role;
select is((select count(*) from public.reminder_channel_follows),2::bigint,'rejected replacement preserves the previous channel set');
select * from finish();
rollback;
