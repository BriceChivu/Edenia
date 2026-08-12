begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(35);

select has_table(
  'public',
  'reminder_preferences',
  'reminder_preferences exists in the exposed schema'
);
select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.reminder_preferences'::regclass
  ),
  true,
  'reminder_preferences has RLS enabled'
);
select policies_are(
  'public',
  'reminder_preferences',
  array[
    'Users can view their own reminder preferences',
    'Users can create their own reminder preferences',
    'Users can update their own reminder preferences',
    'Users can delete their own reminder preferences'
  ],
  'reminder_preferences has exactly four ownership policies'
);
select hasnt_column(
  'public',
  'reminder_preferences',
  'email',
  'reminder_preferences never stores an email address'
);
select has_column(
  'public',
  'reminder_preferences',
  'streak_reminders_enabled',
  'the streak email choice is stored independently'
);
select has_column(
  'public',
  'reminder_preferences',
  'discovery_emails_enabled',
  'the discovery email choice is stored independently'
);
select col_default_is(
  'public',
  'reminder_preferences',
  'streak_reminders_enabled',
  'true',
  'new streak email choices default on'
);
select col_default_is(
  'public',
  'reminder_preferences',
  'discovery_emails_enabled',
  'true',
  'new discovery email choices default on'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'reminder-user-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'reminder-user-b@example.test');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$
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
    ) values (
      '11111111-1111-4111-8111-111111111111',
      false,
      array[1, 3, 5]::smallint[],
      time '19:00',
      'Asia/Taipei',
      'en',
      timestamptz '2026-08-11 12:00:00+00',
      'reminder-email-v1',
      'settings'
    )
  $$,
  'user A can insert their own preference'
);
select throws_ok(
  $$
    update public.reminder_preferences
    set enabled = true
    where user_id = '11111111-1111-4111-8111-111111111111'
  $$,
  '23514',
  'Legacy reminder scheduling is disabled',
  'the obsolete schedule path cannot be re-enabled'
);
select results_eq(
  $$select count(*) from public.reminder_preferences$$,
  array[1::bigint],
  'user A can select exactly their own preference'
);
select results_eq(
  $$
    update public.reminder_preferences
    set local_time = time '20:00'
    where user_id = '11111111-1111-4111-8111-111111111111'
    returning local_time::text
  $$,
  $$values ('20:00:00'::text)$$,
  'user A can update their own preference'
);
select throws_ok(
  $$
    update public.reminder_preferences
    set user_id = '22222222-2222-4222-8222-222222222222'
    where user_id = '11111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  'new row violates row-level security policy for table "reminder_preferences"',
  'user A cannot reassign their preference to user B'
);
select throws_ok(
  $$
    insert into public.reminder_preferences (
      user_id, enabled, streak_reminders_enabled, discovery_emails_enabled,
      days, local_time, timezone, locale,
      consent_version, consent_source
    ) values (
      '22222222-2222-4222-8222-222222222222',
      false,
      false,
      false,
      array[2, 4]::smallint[],
      time '08:00',
      'Europe/Paris',
      'fr',
      'reminder-email-v1',
      'settings'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "reminder_preferences"',
  'user A cannot insert a preference owned by user B'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select lives_ok(
  $$
    insert into public.reminder_preferences (
      user_id, enabled, streak_reminders_enabled, discovery_emails_enabled,
      days, local_time, timezone, locale,
      consent_version, consent_source
    ) values (
      '22222222-2222-4222-8222-222222222222',
      false,
      false,
      false,
      array[2, 4]::smallint[],
      time '08:00',
      'Europe/Paris',
      'fr',
      'reminder-email-v1',
      'settings'
    )
  $$,
  'user B can insert their own preference'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select count(*) from public.reminder_preferences$$,
  array[1::bigint],
  'user A still sees only one row after user B inserts'
);
select results_eq(
  $$select user_id from public.reminder_preferences$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'user A cannot select user B preference data'
);
select results_eq(
  $$
    update public.reminder_preferences
    set local_time = time '23:59'
    where user_id = '22222222-2222-4222-8222-222222222222'
    returning 1
  $$,
  $$select 1 where false$$,
  'user A cannot update user B preference'
);
select results_eq(
  $$
    delete from public.reminder_preferences
    where user_id = '22222222-2222-4222-8222-222222222222'
    returning 1
  $$,
  $$select 1 where false$$,
  'user A cannot delete user B preference'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select count(*) from public.reminder_preferences$$,
  array[1::bigint],
  'user B sees only one row'
);
select results_eq(
  $$select user_id from public.reminder_preferences$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'user B cannot select user A preference data'
);
select results_eq(
  $$
    update public.reminder_preferences
    set local_time = time '00:01'
    where user_id = '11111111-1111-4111-8111-111111111111'
    returning 1
  $$,
  $$select 1 where false$$,
  'user B cannot update user A preference'
);
select results_eq(
  $$
    delete from public.reminder_preferences
    where user_id = '11111111-1111-4111-8111-111111111111'
    returning 1
  $$,
  $$select 1 where false$$,
  'user B cannot delete user A preference'
);
select results_eq(
  $$
    update public.reminder_preferences
    set local_time = time '09:30'
    where user_id = '22222222-2222-4222-8222-222222222222'
    returning local_time::text
  $$,
  $$values ('09:30:00'::text)$$,
  'user B can update their own preference'
);
select throws_ok(
  $$
    update public.reminder_preferences
    set user_id = '11111111-1111-4111-8111-111111111111'
    where user_id = '22222222-2222-4222-8222-222222222222'
  $$,
  '42501',
  'new row violates row-level security policy for table "reminder_preferences"',
  'user B cannot reassign their preference to user A'
);

set local role anon;
reset request.jwt.claim.sub;
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$select * from public.reminder_preferences$$,
  '42501',
  'permission denied for table reminder_preferences',
  'an unauthenticated client cannot select reminder preferences'
);
select throws_ok(
  $$
    insert into public.reminder_preferences (
      user_id, enabled, streak_reminders_enabled, discovery_emails_enabled,
      days, local_time, timezone, locale,
      consent_version, consent_source
    ) values (
      '11111111-1111-4111-8111-111111111111',
      false,
      false,
      false,
      array[1]::smallint[],
      time '10:00',
      'UTC',
      'en',
      'reminder-email-v1',
      'settings'
    )
  $$,
  '42501',
  'permission denied for table reminder_preferences',
  'an unauthenticated client cannot insert reminder preferences'
);
select throws_ok(
  $$update public.reminder_preferences set enabled = false$$,
  '42501',
  'permission denied for table reminder_preferences',
  'an unauthenticated client cannot update reminder preferences'
);
select throws_ok(
  $$delete from public.reminder_preferences$$,
  '42501',
  'permission denied for table reminder_preferences',
  'an unauthenticated client cannot delete reminder preferences'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select results_eq(
  $$
    delete from public.reminder_preferences
    where user_id = '11111111-1111-4111-8111-111111111111'
    returning 1
  $$,
  $$values (1)$$,
  'user A can delete their own preference'
);
select throws_ok(
  $$
    insert into public.reminder_preferences (
      user_id, enabled, streak_reminders_enabled, discovery_emails_enabled,
      days, local_time, timezone, locale,
      consent_version, consent_source
    ) values (
      '11111111-1111-4111-8111-111111111111',
      false,
      false,
      false,
      array[1, 1]::smallint[],
      time '10:00',
      'UTC',
      'en',
      'reminder-email-v1',
      'settings'
    )
  $$,
  '23514',
  'new row for relation "reminder_preferences" violates check constraint "reminder_preferences_days_check"',
  'duplicate reminder days are rejected'
);
select throws_ok(
  $$
    insert into public.reminder_preferences (
      user_id, enabled, streak_reminders_enabled, discovery_emails_enabled,
      days, local_time, timezone, locale,
      consent_version, consent_source
    ) values (
      '11111111-1111-4111-8111-111111111111',
      false,
      false,
      false,
      array[1]::smallint[],
      time '10:00',
      'Not/ARealTimezone',
      'en',
      'reminder-email-v1',
      'settings'
    )
  $$,
  '22023',
  'time zone "Not/ARealTimezone" not recognized',
  'unknown IANA timezones are rejected'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select count(*) from public.reminder_preferences$$,
  array[1::bigint],
  'user B preference remains after every user A and anonymous attack'
);
select results_eq(
  $$
    delete from public.reminder_preferences
    where user_id = '22222222-2222-4222-8222-222222222222'
    returning 1
  $$,
  $$values (1)$$,
  'user B can delete their own preference'
);

reset role;

select results_eq(
  $$select count(*) from public.reminder_preferences$$,
  array[0::bigint],
  'only owner-authorized deletes removed the fixture rows'
);

select * from finish();
rollback;
