begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(13);

select has_function(
  'public',
  'commit_my_learner_profile',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb'],
  'the authenticated conditional learner-profile commit exists'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'sync-owner@example.test',
  statement_timestamp()
);

update private.learner_profile_access_control
set rollout_state = 'signed-in-public',
    updated_at = statement_timestamp()
where singleton;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select *
from public.resolve_my_learner_profile(
  $profile$
    {"exportedAt":"2026-08-20T21:00:00.000Z","integrity":{"algorithm":"SHA-256","byteLength":993,"payloadSha256":"hqjlf4nsc6lGE8DD_MOwb8oQ2nRIt5TCEe6ajII-bEs"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":"2026-08-20T21:00:00.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["french-mornings"],"updatedAt":"2026-08-20T21:00:00.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":"2026-08-20T21:00:00.000Z","levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":true,"setupCompletedAt":"2026-08-20T21:00:00.000Z","walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
  $profile$::jsonb
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.commit_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  $$values ('accepted'::text, 1::bigint, 2::bigint, 1::bigint)$$,
  'the expected current revision accepts one sequential cloud revision'
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.commit_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  $$values ('already_accepted'::text, 1::bigint, 2::bigint, 1::bigint)$$,
  'an exact operation retry returns its original accepted revision'
);

select throws_ok(
  $query$
    select *
    from public.commit_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from public.learner_profile_heads),
      1,
      2,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  '22023',
  'Learner profile operation identity was reused',
  'an operation id cannot be reused with different content'
);

select throws_ok(
  $query$
    select *
    from public.commit_my_learner_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      (select profile_id from public.learner_profile_heads),
      1,
      2,
      pg_catalog.jsonb_set(
        (select envelope from public.learner_profile_versions where revision = 1),
        '{profile,config,locale}',
        '"fr"'::jsonb
      )
    )
  $query$,
  '22023',
  'Learner profile integrity is invalid',
  'a changed payload with stale integrity cannot be committed'
);

select throws_ok(
  $query$
    select *
    from public.commit_my_learner_profile(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      (select profile_id from public.learner_profile_heads),
      1,
      2,
      pg_catalog.jsonb_set(
        (select envelope from public.learner_profile_versions where revision = 1),
        '{profile,config}',
        '{}'::jsonb
      )
    )
  $query$,
  '22023',
  'Learner profile envelope is invalid',
  'a rehashable envelope with an incomplete nested profile is rejected'
);

select results_eq(
  $query$
    select status, generation, revision, base_revision
    from public.commit_my_learner_profile(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      (select profile_id from public.learner_profile_heads),
      1,
      1,
      (select envelope from public.learner_profile_versions where revision = 1)
    )
  $query$,
  $$values ('conflict'::text, 1::bigint, 2::bigint, 1::bigint)$$,
  'a stale base revision reports conflict without overwriting the head'
);

reset role;

create function pg_temp.rehash_learner_profile_envelope(p_envelope jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb := p_envelope;
  canonical_payload text;
  canonical_envelope text;
  payload_digest text;
  claimed_bytes integer := 0;
  measured_bytes integer;
begin
  canonical_payload := private.canonical_jsonb_text(
    pg_catalog.jsonb_build_object(
      'exportedAt', result -> 'exportedAt',
      'profile', result -> 'profile',
      'schema', result -> 'schema',
      'version', result -> 'version'
    )
  );
  payload_digest := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(canonical_payload, 'UTF8'),
        'sha256'
      ),
      'base64'
    ),
    '+/',
    '-_'
  ), '=');
  result := pg_catalog.jsonb_set(
    result,
    '{integrity,payloadSha256}',
    pg_catalog.to_jsonb(payload_digest)
  );
  for attempt in 1..8 loop
    result := pg_catalog.jsonb_set(
      result,
      '{integrity,byteLength}',
      pg_catalog.to_jsonb(claimed_bytes)
    );
    canonical_envelope := private.canonical_jsonb_text(result);
    measured_bytes := pg_catalog.octet_length(
      pg_catalog.convert_to(canonical_envelope, 'UTF8')
    );
    exit when measured_bytes = claimed_bytes;
    claimed_bytes := measured_bytes;
  end loop;
  return result;
end;
$$;

select throws_ok(
  $query$
    select private.assert_learner_profile_envelope(
      pg_temp.rehash_learner_profile_envelope(
        pg_catalog.jsonb_set(
          (select envelope
           from public.learner_profile_versions
           where revision = 1),
          '{profile,learnerProfile,languages}',
          '["japanese", "french"]'::jsonb
        )
      )
    )
  $query$,
  '22023',
  'Learner profile envelope is invalid',
  'a correctly rehashed noncanonical learner list is rejected'
);

select lives_ok(
  $query$
    select private.assert_learner_profile_envelope(
      $profile$
        {"exportedAt":"2026-08-21T02:03:04.000Z","integrity":{"algorithm":"SHA-256","byteLength":996,"payloadSha256":"fCi8JTQVYZ7sde7Asqm9X6ZQEG00fed8KKlkwpmq8UA"},"profile":{"activityLog":[],"anki":{},"cityProgress":{"maxLevelIndex":0},"config":{"ankiEnabled":true,"channelShelfOrder":[],"channelVideoFormats":{},"channels":[{"catalogId":null,"id":"B","imageUrl":"","name":"Uppercase"},{"catalogId":null,"id":"a","imageUrl":"","name":"Lowercase"}],"includeShorts":true,"locale":"en","removedChannelIds":[],"removedDefaultChannelIds":[],"weeklyGoalHours":4},"learnerProfile":{"createdAt":null,"languages":[],"level":null,"selectedChannelCatalogIds":[],"updatedAt":null},"noAnkiFrequentUserPrompt":{"respondedAt":null,"response":null},"onboarding":{"introSeenAt":null,"levelUpGuidanceShownAt":null,"recommendationsAppliedAt":null,"setupCompleted":false,"setupCompletedAt":null,"walkthroughCompleted":false,"walkthroughCompletedAt":null},"videos":{}},"schema":"edenia-portable-learner-profile","version":1}
      $profile$::jsonb
    )
  $query$,
  'browser and server accept the same mixed-case channel ordering'
);

select lives_ok(
  $query$
    select private.assert_learner_profile_envelope(
      $profile$
        {"exportedAt":"2026-08-21T01:02:03.000Z","integrity":{"algorithm":"SHA-256","byteLength":2242,"payloadSha256":"c-a3epgrMvQKEPkuXvMJLjEZiZLGRvM0JKcIpbmd7Hs"},"profile":{"activityLog":[{"actor":"user","createdAt":"2026-08-21T01:02:03.000Z","detail":"Watched lesson","id":"activity-1","meta":{"seconds":90,"videoId":"video-1"},"status":"success","title":"Study","type":"video"}],"anki":{"2026-08-21":{"created":2,"observedAt":"2026-08-21T01:02:03.000Z","reviewed":5}},"cityProgress":{"maxLevelIndex":3},"config":{"ankiEnabled":true,"channelShelfOrder":["channel-1"],"channelVideoFormats":{"channel-1":"videos"},"channels":[{"catalogId":"catalog-1","id":"channel-1","imageUrl":"https://example.test/channel.jpg","name":"Channel"}],"includeShorts":false,"locale":"fr","removedChannelIds":["removed-1"],"removedDefaultChannelIds":["default-1"],"weeklyGoalHours":7},"learnerProfile":{"createdAt":"2026-08-21T01:02:03.000Z","languages":["french"],"level":"beginner","selectedChannelCatalogIds":["catalog-1"],"updatedAt":"2026-08-21T01:02:03.000Z"},"noAnkiFrequentUserPrompt":{"respondedAt":"2026-08-21T01:02:03.000Z","response":"yes"},"onboarding":{"introSeenAt":"2026-08-21T01:02:03.000Z","levelUpGuidanceShownAt":"2026-08-21T01:02:03.000Z","recommendationsAppliedAt":"2026-08-21T01:02:03.000Z","setupCompleted":true,"setupCompletedAt":"2026-08-21T01:02:03.000Z","walkthroughCompleted":true,"walkthroughCompletedAt":"2026-08-21T01:02:03.000Z"},"videos":{"video-1":{"aspectRatio":1.777,"channelId":"channel-1","channelImageUrl":"https://example.test/channel.jpg","channelTitle":"Channel","duration":120,"favorite":true,"hiddenFromGrid":false,"hiddenFromGridAt":null,"id":"video-1","isShort":false,"manuallyAdded":false,"pausedAt":null,"publishedAt":"2026-08-21T01:02:03.000Z","removedFromFeedAt":null,"resumeAtSeconds":30,"source":"youtube","status":"partial","thumbnail":"https://example.test/video.jpg","title":"Lesson","watchLater":false,"watchProgress":[{"id":"video:video-1:2026-08-21T01:02:03.000Z:90:1","seconds":90,"studyDay":"2026-08-21","watchedAt":"2026-08-21T01:02:03.000Z"}],"watchProgressTracked":true,"watchedAt":null,"watchedConfirmationUnlockedAt":"2026-08-21T01:02:03.000Z"}}},"schema":"edenia-portable-learner-profile","version":1}
      $profile$::jsonb
    )
  $query$,
  'a complete non-empty portable learner profile passes server validation'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.commit_my_learner_profile(uuid,uuid,bigint,bigint,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.commit_my_learner_profile(uuid,uuid,bigint,bigint,jsonb)',
    'EXECUTE'
  ),
  'only authenticated clients can invoke the public commit wrapper'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.learner_profile_write_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'clients have no direct receipt-table privileges'
);

select results_eq(
  $query$
    select
      (select revision from public.learner_profile_heads),
      (select count(*) from public.learner_profile_versions),
      (select count(*) from public.learner_profile_write_receipts)
  $query$,
  $$values (2::bigint, 2::bigint, 1::bigint)$$,
  'retry and conflict leave one accepted revision and one receipt'
);

select * from finish();
rollback;
