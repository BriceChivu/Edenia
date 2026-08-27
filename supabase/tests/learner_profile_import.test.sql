begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(28);

select has_function(
  'public',
  'import_my_learner_profile',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'boolean'],
  'the protected learner-profile import exists'
);

select has_function(
  'public',
  'read_my_learner_profile_import_backup',
  array['uuid'],
  'an owner can verify the protected import backup'
);

select has_function(
  'public',
  'rollback_my_learner_profile_import',
  array['uuid'],
  'a failed browser import can roll its cloud revision back'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.import_my_learner_profile(uuid,uuid,bigint,bigint,jsonb,boolean)'::regprocedure
  ),
  false,
  'the Data API import is an invoker wrapper'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.read_my_learner_profile_import_backup(uuid)'::regprocedure
  ),
  false,
  'the Data API backup reader is an invoker wrapper'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.rollback_my_learner_profile_import(uuid)'::regprocedure
  ),
  false,
  'the Data API rollback is an invoker wrapper'
);

insert into auth.users (id, email, email_confirmed_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'import-owner@example.test',
    statement_timestamp()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'cross-account-import@example.test',
    statement_timestamp()
  );

update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select *
from public.resolve_my_learner_profile(
  $profile$
    {"exportedAt":"2026-08-22T01:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":976,"payloadSha256":"BrmDISMDH-CydpnAIgiQ1FnBBV1wVrqo-Pc4PDMCINg"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-22T01:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":[],"updatedAt":"2026-08-22T01:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-22T01:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-22T01:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

select results_eq(
  $query$
    select status
    from public.import_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      $profile$
        {"exportedAt":"2026-08-22T02:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":999,"payloadSha256":"3zK-qWAD7TUsEJEn9-VMo7O-pqeeeNz4AfTK7HEvaAM"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"fr","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-22T00:00:00.000Z","languages":["japanese"],"level":"beginner","selectedChannelCatalogIds":[],"updatedAt":"2026-08-22T02:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-22T00:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-22T00:00:00.000Z","walkthroughCompleted":true,"walkthroughCompletedAt":"2026-08-22T00:00:00.000Z"},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
      $profile$::jsonb,
      false
    )
  $query$,
  $$values ('confirmation_required'::text)$$,
  'import requires an explicit replacement confirmation'
);

select is(
  (select revision from public.learner_profile_heads),
  1::bigint,
  'declining confirmation leaves the current head unchanged'
);

select results_eq(
  $query$
    select status, generation, revision, base_revision, payload_sha256
    from public.import_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      $profile$
        {"exportedAt":"2026-08-22T02:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":999,"payloadSha256":"3zK-qWAD7TUsEJEn9-VMo7O-pqeeeNz4AfTK7HEvaAM"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"fr","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-22T00:00:00.000Z","languages":["japanese"],"level":"beginner","selectedChannelCatalogIds":[],"updatedAt":"2026-08-22T02:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-22T00:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-22T00:00:00.000Z","walkthroughCompleted":true,"walkthroughCompletedAt":"2026-08-22T00:00:00.000Z"},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
      $profile$::jsonb,
      true
    )
  $query$,
  $$values (
    'replaced'::text,
    1::bigint,
    2::bigint,
    1::bigint,
    '3zK-qWAD7TUsEJEn9-VMo7O-pqeeeNz4AfTK7HEvaAM'::text
  )$$,
  'confirmed import creates one generation-aware revision'
);

select is(
  (
    select envelope #>> '{profile,learnerProfile,languages,0}'
    from public.learner_profile_versions
    where id = (select current_version_id from public.learner_profile_heads)
  ),
  'japanese',
  'the imported portable profile becomes the cloud head'
);

reset role;

select ok(
  (
    select protected_until >= created_at + interval '30 days'
      and state = 'protected'
      and previous_version_id is not null
      and imported_version_id is not null
    from private.learner_profile_import_backups
    where operation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'the prior cloud version is protected for at least 30 days'
);

set local role authenticated;

select results_eq(
  $query$
    select
      status,
      base_revision,
      imported_revision,
      previous_envelope #>> '{integrity,payloadSha256}',
      imported_envelope #>> '{integrity,payloadSha256}'
    from public.read_my_learner_profile_import_backup(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $query$,
  $$values (
    'protected'::text,
    1::bigint,
    2::bigint,
    'BrmDISMDH-CydpnAIgiQ1FnBBV1wVrqo-Pc4PDMCINg'::text,
    '3zK-qWAD7TUsEJEn9-VMo7O-pqeeeNz4AfTK7HEvaAM'::text
  )$$,
  'the owner can verify both protected envelopes'
);

select results_eq(
  $query$
    select status, revision
    from public.import_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 2),
      true
    )
  $query$,
  $$values ('already_replaced'::text, 2::bigint)$$,
  'an exact import retry returns its protected revision'
);

select is(
  (select count(*) from public.learner_profile_versions),
  2::bigint,
  'an import retry creates no duplicate revision'
);

select results_eq(
  $query$
    select status, revision
    from public.import_my_learner_profile(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1),
      true
    )
  $query$,
  $$values ('stale_revision'::text, 2::bigint)$$,
  'a stale import is rejected without opening a merge conflict'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select *
from public.resolve_my_learner_profile(
  $profile$
    {"exportedAt":"2026-08-22T01:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":976,"payloadSha256":"BrmDISMDH-CydpnAIgiQ1FnBBV1wVrqo-Pc4PDMCINg"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-22T01:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":[],"updatedAt":"2026-08-22T01:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-22T01:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-22T01:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

reset role;

select results_eq(
  $query$
    select
      (
        select count(*)
        from public.learner_profile_versions
        where user_id = '11111111-1111-4111-8111-111111111111'
      ),
      (
        select count(*)
        from private.learner_profile_conflicts
        where user_id = '11111111-1111-4111-8111-111111111111'
      ),
      (
        select revision
        from public.learner_profile_heads
        where user_id = '11111111-1111-4111-8111-111111111111'
      )
  $query$,
  $$values (2::bigint, 0::bigint, 2::bigint)$$,
  'stale import leaves versions, conflicts, and current head unchanged'
);

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $query$
    select status, revision
    from public.import_my_learner_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select profile_id from public.learner_profile_heads where user_id = auth.uid()),
      1,
      1,
      $profile$
        {"exportedAt":"2026-08-22T02:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":999,"payloadSha256":"3zK-qWAD7TUsEJEn9-VMo7O-pqeeeNz4AfTK7HEvaAM"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"fr","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-22T00:00:00.000Z","languages":["japanese"],"level":"beginner","selectedChannelCatalogIds":[],"updatedAt":"2026-08-22T02:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-22T00:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-22T00:00:00.000Z","walkthroughCompleted":true,"walkthroughCompletedAt":"2026-08-22T00:00:00.000Z"},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
      $profile$::jsonb,
      true
    )
  $query$,
  $$values ('replaced'::text, 2::bigint)$$,
  'the same owner-neutral export can be imported by another account'
);

select results_eq(
  $query$
    select status
    from public.read_my_learner_profile_import_backup(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $query$,
  $$values ('recovery_required'::text)$$,
  'another owner cannot read the protected import backup'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status
    from public.commit_my_learner_profile(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      (select profile_id from public.learner_profile_heads where user_id = auth.uid()),
      1,
      1,
      (select envelope from public.learner_profile_versions where user_id = auth.uid() and revision = 1)
    )
  $query$,
  $$values ('conflict'::text)$$,
  'a concurrent stale candidate can retain the imported revision as its cloud input'
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.rollback_my_learner_profile_import(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $query$,
  $$values ('rolled_back'::text, 1::bigint, 3::bigint, 1::bigint)$$,
  'a failed local replacement rolls the cloud import back'
);

select is(
  (
    select envelope #>> '{profile,learnerProfile,languages,0}'
    from public.learner_profile_versions
    where id = (
      select current_version_id
      from public.learner_profile_heads
      where user_id = auth.uid()
    )
  ),
  'french',
  'rollback restores the exact previous cloud head'
);

reset role;

select results_eq(
  $query$
    select
      (select count(*) from public.learner_profile_versions where user_id = auth.uid()),
      (select count(*) from public.learner_profile_write_receipts where user_id = auth.uid()),
      (select count(*) from private.learner_profile_import_backups where user_id = auth.uid() and state = 'rolled-back'),
      (select count(*) from private.learner_profile_conflicts where user_id = auth.uid())
  $query$,
  $$values (3::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'rollback preserves immutable import history and concurrent conflict evidence'
);

set local role authenticated;

select results_eq(
  $query$
    select status
    from public.rollback_my_learner_profile_import(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $query$,
  $$values ('already_rolled_back'::text)$$,
  'rollback is idempotent after the prior head is restored'
);

select throws_ok(
  $query$
    select *
    from public.import_my_learner_profile(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      (select profile_id from public.learner_profile_heads where user_id = auth.uid()),
      1,
      3,
      pg_catalog.jsonb_set(
        (
          select envelope
          from public.learner_profile_versions
          where user_id = auth.uid()
            and revision = 1
        ),
        '{integrity,payloadSha256}',
        '"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"'::jsonb
      ),
      true
    )
  $query$,
  '22023',
  'Learner profile integrity is invalid',
  'invalid imported content is rejected without partial acceptance'
);

select throws_ok(
  $query$
    select *
    from public.import_my_learner_profile(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      (select profile_id from public.learner_profile_heads where user_id = auth.uid()),
      1,
      3,
      pg_catalog.jsonb_set(
        (
          select envelope
          from public.learner_profile_versions
          where user_id = auth.uid()
            and revision = 1
        ),
        '{integrity,byteLength}',
        '2097153'::jsonb
      ),
      true
    )
  $query$,
  '22023',
  'Learner profile envelope is invalid',
  'oversized imported content is rejected before any revision is created'
);

select is(
  (
    select count(*)
    from public.learner_profile_versions
    where user_id = auth.uid()
  ),
  3::bigint,
  'validation failures leave the current profile version unchanged'
);

select results_eq(
  $query$
    select status, revision
    from public.commit_my_learner_profile(
      'abababab-abab-4bab-8bab-abababababab',
      (select profile_id from public.learner_profile_heads where user_id = auth.uid()),
      1,
      3,
      (
        select envelope
        from public.learner_profile_versions
        where user_id = auth.uid()
          and revision = 1
      )
    )
  $query$,
  $$values ('accepted'::text, 4::bigint)$$,
  'the restored profile can save a new revision after rollback'
);

select is(
  (
    select revision
    from public.learner_profile_heads
    where user_id = auth.uid()
  ),
  4::bigint,
  'the post-rollback write becomes the current head'
);

select * from finish();
rollback;
