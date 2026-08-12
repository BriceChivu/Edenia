begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(53);

insert into auth.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'event-a@example.test'),
  ('82222222-2222-4222-8222-222222222222', 'event-b@example.test'),
  ('83333333-3333-4333-8333-333333333333', 'event-c@example.test'),
  ('84444444-4444-4444-8444-444444444444', 'event-d@example.test'),
  ('85555555-5555-4555-8555-555555555555', 'event-e@example.test');

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
    '81111111-1111-4111-8111-111111111111', true,
    array[1]::smallint[], time '10:00', 'UTC', 'en',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '82222222-2222-4222-8222-222222222222', true,
    array[1]::smallint[], time '10:01', 'UTC', 'fr',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '83333333-3333-4333-8333-333333333333', true,
    array[1]::smallint[], time '10:02', 'UTC', 'es',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '84444444-4444-4444-8444-444444444444', true,
    array[1]::smallint[], time '10:03', 'UTC', 'zh-Hant',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  ),
  (
    '85555555-5555-4555-8555-555555555555', true,
    array[1]::smallint[], time '10:04', 'UTC', 'zh-Hans',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1', 'settings'
  );

insert into private.reminder_delivery_testers (user_id)
select id
from auth.users
where id in (
  '81111111-1111-4111-8111-111111111111',
  '82222222-2222-4222-8222-222222222222',
  '83333333-3333-4333-8333-333333333333',
  '84444444-4444-4444-8444-444444444444',
  '85555555-5555-4555-8555-555555555555'
);

select has_table(
  'private',
  'reminder_provider_events',
  'private provider event metadata exists'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.reminder_provider_events'::regclass
      and conname = 'reminder_provider_events_pkey'
      and contype = 'p'
  ),
  'provider and event identifiers form one idempotency key'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'private.reminder_provider_events'::regclass
  ),
  true,
  'provider event metadata has RLS enabled'
);
select results_eq(
  $$
    select count(*)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'reminder_provider_events'
      and column_name ilike '%email%'
  $$,
  array[0::bigint],
  'provider events store no email address'
);
select ok(
  not has_table_privilege(
    'service_role', 'private.reminder_provider_events', 'SELECT'
  ),
  'the service role cannot read provider events outside an RPC'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.reminder_provider_events', 'SELECT'
  ),
  'authenticated browser clients cannot read provider events'
);
select ok(
  to_regprocedure(
    'public.record_reminder_provider_event(text,text,text,uuid,text,timestamp with time zone,timestamp with time zone)'
  ) is not null,
  'the bounded provider-event RPC exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_reminder_provider_event(text,text,text,uuid,text,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'the service role can record a verified provider event'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_reminder_provider_event(text,text,text,uuid,text,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot record provider events'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_reminder_provider_event(text,text,text,uuid,text,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot record provider events'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'reminder_provider_events'
      and indexname = 'reminder_provider_events_delivery_id_idx'
  ),
  'delivery event history has a bounded lookup index'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'reminder_provider_events'
      and indexname = 'reminder_provider_events_received_at_idx'
  ),
  'provider event age has an operational index'
);
select has_column(
  'private',
  'reminder_provider_events',
  'duplicate_count',
  'exact provider-event replays have an aggregate counter'
);
select has_column(
  'private',
  'reminder_provider_events',
  'last_duplicate_at',
  'the latest exact replay time is observable'
);
select has_function(
  'public',
  'get_reminder_operational_metrics',
  array['timestamp with time zone'],
  'the privacy-safe reminder metrics function exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_reminder_operational_metrics(timestamp with time zone)',
    'EXECUTE'
  ),
  'the service role can read aggregate reminder health'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_reminder_operational_metrics(timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated clients cannot read operational reminder health'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_reminder_operational_metrics(timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous clients cannot read operational reminder health'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-10 10:04:00+00'
where singleton;

create temporary table event_claims on commit drop as
select delivery_id, claim_token, user_id
from public.claim_due_reminder_deliveries(
  timestamptz '2026-08-10 10:05:00+00', 10, 900, 600, 'live'
);

select is(
  (select count(*) from event_claims),
  5::bigint,
  'all event fixtures have live claims'
);

select is(
  public.begin_reminder_provider_attempt(
    (select claim_token from event_claims where user_id = '81111111-1111-4111-8111-111111111111'),
    'resend', timestamptz '2026-08-10 10:05:20+00'
  ), true, 'the observed-event fixture begins provider delivery'
);
select is(
  public.begin_reminder_provider_attempt(
    (select claim_token from event_claims where user_id = '82222222-2222-4222-8222-222222222222'),
    'resend', timestamptz '2026-08-10 10:05:20+00'
  ), true, 'the bounce fixture begins provider delivery'
);
select is(
  public.begin_reminder_provider_attempt(
    (select claim_token from event_claims where user_id = '83333333-3333-4333-8333-333333333333'),
    'resend', timestamptz '2026-08-10 10:05:20+00'
  ), true, 'the complaint fixture begins provider delivery'
);
select is(
  public.begin_reminder_provider_attempt(
    (select claim_token from event_claims where user_id = '84444444-4444-4444-8444-444444444444'),
    'resend', timestamptz '2026-08-10 10:05:20+00'
  ), true, 'the provider-suppressed fixture begins delivery'
);
select is(
  public.begin_reminder_provider_attempt(
    (select claim_token from event_claims where user_id = '85555555-5555-4555-8555-555555555555'),
    'resend', timestamptz '2026-08-10 10:05:20+00'
  ), true, 'the ambiguity fixture begins provider delivery'
);

update private.reminder_delivery_control
set delivery_enabled = false,
    updated_at = timestamptz '2026-08-10 10:05:25+00'
where singleton;

select is(
  public.record_reminder_provider_event(
    'resend', 'evt_sent_a', 'email.sent',
    (select delivery_id from event_claims where user_id = '81111111-1111-4111-8111-111111111111'),
    'msg_event_a',
    timestamptz '2026-08-10 10:05:28+00',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  'recorded',
  'a signed observed event can reconcile the provider-acceptance race'
);
select results_eq(
  $$
    select status, provider_message_id, provider_accepted_at,
      claim_token is null, lease_expires_at is null
    from private.reminder_deliveries
    where user_id = '81111111-1111-4111-8111-111111111111'
  $$,
  $$values (
    'provider_accepted'::text,
    'msg_event_a'::text,
    timestamptz '2026-08-10 10:05:30+00',
    true,
    true
  )$$,
  'event reconciliation releases the lease and records acceptance'
);
select is(
  (select count(*) from private.reminder_provider_events),
  1::bigint,
  'one bounded event row is stored'
);
select is(
  public.record_reminder_provider_event(
    'resend', 'evt_sent_a', 'email.sent',
    (select delivery_id from event_claims where user_id = '81111111-1111-4111-8111-111111111111'),
    'msg_event_a',
    timestamptz '2026-08-10 10:05:28+00',
    timestamptz '2026-08-10 10:05:29+00'
  ),
  'duplicate',
  'an exact event replay is idempotent even with a later receive time'
);
select is(
  (select count(*) from private.reminder_provider_events),
  1::bigint,
  'an exact replay creates no second row'
);
select results_eq(
  $$
    select duplicate_count, last_duplicate_at
    from private.reminder_provider_events
    where provider_name = 'resend' and event_id = 'evt_sent_a'
  $$,
  $$values (1, timestamptz '2026-08-10 10:05:30+00')$$,
  'an exact replay increments only its counter and keeps time monotonic'
);
select is(
  public.record_reminder_provider_event(
    'resend', 'evt_sent_a', 'email.delivered',
    (select delivery_id from event_claims where user_id = '81111111-1111-4111-8111-111111111111'),
    'msg_event_a',
    timestamptz '2026-08-10 10:05:28+00',
    timestamptz '2026-08-10 10:06:00+00'
  ),
  'event_conflict',
  'an event ID cannot be replayed with changed content'
);
select is(
  (select count(*) from private.reminder_provider_events),
  1::bigint,
  'a conflicting replay creates no row or side effect'
);
select is(
  public.record_reminder_provider_event(
    'resend', 'evt_unknown', 'email.sent',
    '89999999-9999-4999-8999-999999999999',
    'msg_unknown',
    timestamptz '2026-08-10 10:05:28+00',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  'unmatched',
  'an unknown delivery tag cannot create provider state'
);
select is(
  public.record_reminder_provider_event(
    'resend', 'evt_future', 'email.sent',
    (select delivery_id from event_claims where user_id = '82222222-2222-4222-8222-222222222222'),
    'msg_future',
    timestamptz '2026-08-10 10:20:00+00',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  'invalid',
  'an implausibly future provider event is rejected'
);
select is(
  public.record_reminder_provider_event(
    null, 'evt_null_provider', null,
    (select delivery_id from event_claims where user_id = '82222222-2222-4222-8222-222222222222'),
    'msg_null_provider',
    timestamptz '2026-08-10 10:05:28+00',
    timestamptz '2026-08-10 10:05:30+00'
  ),
  'invalid',
  'null provider and event types fail closed without a constraint error'
);
select is(
  public.record_reminder_provider_event(
    'resend', 'evt_collision', 'email.sent',
    (select delivery_id from event_claims where user_id = '82222222-2222-4222-8222-222222222222'),
    'msg_event_a',
    timestamptz '2026-08-10 10:05:31+00',
    timestamptz '2026-08-10 10:05:32+00'
  ),
  'event_conflict',
  'one provider message cannot be rebound to another delivery tag'
);

select is(
  public.record_reminder_provider_event(
    'resend', 'evt_bounce_b', 'email.bounced',
    (select delivery_id from event_claims where user_id = '82222222-2222-4222-8222-222222222222'),
    'msg_event_b',
    timestamptz '2026-08-10 10:05:31+00',
    timestamptz '2026-08-10 10:05:32+00'
  ),
  'suppressed',
  'a bounce atomically records its event and sticky suppression'
);
select results_eq(
  $$
    select reason, source
    from private.reminder_suppressions
    where user_id = '82222222-2222-4222-8222-222222222222'
  $$,
  $$values ('hard_bounce'::text, 'provider_webhook'::text)$$,
  'a bounce has the narrow hard-bounce reason'
);
select results_eq(
  $$
    select enabled, consent_revoked_at is not null
    from public.reminder_preferences
    where user_id = '82222222-2222-4222-8222-222222222222'
  $$,
  $$values (false, true)$$,
  'a bounced preference is disabled and consent is revoked'
);

select is(
  public.record_reminder_provider_event(
    'resend', 'evt_complaint_c', 'email.complained',
    (select delivery_id from event_claims where user_id = '83333333-3333-4333-8333-333333333333'),
    'msg_event_c',
    timestamptz '2026-08-10 10:05:32+00',
    timestamptz '2026-08-10 10:05:33+00'
  ),
  'suppressed',
  'a complaint atomically suppresses the recipient'
);
select results_eq(
  $$
    select reason, source
    from private.reminder_suppressions
    where user_id = '83333333-3333-4333-8333-333333333333'
  $$,
  $$values ('complaint'::text, 'provider_webhook'::text)$$,
  'a complaint has its own sticky reason'
);

select is(
  public.record_reminder_provider_event(
    'resend', 'evt_suppressed_d', 'email.suppressed',
    (select delivery_id from event_claims where user_id = '84444444-4444-4444-8444-444444444444'),
    'msg_event_d',
    timestamptz '2026-08-10 10:05:33+00',
    timestamptz '2026-08-10 10:05:34+00'
  ),
  'suppressed',
  'a provider suppression becomes local sticky suppression'
);
select results_eq(
  $$
    select reason, source
    from private.reminder_suppressions
    where user_id = '84444444-4444-4444-8444-444444444444'
  $$,
  $$values ('provider_suppressed'::text, 'provider_webhook'::text)$$,
  'provider suppression is not mislabeled as a bounce or complaint'
);

update private.reminder_deliveries
set status = 'outcome_ambiguous',
    claim_token = null,
    lease_expires_at = null,
    outcome_ambiguous_at = send_retry_deadline,
    updated_at = send_retry_deadline
where user_id = '85555555-5555-4555-8555-555555555555';

select is(
  (
    select status from private.reminder_deliveries
    where user_id = '85555555-5555-4555-8555-555555555555'
  ),
  'outcome_ambiguous',
  'the late-event fixture begins in the fail-closed ambiguous state'
);
select is(
  public.record_reminder_provider_event(
    'resend', 'evt_delivered_e', 'email.delivered',
    (select delivery_id from event_claims where user_id = '85555555-5555-4555-8555-555555555555'),
    'msg_event_e',
    timestamptz '2026-08-11 09:59:00+00',
    timestamptz '2026-08-11 10:00:00+00'
  ),
  'recorded',
  'a late signed event can resolve an ambiguous provider outcome'
);
select results_eq(
  $$
    select status, provider_message_id, outcome_ambiguous_at is null
    from private.reminder_deliveries
    where user_id = '85555555-5555-4555-8555-555555555555'
  $$,
  $$values ('provider_accepted'::text, 'msg_event_e'::text, true)$$,
  'late evidence replaces ambiguity with durable provider acceptance'
);
select is(
  (select count(*) from private.reminder_provider_events),
  5::bigint,
  'only the five valid unique events are stored'
);
select results_eq(
  $$
    select action, count(*)
    from private.reminder_provider_events
    group by action
    order by action
  $$,
  $$values ('observed'::text, 2::bigint), ('suppressed'::text, 3::bigint)$$,
  'event actions support privacy-safe delivery and suppression metrics'
);
select is(
  public.get_reminder_operational_metrics(
    timestamptz '2026-08-11 10:05:00+00'
  ),
  jsonb_build_object(
    'schema_version', 1,
    'generated_at', timestamptz '2026-08-11 10:05:00+00',
    'delivery_enabled', false,
    'queue', jsonb_build_object(
      'due_occurrences', 0,
      'oldest_due_at', null,
      'oldest_age_seconds', null
    ),
    'deliveries', jsonb_build_object(
      'provider_accepted', 5,
      'permanent_failure', 0,
      'outcome_ambiguous', 0
    ),
    'duplicate_provider_events_prevented', 1,
    'suppressions', 3
  ),
  'operators can read exact aggregate health without user or recipient fields'
);
select throws_ok(
  $$select public.get_reminder_operational_metrics(null)$$,
  '22023',
  'reminder_metrics_now_required',
  'metrics reject an absent observation time'
);

set local role anon;
select throws_ok(
  $$
    select public.record_reminder_provider_event(
      'resend', 'evt_anon', 'email.sent',
      '81111111-1111-4111-8111-111111111111', 'msg_anon',
      now(), now()
    )
  $$,
  '42501',
  'permission denied for function record_reminder_provider_event',
  'anonymous callers cannot forge provider events'
);
reset role;

set local role authenticated;
select throws_ok(
  $$
    select public.record_reminder_provider_event(
      'resend', 'evt_authenticated', 'email.sent',
      '81111111-1111-4111-8111-111111111111', 'msg_authenticated',
      now(), now()
    )
  $$,
  '42501',
  'permission denied for function record_reminder_provider_event',
  'authenticated browser callers cannot forge provider events'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.get_reminder_operational_metrics(now())$$,
  '42501',
  'permission denied for function get_reminder_operational_metrics',
  'anonymous callers cannot read reminder operations'
);
reset role;

select * from finish();
rollback;
