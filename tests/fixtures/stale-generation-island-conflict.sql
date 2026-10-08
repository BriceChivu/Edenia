begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;
select no_plan();
-- CLIENT_ENVELOPE_INPUTS

insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','handoff-owner@example.test',statement_timestamp());
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
create temporary table opened as select * from public.resolve_my_learner_profile(pg_temp.profile_input('initial'));
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',(select profile_id from opened),1,1,pg_temp.profile_input('island'))),'accepted','initial island snapshot is durable');
create temporary table reset_one as select * from public.start_over_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',(select profile_id from opened),1,2,pg_temp.profile_input('reset'),true);
create temporary table reset_two as select * from public.start_over_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',(select profile_id from opened),2,1,pg_temp.profile_input('reset'),true);
select is((select generation from reset_two),3::bigint,'two deliberate resets advance the cloud generation');
select is((select status from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',(select profile_id from opened),3,1,pg_temp.profile_input('island-different'))),'accepted','new generation contains another island');

-- Model receipts removed by retention, inside this disposable transaction only.
reset role;
delete from private.learner_profile_resets where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select is((select status from public.read_my_latest_learner_profile_reset()),'none','reset transition receipts are absent');
create temporary table current_head as select * from public.resolve_my_learner_profile(null);
select is((select status from current_head),'profile_ready','valid current head opens without transition history');
select is((select generation from current_head),3::bigint,'resolver remains in current generation');
select is((select envelope from current_head),pg_temp.profile_input('island-different'),'resolver returns exact current island and XP');

create temporary table cloud_choice as select * from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',(select profile_id from opened),1,2,pg_temp.profile_input('island'));
select is((select status from cloud_choice),'conflict','stale-generation write preserves a conflict without overwriting');
select is((select envelope from public.resolve_my_learner_profile(null)),pg_temp.profile_input('island-different'),'unconfirmed stale write cannot replace current island');
select is((select device_envelope from public.read_my_learner_profile_conflict((select conflict_id from cloud_choice))),pg_temp.profile_input('island'),'exact stale island remains exportable');
select is((select envelope from public.choose_my_learner_profile_conflict((select conflict_id from cloud_choice),'cloud',true)),pg_temp.profile_input('island-different'),'explicit Cloud choice retains newer-generation snapshot');
select is((select device_envelope from public.read_my_learner_profile_conflict((select conflict_id from cloud_choice))),pg_temp.profile_input('island'),'unchosen stale island remains protected after choice');
create temporary table device_choice as select * from public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',(select profile_id from opened),1,2,pg_temp.profile_input('island'));
select is((select status from device_choice),'conflict','another stale device still requires explicit choice');
select is((select status from public.choose_my_learner_profile_conflict((select conflict_id from device_choice),'device',false)),'confirmation_required','old generation cannot return without confirmation');
create temporary table selected_device as select * from public.choose_my_learner_profile_conflict((select conflict_id from device_choice),'device',true);
select is((select generation from selected_device),1::bigint,'explicit recovery may select the old generation');
select is((select envelope from selected_device),pg_temp.profile_input('island'),'explicit device choice restores the exact island and XP');
select is((select cloud_envelope from public.read_my_learner_profile_conflict((select conflict_id from device_choice))),pg_temp.profile_input('island-different'),'unchosen current island remains protected and exportable');
select * from finish();
rollback;
