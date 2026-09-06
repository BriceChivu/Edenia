-- Execute only under the invoked #196 deployed-schema authority.
-- All synthetic state, role/gate changes and assertions share one transaction.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '5s';
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;
do $preflight$
begin
  perform 1 from private.learner_profile_access_control where singleton and rollout_state = 'off' and developer_user_id is null for update;
  if not found then raise exception 'Schema probe requires externally off gate'; end if;
  if exists(select 1 from auth.users where id in ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002')) then
    raise exception 'Schema probe identity collision';
  end if;
end;
$preflight$;
select plan(13);
insert into auth.users (id,email,email_confirmed_at) values
('91000000-0000-4000-8000-000000000001','schema-a@example.test',now()),
('91000000-0000-4000-8000-000000000002','schema-b@example.test',now());
update private.learner_profile_access_control set rollout_state = 'developer-canary', developer_user_id = '91000000-0000-4000-8000-000000000001' where singleton;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq($q$select status from public.resolve_my_learner_profile($envelope${"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}$envelope$::jsonb)$q$, $$values ('profile_ready'::text)$$, 'synthetic owner reaches resolver beyond access gate');
reset role;
create temporary table canary_probe_fixture on commit drop as select h.profile_id, v.envelope from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id='91000000-0000-4000-8000-000000000001';
grant select on canary_probe_fixture to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000002';
select is((select count(*) from public.learner_profile_heads),0::bigint,'foreign actor cannot read any other owner head');
select is((select count(*) from public.learner_profile_versions),0::bigint,'foreign actor cannot read any other owner version');
select throws_ok($q$update public.learner_profile_heads set revision=2 where user_id='91000000-0000-4000-8000-000000000001'$q$,'42501','permission denied for table learner_profile_heads','authenticated direct head mutation denied');
select throws_ok($q$delete from public.learner_profile_versions where user_id='91000000-0000-4000-8000-000000000001'$q$,'42501','permission denied for table learner_profile_versions','authenticated direct version deletion denied');
select ok(not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='list_learner_profile_operator_candidates' and has_function_privilege('authenticated',p.oid,'execute')),'operator recovery listing is not an authenticated grant');
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select results_eq($q$select status from public.commit_my_learner_profile('92000000-0000-4000-8000-000000000001',(select profile_id from canary_probe_fixture),1,1,(select envelope from canary_probe_fixture))$q$,$$values ('accepted'::text)$$,'one sequential revision accepted');
select results_eq($q$select status from public.commit_my_learner_profile('92000000-0000-4000-8000-000000000001',(select profile_id from canary_probe_fixture),1,1,(select envelope from canary_probe_fixture))$q$,$$values ('already_accepted'::text)$$,'same operation returns receipt without another version');
select results_eq($q$select status from public.commit_my_learner_profile('92000000-0000-4000-8000-000000000002',(select profile_id from canary_probe_fixture),1,1,(select envelope from canary_probe_fixture))$q$,$$values ('conflict'::text)$$,'stale revision reaches conflict predicate');
select results_eq($q$select status from public.commit_my_learner_profile('92000000-0000-4000-8000-000000000003',(select profile_id from canary_probe_fixture),2,2,(select envelope from canary_probe_fixture))$q$,$$values ('conflict'::text)$$,'cross-generation request reaches generation fence');
select throws_ok($q$select * from public.commit_my_learner_profile('92000000-0000-4000-8000-000000000004',(select profile_id from canary_probe_fixture),1,2,jsonb_set((select envelope from canary_probe_fixture),'{profile,config,locale}','"fr"'::jsonb))$q$,'22023','Learner profile integrity is invalid','corrupt envelope rejected beyond access gate');
select is((select revision from public.learner_profile_heads where user_id='91000000-0000-4000-8000-000000000001'),2::bigint,'all denied and duplicate cases leave accepted revision unchanged');
select is((select count(*) from public.learner_profile_versions where user_id='91000000-0000-4000-8000-000000000001'),2::bigint,'only initial and one committed version exist');
reset role;
select * from finish();
rollback;
