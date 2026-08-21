-- Accept one owner-derived, idempotent learner-profile revision at a time.
create extension if not exists pg_jsonschema with schema extensions;

create table public.learner_profile_write_receipts (
  user_id uuid not null,
  operation_id uuid not null,
  request_sha256 text not null,
  profile_id uuid not null,
  generation bigint not null,
  base_revision bigint not null,
  accepted_revision bigint not null,
  result_sha256 text not null,
  accepted_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, operation_id),
  constraint learner_profile_write_receipts_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint learner_profile_write_receipts_revision_check check (
    generation >= 1
    and base_revision >= 1
    and accepted_revision = base_revision + 1
  ),
  constraint learner_profile_write_receipts_request_digest_check check (
    request_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint learner_profile_write_receipts_result_digest_check check (
    result_sha256 ~ '^[A-Za-z0-9_-]{43}$'
  )
);

comment on table public.learner_profile_write_receipts is
  'Bounded owner-scoped receipts for exact learner-profile commit retries.';

create index learner_profile_write_receipts_owner_accepted_idx
  on public.learner_profile_write_receipts (
    user_id,
    accepted_at desc,
    operation_id desc
  );

alter table public.learner_profile_write_receipts enable row level security;

revoke all on table public.learner_profile_write_receipts
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.learner_profile_write_receipts
  to service_role;

create or replace function private.learner_profile_envelope_schema()
returns json
language sql
immutable
security invoker
set search_path = ''
as $$
  select $schema$
  {
    "type": "object",
    "required": ["exportedAt", "integrity", "profile", "schema", "version"],
    "additionalProperties": false,
    "properties": {
      "exportedAt": { "$ref": "#/definitions/timestamp" },
      "integrity": {
        "type": "object",
        "required": ["algorithm", "byteLength", "payloadSha256"],
        "additionalProperties": false,
        "properties": {
          "algorithm": { "const": "SHA-256" },
          "byteLength": {
            "type": "integer",
            "minimum": 1,
            "maximum": 2097152
          },
          "payloadSha256": {
            "type": "string",
            "pattern": "^[A-Za-z0-9_-]{43}$"
          }
        }
      },
      "profile": { "$ref": "#/definitions/profile" },
      "schema": { "const": "edenia-portable-learner-profile" },
      "version": { "const": 1 }
    },
    "definitions": {
      "timestamp": {
        "type": "string",
        "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"
      },
      "nullableTimestamp": {
        "anyOf": [
          { "$ref": "#/definitions/timestamp" },
          { "type": "null" }
        ]
      },
      "nonEmptyString": {
        "type": "string",
        "minLength": 1
      },
      "nullableNonEmptyString": {
        "anyOf": [
          { "$ref": "#/definitions/nonEmptyString" },
          { "type": "null" }
        ]
      },
      "stringSet": {
        "type": "array",
        "uniqueItems": true,
        "items": { "$ref": "#/definitions/nonEmptyString" }
      },
      "activityMeta": {
        "type": "object",
        "minProperties": 1,
        "additionalProperties": false,
        "properties": {
          "channelId": { "$ref": "#/definitions/nonEmptyString" },
          "fetchedCount": { "type": "number" },
          "levelIndex": { "type": "number" },
          "mergedCount": { "type": "number" },
          "operation": { "$ref": "#/definitions/nonEmptyString" },
          "pointsDelta": { "type": "number" },
          "seconds": { "type": "number" },
          "skippedShorts": { "type": "number" },
          "status": { "$ref": "#/definitions/nonEmptyString" },
          "videoId": { "$ref": "#/definitions/nonEmptyString" }
        }
      },
      "activity": {
        "type": "object",
        "required": ["actor", "createdAt", "detail", "id", "status", "title", "type"],
        "additionalProperties": false,
        "properties": {
          "actor": { "enum": ["auto", "user"] },
          "createdAt": { "$ref": "#/definitions/timestamp" },
          "detail": { "type": "string" },
          "id": { "$ref": "#/definitions/nonEmptyString" },
          "meta": { "$ref": "#/definitions/activityMeta" },
          "status": { "enum": ["success", "warn", "error", "info"] },
          "title": { "type": "string" },
          "type": { "$ref": "#/definitions/nonEmptyString" }
        }
      },
      "ankiDay": {
        "type": "object",
        "required": ["created", "observedAt", "reviewed"],
        "additionalProperties": false,
        "properties": {
          "created": { "type": "integer", "minimum": 0 },
          "observedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "reviewed": { "type": "integer", "minimum": 0 }
        }
      },
      "channel": {
        "type": "object",
        "required": ["catalogId", "id", "imageUrl", "name"],
        "additionalProperties": false,
        "properties": {
          "catalogId": { "$ref": "#/definitions/nullableNonEmptyString" },
          "id": { "$ref": "#/definitions/nonEmptyString" },
          "imageUrl": { "type": "string" },
          "name": { "type": "string" }
        }
      },
      "config": {
        "type": "object",
        "required": [
          "ankiEnabled", "channelShelfOrder", "channelVideoFormats",
          "channels", "includeShorts", "locale", "removedChannelIds",
          "removedDefaultChannelIds", "weeklyGoalHours"
        ],
        "additionalProperties": false,
        "properties": {
          "ankiEnabled": { "type": "boolean" },
          "channelShelfOrder": { "$ref": "#/definitions/stringSet" },
          "channelVideoFormats": {
            "type": "object",
            "propertyNames": { "minLength": 1 },
            "additionalProperties": { "enum": ["videos", "shorts"] }
          },
          "channels": {
            "type": "array",
            "uniqueItems": true,
            "items": { "$ref": "#/definitions/channel" }
          },
          "includeShorts": { "type": "boolean" },
          "locale": { "enum": ["en", "zh-Hant", "zh-Hans", "es", "fr"] },
          "removedChannelIds": { "$ref": "#/definitions/stringSet" },
          "removedDefaultChannelIds": { "$ref": "#/definitions/stringSet" },
          "weeklyGoalHours": {
            "type": "integer",
            "minimum": 1,
            "maximum": 99
          }
        }
      },
      "learnerProfile": {
        "type": "object",
        "required": [
          "createdAt", "languages", "level", "selectedChannelCatalogIds",
          "updatedAt"
        ],
        "additionalProperties": false,
        "properties": {
          "createdAt": { "$ref": "#/definitions/nullableTimestamp" },
          "languages": { "$ref": "#/definitions/stringSet" },
          "level": { "$ref": "#/definitions/nullableNonEmptyString" },
          "selectedChannelCatalogIds": { "$ref": "#/definitions/stringSet" },
          "updatedAt": { "$ref": "#/definitions/nullableTimestamp" }
        }
      },
      "noAnkiPrompt": {
        "type": "object",
        "required": ["respondedAt", "response"],
        "additionalProperties": false,
        "properties": {
          "respondedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "response": {
            "anyOf": [
              { "enum": ["yes", "not-interested"] },
              { "type": "null" }
            ]
          }
        }
      },
      "onboarding": {
        "type": "object",
        "required": [
          "introSeenAt", "levelUpGuidanceShownAt",
          "recommendationsAppliedAt", "setupCompleted", "setupCompletedAt",
          "walkthroughCompleted", "walkthroughCompletedAt"
        ],
        "additionalProperties": false,
        "properties": {
          "introSeenAt": { "$ref": "#/definitions/nullableTimestamp" },
          "levelUpGuidanceShownAt": { "$ref": "#/definitions/nullableTimestamp" },
          "recommendationsAppliedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "setupCompleted": { "type": "boolean" },
          "setupCompletedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "walkthroughCompleted": { "type": "boolean" },
          "walkthroughCompletedAt": { "$ref": "#/definitions/nullableTimestamp" }
        },
        "allOf": [
          {
            "if": { "properties": { "setupCompleted": { "const": false } } },
            "then": { "properties": { "setupCompletedAt": { "type": "null" } } }
          },
          {
            "if": { "properties": { "walkthroughCompleted": { "const": false } } },
            "then": { "properties": { "walkthroughCompletedAt": { "type": "null" } } }
          }
        ]
      },
      "watchProgress": {
        "type": "object",
        "required": ["id", "seconds", "studyDay", "watchedAt"],
        "additionalProperties": false,
        "properties": {
          "id": { "$ref": "#/definitions/nonEmptyString" },
          "seconds": { "type": "integer", "minimum": 1 },
          "studyDay": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
          },
          "watchedAt": { "$ref": "#/definitions/timestamp" }
        }
      },
      "video": {
        "type": "object",
        "required": [
          "aspectRatio", "channelId", "channelImageUrl", "channelTitle",
          "duration", "favorite", "hiddenFromGrid", "hiddenFromGridAt", "id",
          "isShort", "manuallyAdded", "pausedAt", "publishedAt",
          "removedFromFeedAt", "resumeAtSeconds", "source", "status",
          "thumbnail", "title", "watchLater", "watchProgress",
          "watchProgressTracked", "watchedAt", "watchedConfirmationUnlockedAt"
        ],
        "additionalProperties": false,
        "properties": {
          "aspectRatio": {
            "anyOf": [
              { "type": "number", "exclusiveMinimum": 0 },
              { "type": "null" }
            ]
          },
          "channelId": { "$ref": "#/definitions/nullableNonEmptyString" },
          "channelImageUrl": { "type": "string" },
          "channelTitle": { "type": "string" },
          "duration": { "type": "integer", "minimum": 0 },
          "favorite": { "type": "boolean" },
          "hiddenFromGrid": { "type": "boolean" },
          "hiddenFromGridAt": { "$ref": "#/definitions/nullableTimestamp" },
          "id": { "$ref": "#/definitions/nonEmptyString" },
          "isShort": { "type": "boolean" },
          "manuallyAdded": { "type": "boolean" },
          "pausedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "publishedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "removedFromFeedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "resumeAtSeconds": {
            "anyOf": [
              { "type": "integer", "minimum": 0 },
              { "type": "null" }
            ]
          },
          "source": { "$ref": "#/definitions/nullableNonEmptyString" },
          "status": { "enum": ["watch-later", "unwatched", "partial", "watched"] },
          "thumbnail": { "type": "string" },
          "title": { "type": "string" },
          "watchLater": { "type": "boolean" },
          "watchProgress": {
            "type": "array",
            "uniqueItems": true,
            "items": { "$ref": "#/definitions/watchProgress" }
          },
          "watchProgressTracked": { "const": true },
          "watchedAt": { "$ref": "#/definitions/nullableTimestamp" },
          "watchedConfirmationUnlockedAt": { "$ref": "#/definitions/nullableTimestamp" }
        },
        "anyOf": [
          { "properties": { "status": { "enum": ["watch-later", "partial", "watched"] } } },
          { "properties": { "favorite": { "const": true } } },
          { "properties": { "watchLater": { "const": true } } },
          { "properties": { "removedFromFeedAt": { "$ref": "#/definitions/timestamp" } } },
          { "properties": { "resumeAtSeconds": { "type": "integer" } } },
          { "properties": { "watchProgress": { "minItems": 1 } } },
          { "properties": { "manuallyAdded": { "const": true } } },
          { "properties": { "hiddenFromGrid": { "const": true } } },
          { "properties": { "watchedConfirmationUnlockedAt": { "$ref": "#/definitions/timestamp" } } }
        ]
      },
      "profile": {
        "type": "object",
        "required": [
          "activityLog", "anki", "cityProgress", "config", "learnerProfile",
          "noAnkiFrequentUserPrompt", "onboarding", "videos"
        ],
        "additionalProperties": false,
        "properties": {
          "activityLog": {
            "type": "array",
            "maxItems": 500,
            "items": { "$ref": "#/definitions/activity" }
          },
          "anki": {
            "type": "object",
            "propertyNames": {
              "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
            },
            "additionalProperties": { "$ref": "#/definitions/ankiDay" }
          },
          "cityProgress": {
            "type": "object",
            "required": ["maxLevelIndex"],
            "additionalProperties": false,
            "properties": {
              "maxLevelIndex": { "type": "integer", "minimum": 0 }
            }
          },
          "config": { "$ref": "#/definitions/config" },
          "learnerProfile": { "$ref": "#/definitions/learnerProfile" },
          "noAnkiFrequentUserPrompt": { "$ref": "#/definitions/noAnkiPrompt" },
          "onboarding": { "$ref": "#/definitions/onboarding" },
          "videos": {
            "type": "object",
            "propertyNames": { "minLength": 1 },
            "additionalProperties": { "$ref": "#/definitions/video" }
          }
        }
      }
    }
  }
  $schema$::json;
$$;

revoke execute on function private.learner_profile_envelope_schema()
  from public, anon, authenticated, service_role;

create or replace function private.is_canonical_profile_timestamp(
  p_value text
)
returns boolean
language plpgsql
stable
strict
security invoker
set search_path = ''
as $$
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    return false;
  end if;
  return pg_catalog.to_char(
    p_value::pg_catalog.timestamptz at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) = p_value;
exception
  when others then
    return false;
end;
$$;

create or replace function private.is_canonical_profile_date_key(
  p_value text
)
returns boolean
language plpgsql
stable
strict
security invoker
set search_path = ''
as $$
begin
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  return pg_catalog.to_char(p_value::pg_catalog.date, 'YYYY-MM-DD') = p_value;
exception
  when others then
    return false;
end;
$$;

create or replace function private.is_canonical_profile_identifier(
  p_value text
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_value <> '' and p_value = pg_catalog.btrim(p_value);
$$;

create or replace function private.is_sorted_profile_string_set(
  p_value jsonb
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_value = coalesce(
    (
      select pg_catalog.jsonb_agg(item.value order by item.value collate "C")
      from pg_catalog.jsonb_array_elements_text(p_value) as item(value)
    ),
    '[]'::jsonb
  );
$$;

create or replace function private.encode_profile_uri_component(
  p_value text
)
returns text
language plpgsql
stable
strict
security invoker
set search_path = ''
as $$
declare
  bytes bytea := pg_catalog.convert_to(p_value, 'UTF8');
  current_byte integer;
  result text := '';
begin
  for byte_index in 0..pg_catalog.length(bytes) - 1 loop
    current_byte := pg_catalog.get_byte(bytes, byte_index);
    if (current_byte between 48 and 57)
      or (current_byte between 65 and 90)
      or (current_byte between 97 and 122)
      or current_byte in (33, 39, 40, 41, 42, 45, 46, 95, 126)
    then
      result := result || pg_catalog.chr(current_byte);
    else
      result := result || '%' || pg_catalog.upper(
        pg_catalog.lpad(pg_catalog.to_hex(current_byte), 2, '0')
      );
    end if;
  end loop;
  return result;
end;
$$;

revoke execute on function private.is_canonical_profile_timestamp(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_canonical_profile_date_key(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_canonical_profile_identifier(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_sorted_profile_string_set(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.encode_profile_uri_component(text)
  from public, anon, authenticated, service_role;

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
begin
  if not extensions.jsonb_matches_schema(
    private.learner_profile_envelope_schema(),
    p_envelope
  ) then
    raise exception 'Learner profile envelope is invalid'
      using errcode = '22023';
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

create or replace function learner_profile_rpc.commit_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint,
  payload_sha256 text
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
  prior_receipt public.learner_profile_write_receipts%rowtype;
  new_version_id uuid;
  request_digest text;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operation_id is null
    or p_profile_id is null
    or p_generation is null
    or p_generation < 1
    or p_base_revision is null
    or p_base_revision < 1
  then
    raise exception 'Learner profile commit identity is invalid'
      using errcode = '22023';
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
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      null::text;
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
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      null::text;
    return;
  end if;

  perform private.assert_learner_profile_envelope(p_envelope);
  request_digest := pg_catalog.rtrim(pg_catalog.translate(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          private.canonical_jsonb_text(pg_catalog.jsonb_build_object(
            'baseRevision', p_base_revision,
            'envelope', p_envelope,
            'generation', p_generation,
            'operationId', p_operation_id,
            'ownerId', owner_id,
            'profileId', p_profile_id
          )),
          'UTF8'
        ),
        'sha256'
      ),
      'base64'
    ),
    '+/',
    '-_'
  ), '=');

  select receipt.* into prior_receipt
  from public.learner_profile_write_receipts as receipt
  where receipt.user_id = owner_id
    and receipt.operation_id = p_operation_id;
  if found then
    if prior_receipt.request_sha256 <> request_digest then
      raise exception 'Learner profile operation identity was reused'
        using errcode = '22023';
    end if;
    return query select
      'already_accepted'::text,
      prior_receipt.profile_id,
      prior_receipt.generation,
      prior_receipt.accepted_revision,
      prior_receipt.base_revision,
      prior_receipt.result_sha256;
    return;
  end if;

  select head.* into current_head
  from public.learner_profile_heads as head
  where head.user_id = owner_id;
  if not found then
    return query select
      'recovery_required'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      p_base_revision,
      null::text;
    return;
  end if;

  if current_head.profile_id is distinct from p_profile_id
    or current_head.generation is distinct from p_generation
    or current_head.revision is distinct from p_base_revision
  then
    return query select
      'conflict'::text,
      current_head.profile_id,
      current_head.generation,
      current_head.revision,
      p_base_revision,
      (
        select version.payload_sha256
        from public.learner_profile_versions as version
        where version.id = current_head.current_version_id
          and version.user_id = owner_id
          and version.profile_id = current_head.profile_id
      );
    return;
  end if;

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
    p_profile_id,
    p_generation,
    p_base_revision + 1,
    p_base_revision,
    p_envelope,
    p_envelope #>> '{integrity,payloadSha256}',
    (p_envelope #>> '{integrity,byteLength}')::integer
  );

  update public.learner_profile_heads as head
  set revision = p_base_revision + 1,
      current_version_id = new_version_id,
      updated_at = pg_catalog.now()
  where head.user_id = owner_id
    and head.profile_id = p_profile_id
    and head.generation = p_generation
    and head.revision = p_base_revision;
  if not found then
    raise exception 'Learner profile head changed during commit'
      using errcode = '40001';
  end if;

  insert into public.learner_profile_write_receipts (
    user_id,
    operation_id,
    request_sha256,
    profile_id,
    generation,
    base_revision,
    accepted_revision,
    result_sha256
  ) values (
    owner_id,
    p_operation_id,
    request_digest,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_base_revision + 1,
    p_envelope #>> '{integrity,payloadSha256}'
  );

  delete from public.learner_profile_write_receipts as receipt
  where receipt.user_id = owner_id
    and receipt.operation_id in (
      select stale.operation_id
      from public.learner_profile_write_receipts as stale
      where stale.user_id = owner_id
      order by stale.accepted_at desc, stale.operation_id desc
      offset 256
    );

  return query select
    'accepted'::text,
    p_profile_id,
    p_generation,
    p_base_revision + 1,
    p_base_revision,
    p_envelope #>> '{integrity,payloadSha256}';
end;
$$;

revoke execute on function learner_profile_rpc.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function learner_profile_rpc.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) to authenticated;

create or replace function public.commit_my_learner_profile(
  p_operation_id uuid,
  p_profile_id uuid,
  p_generation bigint,
  p_base_revision bigint,
  p_envelope jsonb
)
returns table (
  status text,
  profile_id uuid,
  generation bigint,
  revision bigint,
  base_revision bigint,
  payload_sha256 text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from learner_profile_rpc.commit_my_learner_profile(
    p_operation_id,
    p_profile_id,
    p_generation,
    p_base_revision,
    p_envelope
  );
$$;

revoke execute on function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) to authenticated;

comment on function public.commit_my_learner_profile(
  uuid,
  uuid,
  bigint,
  bigint,
  jsonb
) is
  'Invoker wrapper for one idempotent, owner-derived learner-profile commit.';
