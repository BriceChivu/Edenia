begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;
select no_plan();
-- CLIENT_ENVELOPE_INPUTS

insert into auth.users (id,email,email_confirmed_at,is_anonymous) values
 ('81000000-0000-4000-8000-000000000001','trial-one@example.test',statement_timestamp(),false),
 ('81000000-0000-4000-8000-000000000002','trial-two@example.test',statement_timestamp(),false),
 ('81000000-0000-4000-8000-000000000003','trial-denied@example.test',statement_timestamp(),false),
 ('81000000-0000-4000-8000-000000000004','trial-unverified@example.test',null,false),
 ('81000000-0000-4000-8000-000000000005','trial-anonymous@example.test',statement_timestamp(),true);

select throws_ok($$update private.learner_profile_access_control set rollout_state='tester-trial' where singleton$$,
 '23514', null, 'an empty trial cannot be opened');
select throws_ok($$update private.learner_profile_access_control set tester_user_ids=array[null]::uuid[] where singleton$$,
 '23514', null, 'null admission cannot weaken the gate');
update private.learner_profile_access_control set rollout_state='tester-trial', tester_user_ids=array[
 '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',
 '81000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000005']::uuid[] where singleton;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
create temporary table trial_opened as select * from public.resolve_my_learner_profile(pg_temp.profile_input('initial'));
select is((select status from trial_opened),'profile_ready','first admitted owner can create a profile');
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',(select profile_id from trial_opened),1,1,pg_temp.profile_input('island'))), 'accepted', 'admitted owner can synchronize the current island');
select is((select status from public.resolve_my_learner_profile(null)),'profile_ready','admitted owner can reopen the synchronized head');
select is((select count(*) from public.learner_profile_heads),1::bigint,'admitted owner sees only their head');

set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
select is((select status from public.resolve_my_learner_profile(pg_temp.profile_input('initial'))),'profile_ready','second admitted owner can create a profile');
select is((select count(*) from public.learner_profile_heads),1::bigint,'second admitted owner cannot read the first owner head');
select is((select count(*) from public.learner_profile_versions where user_id='81000000-0000-4000-8000-000000000001'),0::bigint,'admission never widens UUID ownership');
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',(select profile_id from trial_opened),1,2,pg_temp.profile_input('island'))),'conflict','a different profile identity is preserved for an owner-scoped choice');
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
select is((select revision from public.learner_profile_heads),2::bigint,'the other admitted UUID cannot change the first owner head');
select is((select envelope from public.learner_profile_versions where revision=2),pg_temp.profile_input('island'),'the first owner exact island envelope remains unchanged');

reset role;
-- Give the non-admitted owner a preexisting profile through the unchanged public
-- stage, then ensure trial admission covers direct reads of their own old data.
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000003';
select is((select status from public.resolve_my_learner_profile(pg_temp.profile_input('initial'))),'profile_ready','preexisting non-trial owner fixture is created');
reset role;
update private.learner_profile_access_control set rollout_state='tester-trial' where singleton;
create temporary table before_denial as select
 (select jsonb_agg(to_jsonb(t)) from public.learner_profile_heads t) heads,
 (select jsonb_agg(to_jsonb(t)) from public.learner_profile_versions t) versions,
 (select jsonb_agg(to_jsonb(t)) from public.learner_profile_write_receipts t) receipts;

-- Construct calls to the fixed owner-derived API using each declared argument
-- type. Admission must reject before even invalid request input is processed.
create temporary table trial_calls as
select proc.proname, format('select * from public.%I(%s)',proc.proname,
 coalesce((select string_agg(case arg::regtype::text
   when 'uuid' then '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''::uuid'
   when 'bigint' then '1::bigint'
   when 'jsonb' then '''{}''::jsonb'
   when 'text' then '''device''::text'
   when 'boolean' then 'true' else 'null' end, ',' order by ord)
   from unnest(proc.proargtypes) with ordinality a(arg,ord)),'')) as call
from pg_proc proc join pg_namespace ns on ns.oid=proc.pronamespace
where ns.nspname='learner_profile_rpc';
grant select on trial_calls to authenticated;
set local role authenticated;
select is((select count(*) from trial_calls),14::bigint,'every learner profile RPC participates');
select throws_ok(call,'42501','Learner profile tester access disabled',proname || ' rejects a non-admitted UUID') from trial_calls order by proname;
select is((select count(*) from public.learner_profile_heads),0::bigint,'non-admitted owner cannot read even their existing head');
select is((select count(*) from public.learner_profile_versions),0::bigint,'non-admitted owner cannot read existing versions');
select throws_ok($$update private.learner_profile_access_control set tester_user_ids=array['81000000-0000-4000-8000-000000000003']::uuid[]$$, '42501', null, 'browser cannot admit itself');
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000004';
select throws_ok($$select * from public.resolve_my_learner_profile(null)$$,'42501','Learner profile tester access disabled','unverified listed identity is rejected');
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000005';
select throws_ok($$select * from public.resolve_my_learner_profile(null)$$,'42501','Learner profile tester access disabled','anonymous listed identity is rejected');
reset role;
select is((select jsonb_agg(to_jsonb(t)) from public.learner_profile_heads t),(select heads from before_denial),'denials preserve every exact head');
select is((select jsonb_agg(to_jsonb(t)) from public.learner_profile_versions t),(select versions from before_denial),'denials preserve every exact version');
select is((select jsonb_agg(to_jsonb(t)) from public.learner_profile_write_receipts t),(select receipts from before_denial),'denials preserve every exact receipt');

update private.learner_profile_access_control set tester_user_ids=array['81000000-0000-4000-8000-000000000002']::uuid[] where singleton;
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
select throws_ok($$select * from public.resolve_my_learner_profile(null)$$,'42501','Learner profile tester access disabled','removal immediately denies the same cached JWT owner');
select is((select count(*) from public.learner_profile_heads),0::bigint,'removal immediately fences direct reads');
reset role;
update private.learner_profile_access_control set rollout_state='off' where singleton;
set local role authenticated;
set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
select is((select status from public.resolve_my_learner_profile(null)),'access_disabled','off still stops admitted resolution');
reset role;
select ok(not has_function_privilege('anon','private.learner_profile_trial_allows_owner()','execute'),'anonymous cannot call the admission helper');
select * from finish();
rollback;
