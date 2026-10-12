begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select no_plan();

select has_function(
  'public',
  'commit_my_learner_profile',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb'],
  'the authenticated conditional learner-profile commit exists'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'sync-owner@example.test',
  statement_timestamp()
);

update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select status
from public.resolve_my_learner_profile(
  $profile$
    {"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

reset role;

create temporary table progress_sync_fixture on commit drop as
select
  head.user_id,
  head.profile_id,
  head.generation,
  head.revision,
  version.envelope,
  version.payload_sha256,
  version.payload_bytes
from public.learner_profile_heads as head
join public.learner_profile_versions as version
  on version.id = head.current_version_id
 and version.user_id = head.user_id
 and version.profile_id = head.profile_id
 and version.generation = head.generation
 and version.revision = head.revision
where head.user_id = '11111111-1111-4111-8111-111111111111';

grant select on table progress_sync_fixture to authenticated;

select ok(not has_function_privilege('anon', 'public.commit_my_learner_profile_handoff(uuid,uuid,bigint,bigint,jsonb,boolean)', 'EXECUTE'), 'anonymous callers cannot invoke handoff writes');
select ok(not has_function_privilege('anon', 'public.read_my_learner_profile_write_receipt(uuid)', 'EXECUTE'), 'anonymous callers cannot inspect receipts');
select ok((select prosecdef = false from pg_proc where oid = 'public.commit_my_learner_profile_handoff(uuid,uuid,bigint,bigint,jsonb,boolean)'::regprocedure), 'public wrapper remains security invoker');
update public.learner_profile_heads set updated_at = clock_timestamp() - interval '31 seconds' where user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', f.profile_id, f.generation, 1, f.envelope, false) result), 'accepted', 'one ordinary eligible write is accepted');
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', f.profile_id, f.generation, 2, f.envelope, false) result), 'deferred', 'a rapid second device cannot bypass the 30-second budget');
reset role;
select is((select count(*) from public.learner_profile_versions where user_id = '11111111-1111-4111-8111-111111111111'), 2::bigint, 'a deferred upload creates no version');
set local role authenticated;
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('20202020-2020-4020-8020-202020202020', f.profile_id, f.generation, 1, f.envelope, true) result), 'head_changed', 'a head that advances after preflight requests reconciliation without preserving an incidental conflict');
reset role;
select is((select count(*) from private.learner_profile_conflicts where user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'stale trial uploads create no protected conflict growth');
set local role authenticated;
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', f.profile_id, f.generation, 2, f.envelope, true) result), 'accepted', 'locking the phone can flush its changed final candidate');
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('cccccccc-cccc-4ccc-8ccc-cccccccccccc', f.profile_id, f.generation, 3, f.envelope, true) result), 'deferred', 'another device or visibility event cannot take another early flush credit');
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', f.profile_id, f.generation, 2, f.envelope, true) result), 'already_accepted', 'an exact lost acknowledgement retry stays idempotent within the budget');
select is((select status from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 'already_accepted', 'a lost acknowledgement can be inspected without another write');
select is((select revision from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 3::bigint, 'receipt describes the exact accepted revision');
select is((select status from public.read_my_learner_profile_write_receipt('dddddddd-dddd-4ddd-8ddd-dddddddddddd')), 'not_accepted', 'missing receipt remains distinct from accepted');
reset role;
select is((select count(*) from public.learner_profile_versions where user_id = '11111111-1111-4111-8111-111111111111'), 3::bigint, 'defer, acknowledgement inspection and exact retry create no extra versions');
insert into auth.users(id,email,email_confirmed_at) values ('22222222-2222-4222-8222-222222222222','other-handoff-owner@example.test',now());
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select status from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 'not_accepted', 'receipts never reveal another owners operations');
reset role;
update public.learner_profile_heads set updated_at = clock_timestamp() - interval '31 seconds' where user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select result.status from progress_sync_fixture f cross join lateral public.commit_my_learner_profile_handoff('cccccccc-cccc-4ccc-8ccc-cccccccccccc', f.profile_id, f.generation, 3, f.envelope, false) result), 'accepted', 'the deferred phone candidate resumes after the ordinary budget opens');
select is((select result.status from progress_sync_fixture f cross join lateral public.import_my_learner_profile('ffffffff-ffff-4fff-8fff-ffffffffffff', f.profile_id, 1, 4, f.envelope, true) result), 'replaced', 'confirmed import still replaces through its protected API');
select is((select last_replacement_revision from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 5::bigint, 'a retained scalar fences stale changes across an import');
select is((select status from public.rollback_my_learner_profile_import('ffffffff-ffff-4fff-8fff-ffffffffffff')), 'rolled_back', 'import rollback remains available');
select is((select last_replacement_revision from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 6::bigint, 'rollback also establishes a replacement boundary');
create temporary table handoff_conflict as select result.* from progress_sync_fixture f cross join lateral public.commit_my_learner_profile('12121212-1212-4212-8212-121212121212', f.profile_id, 1, 1, f.envelope) result;
select is((select status from handoff_conflict), 'conflict', 'a genuinely stale protected candidate still creates a choice');
select is((select result.status from handoff_conflict f cross join lateral public.choose_my_learner_profile_conflict(f.conflict_id, 'cloud', true) result), 'chosen', 'explicit cloud selection remains protected');
select is((select last_replacement_revision from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 7::bigint, 'an explicit conflict choice also fences older changes');
create temporary table handoff_reset as select result.* from progress_sync_fixture f cross join lateral public.start_over_my_learner_profile('13131313-1313-4313-8313-131313131313', f.profile_id, 1, 7, f.envelope, true) result;
select is((select status from handoff_reset), 'started_over', 'Start over still changes generation');
select is((select last_replacement_revision from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 0::bigint, 'generation changes reset the within-generation boundary');
select is((select result.status from handoff_reset f cross join lateral public.undo_my_learner_profile_start_over(f.reset_id, '14141414-1414-4414-8414-141414141414', true) result), 'undone', 'Undo restores the protected previous profile');
select is((select last_replacement_revision from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 2::bigint, 'Undo establishes a boundary in the restored generation');
reset role;
update private.learner_profile_access_control set rollout_state = 'tester-trial', tester_user_ids = array['22222222-2222-4222-8222-222222222222'::uuid] where singleton;
set local role authenticated;
select throws_ok($$select * from public.read_my_learner_profile_write_receipt('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '42501', 'Learner profile access disabled', 'removal from the trial fences receipt inspection');
select throws_ok($$select * from public.commit_my_learner_profile_handoff('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select profile_id from progress_sync_fixture), 1, 4, (select envelope from progress_sync_fixture), true)$$, '42501', 'Learner profile access disabled', 'removal from the trial fences session-end writes');
select * from finish();
rollback;
