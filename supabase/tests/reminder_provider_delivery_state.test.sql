begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(59);

insert into auth.users (id, email) values
  ('61111111-1111-4111-8111-111111111111', 'provider-a@example.test'),
  ('62222222-2222-4222-8222-222222222222', 'provider-b@example.test'),
  ('63333333-3333-4333-8333-333333333333', 'provider-c@example.test'),
  ('64444444-4444-4444-8444-444444444444', 'provider-d@example.test'),
  ('65555555-5555-4555-8555-555555555555', 'provider-e@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'provider-not-allowed@example.test');

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
    '61111111-1111-4111-8111-111111111111', true,
    array[1]::smallint[], time '10:00', 'UTC', 'en',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '62222222-2222-4222-8222-222222222222', true,
    array[1]::smallint[], time '10:01', 'UTC', 'fr',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '63333333-3333-4333-8333-333333333333', true,
    array[1]::smallint[], time '10:02', 'UTC', 'es',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '64444444-4444-4444-8444-444444444444', true,
    array[1]::smallint[], time '10:03', 'UTC', 'zh-Hant',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '65555555-5555-4555-8555-555555555555', true,
    array[1]::smallint[], time '10:04', 'UTC', 'zh-Hans',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '66666666-6666-4666-8666-666666666666', true,
    array[1]::smallint[], time '10:00', 'UTC', 'en',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  );

insert into private.reminder_delivery_testers (user_id) values
  ('61111111-1111-4111-8111-111111111111'),
  ('62222222-2222-4222-8222-222222222222'),
  ('63333333-3333-4333-8333-333333333333'),
  ('64444444-4444-4444-8444-444444444444'),
  ('65555555-5555-4555-8555-555555555555');

select has_column(
  'private', 'reminder_deliveries', 'provider_name',
  'the private ledger records a provider name without storing an address'
);
select has_column(
  'private', 'reminder_deliveries', 'send_started_at',
  'the first potentially-live send instant is durable'
);
select has_column(
  'private', 'reminder_deliveries', 'send_retry_deadline',
  'the provider retry horizon is durable'
);
select has_column(
  'private', 'reminder_deliveries', 'provider_accepted_at',
  'provider API acceptance has a distinct timestamp'
);
select has_column(
  'private', 'reminder_deliveries', 'provider_message_id',
  'provider acceptance has a non-PII correlation identifier'
);
select has_column(
  'private', 'reminder_deliveries', 'permanent_failure_at',
  'permanent failure has a terminal timestamp'
);
select has_column(
  'private', 'reminder_deliveries', 'outcome_ambiguous_at',
  'expired unknown provider outcomes require operator review'
);
select results_eq(
  $$
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'reminder_deliveries'
      and column_name ilike '%email%'
  $$,
  array[0::bigint],
  'provider delivery state stores no email address'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'reminder_deliveries'
      and indexname = 'reminder_deliveries_provider_message_id_key'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ),
  'one provider message ID cannot be attached to two occurrences'
);
select ok(
  to_regprocedure(
    'public.claim_due_reminder_deliveries(timestamp with time zone,integer,integer,integer,text)'
  ) is not null,
  'the claim function requires an explicit server delivery mode when requested'
);
select ok(
  to_regprocedure(
    'public.begin_reminder_provider_attempt(uuid,text,timestamp with time zone)'
  ) is not null,
  'the provider-attempt fencing function exists'
);
select ok(
  to_regprocedure(
    'public.complete_reminder_provider_acceptance(uuid,text,text,timestamp with time zone)'
  ) is not null,
  'the provider-acceptance fencing function exists'
);
select ok(
  to_regprocedure(
    'public.complete_reminder_provider_failure(uuid,text,text,timestamp with time zone)'
  ) is not null,
  'the permanent-failure fencing function exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.begin_reminder_provider_attempt(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'the server role can begin a provider attempt through the narrow RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_reminder_provider_attempt(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated browser clients cannot begin provider attempts'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_reminder_provider_acceptance(uuid,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot complete provider acceptance'
);
select ok(
  not has_table_privilege(
    'service_role', 'private.reminder_deliveries', 'SELECT'
  ),
  'the service role still cannot bypass the RPC boundary with table reads'
);

select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:05:00+00', 10, 900, 120, 'live'
    )
  $$,
  '55000',
  'reminder_live_delivery_disabled',
  'live claims fail closed while the independent switch is off'
);
select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:05:00+00', 10, 900, 120, 'preview'
    )
  $$,
  '22023',
  'reminder_claim_mode_invalid',
  'unknown dispatcher modes are rejected'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-10 10:04:00+00'
where singleton;

select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:05:00+00', 10, 900, 120, 'dry_run'
    )
  $$,
  '55000',
  'reminder_dry_run_delivery_enabled',
  'dry-run claims cannot race after live delivery is enabled'
);

create temporary table provider_claims on commit drop as
select delivery_id, claim_token, user_id, attempt_count
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:05:00+00', 10, 900, 120, 'live'
);

select is(
  (select count(*) from provider_claims),
  5::bigint,
  'all five allowlisted occurrences are atomically claimed for live work'
);
select is(
  (
    select count(*)
    from private.reminder_deliveries
    where user_id = '66666666-6666-4666-8666-666666666666'
  ),
  0::bigint,
  'a non-allowlisted user never enters the provider ledger'
);
select is(
  (select count(*) from provider_claims where attempt_count = 1),
  5::bigint,
  'first live claims start at attempt one'
);

select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '61111111-1111-4111-8111-111111111111'
    ),
    'resend',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  true,
  'the current live lease can begin its first provider attempt'
);
select results_eq(
  $$
    select provider_name, send_started_at, send_retry_deadline
    from private.reminder_deliveries
    where user_id = '61111111-1111-4111-8111-111111111111'
  $$,
  $$values (
    'resend'::text,
    timestamptz '2026-08-10 10:05:30+00',
    timestamptz '2026-08-11 09:05:30+00'
  )$$,
  'the retry boundary is fixed 23 hours after the first send start'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '61111111-1111-4111-8111-111111111111'
    ),
    'resend',
    timestamptz '2026-08-10 10:05:40+00'
  ),
  true,
  'retrying the same provider begin is idempotent'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '61111111-1111-4111-8111-111111111111'
    ),
    'another_provider',
    timestamptz '2026-08-10 10:05:40+00'
  ),
  false,
  'an occurrence cannot switch providers after its first possible send'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '62222222-2222-4222-8222-222222222222'
    ),
    'resend',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  true,
  'a second occurrence can begin independently'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '64444444-4444-4444-8444-444444444444'
    ),
    'resend',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  true,
  'an ambiguity fixture begins inside the retry horizon'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '65555555-5555-4555-8555-555555555555'
    ),
    'resend',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  true,
  'a suppression fixture begins under a fenced live lease'
);

update private.reminder_delivery_control
set delivery_enabled = false,
    updated_at = timestamptz '2026-08-10 10:05:45+00'
where singleton;

select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '63333333-3333-4333-8333-333333333333'
    ),
    'resend',
    timestamptz '2026-08-10 10:05:50+00'
  ),
  false,
  'turning off the switch prevents the next provider begin'
);
select is(
  public.complete_reminder_provider_acceptance(
    (
      select claim_token from provider_claims
      where user_id = '61111111-1111-4111-8111-111111111111'
    ),
    'resend',
    'msg_provider_a',
    timestamptz '2026-08-10 10:06:00+00'
  ),
  true,
  'an in-flight provider response is recorded even after the kill switch turns off'
);
select results_eq(
  $$
    select status, provider_name, provider_message_id,
      provider_accepted_at, claim_token is null, lease_expires_at is null
    from private.reminder_deliveries
    where user_id = '61111111-1111-4111-8111-111111111111'
  $$,
  $$values (
    'provider_accepted'::text,
    'resend'::text,
    'msg_provider_a'::text,
    timestamptz '2026-08-10 10:06:00+00',
    true,
    true
  )$$,
  'provider acceptance is terminal, accurately named, and releases its lease'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-10 10:06:10+00'
where singleton;

select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from provider_claims
      where user_id = '63333333-3333-4333-8333-333333333333'
    ),
    'resend',
    timestamptz '2026-08-10 10:06:20+00'
  ),
  true,
  'a claim may begin only after the operator re-enables live delivery'
);
select is(
  public.complete_reminder_provider_failure(
    (
      select claim_token from provider_claims
      where user_id = '63333333-3333-4333-8333-333333333333'
    ),
    'resend',
    'transient_network_error',
    timestamptz '2026-08-10 10:06:25+00'
  ),
  false,
  'arbitrary provider errors cannot become permanent terminal codes'
);
select is(
  public.complete_reminder_provider_failure(
    (
      select claim_token from provider_claims
      where user_id = '63333333-3333-4333-8333-333333333333'
    ),
    'resend',
    'recipient_unavailable',
    timestamptz '2026-08-10 10:06:30+00'
  ),
  true,
  'a validated permanent failure completes under the current fencing token'
);
select results_eq(
  $$
    select status, failure_code, permanent_failure_at,
      provider_message_id is null
    from private.reminder_deliveries
    where user_id = '63333333-3333-4333-8333-333333333333'
  $$,
  $$values (
    'permanent_failure'::text,
    'recipient_unavailable'::text,
    timestamptz '2026-08-10 10:06:30+00',
    true
  )$$,
  'permanent failure stores a bounded code rather than provider payload or email'
);
select is(
  public.record_reminder_suppression(
    '65555555-5555-4555-8555-555555555555',
    'hard_bounce',
    'provider_webhook',
    timestamptz '2026-08-10 10:06:40+00'
  ),
  true,
  'suppression can fence a provider attempt before any future adapter call'
);
select results_eq(
  $$
    select status, provider_name, claim_token is null,
      lease_expires_at is null, suppressed_at
    from private.reminder_deliveries
    where user_id = '65555555-5555-4555-8555-555555555555'
  $$,
  $$values (
    'suppressed'::text,
    'resend'::text,
    true,
    true,
    timestamptz '2026-08-10 10:06:40+00'
  )$$,
  'suppression keeps the provider audit start while invalidating the live lease'
);

create temporary table retry_claims on commit drop as
select delivery_id, claim_token, user_id, attempt_count
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:07:10+00', 10, 900, 120, 'live'
);

select is(
  (select count(*) from retry_claims),
  2::bigint,
  'only the two expired, non-terminal provider attempts are reclaimed'
);
select is(
  (select count(*) from retry_claims where attempt_count = 2),
  2::bigint,
  'provider retries increment the durable attempt count'
);
select is(
  (
    select count(*)
    from retry_claims as retry
    join provider_claims as original using (delivery_id)
    where retry.claim_token <> original.claim_token
  ),
  2::bigint,
  'retries receive new fencing tokens after crashed leases expire'
);
select is(
  public.complete_reminder_provider_acceptance(
    (
      select claim_token from provider_claims
      where user_id = '62222222-2222-4222-8222-222222222222'
    ),
    'resend',
    'msg_stale',
    timestamptz '2026-08-10 10:07:20+00'
  ),
  false,
  'a stale crashed-worker token cannot record provider acceptance'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from retry_claims
      where user_id = '62222222-2222-4222-8222-222222222222'
    ),
    'resend',
    timestamptz '2026-08-10 10:07:20+00'
  ),
  true,
  'a retry keeps the original provider and first-start deadline'
);
select is(
  public.begin_reminder_provider_attempt(
    (
      select claim_token from retry_claims
      where user_id = '64444444-4444-4444-8444-444444444444'
    ),
    'resend',
    timestamptz '2026-08-10 10:07:20+00'
  ),
  true,
  'the ambiguity fixture can retry only inside its original horizon'
);
select throws_ok(
  $$
    select public.complete_reminder_provider_acceptance(
      (
        select claim_token from retry_claims
        where user_id = '64444444-4444-4444-8444-444444444444'
      ),
      'resend',
      'msg_provider_a',
      timestamptz '2026-08-10 10:07:30+00'
    )
  $$,
  '23505',
  null,
  'one provider message ID cannot be attached to another occurrence'
);
select is(
  public.complete_reminder_provider_acceptance(
    (
      select claim_token from retry_claims
      where user_id = '62222222-2222-4222-8222-222222222222'
    ),
    'resend',
    'msg_provider_b',
    timestamptz '2026-08-10 10:08:00+00'
  ),
  true,
  'the current retry token records provider acceptance exactly once'
);
select results_eq(
  $$
    select status, provider_message_id, send_started_at, send_retry_deadline
    from private.reminder_deliveries
    where user_id = '62222222-2222-4222-8222-222222222222'
  $$,
  $$values (
    'provider_accepted'::text,
    'msg_provider_b'::text,
    timestamptz '2026-08-10 10:05:30+00',
    timestamptz '2026-08-11 09:05:30+00'
  )$$,
  'provider retries never extend the first-send idempotency horizon'
);

update private.reminder_delivery_control
set delivery_enabled = false,
    updated_at = timestamptz '2026-08-10 10:08:10+00'
where singleton;

select is(
  public.complete_reminder_dry_run(
    (
      select claim_token from retry_claims
      where user_id = '64444444-4444-4444-8444-444444444444'
    ),
    timestamptz '2026-08-10 10:08:20+00'
  ),
  false,
  'dry-run completion cannot consume an occurrence after a live send may have started'
);
select is(
  (
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-10 10:09:20+00', 10, 900, 120, 'dry_run'
    )
  ),
  0::bigint,
  'the dry-run worker never reclaims an expired provider attempt'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-11 09:05:30+00'
where singleton;

select is(
  (
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-11 09:05:30+00', 10, 900, 120, 'live'
    )
  ),
  0::bigint,
  'an unknown outcome is never sent again at the retry deadline'
);
select results_eq(
  $$
    select status, outcome_ambiguous_at, claim_token is null,
      lease_expires_at is null
    from private.reminder_deliveries
    where user_id = '64444444-4444-4444-8444-444444444444'
  $$,
  $$values (
    'outcome_ambiguous'::text,
    timestamptz '2026-08-11 09:05:30+00',
    true,
    true
  )$$,
  'expired unknown outcomes become terminal operator-review records'
);
select results_eq(
  $$
    select status, count(*)
    from private.reminder_deliveries
    group by status
    order by status
  $$,
  $$values
    ('outcome_ambiguous'::text, 1::bigint),
    ('permanent_failure'::text, 1::bigint),
    ('provider_accepted'::text, 2::bigint),
    ('suppressed'::text, 1::bigint)
  $$,
  'every live occurrence ends in one explicit non-delivery or provider state'
);
select is(
  (
    select count(*)
    from private.reminder_deliveries
    where claim_token is not null or lease_expires_at is not null
  ),
  0::bigint,
  'all terminal provider states release their leases'
);

set local role authenticated;
set local request.jwt.claim.sub = '61111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$
    select public.begin_reminder_provider_attempt(
      gen_random_uuid(), 'resend'
    )
  $$,
  '42501',
  'permission denied for function begin_reminder_provider_attempt',
  'an authenticated browser cannot begin a provider attempt'
);
select throws_ok(
  $$
    select public.complete_reminder_provider_acceptance(
      gen_random_uuid(), 'resend', 'msg_forbidden'
    )
  $$,
  '42501',
  'permission denied for function complete_reminder_provider_acceptance',
  'an authenticated browser cannot record provider acceptance'
);
select throws_ok(
  $$select * from private.reminder_deliveries$$,
  '42501',
  'permission denied for schema private',
  'an authenticated browser cannot inspect provider delivery state'
);

set local role anon;
reset request.jwt.claim.sub;
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$
    select public.complete_reminder_provider_failure(
      gen_random_uuid(), 'resend', 'provider_rejected'
    )
  $$,
  '42501',
  'permission denied for function complete_reminder_provider_failure',
  'an unauthenticated client cannot complete a provider failure'
);
select throws_ok(
  $$
    select *
    from public.claim_due_reminder_deliveries(
      now(), 10, 900, 120, 'live'
    )
  $$,
  '42501',
  'permission denied for function claim_due_reminder_deliveries',
  'an unauthenticated client cannot claim provider work'
);

reset role;

select * from finish();
rollback;
