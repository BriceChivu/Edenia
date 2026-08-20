begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(36);

select has_function(
  'public',
  'resolve_my_learner_profile',
  array['jsonb'],
  'the authenticated first signed-in profile resolution operation exists'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.resolve_my_learner_profile(jsonb)'::regprocedure
  ),
  false,
  'the Data API resolver is an invoker wrapper'
);

select results_eq(
  $query$
    select procedure.oid::regprocedure::text
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and has_function_privilege(
        'authenticated',
        procedure.oid,
        'execute'
      )
    order by 1
  $query$,
  $$values ('private.resolve_my_learner_profile(jsonb)'::text)$$,
  'authenticated can execute only the narrow resolver in the private schema'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants as privilege
    where privilege.grantee = 'authenticated'
      and privilege.table_schema = 'private'
  ),
  'authenticated receives no private-table privileges'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'private.resolve_my_learner_profile(jsonb)'::regprocedure
  ),
  true,
  'the elevated owner-derived resolver stays in the private schema'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'new-learner@example.test',
  statement_timestamp()
);

update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status, created, generation, revision
    from public.resolve_my_learner_profile(
      $profile$
        {"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
      $profile$::jsonb
    )
  $query$,
  $$values ('profile_ready'::text, true, 1::bigint, 1::bigint)$$,
  'a verified UUID with no profile history creates generation one revision one'
);

select results_eq(
  $$select generation, revision from public.learner_profile_heads$$,
  $$values (1::bigint, 1::bigint)$$,
  'the owner can read exactly the current generation and revision'
);

select results_eq(
  $$select generation, revision, base_revision from public.learner_profile_versions$$,
  $$values (1::bigint, 1::bigint, 0::bigint)$$,
  'the owner can read exactly the immutable initial version'
);

reset role;
select ok(
  (
    select eligibility.consumed_at is not null
    from private.learner_profile_creation_eligibility as eligibility
    where eligibility.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'successful creation consumes its one-time new-account evidence'
);
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status, created, generation, revision
    from public.resolve_my_learner_profile(null)
  $query$,
  $$values ('profile_ready'::text, false, 1::bigint, 1::bigint)$$,
  'an exact retry resolves the existing profile without another creation'
);

reset role;

create temporary table first_profile_fixture on commit drop as
select envelope
from public.learner_profile_versions
where user_id = '11111111-1111-4111-8111-111111111111';
grant select on table first_profile_fixture to authenticated;

insert into auth.users (id, email, email_confirmed_at)
values (
  '22222222-2222-4222-8222-222222222222',
  'other-learner@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select count(*) from public.learner_profile_heads$$,
  array[0::bigint],
  'another UUID cannot read the first owner head'
);

select results_eq(
  $$select count(*) from public.learner_profile_versions$$,
  array[0::bigint],
  'another UUID cannot read the first owner history'
);

select throws_ok(
  $query$
    insert into public.learner_profile_heads (
      user_id,
      profile_id,
      generation,
      revision,
      current_version_id
    ) values (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      1,
      1,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
  $query$,
  '42501',
  'permission denied for table learner_profile_heads',
  'authenticated clients cannot bypass the owner-derived operation'
);

select results_eq(
  $query$
    select status, created, generation, revision
    from public.resolve_my_learner_profile(
      (select envelope from first_profile_fixture)
    )
  $query$,
  $$values ('profile_ready'::text, true, 1::bigint, 1::bigint)$$,
  'a second verified UUID creates a separate first profile'
);

select results_eq(
  $$select count(*) from public.learner_profile_heads$$,
  array[1::bigint],
  'the second owner sees only their own head after creation'
);

select results_eq(
  $$select count(*) from public.learner_profile_versions$$,
  array[1::bigint],
  'the second owner sees only their own version after creation'
);

reset role;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
reset request.jwt.claim.sub;

select results_eq(
  $$select count(*) from public.learner_profile_heads$$,
  array[2::bigint],
  'the trusted server sees two separately owned heads'
);

reset role;
set local role anon;
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';

select throws_ok(
  $$select * from public.resolve_my_learner_profile(null)$$,
  '42501',
  'permission denied for function resolve_my_learner_profile',
  'unauthenticated clients cannot execute profile resolution'
);

reset role;

select ok(
  has_function_privilege(
    'authenticated',
    'public.resolve_my_learner_profile(jsonb)',
    'execute'
  ),
  'authenticated users receive the narrow profile-resolution operation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_my_learner_profile(jsonb)',
    'execute'
  ),
  'anonymous users receive no profile-resolution operation'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.learner_profile_heads'::regclass
  ),
  true,
  'learner profile heads have RLS enabled'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.learner_profile_versions'::regclass
  ),
  true,
  'learner profile versions have RLS enabled'
);

select policies_are(
  'public',
  'learner_profile_heads',
  array['Users can view their own learner profile head'],
  'learner profile heads have exactly one owner-read policy'
);

select policies_are(
  'public',
  'learner_profile_versions',
  array['Users can view their own learner profile versions'],
  'learner profile versions have exactly one owner-read policy'
);

update private.learner_profile_access_control
set rollout_state = 'off',
    developer_user_id = null,
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select status from public.resolve_my_learner_profile(null)$$,
  $$values ('access_disabled'::text)$$,
  'the server-owned off state fails closed for an existing owner'
);

reset role;
update private.learner_profile_access_control
set rollout_state = 'developer-canary',
    developer_user_id = '11111111-1111-4111-8111-111111111111',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select status from public.resolve_my_learner_profile(null)$$,
  $$values ('access_disabled'::text)$$,
  'developer-canary denies every other authenticated UUID'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select status, created from public.resolve_my_learner_profile(null)$$,
  $$values ('profile_ready'::text, false)$$,
  'developer-canary admits only the server-configured UUID'
);

reset role;
update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    developer_user_id = null,
    updated_at = statement_timestamp()
where singleton;

insert into auth.users (id, email, email_confirmed_at)
values (
  '33333333-3333-4333-8333-333333333333',
  'tampered-profile@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select throws_ok(
  $query$
    select *
    from public.resolve_my_learner_profile(
      pg_catalog.jsonb_set(
        (select envelope from first_profile_fixture),
        '{integrity,payloadSha256}',
        pg_catalog.to_jsonb(pg_catalog.repeat('A', 43))
      )
    )
  $query$,
  '22023',
  'Initial learner profile integrity is invalid',
  'a tampered onboarding profile is rejected before creation'
);

select throws_ok(
  $query$
    select *
    from public.resolve_my_learner_profile(
      pg_catalog.jsonb_set(
        (select envelope from first_profile_fixture),
        '{version}',
        'null'::jsonb
      )
    )
  $query$,
  '22023',
  'Initial learner profile envelope is invalid',
  'a null portable schema version is rejected before creation'
);

select results_eq(
  $query$
    select
      (select count(*) from public.learner_profile_heads),
      (select count(*) from public.learner_profile_versions)
  $query$,
  $$values (0::bigint, 0::bigint)$$,
  'invalid input leaves no partial head or history for that owner'
);

reset role;
insert into auth.users (id, email)
values (
  '44444444-4444-4444-8444-444444444444',
  'unverified-profile@example.test'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select results_eq(
  $$select status, created from public.resolve_my_learner_profile(null)$$,
  $$values ('verified_account_required'::text, false)$$,
  'an unverified Auth row is not authoritative new-account evidence'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values (
  '66666666-6666-4666-8666-666666666666',
  'returning-backup-owner@example.test',
  statement_timestamp()
);

insert into public.state_backups (user_id, state_json)
values (
  '66666666-6666-4666-8666-666666666666',
  '{"learnerProfile":{"languages":["french"]}}'::jsonb
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';

select results_eq(
  $query$
    select status, created
    from public.resolve_my_learner_profile(
      (select envelope from first_profile_fixture)
    )
  $query$,
  $$values ('recovery_required'::text, false)$$,
  'legacy cloud-backup history routes to recovery instead of blank creation'
);

select results_eq(
  $$select count(*) from public.learner_profile_heads$$,
  array[0::bigint],
  'legacy backup history leaves the returning owner without a partial head'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values (
  '77777777-7777-4777-8777-777777777777',
  'preexisting-empty-account@example.test',
  statement_timestamp()
);
delete from private.learner_profile_creation_eligibility
where user_id = '77777777-7777-4777-8777-777777777777';

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';

select results_eq(
  $query$
    select status, created
    from public.resolve_my_learner_profile(
      (select envelope from first_profile_fixture)
    )
  $query$,
  $$values ('recovery_required'::text, false)$$,
  'a verified UUID without server-recorded new-account evidence cannot create'
);

select results_eq(
  $$select count(*) from public.learner_profile_versions$$,
  array[0::bigint],
  'missing new-account evidence leaves no partial profile history'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values (
  '55555555-5555-4555-8555-555555555555',
  'history-only-profile@example.test',
  statement_timestamp()
);

insert into public.learner_profile_versions (
  id,
  user_id,
  profile_id,
  generation,
  revision,
  base_revision,
  envelope,
  payload_sha256,
  payload_bytes
)
select
  'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa',
  '55555555-5555-4555-8555-555555555555',
  'bbbbbbbb-5555-4555-8555-bbbbbbbbbbbb',
  1,
  1,
  0,
  fixture.envelope,
  fixture.envelope #>> '{integrity,payloadSha256}',
  (fixture.envelope #>> '{integrity,byteLength}')::integer
from first_profile_fixture as fixture;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select results_eq(
  $$select status, created from public.resolve_my_learner_profile(null)$$,
  $$values ('recovery_required'::text, false)$$,
  'historical evidence without a current head never creates a blank profile'
);

reset role;

select * from finish();
rollback;
