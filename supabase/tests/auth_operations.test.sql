begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(46);

select has_table(
  'private',
  'auth_health_checks',
  'Auth health checks are stored in a private aggregate table'
);

select has_table(
  'private',
  'auth_health_status',
  'Auth health keeps one aggregate alert state'
);

select has_table(
  'private',
  'learner_profile_operator_recovery_incidents',
  'operator recovery incidents are private'
);

select has_table(
  'private',
  'learner_profile_account_locks',
  'under-13 locks are exact-account records'
);

select has_function(
  'private',
  'record_auth_health_check',
  array['text', 'integer', 'integer'],
  'the service-only Auth health recorder exists'
);

select has_function(
  'private',
  'auth_health_report',
  array[]::text[],
  'the aggregate Auth health report exists'
);

select has_function(
  'private',
  'begin_learner_profile_recovery',
  array['uuid', 'text', 'uuid', 'text', 'text', 'text', 'boolean', 'boolean', 'boolean', 'timestamptz', 'text'],
  'recovery begins through one exact target operation'
);

select has_function(
  'private',
  'list_learner_profile_operator_candidates',
  array['uuid'],
  'operator candidate listing exists'
);

select has_function(
  'private',
  'restore_learner_profile_from_operator_candidate',
  array['uuid', 'uuid', 'uuid', 'text'],
  'operator restore exists'
);

select has_function(
  'private',
  'record_under_13_account_lock',
  array['uuid', 'text', 'boolean', 'text'],
  'the exact-account under-13 lock operation exists'
);

select has_function(
  'private',
  'record_under_13_profile_removal',
  array['uuid', 'text', 'text', 'bigint', 'bigint'],
  'the aggregate under-13 removal result operation exists'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name in ('auth_health_checks', 'auth_health_status')
      and column_name in ('email', 'user_id', 'uuid', 'token', 'cookie', 'credential', 'profile_json')
  ),
  'Auth health tables contain no identity or secret fields'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot enter the operator schema'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name in (
        'auth_health_checks',
        'auth_health_status',
        'learner_profile_operator_recovery_incidents',
        'learner_profile_account_locks'
      )
      and grantee in ('public', 'anon', 'authenticated', 'service_role')
  ),
  'operator tables have no direct role grants'
);

select results_eq(
  $query$
    select outcome, alert_state, consecutive_provider_failures
    from private.record_auth_health_check('available', 204, 11)
  $query$,
  $$values ('available'::text, 'healthy'::text, 0)$$,
  'a successful health probe records a healthy aggregate result'
);

select results_eq(
  $query$
    select outcome, alert_state, consecutive_provider_failures
    from private.record_auth_health_check('expected_client_error', 400, 12)
  $query$,
  $$values ('expected_client_error'::text, 'healthy'::text, 0)$$,
  'an expected client error proves reachability without opening an outage alert'
);

select results_eq(
  $query$
    select outcome, alert_state, alert_action, consecutive_provider_failures
    from private.record_auth_health_check('provider_unavailable', 503, 100)
  $query$,
  $$values ('provider_unavailable'::text, 'healthy'::text, 'none'::text, 1)$$,
  'one provider failure is recorded without an early alert'
);

select results_eq(
  $query$
    select outcome, alert_state, alert_action, consecutive_provider_failures
    from private.record_auth_health_check('network_error', null, 10000)
  $query$,
  $$values ('network_error'::text, 'healthy'::text, 'none'::text, 2)$$,
  'network failure joins provider failure evidence without identity data'
);

select results_eq(
  $query$
    select outcome, alert_state, alert_action, consecutive_provider_failures
    from private.record_auth_health_check('provider_unavailable', 502, 101)
  $query$,
  $$values ('provider_unavailable'::text, 'open'::text, 'open'::text, 3)$$,
  'three consecutive provider failures open an actionable alert'
);

select results_eq(
  $query$
    select outcome, alert_state, alert_action, consecutive_provider_failures
    from private.record_auth_health_check('available', 200, 9)
  $query$,
  $$values ('available'::text, 'healthy'::text, 'close'::text, 0)$$,
  'a fresh successful probe closes an open alert'
);

select throws_ok(
  $query$ select * from private.record_auth_health_check('available', 503, 1) $query$,
  '22023',
  'Auth health status does not match outcome',
  'the health recorder rejects contradictory provider metadata'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '55555555-5555-4555-8555-555555555555',
  'operator-target@example.test',
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
) values (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  '77777777-7777-4777-8777-777777777777',
  1,
  1,
  0,
  $profile$
    {"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb,
  'hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs',
  993
);

insert into public.learner_profile_heads (
  user_id,
  profile_id,
  generation,
  revision,
  current_version_id
) values (
  '55555555-5555-4555-8555-555555555555',
  '77777777-7777-4777-8777-777777777777',
  1,
  1,
  '66666666-6666-4666-8666-666666666666'
);

update private.learner_profile_access_control
set rollout_state = 'developer-canary',
    developer_user_id = '55555555-5555-4555-8555-555555555555',
    updated_at = statement_timestamp()
where singleton;

select results_eq(
  $query$
    select status, server_gate_before, server_gate_after, deployed_commit
    from private.begin_learner_profile_recovery(
      '55555555-5555-4555-8555-555555555551',
      'profile-recovery',
      '55555555-5555-4555-8555-555555555555',
      'RECOVER 55555555-5555-4555-8555-555555555555',
      '0123456789abcdef0123456789abcdef01234567',
      'internal',
      true,
      false,
      true,
      null,
      'unknown'
    )
  $query$,
  $$values ('started'::text, 'developer-canary'::text, 'off'::text, '0123456789abcdef0123456789abcdef01234567'::text)$$,
  'recovery disables the server profile-data gate before inspection'
);

select is(
  (select rollout_state from private.learner_profile_access_control where singleton),
  'off',
  'the server profile-data gate is off after recovery begins'
);

select is(
  (
    select count(*)::integer
    from private.learner_profile_operator_recovery_incidents
    where incident_id = '55555555-5555-4555-8555-555555555551'
  ),
  1,
  'recovery records one minimal incident'
);

update private.learner_profile_access_control
set rollout_state = 'developer-canary',
    developer_user_id = '55555555-5555-4555-8555-555555555555'
where singleton;

select is(
  (select count(*)::integer
   from private.list_learner_profile_operator_candidates(
     '55555555-5555-4555-8555-555555555551'
   )),
  0,
  'candidate listing refuses a live gate even when the incident says it is off'
);

select results_eq(
  $query$
    select status, server_gate_after
    from private.begin_learner_profile_recovery(
      '55555555-5555-4555-8555-555555555551',
      'profile-recovery',
      '55555555-5555-4555-8555-555555555555',
      'RECOVER 55555555-5555-4555-8555-555555555555',
      '0123456789abcdef0123456789abcdef01234567',
      'internal',
      true,
      false,
      true,
      null,
      'unknown'
    )
  $query$,
  $$values ('already_started'::text, 'off'::text)$$,
  'an exact recovery retry re-fences a gate before returning'
);

select is(
  (select rollout_state from private.learner_profile_access_control where singleton),
  'off',
  'an exact recovery retry leaves the live gate off'
);

select results_eq(
  $query$
    select version_id, profile_id, generation, revision, payload_sha256, payload_bytes, is_current
    from private.list_learner_profile_operator_candidates(
      '55555555-5555-4555-8555-555555555551'
    )
  $query$,
  $$values (
    '66666666-6666-4666-8666-666666666666'::uuid,
    '77777777-7777-4777-8777-777777777777'::uuid,
    1::bigint,
    1::bigint,
    'hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs'::text,
    993,
    true
  )$$,
  'operator candidate selection exposes sanitized version metadata only'
);

select results_eq(
  $query$
    select status, source_version_id, generation, revision, payload_sha256, payload_bytes,
      displaced_version_id is not null,
      protected_until >= statement_timestamp() + interval '29 days'
    from private.restore_learner_profile_from_operator_candidate(
      '55555555-5555-4555-8555-555555555551',
      '55555555-5555-4555-8555-555555555553',
      '66666666-6666-4666-8666-666666666666',
      'RESTORE 66666666-6666-4666-8666-666666666666'
    )
  $query$,
  $$values (
    'restored'::text,
    '66666666-6666-4666-8666-666666666666'::uuid,
    1::bigint,
    2::bigint,
    'hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs'::text,
    993,
    true,
    true
  )$$,
  'operator restore creates a protected next revision and protects the displaced head'
);

select results_eq(
  $query$
    select head.revision, head.current_version_id = recovery.restored_version_id,
      recovery.source, recovery.protected_until >= statement_timestamp() + interval '29 days'
    from public.learner_profile_heads as head
    join private.learner_profile_recoveries as recovery
      on recovery.user_id = head.user_id
     and recovery.operation_id = '55555555-5555-4555-8555-555555555553'
    where head.user_id = '55555555-5555-4555-8555-555555555555'
  $query$,
  $$values (2::bigint, true, 'operator'::text, true)$$,
  'the restored version becomes the current head through the recovery ledger'
);

select results_eq(
  $query$
    select status, restored_version_id
    from private.restore_learner_profile_from_operator_candidate(
      '55555555-5555-4555-8555-555555555551',
      '55555555-5555-4555-8555-555555555553',
      '66666666-6666-4666-8666-666666666666',
      'RESTORE 66666666-6666-4666-8666-666666666666'
    )
  $query$,
  $$values ('already_restored'::text, (select restored_version_id from private.learner_profile_operator_recovery_incidents where incident_id = '55555555-5555-4555-8555-555555555551'))$$,
  'an exact operator restore retry returns the existing protected revision'
);

select throws_ok(
  $query$
    select *
    from private.begin_learner_profile_recovery(
      '55555555-5555-4555-8555-555555555552',
      'profile-recovery',
      '55555555-5555-4555-8555-555555555555',
      'RECOVER 55555555-5555-4555-8555-555555555556',
      '0123456',
      'internal',
      true,
      false,
      true,
      null,
      'unknown'
    )
  $query$,
  '22023',
  'Recovery target confirmation is invalid',
  'recovery refuses an unconfirmed target'
);

select results_eq(
  $query$
    select status, server_gate_before, server_gate_after
    from private.begin_learner_profile_recovery(
      '55555555-5555-4555-8555-555555555552',
      'under-13',
      '55555555-5555-4555-8555-555555555555',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      '0123456789abcdef0123456789abcdef01234567',
      'internal',
      true,
      false,
      true,
      null,
      'unknown'
    )
  $query$,
  $$values ('started'::text, 'off'::text, 'off'::text)$$,
  'the under-13 path also starts behind the disabled server gate'
);

select results_eq(
  $query$
    select status, manual_removal_required, session_status
    from private.record_under_13_account_lock(
      '55555555-5555-4555-8555-555555555552',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      false,
      'unknown'
    )
  $query$,
  $$values ('locked'::text, true, 'unknown'::text)$$,
  'actual knowledge under 13 creates an exact-account lock and manual-removal requirement'
);

select is(
  (select count(*)::integer
   from private.learner_profile_account_locks
   where user_id = '55555555-5555-4555-8555-555555555555'),
  1,
  'the under-13 lock targets exactly one account'
);

select results_eq(
  $query$
    select status, removal_status, remaining_heads, remaining_versions
    from private.record_under_13_profile_removal(
      '55555555-5555-4555-8555-555555555552',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      'unknown',
      1,
      0
    )
  $query$,
  $$values ('incomplete'::text, 'incomplete'::text, 1::bigint, 0::bigint)$$,
  'under-13 removal records an incomplete aggregate without claiming completion'
);

select results_eq(
  $query$
    select status, removal_status, remaining_heads, remaining_versions
    from private.record_under_13_profile_removal(
      '55555555-5555-4555-8555-555555555552',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      'revoked',
      0,
      0
    )
  $query$,
  $$values ('completed'::text, 'completed'::text, 0::bigint, 0::bigint)$$,
  'under-13 removal records completion only when aggregate counts are zero'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select is(
  (select count(*)::integer from public.learner_profile_heads),
  0,
  'an under-13 lock hides the exact account head from authenticated reads'
);

reset role;

select throws_ok(
  $query$
    insert into public.learner_profile_heads (
      user_id,
      profile_id,
      generation,
      revision,
      current_version_id
    ) values (
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777',
      1,
      3,
      '66666666-6666-4666-8666-666666666666'
    )
  $query$,
  '42501',
  'Learner profile account is locked',
  'an under-13 lock rejects a new head write for the exact account'
);

select results_eq(
  $query$
    select status, server_gate_before, server_gate_after
    from private.begin_learner_profile_recovery(
      '55555555-5555-4555-8555-555555555554',
      'under-13',
      '55555555-5555-4555-8555-555555555555',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      '0123456789abcdef0123456789abcdef01234567',
      'internal',
      true,
      false,
      true,
      null,
      'valid'
    )
  $query$,
  $$values ('started'::text, 'off'::text, 'off'::text)$$,
  'guardian-consent review uses a separate exact under-13 incident'
);

select results_eq(
  $query$
    select status, manual_removal_required
    from private.record_under_13_account_lock(
      '55555555-5555-4555-8555-555555555554',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      true,
      'revoked'
    )
  $query$,
  $$values ('guardian_consent_recorded'::text, false)$$,
  'verified guardian consent avoids the removal requirement while recording session state'
);

select throws_ok(
  $query$
    select *
    from private.record_under_13_account_lock(
      '55555555-5555-4555-8555-555555555554',
      'UNDER-13 55555555-5555-4555-8555-555555555555',
      false,
      'unknown'
    )
  $query$,
  '22023',
  'Verified guardian consent cannot be reversed',
  'verified guardian consent cannot be replaced by a later lock'
);

select throws_ok(
  $query$
    select *
    from private.record_under_13_account_lock(
      '55555555-5555-4555-8555-555555555554',
      'UNDER-13 55555555-5555-4555-8555-555555555556',
      false,
      'unknown'
    )
  $query$,
  '22023',
  'Under-13 target confirmation is invalid',
  'the under-13 operation refuses a different account'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.record_auth_health_check(text,integer,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.begin_learner_profile_recovery(uuid,text,uuid,text,text,text,boolean,boolean,boolean,timestamptz,text)',
    'execute'
  ),
  'authenticated cannot execute operator operations'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.learner_profile_recoveries'::regclass
      and pg_catalog.pg_get_constraintdef(oid) like '%source = ''operator''%'
  ),
  'operator restores use the protected recovery ledger'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc
    where proname = 'restore_learner_profile_from_operator_candidate'
      and pg_get_functiondef(oid) ~* 'delete from public\.learner_profile_write_receipts'
  ),
  'operator restore never deletes write receipts'
);

select * from finish();

rollback;
