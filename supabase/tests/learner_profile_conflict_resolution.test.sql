begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(14);

create function pg_temp.rehash_learner_profile_envelope(p_envelope jsonb)
returns jsonb
language plpgsql
security definer
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

insert into auth.users (id, email, email_confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'conflict-owner@example.test',
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

create temporary table conflict_test_profiles as
select
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      envelope,
      '{profile,config,locale}',
      '"fr"'::jsonb
    )
  ) as cloud_envelope,
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      envelope,
      '{profile,config,locale}',
      '"es"'::jsonb
    )
  ) as device_envelope
from public.learner_profile_versions
where revision = 1;

select *
from public.commit_my_learner_profile(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select profile_id from public.learner_profile_heads),
  1,
  1,
  (select cloud_envelope from conflict_test_profiles)
);

create temporary table conflict_test_result as
select *
from public.commit_my_learner_profile(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  (select profile_id from public.learner_profile_heads),
  1,
  1,
  (select device_envelope from conflict_test_profiles)
);

select ok(
  (select status = 'conflict'
     and conflict_id is not null
     and revision = 2
   from conflict_test_result),
  'a stale write returns the preserved conflict identity and cloud revision'
);

select results_eq(
  $query$
    select
      status,
      device_envelope #>> '{profile,config,locale}',
      cloud_envelope #>> '{profile,config,locale}',
      protected_until
    from public.read_my_learner_profile_conflict(
      (select conflict_id from conflict_test_result)
    )
  $query$,
  $$values ('open'::text, 'es'::text, 'fr'::text, null::timestamptz)$$,
  'the owner can read both unchanged conflict inputs before choosing'
);

select results_eq(
  $query$
    select status
    from public.choose_my_learner_profile_conflict(
      (select conflict_id from conflict_test_result),
      'device',
      false
    )
  $query$,
  $$values ('confirmation_required'::text)$$,
  'a conflict choice without explicit confirmation changes nothing'
);

select results_eq(
  $query$
    select
      status,
      selected_side,
      revision,
      envelope #>> '{profile,config,locale}',
      protected_until > statement_timestamp() + interval '29 days'
    from public.choose_my_learner_profile_conflict(
      (select conflict_id from conflict_test_result),
      'device',
      true
    )
  $query$,
  $$values ('chosen'::text, 'device'::text, 3::bigint, 'es'::text, true)$$,
  'a confirmed device choice becomes a new head after protection succeeds'
);

select results_eq(
  $query$
    select
      status,
      selected_side,
      device_envelope #>> '{profile,config,locale}',
      cloud_envelope #>> '{profile,config,locale}',
      protected_until > statement_timestamp() + interval '29 days'
    from public.read_my_learner_profile_conflict(
      (select conflict_id from conflict_test_result)
    )
  $query$,
  $$values ('resolved'::text, 'device'::text, 'es'::text, 'fr'::text, true)$$,
  'both versions remain immediately downloadable for the protection period'
);

create temporary table second_conflict_profiles as
select
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      envelope,
      '{profile,config,locale}',
      '"fr"'::jsonb
    )
  ) as cloud_envelope,
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      envelope,
      '{profile,config,locale}',
      '"zh-Hans"'::jsonb
    )
  ) as device_envelope
from public.learner_profile_versions
where revision = 3;

select *
from public.commit_my_learner_profile(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  (select profile_id from public.learner_profile_heads),
  1,
  3,
  (select cloud_envelope from second_conflict_profiles)
);

create temporary table second_conflict_result as
select *
from public.commit_my_learner_profile(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  (select profile_id from public.learner_profile_heads),
  1,
  3,
  (select device_envelope from second_conflict_profiles)
);

select results_eq(
  $query$
    select
      status,
      selected_side,
      revision,
      envelope #>> '{profile,config,locale}'
    from public.choose_my_learner_profile_conflict(
      (select conflict_id from second_conflict_result),
      'cloud',
      true
    )
  $query$,
  $$values ('chosen'::text, 'cloud'::text, 5::bigint, 'fr'::text)$$,
  'a confirmed cloud choice activates the exact cloud input'
);

select results_eq(
  $query$
    select
      status,
      selected_side,
      device_envelope #>> '{profile,config,locale}',
      cloud_envelope #>> '{profile,config,locale}'
    from public.read_my_learner_profile_conflict(
      (select conflict_id from second_conflict_result)
    )
  $query$,
  $$values ('resolved'::text, 'cloud'::text, 'zh-Hans'::text, 'fr'::text)$$,
  'choosing cloud keeps the unchosen device version downloadable'
);

reset role;

insert into auth.users (id, email, email_confirmed_at)
values (
  '22222222-2222-4222-8222-222222222222',
  'other-conflict-owner@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is_empty(
  $query$
    select *
    from public.read_my_learner_profile_conflict(
      (select conflict_id from second_conflict_result)
    )
  $query$,
  'another authenticated owner cannot read either protected version'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

create temporary table third_conflict_profiles as
select
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      envelope,
      '{profile,config,locale}',
      '"en"'::jsonb
    )
  ) as cloud_envelope,
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      envelope,
      '{profile,config,locale}',
      '"es"'::jsonb
    )
  ) as device_envelope
from public.learner_profile_versions
where revision = 5;

select *
from public.commit_my_learner_profile(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  (select profile_id from public.learner_profile_heads),
  1,
  5,
  (select cloud_envelope from third_conflict_profiles)
);

create temporary table third_conflict_result as
select *
from public.commit_my_learner_profile(
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  (select profile_id from public.learner_profile_heads),
  1,
  5,
  (select device_envelope from third_conflict_profiles)
);

reset role;

create function pg_temp.reject_conflict_protection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'simulated conflict backup failure';
end;
$$;

create trigger reject_conflict_protection
  before update on private.learner_profile_conflicts
  for each row
  execute function pg_temp.reject_conflict_protection();

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $query$
    select *
    from public.choose_my_learner_profile_conflict(
      (select conflict_id from third_conflict_result),
      'device',
      true
    )
  $query$,
  'P0001',
  'simulated conflict backup failure',
  'a protected-backup write failure aborts the choice'
);

select results_eq(
  $query$
    select
      head.revision,
      version.envelope #>> '{profile,config,locale}'
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
    where head.user_id = auth.uid()
  $query$,
  $$values (6::bigint, 'en'::text)$$,
  'backup failure leaves the cloud head unchanged'
);

select results_eq(
  $query$
    select
      status,
      device_envelope #>> '{profile,config,locale}',
      cloud_envelope #>> '{profile,config,locale}'
    from public.read_my_learner_profile_conflict(
      (select conflict_id from third_conflict_result)
    )
  $query$,
  $$values ('open'::text, 'es'::text, 'en'::text)$$,
  'backup failure leaves both conflict inputs unchanged'
);

create temporary table fourth_conflict_result as
select *
from public.commit_my_learner_profile(
  '99999999-9999-4999-8999-999999999999',
  (select profile_id from public.learner_profile_heads),
  1,
  5,
  (select device_envelope from third_conflict_profiles)
);

reset role;
drop trigger reject_conflict_protection
  on private.learner_profile_conflicts;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select *
from public.choose_my_learner_profile_conflict(
  (select conflict_id from third_conflict_result),
  'device',
  true
);

select results_eq(
  $query$
    select status
    from public.choose_my_learner_profile_conflict(
      (select conflict_id from fourth_conflict_result),
      'cloud',
      true
    )
  $query$,
  $$values ('conflict_changed'::text)$$,
  'a choice against an advanced head requires a refreshed comparison'
);

select results_eq(
  $query$
    select
      status,
      cloud_revision,
      cloud_envelope #>> '{profile,config,locale}'
    from public.read_my_learner_profile_conflict(
      (select conflict_id from fourth_conflict_result)
    )
  $query$,
  $$values ('open'::text, 7::bigint, 'es'::text)$$,
  'the open conflict refreshes to the exact current cloud head'
);

select results_eq(
  $query$
    select
      status,
      selected_side,
      revision,
      envelope #>> '{profile,config,locale}'
    from public.choose_my_learner_profile_conflict(
      (select conflict_id from fourth_conflict_result),
      'cloud',
      true
    )
  $query$,
  $$values ('chosen'::text, 'cloud'::text, 8::bigint, 'es'::text)$$,
  'a refreshed concurrent conflict remains deliberately resolvable'
);

select * from finish();
rollback;
