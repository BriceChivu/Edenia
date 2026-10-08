begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;
select no_plan();
-- Inputs are emitted from the current serializer, first-profile builder and
-- production compatibility resolver. Generate them before running this suite.
-- CLIENT_ENVELOPE_INPUTS

select lives_ok(format('select private.assert_learner_profile_envelope(%L::jsonb)', envelope), name || ' client envelope is accepted')
from owned_profile_inputs where name in ('initial','legacy','xp','island','opaque','reset','island-limit','cloud-limit') order by name;
select lives_ok($$select private.assert_initial_learner_profile_envelope(pg_temp.profile_input('initial'))$$,
  'actual first-profile builder output remains valid');
select lives_ok($$select private.assert_initial_learner_profile_envelope(pg_temp.profile_input('initial-xp'))$$,
  'first profile permits the current XP marker without study history');
select throws_ok($$select private.assert_initial_learner_profile_envelope(pg_temp.profile_input('island'))$$, '22023', 'Initial learner profile envelope is invalid',
  'first creation cannot inherit an island or retained town claims');
select throws_ok(format('select private.assert_learner_profile_envelope(%L::jsonb)', envelope), '22023', null, name || ' is rejected')
from owned_profile_inputs where name in ('cloud-over','island-over','bad-xp','bad-counter','unsafe-counter','bad-marker','bad-date','corrupt','bad-bytes') order by name;
select ok(not has_function_privilege('authenticated','private.canonical_island_jsonb_text(jsonb)','execute'), 'snapshot canonical helper is private');
select ok(not has_function_privilege('anon','private.learner_profile_envelope_schema()','execute'), 'schema helper stays private');

-- Execute real owner-derived operations; every test transaction rolls back.
insert into auth.users (id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','owned-contract@example.test',statement_timestamp());
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
create temporary table opened as select * from public.resolve_my_learner_profile(pg_temp.profile_input('initial'));
select is((select status from opened),'profile_ready','first creation uses the client-generated envelope');
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', (select profile_id from opened),1,1,pg_temp.profile_input('xp'))), 'accepted', 'ordinary sync retains XP provenance and legacy claims');
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', (select profile_id from opened),1,2,pg_temp.profile_input('island'))), 'accepted', 'ordinary sync accepts a populated Godot snapshot');
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', (select profile_id from opened),1,2,pg_temp.profile_input('island'))), 'already_accepted', 'snapshot retry uses unchanged request identity');

reset role;
create function pg_temp.persisted_profile_rows() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'heads',(select jsonb_agg(to_jsonb(t)) from public.learner_profile_heads t),
 'versions',(select jsonb_agg(to_jsonb(t)) from public.learner_profile_versions t),
 'receipts',(select jsonb_agg(to_jsonb(t)) from public.learner_profile_write_receipts t),
 'conflicts',(select jsonb_agg(to_jsonb(t)) from private.learner_profile_conflicts t),
 'imports',(select jsonb_agg(to_jsonb(t)) from private.learner_profile_import_backups t),
 'resets',(select jsonb_agg(to_jsonb(t)) from private.learner_profile_resets t)
 )
$$;
create temporary table before_rejection as select pg_temp.persisted_profile_rows() as rows;
grant select on before_rejection to authenticated;
set local role authenticated;
select throws_ok(format('select * from public.commit_my_learner_profile(%L::uuid,%L::uuid,1,3,%L::jsonb)',
 gen_random_uuid(),(select profile_id from opened),envelope), '22023', null, name || ' cannot partially commit')
from owned_profile_inputs where name in ('cloud-over','island-over','bad-xp','bad-counter','unsafe-counter','bad-marker','bad-date','corrupt','bad-bytes') order by name;
select is(pg_temp.persisted_profile_rows(),(select rows from before_rejection),'rejections preserve exact heads, versions, receipts and protection records');
select throws_ok($$select * from public.import_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',(select profile_id from opened),1,3,pg_temp.profile_input('corrupt'),true)$$,'22023',null,'invalid import cannot replace the snapshot');
select throws_ok($$select * from public.start_over_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',(select profile_id from opened),1,3,pg_temp.profile_input('bad-marker'),true)$$,'22023',null,'invalid reset cannot create a generation');
select is(pg_temp.persisted_profile_rows(),(select rows from before_rejection),'failed import/reset preserve all durable and protection records');

select is((select status from public.import_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',(select profile_id from opened),1,3,pg_temp.profile_input('opaque'),true)), 'replaced', 'import preserves an opaque unsupported gameplay version for Godot/recovery');
select is((select status from public.rollback_my_learner_profile_import('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')), 'rolled_back', 'import rollback validates and restores the populated island');
create temporary table conflict as select * from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',(select profile_id from opened),1,3,pg_temp.profile_input('opaque'));
select is((select status from conflict),'conflict','stale snapshot sync preserves both valid inputs');
select is((select envelope from public.choose_my_learner_profile_conflict((select conflict_id from conflict),'device',true)),pg_temp.profile_input('opaque'),'explicit device choice returns the exact selected snapshot and XP');
select is((select status from public.restore_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','protected',(select conflict_id from conflict),null,null,null,null,true)), 'restored', 'protected recovery validates the current fields');
create temporary table started_over as select * from public.start_over_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',(select profile_id from opened),1,(select revision from public.learner_profile_heads),pg_temp.profile_input('reset'),true);
select is((select status from started_over),'started_over','XP-aware blank reset starts a new generation');
select is((select generation from started_over),2::bigint,'reset generation identity is unchanged');
select is((select envelope from public.undo_my_learner_profile_start_over((select reset_id from started_over),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',true)),pg_temp.profile_input('island'),'Undo restores exact protected island/XP/legacy claims');
select * from finish();
rollback;
