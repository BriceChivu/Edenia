-- Additive transport only: legacy payloads, hashes and RPC identities stay intact.
-- Godot remains responsible for island gameplay and snapshot-version validation.
alter function private.learner_profile_envelope_schema()
  rename to learner_profile_envelope_schema_before_current_experience;

create function private.learner_profile_envelope_schema()
returns json
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  result jsonb := private.learner_profile_envelope_schema_before_current_experience()::jsonb;
  counter jsonb := '{"type":"integer","minimum":0,"maximum":9007199254740991}'::jsonb;
begin
  result := pg_catalog.jsonb_set(result,
    '{definitions,profile,properties,tinySwordsIsland}', '{}'::jsonb);
  result := pg_catalog.jsonb_set(result,
    '{definitions,profile,properties,legacyCityProgress}', '{"type":"object"}'::jsonb);
  result := pg_catalog.jsonb_set(result,
    '{definitions,profile,properties,cityProgress,properties,experienceVersion}', '{"const":1}'::jsonb);
  result := pg_catalog.jsonb_set(result,
    '{definitions,ankiDay,properties,experienceReviews}', counter);
  result := pg_catalog.jsonb_set(result,
    '{definitions,ankiDay,properties,experienceWatermark}', counter);
  result := pg_catalog.jsonb_set(result,
    '{definitions,watchProgress,properties,experienceSeconds}', counter);
  result := pg_catalog.jsonb_set(result,
    '{definitions,onboarding,properties,islandAnnouncementSeenAt}',
    '{"$ref":"#/definitions/timestamp"}'::jsonb);
  return result::json;
end;
$$;
revoke execute on function private.learner_profile_envelope_schema()
  from public, anon, authenticated, service_role;

-- JavaScript sorts non-index object keys by UTF-16 code units, including
-- supplementary characters. Do not interpret opaque snapshot property names.
create function private.profile_utf16_sort_key(p_value text)
returns integer[]
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select array(
    select units.value
    from pg_catalog.regexp_split_to_table(p_value, '') with ordinality as characters(value, position)
    cross join lateral (values
      (1, case when pg_catalog.ascii(characters.value) > 65535
        then 55296 + (pg_catalog.ascii(characters.value) - 65536) / 1024
        else pg_catalog.ascii(characters.value) end),
      (2, case when pg_catalog.ascii(characters.value) > 65535
        then 56320 + (pg_catalog.ascii(characters.value) - 65536) % 1024
        else null end)
    ) as units(position, value)
    where characters.value <> '' and units.value is not null
    order by characters.position, units.position
  );
$$;
revoke execute on function private.profile_utf16_sort_key(text)
  from public, anon, authenticated, service_role;

-- JSONB expands exponent notation. Opaque snapshots can contain fractional timers,
-- so restore JavaScript's decimal/exponent cutoffs before checking their integrity.
create function private.canonical_island_jsonb_text(p_value jsonb)
returns text
language plpgsql
stable
strict
security invoker
set search_path = ''
set extra_float_digits = 3
as $$
declare
  number_text text;
  coefficient text;
  exponent integer;
  negative boolean;
  digits text;
  decimal_at integer;
  result text;
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(item.key)::text || ':' || private.canonical_island_jsonb_text(item.value),
        ',' order by
          -- JSON.stringify enumerates array-index keys before other object keys.
          case when item.key ~ '^(0|[1-9][0-9]{0,9})$'
            and item.key::numeric < 4294967295 then 0 else 1 end,
          case when item.key ~ '^(0|[1-9][0-9]{0,9})$'
            and item.key::numeric < 4294967295 then item.key::numeric else null end,
          private.profile_utf16_sort_key(item.key)
      ), '') || '}' into result
      from pg_catalog.jsonb_each(p_value) as item(key, value);
      return result;
    when 'array' then
      select '[' || coalesce(pg_catalog.string_agg(
        private.canonical_island_jsonb_text(item.value), ',' order by item.ordinality
      ), '') || ']' into result
      from pg_catalog.jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return result;
    when 'number' then
      number_text := (p_value::text::double precision)::text;
      if number_text in ('0', '-0') then return '0'; end if;
      negative := pg_catalog.left(number_text, 1) = '-';
      number_text := pg_catalog.ltrim(number_text, '-');
      coefficient := pg_catalog.split_part(number_text, 'e', 1);
      exponent := case when number_text like '%e%' then pg_catalog.split_part(number_text, 'e', 2)::integer else 0 end;
      decimal_at := case when coefficient like '%.%' then pg_catalog.strpos(coefficient, '.') - 1 else pg_catalog.length(coefficient) end + exponent;
      digits := pg_catalog.replace(coefficient, '.', '');
      while pg_catalog.left(digits, 1) = '0' loop
        digits := pg_catalog.substr(digits, 2); decimal_at := decimal_at - 1;
      end loop;
      digits := pg_catalog.rtrim(digits, '0');
      if decimal_at > 0 and decimal_at <= 21 then
        result := case when pg_catalog.length(digits) <= decimal_at
          then digits || pg_catalog.repeat('0', decimal_at - pg_catalog.length(digits))
          else pg_catalog.substr(digits, 1, decimal_at) || '.' || pg_catalog.substr(digits, decimal_at + 1) end;
      elsif decimal_at <= 0 and decimal_at > -6 then
        result := '0.' || pg_catalog.repeat('0', -decimal_at) || digits;
      else
        result := pg_catalog.left(digits, 1) || case when pg_catalog.length(digits) > 1 then '.' || pg_catalog.substr(digits, 2) else '' end
          || 'e' || case when decimal_at - 1 >= 0 then '+' else '' end || (decimal_at - 1)::text;
      end if;
      return case when negative then '-' else '' end || result;
    else return p_value::text;
  end case;
end;
$$;
revoke execute on function private.canonical_island_jsonb_text(jsonb)
  from public, anon, authenticated, service_role;

-- Preserve the existing canonical representation outside the new opaque field.
create or replace function private.canonical_jsonb_text(p_value jsonb)
returns text
language sql
stable
strict
security invoker
set search_path = ''
as $$
  select case pg_catalog.jsonb_typeof(p_value)
    when 'object' then coalesce((
      select '{' || pg_catalog.string_agg(
        pg_catalog.to_jsonb(item.key)::text || ':' ||
        case when item.key = 'tinySwordsIsland'
          and p_value ?& array['activityLog','anki','cityProgress','config','learnerProfile','noAnkiFrequentUserPrompt','onboarding','videos']
          then private.canonical_island_jsonb_text(item.value)
          else private.canonical_jsonb_text(item.value) end,
        ',' order by item.key collate "C"
      ) || '}' from pg_catalog.jsonb_each(p_value) as item(key, value)
    ), '{}')
    when 'array' then coalesce((
      select '[' || pg_catalog.string_agg(private.canonical_jsonb_text(item.value), ',' order by item.ordinality) || ']'
      from pg_catalog.jsonb_array_elements(p_value) with ordinality as item(value, ordinality)
    ), '[]')
    else p_value::text
  end;
$$;

alter function private.assert_learner_profile_envelope(jsonb)
  rename to assert_learner_profile_envelope_before_current_experience;
create function private.assert_learner_profile_envelope(p_envelope jsonb)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  profile jsonb := p_envelope -> 'profile';
begin
  perform private.assert_learner_profile_envelope_before_current_experience(p_envelope);
  if profile ? 'tinySwordsIsland' and (
    profile -> 'tinySwordsIsland' = 'null'::jsonb
    or pg_catalog.octet_length(pg_catalog.convert_to(
      private.canonical_island_jsonb_text(profile -> 'tinySwordsIsland'), 'UTF8'
    )) > 524288
  ) then
    raise exception 'Learner profile island transport is invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
    cross join lateral pg_catalog.jsonb_array_elements(video.value -> 'watchProgress') as progress(entry)
    where (progress.entry ->> 'experienceSeconds')::numeric > (progress.entry ->> 'seconds')::numeric
  ) or (profile #>> '{onboarding,islandAnnouncementSeenAt}' is not null
    and not private.is_canonical_profile_timestamp(profile #>> '{onboarding,islandAnnouncementSeenAt}'))
  then
    raise exception 'Learner profile experience state is invalid' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.assert_learner_profile_envelope(jsonb)
  from public, anon, authenticated, service_role;

-- First creation still forbids islands, retained claims and pre-auth progress.
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
  -- A first signed-in profile can carry only an empty starter economy.
  if profile ? 'townEconomy' and profile -> 'townEconomy' <>
    '{"version":1,"mode":"starter","rewards":{},"purchases":{}}'::jsonb
  then
    raise exception 'Initial learner profile economy is invalid'
      using errcode = '22023';
  end if;
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
      profile - 'townEconomy',
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
      (profile -> 'cityProgress') - 'experienceVersion',
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
      onboarding - 'islandAnnouncementSeenAt',
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
  -- Validate additive fields after retaining the established first-profile errors.
  perform private.assert_learner_profile_envelope(p_envelope);
end;
$$;

revoke execute on function
  private.assert_initial_learner_profile_envelope(jsonb)
  from public, anon, authenticated, service_role;

