begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(40);

select has_table(
  'private', 'reminder_discovery_channels',
  'the reviewed discovery allowlist has a private database copy'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'private.reminder_discovery_channels'::regclass),
  true,
  'the reviewed discovery table has RLS enabled'
);
select policies_are(
  'private', 'reminder_discovery_channels', array[]::text[],
  'the private discovery allowlist has no client policy'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.reminder_discovery_channels', 'select'
  ),
  'authenticated clients cannot inspect the private allowlist table'
);
select has_column(
  'private', 'reminder_deliveries', 'email_type',
  'delivery occurrences freeze their product email type'
);
select hasnt_column(
  'private', 'reminder_deliveries', 'email',
  'typed delivery occurrences never store recipient email'
);
select has_function(
  'public', 'claim_due_typed_reminder_dry_runs',
  array['timestamptz', 'integer', 'integer', 'integer'],
  'the typed dry-run-only claim RPC exists'
);
select has_function(
  'public', 'complete_typed_reminder_dry_run',
  array['uuid', 'timestamptz'],
  'the typed completion recheck exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_due_typed_reminder_dry_runs(timestamptz,integer,integer,integer)',
    'execute'
  ),
  'only the trusted worker role can claim typed dry runs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_due_typed_reminder_dry_runs(timestamptz,integer,integer,integer)',
    'execute'
  ),
  'authenticated browser clients cannot claim typed dry runs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_typed_reminder_dry_run(uuid,timestamptz)',
    'execute'
  ),
  'anonymous clients cannot complete typed dry runs'
);
select results_eq(
  $$select count(*) from private.reminder_discovery_channels$$,
  array[7::bigint],
  'the database contains exactly the seven reviewed channels'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'typed-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'typed-b@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'typed-c@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'typed-d@example.test'),
  ('55555555-5555-4555-8555-555555555555', 'typed-stale@example.test'),
  ('66666666-6666-4666-8666-666666666666', 'typed-japanese@example.test');

insert into public.reminder_preferences (
  user_id,
  enabled,
  streak_reminders_enabled,
  discovery_emails_enabled,
  days,
  local_time,
  timezone,
  locale,
  consent_granted_at,
  consent_version,
  consent_source
)
select
  auth_user.id,
  false,
  auth_user.id = '11111111-1111-4111-8111-111111111111'::uuid,
  true,
  array[1]::smallint[],
  time '08:00',
  case
    when auth_user.id = '44444444-4444-4444-8444-444444444444'::uuid
      then 'Pacific/Kiritimati'
    else 'Asia/Taipei'
  end,
  'en',
  timestamptz '2026-08-01 00:00:00+00',
  'edenia-email-preferences-v2',
  'account-default'
from auth.users as auth_user
where auth_user.id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666'
);

insert into public.reminder_eligibility_snapshots (
  user_id,
  timezone,
  locale,
  learning_language,
  study_date,
  points_today,
  last_qualified_study_date,
  current_streak_days,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 4, date '2026-08-12', 7,
    timestamptz '2026-08-13 10:55:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 5, date '2026-08-13', 3,
    timestamptz '2026-08-13 10:50:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 0, null, 0,
    timestamptz '2026-08-13 10:45:00+00'
  ),
  (
    '44444444-4444-4444-8444-444444444444', 'Pacific/Kiritimati', 'en', 'mandarin',
    date '2026-08-14', 0, null, 0,
    timestamptz '2026-08-14 04:55:00+00'
  ),
  (
    '55555555-5555-4555-8555-555555555555', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 0, null, 0,
    timestamptz '2026-07-01 00:00:00+00'
  ),
  (
    '66666666-6666-4666-8666-666666666666', 'Asia/Taipei', 'en', 'japanese',
    date '2026-08-13', 0, null, 0,
    timestamptz '2026-08-13 10:40:00+00'
  );

insert into public.reminder_channel_follows (
  user_id,
  channel_id,
  channel_name,
  latest_video_id,
  latest_video_title,
  latest_video_published_at,
  streak_video_id,
  streak_video_title,
  streak_video_published_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'UCaaaaaaaaaaaaaaaaaaaaaa', 'Recipient channel',
    'aaaaaaaaaaa', 'Newest upload', timestamptz '2026-08-13 08:00:00+00',
    'bbbbbbbbbbb', 'Unwatched upload', timestamptz '2026-08-12 08:00:00+00',
    timestamptz '2026-08-13 10:55:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'UCC_fdR7zZ_5SU--xuOrEdKw', 'Grace Mandarin Chinese',
    'ccccccccccc', 'Grace newest lesson', timestamptz '2026-08-12 09:00:00+00',
    'ccccccccccc', 'Grace newest lesson', timestamptz '2026-08-12 09:00:00+00',
    timestamptz '2026-08-13 10:50:00+00'
  );

insert into private.reminder_delivery_testers (user_id)
values
  ('11111111-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666');

-- A prior occurrence only 18 hours before D's new local 19:00 proves the
-- rolling guard remains stronger than local-date uniqueness after travel.
insert into private.reminder_deliveries (
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
)
values (
  '44444444-4444-4444-8444-444444444444',
  date '2026-08-13',
  time '19:00',
  timestamptz '2026-08-13 11:00:00+00',
  'Asia/Taipei',
  'en',
  'edenia-email-preferences-v2',
  timestamptz '2026-08-01 00:00:00+00',
  'dry_run_observed',
  timestamptz '2026-08-13 11:01:00+00'
);

create temp table first_claims on commit drop as
select *
from public.claim_due_typed_reminder_dry_runs(
  timestamptz '2026-08-13 11:05:00+00', 25, 900, 120
);

select results_eq(
  $$select count(*) from first_claims$$,
  array[2::bigint],
  'the first run claims exactly the eligible streak and discovery users'
);
select results_eq(
  $$select email_type from first_claims where user_id = '11111111-1111-4111-8111-111111111111'$$,
  $$values ('streak'::text)$$,
  'streak has priority when both email types qualify'
);
select results_eq(
  $$
    select channel_id, video_id, video_title
    from first_claims
    where user_id = '11111111-1111-4111-8111-111111111111'
  $$,
  $$values ('UCaaaaaaaaaaaaaaaaaaaaaa'::text, 'bbbbbbbbbbb'::text, 'Unwatched upload'::text)$$,
  'the streak claim freezes the newest recent unwatched candidate'
);
select results_eq(
  $$select email_type from first_claims where user_id = '33333333-3333-4333-8333-333333333333'$$,
  $$values ('discovery'::text)$$,
  'a learner without an active streak can receive a discovery candidate'
);
select results_eq(
  $$
    select channel_id, channel_summary, video_id
    from first_claims
    where user_id = '33333333-3333-4333-8333-333333333333'
  $$,
  $$values (
    'UCC_fdR7zZ_5SU--xuOrEdKw'::text,
    'Practical Mandarin pronunciation, vocabulary, and culture lessons.'::text,
    'ccccccccccc'::text
  )$$,
  'discovery freezes reviewed copy and the other learner latest upload'
);
select results_eq(
  $$select count(distinct user_id) from first_claims$$,
  array[2::bigint],
  'one dispatcher run returns at most one occurrence per user'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where email_type is not null and scheduled_local_date = date '2026-08-13'
  $$,
  array[2::bigint],
  'the local-date ledger contains exactly one typed occurrence per recipient'
);
select results_eq(
  $$
    select count(*)
    from public.claim_due_typed_reminder_dry_runs(
      timestamptz '2026-08-13 11:05:30+00', 25, 900, 120
    )
  $$,
  array[0::bigint],
  'active leases prevent a concurrent dispatcher from reclaiming work'
);
select is(
  public.complete_typed_reminder_dry_run(
    (select claim_token from first_claims where user_id = '33333333-3333-4333-8333-333333333333'),
    timestamptz '2026-08-13 11:05:45+00'
  ),
  true,
  'a still-eligible discovery claim completes as observed'
);

update public.reminder_preferences
set streak_reminders_enabled = false,
    updated_at = timestamptz '2026-08-13 11:05:50+00'
where user_id = '11111111-1111-4111-8111-111111111111';

select is(
  public.complete_typed_reminder_dry_run(
    (select claim_token from first_claims where user_id = '11111111-1111-4111-8111-111111111111'),
    timestamptz '2026-08-13 11:06:00+00'
  ),
  false,
  'completion fails closed when the selected email type is disabled'
);
select results_eq(
  $$
    select status
    from private.reminder_deliveries
    where user_id = '11111111-1111-4111-8111-111111111111'
      and scheduled_local_date = date '2026-08-13'
  $$,
  $$values ('suppressed'::text)$$,
  'the stale streak claim becomes terminal instead of retrying'
);
select results_eq(
  $$
    select status
    from private.reminder_deliveries
    where user_id = '33333333-3333-4333-8333-333333333333'
      and scheduled_local_date = date '2026-08-13'
  $$,
  $$values ('dry_run_observed'::text)$$,
  'the discovery dry run records a terminal observation'
);
select results_eq(
  $$
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-13 11:07:00+00', 25, 900, 120, 'dry_run'
    )
  $$,
  array[0::bigint],
  'the retired scheduler claim path cannot pick up typed email choices'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where email_type is not null
      and (
        provider_name is not null
        or send_started_at is not null
        or provider_message_id is not null
      )
  $$,
  array[0::bigint],
  'typed dry runs never create provider state'
);
select results_eq(
  $$
    select count(*)
    from private.reminder_deliveries
    where user_id in (
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666'
    )
  $$,
  array[0::bigint],
  'stale snapshots and languages without another learner produce no occurrence'
);

create temp table travel_claims on commit drop as
select *
from public.claim_due_typed_reminder_dry_runs(
  timestamptz '2026-08-14 05:05:00+00', 25, 900, 120
);

select results_eq(
  $$select count(*) from travel_claims where user_id = '44444444-4444-4444-8444-444444444444'$$,
  array[0::bigint],
  'the rolling 24-hour guard blocks a second local date after timezone travel'
);

update public.reminder_eligibility_snapshots
set study_date = date '2026-08-14',
    points_today = 0,
    last_qualified_study_date = null,
    current_streak_days = 0,
    updated_at = timestamptz '2026-08-14 10:55:00+00'
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

create temp table day_two_claims on commit drop as
select *
from public.claim_due_typed_reminder_dry_runs(
  timestamptz '2026-08-14 11:05:00+00', 25, 900, 120
);

select results_eq(
  $$select user_id, email_type from day_two_claims$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid, 'discovery'::text)$$,
  'the next day can use discovery after the prior day selected streak'
);
select results_eq(
  $$select count(*) from day_two_claims where user_id = '33333333-3333-4333-8333-333333333333'$$,
  array[0::bigint],
  'discovery cannot repeat on the next local day'
);
select is(
  public.complete_typed_reminder_dry_run(
    (select claim_token from day_two_claims),
    timestamptz '2026-08-14 11:05:30+00'
  ),
  true,
  'the day-two discovery observation completes'
);

update public.reminder_eligibility_snapshots
set study_date = date '2026-08-16',
    updated_at = timestamptz '2026-08-16 10:55:00+00'
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

create temp table spaced_claims on commit drop as
select *
from public.claim_due_typed_reminder_dry_runs(
  timestamptz '2026-08-16 11:05:00+00', 25, 900, 120
);

select results_eq(
  $$select user_id, email_type from spaced_claims$$,
  $$values ('33333333-3333-4333-8333-333333333333'::uuid, 'discovery'::text)$$,
  'Sunday to Wednesday is allowed with two full intervening days'
);
select results_eq(
  $$select count(*) from spaced_claims where user_id = '11111111-1111-4111-8111-111111111111'$$,
  array[0::bigint],
  'a discovery sent two local dates earlier remains blocked'
);

update public.reminder_preferences
set discovery_emails_enabled = false,
    updated_at = timestamptz '2026-08-16 11:05:10+00'
where user_id = '33333333-3333-4333-8333-333333333333';

select is(
  public.complete_typed_reminder_dry_run(
    (select claim_token from spaced_claims),
    timestamptz '2026-08-16 11:05:20+00'
  ),
  false,
  'autosaved preference changes are rechecked before observation'
);
select results_eq(
  $$select status from private.reminder_deliveries where id = (select delivery_id from spaced_claims)$$,
  $$values ('suppressed'::text)$$,
  'a disabled discovery claim cannot be reclaimed later'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-16 11:06:00+00'
where singleton;

select throws_ok(
  $$
    select *
    from public.claim_due_typed_reminder_dry_runs(
      timestamptz '2026-08-16 11:06:00+00', 25, 900, 120
    )
  $$,
  '55000',
  'typed_reminder_dry_run_delivery_enabled',
  'typed dry-run claims fail closed when live delivery is enabled'
);
select throws_ok(
  $$
    select *
    from public.claim_due_typed_reminder_dry_runs(
      timestamptz '2026-08-16 11:06:00+00', 0, 900, 120
    )
  $$,
  '22023',
  'typed_reminder_claim_batch_out_of_range',
  'typed claim input bounds are enforced before work starts'
);
select results_eq(
  $$select count(*) from private.reminder_deliveries where email_type is not null and provider_name is not null$$,
  array[0::bigint],
  'even a switch change cannot retroactively create a provider attempt'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$
    select *
    from public.claim_due_typed_reminder_dry_runs(
      timestamptz '2026-08-16 11:06:00+00', 25, 900, 120
    )
  $$,
  '42501',
  'permission denied for function claim_due_typed_reminder_dry_runs',
  'an authenticated user cannot invoke the typed dispatcher RPC'
);

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$select public.complete_typed_reminder_dry_run(gen_random_uuid(), now())$$,
  '42501',
  'permission denied for function complete_typed_reminder_dry_run',
  'an unauthenticated client cannot complete a typed dry run'
);

select * from finish();
rollback;
