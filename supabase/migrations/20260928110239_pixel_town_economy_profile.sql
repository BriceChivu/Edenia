-- Optional additive field: old profiles and their integrity hashes remain valid.
-- Older clients reject this unknown field rather than silently reading half a wallet.
alter function private.learner_profile_envelope_schema()
  rename to learner_profile_envelope_schema_without_town_economy;

create function private.learner_profile_envelope_schema()
returns json
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_set(
    private.learner_profile_envelope_schema_without_town_economy()::jsonb,
    '{definitions,profile,properties,townEconomy}',
    '{
      "type":"object", "additionalProperties":false,
      "required":["version","mode","rewards","purchases"],
      "properties":{
        "version":{"const":1},
        "mode":{"enum":["starter","legacy"]},
        "rewards":{
          "type":"object", "propertyNames":{"pattern":"^video:"},
          "additionalProperties":{
            "type":"object", "additionalProperties":false,
            "required":["baseline","seconds"],
            "properties":{
              "baseline":{"type":"integer","minimum":0,"maximum":9007199254740991},
              "seconds":{"type":"integer","minimum":0,"maximum":9007199254740991}
            }
          }
        },
        "purchases":{
          "type":"object", "additionalProperties":false,
          "properties":{"garden-flower-1":{"enum":[0,15]}}
        }
      }
    }'::jsonb
  )::json;
$$;
revoke execute on function private.learner_profile_envelope_schema()
  from public, anon, authenticated, service_role;

-- Preserve all first-profile checks and hashes; permit only the empty optional economy.
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

-- Existing canonical and integrity checks retained, with economy semantics added.
create or replace function private.assert_learner_profile_envelope(
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
  integrity jsonb := p_envelope -> 'integrity';
  canonical_envelope text;
  canonical_payload text;
  expected_digest text;
  claimed_bytes integer;
  economy jsonb := profile -> 'townEconomy';
  earned_seconds numeric;
  spent_coins numeric;
begin
  if not extensions.jsonb_matches_schema(
    private.learner_profile_envelope_schema(),
    p_envelope
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  -- Keep cloud acceptance identical to the portable client economy invariants.
  if economy is not null then
    if exists (
      select 1 from pg_catalog.jsonb_each(economy -> 'rewards') as reward(key, value)
      where (reward.value ->> 'seconds')::numeric < (reward.value ->> 'baseline')::numeric
    ) or (
      economy ->> 'mode' = 'starter'
      and economy #>> '{purchases,garden-flower-1}' = '0'
    ) then
      raise exception 'Learner profile economy is invalid' using errcode = '22023';
    end if;
    select coalesce(sum((value ->> 'seconds')::numeric - (value ->> 'baseline')::numeric), 0)
      into earned_seconds from pg_catalog.jsonb_each(economy -> 'rewards');
    select coalesce(sum(value::numeric), 0)
      into spent_coins from pg_catalog.jsonb_each_text(economy -> 'purchases');
    if earned_seconds > 9007199254740991 or floor(earned_seconds / 40) < spent_coins then
      raise exception 'Learner profile economy is invalid' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      profile -> 'activityLog'
    ) as activity(entry)
    group by activity.entry ->> 'id'
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      profile #> '{config,channels}'
    ) as channel(entry)
    group by channel.entry ->> 'id'
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
    where video.key <> video.value ->> 'id'
  ) or exists (
    select 1
    from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
    cross join lateral pg_catalog.jsonb_array_elements(
      video.value -> 'watchProgress'
    ) as progress(entry)
    group by video.key, progress.entry ->> 'id'
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  if not private.is_sorted_profile_string_set(
    profile #> '{learnerProfile,languages}'
  ) or not private.is_sorted_profile_string_set(
    profile #> '{learnerProfile,selectedChannelCatalogIds}'
  ) or not private.is_sorted_profile_string_set(
    profile #> '{config,removedChannelIds}'
  ) or not private.is_sorted_profile_string_set(
    profile #> '{config,removedDefaultChannelIds}'
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select
        channel.entry ->> 'id' as current_id,
        pg_catalog.lag(channel.entry ->> 'id') over (
          order by channel.ordinality
        ) as previous_id
      from pg_catalog.jsonb_array_elements(
        profile #> '{config,channels}'
      ) with ordinality as channel(entry, ordinality)
    ) as ordered_channels
    where ordered_channels.previous_id collate "C"
      > ordered_channels.current_id collate "C"
  ) or exists (
    select 1
    from (
      select
        activity.entry ->> 'createdAt' as current_created_at,
        activity.entry ->> 'id' as current_id,
        pg_catalog.lag(activity.entry ->> 'createdAt') over (
          order by activity.ordinality
        ) as previous_created_at,
        pg_catalog.lag(activity.entry ->> 'id') over (
          order by activity.ordinality
        ) as previous_id
      from pg_catalog.jsonb_array_elements(
        profile -> 'activityLog'
      ) with ordinality as activity(entry, ordinality)
    ) as ordered_activity
    where ordered_activity.previous_created_at
        < ordered_activity.current_created_at
      or (
        ordered_activity.previous_created_at
          = ordered_activity.current_created_at
        and ordered_activity.previous_id collate "C"
          > ordered_activity.current_id collate "C"
      )
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select p_envelope ->> 'exportedAt' as value
      union all
      select activity.entry ->> 'createdAt'
      from pg_catalog.jsonb_array_elements(
        profile -> 'activityLog'
      ) as activity(entry)
      union all
      select anki.value ->> 'observedAt'
      from pg_catalog.jsonb_each(profile -> 'anki') as anki(key, value)
      union all
      select profile #>> '{learnerProfile,createdAt}'
      union all
      select profile #>> '{learnerProfile,updatedAt}'
      union all
      select profile #>> '{noAnkiFrequentUserPrompt,respondedAt}'
      union all
      select profile #>> '{onboarding,introSeenAt}'
      union all
      select profile #>> '{onboarding,levelUpGuidanceShownAt}'
      union all
      select profile #>> '{onboarding,recommendationsAppliedAt}'
      union all
      select profile #>> '{onboarding,setupCompletedAt}'
      union all
      select profile #>> '{onboarding,walkthroughCompletedAt}'
      union all
      select video.value ->> 'hiddenFromGridAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'pausedAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'publishedAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'removedFromFeedAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'watchedAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'watchedConfirmationUnlockedAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select progress.entry ->> 'watchedAt'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      cross join lateral pg_catalog.jsonb_array_elements(
        video.value -> 'watchProgress'
      ) as progress(entry)
    ) as timestamps
    where timestamps.value is not null
      and not private.is_canonical_profile_timestamp(timestamps.value)
  ) or exists (
    select 1
    from (
      select anki.key as value
      from pg_catalog.jsonb_each(profile -> 'anki') as anki(key, value)
      union all
      select progress.entry ->> 'studyDay'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      cross join lateral pg_catalog.jsonb_array_elements(
        video.value -> 'watchProgress'
      ) as progress(entry)
    ) as date_keys
    where not private.is_canonical_profile_date_key(date_keys.value)
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select item.value
      from pg_catalog.jsonb_array_elements_text(
        profile #> '{learnerProfile,languages}'
      ) as item(value)
      union all
      select item.value
      from pg_catalog.jsonb_array_elements_text(
        profile #> '{learnerProfile,selectedChannelCatalogIds}'
      ) as item(value)
      union all
      select item.value
      from pg_catalog.jsonb_array_elements_text(
        profile #> '{config,channelShelfOrder}'
      ) as item(value)
      union all
      select item.value
      from pg_catalog.jsonb_array_elements_text(
        profile #> '{config,removedChannelIds}'
      ) as item(value)
      union all
      select item.value
      from pg_catalog.jsonb_array_elements_text(
        profile #> '{config,removedDefaultChannelIds}'
      ) as item(value)
      union all
      select activity.entry ->> 'id'
      from pg_catalog.jsonb_array_elements(
        profile -> 'activityLog'
      ) as activity(entry)
      union all
      select activity.entry ->> 'type'
      from pg_catalog.jsonb_array_elements(
        profile -> 'activityLog'
      ) as activity(entry)
      union all
      select meta.value
      from pg_catalog.jsonb_array_elements(
        profile -> 'activityLog'
      ) as activity(entry)
      cross join lateral pg_catalog.jsonb_each_text(
        coalesce(activity.entry -> 'meta', '{}'::jsonb)
      ) as meta(key, value)
      where meta.key in ('channelId', 'operation', 'status', 'videoId')
      union all
      select channel.entry ->> 'id'
      from pg_catalog.jsonb_array_elements(
        profile #> '{config,channels}'
      ) as channel(entry)
      union all
      select channel.entry ->> 'catalogId'
      from pg_catalog.jsonb_array_elements(
        profile #> '{config,channels}'
      ) as channel(entry)
      union all
      select format.key
      from pg_catalog.jsonb_each(
        profile #> '{config,channelVideoFormats}'
      ) as format(key, value)
      union all
      select profile #>> '{learnerProfile,level}'
      union all
      select video.value ->> 'channelId'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'id'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      union all
      select video.value ->> 'source'
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
    ) as identifiers
    where identifiers.value is not null
      and not private.is_canonical_profile_identifier(identifiers.value)
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
    where (
      not (video.value ->> 'hiddenFromGrid')::boolean
      and video.value ->> 'hiddenFromGridAt' is not null
    ) or (
      video.value ->> 'resumeAtSeconds' is null
      and video.value ->> 'pausedAt' is not null
    ) or (
      (video.value ->> 'duration')::integer > 0
      and (video.value ->> 'resumeAtSeconds')::integer
        >= (video.value ->> 'duration')::integer
    ) or (
      video.value ->> 'status' = 'watch-later'
      and not (video.value ->> 'watchLater')::boolean
    )
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select
        video.key as video_id,
        (video.value ->> 'duration')::integer as duration,
        progress.ordinality,
        progress.entry,
        pg_catalog.lag(progress.entry ->> 'watchedAt') over (
          partition by video.key order by progress.ordinality
        ) as previous_watched_at,
        pg_catalog.lag(progress.entry ->> 'studyDay') over (
          partition by video.key order by progress.ordinality
        ) as previous_study_day,
        pg_catalog.lag((progress.entry ->> 'seconds')::integer) over (
          partition by video.key order by progress.ordinality
        ) as previous_seconds
      from pg_catalog.jsonb_each(profile -> 'videos') as video(key, value)
      cross join lateral pg_catalog.jsonb_array_elements(
        video.value -> 'watchProgress'
      ) with ordinality as progress(entry, ordinality)
    ) as ordered_progress
    where (
      ordered_progress.duration > 0
      and (ordered_progress.entry ->> 'seconds')::integer
        > ordered_progress.duration
    ) or ordered_progress.entry ->> 'id' <> (
      'video:'
      || private.encode_profile_uri_component(ordered_progress.video_id)
      || ':' || (ordered_progress.entry ->> 'watchedAt')
      || ':' || (ordered_progress.entry ->> 'seconds')
      || ':' || ordered_progress.ordinality
    ) or ordered_progress.previous_watched_at
      > ordered_progress.entry ->> 'watchedAt'
    or (
      ordered_progress.previous_watched_at
        = ordered_progress.entry ->> 'watchedAt'
      and ordered_progress.previous_study_day
        > ordered_progress.entry ->> 'studyDay'
    ) or (
      ordered_progress.previous_watched_at
        = ordered_progress.entry ->> 'watchedAt'
      and ordered_progress.previous_study_day
        = ordered_progress.entry ->> 'studyDay'
      and ordered_progress.previous_seconds
        > (ordered_progress.entry ->> 'seconds')::integer
    )
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
  end if;

  claimed_bytes := (integrity ->> 'byteLength')::integer;
  canonical_envelope := private.canonical_jsonb_text(p_envelope);
  if claimed_bytes not between 1 and 2097152
    or pg_catalog.octet_length(
      pg_catalog.convert_to(canonical_envelope, 'UTF8')
    ) <> claimed_bytes
  then
    raise exception 'Learner profile byte length is invalid'
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
    raise exception 'Learner profile integrity is invalid'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.assert_learner_profile_envelope(jsonb)
  from public, anon, authenticated, service_role;
