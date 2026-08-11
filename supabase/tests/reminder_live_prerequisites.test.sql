begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(45);

insert into auth.users (id, email) values
  ('71111111-1111-4111-8111-111111111111', 'fence-a@example.test'),
  ('72222222-2222-4222-8222-222222222222', 'fence-b@example.test'),
  ('73333333-3333-4333-8333-333333333333', 'fence-c@example.test'),
  ('74444444-4444-4444-8444-444444444444', 'fence-d@example.test');

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
    '71111111-1111-4111-8111-111111111111', true,
    array[1]::smallint[], time '10:00', 'UTC', 'en',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '72222222-2222-4222-8222-222222222222', true,
    array[1]::smallint[], time '10:01', 'UTC', 'fr',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '73333333-3333-4333-8333-333333333333', true,
    array[1]::smallint[], time '10:02', 'UTC', 'es',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '74444444-4444-4444-8444-444444444444', true,
    array[1]::smallint[], time '10:03', 'UTC', 'zh-Hant',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  );

insert into private.reminder_delivery_testers (user_id) values
  ('71111111-1111-4111-8111-111111111111'),
  ('72222222-2222-4222-8222-222222222222'),
  ('73333333-3333-4333-8333-333333333333'),
  ('74444444-4444-4444-8444-444444444444');

select ok(
  to_regprocedure(
    'public.store_reminder_unsubscribe_token(uuid,bytea,timestamp with time zone)'
  ) is null,
  'the unfenced token-storage signature no longer exists'
);
select ok(
  to_regprocedure(
    'public.store_reminder_unsubscribe_token(uuid,uuid,bytea,timestamp with time zone)'
  ) is not null,
  'token storage requires both delivery and claim identifiers'
);
select ok(
  to_regprocedure(
    'public.complete_reminder_without_send(uuid,text,timestamp with time zone)'
  ) is not null,
  'the no-send terminal transition exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.store_reminder_unsubscribe_token(uuid,uuid,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'the server role can store a token through the fenced RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_reminder_without_send(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'the server role can complete a validated no-send outcome'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.store_reminder_unsubscribe_token(uuid,uuid,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot bind unsubscribe capabilities'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_reminder_without_send(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot complete no-send failures'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.store_reminder_unsubscribe_token(uuid,uuid,bytea,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot bind unsubscribe capabilities'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_reminder_without_send(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot complete no-send failures'
);
select results_eq(
  $$
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name in ('reminder_deliveries', 'reminder_unsubscribe_tokens')
      and column_name ilike '%email%'
  $$,
  array[0::bigint],
  'the live prerequisites store no email address'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-10 10:04:00+00'
where singleton;

create temporary table initial_claims on commit drop as
select delivery_id, claim_token, user_id, attempt_count
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:05:00+00', 10, 900, 120, 'live'
);

select is(
  (select count(*) from initial_claims),
  4::bigint,
  'all four current tester occurrences receive live leases'
);
select is(
  (select count(*) from initial_claims where attempt_count = 1),
  4::bigint,
  'initial live leases start at attempt one'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    gen_random_uuid(),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:05:20+00'
  ),
  false,
  'a non-current claim token cannot bind a capability'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    decode('abcd', 'hex'),
    timestamptz '2026-08-10 10:05:20+00'
  ),
  false,
  'a malformed capability digest is rejected'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:05:20+00'
  ),
  true,
  'the current lease can bind one valid capability digest'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:05:30+00'
  ),
  true,
  'the same current claim and digest are idempotent'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    (
      select claim_token from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('bb', 32), 'hex'),
    timestamptz '2026-08-10 10:05:30+00'
  ),
  false,
  'one occurrence cannot be rebound to another capability'
);

select is(
  public.complete_reminder_without_send(
    (
      select claim_token from initial_claims
      where user_id = '72222222-2222-4222-8222-222222222222'
    ),
    null,
    timestamptz '2026-08-10 10:05:30+00'
  ),
  false,
  'a null no-send failure code is rejected'
);
select is(
  public.complete_reminder_without_send(
    (
      select claim_token from initial_claims
      where user_id = '72222222-2222-4222-8222-222222222222'
    ),
    'configuration_invalid',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  false,
  'configuration errors cannot masquerade as no-recipient outcomes'
);
select is(
  public.complete_reminder_without_send(
    gen_random_uuid(),
    'recipient_unavailable',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  false,
  'a stale token cannot complete a no-send outcome'
);
select is(
  public.complete_reminder_without_send(
    (
      select claim_token from initial_claims
      where user_id = '72222222-2222-4222-8222-222222222222'
    ),
    'recipient_unavailable',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  true,
  'the current lease can record a confirmed missing recipient'
);
select results_eq(
  $$
    select status, failure_code, permanent_failure_at,
      provider_name is null, send_started_at is null,
      send_retry_deadline is null, claim_token is null,
      lease_expires_at is null
    from private.reminder_deliveries
    where user_id = '72222222-2222-4222-8222-222222222222'
  $$,
  $$values (
    'permanent_failure'::text,
    'recipient_unavailable'::text,
    timestamptz '2026-08-10 10:05:30+00',
    true, true, true, true, true
  )$$,
  'recipient failure is terminal without inventing provider attempt state'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '72222222-2222-4222-8222-222222222222'
    ),
    (
      select claim_token from initial_claims
      where user_id = '72222222-2222-4222-8222-222222222222'
    ),
    decode(repeat('bb', 32), 'hex'),
    timestamptz '2026-08-10 10:05:40+00'
  ),
  false,
  'a terminal occurrence cannot bind a capability'
);

select is(
  public.record_reminder_suppression(
    '73333333-3333-4333-8333-333333333333',
    'hard_bounce',
    'provider_webhook',
    timestamptz '2026-08-10 10:05:40+00'
  ),
  true,
  'suppression invalidates a current lease before token storage'
);
select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '73333333-3333-4333-8333-333333333333'
    ),
    (
      select claim_token from initial_claims
      where user_id = '73333333-3333-4333-8333-333333333333'
    ),
    decode(repeat('cc', 32), 'hex'),
    timestamptz '2026-08-10 10:05:50+00'
  ),
  false,
  'suppression fences capability storage'
);
select is(
  (
    select status from private.reminder_deliveries
    where user_id = '73333333-3333-4333-8333-333333333333'
  ),
  'suppressed',
  'the suppression transition remains terminal'
);

update public.reminder_preferences
set locale = 'en',
    updated_at = timestamptz '2026-08-10 10:05:50+00'
where user_id = '74444444-4444-4444-8444-444444444444';

select is(
  public.store_reminder_unsubscribe_token(
    (
      select delivery_id from initial_claims
      where user_id = '74444444-4444-4444-8444-444444444444'
    ),
    (
      select claim_token from initial_claims
      where user_id = '74444444-4444-4444-8444-444444444444'
    ),
    decode(repeat('dd', 32), 'hex'),
    timestamptz '2026-08-10 10:06:00+00'
  ),
  false,
  'a changed preference snapshot fences capability storage'
);

create temporary table retry_claims on commit drop as
select delivery_id, claim_token, user_id, attempt_count
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:07:10+00', 10, 900, 120, 'live'
);

select is(
  (select count(*) from retry_claims),
  1::bigint,
  'only the unchanged unsuppressed expired occurrence is reclaimed'
);
select is(
  (select attempt_count from retry_claims),
  2,
  'the reclaimed occurrence increments its attempt count'
);
select isnt(
  (select claim_token from retry_claims),
  (
    select claim_token from initial_claims
    where user_id = '71111111-1111-4111-8111-111111111111'
  ),
  'the reclaimed occurrence receives a new fencing token'
);
select is(
  public.store_reminder_unsubscribe_token(
    (select delivery_id from retry_claims),
    (
      select claim_token from initial_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    ),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:07:20+00'
  ),
  false,
  'a crashed worker cannot store with its stale claim token'
);
select is(
  public.store_reminder_unsubscribe_token(
    (select delivery_id from retry_claims),
    (select claim_token from retry_claims),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:07:20+00'
  ),
  true,
  'the current retry token can reuse the deterministic digest'
);
select is(
  public.store_reminder_unsubscribe_token(
    (select delivery_id from retry_claims),
    (select claim_token from retry_claims),
    decode(repeat('ee', 32), 'hex'),
    timestamptz '2026-08-10 10:07:20+00'
  ),
  false,
  'the retry cannot rotate the deterministic capability'
);

delete from private.reminder_delivery_testers
where user_id = '71111111-1111-4111-8111-111111111111';

select is(
  public.store_reminder_unsubscribe_token(
    (select delivery_id from retry_claims),
    (select claim_token from retry_claims),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:07:30+00'
  ),
  false,
  'removing the tester UUID immediately fences token storage'
);

insert into private.reminder_delivery_testers (user_id)
values ('71111111-1111-4111-8111-111111111111');

select is(
  public.store_reminder_unsubscribe_token(
    (select delivery_id from retry_claims),
    (select claim_token from retry_claims),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-10 10:07:40+00'
  ),
  true,
  'restoring the tester UUID restores only the current claim capability'
);
select is(
  (select count(*) from private.reminder_unsubscribe_tokens),
  1::bigint,
  'all retries preserve one digest for one occurrence'
);
select is(
  public.begin_reminder_provider_attempt(
    (select claim_token from retry_claims),
    'resend',
    timestamptz '2026-08-10 10:07:50+00'
  ),
  true,
  'the current retry can enter provider-attempt state after token storage'
);
select is(
  public.complete_reminder_without_send(
    (select claim_token from retry_claims),
    'recipient_unavailable',
    timestamptz '2026-08-10 10:08:00+00'
  ),
  false,
  'a started provider attempt cannot be rewritten as a no-send outcome'
);
select results_eq(
  $$
    select status, provider_name, send_started_at,
      permanent_failure_at is null, failure_code is null
    from private.reminder_deliveries
    where user_id = '71111111-1111-4111-8111-111111111111'
  $$,
  $$values (
    'claimed'::text,
    'resend'::text,
    timestamptz '2026-08-10 10:07:50+00',
    true,
    true
  )$$,
  'the no-send RPC preserves an already-started provider attempt'
);
select results_eq(
  $$
    select status, claim_token is null, lease_expires_at is null
    from private.reminder_deliveries
    where user_id in (
      '72222222-2222-4222-8222-222222222222',
      '73333333-3333-4333-8333-333333333333'
    )
    order by user_id
  $$,
  $$values
    ('permanent_failure'::text, true, true),
    ('suppressed'::text, true, true)
  $$,
  'terminal no-send and suppression outcomes release their leases'
);

set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$
    select public.store_reminder_unsubscribe_token(
      gen_random_uuid(), gen_random_uuid(), decode(repeat('aa', 32), 'hex')
    )
  $$,
  '42501',
  'permission denied for function store_reminder_unsubscribe_token',
  'an authenticated client cannot store a capability'
);
select throws_ok(
  $$
    select public.complete_reminder_without_send(
      gen_random_uuid(), 'recipient_unavailable'
    )
  $$,
  '42501',
  'permission denied for function complete_reminder_without_send',
  'an authenticated client cannot complete a no-send outcome'
);
select throws_ok(
  $$select * from private.reminder_unsubscribe_tokens$$,
  '42501',
  'permission denied for schema private',
  'an authenticated client cannot inspect capability digests'
);

set local role anon;
reset request.jwt.claim.sub;
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$
    select public.store_reminder_unsubscribe_token(
      gen_random_uuid(), gen_random_uuid(), decode(repeat('aa', 32), 'hex')
    )
  $$,
  '42501',
  'permission denied for function store_reminder_unsubscribe_token',
  'an unauthenticated client cannot store a capability'
);
select throws_ok(
  $$
    select public.complete_reminder_without_send(
      gen_random_uuid(), 'recipient_unavailable'
    )
  $$,
  '42501',
  'permission denied for function complete_reminder_without_send',
  'an unauthenticated client cannot complete a no-send outcome'
);

reset role;

select * from finish();
rollback;
