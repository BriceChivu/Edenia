begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, private, auth, pg_catalog;

select plan(46);

select has_function(
  'private',
  'export_account_server_data',
  array[]::text[],
  'the privileged implementation lives in the non-exposed schema'
);
select function_returns(
  'private',
  'export_account_server_data',
  array[]::text[],
  'jsonb',
  'the private implementation retains the versioned JSON result'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'private.export_account_server_data()'::regprocedure
  ),
  true,
  'the non-exposed implementation runs with definer rights'
);
select is(
  (
    select provolatile
    from pg_catalog.pg_proc
    where oid = 'private.export_account_server_data()'::regprocedure
  ),
  's'::"char",
  'the private implementation remains read-only stable'
);
select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'private.export_account_server_data()'::regprocedure
  ),
  'the private security definer retains an empty search path'
);
select hasnt_function(
  'public',
  'export_account_server_data',
  array[]::text[],
  'the authenticated definer is no longer exposed through the Data API'
);
select has_function(
  'public',
  'export_account_server_data_for_service',
  array['uuid'],
  'the public bridge requires a server-verified owner UUID'
);
select function_returns(
  'public',
  'export_account_server_data_for_service',
  array['uuid'],
  'jsonb',
  'the service bridge returns one structured JSON document'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.export_account_server_data_for_service(uuid)'::regprocedure
  ),
  true,
  'the service-only bridge can enter the private implementation'
);
select is(
  (
    select provolatile
    from pg_catalog.pg_proc
    where oid = 'public.export_account_server_data_for_service(uuid)'::regprocedure
  ),
  'v'::"char",
  'the bridge declares its temporary request-context change truthfully'
);
select ok(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.export_account_server_data_for_service(uuid)'::regprocedure
  ),
  'the service bridge has an empty search path'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.export_account_server_data_for_service(uuid)',
    'EXECUTE'
  ),
  'only the server role can invoke the owner bridge'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.export_account_server_data_for_service(uuid)',
    'EXECUTE'
  ),
  'authenticated browser clients cannot choose an export owner UUID'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.export_account_server_data_for_service(uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot choose an export owner UUID'
);
select ok(
  not pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated browser clients retain the deny-by-schema boundary'
);
select ok(
  not pg_catalog.has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous callers cannot resolve private objects'
);
select ok(
  not pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE'),
  'service role enters private logic only through the owner-controlled bridge'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'private.export_account_server_data()',
    'EXECUTE'
  ),
  'authenticated clients cannot execute the private implementation'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'private.export_account_server_data()',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the private helper'
);
select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'private.export_account_server_data()',
    'EXECUTE'
  ),
  'service role cannot execute the private self-service helper'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relkind in ('r', 'p')
      and pg_catalog.has_table_privilege(
        'authenticated',
        relation.oid,
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      )
  ),
  'authenticated users retain no private-table privilege'
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

create temporary table account_export_results (
  owner_label text primary key,
  payload jsonb not null
);
grant select, insert on table account_export_results to service_role;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claim.sub = '89999999-9999-4999-8999-999999999999';

insert into account_export_results (owner_label, payload)
values
  (
    'a',
    public.export_account_server_data_for_service(
      '81111111-1111-4111-8111-111111111111'
    )
  ),
  (
    'b',
    public.export_account_server_data_for_service(
      '82222222-2222-4222-8222-222222222222'
    )
  );

select is(
  pg_catalog.current_setting('request.jwt.claim.sub', true),
  '89999999-9999-4999-8999-999999999999',
  'the service bridge restores its prior request identity after both exports'
);
select is(
  (select payload #>> '{schema_version}' from account_export_results where owner_label = 'a'),
  'edenia-account-export-v1',
  'user A receives the versioned export schema'
);
select is(
  (select payload #>> '{scope,current_device_progress}' from account_export_results where owner_label = 'a'),
  'false',
  'the export explicitly excludes current browser-local progress'
);
select is(
  (select payload #>> '{account,email}' from account_export_results where owner_label = 'a'),
  'export-a@example.test',
  'the verified user A UUID selects only user A Auth identity'
);
select is(
  (select payload #>> '{billing,subscription,plan}' from account_export_results where owner_label = 'a'),
  'plus-monthly',
  'user A receives their own subscription presentation data'
);
select is(
  (select payload #>> '{billing,founding_member,is_founding_member}' from account_export_results where owner_label = 'a'),
  'true',
  'user A receives their own founding-member status'
);
select is(
  (select payload #>> '{billing,founding_checkout_reservation,status}' from account_export_results where owner_label = 'a'),
  'completed',
  'user A receives their reservation lifecycle without its correlators'
);
select is(
  (select payload #>> '{cloud_backup_snapshots,0,state,marker}' from account_export_results where owner_label = 'a'),
  'cloud-backup-a',
  'user A receives the contents of their server-held backup snapshot'
);
select is(
  (select payload #>> '{reminders,preference,timezone}' from account_export_results where owner_label = 'a'),
  'Asia/Taipei',
  'user A receives their own reminder preference'
);
select is(
  (select payload #>> '{reminders,is_internal_tester}' from account_export_results where owner_label = 'a'),
  'true',
  'user A receives their server tester status'
);
select is(
  (select payload #>> '{reminders,delivery_occurrences,0,id}' from account_export_results where owner_label = 'a'),
  '8c111111-1111-4111-8111-111111111111',
  'user A receives only their reminder occurrence'
);
select is(
  (select payload #>> '{reminders,provider_events,0,event_type}' from account_export_results where owner_label = 'a'),
  'email.delivered',
  'user A receives non-secret provider event history'
);
select ok(
  pg_catalog.strpos(
    (select payload::text from account_export_results where owner_label = 'a'),
    'export-b'
  ) = 0,
  'user A export contains no user B marker'
);
select ok(
  pg_catalog.strpos(
    (select payload::text from account_export_results where owner_label = 'a'),
    'secret_a'
  ) = 0,
  'the export omits Stripe, provider-event and provider-message correlators'
);
select ok(
  pg_catalog.strpos(
    (select payload::text from account_export_results where owner_label = 'a'),
    repeat('a', 64)
  ) = 0,
  'the export omits the founding reservation email hash'
);
select ok(
  pg_catalog.strpos(
    (select payload::text from account_export_results where owner_label = 'a'),
    repeat('1', 64)
  ) = 0,
  'the export omits the unsubscribe capability digest'
);
select is(
  (select payload #>> '{account,email}' from account_export_results where owner_label = 'b'),
  'export-b@example.test',
  'the verified user B UUID selects only user B Auth identity'
);
select is(
  (select payload #>> '{cloud_backup_snapshots,0,state,marker}' from account_export_results where owner_label = 'b'),
  'cloud-backup-b',
  'user B receives only their own server backup'
);
select is(
  (select payload #>> '{reminders,is_internal_tester}' from account_export_results where owner_label = 'b'),
  'false',
  'user B does not inherit user A tester status'
);
select ok(
  pg_catalog.strpos(
    (select payload::text from account_export_results where owner_label = 'b'),
    'export-a'
  ) = 0,
  'user B export contains no user A marker'
);
select throws_ok(
  $$select public.export_account_server_data_for_service(null)$$,
  'P0002',
  'account_export_user_not_found',
  'the service bridge rejects a missing verified owner UUID'
);
select throws_ok(
  $$
    select public.export_account_server_data_for_service(
      '83333333-3333-4333-8333-333333333333'
    )
  $$,
  'P0002',
  'account_export_user_not_found',
  'the service bridge rejects an unknown verified owner UUID'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
select throws_ok(
  $$
    select public.export_account_server_data_for_service(
      '81111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  'permission denied for function export_account_server_data_for_service',
  'an authenticated browser cannot choose an export owner UUID'
);

set local role anon;
set local request.jwt.claim.role = 'anon';
select throws_ok(
  $$
    select public.export_account_server_data_for_service(
      '81111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  'permission denied for function export_account_server_data_for_service',
  'an unauthenticated client cannot choose an export owner UUID'
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
