begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(39);

select has_table(
  'public',
  'reminder_eligibility_snapshots',
  'the derived reminder eligibility snapshot exists'
);
select has_table(
  'public',
  'reminder_channel_follows',
  'the normalized reminder channel follows exist'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.reminder_eligibility_snapshots'::regclass),
  true,
  'reminder eligibility snapshots have RLS enabled'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.reminder_channel_follows'::regclass),
  true,
  'reminder channel follows have RLS enabled'
);
select policies_are(
  'public',
  'reminder_eligibility_snapshots',
  array['Users can view their own reminder eligibility snapshot'],
  'snapshot reads have exactly one owner policy'
);
select policies_are(
  'public',
  'reminder_channel_follows',
  array['Users can view their own reminder channel follows'],
  'channel reads have exactly one owner policy'
);
select hasnt_column(
  'public', 'reminder_eligibility_snapshots', 'email',
  'the eligibility snapshot does not store email'
);
select hasnt_column(
  'public', 'reminder_channel_follows', 'email',
  'the channel snapshot does not store email'
);
select has_function(
  'public',
  'sync_my_reminder_eligibility_snapshot',
  array['jsonb'],
  'the authenticated atomic snapshot RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.sync_my_reminder_eligibility_snapshot(jsonb)',
    'execute'
  ),
  'authenticated users can execute the owner-derived RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.sync_my_reminder_eligibility_snapshot(jsonb)',
    'execute'
  ),
  'anonymous users cannot execute the snapshot RPC'
);
select ok(
  has_table_privilege('service_role', 'public.reminder_eligibility_snapshots', 'insert'),
  'the trusted server can populate snapshot rows'
);
select ok(
  has_table_privilege('service_role', 'public.reminder_channel_follows', 'insert'),
  'the trusted server can populate channel rows'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'snapshot-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'snapshot-b@example.test');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  format(
    $query$
      select public.sync_my_reminder_eligibility_snapshot(
        jsonb_build_object(
          'timezone', 'UTC',
          'locale', 'en',
          'learningLanguage', 'mandarin',
          'studyDate', %L,
          'pointsToday', 4,
          'lastQualifiedStudyDate', %L,
          'currentStreakDays', 6,
          'channels', jsonb_build_array(
            jsonb_build_object(
              'channelId', 'UCaaaaaaaaaaaaaaaaaaaaaa',
              'channelName', 'Channel A',
              'latestVideoId', 'aaaaaaaaaaa',
              'latestVideoTitle', 'New lesson',
              'latestVideoPublishedAt', statement_timestamp()::text
            ),
            jsonb_build_object(
              'channelId', 'UCbbbbbbbbbbbbbbbbbbbbbb',
              'channelName', 'Channel B',
              'latestVideoId', null,
              'latestVideoTitle', null,
              'latestVideoPublishedAt', null
            )
          )
        )
      )
    $query$,
    current_date::text,
    (current_date - 1)::text
  ),
  'user A can atomically sync their own derived snapshot'
);
select results_eq(
  $$select count(*) from public.reminder_eligibility_snapshots$$,
  array[1::bigint],
  'user A sees exactly one snapshot row'
);
select results_eq(
  $$
    select timezone, locale, learning_language, points_today, current_streak_days
    from public.reminder_eligibility_snapshots
  $$,
  $$values ('UTC'::text, 'en'::text, 'mandarin'::text, 4, 6)$$,
  'the RPC stores only the submitted eligibility facts'
);
select results_eq(
  $$select count(*) from public.reminder_channel_follows$$,
  array[2::bigint],
  'user A sees their two followed channels'
);
select results_eq(
  $$
    select latest_video_id, latest_video_title
    from public.reminder_channel_follows
    where channel_id = 'UCaaaaaaaaaaaaaaaaaaaaaa'
  $$,
  $$values ('aaaaaaaaaaa'::text, 'New lesson'::text)$$,
  'the bounded latest-video candidate is stored with its channel'
);
select throws_ok(
  $$
    insert into public.reminder_eligibility_snapshots (
      user_id, timezone, locale, study_date, points_today, current_streak_days
    ) values (
      '11111111-1111-4111-8111-111111111111',
      'UTC', 'en', current_date, 0, 0
    )
  $$,
  '42501',
  'permission denied for table reminder_eligibility_snapshots',
  'authenticated clients cannot bypass the validating RPC with insert'
);
select throws_ok(
  $$update public.reminder_eligibility_snapshots set points_today = 99$$,
  '42501',
  'permission denied for table reminder_eligibility_snapshots',
  'authenticated clients cannot directly update eligibility'
);
select throws_ok(
  $$delete from public.reminder_eligibility_snapshots$$,
  '42501',
  'permission denied for table reminder_eligibility_snapshots',
  'authenticated clients cannot directly delete eligibility'
);
select throws_ok(
  format(
    $query$
      select public.sync_my_reminder_eligibility_snapshot(
        jsonb_build_object(
          'userId', '22222222-2222-4222-8222-222222222222',
          'timezone', 'UTC', 'locale', 'en', 'learningLanguage', 'mandarin',
          'studyDate', %L, 'pointsToday', 0,
          'lastQualifiedStudyDate', null, 'currentStreakDays', 0,
          'channels', '[]'::jsonb
        )
      )
    $query$,
    current_date::text
  ),
  '22023',
  'Snapshot payload contains an unsupported field',
  'the client cannot submit or reassign an owner UUID'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select lives_ok(
  format(
    $query$
      select public.sync_my_reminder_eligibility_snapshot(
        jsonb_build_object(
          'timezone', 'Europe/Paris',
          'locale', 'fr',
          'learningLanguage', 'french',
          'studyDate', %L,
          'pointsToday', 2,
          'lastQualifiedStudyDate', null,
          'currentStreakDays', 0,
          'channels', jsonb_build_array(
            jsonb_build_object(
              'channelId', 'UCcccccccccccccccccccccc',
              'channelName', 'Channel C',
              'latestVideoId', null,
              'latestVideoTitle', null,
              'latestVideoPublishedAt', null
            )
          )
        )
      )
    $query$,
    (statement_timestamp() at time zone 'Europe/Paris')::date::text
  ),
  'user B can sync a separately owned snapshot'
);
select results_eq(
  $$select count(*) from public.reminder_eligibility_snapshots$$,
  array[1::bigint],
  'user B sees only one snapshot'
);
select results_eq(
  $$select learning_language from public.reminder_eligibility_snapshots$$,
  $$values ('french'::text)$$,
  'user B sees only their language'
);
select results_eq(
  $$select count(*) from public.reminder_channel_follows$$,
  array[1::bigint],
  'user B sees only their followed channel'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select count(*) from public.reminder_eligibility_snapshots$$,
  array[1::bigint],
  'user A still sees exactly one snapshot after user B syncs'
);
select results_eq(
  $$select user_id from public.reminder_eligibility_snapshots$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'user A cannot select user B snapshot data'
);
select results_eq(
  $$select count(*) from public.reminder_channel_follows$$,
  array[2::bigint],
  'user A cannot select user B channel data'
);
select throws_ok(
  format(
    $query$
      select public.sync_my_reminder_eligibility_snapshot(
        jsonb_build_object(
          'timezone', 'UTC', 'locale', 'en', 'learningLanguage', 'mandarin',
          'studyDate', %L, 'pointsToday', 4,
          'lastQualifiedStudyDate', %L, 'currentStreakDays', 6,
          'channels', jsonb_build_array(
            jsonb_build_object(
              'channelId', 'UCaaaaaaaaaaaaaaaaaaaaaa', 'channelName', 'One',
              'latestVideoId', null, 'latestVideoTitle', null, 'latestVideoPublishedAt', null
            ),
            jsonb_build_object(
              'channelId', 'UCaaaaaaaaaaaaaaaaaaaaaa', 'channelName', 'Duplicate',
              'latestVideoId', null, 'latestVideoTitle', null, 'latestVideoPublishedAt', null
            )
          )
        )
      )
    $query$,
    current_date::text,
    (current_date - 1)::text
  ),
  '22023',
  'Snapshot contains duplicate channels',
  'duplicate channel snapshots are rejected atomically'
);
select results_eq(
  $$select count(*) from public.reminder_channel_follows$$,
  array[2::bigint],
  'a rejected replacement preserves the previous channel set'
);
select throws_ok(
  format(
    $query$
      select public.sync_my_reminder_eligibility_snapshot(
        jsonb_build_object(
          'timezone', 'Not/A_Real_Zone', 'locale', 'en',
          'learningLanguage', 'mandarin', 'studyDate', %L,
          'pointsToday', 0, 'lastQualifiedStudyDate', null,
          'currentStreakDays', 0, 'channels', '[]'::jsonb
        )
      )
    $query$,
    current_date::text
  ),
  '22023',
  'Snapshot timezone is invalid',
  'invalid IANA timezones are rejected'
);
select throws_ok(
  $$
    update public.reminder_eligibility_snapshots
    set user_id = '22222222-2222-4222-8222-222222222222'
  $$,
  '42501',
  'permission denied for table reminder_eligibility_snapshots',
  'authenticated clients cannot reassign a stored owner UUID'
);

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';

select throws_ok(
  $$select * from public.reminder_eligibility_snapshots$$,
  '42501',
  'permission denied for table reminder_eligibility_snapshots',
  'an unauthenticated client cannot select eligibility snapshots'
);
select throws_ok(
  $$select * from public.reminder_channel_follows$$,
  '42501',
  'permission denied for table reminder_channel_follows',
  'an unauthenticated client cannot select followed channels'
);
select throws_ok(
  $$select public.sync_my_reminder_eligibility_snapshot('{}'::jsonb)$$,
  '42501',
  'permission denied for function sync_my_reminder_eligibility_snapshot',
  'an unauthenticated client cannot execute the snapshot RPC'
);
select throws_ok(
  $$
    insert into public.reminder_channel_follows (user_id, channel_id, channel_name)
    values (
      '11111111-1111-4111-8111-111111111111',
      'UCdddddddddddddddddddddd',
      'Blocked'
    )
  $$,
  '42501',
  'permission denied for table reminder_channel_follows',
  'an unauthenticated client cannot insert followed channels'
);

reset role;
set local role service_role;

select results_eq(
  $$select count(*) from public.reminder_eligibility_snapshots$$,
  array[2::bigint],
  'the trusted server sees both isolated snapshot rows'
);
select results_eq(
  $$select count(*) from public.reminder_channel_follows$$,
  array[3::bigint],
  'the trusted server sees all three isolated channel rows'
);

select * from finish();
rollback;
