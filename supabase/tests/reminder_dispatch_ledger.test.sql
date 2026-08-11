create extension if not exists dblink with schema extensions;

-- Concurrent workers need committed fixtures visible from separate database
-- sessions. These fixed test-only users are created and removed through a
-- dedicated connection; the isolated CI database is discarded after the run.
do $setup$
declare
  test_connection text := case
    when inet_server_addr() is null then
      'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
    else pg_catalog.format(
      'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
      inet_server_addr(),
      inet_server_port()
    )
  end;
begin
  perform extensions.dblink_connect(
    'dispatch_setup',
    test_connection
  );
  perform extensions.dblink_exec(
    'dispatch_setup',
    $sql$
      delete from auth.users
      where id in (
        '41111111-1111-4111-8111-111111111111'::uuid,
        '42222222-2222-4222-8222-222222222222'::uuid,
        '43333333-3333-4333-8333-333333333333'::uuid
      )
    $sql$
  );
  perform extensions.dblink_exec(
    'dispatch_setup',
    $sql$
      insert into auth.users (id, email) values
        ('41111111-1111-4111-8111-111111111111', 'dispatch-a@example.test'),
        ('42222222-2222-4222-8222-222222222222', 'dispatch-b@example.test'),
        ('43333333-3333-4333-8333-333333333333', 'dispatch-not-allowed@example.test')
    $sql$
  );
  perform extensions.dblink_exec(
    'dispatch_setup',
    $sql$
      insert into public.reminder_preferences (
        user_id,
        enabled,
        days,
        local_time,
        timezone,
        locale,
        consent_granted_at,
        consent_version,
        consent_source
      ) values
        (
          '41111111-1111-4111-8111-111111111111', true,
          array[1]::smallint[], time '10:00', 'UTC', 'en',
          timestamptz '2026-08-01 00:00:00+00',
          'reminder-email-v1', 'settings'
        ),
        (
          '42222222-2222-4222-8222-222222222222', true,
          array[1]::smallint[], time '10:00', 'UTC', 'fr',
          timestamptz '2026-08-01 00:00:00+00',
          'reminder-email-v1', 'settings'
        ),
        (
          '43333333-3333-4333-8333-333333333333', true,
          array[1]::smallint[], time '10:00', 'UTC', 'es',
          timestamptz '2026-08-01 00:00:00+00',
          'reminder-email-v1', 'settings'
        )
    $sql$
  );
  perform extensions.dblink_exec(
    'dispatch_setup',
    $sql$
      insert into private.reminder_delivery_testers (user_id) values
        ('41111111-1111-4111-8111-111111111111'),
        ('42222222-2222-4222-8222-222222222222')
    $sql$
  );
  perform extensions.dblink_connect(
    'dispatch_worker_a',
    test_connection
  );
  perform extensions.dblink_connect(
    'dispatch_worker_b',
    test_connection
  );
end
$setup$;

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(64);

select has_schema('private', 'the private server schema exists');
select has_table(
  'private',
  'reminder_delivery_control',
  'the private delivery kill switch exists'
);
select has_table(
  'private',
  'reminder_delivery_testers',
  'the private UUID tester allowlist exists'
);
select has_table(
  'private',
  'reminder_deliveries',
  'the private occurrence ledger exists'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.reminder_delivery_control'::regclass
  ),
  true,
  'the delivery control table has RLS enabled'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.reminder_delivery_testers'::regclass
  ),
  true,
  'the tester allowlist has RLS enabled'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.reminder_deliveries'::regclass
  ),
  true,
  'the occurrence ledger has RLS enabled'
);

select hasnt_column(
  'private',
  'reminder_delivery_control',
  'email',
  'the kill switch stores no email address'
);
select hasnt_column(
  'private',
  'reminder_delivery_testers',
  'email',
  'the tester allowlist stores UUIDs rather than email addresses'
);
select hasnt_column(
  'private',
  'reminder_deliveries',
  'email',
  'the occurrence ledger stores no email address'
);
select results_eq(
  $$
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and column_name ilike '%email%'
  $$,
  array[0::bigint],
  'no private reminder column has an email-like name'
);
select results_eq(
  $$
    select delivery_enabled
    from private.reminder_delivery_control
    where singleton
  $$,
  $$values (false)$$,
  'the emergency live-delivery switch starts off'
);
select col_is_pk(
  'private',
  'reminder_delivery_testers',
  'user_id',
  'each tester UUID appears at most once'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'reminder_deliveries'
      and indexname = 'reminder_deliveries_claimable_idx'
      and indexdef like '%WHERE (status = ANY%'
  ),
  'the claim scan uses a partial queue index'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.reminder_deliveries'::regclass
      and conname = 'reminder_deliveries_user_local_date_key'
      and contype = 'u'
  ),
  'one user cannot receive two occurrences for one local date'
);

select ok(
  to_regprocedure(
    'private.reminder_next_occurrence(smallint[],time without time zone,text,timestamp with time zone)'
  ) is not null,
  'the timezone occurrence calculator exists'
);
select ok(
  to_regprocedure('public.reminder_delivery_is_enabled()') is not null,
  'the server-only kill-switch reader exists'
);
select ok(
  to_regprocedure(
    'public.claim_due_reminder_deliveries(timestamp with time zone,integer,integer,integer,text)'
  ) is not null,
  'the atomic claim function exists'
);
select ok(
  to_regprocedure(
    'public.complete_reminder_dry_run(uuid,timestamp with time zone)'
  ) is not null,
  'the lease-token completion function exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reminder_delivery_is_enabled()',
    'EXECUTE'
  ),
  'only the server role can read the live-delivery switch through the API'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_due_reminder_deliveries(timestamp with time zone,integer,integer,integer,text)',
    'EXECUTE'
  ),
  'the server role can claim reminder work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_reminder_dry_run(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'the server role can complete a valid dry-run lease'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reminder_delivery_is_enabled()',
    'EXECUTE'
  ),
  'authenticated browser clients cannot read the server kill switch'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_due_reminder_deliveries(timestamp with time zone,integer,integer,integer,text)',
    'EXECUTE'
  ),
  'authenticated browser clients cannot claim reminder work'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_reminder_dry_run(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated browser clients cannot complete reminder work'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.reminder_delivery_is_enabled()',
    'EXECUTE'
  ),
  'anonymous clients cannot read the server kill switch'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_due_reminder_deliveries(timestamp with time zone,integer,integer,integer,text)',
    'EXECUTE'
  ),
  'anonymous clients cannot claim reminder work'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_reminder_dry_run(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot complete reminder work'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated browser clients cannot use the private schema'
);
select ok(
  not has_schema_privilege('service_role', 'private', 'USAGE'),
  'the service role must use the narrow RPC boundary rather than private tables'
);

select results_eq(
  $$
    select scheduled_local_date, scheduled_for
    from private.reminder_next_occurrence(
      array[7]::smallint[],
      time '02:30',
      'America/New_York',
      timestamptz '2026-03-08 06:00:00+00'
    )
  $$,
  $$values (date '2026-03-08', timestamptz '2026-03-08 07:30:00+00')$$,
  'a nonexistent spring-forward wall time resolves once after the DST gap'
);
select results_eq(
  $$
    select scheduled_local_date, scheduled_for
    from private.reminder_next_occurrence(
      array[7]::smallint[],
      time '01:30',
      'America/New_York',
      timestamptz '2026-11-01 04:00:00+00'
    )
  $$,
  $$values (date '2026-11-01', timestamptz '2026-11-01 06:30:00+00')$$,
  'an ambiguous fall-back wall time resolves once at the later standard-time instant'
);
select results_eq(
  $$
    select scheduled_local_date, scheduled_for
    from private.reminder_next_occurrence(
      array[1, 3]::smallint[],
      time '19:00',
      'Asia/Taipei',
      timestamptz '2026-08-11 12:00:00+00'
    )
  $$,
  $$values (date '2026-08-12', timestamptz '2026-08-12 11:00:00+00')$$,
  'the next selected ISO weekday is computed in the learner timezone'
);

select lives_ok(
  $$
    select extensions.dblink_send_query(
      'dispatch_worker_a',
      $query$
        select delivery_id, claim_token, user_id, attempt_count
        from public.claim_due_reminder_deliveries(
          timestamptz '2026-08-10 10:05:00+00', 1, 900, 120
        )
      $query$
    )
  $$,
  'worker A starts a claim without waiting for application-side coordination'
);
select lives_ok(
  $$
    select extensions.dblink_send_query(
      'dispatch_worker_b',
      $query$
        select delivery_id, claim_token, user_id, attempt_count
        from public.claim_due_reminder_deliveries(
          timestamptz '2026-08-10 10:05:00+00', 1, 900, 120
        )
      $query$
    )
  $$,
  'worker B starts the same due scan concurrently'
);

create temporary table concurrent_claims (
  delivery_id uuid,
  claim_token uuid,
  user_id uuid,
  attempt_count integer
) on commit drop;

insert into concurrent_claims
select *
from extensions.dblink_get_result('dispatch_worker_a') as claim (
  delivery_id uuid,
  claim_token uuid,
  user_id uuid,
  attempt_count integer
);
insert into concurrent_claims
select *
from extensions.dblink_get_result('dispatch_worker_b') as claim (
  delivery_id uuid,
  claim_token uuid,
  user_id uuid,
  attempt_count integer
);

select results_eq(
  $$select count(*) from concurrent_claims$$,
  array[2::bigint],
  'two concurrent workers claim two due occurrences'
);
select results_eq(
  $$select count(distinct delivery_id) from concurrent_claims$$,
  array[2::bigint],
  'concurrent workers never claim the same occurrence ID'
);
select results_eq(
  $$select count(distinct user_id) from concurrent_claims$$,
  array[2::bigint],
  'concurrent workers partition the allowlisted users'
);
select results_eq(
  $$select count(*) from concurrent_claims where attempt_count = 1$$,
  array[2::bigint],
  'first claims start at attempt one'
);
select results_eq(
  $$
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:05:00+00', 100, 900, 120
    )
  $$,
  array[0::bigint],
  'active leases cannot be claimed again'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where user_id = '43333333-3333-4333-8333-333333333333'
  $$,
  array[0::bigint],
  'a non-allowlisted user never enters the private ledger'
);
select results_eq(
  $$select count(*) from private.reminder_deliveries$$,
  array[2::bigint],
  'retry scans do not duplicate materialized occurrences'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where status = 'claimed'
  $$,
  array[2::bigint],
  'both concurrent claims hold independent leases'
);

create temporary table original_claims on commit drop as
select id as delivery_id, user_id, claim_token
from private.reminder_deliveries;

select ok(
  public.complete_reminder_dry_run(
    (
      select claim_token
      from original_claims
      order by user_id
      limit 1
    ),
    timestamptz '2026-08-10 10:06:00+00'
  ),
  'a current lease token can complete one dry-run occurrence'
);
select ok(
  not public.complete_reminder_dry_run(
    (
      select claim_token
      from original_claims
      order by user_id
      limit 1
    ),
    timestamptz '2026-08-10 10:06:01+00'
  ),
  'repeating a completed token has no effect'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where status = 'dry_run_observed'
  $$,
  array[1::bigint],
  'completion records exactly one dry-run observation'
);

create temporary table retried_claim on commit drop as
select *
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:07:01+00', 100, 900, 120
);

select results_eq(
  $$select count(*) from retried_claim$$,
  array[1::bigint],
  'a crashed worker lease becomes claimable after expiry'
);
select results_eq(
  $$select attempt_count from retried_claim$$,
  $$values (2)$$,
  'reclaiming an expired lease increments its attempt count'
);
select ok(
  (
    select retried.claim_token <> original.claim_token
    from retried_claim as retried
    join original_claims as original using (delivery_id)
  ),
  'an expired lease receives a new fencing token'
);
select ok(
  not public.complete_reminder_dry_run(
    (
      select original.claim_token
      from original_claims as original
      join retried_claim as retried using (delivery_id)
    ),
    timestamptz '2026-08-10 10:07:10+00'
  ),
  'a stale crashed-worker token cannot complete the reclaimed occurrence'
);
select ok(
  public.complete_reminder_dry_run(
    (select claim_token from retried_claim),
    timestamptz '2026-08-10 10:07:10+00'
  ),
  'the current fencing token completes the reclaimed dry-run occurrence'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where status = 'dry_run_observed'
      and claim_token is null
      and lease_expires_at is null
  $$,
  array[2::bigint],
  'completed dry runs release every lease without deleting audit rows'
);

update public.reminder_preferences
set local_time = time '10:10',
    updated_at = timestamptz '2026-08-10 10:09:00+00'
where user_id = '41111111-1111-4111-8111-111111111111';

select results_eq(
  $$
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:12:00+00', 100, 900, 120
    )
  $$,
  array[0::bigint],
  'editing the reminder time cannot create a second occurrence that day'
);
select results_eq(
  $$select count(*) from private.reminder_deliveries$$,
  array[2::bigint],
  'the user-and-local-date identity remains stable after preference edits'
);

set local role authenticated;
set local request.jwt.claim.sub = '41111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$select public.reminder_delivery_is_enabled()$$,
  '42501',
  'permission denied for function reminder_delivery_is_enabled',
  'an authenticated browser cannot invoke the kill-switch reader'
);
select throws_ok(
  $$select * from public.claim_due_reminder_deliveries()$$,
  '42501',
  'permission denied for function claim_due_reminder_deliveries',
  'an authenticated browser cannot invoke the dispatcher claim function'
);
select throws_ok(
  $$select public.complete_reminder_dry_run(gen_random_uuid())$$,
  '42501',
  'permission denied for function complete_reminder_dry_run',
  'an authenticated browser cannot complete a dispatch lease'
);
select throws_ok(
  $$select * from private.reminder_deliveries$$,
  '42501',
  'permission denied for schema private',
  'an authenticated browser cannot read the private ledger'
);

set local role anon;
reset request.jwt.claim.sub;
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$select * from public.claim_due_reminder_deliveries()$$,
  '42501',
  'permission denied for function claim_due_reminder_deliveries',
  'an anonymous client cannot invoke the dispatcher claim function'
);
select throws_ok(
  $$select * from private.reminder_delivery_testers$$,
  '42501',
  'permission denied for schema private',
  'an anonymous client cannot inspect the tester allowlist'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select results_eq(
  $$select public.reminder_delivery_is_enabled()$$,
  $$values (false)$$,
  'the server role observes that live delivery remains disabled'
);
select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:15:00+00', 0, 900, 120
    )
  $$,
  '22023',
  'reminder_claim_batch_out_of_range',
  'the claim function rejects an unbounded empty batch'
);
select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:15:00+00', 1, 59, 120
    )
  $$,
  '22023',
  'reminder_claim_due_window_out_of_range',
  'the materialization catch-up window has a safe lower bound'
);
select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:15:00+00', 1, 900, 29
    )
  $$,
  '22023',
  'reminder_claim_lease_out_of_range',
  'leases cannot be configured below the safe lower bound'
);

reset role;

select * from finish();
rollback;

do $cleanup$
begin
  perform extensions.dblink_disconnect('dispatch_worker_a');
  perform extensions.dblink_disconnect('dispatch_worker_b');
  perform extensions.dblink_exec(
    'dispatch_setup',
    $sql$
      delete from auth.users
      where id in (
        '41111111-1111-4111-8111-111111111111'::uuid,
        '42222222-2222-4222-8222-222222222222'::uuid,
        '43333333-3333-4333-8333-333333333333'::uuid
      )
    $sql$
  );
  perform extensions.dblink_disconnect('dispatch_setup');
end
$cleanup$;
