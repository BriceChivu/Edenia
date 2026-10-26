begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;
select no_plan();
select has_function('public','commit_my_learner_profile_records',array['uuid','uuid','bigint','bigint','jsonb','boolean'],'typed conditional commit exists');
insert into auth.users(id,email,email_confirmed_at) values
 ('51300000-0000-4000-8000-000000000001','record-owner@example.test',now()),
 ('51300000-0000-4000-8000-000000000002','record-other@example.test',now());
update private.learner_profile_access_control set rollout_state='signed-in-public',record_write_interval_ms=30000 where singleton;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='51300000-0000-4000-8000-000000000001';
select * from public.resolve_my_learner_profile($profile${"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}$profile$::jsonb);
reset role;
create temporary table record_scope as select user_id,profile_id,generation from public.learner_profile_heads where user_id='51300000-0000-4000-8000-000000000001';
create temporary table record_requests(name text primary key, operation_id uuid, base_revision bigint,batch jsonb);
grant select on record_scope,record_requests to authenticated;
create function pg_temp.send_record(p_name text) returns text language sql volatile as $fn$
 select result.status from record_requests r cross join record_scope s cross join lateral
 public.commit_my_learner_profile_records(r.operation_id,s.profile_id,s.generation,r.base_revision,r.batch,false) result where r.name=p_name;
$fn$;
create function pg_temp.allow_record_write() returns void language sql volatile as $fn$
 update public.learner_profile_heads set updated_at=clock_timestamp()-interval '40 seconds' where user_id='51300000-0000-4000-8000-000000000001';
$fn$;
create temporary table record_envelope_parity as select '{"exportedAt":"2026-10-26T00:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":1041,"payloadSha256":"iBkS6RVw5CKe5sdk8z-SpqxInuGCtvCIQzwsE5znFbI"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":null,"languages":["french"],"level":"beginner","selectedChannelCatalogIds":[],"updatedAt":null},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":null,"levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":null,"walkthroughCompleted":true,"walkthroughCompletedAt":null},"tinySwordsIsland":{"coordinates":[1e-7,1.2e+21,1.2345678901234567],"labels":{"2":"b","11":"a","𐀀":"supplementary","":"private-use"},"version":38},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}'::jsonb as expected;
select is(private.make_current_profile_envelope(expected->'profile',expected->>'exportedAt'),expected,'materialized envelope exactly matches portable JavaScript bytes and integrity with opaque island numbers and UTF16 keys') from record_envelope_parity;
select lives_ok($$select private.assert_learner_profile_envelope(private.make_current_profile_envelope(expected->'profile',expected->>'exportedAt')) from record_envelope_parity$$,'materialized parity envelope passes unchanged complete-profile validation');
insert into record_requests values('first','51310000-0000-4000-8000-000000000001',1,'{"exportedAt":"2026-10-26T00:00:00.000Z","units":[{"after":{"favorite":true,"hiddenFromGrid":false,"hiddenFromGridAt":null,"manuallyAdded":false,"pausedAt":null,"removedFromFeedAt":null,"resumeAtSeconds":null,"status":"unwatched","watchLater":false,"watchProgress":[{"experienceSeconds":20,"id":"video:record-video:2026-10-26T00:00:00.000Z:30:1","seconds":30,"studyDay":"2026-10-26","watchedAt":"2026-10-26T00:00:00.000Z"}],"watchProgressTracked":true,"watchedAt":null,"watchedConfirmationUnlockedAt":null},"afterPresent":true,"key":"record-video","kind":"video","metadata":{"aspectRatio":null,"channelId":null,"channelImageUrl":"","channelTitle":"","duration":600,"id":"record-video","isShort":false,"publishedAt":null,"source":null,"thumbnail":"","title":"A retained lesson"}},{"after":{"created":0,"observedAt":"2026-10-26T00:00:00.000Z","reviewed":3},"afterPresent":true,"key":"2026-10-26","kind":"anki"}],"version":1}'::jsonb);
select pg_temp.allow_record_write();
set local role authenticated;
select is(pg_temp.send_record('first'),'accepted','changed video and Anki commit atomically');
select is(pg_temp.send_record('first'),'already_accepted','exact retry keeps accepted identity');
select is((select status from public.read_my_learner_profile_record_receipt('51310000-0000-4000-8000-000000000001')),'already_accepted','typed acknowledgement remains readable');
reset role;
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),2::bigint,'one head advances once');
select is((select count(*) from public.learner_profile_versions where user_id=(select user_id from record_scope)),1::bigint,'frequent acceptance need not create a full historical version');
select is((select private.assemble_current_profile(user_id)#>>'{videos,record-video,title}' from record_scope),'A retained lesson','new display metadata remains available');
select is((select private.assemble_current_profile(user_id)#>>'{anki,2026-10-26,reviewed}' from record_scope),'3','coupled day is acknowledged');
select is((select records_profile_bytes from public.learner_profile_heads where user_id=(select user_id from record_scope)),
 (select octet_length(convert_to(private.canonical_jsonb_text(private.assemble_current_profile(user_id)),'UTF8')) from record_scope),'incremental canonical bytes equal complete profile');
insert into record_requests select 'mismatch',operation_id,base_revision,jsonb_set(batch,'{units,0,after,favorite}','false') from record_requests where name='first';
set local role authenticated;
select throws_ok($$select pg_temp.send_record('mismatch')$$,'22023','Learner profile operation input mismatch','same operation cannot change its input');
select is((select revision from public.resolve_my_learner_profile(null)),2::bigint,'legacy opening materializes latest acknowledged revision');
reset role;
select is((select count(*) from public.learner_profile_versions where user_id=(select user_id from record_scope)),2::bigint,'opening creates one immutable current snapshot');
select is((select v.envelope#>>'{profile,anki,2026-10-26,reviewed}' from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=(select user_id from record_scope)),'3','legacy readers see the complete latest profile');
insert into record_requests select 'second','51310000-0000-4000-8000-000000000002',2,
 jsonb_build_object('version',1,'exportedAt',batch->'exportedAt','units',jsonb_build_array((batch#>'{units,0}')-'metadata'||'{"after":{"favorite":false}}'::jsonb)) from record_requests where name='first';
-- Preserve the complete personal unit, changing only one field; metadata is omitted.
update record_requests set batch=jsonb_set(batch,'{units,0,after}',jsonb_set((select batch#>'{units,0,after}' from record_requests where name='first'),'{favorite}','false')) where name='second';
set local role authenticated;
select is(pg_temp.send_record('second'),'deferred','client timing cannot bypass ordinary server cadence');
reset role;
select pg_temp.allow_record_write();
set local role authenticated;
select is(pg_temp.send_record('second'),'accepted','existing video edit omits metadata');
reset role;
select is((select private.assemble_current_profile(user_id)#>>'{videos,record-video,title}' from record_scope),'A retained lesson','metadata survives recurring personal edits');
select is((select count(*) from public.learner_profile_versions where user_id=(select user_id from record_scope)),2::bigint,'next typed acceptance does not multiply snapshots');
insert into record_requests select 'stale','51310000-0000-4000-8000-000000000003',1,batch from record_requests where name='second';
set local role authenticated;
select is(pg_temp.send_record('stale'),'head_changed','stale distinct edit returns the existing rebase opportunity');
set local request.jwt.claim.sub='51300000-0000-4000-8000-000000000002';
select is((select status from public.read_my_learner_profile_record_receipt('51310000-0000-4000-8000-000000000001')),'not_accepted','another owner cannot read the receipt');
select is(pg_temp.send_record('stale'),'head_changed','another owner cannot write this profile');
set local request.jwt.claim.sub='51300000-0000-4000-8000-000000000001';
reset role;
insert into record_requests select 'invalid','51310000-0000-4000-8000-000000000004',3,
 jsonb_set(batch,'{units,0,after,watchProgress,0,experienceSeconds}','999') from record_requests where name='second';
select pg_temp.allow_record_write();
set local role authenticated;
select throws_ok($$select pg_temp.send_record('invalid')$$,'22023','Learner profile experience state is invalid','changed units keep existing study validation');
reset role;
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),3::bigint,'rejected unit cannot advance head');
select is((select private.assemble_current_profile(user_id)#>>'{videos,record-video,watchProgress,0,experienceSeconds}' from record_scope),'20','failed batch rolls back every current-record write');
insert into record_requests select 'delete','51310000-0000-4000-8000-000000000005',3,
 jsonb_build_object('version',1,'exportedAt',batch->'exportedAt','units',jsonb_build_array(
 '{"kind":"video","key":"record-video","afterPresent":false}'::jsonb,
 '{"kind":"anki","key":"2026-10-26","afterPresent":false}'::jsonb)) from record_requests where name='first';
set local role authenticated;
select is(pg_temp.send_record('delete'),'accepted','deletion is explicit and atomic');
reset role;
select ok((select not (private.assemble_current_profile(user_id)->'videos')?'record-video' from record_scope),'removed video stays absent');
select is((select records_profile_bytes from public.learner_profile_heads where user_id=(select user_id from record_scope)),
 (select octet_length(convert_to(private.canonical_jsonb_text(private.assemble_current_profile(user_id)),'UTF8')) from record_scope),'last-item deletion preserves exact byte accounting');
select is((public.export_account_server_data_for_service('51300000-0000-4000-8000-000000000001')#>>'{learner_profile,revision}'),'4','server export includes every accepted current update');
-- A response delayed beyond the receipt window cannot be applied twice after
-- pruning: its original base is necessarily older than the accepted head.
update public.learner_profile_write_receipts set accepted_at=clock_timestamp()-interval '4 hours' where user_id=(select user_id from record_scope) and operation_id='51310000-0000-4000-8000-000000000001';
delete from public.learner_profile_write_receipts where user_id=(select user_id from record_scope) and operation_id='51310000-0000-4000-8000-000000000001';
set local role authenticated;
select is(pg_temp.send_record('first'),'head_changed','evicted receipt retries cannot duplicate accepted changes');
reset role;
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),4::bigint,'evicted retry leaves current revision intact');
-- Full-envelope rollback and old clients share this exact authority.
insert into record_requests select 'again','51310000-0000-4000-8000-000000000006',4,batch from record_requests where name='first';
select pg_temp.allow_record_write();
set local role authenticated;
select is(pg_temp.send_record('again'),'accepted','a new unit batch can resume after snapshot materialization');
reset role;
create temporary table old_client_candidate as select private.make_current_profile_envelope(
 jsonb_set(private.assemble_current_profile(user_id),'{config,weeklyGoalHours}','6'),
 '2026-10-26T00:00:00.000Z') as envelope from record_scope;
grant select on old_client_candidate to authenticated;
set local role authenticated;
select is((select result.status from record_scope s cross join old_client_candidate c cross join lateral
 public.commit_my_learner_profile('51310000-0000-4000-8000-000000000007',s.profile_id,s.generation,5,c.envelope) result),
 'accepted','legacy full writer commits against latest accepted typed revision');
reset role;
select ok((select not records_active from public.learner_profile_heads where user_id=(select user_id from record_scope)),
 'full writer retires current records in the same head transaction');
select is((select v.envelope#>>'{profile,videos,record-video,watchProgress,0,experienceSeconds}' from public.learner_profile_heads h
 join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=(select user_id from record_scope)),
 '20','transport rollback preserves acknowledged study facts');
insert into record_requests select 'after-full','51310000-0000-4000-8000-000000000008',6,batch from record_requests where name='second';
select pg_temp.allow_record_write();
set local role authenticated;
select is(pg_temp.send_record('after-full'),'accepted','typed delivery can reinitialize from a full writer');
reset role;
select is((select private.assemble_current_profile(user_id)#>>'{config,weeklyGoalHours}' from record_scope),'6','record reinitialization keeps the full writer edit');
-- Reset must freeze revision 7, even though its recovery pointer still names 6.
create temporary table reset_candidate as select private.make_current_profile_envelope(
 v.envelope->'profile','2026-10-26T00:00:00.000Z') as envelope
 from public.learner_profile_versions v where v.user_id=(select user_id from record_scope) and v.revision=1;
grant select on reset_candidate to authenticated;
set local role authenticated;
select is((select result.status from record_scope s cross join reset_candidate c cross join lateral
 public.start_over_my_learner_profile('51310000-0000-4000-8000-000000000009',s.profile_id,s.generation,7,c.envelope,true) result),
 'started_over','reset can protect a newer typed authority');
reset role;
select is((select v.revision from private.learner_profile_resets r join public.learner_profile_versions v on v.id=r.prior_version_id
 where r.user_id=(select user_id from record_scope)),7::bigint,'reset prior copy names the exact latest revision');
select is((select v.envelope#>>'{profile,videos,record-video,favorite}' from private.learner_profile_resets r
 join public.learner_profile_versions v on v.id=r.prior_version_id where r.user_id=(select user_id from record_scope)),
 'false','protected reset candidate includes every accepted typed edit');
set local role authenticated;
select is(pg_temp.send_record('after-full'),'already_accepted','generation replacement does not erase an exact old receipt');
select is(pg_temp.send_record('stale'),'head_changed','a new request cannot write across a reset generation');
select is((select last_replacement_revision from public.read_my_learner_profile_record_receipt('51310000-0000-4000-8000-000000000010')),
 (select last_replacement_revision from public.read_my_learner_profile_write_receipt('51310000-0000-4000-8000-000000000010')),
 'missing typed receipts retain the same replacement fence');
reset role;
set local role authenticated;
select is((select request_sha256 from public.commit_my_learner_profile_records('51310000-0000-4000-8000-000000000020','51390000-0000-4000-8000-000000000001',1,1,'{"exportedAt":"2026-10-26T00:00:00.000Z","units":[{"after":{"coordinates":[1e-7,1.2e+21,1.2345678901234567],"labels":{"2":"b","11":"a","𐀀":"supplementary","":"private-use"},"version":38},"afterPresent":true,"key":"tinySwordsIsland","kind":"island"}],"version":1}'::jsonb,false)),'sd8Bn_EzOewQrXXC4CktomvdnAdq87s9j0OKrfmywww','typed request digest matches JavaScript for opaque island numbers and Unicode keys');
reset role;
-- Faster cadence is a matched server setting; snapshots retain the ordinary
-- recovery interval rather than multiplying with each small acceptance.
update record_scope s set generation=h.generation from public.learner_profile_heads h where h.user_id=s.user_id;
update private.learner_profile_access_control set record_write_interval_ms=5000 where singleton;
insert into record_requests select 'five-second','51310000-0000-4000-8000-000000000021',1,batch from record_requests where name='first';
update public.learner_profile_heads set updated_at=clock_timestamp()-interval '6 seconds' where user_id=(select user_id from record_scope);
set local role authenticated;
select is(pg_temp.send_record('five-second'),'accepted','five-second target requires and respects matching server cadence');
reset role;
create temporary table snapshot_before as select count(*) as count from public.learner_profile_versions where user_id=(select user_id from record_scope);
update public.learner_profile_versions set created_at=clock_timestamp()-interval '31 seconds' where id=(select current_version_id from public.learner_profile_heads where user_id=(select user_id from record_scope));
insert into record_requests select 'snapshot','51310000-0000-4000-8000-000000000022',2,batch from record_requests where name='second';
update public.learner_profile_heads set updated_at=clock_timestamp()-interval '6 seconds' where user_id=(select user_id from record_scope);
set local role authenticated;
select is(pg_temp.send_record('snapshot'),'accepted','eligible typed commit creates its periodic recovery snapshot');
reset role;
select is((select count(*) from public.learner_profile_versions where user_id=(select user_id from record_scope)),(select count+1 from snapshot_before),'ordinary snapshot interval creates one complete version');
select is((select v.revision from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=(select user_id from record_scope)),3::bigint,'periodic snapshot contains the latest accepted revision');
-- Inbound and assembled bounds are independent; a small-enough update must
-- not push the complete acknowledged portable profile over its existing cap.
insert into record_requests select 'missing-metadata','51310000-0000-4000-8000-000000000023',3,
 jsonb_set(batch,'{units,0,key}','"unseen-video"') from record_requests where name='second';
insert into record_requests select 'oversize-request','51310000-0000-4000-8000-000000000024',3,
 jsonb_set(batch,'{units,0,metadata,title}',to_jsonb(repeat('x',2097152))) from record_requests where name='first';
insert into record_requests select 'oversize-profile','51310000-0000-4000-8000-000000000025',3,
 jsonb_build_object('version',1,'exportedAt','2026-10-26T00:00:00.000Z','units',jsonb_build_array(jsonb_build_object(
  'kind','progression','key','legacyCityProgress','afterPresent',true,'after',jsonb_build_object('padding',
   repeat('x',2097152-private.current_profile_envelope_bytes(h.records_profile_bytes,h.records_exported_at)+128-36)))))
 from public.learner_profile_heads h where h.user_id=(select user_id from record_scope);
select pg_temp.allow_record_write();
set local role authenticated;
select throws_ok($$select pg_temp.send_record('missing-metadata')$$,'22023','New video requires metadata','first video update cannot omit its display record');
select throws_ok($$select pg_temp.send_record('oversize-request')$$,'22023','Learner profile record request is invalid','oversize record request is rejected');
select throws_ok($$select pg_temp.send_record('oversize-profile')$$,'22023','Learner profile byte length is invalid','small-enough request cannot exceed the complete profile cap');
reset role;
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),3::bigint,'all validation failures preserve the accepted head');
-- Seven acknowledged changes can be newer than the last immutable snapshot.
create temporary table gap_results(step integer,status text);
do $gap$ declare step integer; batch_value jsonb; begin
 for step in 0..6 loop
  select jsonb_set(batch,'{units,0,after,favorite}',to_jsonb(step%2=0)) into batch_value from record_requests where name='second';
  insert into record_requests values('gap-'||step,('51310000-0000-4000-8000-'||lpad((30+step)::text,12,'0'))::uuid,3+step,batch_value);
  update public.learner_profile_heads set updated_at=clock_timestamp()-interval '6 seconds' where user_id=(select user_id from record_scope);
  insert into gap_results values(step,pg_temp.send_record('gap-'||step));
 end loop;
end; $gap$;
select is((select count(*) from gap_results where status='accepted'),7::bigint,'all seven current-only revisions are acknowledged');
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),10::bigint,'single authority reaches revision 10');
select is((select v.revision from public.learner_profile_heads h join public.learner_profile_versions v on v.id=h.current_version_id where h.user_id=(select user_id from record_scope)),3::bigint,'immutable snapshot can remain seven revisions behind');
create temporary table before_materialize_failure as select private.assemble_current_profile(user_id) as profile from record_scope;
create function pg_temp.fail_current_materialization() returns trigger language plpgsql as $fail$
 begin if new.user_id='51300000-0000-4000-8000-000000000001' and new.revision=10 then
  raise exception 'Synthetic materialization failure' using errcode='55P03'; end if; return new; end; $fail$;
create trigger fixture_materialization_failure before insert on public.learner_profile_versions for each row execute function pg_temp.fail_current_materialization();
set local role authenticated;
select throws_ok($$select * from public.resolve_my_learner_profile(null)$$,'55P03','Synthetic materialization failure','a genuine SQL failure remains retryable rather than causing rollback');
reset role;
select is((select private.assemble_current_profile(user_id) from record_scope),(select profile from before_materialize_failure),'SQL failure leaves every acknowledged current row intact');
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),10::bigint,'SQL failure leaves head intact');
set local role authenticated;
select is((select status from public.read_my_learner_profile_record_receipt('51310000-0000-4000-8000-000000000036')),'already_accepted','SQL failure keeps the immutable accepted receipt');
reset role;
drop trigger fixture_materialization_failure on public.learner_profile_versions;
-- A bounded corrupt accounting record is different from a transient SQL failure.
-- Preserve its exact raw candidate, then use existing same-generation recovery.
update public.learner_profile_heads set records_profile_bytes=records_profile_bytes+1 where user_id=(select user_id from record_scope);
set local role authenticated;
select is((select status from public.resolve_my_learner_profile(null)),'profile_ready','invalid accounting reaches trusted-predecessor opening');
reset role;
select is((select generation from public.learner_profile_heads where user_id=(select user_id from record_scope)),2::bigint,'trusted recovery remains within the current generation');
select is((select revision from public.learner_profile_heads where user_id=(select user_id from record_scope)),11::bigint,'recovery advances past every acknowledged revision');
select is((select v.envelope->'profile' from private.learner_profile_recoveries r join public.learner_profile_versions v on v.id=r.displaced_version_id
 where r.user_id=(select user_id from record_scope) and r.source='current-records'),(select profile from before_materialize_failure),'displaced invalid candidate retains exact original profile content');
select ok((select r.protected_until>=r.restored_at+interval '30 days' from private.learner_profile_recoveries r
 where r.user_id=(select user_id from record_scope) and r.source='current-records'),'existing recovery retention protects the displaced current candidate');
select ok((select v.envelope?'currentRecordsRecovery' from private.learner_profile_recoveries r join public.learner_profile_versions v on v.id=r.displaced_version_id
 where r.user_id=(select user_id from record_scope) and r.source='current-records'),'corruption marker is outside the retained raw profile');
-- Economy validation is internal to its complete unit. An invalid economy
-- must still reject every coupled update; untouched valid receipts remain intact.
insert into record_requests values('valid-economy','51310000-0000-4000-8000-000000000040',11,
 '{"version":1,"exportedAt":"2026-10-26T00:00:00.000Z","units":[{"kind":"anki","key":"2026-10-26","afterPresent":true,"after":{"reviewed":4,"created":0,"observedAt":"2026-10-26T00:00:00.000Z"}},{"kind":"progression","key":"townEconomy","afterPresent":true,"after":{"version":1,"mode":"legacy","rewards":{"video:record-video:2026-10-26T00:00:00.000Z":{"baseline":0,"seconds":600}},"purchases":{"garden-flower-1":15}}}]}'::jsonb);
select pg_temp.allow_record_write();
set local role authenticated;
select is(pg_temp.send_record('valid-economy'),'accepted','complete funded economy and study units commit together');
reset role;
insert into record_requests select 'invalid-economy','51310000-0000-4000-8000-000000000041',12,
 jsonb_set(jsonb_set(batch,'{units,0,after,reviewed}','10'),'{units,1,after,rewards}','{}') from record_requests where name='valid-economy';
select pg_temp.allow_record_write();
set local role authenticated;
select throws_ok($$select pg_temp.send_record('invalid-economy')$$,'22023','Learner profile economy is invalid','an unfunded economy cannot bypass validation in a coupled batch');
reset role;
select is((select private.assemble_current_profile(user_id)#>>'{anki,2026-10-26,reviewed}' from record_scope),'4','failed coupled economy update rolls back the otherwise valid study unit');
insert into record_requests select 'untouched-economy','51310000-0000-4000-8000-000000000042',12,
 jsonb_set(batch,'{units}',jsonb_build_array(jsonb_set(batch#>'{units,0}','{after,reviewed}','5'))) from record_requests where name='valid-economy';
set local role authenticated;
select is(pg_temp.send_record('untouched-economy'),'accepted','study-only update can retain the unchanged validated economy');
reset role;
select is((select private.assemble_current_profile(user_id)->'townEconomy' from record_scope),
 (select batch#>'{units,1,after}' from record_requests where name='valid-economy'),'study-only update preserves the complete existing reward and purchase receipts');
-- Receipt retention must not prevent privacy/account-deletion cascades.
select lives_ok($$delete from auth.users where id='51300000-0000-4000-8000-000000000001'$$,'account deletion can cascade through recent typed receipts and records');
select is((select count(*) from private.learner_profile_current_records where user_id='51300000-0000-4000-8000-000000000001'),0::bigint,'account deletion removes the current typed records');
select is((select count(*) from public.learner_profile_write_receipts where user_id='51300000-0000-4000-8000-000000000001'),0::bigint,'account deletion removes recent typed receipts');
select ok(exists(select 1 from auth.users where id='51300000-0000-4000-8000-000000000002'),'account deletion leaves the other owner intact');
select * from finish();
rollback;
