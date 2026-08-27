begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(35);

select has_table(
  'private',
  'learner_profile_maintenance_config',
  'retention maintenance has a private configuration table'
);

select has_table(
  'private',
  'learner_profile_capacity_checks',
  'capacity evidence is stored privately'
);

select has_function(
  'private',
  'learner_profile_capacity_report',
  array['uuid'],
  'the operator capacity report exists'
);

select has_function(
  'private',
  'record_learner_profile_capacity_policy',
  array['text', 'bigint', 'text', 'text'],
  'the operator capacity policy recorder exists'
);

select has_function(
  'private',
  'record_learner_profile_capacity_check',
  array[]::text[],
  'the operator capacity evidence recorder exists'
);

select has_function(
  'private',
  'set_learner_profile_cleanup_enabled',
  array['boolean'],
  'cleanup has an explicit enable gate'
);

select has_function(
  'private',
  'run_learner_profile_maintenance',
  array['uuid', 'boolean'],
  'retention maintenance has an exact-owner dry-run/apply operation'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname in (
        'learner_profile_capacity_report',
        'record_learner_profile_capacity_check',
        'set_learner_profile_cleanup_enabled',
        'run_learner_profile_maintenance'
      )
      and procedure.prosecdef = false
  ),
  'maintenance functions run with their private owner privileges'
);

select ok(
  case when exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'learner_profile_capacity_report'
  ) then not has_function_privilege(
    'anon',
    'private.learner_profile_capacity_report(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.learner_profile_capacity_report(uuid)',
    'execute'
  ) else false end,
  'browser roles cannot call the capacity report'
);

select ok(
  case when exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'learner_profile_capacity_report'
  ) then has_function_privilege(
    'service_role',
    'private.learner_profile_capacity_report(uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'private.run_learner_profile_maintenance(uuid,boolean)',
    'execute'
  ) else false end,
  'the operator role can run maintenance'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_class as relation
      on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'learner_profile_capacity_checks'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname in (
        'user_id',
        'profile_id',
        'operation_id',
        'envelope',
        'state_json'
      )
  ),
  'capacity evidence stores aggregate metadata instead of profile contents'
);

select results_eq(
  $query$
    select
      ordinary_retention_count,
      protected_retention_days,
      database_limit_bytes,
      cleanup_enabled
    from private.learner_profile_maintenance_config
    where singleton
  $query$,
  $$values (8::integer, 30::integer, 524288000::bigint, false)$$,
  'the safe eight-version, thirty-day, cleanup-off defaults are installed'
);

select results_eq(
  $query$
    select
      warning_threshold_bytes,
      pause_threshold_bytes
    from private.learner_profile_capacity_report(null)
  $query$,
  $$values (367001600::bigint, 445644800::bigint)$$,
  'capacity thresholds are derived from the configured Free limit'
);

select results_eq(
  $query$
    select
      capacity_status,
      cleanup_allowed,
      cleanup_enabled,
      capacity_evidence_current
    from private.learner_profile_capacity_report(null)
  $query$,
  $$values ('ok'::text, false, false, false)$$,
  'cleanup is not allowed before a fresh operator capacity check and enablement'
);

update private.learner_profile_maintenance_config
set database_limit_bytes = floor(
      pg_catalog.pg_database_size(pg_catalog.current_database()) / 0.7000
    )::bigint
where singleton;

select results_eq(
  $query$
    select capacity_status
    from private.learner_profile_capacity_report(null)
  $query$,
  $$values ('warning'::text)$$,
  'database usage at the warning boundary produces a warning'
);

update private.learner_profile_maintenance_config
set database_limit_bytes = floor(
      pg_catalog.pg_database_size(pg_catalog.current_database()) / 0.8500
    )::bigint
where singleton;

select results_eq(
  $query$
    select capacity_status
    from private.learner_profile_capacity_report(null)
  $query$,
  $$values ('pause'::text)$$,
  'database usage at the pause boundary blocks cleanup'
);

update private.learner_profile_maintenance_config
set database_limit_bytes = 524288000
where singleton;

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'learner_profile_capacity_report'
      and pg_catalog.pg_get_function_result(procedure.oid) ~* '(email|uuid|jsonb|envelope|token|credential)'
  ),
  'capacity report output is aggregate metadata only'
);

insert into auth.users (id, email, email_confirmed_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'retention-owner@example.test',
    statement_timestamp()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'unrelated-owner@example.test',
    statement_timestamp()
  );

update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

create temporary table retention_owner as
select *
from public.resolve_my_learner_profile(
  $profile$
    {"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

reset role;

create temporary table retention_versions as
select
  head.profile_id,
  version.envelope,
  version.payload_sha256,
  version.payload_bytes,
  version.id as initial_version_id
from public.learner_profile_heads as head
join public.learner_profile_versions as version
  on version.id = head.current_version_id
 and version.user_id = head.user_id
 and version.profile_id = head.profile_id
where head.user_id = '11111111-1111-4111-8111-111111111111';

create temporary table retention_added_versions as
select
  revision,
  extensions.gen_random_uuid() as id
from generate_series(2, 14) as value(revision);

insert into public.learner_profile_versions (
  id,
  user_id,
  profile_id,
  generation,
  revision,
  base_revision,
  envelope,
  payload_sha256,
  payload_bytes,
  created_at
)
select
  added.id,
  '11111111-1111-4111-8111-111111111111',
  fixture.profile_id,
  1,
  added.revision,
  added.revision - 1,
  fixture.envelope,
  fixture.payload_sha256,
  fixture.payload_bytes,
  statement_timestamp()
    - ((14 - added.revision)::text || ' hours')::interval
from retention_added_versions as added
cross join retention_versions as fixture;

create temporary table retention_special_version as
select extensions.gen_random_uuid() as id;

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
  special.id,
  '11111111-1111-4111-8111-111111111111',
  fixture.profile_id,
  2,
  1,
  0,
  fixture.envelope,
  fixture.payload_sha256,
  fixture.payload_bytes
from retention_special_version as special
cross join retention_versions as fixture;

update public.learner_profile_heads as head
set revision = 14,
    current_version_id = added.id,
    updated_at = statement_timestamp()
from retention_added_versions as added
where added.revision = 14
  and head.user_id = '11111111-1111-4111-8111-111111111111';

create temporary table retention_protected_ids as
select
  (select id from retention_added_versions where revision = 2) as recovery_version_id,
  (select id from retention_added_versions where revision = 3) as import_version_id,
  (select id from retention_added_versions where revision = 4) as conflict_version_id,
  (select id from retention_added_versions where revision = 5) as reset_version_id,
  (select id from retention_added_versions where revision = 14) as current_version_id,
  (select id from retention_special_version) as special_version_id;

insert into private.learner_profile_conflicts (
  id,
  user_id,
  operation_id,
  request_sha256,
  profile_id,
  generation,
  base_revision,
  device_revision,
  device_envelope,
  device_payload_sha256,
  device_payload_bytes,
  cloud_version_id,
  cloud_profile_id,
  cloud_generation,
  cloud_revision,
  state,
  selected_side,
  selected_profile_id,
  selected_version_id,
  created_at,
  resolved_at,
  protected_until
)
select
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  repeat('A', 43),
  fixture.profile_id,
  1,
  13,
  14,
  fixture.envelope,
  fixture.payload_sha256,
  fixture.payload_bytes,
  ids.conflict_version_id,
  fixture.profile_id,
  1,
  4,
  'resolved',
  'cloud',
  fixture.profile_id,
  ids.current_version_id,
  statement_timestamp(),
  statement_timestamp(),
  statement_timestamp() + interval '30 days'
from retention_versions as fixture
cross join retention_protected_ids as ids;

insert into private.learner_profile_import_backups (
  id,
  user_id,
  operation_id,
  profile_id,
  generation,
  base_revision,
  previous_version_id,
  imported_version_id,
  imported_revision,
  imported_payload_sha256,
  state,
  created_at,
  protected_until
)
select
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  fixture.profile_id,
  1,
  13,
  ids.import_version_id,
  ids.current_version_id,
  14,
  fixture.payload_sha256,
  'protected',
  statement_timestamp(),
  statement_timestamp() + interval '30 days'
from retention_versions as fixture
cross join retention_protected_ids as ids;

insert into private.learner_profile_resets (
  id,
  user_id,
  operation_id,
  request_sha256,
  profile_id,
  prior_generation,
  prior_revision,
  prior_version_id,
  reset_generation,
  reset_revision,
  reset_version_id,
  state,
  created_at,
  protected_until
)
select
  '99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('B', 43),
  fixture.profile_id,
  1,
  5,
  ids.reset_version_id,
  2,
  1,
  ids.special_version_id,
  'active',
  statement_timestamp(),
  statement_timestamp() + interval '30 days'
from retention_versions as fixture
cross join retention_protected_ids as ids;

insert into private.learner_profile_recoveries (
  user_id,
  operation_id,
  request_sha256,
  source,
  source_candidate_id,
  source_profile_id,
  source_generation,
  source_revision,
  restored_profile_id,
  restored_generation,
  restored_revision,
  restored_version_id,
  displaced_profile_id,
  displaced_generation,
  displaced_revision,
  displaced_version_id,
  restored_at,
  protected_until
)
select
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  repeat('C', 43),
  'protected',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  fixture.profile_id,
  1,
  4,
  fixture.profile_id,
  1,
  14,
  ids.current_version_id,
  fixture.profile_id,
  1,
  2,
  ids.recovery_version_id,
  statement_timestamp(),
  statement_timestamp() + interval '30 days'
from retention_versions as fixture
cross join retention_protected_ids as ids;

insert into public.learner_profile_write_receipts (
  user_id,
  operation_id,
  request_sha256,
  profile_id,
  generation,
  base_revision,
  accepted_revision,
  result_sha256
)
select
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  repeat('D', 43),
  fixture.profile_id,
  1,
  13,
  14,
  fixture.payload_sha256
from retention_versions as fixture;

update public.learner_profile_versions as version
set created_at = statement_timestamp() - interval '13 hours'
where version.id = (
  select initial_version_id
  from retention_versions
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
  '12345678-1234-4234-8234-123456789012',
  '22222222-2222-4222-8222-222222222222',
  '87654321-4321-4321-8321-210987654321',
  1,
  1,
  0,
  fixture.envelope,
  fixture.payload_sha256,
  fixture.payload_bytes
from retention_versions as fixture;

insert into public.learner_profile_heads (
  user_id,
  profile_id,
  generation,
  revision,
  current_version_id
)
values (
  '22222222-2222-4222-8222-222222222222',
  '87654321-4321-4321-8321-210987654321',
  1,
  1,
  '12345678-1234-4234-8234-123456789012'
);

update private.learner_profile_maintenance_config
set database_limit_bytes = 1000000000000,
    warning_fraction = 0.7000,
    pause_fraction = 0.8500,
    cleanup_enabled = false,
    updated_at = statement_timestamp()
where singleton;

select results_eq(
  $query$
    select
      status,
      database_plan,
      database_limit_bytes,
      pause_behavior,
      restore_behavior
    from private.record_learner_profile_capacity_policy(
      'Free',
      1000000000000,
      'read-only at the database limit',
      'dashboard restore required after a pause'
    )
  $query$,
  $$values (
    'recorded'::text,
    'Free'::text,
    1000000000000::bigint,
    'read-only at the database limit'::text,
    'dashboard restore required after a pause'::text
  )$$,
  'capacity policy records the reviewed plan and pause/restore constraints'
);

select results_eq(
  $query$
    select capacity_evidence_current
    from private.record_learner_profile_capacity_check()
  $query$,
  $$values (true)$$,
  'a capacity check records current aggregate evidence'
);

select results_eq(
  $query$
    select protected_projected_cost_bytes = (
      protected_version_payload_bytes + protected_candidate_payload_bytes
    ) * 2
    from private.learner_profile_capacity_checks
    where singleton
  $query$,
  $$values (true)$$,
  'capacity evidence records the cautious projected protected-version cost'
);

select results_eq(
  $query$
    select
      profile_payload_bytes,
      profile_payload_p50_bytes,
      profile_payload_p95_bytes,
      profile_payload_max_bytes
    from private.learner_profile_capacity_checks
    where singleton
  $query$,
  $expected$
    select
      coalesce(sum(version.payload_bytes), 0)::bigint,
      percentile_cont(0.5) within group (
        order by version.payload_bytes
      )::bigint,
      percentile_cont(0.95) within group (
        order by version.payload_bytes
      )::bigint,
      coalesce(max(version.payload_bytes), 0)::bigint
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
     and version.user_id = head.user_id
     and version.profile_id = head.profile_id
  $expected$,
  'capacity evidence measures current profile heads and stores every size percentile'
);

select results_eq(
  $query$
    select status, cleanup_enabled
    from private.set_learner_profile_cleanup_enabled(true)
  $query$,
  $$values ('enabled'::text, true)$$,
  'cleanup can be enabled only after capacity evidence is recorded'
);

create temporary table retention_capacity_before_owner_maintenance as
select checked_at
from private.learner_profile_capacity_checks
where singleton;

select results_eq(
  $query$
    select status, deleted_ordinary_versions, ordinary_prunable_version_count
    from private.run_learner_profile_maintenance(
      '11111111-1111-4111-8111-111111111111',
      false
    )
  $query$,
  $$values ('dry_run'::text, 0::bigint, 1::bigint)$$,
  'an exact-owner dry run reports eligible work without deleting it'
);

select results_eq(
  $query$
    select count(distinct relation.relname)::bigint
    from pg_catalog.pg_locks as lock
    join pg_catalog.pg_class as relation
      on relation.oid = lock.relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where lock.pid = pg_catalog.pg_backend_pid()
      and lock.granted
      and lock.mode = 'ShareRowExclusiveLock'
      and (
        namespace.nspname = 'public'
        and relation.relname in (
          'learner_profile_heads',
          'learner_profile_versions',
          'learner_profile_write_receipts'
        )
        or namespace.nspname = 'private'
        and relation.relname in (
          'learner_profile_conflicts',
          'learner_profile_import_backups',
          'learner_profile_resets',
          'learner_profile_recoveries',
          'learner_profile_accountless_migration_receipts'
        )
      )
  $query$,
  $$values (8::bigint)$$,
  'maintenance takes write-conflicting locks across every profile table'
);

select results_eq(
  $query$
    select
      count(*) filter (where version.revision = 1),
      count(*) filter (where version.id in (
        select recovery_version_id from retention_protected_ids
        union all select import_version_id from retention_protected_ids
        union all select conflict_version_id from retention_protected_ids
        union all select reset_version_id from retention_protected_ids
      ))
    from public.learner_profile_versions as version
    where version.user_id = '11111111-1111-4111-8111-111111111111'
      and version.generation = 1
  $query$,
  $$values (1::bigint, 4::bigint)$$,
  'a dry run leaves the oldest eligible and all protected versions intact'
);

select results_eq(
  $query$
    select
      status,
      deleted_ordinary_versions,
      deleted_expired_conflicts,
      deleted_expired_import_backups,
      deleted_expired_resets,
      deleted_expired_recoveries,
      ordinary_prunable_version_count
    from private.run_learner_profile_maintenance(
      '11111111-1111-4111-8111-111111111111',
      true
    )
  $query$,
  $$values ('applied'::text, 1::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'the first apply keeps the current head, four protected versions, and eight ordinary versions'
);

select results_eq(
  $query$
    select capacity.checked_at = before_check.checked_at
    from private.learner_profile_capacity_checks as capacity
    cross join retention_capacity_before_owner_maintenance as before_check
    where capacity.singleton
  $query$,
  $$values (true)$$,
  'an exact-owner apply leaves global capacity evidence unchanged'
);

select results_eq(
  $query$
    select
      count(*) filter (where version.generation = 1 and version.revision = 1),
      count(*) filter (where version.generation = 1 and version.revision between 2 and 5),
      count(*) filter (where version.generation = 1 and version.revision = 14),
      count(*) filter (where version.generation = 2)
    from public.learner_profile_versions as version
    where version.user_id = '11111111-1111-4111-8111-111111111111'
  $query$,
  $$values (0::bigint, 4::bigint, 1::bigint, 1::bigint)$$,
  'ordinary cleanup never deletes the current head or protected recovery versions'
);

select results_eq(
  $query$
    select
      (select count(*) from public.learner_profile_versions where user_id = '22222222-2222-4222-8222-222222222222'),
      (select count(*) from public.learner_profile_write_receipts where user_id = '11111111-1111-4111-8111-111111111111')
  $query$,
  $$values (1::bigint, 1::bigint)$$,
  'unrelated profiles and idempotency receipts remain unchanged'
);

update private.learner_profile_conflicts
set resolved_at = statement_timestamp() - interval '32 days',
    protected_until = statement_timestamp() - interval '1 day'
where user_id = '11111111-1111-4111-8111-111111111111';

update private.learner_profile_recoveries
set restored_at = statement_timestamp() - interval '31 days',
    protected_until = statement_timestamp() + interval '1 day'
where user_id = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select
      status,
      deleted_expired_conflicts,
      deleted_expired_recoveries
    from private.run_learner_profile_maintenance(
      '11111111-1111-4111-8111-111111111111',
      true
    )
  $query$,
  $$values ('applied'::text, 0::bigint, 0::bigint)$$,
  'an expired conflict remains while a protected recovery still references it'
);

update private.learner_profile_recoveries
set restored_at = statement_timestamp() - interval '31 days',
    protected_until = statement_timestamp() - interval '1 day'
where user_id = '11111111-1111-4111-8111-111111111111';

update private.learner_profile_conflicts
set created_at = statement_timestamp() - interval '31 days',
    resolved_at = statement_timestamp() - interval '31 days',
    protected_until = statement_timestamp() - interval '1 day'
where user_id = '11111111-1111-4111-8111-111111111111';

update private.learner_profile_import_backups
set created_at = pg_catalog.now() - interval '30 days',
    protected_until = pg_catalog.now()
where user_id = '11111111-1111-4111-8111-111111111111';

update private.learner_profile_resets
set created_at = statement_timestamp() - interval '31 days',
    protected_until = statement_timestamp() - interval '1 day'
where user_id = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select
      status,
      deleted_ordinary_versions,
      deleted_expired_conflicts,
      deleted_expired_import_backups,
      deleted_expired_resets,
      deleted_expired_recoveries
    from private.run_learner_profile_maintenance(
      '11111111-1111-4111-8111-111111111111',
      true
    )
  $query$,
  $$values ('applied'::text, 5::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'expired protected records are released before five oldest eligible versions are pruned'
);

select results_eq(
  $query$
    select
      count(*) filter (
        where version.generation = 1 and version.revision = 6
      ),
      count(*) filter (
        where version.generation = 1 and version.revision between 7 and 13
      ),
      count(*) filter (
        where version.generation = 1 and version.revision = 14
      ),
      count(*) filter (where version.generation = 2)
    from public.learner_profile_versions as version
    where version.user_id = '11111111-1111-4111-8111-111111111111'
  $query$,
  $$values (0::bigint, 7::bigint, 1::bigint, 1::bigint)$$,
  'after protection expires the newest eight ordinary versions and current head remain'
);

select results_eq(
  $query$
    select
      (select count(*) from private.learner_profile_conflicts where user_id = '11111111-1111-4111-8111-111111111111'),
      (select count(*) from private.learner_profile_import_backups where user_id = '11111111-1111-4111-8111-111111111111'),
      (select count(*) from private.learner_profile_resets where user_id = '11111111-1111-4111-8111-111111111111'),
      (select count(*) from private.learner_profile_recoveries where user_id = '11111111-1111-4111-8111-111111111111')
  $query$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'expired protection records are removed only after their recovery period ends'
);

update private.learner_profile_maintenance_config
set database_limit_bytes = 1,
    cleanup_enabled = true,
    updated_at = statement_timestamp()
where singleton;

select results_eq(
  $query$
    select capacity_status, cleanup_allowed
    from private.learner_profile_capacity_report(null)
  $query$,
  $$values ('pause'::text, false)$$,
  'capacity at or above the pause threshold blocks cleanup'
);

select results_eq(
  $query$
    select status, deleted_ordinary_versions
    from private.run_learner_profile_maintenance(
      '11111111-1111-4111-8111-111111111111',
      true
    )
  $query$,
  $$values ('capacity_pause'::text, 0::bigint)$$,
  'a paused capacity state leaves profile history unchanged'
);

select * from finish();
rollback;
