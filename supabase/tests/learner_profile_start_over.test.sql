begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(25);

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

select has_function(
  'public',
  'start_over_my_learner_profile',
  array['uuid', 'uuid', 'bigint', 'bigint', 'jsonb', 'boolean'],
  'the authenticated Start over operation exists'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'start-over-owner@example.test',
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

select results_eq(
  $query$
    select status
    from public.start_over_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from start_over_test_values),
      1,
      1,
      (select blank_envelope from start_over_test_values),
      false
    )
  $query$,
  $$values ('confirmation_required'::text)$$,
  'Start over requires explicit confirmation'
);

select results_eq(
  $query$
    select generation, revision
    from public.learner_profile_heads
    where user_id = auth.uid()
  $query$,
  $$values (1::bigint, 1::bigint)$$,
  'an unconfirmed reset changes neither generation nor revision'
);

create temporary table start_over_result as
select *
from public.start_over_my_learner_profile(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select profile_id from start_over_test_values),
  1,
  1,
  (select blank_envelope from start_over_test_values),
  true
);

select results_eq(
  $query$
    select
      status,
      generation,
      revision,
      envelope #> '{profile,learnerProfile,languages}',
      protected_until > statement_timestamp() + interval '29 days'
    from start_over_result
  $query$,
  $$values ('started_over'::text, 2::bigint, 1::bigint, '[]'::jsonb, true)$$,
  'a confirmed reset installs one blank revision in a new generation'
);

select results_eq(
  $query$
    select
      head.generation,
      head.revision,
      version.envelope #> '{profile,learnerProfile,languages}'
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
     and version.user_id = head.user_id
     and version.profile_id = head.profile_id
    where head.user_id = auth.uid()
  $query$,
  $$values (2::bigint, 1::bigint, '[]'::jsonb)$$,
  'the new generation becomes the only current cloud head'
);

select results_eq(
  $query$
    select
      status,
      prior_generation,
      prior_revision,
      prior_envelope #> '{profile,learnerProfile,languages}',
      protected_until > statement_timestamp() + interval '29 days'
    from public.read_my_latest_learner_profile_reset()
  $query$,
  $$values ('available'::text, 1::bigint, 1::bigint, '["french"]'::jsonb, true)$$,
  'the prior generation remains owner-readable for Undo for 30 days'
);

select results_eq(
  $query$
    select status, generation, revision, reset_id
    from public.start_over_my_learner_profile(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      (select profile_id from start_over_test_values),
      1,
      1,
      (select blank_envelope from start_over_test_values),
      true
    )
  $query$,
  $expected$
    select
      'already_started_over'::text,
      2::bigint,
      1::bigint,
      reset_id
    from start_over_result
  $expected$,
  'an exact Start over retry returns its original protected result'
);

select results_eq(
  $query$
    select generation, revision
    from public.commit_my_learner_profile(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      (select profile_id from start_over_test_values),
      1,
      1,
      (select prior_envelope from start_over_test_values)
    )
  $query$,
  $$values (2::bigint, 1::bigint)$$,
  'a stale pre-reset device cannot automatically replace the new generation'
);

select has_function(
  'public',
  'undo_my_learner_profile_start_over',
  array['uuid', 'uuid', 'boolean'],
  'the authenticated Undo operation exists'
);

reset role;

insert into auth.users (id, email, email_confirmed_at)
values (
  '22222222-2222-4222-8222-222222222222',
  'other-start-over-owner@example.test',
  statement_timestamp()
);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $query$
    select status, reset_id
    from public.read_my_latest_learner_profile_reset()
  $query$,
  $$values ('none'::text, null::uuid)$$,
  'another owner cannot discover the protected generation'
);

select results_eq(
  $query$
    select status
    from public.undo_my_learner_profile_start_over(
      (select reset_id from start_over_result),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      true
    )
  $query$,
  $$values ('recovery_required'::text)$$,
  'another owner cannot restore the protected generation'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status
    from public.undo_my_learner_profile_start_over(
      (select reset_id from start_over_result),
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      false
    )
  $query$,
  $$values ('confirmation_required'::text)$$,
  'Undo requires explicit confirmation'
);

select results_eq(
  $query$
    select generation, revision
    from public.learner_profile_heads
    where user_id = auth.uid()
  $query$,
  $$values (2::bigint, 1::bigint)$$,
  'an unconfirmed Undo leaves the reset head unchanged'
);

reset role;

create function pg_temp.reject_reset_restore()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'simulated reset restore failure';
end;
$$;

create trigger reject_reset_restore
  before insert on public.learner_profile_versions
  for each row
  when (new.generation = 2 and new.revision = 2)
  execute function pg_temp.reject_reset_restore();

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $query$
    select *
    from public.undo_my_learner_profile_start_over(
      (select reset_id from start_over_result),
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      true
    )
  $query$,
  'P0001',
  'simulated reset restore failure',
  'a restore write failure aborts Undo'
);

select results_eq(
  $query$
    select generation, revision
    from public.learner_profile_heads
    where user_id = auth.uid()
  $query$,
  $$values (2::bigint, 1::bigint)$$,
  'failed Undo leaves the blank head unchanged'
);

select results_eq(
  $query$
    select status, prior_generation, prior_revision
    from public.read_my_latest_learner_profile_reset()
  $query$,
  $$values ('available'::text, 1::bigint, 1::bigint)$$,
  'failed Undo leaves the protected generation recoverable'
);

reset role;
drop trigger reject_reset_restore on public.learner_profile_versions;

update private.learner_profile_resets
set created_at = statement_timestamp() - interval '31 days',
    protected_until = statement_timestamp() - interval '1 day'
where id = (select reset_id from start_over_result);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $query$
    select status
    from public.undo_my_learner_profile_start_over(
      (select reset_id from start_over_result),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      true
    )
  $query$,
  $$values ('expired'::text)$$,
  'Undo refuses a generation after the 30-day protection period'
);

select results_eq(
  $query$
    select generation, revision
    from public.learner_profile_heads
    where user_id = auth.uid()
  $query$,
  $$values (2::bigint, 1::bigint)$$,
  'expired Undo leaves the blank head unchanged'
);

reset role;

update private.learner_profile_resets
set created_at = statement_timestamp(),
    protected_until = statement_timestamp() + interval '30 days'
where id = (select reset_id from start_over_result);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

create temporary table undo_result as
select *
from public.undo_my_learner_profile_start_over(
  (select reset_id from start_over_result),
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  true
);

select results_eq(
  $query$
    select
      status,
      generation,
      revision,
      envelope #> '{profile,learnerProfile,languages}'
    from undo_result
  $query$,
  $$values ('undone'::text, 2::bigint, 2::bigint, '["french"]'::jsonb)$$,
  'Undo restores protected content as a new revision of the reset generation'
);

select results_eq(
  $query$
    select
      head.generation,
      head.revision,
      version.envelope #> '{profile,learnerProfile,languages}'
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
     and version.user_id = head.user_id
     and version.profile_id = head.profile_id
    where head.user_id = auth.uid()
  $query$,
  $$values (2::bigint, 2::bigint, '["french"]'::jsonb)$$,
  'Undo moves the head through the current generation and revision fence'
);

select results_eq(
  $query$
    select status, reset_id
    from public.read_my_latest_learner_profile_reset()
  $query$,
  $expected$
    select 'undone'::text, reset_id
    from start_over_result
  $expected$,
  'Undo leaves an owner-only transition receipt without offering recovery again'
);

select results_eq(
  $query$
    select status, generation, revision
    from public.undo_my_learner_profile_start_over(
      (select reset_id from start_over_result),
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      true
    )
  $query$,
  $$values ('already_undone'::text, 2::bigint, 2::bigint)$$,
  'an exact Undo retry returns its accepted revision'
);

reset role;

create function pg_temp.reject_reset_protection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'simulated reset protection failure';
end;
$$;

create trigger reject_reset_protection
  before insert on private.learner_profile_resets
  for each row
  execute function pg_temp.reject_reset_protection();

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select throws_ok(
  $query$
    select *
    from public.start_over_my_learner_profile(
      '12121212-1212-4212-8212-121212121212',
      (select profile_id from start_over_test_values),
      2,
      2,
      (select blank_envelope from start_over_test_values),
      true
    )
  $query$,
  'P0001',
  'simulated reset protection failure',
  'a protection write failure aborts Start over'
);

select results_eq(
  $query$
    select
      head.generation,
      head.revision,
      version.envelope #> '{profile,learnerProfile,languages}'
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
     and version.user_id = head.user_id
     and version.profile_id = head.profile_id
    where head.user_id = auth.uid()
  $query$,
  $$values (2::bigint, 2::bigint, '["french"]'::jsonb)$$,
  'failed Start over leaves the accepted head unchanged'
);

reset role;

select results_eq(
  $query$
    select count(*), min(state)
    from private.learner_profile_resets
    where user_id = '11111111-1111-4111-8111-111111111111'
  $query$,
  $$values (1::bigint, 'undone'::text)$$,
  'failed Start over creates no partial protection record'
);

drop trigger reject_reset_protection on private.learner_profile_resets;

select * from finish();
rollback;
