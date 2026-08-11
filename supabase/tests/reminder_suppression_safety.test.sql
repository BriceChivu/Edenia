begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(55);

insert into auth.users (id, email) values
  ('51111111-1111-4111-8111-111111111111', 'suppression-a@example.test'),
  ('52222222-2222-4222-8222-222222222222', 'suppression-b@example.test');

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
    '51111111-1111-4111-8111-111111111111', true,
    array[1]::smallint[], time '10:00', 'UTC', 'en',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '52222222-2222-4222-8222-222222222222', true,
    array[1]::smallint[], time '10:00', 'UTC', 'fr',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  );

insert into private.reminder_delivery_testers (user_id) values
  ('51111111-1111-4111-8111-111111111111'),
  ('52222222-2222-4222-8222-222222222222');

select has_table(
  'private',
  'reminder_suppressions',
  'private recipient suppressions exist'
);
select has_table(
  'private',
  'reminder_unsubscribe_tokens',
  'private unsubscribe token digests exist'
);
select col_is_pk(
  'private',
  'reminder_suppressions',
  'user_id',
  'one sticky suppression exists per user'
);
select col_is_pk(
  'private',
  'reminder_unsubscribe_tokens',
  'token_digest',
  'the token digest is the capability primary key'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.reminder_unsubscribe_tokens'::regclass
      and contype = 'u'
      and conname = 'reminder_unsubscribe_tokens_delivery_id_key'
  ),
  'each occurrence has at most one unsubscribe token digest'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.reminder_suppressions'::regclass
  ),
  true,
  'recipient suppressions have RLS enabled'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.reminder_unsubscribe_tokens'::regclass
  ),
  true,
  'unsubscribe token digests have RLS enabled'
);
select results_eq(
  $$
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name in (
        'reminder_suppressions',
        'reminder_unsubscribe_tokens'
      )
      and column_name ilike '%email%'
  $$,
  array[0::bigint],
  'suppression safety state stores no email address'
);
select hasnt_column(
  'private',
  'reminder_unsubscribe_tokens',
  'token',
  'the raw unsubscribe capability is never stored'
);
select col_type_is(
  'private',
  'reminder_unsubscribe_tokens',
  'token_digest',
  'bytea',
  'unsubscribe capabilities are represented by binary digests'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.reminder_unsubscribe_tokens'::regclass
      and conname = 'reminder_unsubscribe_tokens_digest_check'
  ),
  'the database enforces a 32-byte SHA-256 digest'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated browser clients cannot use the private schema'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.reminder_suppressions',
    'SELECT'
  ),
  'authenticated clients cannot select suppressions'
);
select ok(
  not has_table_privilege(
    'anon',
    'private.reminder_unsubscribe_tokens',
    'SELECT'
  ),
  'anonymous clients cannot select unsubscribe token digests'
);
select ok(
  not has_table_privilege(
    'service_role',
    'private.reminder_unsubscribe_tokens',
    'SELECT'
  ),
  'the API service role cannot bypass the narrow RPCs with table access'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.store_reminder_unsubscribe_token(uuid,uuid,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'the service role can bind one digest to a claimed occurrence'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_reminder_suppression(uuid,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'the service role can record a validated suppression reason'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_reminder_unsubscribe_token(bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'the service role can consume a token digest'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.store_reminder_unsubscribe_token(uuid,uuid,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot mint token bindings'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_reminder_suppression(uuid,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot suppress another account'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_reminder_unsubscribe_token(bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the token consumer directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consume_reminder_unsubscribe_token(bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot call the token consumer directly'
);
select ok(
  not has_function_privilege(
    'service_role',
    'private.apply_reminder_suppression(uuid,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'the private mutation helper is not an API capability'
);

create temporary table suppression_claims (
  delivery_id uuid primary key,
  claim_token uuid not null,
  user_id uuid not null unique
) on commit drop;
grant select, insert on table suppression_claims to service_role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';

insert into suppression_claims (delivery_id, claim_token, user_id)
select delivery_id, claim_token, user_id
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:15:00+00', 10, 900, 120
);

select is(
  (select count(*) from suppression_claims),
  2::bigint,
  'both eligible tester occurrences are claimed before suppression'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    decode('abcd', 'hex'),
    timestamptz '2026-08-10 10:15:30+00'
  ),
  false,
  'a non-SHA-256 digest cannot be stored'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:15:30+00'
  ),
  true,
  'a valid digest is bound during the active claim lease'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:15:40+00'
  ),
  true,
  'retrying the same occurrence and digest is idempotent'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token
      from suppression_claims
      where user_id = '51111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('bb', 32), 'hex'),
    timestamptz '2026-08-10 10:15:40+00'
  ),
  false,
  'an occurrence cannot be rebound to a different opaque token'
);

reset role;

select is(
  (
    select count(*)
    from private.reminder_unsubscribe_tokens
  ),
  1::bigint,
  'only one token digest was persisted'
);
select is(
  (
    select octet_length(token_digest)
    from private.reminder_unsubscribe_tokens
  ),
  32,
  'the stored capability is exactly one SHA-256 digest'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.consume_reminder_unsubscribe_token(
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:15:00+00'
  ),
  'invalid',
  'a token cannot be consumed before it was created'
);
select is(
  public.consume_reminder_unsubscribe_token(
    decode(repeat('cc', 32), 'hex'),
    timestamptz '2026-08-10 10:16:00+00'
  ),
  'invalid',
  'an unknown digest reveals no account information'
);
select is(
  public.consume_reminder_unsubscribe_token(
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:16:00+00'
  ),
  'unsubscribed',
  'the valid digest is consumed exactly once'
);
select is(
  public.consume_reminder_unsubscribe_token(
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:17:00+00'
  ),
  'already_unsubscribed',
  'a consumed digest cannot apply a second mutation'
);

reset role;

select results_eq(
  $$
    select reason, source
    from private.reminder_suppressions
    where user_id = '51111111-1111-4111-8111-111111111111'
  $$,
  $$values ('unsubscribed'::text, 'unsubscribe_token'::text)$$,
  'token consumption creates sticky unsubscribe suppression'
);
select results_eq(
  $$
    select enabled, consent_revoked_at
    from public.reminder_preferences
    where user_id = '51111111-1111-4111-8111-111111111111'
  $$,
  $$values (false, timestamptz '2026-08-10 10:16:00+00')$$,
  'token consumption disables delivery consent'
);
select results_eq(
  $$
    select status, claim_token is null, lease_expires_at is null, suppressed_at
    from private.reminder_deliveries
    where user_id = '51111111-1111-4111-8111-111111111111'
  $$,
  $$values (
    'suppressed'::text,
    true,
    true,
    timestamptz '2026-08-10 10:16:00+00'
  )$$,
  'token consumption fences already-claimed work'
);
select is(
  (
    select consumed_at
    from private.reminder_unsubscribe_tokens
    where token_digest = decode(repeat('aa', 32), 'hex')
  ),
  timestamptz '2026-08-10 10:16:00+00',
  'the first consumption time remains authoritative'
);

update public.reminder_preferences
set enabled = true,
    consent_revoked_at = null,
    updated_at = timestamptz '2026-08-11 00:00:00+00'
where user_id = '51111111-1111-4111-8111-111111111111';

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  (
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-17 10:15:00+00', 10, 900, 120
    )
    where user_id = '51111111-1111-4111-8111-111111111111'
  ),
  0::bigint,
  'client preference changes cannot bypass server suppression'
);

reset role;

select is(
  (
    select count(*)
    from private.reminder_deliveries
    where user_id = '51111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'suppressed users do not materialize new occurrences'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.record_reminder_suppression(
    '52222222-2222-4222-8222-222222222222',
    'complaint',
    'operator',
    timestamptz '2026-08-17 10:16:00+00'
  ),
  false,
  'invalid reason and source combinations are rejected'
);
select is(
  public.record_reminder_suppression(
    '52222222-2222-4222-8222-222222222222',
    null,
    'provider_webhook',
    timestamptz '2026-08-17 10:16:00+00'
  ),
  false,
  'missing provider suppression metadata is rejected cleanly'
);
select is(
  public.record_reminder_suppression(
    '53333333-3333-4333-8333-333333333333',
    'hard_bounce',
    'provider_webhook',
    timestamptz '2026-08-17 10:16:00+00'
  ),
  false,
  'a webhook replay for a deleted or unknown account is harmless'
);
select is(
  public.record_reminder_suppression(
    '52222222-2222-4222-8222-222222222222',
    'hard_bounce',
    'provider_webhook',
    timestamptz '2026-08-17 10:16:00+00'
  ),
  true,
  'a provider hard bounce creates suppression through the narrow RPC'
);

reset role;

select results_eq(
  $$
    select reason, source
    from private.reminder_suppressions
    where user_id = '52222222-2222-4222-8222-222222222222'
  $$,
  $$values ('hard_bounce'::text, 'provider_webhook'::text)$$,
  'the validated provider suppression reason is retained'
);
select is(
  (
    select enabled
    from public.reminder_preferences
    where user_id = '52222222-2222-4222-8222-222222222222'
  ),
  false,
  'provider suppression disables reminder preferences'
);
select results_eq(
  $$
    select distinct status
    from private.reminder_deliveries
    where user_id = '52222222-2222-4222-8222-222222222222'
  $$,
  $$values ('suppressed'::text)$$,
  'provider suppression fences every outstanding occurrence'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  public.record_reminder_suppression(
    '52222222-2222-4222-8222-222222222222',
    'complaint',
    'provider_webhook',
    timestamptz '2026-08-17 10:17:00+00'
  ),
  true,
  'replayed provider suppression is idempotent'
);

reset role;

select results_eq(
  $$
    select reason, suppressed_at
    from private.reminder_suppressions
    where user_id = '52222222-2222-4222-8222-222222222222'
  $$,
  $$values (
    'hard_bounce'::text,
    timestamptz '2026-08-17 10:16:00+00'
  )$$,
  'the first sticky suppression is not rewritten by a replay'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select is(
  (
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-24 10:15:00+00', 10, 900, 120
    )
  ),
  0::bigint,
  'no suppressed recipient can be reclaimed'
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$select * from private.reminder_suppressions$$,
  '42501',
  'permission denied for schema private',
  'an authenticated browser cannot inspect suppression state'
);
select throws_ok(
  $$
    select public.record_reminder_suppression(
      '52222222-2222-4222-8222-222222222222',
      'manual',
      'operator'
    )
  $$,
  '42501',
  'permission denied for function record_reminder_suppression',
  'an authenticated browser cannot suppress another user'
);
select throws_ok(
  $$
    select public.consume_reminder_unsubscribe_token(
      decode(repeat('aa', 32), 'hex')
    )
  $$,
  '42501',
  'permission denied for function consume_reminder_unsubscribe_token',
  'an authenticated browser cannot bypass the future public endpoint'
);

reset role;

set local role anon;
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$select * from private.reminder_unsubscribe_tokens$$,
  '42501',
  'permission denied for schema private',
  'an unauthenticated client cannot inspect token digests'
);
select throws_ok(
  $$
    select public.consume_reminder_unsubscribe_token(
      decode(repeat('aa', 32), 'hex')
    )
  $$,
  '42501',
  'permission denied for function consume_reminder_unsubscribe_token',
  'an unauthenticated client cannot consume a digest directly'
);

reset role;

select * from finish();
rollback;
