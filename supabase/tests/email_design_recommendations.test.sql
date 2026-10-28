begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
\ir helpers/reminder_521_fixtures.sql
update private.learner_profile_access_control set rollout_state='signed-in-public' where singleton;
select is(public.reminder_delivery_is_enabled(),false,'email redesign does not activate sending');
select ok(not has_table_privilege('authenticated','private.reminder_channel_history','SELECT'),'peer addition/deletion history is private');
select ok(not has_function_privilege('authenticated','public.claim_due_typed_reminder_design(timestamptz,integer,integer,integer)','EXECUTE'),'browser cannot claim frozen email content');
select pg_temp.email_fixture('52700000-0000-4000-8000-000000000001','Asia/Taipei','2026-10-26',0,0,false,true);
select pg_temp.email_fixture('52700000-0000-4000-8000-000000000002','Asia/Taipei','2026-10-26',0,0,false,false);
select pg_temp.email_fixture('52700000-0000-4000-8000-000000000003','Asia/Taipei','2026-10-26',0,0,false,false);
create function pg_temp.email_config(p_user uuid,p_channels jsonb,p_deleted jsonb default '[]'::jsonb) returns text language plpgsql as $$
declare profile jsonb; status text;
begin
 select v.envelope->'profile' into profile from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=p_user;
 profile:=jsonb_set(jsonb_set(profile,'{config,channels}',p_channels),'{config,removedChannelIds}',p_deleted);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 update public.learner_profile_heads set updated_at=now()-interval '40 seconds' where user_id=p_user;
 select r.status into status from public.learner_profile_heads h cross join lateral public.commit_my_learner_profile(
  extensions.gen_random_uuid(),h.profile_id,h.generation,h.revision,private.make_current_profile_envelope(profile,'2026-10-26T10:00:00.000Z')) r where h.user_id=p_user;
 return status;
end $$;
create function pg_temp.channel_list(p_letters text) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('id','UC'||repeat(letter,22),'name','Channel '||letter,'imageUrl','','catalogId',null)) from regexp_split_to_table(p_letters,'') letter
$$;
delete from private.reminder_discovery_channels;
insert into private.reminder_discovery_channels(channel_id,catalog_id,learning_language,channel_name,summary,is_onboarding,thumbnail_url)
select 'UC'||repeat(letter,22),'email-'||letter,case when letter='f' then 'english' else 'mandarin' end,
 'Channel '||letter,'Reviewed channel',letter='e','https://www.edenia.study/images/channel-avatars/example.jpg'
from unnest(array['a','b','c','d','e','f']) letter;
select is(pg_temp.email_config('52700000-0000-4000-8000-000000000001',pg_temp.channel_list('a'),jsonb_build_array('UC'||repeat('d',22))),'accepted','recipient ownership and deletion use accepted profile writes');
select is(pg_temp.email_config('52700000-0000-4000-8000-000000000002',pg_temp.channel_list('bcde')),'accepted','first peer adds reviewed channels');
select is(pg_temp.email_config('52700000-0000-4000-8000-000000000003',pg_temp.channel_list('cde')),'accepted','second peer adds reviewed channels without enrolling in email');
select private.remember_email_channels('52700000-0000-4000-8000-000000000002',null,jsonb_build_object('channels',pg_temp.channel_list('bcde')),'2026-10-26T10:00Z');
select is((select count(*) from private.reminder_channel_history where user_id='52700000-0000-4000-8000-000000000002' and channel_id='UC'||repeat('b',22)),1::bigint,'repeated additions by one learner count once');
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00Z');
select is(private.email_discovery_recommendations('52700000-0000-4000-8000-000000000001','2026-10-26T11:00Z')->0->>'channelId','UC'||repeat('c',22),'distinct other-learner additions determine rank');
select is(private.email_discovery_recommendations('52700000-0000-4000-8000-000000000001','2026-10-26T11:00Z')->1->>'channelId','UC'||repeat('b',22),'less popular non-onboarding precedes more popular onboarding');
select is(private.email_discovery_recommendations('52700000-0000-4000-8000-000000000001','2026-10-26T11:00Z')->2->>'channelId','UC'||repeat('e',22),'onboarding fills only remaining slots');
select is(jsonb_array_length(private.email_discovery_recommendations('52700000-0000-4000-8000-000000000001','2026-10-26T11:00Z')),3,'owned, deleted and other-language channels never fill empty slots');
select is(pg_temp.email_config('52700000-0000-4000-8000-000000000001',pg_temp.channel_list('ad')),'accepted','re-adding a previously deleted channel is an explicit accepted action');
select is(pg_temp.email_config('52700000-0000-4000-8000-000000000001',pg_temp.channel_list('a')),'accepted','subsequent removal can clear the current removed list');
select ok((select deleted_at is not null from private.reminder_channel_history where user_id='52700000-0000-4000-8000-000000000001' and channel_id='UC'||repeat('d',22)),'permanent exclusion survives re-add and clearing current removal markers');
select public.refresh_reminder_eligibility_snapshots(100,'2026-10-26T11:00Z');
update private.reminder_delivery_control set delivery_enabled=true where singleton;
select pg_temp.email_capacity('2026-10-26T11:00Z');
select public.plan_typed_reminders('2026-10-26T11:00Z');
select is((select jsonb_array_length(discovery_channels) from private.reminder_deliveries where user_id='52700000-0000-4000-8000-000000000001'),3,'planner freezes the complete eligible grid');
create temporary table design_claim as select * from public.claim_due_typed_reminder_design('2026-10-26T11:00Z',10,3600,300);
select is((select count(*) from design_claim),1::bigint,'design claim retains existing consent, capacity and claim controls');
select is((select jsonb_array_length(discovery_channels) from design_claim),3,'live worker receives the same frozen grid');
select ok(private.email_discovery_payload_current((select delivery_id from design_claim),'2026-10-26T11:00Z'),'frozen cards are valid before an exclusion changes');
select is(pg_temp.email_config('52700000-0000-4000-8000-000000000001',pg_temp.channel_list('a'),jsonb_build_array('UC'||repeat('b',22))),'accepted','delete a secondary recommendation after claim');
select ok(not private.email_discovery_payload_current((select delivery_id from design_claim),'2026-10-26T11:00Z'),'deletion of any frozen card fences the entire send');
select is((select jsonb_array_length(discovery_channels) from private.reminder_deliveries where id=(select delivery_id from design_claim)),3,'changed eligibility never rewrites a frozen payload');
select private.remember_email_channels('52700000-0000-4000-8000-000000000001',null,jsonb_build_object('channels',pg_temp.channel_list('abcdef')),'2026-10-26T11:00Z');
select is(jsonb_array_length(private.email_discovery_recommendations('52700000-0000-4000-8000-000000000001','2026-10-26T11:00Z')),0,'complete accepted ownership excludes channels beyond the bounded follow projection');
select * from finish();
rollback;
