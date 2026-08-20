create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

revoke all on schema private from public, anon, authenticated, service_role;

create table private.learner_profile_access_control (
  singleton boolean primary key default true,
  rollout_state text not null default 'off',
  developer_user_id uuid,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint learner_profile_access_control_singleton_check check (singleton),
  constraint learner_profile_access_control_rollout_check check (
    rollout_state in ('off', 'developer-canary', 'signed-in-public')
  ),
  constraint learner_profile_access_control_canary_check check (
    rollout_state <> 'developer-canary' or developer_user_id is not null
  )
);

insert into private.learner_profile_access_control (
  singleton,
  rollout_state,
  developer_user_id
) values (true, 'off', null);

comment on table private.learner_profile_access_control is
  'Server-owned off, single-developer canary, and signed-in public gate for learner-profile access.';

alter table private.learner_profile_access_control enable row level security;

revoke all on table private.learner_profile_access_control
  from public, anon, authenticated, service_role;

create table public.learner_profile_versions (
  id uuid primary key,
  user_id uuid not null,
  profile_id uuid not null,
  generation bigint not null,
  revision bigint not null,
  base_revision bigint not null,
  envelope jsonb not null,
  payload_sha256 text not null,
  payload_bytes integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint learner_profile_versions_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_versions_revision_check check (
    generation >= 1
    and revision >= 1
    and base_revision >= 0
    and base_revision < revision
  ),
  constraint learner_profile_versions_digest_check check (
    payload_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_versions_size_check check (
    payload_bytes between 1 and 2097152
  ),
  constraint learner_profile_versions_profile_revision_key
    unique (profile_id, generation, revision),
  constraint learner_profile_versions_owner_identity_key
    unique (id, user_id, profile_id)
);

create table public.learner_profile_heads (
  user_id uuid primary key,
  profile_id uuid not null unique,
  generation bigint not null,
  revision bigint not null,
  current_version_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint learner_profile_heads_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_heads_revision_check check (
    generation >= 1 and revision >= 1
  ),
  constraint learner_profile_heads_current_version_fkey
    foreign key (current_version_id, user_id, profile_id)
    references public.learner_profile_versions (id, user_id, profile_id)
);

comment on table public.learner_profile_heads is
  'The current generation and revision for each verified Supabase learner owner.';
comment on table public.learner_profile_versions is
  'Owner-scoped immutable portable learner-profile revisions, including history when a current head is unavailable.';

create index learner_profile_versions_user_created_idx
  on public.learner_profile_versions (user_id, created_at desc);

alter table public.learner_profile_heads enable row level security;
alter table public.learner_profile_versions enable row level security;

revoke all on table public.learner_profile_heads
  from public, anon, authenticated, service_role;
revoke all on table public.learner_profile_versions
  from public, anon, authenticated, service_role;
grant select on table public.learner_profile_heads to authenticated;
grant select on table public.learner_profile_versions to authenticated;
grant select, insert, update, delete on table public.learner_profile_heads
  to service_role;
grant select, insert, update, delete on table public.learner_profile_versions
  to service_role;

create policy "Users can view their own learner profile head"
  on public.learner_profile_heads
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own learner profile versions"
  on public.learner_profile_versions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.jsonb_has_exact_keys(
  p_value jsonb,
  p_expected_keys text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(p_value) = 'object'
    and (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(p_value)
    ) = pg_catalog.cardinality(p_expected_keys)
    and not exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_value) as supplied(key)
      where not supplied.key = any(p_expected_keys)
    );
$$;

revoke execute on function private.jsonb_has_exact_keys(jsonb, text[])
  from public, anon, authenticated, service_role;

create or replace function private.canonical_jsonb_text(p_value jsonb)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(p_value)
    when 'object' then coalesce((
      select '{' || pg_catalog.string_agg(
        pg_catalog.to_jsonb(item.key)::text
          || ':'
          || private.canonical_jsonb_text(item.value),
        ',' order by item.key collate "C"
      ) || '}'
      from pg_catalog.jsonb_each(p_value) as item(key, value)
    ), '{}')
    when 'array' then coalesce((
      select '[' || pg_catalog.string_agg(
        private.canonical_jsonb_text(item.value),
        ',' order by item.ordinality
      ) || ']'
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as item(value, ordinality)
    ), '[]')
    else p_value::text
  end;
$$;

revoke execute on function private.canonical_jsonb_text(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.assert_initial_learner_profile_envelope(
  p_envelope jsonb
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  profile jsonb := p_envelope -> 'profile';
  config jsonb := profile -> 'config';
  learner jsonb := profile -> 'learnerProfile';
  onboarding jsonb := profile -> 'onboarding';
  no_anki_prompt jsonb := profile -> 'noAnkiFrequentUserPrompt';
  integrity jsonb := p_envelope -> 'integrity';
  canonical_envelope text;
  canonical_payload text;
  expected_digest text;
  claimed_bytes integer;
  selected_count integer;
  exported_at timestamptz;
begin
  if not private.jsonb_has_exact_keys(
    p_envelope,
    array['exportedAt', 'integrity', 'profile', 'schema', 'version']
  )
    or coalesce(p_envelope ->> 'schema', '')
      <> 'edenia-portable-learner-profile'
    or coalesce(p_envelope ->> 'version', '') <> '1'
    or coalesce(p_envelope ->> 'exportedAt', '')
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or not private.jsonb_has_exact_keys(
      integrity,
      array['algorithm', 'byteLength', 'payloadSha256']
    )
    or coalesce(integrity ->> 'algorithm', '') <> 'SHA-256'
    or coalesce(integrity ->> 'byteLength', '') !~ '^\d+$'
    or coalesce(integrity ->> 'payloadSha256', '')
      !~ '^[A-Za-z0-9_-]{43}$'
    or not private.jsonb_has_exact_keys(
      profile,
      array[
        'activityLog', 'anki', 'cityProgress', 'config', 'learnerProfile',
        'noAnkiFrequentUserPrompt', 'onboarding', 'videos'
      ]
    )
  then
    raise exception 'Initial learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  exported_at := (p_envelope ->> 'exportedAt')::timestamptz;
  claimed_bytes := (integrity ->> 'byteLength')::integer;
  canonical_envelope := private.canonical_jsonb_text(p_envelope);
  if claimed_bytes not between 1 and 2097152
    or pg_catalog.octet_length(
      pg_catalog.convert_to(canonical_envelope, 'UTF8')
    ) <> claimed_bytes
  then
    raise exception 'Initial learner profile byte length is invalid'
      using errcode = '22023';
  end if;

  canonical_payload := private.canonical_jsonb_text(
    pg_catalog.jsonb_build_object(
      'exportedAt', p_envelope -> 'exportedAt',
      'profile', profile,
      'schema', p_envelope -> 'schema',
      'version', p_envelope -> 'version'
    )
  );
  expected_digest := pg_catalog.rtrim(pg_catalog.translate(
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
  if integrity ->> 'payloadSha256' <> expected_digest then
    raise exception 'Initial learner profile integrity is invalid'
      using errcode = '22023';
  end if;

  if profile -> 'activityLog' <> '[]'::jsonb
    or profile -> 'anki' <> '{}'::jsonb
    or profile -> 'videos' <> '{}'::jsonb
    or not private.jsonb_has_exact_keys(
      profile -> 'cityProgress',
      array['maxLevelIndex']
    )
    or profile #>> '{cityProgress,maxLevelIndex}' <> '0'
    or not private.jsonb_has_exact_keys(
      config,
      array[
        'ankiEnabled', 'channelShelfOrder', 'channelVideoFormats', 'channels',
        'includeShorts', 'locale', 'removedChannelIds',
        'removedDefaultChannelIds', 'weeklyGoalHours'
      ]
    )
    or config -> 'channels' <> '[]'::jsonb
    or config -> 'channelShelfOrder' <> '[]'::jsonb
    or config -> 'channelVideoFormats' <> '{}'::jsonb
    or config -> 'removedChannelIds' <> '[]'::jsonb
    or config -> 'removedDefaultChannelIds' <> '[]'::jsonb
    or pg_catalog.jsonb_typeof(config -> 'ankiEnabled') <> 'boolean'
    or pg_catalog.jsonb_typeof(config -> 'includeShorts') <> 'boolean'
    or coalesce(config ->> 'locale', '')
      not in ('en', 'zh-Hant', 'zh-Hans', 'es', 'fr')
    or coalesce(config ->> 'weeklyGoalHours', '') !~ '^\d+$'
    or (config ->> 'weeklyGoalHours')::integer not between 1 and 99
  then
    raise exception 'Initial learner profile contains invalid durable state'
      using errcode = '22023';
  end if;

  if not private.jsonb_has_exact_keys(
    learner,
    array[
      'createdAt', 'languages', 'level', 'selectedChannelCatalogIds',
      'updatedAt'
    ]
  )
    or pg_catalog.jsonb_typeof(learner -> 'languages') <> 'array'
    or pg_catalog.jsonb_array_length(learner -> 'languages') <> 1
    or learner #>> '{languages,0}' not in (
      'mandarin', 'japanese', 'korean', 'spanish',
      'french', 'german', 'english', 'other'
    )
    or (
      learner #>> '{languages,0}' = 'other'
      and pg_catalog.jsonb_typeof(learner -> 'level') <> 'null'
    )
    or (
      learner #>> '{languages,0}' <> 'other'
      and coalesce(learner ->> 'level', '') not in (
        'starting', 'beginner', 'intermediate', 'advanced', 'not-sure'
      )
    )
    or coalesce(learner ->> 'createdAt', '')
      <> p_envelope ->> 'exportedAt'
    or coalesce(learner ->> 'updatedAt', '')
      <> p_envelope ->> 'exportedAt'
    or pg_catalog.jsonb_typeof(learner -> 'selectedChannelCatalogIds')
      <> 'array'
    or pg_catalog.jsonb_array_length(
      learner -> 'selectedChannelCatalogIds'
    ) > 5
  then
    raise exception 'Initial learner profile choices are invalid'
      using errcode = '22023';
  end if;

  selected_count := pg_catalog.jsonb_array_length(
    learner -> 'selectedChannelCatalogIds'
  );
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      learner -> 'selectedChannelCatalogIds'
    ) as selected(value)
    where pg_catalog.jsonb_typeof(selected.value) <> 'string'
      or pg_catalog.length(selected.value #>> '{}') not between 1 and 100
  )
    or (
      select pg_catalog.count(distinct selected.value)
      from pg_catalog.jsonb_array_elements(
        learner -> 'selectedChannelCatalogIds'
      ) as selected(value)
    ) <> selected_count
  then
    raise exception 'Initial learner profile channel choices are invalid'
      using errcode = '22023';
  end if;

  if not private.jsonb_has_exact_keys(
    no_anki_prompt,
    array['respondedAt', 'response']
  )
    or no_anki_prompt <> '{"respondedAt":null,"response":null}'::jsonb
    or not private.jsonb_has_exact_keys(
      onboarding,
      array[
        'introSeenAt', 'levelUpGuidanceShownAt',
        'recommendationsAppliedAt', 'setupCompleted', 'setupCompletedAt',
        'walkthroughCompleted', 'walkthroughCompletedAt'
      ]
    )
    or onboarding -> 'setupCompleted' <> 'true'::jsonb
    or coalesce(onboarding ->> 'setupCompletedAt', '')
      <> p_envelope ->> 'exportedAt'
    or onboarding -> 'walkthroughCompleted' <> 'false'::jsonb
    or onboarding -> 'walkthroughCompletedAt' <> 'null'::jsonb
    or onboarding -> 'levelUpGuidanceShownAt' <> 'null'::jsonb
    or onboarding -> 'recommendationsAppliedAt' <> 'null'::jsonb
    or coalesce(onboarding ->> 'introSeenAt', '')
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or (onboarding ->> 'introSeenAt')::timestamptz > exported_at
  then
    raise exception 'Initial learner profile onboarding state is invalid'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function
  private.assert_initial_learner_profile_envelope(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.resolve_my_learner_profile(
  p_onboarding_profile jsonb
)
returns table (
  status text,
  created boolean,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  access_control private.learner_profile_access_control%rowtype;
  current_head public.learner_profile_heads%rowtype;
  current_envelope jsonb;
  new_profile_id uuid;
  new_version_id uuid;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select value.* into strict access_control
  from private.learner_profile_access_control as value
  where value.singleton;

  if access_control.rollout_state = 'off'
    or (
      access_control.rollout_state = 'developer-canary'
      and access_control.developer_user_id is distinct from owner_id
    )
  then
    return query select
      'access_disabled'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  perform 1
  from auth.users as account
  where account.id = owner_id
    and account.confirmed_at is not null
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false)
  for update;
  if not found then
    return query select
      'verified_account_required'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id;
  if found then
    select version.envelope into strict current_envelope
    from public.learner_profile_versions as version
    where version.id = current_head.current_version_id
      and version.user_id = owner_id
      and version.profile_id = current_head.profile_id;
    return query select
      'profile_ready'::text,
      false,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      current_envelope;
    return;
  end if;

  if exists (
    select 1
    from public.learner_profile_versions as version
    where version.user_id = owner_id
  ) then
    return query select
      'recovery_required'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  if p_onboarding_profile is null then
    return query select
      'onboarding_required'::text,
      false,
      null::uuid,
      null::bigint,
      null::bigint,
      null::jsonb;
    return;
  end if;

  perform private.assert_initial_learner_profile_envelope(
    p_onboarding_profile
  );
  new_profile_id := extensions.gen_random_uuid();
  new_version_id := extensions.gen_random_uuid();

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
  ) values (
    new_version_id,
    owner_id,
    new_profile_id,
    1,
    1,
    0,
    p_onboarding_profile,
    p_onboarding_profile #>> '{integrity,payloadSha256}',
    (p_onboarding_profile #>> '{integrity,byteLength}')::integer
  );

  insert into public.learner_profile_heads (
    user_id,
    profile_id,
    generation,
    revision,
    current_version_id
  ) values (
    owner_id,
    new_profile_id,
    1,
    1,
    new_version_id
  );

  return query select
    'profile_ready'::text,
    true,
    new_profile_id,
    1::bigint,
    1::bigint,
    p_onboarding_profile;
end;
$$;

revoke execute on function private.resolve_my_learner_profile(jsonb)
  from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.resolve_my_learner_profile(jsonb)
  to authenticated;

create or replace function public.resolve_my_learner_profile(
  p_onboarding_profile jsonb
)
returns table (
  status text,
  created boolean,
  profile_id uuid,
  generation bigint,
  revision bigint,
  envelope jsonb
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.resolve_my_learner_profile(p_onboarding_profile);
$$;

revoke execute on function public.resolve_my_learner_profile(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_my_learner_profile(jsonb)
  to authenticated;

comment on function public.resolve_my_learner_profile(jsonb) is
  'Invoker wrapper for the private authenticated-owner learner-profile resolver.';
