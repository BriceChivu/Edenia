begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(20);

select has_table(
  'public',
  'billing_rate_limit_buckets',
  'the service rate-limit bucket table exists'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.billing_rate_limit_buckets'::regclass
  ),
  true,
  'the bucket table has RLS enabled'
);
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.billing_rate_limit_buckets',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'authenticated clients have no bucket-table privileges'
);
select ok(
  not pg_catalog.has_table_privilege(
    'anon',
    'public.billing_rate_limit_buckets',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'anonymous clients have no bucket-table privileges'
);
select ok(
  pg_catalog.has_table_privilege(
    'service_role',
    'public.billing_rate_limit_buckets',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'the service role can maintain rate-limit buckets'
);

select has_function(
  'public',
  'consume_billing_rate_limit',
  array['text', 'text', 'integer', 'integer', 'timestamp with time zone'],
  'the atomic rate-limit function exists'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.consume_billing_rate_limit(text,text,integer,integer,timestamptz)'::regprocedure
  ),
  true,
  'the rate-limit function runs with definer rights'
);
select is(
  (
    select provolatile
    from pg_catalog.pg_proc
    where oid = 'public.consume_billing_rate_limit(text,text,integer,integer,timestamptz)'::regprocedure
  ),
  'v'::"char",
  'the mutating rate-limit function remains volatile'
);
select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.consume_billing_rate_limit(text,text,integer,integer,timestamptz)'::regprocedure
  ),
  'the security definer has an empty search path'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.consume_billing_rate_limit(text,text,integer,integer,timestamptz)',
    'EXECUTE'
  ),
  'the service role can consume a rate limit'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.consume_billing_rate_limit(text,text,integer,integer,timestamptz)',
    'EXECUTE'
  ),
  'authenticated clients cannot invoke the rate-limit definer'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.consume_billing_rate_limit(text,text,integer,integer,timestamptz)',
    'EXECUTE'
  ),
  'anonymous clients cannot invoke the rate-limit definer'
);

set local role service_role;

select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:00:00+00')$$,
  array[true],
  'the first request is allowed'
);
select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:00:00+00')$$,
  array[true],
  'the second request is allowed'
);
select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:00:00+00')$$,
  array[true],
  'the third request is allowed'
);
select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:00:00+00')$$,
  array[true],
  'the fourth request is allowed'
);
select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:00:00+00')$$,
  array[true],
  'the fifth request is allowed'
);
select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:00:00+00')$$,
  array[false],
  'the sixth request is denied'
);
select results_eq(
  $$select allowed from public.consume_billing_rate_limit('account-export-user', repeat('a', 64), 600, 5, timestamptz '2026-08-12 00:10:00+00')$$,
  array[true],
  'the next fixed window allows requests again'
);
select throws_ok(
  $$select * from public.consume_billing_rate_limit('account-export-user', 'not-a-hash', 600, 5)$$,
  'P0001',
  'invalid_billing_rate_limit',
  'malformed hashed subjects fail closed'
);

reset role;

select * from finish();
rollback;
