begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(38);

select has_table(
  'public',
  'stripe_webhook_events',
  'the private Stripe webhook event ledger exists'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.stripe_webhook_events'::regclass
  ),
  true,
  'the event ledger has RLS enabled'
);
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.stripe_webhook_events',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'authenticated clients have no event-ledger privileges'
);
select ok(
  not pg_catalog.has_table_privilege(
    'anon',
    'public.stripe_webhook_events',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'anonymous clients have no event-ledger privileges'
);
select ok(
  pg_catalog.has_table_privilege(
    'service_role',
    'public.stripe_webhook_events',
    'SELECT, INSERT, UPDATE, DELETE'
  ),
  'the service role can maintain the event ledger'
);
select has_index(
  'public',
  'stripe_webhook_events',
  'stripe_webhook_events_processed_at_idx',
  'processed webhook events have a cleanup index'
);

select has_column(
  'public',
  'subscriptions',
  'cancel_at_period_end',
  'subscription cancellation state exists'
);
select col_not_null(
  'public',
  'subscriptions',
  'cancel_at_period_end',
  'subscription cancellation state cannot be null'
);
select col_default_is(
  'public',
  'subscriptions',
  'cancel_at_period_end',
  'false',
  'existing and new rows default to not canceling'
);

select has_function(
  'public',
  'claim_stripe_webhook_event',
  array['text', 'text', 'boolean', 'uuid', 'timestamp with time zone', 'timestamp with time zone'],
  'the atomic event claim function exists'
);
select has_function(
  'public',
  'complete_stripe_webhook_event',
  array['text', 'uuid', 'timestamp with time zone'],
  'the event completion function exists'
);
select has_function(
  'public',
  'release_stripe_webhook_event',
  array['text', 'uuid'],
  'the failed-event release function exists'
);

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.claim_stripe_webhook_event(text,text,boolean,uuid,timestamptz,timestamptz)'::regprocedure
  ),
  true,
  'event claims run with definer rights'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.complete_stripe_webhook_event(text,uuid,timestamptz)'::regprocedure
  ),
  true,
  'event completion runs with definer rights'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.release_stripe_webhook_event(text,uuid)'::regprocedure
  ),
  true,
  'event release runs with definer rights'
);

select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.claim_stripe_webhook_event(text,text,boolean,uuid,timestamptz,timestamptz)'::regprocedure
  ),
  'event claims use an empty search path'
);
select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.complete_stripe_webhook_event(text,uuid,timestamptz)'::regprocedure
  ),
  'event completion uses an empty search path'
);
select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.release_stripe_webhook_event(text,uuid)'::regprocedure
  ),
  'event release uses an empty search path'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_stripe_webhook_event(text,text,boolean,uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'the service role can claim webhook events'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.complete_stripe_webhook_event(text,uuid,timestamptz)',
    'EXECUTE'
  ),
  'the service role can complete webhook events'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.release_stripe_webhook_event(text,uuid)',
    'EXECUTE'
  ),
  'the service role can release webhook events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_stripe_webhook_event(text,text,boolean,uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim webhook events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.complete_stripe_webhook_event(text,uuid,timestamptz)',
    'EXECUTE'
  ),
  'authenticated clients cannot complete webhook events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.release_stripe_webhook_event(text,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot release webhook events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.claim_stripe_webhook_event(text,text,boolean,uuid,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'anonymous clients cannot claim webhook events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.complete_stripe_webhook_event(text,uuid,timestamptz)',
    'EXECUTE'
  ),
  'anonymous clients cannot complete webhook events'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.release_stripe_webhook_event(text,uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot release webhook events'
);

set local role service_role;

select results_eq(
  $$select public.claim_stripe_webhook_event(
    'evt_prerequisite_a',
    'customer.subscription.updated',
    false,
    '11111111-1111-4111-8111-111111111111'::uuid,
    timestamptz '2026-08-11 23:55:00+00',
    timestamptz '2026-08-12 00:00:00+00'
  )$$,
  array['claimed'::text],
  'a new event is claimed'
);
select results_eq(
  $$select public.claim_stripe_webhook_event(
    'evt_prerequisite_a',
    'customer.subscription.updated',
    false,
    '22222222-2222-4222-8222-222222222222'::uuid,
    timestamptz '2026-08-11 23:55:00+00',
    timestamptz '2026-08-12 00:01:00+00'
  )$$,
  array['in_progress'::text],
  'a live lease cannot be claimed twice'
);
select results_eq(
  $$select public.claim_stripe_webhook_event(
    'evt_prerequisite_a',
    'customer.subscription.updated',
    false,
    '22222222-2222-4222-8222-222222222222'::uuid,
    timestamptz '2026-08-12 00:01:00+00',
    timestamptz '2026-08-12 00:06:00+00'
  )$$,
  array['claimed'::text],
  'an expired lease can be recovered'
);
select results_eq(
  $$select public.complete_stripe_webhook_event(
    'evt_prerequisite_a',
    '11111111-1111-4111-8111-111111111111'::uuid,
    timestamptz '2026-08-12 00:07:00+00'
  )$$,
  array[false],
  'a stale claimant cannot complete a recovered event'
);
select results_eq(
  $$select public.complete_stripe_webhook_event(
    'evt_prerequisite_a',
    '22222222-2222-4222-8222-222222222222'::uuid,
    timestamptz '2026-08-12 00:07:00+00'
  )$$,
  array[true],
  'the active claimant can complete its event'
);
select results_eq(
  $$select public.claim_stripe_webhook_event(
    'evt_prerequisite_a',
    'customer.subscription.updated',
    false,
    '33333333-3333-4333-8333-333333333333'::uuid,
    timestamptz '2026-08-12 00:03:00+00',
    timestamptz '2026-08-12 00:08:00+00'
  )$$,
  array['processed'::text],
  'a completed event cannot be processed twice'
);
select throws_ok(
  $$select public.claim_stripe_webhook_event(
    'evt_prerequisite_a',
    'customer.subscription.deleted',
    false,
    '33333333-3333-4333-8333-333333333333'::uuid,
    timestamptz '2026-08-12 00:03:00+00',
    timestamptz '2026-08-12 00:08:00+00'
  )$$,
  'P0001',
  'stripe_webhook_event_identity_mismatch',
  'an event ID cannot be rebound to another event identity'
);
select results_eq(
  $$select public.claim_stripe_webhook_event(
    'evt_prerequisite_b',
    'invoice.payment_failed',
    true,
    '44444444-4444-4444-8444-444444444444'::uuid,
    timestamptz '2026-08-12 00:03:00+00',
    timestamptz '2026-08-12 00:08:00+00'
  )$$,
  array['claimed'::text],
  'a second event is claimed independently'
);
select results_eq(
  $$select public.release_stripe_webhook_event(
    'evt_prerequisite_b',
    '44444444-4444-4444-8444-444444444444'::uuid
  )$$,
  array[true],
  'a failed unprocessed event can release its claim'
);
select results_eq(
  $$select public.release_stripe_webhook_event(
    'evt_prerequisite_b',
    '44444444-4444-4444-8444-444444444444'::uuid
  )$$,
  array[false],
  'releasing an absent event is harmless'
);
select throws_ok(
  $$select public.claim_stripe_webhook_event(
    'bad',
    'invoice.payment_failed',
    true,
    '55555555-5555-4555-8555-555555555555'::uuid,
    timestamptz '2026-08-12 00:03:00+00',
    timestamptz '2026-08-12 00:08:00+00'
  )$$,
  'P0001',
  'invalid_stripe_webhook_claim',
  'malformed event IDs fail closed'
);

reset role;

select * from finish();
rollback;
