begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(9);

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

select *
from public.resolve_my_learner_profile(
  $profile$
    {"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.commit_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  $$values ('accepted'::text, 1::bigint, 2::bigint, 1::bigint)$$,
  'the expected current revision accepts one sequential cloud revision'
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.commit_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  $$values ('already_accepted'::text, 1::bigint, 2::bigint, 1::bigint)$$,
  'an exact operation retry returns its original accepted revision'
);

select throws_ok(
  $query$
    select *
    from public.commit_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      2,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  '22023',
  'Learner profile operation identity was reused',
  'an operation id cannot be reused with different content'
);

select throws_ok(
  $query$
    select *
    from public.commit_my_learner_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select profile_id from public.learner_profile_heads),
      1,
      2,
      pg_catalog.jsonb_set(
        (select envelope from public.learner_profile_versions where revision = 1),
        '{profile,config,locale}',
        '"fr"'::jsonb
      )
    )
  $query$,
  '22023',
  'Learner profile integrity is invalid',
  'a changed payload with stale integrity cannot be committed'
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.commit_my_learner_profile(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  $$values ('conflict'::text, 1::bigint, 2::bigint, 1::bigint)$$,
  'a stale base revision reports conflict without overwriting the head'
);

reset role;

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.commit_my_learner_profile(uuid,uuid,bigint,bigint,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.commit_my_learner_profile(uuid,uuid,bigint,bigint,jsonb)',
    'EXECUTE'
  ),
  'only authenticated clients can invoke the public commit wrapper'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.learner_profile_write_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'clients have no direct receipt-table privileges'
);

select results_eq(
  $query$
    select
      (select revision from public.learner_profile_heads),
      (select count(*) from public.learner_profile_versions),
      (select count(*) from public.learner_profile_write_receipts)
  $query$,
  $$values (2::bigint, 2::bigint, 1::bigint)$$,
  'retry and conflict leave one accepted revision and one receipt'
);

select * from finish();
rollback;
