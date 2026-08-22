begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(23);

select results_eq(
  $query$
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'list_my_learner_profile_recovery_candidates',
        'read_my_learner_profile_recovery_candidate',
        'restore_my_learner_profile'
      )
  $query$,
  $$values (3::bigint)$$,
  'the three narrow recovery Data API operations exist'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'list_my_learner_profile_recovery_candidates',
        'read_my_learner_profile_recovery_candidate',
        'restore_my_learner_profile'
      )
      and procedure.prosecdef
  ),
  'the recovery Data API operations are invoker wrappers'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'list_my_learner_profile_recovery_candidates',
        'read_my_learner_profile_recovery_candidate',
        'restore_my_learner_profile'
      )
      and not has_function_privilege(
        'authenticated',
        procedure.oid,
        'execute'
      )
  ),
  'authenticated can execute every narrow recovery operation'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'list_my_learner_profile_recovery_candidates',
        'read_my_learner_profile_recovery_candidate',
        'restore_my_learner_profile'
      )
      and has_function_privilege('anon', procedure.oid, 'execute')
  ),
  'anonymous clients cannot execute recovery operations'
);

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
  'missing-head-owner@example.test',
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

create temporary table recovery_test_profiles as
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
  (select cloud_envelope from recovery_test_profiles)
);

create temporary table recovery_test_conflict as
select *
from public.commit_my_learner_profile(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  (select profile_id from public.learner_profile_heads),
  1,
  1,
  (select device_envelope from recovery_test_profiles)
);

select *
from public.choose_my_learner_profile_conflict(
  (select conflict_id from recovery_test_conflict),
  'device',
  true
);

reset role;
delete from public.learner_profile_heads
where user_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select status, created from public.resolve_my_learner_profile(null)$$,
  $$values ('current_head_missing'::text, false)$$,
  'immutable owner history without a current head is classified explicitly'
);

select results_eq(
  $query$
    select source, candidate_id, protected_until > statement_timestamp()
    from public.list_my_learner_profile_recovery_candidates()
  $query$,
  $expected$
    select
      'protected'::text,
      conflict_id,
      true
    from recovery_test_conflict
  $expected$,
  'missing-head recovery lists only an unexpired protected owner candidate'
);

select results_eq(
  $query$
    select
      status,
      candidate_id,
      envelope #>> '{profile,config,locale}'
    from public.read_my_learner_profile_recovery_candidate(
      (select conflict_id from recovery_test_conflict)
    )
  $query$,
  $expected$
    select
      'available'::text,
      conflict_id,
      'fr'::text
    from recovery_test_conflict
  $expected$,
  'the exact protected unchosen cloud version remains readable'
);

select results_eq(
  $query$
    select status
    from public.restore_my_learner_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'protected',
      (select conflict_id from recovery_test_conflict),
      null,
      null,
      null,
      null,
      false
    )
  $query$,
  $$values ('confirmation_required'::text)$$,
  'restoring a protected candidate requires explicit confirmation'
);

select results_eq(
  $$select count(*) from public.learner_profile_heads$$,
  $$values (0::bigint)$$,
  'an unconfirmed restore leaves the missing head unchanged'
);

select results_eq(
  $query$
    select
      status,
      generation,
      revision,
      envelope #>> '{profile,config,locale}',
      protected_until > statement_timestamp() + interval '29 days'
    from public.restore_my_learner_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'protected',
      (select conflict_id from recovery_test_conflict),
      null,
      null,
      null,
      null,
      true
    )
  $query$,
  $$values ('restored'::text, 1::bigint, 4::bigint, 'fr'::text, true)$$,
  'a confirmed protected candidate becomes a new accepted revision'
);

select results_eq(
  $query$
    select
      restored.status,
      restored.revision,
      (select count(*) from public.learner_profile_versions)
    from public.restore_my_learner_profile(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'protected',
      (select conflict_id from recovery_test_conflict),
      null,
      null,
      null,
      null,
      true
    ) as restored
  $query$,
  $$values ('already_restored'::text, 4::bigint, 4::bigint)$$,
  'an exact restore retry returns its receipt without another revision'
);

create temporary table recovery_local_candidate as
select
  head.profile_id,
  head.generation,
  head.revision,
  head.current_version_id,
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      version.envelope,
      '{profile,config,locale}',
      '"zh-Hans"'::jsonb
    )
  ) as envelope
from public.learner_profile_heads as head
join public.learner_profile_versions as version
  on version.id = head.current_version_id
 and version.user_id = head.user_id
 and version.profile_id = head.profile_id;

select results_eq(
  $query$
    select
      status,
      revision,
      envelope #>> '{profile,config,locale}'
    from public.restore_my_learner_profile(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'local',
      null,
      (select profile_id from recovery_local_candidate),
      (select generation from recovery_local_candidate),
      (select revision from recovery_local_candidate),
      (select envelope from recovery_local_candidate),
      true
    )
  $query$,
  $$values ('restored'::text, 5::bigint, 'zh-Hans'::text)$$,
  'a matching owner-bound local profile restores as the next revision'
);

reset role;
select ok(
  (
    select recovery.displaced_version_id = candidate.current_version_id
      and recovery.protected_until
        > statement_timestamp() + interval '29 days'
    from private.learner_profile_recoveries as recovery
    cross join recovery_local_candidate as candidate
    where recovery.user_id = '11111111-1111-4111-8111-111111111111'
      and recovery.operation_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ),
  'a local restore protects the head that reappeared before restoration'
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $query$
    select *
    from public.restore_my_learner_profile(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'local',
      null,
      (select profile_id from public.learner_profile_heads),
      (select generation from public.learner_profile_heads),
      (select revision from public.learner_profile_heads),
      pg_catalog.jsonb_set(
        (
          select version.envelope
          from public.learner_profile_versions as version
          join public.learner_profile_heads as head
            on head.current_version_id = version.id
        ),
        '{integrity,payloadSha256}',
        pg_catalog.to_jsonb(pg_catalog.repeat('A', 43))
      ),
      true
    )
  $query$,
  '22023',
  'Learner profile integrity is invalid',
  'an invalid local candidate aborts before changing cloud state'
);

select results_eq(
  $query$
    select
      (select revision from public.learner_profile_heads),
      (select count(*) from public.learner_profile_versions)
  $query$,
  $$values (5::bigint, 5::bigint)$$,
  'a failed restore leaves the head and immutable history unchanged'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values (
  '22222222-2222-4222-8222-222222222222',
  'other-recovery-owner@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select count(*) from public.list_my_learner_profile_recovery_candidates()$$,
  $$values (0::bigint)$$,
  'another owner cannot list protected recovery metadata'
);

select results_eq(
  $query$
    select count(*)
    from public.read_my_learner_profile_recovery_candidate(
      (select conflict_id from recovery_test_conflict)
    )
  $query$,
  $$values (0::bigint)$$,
  'another owner cannot read a protected recovery envelope'
);

select results_eq(
  $query$
    select status
    from public.restore_my_learner_profile(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'protected',
      (select conflict_id from recovery_test_conflict),
      null,
      null,
      null,
      null,
      true
    )
  $query$,
  $$values ('recovery_required'::text)$$,
  'another owner cannot restore a protected recovery candidate'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values (
  '33333333-3333-4333-8333-333333333333',
  'history-without-candidate@example.test',
  statement_timestamp()
);

insert into public.learner_profile_versions (
  id,
  user_id,
  profile_id,
  generation,
  revision,
  base_revision,
  envelope,
  payload_sha256,
  payload_bytes
)
select
  '33333333-aaaa-4aaa-8aaa-333333333333',
  '33333333-3333-4333-8333-333333333333',
  '33333333-bbbb-4bbb-8bbb-333333333333',
  1,
  1,
  0,
  cloud_envelope,
  cloud_envelope #>> '{integrity,payloadSha256}',
  (cloud_envelope #>> '{integrity,byteLength}')::integer
from recovery_test_profiles;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select results_eq(
  $$select status from public.resolve_my_learner_profile(null)$$,
  $$values ('current_head_missing'::text)$$,
  'history without an eligible copy still blocks blank-profile creation'
);

select results_eq(
  $$select count(*) from public.list_my_learner_profile_recovery_candidates()$$,
  $$values (0::bigint)$$,
  'history without an eligible protected version offers no cloud candidate'
);

reset role;
insert into auth.users (id, email, email_confirmed_at)
values (
  '44444444-4444-4444-8444-444444444444',
  'genuinely-new-recovery@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select results_eq(
  $query$
    select status, created, generation, revision
    from public.resolve_my_learner_profile(
      (select cloud_envelope from recovery_test_profiles)
    )
  $query$,
  $$values ('profile_ready'::text, true, 1::bigint, 1::bigint)$$,
  'authoritative absence and new-account evidence still permit first use'
);

reset role;
update public.learner_profile_heads
set generation = 2,
  revision = 2
where user_id = '44444444-4444-4444-8444-444444444444';

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select results_eq(
  $$select status from public.resolve_my_learner_profile(null)$$,
  $$values ('current_head_unusable'::text)$$,
  'head metadata must match its referenced immutable version'
);

reset role;
update public.learner_profile_heads
set generation = 1,
  revision = 1
where user_id = '44444444-4444-4444-8444-444444444444';

update public.learner_profile_versions as version
set envelope = pg_catalog.jsonb_set(
  version.envelope,
  '{integrity,payloadSha256}',
  pg_catalog.to_jsonb(pg_catalog.repeat('A', 43))
)
from public.learner_profile_heads as head
where head.user_id = '44444444-4444-4444-8444-444444444444'
  and version.id = head.current_version_id;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select results_eq(
  $$select status from public.resolve_my_learner_profile(null)$$,
  $$values ('current_head_unusable'::text)$$,
  'a corrupt current envelope is distinct from a missing current head'
);

reset role;
select * from finish();
rollback;
