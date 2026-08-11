begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(31);

select has_function(
  'public',
  'export_account_server_data',
  array[]::text[],
  'the account export has no caller-controlled owner argument'
);
select function_returns(
  'public',
  'export_account_server_data',
  array[]::text[],
  'jsonb',
  'the account export returns one structured JSON document'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.export_account_server_data()'::regprocedure
  ),
  true,
  'the export can read private owner data through a security definer boundary'
);
select is(
  (
    select provolatile
    from pg_catalog.pg_proc
    where oid = 'public.export_account_server_data()'::regprocedure
  ),
  's'::"char",
  'the export is read-only stable'
);
select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.export_account_server_data()'::regprocedure
  ),
  'the security definer has an empty search path'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.export_account_server_data()',
    'EXECUTE'
  ),
  'authenticated users can execute their self-scoped export'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.export_account_server_data()',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the export'
);
select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.export_account_server_data()',
    'EXECUTE'
  ),
  'service-role callers cannot turn the self-service function into an arbitrary export path'
);

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at)
values
  (
    '81111111-1111-4111-8111-111111111111',
    'export-a@example.test',
    timestamptz '2026-08-01 01:00:00+00',
    timestamptz '2026-08-10 01:00:00+00'
  ),
  (
    '82222222-2222-4222-8222-222222222222',
    'export-b@example.test',
    timestamptz '2026-08-02 02:00:00+00',
    timestamptz '2026-08-10 02:00:00+00'
  );

insert into public.subscriptions (
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  status,
  plan,
  current_period_end
) values
  (
    '81111111-1111-4111-8111-111111111111',
    'cus_export_secret_a',
    'sub_export_secret_a',
    'active',
    'plus-monthly',
    timestamptz '2026-09-01 00:00:00+00'
  ),
  (
    '82222222-2222-4222-8222-222222222222',
    'cus_export_secret_b',
    'sub_export_secret_b',
    'past_due',
    'plus-annual',
    timestamptz '2026-10-01 00:00:00+00'
  );

insert into public.founding_checkout_reservations (
  id,
  email_hash,
  stripe_checkout_session_id,
  status,
  reserved_at,
  expires_at,
  completed_at,
  user_id,
  updated_at
) values (
  '8a111111-1111-4111-8111-111111111111',
  repeat('a', 64),
  'cs_export_secret_a',
  'completed',
  timestamptz '2026-07-24 00:00:00+00',
  timestamptz '2026-07-25 00:00:00+00',
  timestamptz '2026-07-24 00:05:00+00',
  '81111111-1111-4111-8111-111111111111',
  timestamptz '2026-07-24 00:05:00+00'
);

insert into public.founding_members (user_id, reservation_id, created_at)
values (
  '81111111-1111-4111-8111-111111111111',
  '8a111111-1111-4111-8111-111111111111',
  timestamptz '2026-07-24 00:05:00+00'
);

insert into public.state_backups (id, user_id, state_json, created_at, updated_at)
values
  (
    '8b111111-1111-4111-8111-111111111111',
    '81111111-1111-4111-8111-111111111111',
    '{"marker":"cloud-backup-a"}'::jsonb,
    timestamptz '2026-08-09 00:00:00+00',
    timestamptz '2026-08-09 00:00:00+00'
  ),
  (
    '8b222222-2222-4222-8222-222222222222',
    '82222222-2222-4222-8222-222222222222',
    '{"marker":"cloud-backup-b"}'::jsonb,
    timestamptz '2026-08-10 00:00:00+00',
    timestamptz '2026-08-10 00:00:00+00'
  );

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
    '81111111-1111-4111-8111-111111111111',
    true,
    array[1, 3, 5]::smallint[],
    time '19:00',
    'Asia/Taipei',
    'en',
    timestamptz '2026-08-01 00:00:00+00',
    'reminder-email-v1',
    'settings'
  ),
  (
    '82222222-2222-4222-8222-222222222222',
    true,
    array[2, 4]::smallint[],
    time '08:00',
    'Europe/Paris',
    'fr',
    timestamptz '2026-08-02 00:00:00+00',
    'reminder-email-v1',
    'settings'
  );

insert into private.reminder_delivery_testers (user_id)
values ('81111111-1111-4111-8111-111111111111');

insert into private.reminder_deliveries (
  id,
  user_id,
  scheduled_local_date,
  scheduled_local_time,
  scheduled_for,
  timezone,
  locale,
  consent_version,
  consent_granted_at,
  status,
  dry_run_observed_at
) values
  (
    '8c111111-1111-4111-8111-111111111111',
    '81111111-1111-4111-8111-111111111111',
    date '2026-08-11',
    time '19:00',
    timestamptz '2026-08-11 11:00:00+00',
    'Asia/Taipei',
    'en',
    'reminder-email-v1',
    timestamptz '2026-08-01 00:00:00+00',
    'dry_run_observed',
    timestamptz '2026-08-11 11:00:01+00'
  ),
  (
    '8c222222-2222-4222-8222-222222222222',
    '82222222-2222-4222-8222-222222222222',
    date '2026-08-12',
    time '08:00',
    timestamptz '2026-08-12 06:00:00+00',
    'Europe/Paris',
    'fr',
    'reminder-email-v1',
    timestamptz '2026-08-02 00:00:00+00',
    'dry_run_observed',
    timestamptz '2026-08-12 06:00:01+00'
  );

insert into private.reminder_unsubscribe_tokens (
  token_digest,
  delivery_id,
  user_id,
  created_at
) values
  (
    decode(repeat('1', 64), 'hex'),
    '8c111111-1111-4111-8111-111111111111',
    '81111111-1111-4111-8111-111111111111',
    timestamptz '2026-08-11 11:00:02+00'
  ),
  (
    decode(repeat('2', 64), 'hex'),
    '8c222222-2222-4222-8222-222222222222',
    '82222222-2222-4222-8222-222222222222',
    timestamptz '2026-08-12 06:00:02+00'
  );

insert into private.reminder_provider_events (
  provider_name,
  event_id,
  event_type,
  delivery_id,
  provider_message_id,
  event_created_at,
  received_at,
  action
) values
  (
    'resend',
    'event_secret_a',
    'email.delivered',
    '8c111111-1111-4111-8111-111111111111',
    'provider.message.secret.a',
    timestamptz '2026-08-11 11:00:03+00',
    timestamptz '2026-08-11 11:00:04+00',
    'observed'
  ),
  (
    'resend',
    'event_secret_b',
    'email.delivered',
    '8c222222-2222-4222-8222-222222222222',
    'provider.message.secret.b',
    timestamptz '2026-08-12 06:00:03+00',
    timestamptz '2026-08-12 06:00:04+00',
    'observed'
  );

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '81111111-1111-4111-8111-111111111111';

select is(
  public.export_account_server_data() #>> '{schema_version}',
  'edenia-account-export-v1',
  'user A receives the versioned export schema'
);
select is(
  public.export_account_server_data() #>> '{scope,current_device_progress}',
  'false',
  'the export explicitly excludes current browser-local progress'
);
select is(
  public.export_account_server_data() #>> '{account,email}',
  'export-a@example.test',
  'user A receives their own Auth email'
);
select is(
  public.export_account_server_data() #>> '{billing,subscription,plan}',
  'plus-monthly',
  'user A receives their own subscription presentation data'
);
select is(
  public.export_account_server_data() #>> '{billing,founding_member,is_founding_member}',
  'true',
  'user A receives their own founding-member status'
);
select is(
  public.export_account_server_data() #>> '{billing,founding_checkout_reservation,status}',
  'completed',
  'user A receives their reservation lifecycle without its correlators'
);
select is(
  public.export_account_server_data() #>> '{cloud_backup_snapshots,0,state,marker}',
  'cloud-backup-a',
  'user A receives the contents of their server-held backup snapshot'
);
select is(
  public.export_account_server_data() #>> '{reminders,preference,timezone}',
  'Asia/Taipei',
  'user A receives their own reminder preference'
);
select is(
  public.export_account_server_data() #>> '{reminders,is_internal_tester}',
  'true',
  'user A receives their server tester status'
);
select is(
  public.export_account_server_data() #>> '{reminders,delivery_occurrences,0,id}',
  '8c111111-1111-4111-8111-111111111111',
  'user A receives only their reminder occurrence'
);
select is(
  public.export_account_server_data() #>> '{reminders,provider_events,0,event_type}',
  'email.delivered',
  'user A receives non-secret provider event history'
);
select ok(
  pg_catalog.strpos(public.export_account_server_data()::text, 'export-b') = 0,
  'user A export contains no user B marker'
);
select ok(
  pg_catalog.strpos(public.export_account_server_data()::text, 'secret_a') = 0,
  'the export omits Stripe, provider-event and provider-message correlators'
);
select ok(
  pg_catalog.strpos(
    public.export_account_server_data()::text,
    repeat('a', 64)
  ) = 0,
  'the export omits the founding reservation email hash'
);
select ok(
  pg_catalog.strpos(
    public.export_account_server_data()::text,
    repeat('1', 64)
  ) = 0,
  'the export omits the unsubscribe capability digest'
);

set local request.jwt.claim.sub = '82222222-2222-4222-8222-222222222222';

select is(
  public.export_account_server_data() #>> '{account,email}',
  'export-b@example.test',
  'user B receives their own Auth identity'
);
select is(
  public.export_account_server_data() #>> '{cloud_backup_snapshots,0,state,marker}',
  'cloud-backup-b',
  'user B receives only their own server backup'
);
select is(
  public.export_account_server_data() #>> '{reminders,is_internal_tester}',
  'false',
  'user B does not inherit user A tester status'
);
select ok(
  pg_catalog.strpos(public.export_account_server_data()::text, 'export-a') = 0,
  'user B export contains no user A marker'
);

reset request.jwt.claim.sub;
select throws_ok(
  $$select public.export_account_server_data()$$,
  '42501',
  'account_export_authentication_required',
  'an authenticated role without a verified user cannot export'
);

set local role anon;
set local request.jwt.claim.role = 'anon';
select throws_ok(
  $$select public.export_account_server_data()$$,
  '42501',
  'permission denied for function export_account_server_data',
  'an unauthenticated client cannot execute the export'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';
select throws_ok(
  $$select public.export_account_server_data()$$,
  '42501',
  'permission denied for function export_account_server_data',
  'service role cannot supply or infer an arbitrary export owner'
);

reset role;

select results_eq(
  $$
    select
      (select count(*) from public.state_backups),
      (select count(*) from private.reminder_deliveries),
      (select count(*) from private.reminder_provider_events)
  $$,
  $$values (2::bigint, 2::bigint, 2::bigint)$$,
  'repeated exports do not mutate account, reminder, or backup data'
);

select * from finish();
rollback;
