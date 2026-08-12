begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(32);

select has_function(
  'public', 'claim_due_typed_reminder_live',
  array['timestamptz', 'integer', 'integer', 'integer'],
  'the typed live claim RPC exists'
);
select has_function(
  'public', 'store_typed_reminder_unsubscribe_token',
  array['uuid', 'uuid', 'bytea', 'timestamptz'],
  'the typed unsubscribe-token fence exists'
);
select has_function(
  'public', 'complete_typed_reminder_without_send',
  array['uuid', 'text', 'timestamptz'],
  'typed claims can end without a provider attempt'
);
select has_function(
  'public', 'begin_typed_reminder_provider_attempt',
  array['uuid', 'text', 'timestamptz'],
  'the typed pre-provider fence exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_due_typed_reminder_live(timestamptz,integer,integer,integer)',
    'execute'
  ),
  'the trusted worker can claim typed live occurrences'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_due_typed_reminder_live(timestamptz,integer,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot claim typed live occurrences'
);
select hasnt_column(
  'private', 'reminder_deliveries', 'email',
  'the typed live ledger does not store recipient email'
);
select throws_ok(
  $$
    select *
    from public.claim_due_typed_reminder_live(
      timestamptz '2026-08-13 11:05:00+00', 5, 900, 300
    )
  $$,
  '55000',
  'typed_reminder_live_delivery_disabled',
  'the live claim fails closed while the independent switch is off'
);

insert into auth.users (id, email)
values
  ('71111111-1111-4111-8111-111111111111', 'live-a@example.test'),
  ('72222222-2222-4222-8222-222222222222', 'live-b@example.test'),
  ('73333333-3333-4333-8333-333333333333', 'live-source@example.test'),
  ('74444444-4444-4444-8444-444444444444', 'live-d@example.test');

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
  auth_user.id = '71111111-1111-4111-8111-111111111111'::uuid,
  true,
  array[1]::smallint[],
  time '08:00',
  'Asia/Taipei',
  'en',
  timestamptz '2026-08-01 00:00:00+00',
  'edenia-email-preferences-v2',
  'account-default'
from auth.users as auth_user
where auth_user.id in (
  '71111111-1111-4111-8111-111111111111',
  '72222222-2222-4222-8222-222222222222',
  '73333333-3333-4333-8333-333333333333',
  '74444444-4444-4444-8444-444444444444'
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
    '71111111-1111-4111-8111-111111111111', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 4, date '2026-08-12', 7,
    timestamptz '2026-08-13 10:55:00+00'
  ),
  (
    '72222222-2222-4222-8222-222222222222', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 5, date '2026-08-13', 3,
    timestamptz '2026-08-13 10:55:00+00'
  ),
  (
    '73333333-3333-4333-8333-333333333333', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 5, date '2026-08-13', 3,
    timestamptz '2026-08-13 10:55:00+00'
  ),
  (
    '74444444-4444-4444-8444-444444444444', 'Asia/Taipei', 'en', 'mandarin',
    date '2026-08-13', 0, null, 0,
    timestamptz '2026-08-13 10:55:00+00'
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
    '71111111-1111-4111-8111-111111111111',
    'UCaaaaaaaaaaaaaaaaaaaaaa', 'Recipient channel',
    'aaaaaaaaaaa', 'Newest upload', timestamptz '2026-08-13 08:00:00+00',
    'bbbbbbbbbbb', 'Unwatched upload', timestamptz '2026-08-12 08:00:00+00',
    timestamptz '2026-08-13 10:55:00+00'
  ),
  (
    '73333333-3333-4333-8333-333333333333',
    'UCC_fdR7zZ_5SU--xuOrEdKw', 'Grace Mandarin Chinese',
    'ccccccccccc', 'Grace newest lesson', timestamptz '2026-08-12 09:00:00+00',
    'ccccccccccc', 'Grace newest lesson', timestamptz '2026-08-12 09:00:00+00',
    timestamptz '2026-08-13 10:55:00+00'
  );

insert into private.reminder_delivery_testers (user_id)
values
  ('71111111-1111-4111-8111-111111111111'),
  ('72222222-2222-4222-8222-222222222222'),
  ('74444444-4444-4444-8444-444444444444');

create temp table dry_claims on commit drop as
select *
from public.claim_due_typed_reminder_dry_runs(
  timestamptz '2026-08-13 11:05:00+00', 25, 900, 60
);

select results_eq(
  $$select count(*) from dry_claims$$,
  array[3::bigint],
  'dry run materializes exactly the three current tester occurrences'
);

update private.reminder_delivery_control
set delivery_enabled = true,
    updated_at = timestamptz '2026-08-13 11:06:01+00'
where singleton;

create temp table live_claims on commit drop as
select *
from public.claim_due_typed_reminder_live(
  timestamptz '2026-08-13 11:06:01+00', 5, 900, 300
);

select results_eq(
  $$select count(*) from live_claims$$,
  array[3::bigint],
  'live canary reclaims only the already-materialized typed occurrences'
);
select results_eq(
  $$select email_type from live_claims where user_id = '71111111-1111-4111-8111-111111111111'$$,
  $$values ('streak'::text)$$,
  'the frozen streak occurrence remains the higher-priority type'
);
select results_eq(
  $$select count(*) from live_claims where email_type = 'discovery'$$,
  array[2::bigint],
  'the other current users retain their frozen discovery type'
);
select results_eq(
  $$
    select count(*)
    from public.claim_due_typed_reminder_live(
      timestamptz '2026-08-13 11:06:30+00', 5, 900, 300
    )
  $$,
  array[0::bigint],
  'an active live lease prevents concurrent claims'
);

select is(
  public.store_typed_reminder_unsubscribe_token(
    (select delivery_id from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    (select claim_token from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-13 11:06:35+00'
  ),
  true,
  'a current typed claim stores one opaque unsubscribe digest'
);
select is(
  public.store_typed_reminder_unsubscribe_token(
    (select delivery_id from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    (select claim_token from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    decode(repeat('aa', 32), 'hex'),
    timestamptz '2026-08-13 11:06:36+00'
  ),
  true,
  'repeating the same token binding is idempotent'
);
select is(
  public.store_typed_reminder_unsubscribe_token(
    (select delivery_id from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    (select claim_token from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    decode(repeat('ab', 32), 'hex'),
    timestamptz '2026-08-13 11:06:37+00'
  ),
  false,
  'a claim cannot replace its unsubscribe capability'
);

update public.reminder_preferences
set streak_reminders_enabled = false,
    updated_at = timestamptz '2026-08-13 11:06:38+00'
where user_id = '71111111-1111-4111-8111-111111111111';

select is(
  public.begin_typed_reminder_provider_attempt(
    (select claim_token from live_claims where user_id = '71111111-1111-4111-8111-111111111111'),
    'resend',
    timestamptz '2026-08-13 11:06:39+00'
  ),
  false,
  'an autosaved opt-out wins at the final pre-network fence'
);
select is(
  public.complete_typed_reminder_without_send(
    (select claim_token from live_claims where user_id = '74444444-4444-4444-8444-444444444444'),
    'recipient_not_allowlisted',
    timestamptz '2026-08-13 11:06:40+00'
  ),
  true,
  'a non-allowlisted tester ends without provider state'
);
select results_eq(
  $$
    select status, failure_code, provider_name
    from private.reminder_deliveries
    where id = (
      select delivery_id from live_claims
      where user_id = '74444444-4444-4444-8444-444444444444'
    )
  $$,
  $$values ('permanent_failure'::text, 'recipient_not_allowlisted'::text, null::text)$$,
  'the non-allowlisted occurrence records that no provider call began'
);
select is(
  public.store_typed_reminder_unsubscribe_token(
    (select delivery_id from live_claims where user_id = '72222222-2222-4222-8222-222222222222'),
    (select claim_token from live_claims where user_id = '72222222-2222-4222-8222-222222222222'),
    decode(repeat('bb', 32), 'hex'),
    timestamptz '2026-08-13 11:06:41+00'
  ),
  true,
  'a second current claim stores its unsubscribe digest'
);
select is(
  public.begin_typed_reminder_provider_attempt(
    (select claim_token from live_claims where user_id = '72222222-2222-4222-8222-222222222222'),
    'resend',
    timestamptz '2026-08-13 11:06:42+00'
  ),
  true,
  'provider state begins only after the typed fences pass'
);

create temp table retry_claims on commit drop as
select *
from public.claim_due_typed_reminder_live(
  timestamptz '2026-08-13 11:11:02+00', 5, 900, 300
);

select results_eq(
  $$select user_id from retry_claims$$,
  $$values ('72222222-2222-4222-8222-222222222222'::uuid)$$,
  'only the provider-started occurrence is safely reclaimed for retry'
);
select results_eq(
  $$
    select status
    from private.reminder_deliveries
    where id = (
      select delivery_id from live_claims
      where user_id = '71111111-1111-4111-8111-111111111111'
    )
  $$,
  $$values ('suppressed'::text)$$,
  'the opted-out unsent occurrence becomes terminal after its lease'
);
select is(
  public.store_typed_reminder_unsubscribe_token(
    (select delivery_id from retry_claims),
    (select claim_token from retry_claims),
    decode(repeat('bb', 32), 'hex'),
    timestamptz '2026-08-13 11:11:03+00'
  ),
  true,
  'a safe retry reuses the exact unsubscribe capability'
);
select is(
  public.begin_typed_reminder_provider_attempt(
    (select claim_token from retry_claims),
    'resend',
    timestamptz '2026-08-13 11:11:04+00'
  ),
  true,
  'a safe retry preserves the original provider-attempt window'
);
select is(
  public.complete_reminder_provider_acceptance(
    (select claim_token from retry_claims),
    'resend',
    'resend-message-live-canary-1',
    timestamptz '2026-08-13 11:11:05+00'
  ),
  true,
  'generic provider acceptance safely completes a typed retry'
);
select results_eq(
  $$
    select status, attempt_count
    from private.reminder_deliveries
    where id = (select delivery_id from retry_claims)
  $$,
  $$values ('provider_accepted'::text, 3)$$,
  'the accepted occurrence records the dry, first-live, and retry claims'
);
select results_eq(
  $$
    select count(*)
    from public.claim_due_reminder_deliveries(
      timestamptz '2026-08-13 11:12:00+00', 5, 900, 300, 'live'
    )
  $$,
  array[0::bigint],
  'the retired live scheduler cannot claim typed email choices'
);
select is(
  public.complete_typed_reminder_without_send(
    gen_random_uuid(),
    'provider_rejected',
    timestamptz '2026-08-13 11:12:01+00'
  ),
  false,
  'the no-send completion accepts only explicit recipient failures'
);

update private.reminder_delivery_control
set delivery_enabled = false,
    updated_at = timestamptz '2026-08-13 11:12:02+00'
where singleton;

select is(
  public.begin_typed_reminder_provider_attempt(
    gen_random_uuid(), 'resend', timestamptz '2026-08-13 11:12:03+00'
  ),
  false,
  'the emergency switch blocks the final provider fence immediately'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select throws_ok(
  $$
    select *
    from public.claim_due_typed_reminder_live(now(), 5, 900, 300)
  $$,
  '42501',
  'permission denied for function claim_due_typed_reminder_live',
  'an authenticated user cannot invoke the typed live dispatcher'
);

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$select public.begin_typed_reminder_provider_attempt(gen_random_uuid(), 'resend', now())$$,
  '42501',
  'permission denied for function begin_typed_reminder_provider_attempt',
  'an unauthenticated client cannot begin provider state'
);

select * from finish();
rollback;
