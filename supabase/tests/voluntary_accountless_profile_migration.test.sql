begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(17);

select has_function(
  'public',
  'migrate_my_accountless_profile',
  array['uuid', 'jsonb'],
  'the authenticated voluntary accountless-profile migration operation exists'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.migrate_my_accountless_profile(uuid,jsonb)'::regprocedure
  ),
  false,
  'the Data API migration function is an invoker wrapper'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'learner_profile_rpc.migrate_my_accountless_profile(uuid,jsonb)'::regprocedure
  ),
  true,
  'the owner-derived migration function stays outside the public schema'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.learner_profile_accountless_migration_receipts',
    'select'
  ),
  'authenticated cannot read accountless-profile migration receipts'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.migrate_my_accountless_profile(uuid,jsonb)',
    'execute'
  ),
  'anonymous callers cannot execute the migration operation'
);

create temporary table accountless_migration_fixture (
  envelope jsonb not null
) on commit drop;

insert into accountless_migration_fixture (envelope) values (
  $profile$
    {"exportedAt":"2026-08-21T01:02:03.000Z","integrity":{"algorithm":"SHA-256","byteLength":2242,"payloadSha256":"c-a3epgrMvQKEPkuXvMJLjEZiZLGRvM0JKcIpbmd7Hs"},"profile":{"activityLog":[{"actor":"user","createdAt":"2026-08-21T01:02:03.000Z","detail":"Watched lesson","id":"activity-1","meta":{"seconds":90,"videoId":"video-1"},"status":"success","title":"Study","type":"video"}],"anki":{"2026-08-21":{"created":2,"observedAt":"2026-08-21T01:02:03.000Z","reviewed":5}},"cityProgress":{"maxLevelIndex":3},"config":{"ankiEnabled":true,"channelShelfOrder":["channel-1"],"channelVideoFormats":{"channel-1":"videos"},"channels":[{"catalogId":"catalog-1","id":"channel-1","imageUrl":"https://example.test/channel.jpg","name":"Channel"}],"includeShorts":false,"locale":"fr","removedChannelIds":["removed-1"],"removedDefaultChannelIds":["default-1"],"weeklyGoalHours":7},"learnerProfile":{"createdAt":"2026-08-21T01:02:03.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["catalog-1"],"updatedAt":"2026-08-21T01:02:03.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":"2026-08-21T01:02:03.000Z","response":"yes"},"onboarding":{"introSeenAt":"2026-08-21T01:02:03.000Z","levelUpGuidanceShownAt":"2026-08-21T01:02:03.000Z","recommendationsAppliedAt":"2026-08-21T01:02:03.000Z","setupCompleted":true,"setupCompletedAt":"2026-08-21T01:02:03.000Z","walkthroughCompleted":true,"walkthroughCompletedAt":"2026-08-21T01:02:03.000Z"},"videos":{"video-1":{"aspectRatio":1.777,"channelId":"channel-1","channelImageUrl":"https://example.test/channel.jpg","channelTitle":"Channel","duration":120,"favorite":true,"hiddenFromGrid":false,"hiddenFromGridAt":null,"id":"video-1","isShort":false,"manuallyAdded":false,"pausedAt":null,"publishedAt":"2026-08-21T01:02:03.000Z","removedFromFeedAt":null,"resumeAtSeconds":30,"source":"youtube","status":"partial","thumbnail":"https://example.test/video.jpg","title":"Lesson","watchLater":false,"watchProgress":[{"id":"video:video-1:2026-08-21T01:02:03.000Z:90:1","seconds":90,"studyDay":"2026-08-21","watchedAt":"2026-08-21T01:02:03.000Z"}],"watchProgressTracked":true,"watchedAt":null,"watchedConfirmationUnlockedAt":"2026-08-21T01:02:03.000Z"}}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

grant select on accountless_migration_fixture to authenticated;

insert into auth.users (id, email, email_confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'accountless-owner@example.test',
  statement_timestamp()
);

delete from private.learner_profile_creation_eligibility
where user_id = '11111111-1111-4111-8111-111111111111';

update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status, generation, revision, payload_sha256
    from public.migrate_my_accountless_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select envelope from accountless_migration_fixture)
    )
  $query$,
  $$values (
    'migrated'::text,
    1::bigint,
    1::bigint,
    'c-a3epgrMvQKEPkuXvMJLjEZiZLGRvM0JKcIpbmd7Hs'::text
  )$$,
  'a verified owner with no signed-in profile history accepts the complete accountless town'
);

select results_eq(
  $query$
    select
      head.generation,
      head.revision,
      version.base_revision,
      version.envelope #>> '{profile,activityLog,0,id}'
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
    where head.user_id = '11111111-1111-4111-8111-111111111111'
  $query$,
  $$values (1::bigint, 1::bigint, 0::bigint, 'activity-1'::text)$$,
  'the first owner-scoped revision contains the complete accountless profile progress'
);

reset role;

select ok(
  (
    select receipt.operation_id
        = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      and receipt.request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
    from private.learner_profile_accountless_migration_receipts as receipt
    where receipt.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'the accepted migration stores one owner-scoped idempotency receipt'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status, generation, revision
    from public.migrate_my_accountless_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select envelope from accountless_migration_fixture)
    )
  $query$,
  $$values ('migrated'::text, 1::bigint, 1::bigint)$$,
  'an exact retry returns the accepted first revision'
);

reset role;

select results_eq(
  $query$
    select
      (select count(*) from public.learner_profile_heads),
      (select count(*) from public.learner_profile_versions),
      (select count(*) from private.learner_profile_accountless_migration_receipts)
  $query$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'an exact retry creates no second head, version, or receipt'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status
    from public.migrate_my_accountless_profile(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      (select envelope from accountless_migration_fixture)
    )
  $query$,
  $$values ('profile_present'::text)$$,
  'an existing signed-in profile head never qualifies as empty'
);

reset role;

insert into auth.users (id, email, email_confirmed_at)
values (
  '22222222-2222-4222-8222-222222222222',
  'history-owner@example.test',
  statement_timestamp()
);
insert into public.state_backups (user_id, state_json)
values ('22222222-2222-4222-8222-222222222222', '{"unrelated":true}'::jsonb);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $query$
    select status
    from public.migrate_my_accountless_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select envelope from accountless_migration_fixture)
    )
  $query$,
  $$values ('profile_present'::text)$$,
  'recoverable signed-in history prevents direct attachment'
);

select is(
  (
    select count(*)
    from public.learner_profile_heads
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'history rejection creates no learner-profile head'
);

reset role;

insert into auth.users (id, email)
values ('33333333-3333-4333-8333-333333333333', 'unverified@example.test');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select results_eq(
  $query$
    select status
    from public.migrate_my_accountless_profile(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      (select envelope from accountless_migration_fixture)
    )
  $query$,
  $$values ('verified_account_required'::text)$$,
  'an unverified account cannot receive an accountless town'
);

reset role;
update private.learner_profile_access_control
set rollout_state = 'off',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select results_eq(
  $query$
    select status
    from public.migrate_my_accountless_profile(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      (select envelope from accountless_migration_fixture)
    )
  $query$,
  $$values ('access_disabled'::text)$$,
  'the server rollout gate disables accountless-profile migration independently'
);

reset role;
update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

insert into auth.users (id, email, email_confirmed_at)
values (
  '44444444-4444-4444-8444-444444444444',
  'invalid-envelope@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select throws_ok(
  $query$
    select *
    from public.migrate_my_accountless_profile(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      pg_catalog.jsonb_set(
        (select envelope from accountless_migration_fixture),
        '{profile,config,locale}',
        '"en"'::jsonb
      )
    )
  $query$,
  '22023',
  'Learner profile integrity is invalid',
  'server validation rejects altered accountless profile contents'
);

select is(
  (
    select count(*)
    from public.learner_profile_heads
    where user_id = '44444444-4444-4444-8444-444444444444'
  ),
  0::bigint,
  'invalid accountless profile content creates no owner head'
);

select * from finish();
rollback;
