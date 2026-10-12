-- Keep every schema, ordering, provenance and integrity check intact while
-- reusing one canonical profile traversal for byte length and payload digest.
CREATE OR REPLACE FUNCTION private.assert_learner_profile_envelope_before_current_experience(p_envelope jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  profile jsonb := p_envelope -> 'profile';
  integrity jsonb := p_envelope -> 'integrity';
  canonical_envelope text;
  canonical_payload text;
  canonical_profile text;
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
  -- Serialize the large profile once. The verified envelope schema has exactly
  -- these root fields; their order is the canonical C-collation key order.
  canonical_profile := private.canonical_jsonb_text(profile);
  canonical_payload := '{"exportedAt":' || (p_envelope -> 'exportedAt')::text
    || ',"profile":' || canonical_profile
    || ',"schema":' || (p_envelope -> 'schema')::text
    || ',"version":' || (p_envelope -> 'version')::text || '}';
  canonical_envelope := '{"exportedAt":' || (p_envelope -> 'exportedAt')::text
    || ',"integrity":' || private.canonical_jsonb_text(integrity)
    || ',"profile":' || canonical_profile
    || ',"schema":' || (p_envelope -> 'schema')::text
    || ',"version":' || (p_envelope -> 'version')::text || '}';
  if claimed_bytes not between 1 and 2097152
    or pg_catalog.octet_length(
      pg_catalog.convert_to(canonical_envelope, 'UTF8')
    ) <> claimed_bytes
  then
    raise exception 'Learner profile byte length is invalid'
      using errcode = '22023';
  end if;

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
$function$;

revoke execute on function private.assert_learner_profile_envelope_before_current_experience(jsonb)
  from public, anon, authenticated, service_role;

