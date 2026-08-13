create extension if not exists dblink with schema extensions;

-- Concurrent claims need a committed fixture visible to both worker sessions.
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
  perform extensions.dblink_connect('legacy_relay_setup', test_connection);
  perform extensions.dblink_exec(
    'legacy_relay_setup',
    $sql$
      delete from private.legacy_progress_transfers;
      delete from private.legacy_progress_transfer_daily_metrics;
      update private.legacy_progress_transfer_control
      set acceptance_enabled = true,
          consumption_enabled = true,
          max_live_rows = 256,
          max_live_ciphertext_bytes = 268435456,
          max_creates_per_window = 60,
          max_consumes_per_window = 300,
          creates_in_window = 0,
          consumes_in_window = 0,
          create_window_started_at = timestamptz '2026-08-13 00:00:00+00',
          consume_window_started_at = timestamptz '2026-08-13 00:00:00+00'
      where singleton;
      insert into private.legacy_progress_transfers (
        capability_digest,
        initialization_vector,
        ciphertext,
        ciphertext_digest,
        ciphertext_bytes,
        state,
        created_at,
        expires_at,
        purge_after
      ) values (
        decode(repeat('01', 32), 'hex'),
        decode(repeat('02', 12), 'hex'),
        decode(repeat('03', 17), 'hex'),
        extensions.digest(decode(repeat('03', 17), 'hex'), 'sha256'),
        17,
        'created',
        timestamptz '2026-08-13 00:00:00+00',
        timestamptz '2026-08-13 00:15:00+00',
        timestamptz '2026-08-13 00:15:00+00'
      );
    $sql$
  );
  perform extensions.dblink_connect('legacy_relay_worker_a', test_connection);
  perform extensions.dblink_connect('legacy_relay_worker_b', test_connection);
end
$setup$;

select extensions.dblink_send_query(
  'legacy_relay_worker_a',
  $query$
    select status, initialization_vector, ciphertext, ciphertext_digest,
           ciphertext_bytes, expires_at
    from public.claim_legacy_progress_transfer(
      decode(repeat('01', 32), 'hex'),
      timestamptz '2026-08-13 00:01:00+00'
    )
  $query$
);
select extensions.dblink_send_query(
  'legacy_relay_worker_b',
  $query$
    select status, initialization_vector, ciphertext, ciphertext_digest,
           ciphertext_bytes, expires_at
    from public.claim_legacy_progress_transfer(
      decode(repeat('01', 32), 'hex'),
      timestamptz '2026-08-13 00:01:00+00'
    )
  $query$
);

create temporary table concurrent_legacy_claims (
  status text,
  initialization_vector bytea,
  ciphertext bytea,
  ciphertext_digest bytea,
  ciphertext_bytes integer,
  expires_at timestamptz
);
insert into concurrent_legacy_claims
select *
from extensions.dblink_get_result('legacy_relay_worker_a') as claim (
  status text,
  initialization_vector bytea,
  ciphertext bytea,
  ciphertext_digest bytea,
  ciphertext_bytes integer,
  expires_at timestamptz
);
insert into concurrent_legacy_claims
select *
from extensions.dblink_get_result('legacy_relay_worker_b') as claim (
  status text,
  initialization_vector bytea,
  ciphertext bytea,
  ciphertext_digest bytea,
  ciphertext_bytes integer,
  expires_at timestamptz
);

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, pg_catalog;

select plan(61);

select has_table(
  'private', 'legacy_progress_transfer_control',
  'the private relay control table exists'
);
select has_table(
  'private', 'legacy_progress_transfers',
  'the private opaque transfer table exists'
);
select has_table(
  'private', 'legacy_progress_transfer_daily_metrics',
  'the private anonymous daily metric table exists'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'private.legacy_progress_transfer_control'::regclass),
  true,
  'the relay control has RLS enabled'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'private.legacy_progress_transfers'::regclass),
  true,
  'the transfer table has RLS enabled'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'private.legacy_progress_transfer_daily_metrics'::regclass),
  true,
  'the completion metrics have RLS enabled'
);

select results_eq(
  $$select acceptance_enabled from private.legacy_progress_transfer_control$$,
  $$values (true)$$,
  'the concurrency fixture explicitly enabled acceptance'
);
select results_eq(
  $$select consumption_enabled from private.legacy_progress_transfer_control$$,
  $$values (true)$$,
  'the concurrency fixture explicitly enabled consumption'
);
select results_eq(
  $$
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name like 'legacy_progress_transfer%'
      and column_name ~* '(^|_)(email|user|account|posthog|ip|agent|url|plaintext|source_hash)($|_)'
  $$,
  array[0::bigint],
  'relay tables contain no identity, URL, plaintext, or source hash columns'
);

select ok(
  not has_table_privilege(
    'anon', 'private.legacy_progress_transfer_control', 'select'
  ),
  'anonymous browsers cannot read relay controls'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.legacy_progress_transfers', 'select'
  ),
  'authenticated browsers cannot read ciphertext'
);
select ok(
  not has_table_privilege(
    'service_role', 'private.legacy_progress_transfers', 'select'
  ),
  'the service role cannot bypass the RPC boundary to read ciphertext'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_legacy_progress_transfer(bytea,bytea,bytea,bytea,integer,timestamptz)',
    'execute'
  ),
  'anonymous browsers cannot call the create RPC directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_legacy_progress_transfer(bytea,timestamptz)',
    'execute'
  ),
  'authenticated browsers cannot call the claim RPC directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_legacy_progress_transfer(bytea,bytea,bytea,bytea,integer,timestamptz)',
    'execute'
  ),
  'the service role may call the exact create RPC signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_legacy_progress_transfer(bytea,timestamptz)',
    'execute'
  ),
  'the service role may call the exact claim RPC signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_legacy_progress_transfer(bytea,timestamptz)',
    'execute'
  ),
  'the service role may call the exact completion RPC signature'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cleanup_legacy_progress_transfers(timestamptz,integer)',
    'execute'
  ),
  'the service role may call only the bounded cleanup RPC'
);
select results_eq(
  $$
    select prosecdef, proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.create_legacy_progress_transfer(bytea,bytea,bytea,bytea,integer,timestamptz)'::regprocedure
  $$,
  $$values (true, true)$$,
  'the create RPC is a security definer with an empty search path'
);
select results_eq(
  $$
    select prosecdef, proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.claim_legacy_progress_transfer(bytea,timestamptz)'::regprocedure
  $$,
  $$values (true, true)$$,
  'the claim RPC is a security definer with an empty search path'
);
select results_eq(
  $$
    select prosecdef, proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.complete_legacy_progress_transfer(bytea,timestamptz)'::regprocedure
  $$,
  $$values (true, true)$$,
  'the completion RPC is a security definer with an empty search path'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'legacy_progress_transfers'
      and indexname = 'legacy_progress_transfers_purge_after_idx'
  ),
  'cleanup has an index on the purge deadline'
);
select has_trigger(
  'private', 'legacy_progress_transfers',
  'enforce_legacy_progress_transfer_transition',
  'the transfer lifecycle has a one-way transition trigger'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.legacy_progress_transfers'::regclass
      and conname = 'legacy_progress_transfers_payload_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%2097168%'
  ),
  'the database enforces the reviewed two-MiB-plus-tag ciphertext ceiling'
);

select results_eq(
  $$select count(*) from concurrent_legacy_claims$$,
  array[2::bigint],
  'both concurrent claims return one bounded result'
);
select results_eq(
  $$select count(*) from concurrent_legacy_claims where status = 'claimed'$$,
  array[1::bigint],
  'only one concurrent worker receives ciphertext'
);
select results_eq(
  $$select count(*) from concurrent_legacy_claims where status = 'invalid'$$,
  array[1::bigint],
  'the losing concurrent worker receives no ciphertext'
);
select results_eq(
  $$
    select count(*)
    from concurrent_legacy_claims
    where status <> 'claimed'
      and (
        initialization_vector is not null
        or ciphertext is not null
        or ciphertext_digest is not null
        or ciphertext_bytes is not null
        or expires_at is not null
      )
  $$,
  array[0::bigint],
  'a failed claim discloses no transfer fields'
);

delete from private.legacy_progress_transfers;
delete from private.legacy_progress_transfer_daily_metrics;
update private.legacy_progress_transfer_control
set acceptance_enabled = false,
    consumption_enabled = false,
    max_live_rows = 256,
    max_live_ciphertext_bytes = 268435456,
    max_creates_per_window = 60,
    max_consumes_per_window = 300,
    creates_in_window = 0,
    consumes_in_window = 0,
    create_window_started_at = timestamptz '2026-08-13 00:00:00+00',
    consume_window_started_at = timestamptz '2026-08-13 00:00:00+00'
where singleton;

select results_eq(
  $$
    select status
    from public.create_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      decode(repeat('12', 12), 'hex'),
      decode(repeat('13', 17), 'hex'),
      extensions.digest(decode(repeat('13', 17), 'hex'), 'sha256'),
      17,
      timestamptz '2026-08-13 01:00:00+00'
    )
  $$,
  $$values ('acceptance_disabled'::text)$$,
  'new transfers fail closed while acceptance is off'
);
select results_eq(
  $$select count(*) from private.legacy_progress_transfers$$,
  array[0::bigint],
  'disabled acceptance writes no transfer row'
);

update private.legacy_progress_transfer_control
set acceptance_enabled = true
where singleton;

select results_eq(
  $$
    select status, expires_at
    from public.create_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      decode(repeat('12', 12), 'hex'),
      decode(repeat('13', 17), 'hex'),
      extensions.digest(decode(repeat('13', 17), 'hex'), 'sha256'),
      17,
      timestamptz '2026-08-13 01:00:00+00'
    )
  $$,
  $$values ('created'::text, timestamptz '2026-08-13 01:15:00+00')$$,
  'enabled acceptance creates one fifteen-minute transfer'
);
select results_eq(
  $$select count(*) from private.legacy_progress_transfers$$,
  array[1::bigint],
  'one create produces one row'
);
select results_eq(
  $$
    select initialization_vector, ciphertext, ciphertext_bytes
    from private.legacy_progress_transfers
    where capability_digest = decode(repeat('11', 32), 'hex')
  $$,
  $$
    values (
      decode(repeat('12', 12), 'hex'),
      decode(repeat('13', 17), 'hex'),
      17
    )
  $$,
  'the relay stores only the exact opaque payload bytes'
);
select results_eq(
  $$
    select status
    from public.create_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      decode(repeat('12', 12), 'hex'),
      decode(repeat('13', 17), 'hex'),
      extensions.digest(decode(repeat('13', 17), 'hex'), 'sha256'),
      17,
      timestamptz '2026-08-13 01:01:00+00'
    )
  $$,
  $$values ('created'::text)$$,
  'an identical unexpired create retry is idempotent'
);
select results_eq(
  $$select count(*) from private.legacy_progress_transfers$$,
  array[1::bigint],
  'an idempotent create retry cannot duplicate the row'
);
select results_eq(
  $$
    select status
    from public.create_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      decode(repeat('12', 12), 'hex'),
      decode(repeat('14', 17), 'hex'),
      extensions.digest(decode(repeat('14', 17), 'hex'), 'sha256'),
      17,
      timestamptz '2026-08-13 01:01:00+00'
    )
  $$,
  $$values ('conflict'::text)$$,
  'the same digest cannot be rebound to different ciphertext'
);
select results_eq(
  $$
    select public.complete_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      timestamptz '2026-08-13 01:02:00+00'
    )
  $$,
  $$values ('consumption_disabled'::text)$$,
  'completion is independently disabled before any claim'
);
select results_eq(
  $$
    select status
    from public.claim_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      timestamptz '2026-08-13 01:02:00+00'
    )
  $$,
  $$values ('consumption_disabled'::text)$$,
  'claiming is independently disabled'
);

update private.legacy_progress_transfer_control
set acceptance_enabled = false,
    consumption_enabled = true,
    consume_window_started_at = timestamptz '2026-08-13 01:00:00+00',
    consumes_in_window = 0
where singleton;

select results_eq(
  $$
    select status
    from public.create_legacy_progress_transfer(
      decode(repeat('21', 32), 'hex'),
      decode(repeat('22', 12), 'hex'),
      decode(repeat('23', 17), 'hex'),
      extensions.digest(decode(repeat('23', 17), 'hex'), 'sha256'),
      17,
      timestamptz '2026-08-13 01:03:00+00'
    )
  $$,
  $$values ('acceptance_disabled'::text)$$,
  'acceptance can stop while valid transfers keep draining'
);
select results_eq(
  $$
    select status, initialization_vector, ciphertext, ciphertext_bytes
    from public.claim_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      timestamptz '2026-08-13 01:03:00+00'
    )
  $$,
  $$
    values (
      'claimed'::text,
      decode(repeat('12', 12), 'hex'),
      decode(repeat('13', 17), 'hex'),
      17
    )
  $$,
  'a valid in-flight transfer remains claimable during drain'
);
select results_eq(
  $$
    select status
    from public.claim_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      timestamptz '2026-08-13 01:04:00+00'
    )
  $$,
  $$values ('invalid'::text)$$,
  'ciphertext cannot be claimed twice'
);
select results_eq(
  $$
    select public.complete_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      timestamptz '2026-08-13 01:05:00+00'
    )
  $$,
  $$values ('completed'::text)$$,
  'a claimed transfer completes once'
);
select results_eq(
  $$
    select count(*)
    from private.legacy_progress_transfers
    where state = 'completed'
      and initialization_vector is null
      and ciphertext is null
      and ciphertext_digest is null
      and ciphertext_bytes is null
  $$,
  array[1::bigint],
  'completion immediately removes every payload byte'
);
select results_eq(
  $$
    select metric_date, completed_count
    from private.legacy_progress_transfer_daily_metrics
  $$,
  $$values (date '2026-08-13', 1::bigint)$$,
  'completion records one anonymous UTC-day count'
);
select results_eq(
  $$
    select public.complete_legacy_progress_transfer(
      decode(repeat('11', 32), 'hex'),
      timestamptz '2026-08-13 01:06:00+00'
    )
  $$,
  $$values ('already_completed'::text)$$,
  'a lost completion response can be retried idempotently'
);
select results_eq(
  $$select completed_count from private.legacy_progress_transfer_daily_metrics$$,
  $$values (1::bigint)$$,
  'an idempotent completion retry cannot double-count success'
);

insert into private.legacy_progress_transfers (
  capability_digest,
  initialization_vector,
  ciphertext,
  ciphertext_digest,
  ciphertext_bytes,
  state,
  created_at,
  expires_at,
  purge_after
) values (
  decode(repeat('31', 32), 'hex'),
  decode(repeat('32', 12), 'hex'),
  decode(repeat('33', 17), 'hex'),
  extensions.digest(decode(repeat('33', 17), 'hex'), 'sha256'),
  17,
  'created',
  timestamptz '2026-08-12 00:00:00+00',
  timestamptz '2026-08-12 00:15:00+00',
  timestamptz '2026-08-12 00:15:00+00'
);
select results_eq(
  $$
    select public.cleanup_legacy_progress_transfers(
      timestamptz '2026-08-13 02:00:00+00', 1
    )
  $$,
  $$values (1)$$,
  'cleanup deletes at most the requested batch of expired rows'
);
select results_eq(
  $$
    select count(*)
    from private.legacy_progress_transfers
    where capability_digest = decode(repeat('31', 32), 'hex')
  $$,
  array[0::bigint],
  'the expired opaque payload is gone after cleanup'
);

select throws_ok(
  $$
    select * from public.create_legacy_progress_transfer(
      decode(repeat('41', 31), 'hex'),
      decode(repeat('42', 12), 'hex'),
      decode(repeat('43', 17), 'hex'),
      extensions.digest(decode(repeat('43', 17), 'hex'), 'sha256'),
      17,
      timestamptz '2026-08-13 02:00:00+00'
    )
  $$,
  '22023',
  'legacy_progress_create_arguments_invalid',
  'create rejects a non-SHA-256 capability digest'
);
select throws_ok(
  $$
    select * from public.create_legacy_progress_transfer(
      decode(repeat('41', 32), 'hex'),
      decode(repeat('42', 12), 'hex'),
      decode(repeat('43', 17), 'hex'),
      decode(repeat('44', 32), 'hex'),
      17,
      timestamptz '2026-08-13 02:00:00+00'
    )
  $$,
  '22023',
  'legacy_progress_create_arguments_invalid',
  'create recomputes and rejects a forged ciphertext digest'
);

delete from private.legacy_progress_transfers;
update private.legacy_progress_transfer_control
set acceptance_enabled = true,
    consumption_enabled = true,
    max_live_rows = 1,
    max_live_ciphertext_bytes = 268435456,
    max_creates_per_window = 60,
    creates_in_window = 0,
    create_window_started_at = timestamptz '2026-08-13 02:00:00+00'
where singleton;
select results_eq(
  $$
    select status from public.create_legacy_progress_transfer(
      decode(repeat('51', 32), 'hex'), decode(repeat('52', 12), 'hex'),
      decode(repeat('53', 17), 'hex'),
      extensions.digest(decode(repeat('53', 17), 'hex'), 'sha256'),
      17, timestamptz '2026-08-13 02:01:00+00'
    )
  $$,
  $$values ('created'::text)$$,
  'the first transfer fits within the global capacity'
);
select results_eq(
  $$
    select status from public.create_legacy_progress_transfer(
      decode(repeat('54', 32), 'hex'), decode(repeat('55', 12), 'hex'),
      decode(repeat('56', 17), 'hex'),
      extensions.digest(decode(repeat('56', 17), 'hex'), 'sha256'),
      17, timestamptz '2026-08-13 02:01:00+00'
    )
  $$,
  $$values ('capacity_exceeded'::text)$$,
  'the serialized global row budget fails closed'
);
select results_eq(
  $$
    select count(*) from private.legacy_progress_transfers
    where state in ('created', 'claimed')
  $$,
  array[1::bigint],
  'a capacity rejection cannot overfill the relay'
);

delete from private.legacy_progress_transfers;
update private.legacy_progress_transfer_control
set max_live_rows = 256,
    max_creates_per_window = 1,
    creates_in_window = 0,
    create_window_started_at = timestamptz '2026-08-13 03:00:00+00'
where singleton;
select results_eq(
  $$
    select status from public.create_legacy_progress_transfer(
      decode(repeat('61', 32), 'hex'), decode(repeat('62', 12), 'hex'),
      decode(repeat('63', 17), 'hex'),
      extensions.digest(decode(repeat('63', 17), 'hex'), 'sha256'),
      17, timestamptz '2026-08-13 03:00:01+00'
    )
  $$,
  $$values ('created'::text)$$,
  'the first request in a fixed global window succeeds'
);
select results_eq(
  $$
    select status from public.create_legacy_progress_transfer(
      decode(repeat('64', 32), 'hex'), decode(repeat('65', 12), 'hex'),
      decode(repeat('66', 17), 'hex'),
      extensions.digest(decode(repeat('66', 17), 'hex'), 'sha256'),
      17, timestamptz '2026-08-13 03:00:02+00'
    )
  $$,
  $$values ('rate_limited'::text)$$,
  'the global request window fails closed after its limit'
);

insert into private.legacy_progress_transfers (
  capability_digest, initialization_vector, ciphertext, ciphertext_digest,
  ciphertext_bytes, state, created_at, claimed_at, expires_at, purge_after
) values (
  decode(repeat('71', 32), 'hex'), decode(repeat('72', 12), 'hex'),
  decode(repeat('73', 17), 'hex'),
  extensions.digest(decode(repeat('73', 17), 'hex'), 'sha256'),
  17, 'claimed', timestamptz '2026-08-13 04:00:00+00',
  timestamptz '2026-08-13 04:01:00+00',
  timestamptz '2026-08-13 04:15:00+00',
  timestamptz '2026-08-13 04:15:00+00'
);
select throws_ok(
  $$
    update private.legacy_progress_transfers
    set state = 'created', claimed_at = null
    where capability_digest = decode(repeat('71', 32), 'hex')
  $$,
  '23514',
  'legacy_progress_transfer_invalid_transition',
  'a claimed row cannot move backward to created'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
select throws_ok(
  $$select * from private.legacy_progress_transfers$$,
  '42501',
  'permission denied for schema private',
  'an authenticated browser cannot inspect the private relay'
);
select throws_ok(
  $$
    select * from public.create_legacy_progress_transfer(
      decode(repeat('81', 32), 'hex'), decode(repeat('82', 12), 'hex'),
      decode(repeat('83', 17), 'hex'),
      decode(repeat('84', 32), 'hex'), 17,
      timestamptz '2026-08-13 05:00:00+00'
    )
  $$,
  '42501',
  'permission denied for function create_legacy_progress_transfer',
  'an authenticated browser cannot invoke the service RPC'
);

set local role anon;
set local request.jwt.claim.role = 'anon';
select throws_ok(
  $$select * from private.legacy_progress_transfer_daily_metrics$$,
  '42501',
  'permission denied for schema private',
  'an anonymous browser cannot inspect retirement metrics'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select throws_ok(
  $$select * from private.legacy_progress_transfers$$,
  '42501',
  'permission denied for schema private',
  'the service role cannot read private ciphertext directly'
);
select throws_ok(
  $$
    select * from public.claim_legacy_progress_transfer(
      decode(repeat('91', 31), 'hex'),
      timestamptz '2026-08-13 05:00:00+00'
    )
  $$,
  '22023',
  'legacy_progress_claim_arguments_invalid',
  'the service RPC rejects a malformed capability digest'
);

reset role;

select * from finish();
rollback;

do $cleanup$
begin
  perform extensions.dblink_disconnect('legacy_relay_worker_a');
  perform extensions.dblink_disconnect('legacy_relay_worker_b');
  perform extensions.dblink_exec(
    'legacy_relay_setup',
    $sql$
      delete from private.legacy_progress_transfers;
      delete from private.legacy_progress_transfer_daily_metrics;
      update private.legacy_progress_transfer_control
      set acceptance_enabled = false,
          consumption_enabled = false,
          max_live_rows = 256,
          max_live_ciphertext_bytes = 268435456,
          max_creates_per_window = 60,
          max_consumes_per_window = 300,
          creates_in_window = 0,
          consumes_in_window = 0,
          create_window_started_at = date_trunc('minute', now()),
          consume_window_started_at = date_trunc('minute', now()),
          updated_at = now()
      where singleton;
    $sql$
  );
  perform extensions.dblink_disconnect('legacy_relay_setup');
end
$cleanup$;
