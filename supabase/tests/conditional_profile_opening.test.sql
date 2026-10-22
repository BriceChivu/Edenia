begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;
select no_plan();
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

reset role;

create temporary table opening_fixture on commit drop as
select
  head.user_id,
  head.profile_id,
  head.generation,
  head.revision,
  version.envelope,
  version.payload_sha256,
  version.payload_bytes
from public.learner_profile_heads as head
join public.learner_profile_versions as version
  on version.id = head.current_version_id
 and version.user_id = head.user_id
 and version.profile_id = head.profile_id
 and version.generation = head.generation
 and version.revision = head.revision
where head.user_id = '11111111-1111-4111-8111-111111111111';

grant select on table opening_fixture to authenticated;
reset role;
alter table opening_fixture add column content_hash text;
update opening_fixture set content_hash = rtrim(translate(encode(extensions.digest(
  convert_to(private.canonical_jsonb_text(envelope -> 'profile'), 'UTF8'), 'sha256'), 'base64'), '+/', '-_'), '=');
select ok(not has_function_privilege('anon', 'public.open_my_learner_profile(jsonb,uuid,bigint,bigint,text)', 'EXECUTE'), 'anonymous callers cannot open profiles');
select ok(not has_function_privilege('anon', 'learner_profile_rpc.open_my_learner_profile(jsonb,uuid,bigint,bigint,text)', 'EXECUTE'), 'the privileged implementation is also inaccessible anonymously');
select ok(has_function_privilege('authenticated', 'public.open_my_learner_profile(jsonb,uuid,bigint,bigint,text)', 'EXECUTE'), 'authenticated owners can open their profile');
set local request.jwt.claim.sub = '';
select throws_ok($$select * from public.open_my_learner_profile()$$, '42501', 'Authentication required', 'missing owner identity is rejected');
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
create temporary table opening_result as
select result.* from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 1, 1, f.content_hash) result;
select is((select status from opening_result), 'profile_unchanged', 'an exact cached identity and content match uses a small response');
select ok((select envelope is null from opening_result), 'unchanged response omits the full learner envelope');
select is((select profile_sha256 from opening_result), (select content_hash from opening_fixture), 'unchanged response proves the requested content');
select is((select reset_state ->> 'status' from opening_result), 'none', 'the same response includes reset state');
select is((select status from public.open_my_learner_profile()), 'profile_ready', 'a new browser gets the full profile in one call');
select is((select envelope from public.open_my_learner_profile()), (select envelope from opening_fixture), 'full opening preserves the exact envelope');
select is((select result.status from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 1, 1, repeat('A', 43)) result), 'profile_ready', 'matching revision with corrupt or changed local content receives the full profile');
select is((select result.status from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 2, 1, f.content_hash) result), 'profile_ready', 'a different generation cannot use the cached copy');
select is((select result.status from opening_fixture f cross join lateral public.open_my_learner_profile(null, '99999999-9999-4999-8999-999999999999', 1, 1, f.content_hash) result), 'profile_ready', 'a different profile identity cannot use the cached copy');
reset role;
select is((select count(*) from public.learner_profile_versions where user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'opening alone creates no progress versions');
insert into auth.users (id,email,email_confirmed_at) values ('22222222-2222-4222-8222-222222222222','other-opening@example.test',now());
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select result.status from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 1, 1, f.content_hash) result), 'onboarding_required', 'an authenticated different owner cannot open the cached owner profile');
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is((select result.status from opening_fixture f cross join lateral public.commit_my_learner_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', f.profile_id, 1, 1, f.envelope) result), 'accepted', 'another device can advance the cloud head');
select is((select result.status from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 1, 1, f.content_hash) result), 'profile_ready', 'a newer cloud revision is returned even when its content happens to match');
select is((select result.revision from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 1, 1, f.content_hash) result), 2::bigint, 'device switching opens the newer revision');
create temporary table start_over_test_values as
select
  head.profile_id,
  version.envelope as prior_envelope,
  pg_temp.rehash_learner_profile_envelope(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              version.envelope,
              '{profile,learnerProfile,languages}',
              '[]'::jsonb
            ),
            '{profile,learnerProfile,level}',
            'null'::jsonb
          ),
          '{profile,learnerProfile,selectedChannelCatalogIds}',
          '[]'::jsonb
        ),
        '{profile,onboarding,setupCompleted}',
        'false'::jsonb
      ),
      '{profile,onboarding,setupCompletedAt}',
      'null'::jsonb
    )
  ) as blank_envelope
from public.learner_profile_heads as head
join public.learner_profile_versions as version
  on version.id = head.current_version_id
where head.user_id = auth.uid();
select is((select result.status from opening_fixture f cross join lateral public.start_over_my_learner_profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', f.profile_id, 1, 2, (select blank_envelope from start_over_test_values), true) result), 'started_over', 'a protected Start over establishes a new generation');
create temporary table after_reset as select * from public.open_my_learner_profile();
select is((select generation from after_reset), 2::bigint, 'the current reset generation opens');
select is((select reset_state ->> 'status' from after_reset), 'available', 'opening bundles the protected reset receipt');
select is((select (reset_state ->> 'reset_generation')::bigint from after_reset), 2::bigint, 'bundled reset intent is bound to the opened generation');
select ok((select reset_state -> 'prior_envelope' is not null from after_reset), 'Undo retains the protected prior profile');
select is((select result.status from opening_fixture f cross join lateral public.open_my_learner_profile(null, f.profile_id, 1, 1, f.content_hash) result), 'profile_ready', 'the pre-reset cached profile never takes the unchanged path');
reset role;
update private.learner_profile_access_control set rollout_state = 'off' where singleton;
set local role authenticated;
select is((select status from public.open_my_learner_profile()), 'access_disabled', 'conditional opening preserves rollout admission');
select * from finish();
rollback;
