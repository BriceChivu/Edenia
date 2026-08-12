-- Store only the derived, owner-scoped facts needed to decide whether a
-- reminder could be useful. Local study history remains browser-only.
create table public.reminder_eligibility_snapshots (
  user_id uuid primary key,
  timezone text not null,
  locale text not null,
  learning_language text,
  study_date date not null,
  points_today integer not null,
  last_qualified_study_date date,
  current_streak_days integer not null,
  updated_at timestamptz not null default now(),
  constraint reminder_eligibility_snapshots_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint reminder_eligibility_snapshots_timezone_check check (
    length(timezone) between 1 and 100
    and timezone ~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+)$'
  ),
  constraint reminder_eligibility_snapshots_locale_check check (
    locale in ('en', 'zh-Hant', 'zh-Hans', 'es', 'fr')
  ),
  constraint reminder_eligibility_snapshots_language_check check (
    learning_language is null
    or learning_language in (
      'mandarin', 'japanese', 'korean', 'spanish',
      'french', 'german', 'english', 'other'
    )
  ),
  constraint reminder_eligibility_snapshots_points_check check (
    points_today between 0 and 100000
  ),
  constraint reminder_eligibility_snapshots_streak_check check (
    current_streak_days between 0 and 10000
  ),
  constraint reminder_eligibility_snapshots_dates_check check (
    last_qualified_study_date is null
    or last_qualified_study_date <= study_date
  )
);

create table public.reminder_channel_follows (
  user_id uuid not null,
  channel_id text not null,
  channel_name text not null,
  latest_video_id text,
  latest_video_title text,
  latest_video_published_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint reminder_channel_follows_pkey primary key (user_id, channel_id),
  constraint reminder_channel_follows_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint reminder_channel_follows_channel_id_check check (
    channel_id ~ '^UC[A-Za-z0-9_-]{20,}$'
  ),
  constraint reminder_channel_follows_channel_name_check check (
    length(channel_name) between 1 and 200
  ),
  constraint reminder_channel_follows_video_check check (
    (
      latest_video_id is null
      and latest_video_title is null
      and latest_video_published_at is null
    )
    or (
      latest_video_id ~ '^[A-Za-z0-9_-]{11}$'
      and length(latest_video_title) between 1 and 300
      and latest_video_published_at is not null
    )
  )
);

comment on table public.reminder_eligibility_snapshots is
  'Owner-scoped, derived study facts used by the server to evaluate reminder eligibility.';
comment on table public.reminder_channel_follows is
  'Owner-scoped followed channels and one bounded unwatched-video candidate per channel.';
comment on column public.reminder_eligibility_snapshots.points_today is
  'The integer points shown for the browser local day at the latest account sync.';
comment on column public.reminder_eligibility_snapshots.last_qualified_study_date is
  'The latest browser-local day that reached Edenia''s five-point streak threshold.';

create index reminder_eligibility_language_updated_idx
  on public.reminder_eligibility_snapshots (learning_language, updated_at desc);
create index reminder_eligibility_last_qualified_idx
  on public.reminder_eligibility_snapshots (last_qualified_study_date);
create index reminder_channel_follows_channel_owner_idx
  on public.reminder_channel_follows (channel_id, user_id);

alter table public.reminder_eligibility_snapshots enable row level security;
alter table public.reminder_channel_follows enable row level security;

revoke all on table public.reminder_eligibility_snapshots
  from public, anon, authenticated, service_role;
revoke all on table public.reminder_channel_follows
  from public, anon, authenticated, service_role;
grant select on table public.reminder_eligibility_snapshots to authenticated;
grant select on table public.reminder_channel_follows to authenticated;
grant select, insert, update, delete on table public.reminder_eligibility_snapshots
  to service_role;
grant select, insert, update, delete on table public.reminder_channel_follows
  to service_role;

create policy "Users can view their own reminder eligibility snapshot"
  on public.reminder_eligibility_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own reminder channel follows"
  on public.reminder_channel_follows
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.sync_my_reminder_eligibility_snapshot(payload jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  synced_at timestamptz := statement_timestamp();
  snapshot_timezone text;
  snapshot_locale text;
  snapshot_language text;
  snapshot_study_date date;
  snapshot_points integer;
  snapshot_last_qualified date;
  snapshot_streak_days integer;
  server_local_date date;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Snapshot payload must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(payload) as supplied(key)
    where supplied.key not in (
      'timezone', 'locale', 'learningLanguage', 'studyDate',
      'pointsToday', 'lastQualifiedStudyDate', 'currentStreakDays', 'channels'
    )
  ) then
    raise exception 'Snapshot payload contains an unsupported field'
      using errcode = '22023';
  end if;

  snapshot_timezone := nullif(btrim(payload ->> 'timezone'), '');
  snapshot_locale := nullif(btrim(payload ->> 'locale'), '');
  snapshot_language := nullif(btrim(payload ->> 'learningLanguage'), '');

  if snapshot_timezone is null
    or length(snapshot_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = snapshot_timezone
    ) then
    raise exception 'Snapshot timezone is invalid' using errcode = '22023';
  end if;
  if snapshot_locale not in ('en', 'zh-Hant', 'zh-Hans', 'es', 'fr') then
    raise exception 'Snapshot locale is invalid' using errcode = '22023';
  end if;
  if snapshot_language is not null and snapshot_language not in (
    'mandarin', 'japanese', 'korean', 'spanish',
    'french', 'german', 'english', 'other'
  ) then
    raise exception 'Snapshot learning language is invalid' using errcode = '22023';
  end if;
  if coalesce(payload ->> 'studyDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Snapshot study date is invalid' using errcode = '22023';
  end if;
  snapshot_study_date := (payload ->> 'studyDate')::date;
  server_local_date := (synced_at at time zone snapshot_timezone)::date;
  if abs(snapshot_study_date - server_local_date) > 1 then
    raise exception 'Snapshot study date is outside the accepted clock boundary'
      using errcode = '22023';
  end if;

  if jsonb_typeof(payload -> 'pointsToday') is distinct from 'number'
    or coalesce(payload ->> 'pointsToday', '') !~ '^\d+$' then
    raise exception 'Snapshot points are invalid' using errcode = '22023';
  end if;
  snapshot_points := (payload ->> 'pointsToday')::integer;
  if snapshot_points not between 0 and 100000 then
    raise exception 'Snapshot points are outside the accepted range'
      using errcode = '22023';
  end if;

  if jsonb_typeof(payload -> 'currentStreakDays') is distinct from 'number'
    or coalesce(payload ->> 'currentStreakDays', '') !~ '^\d+$' then
    raise exception 'Snapshot streak is invalid' using errcode = '22023';
  end if;
  snapshot_streak_days := (payload ->> 'currentStreakDays')::integer;
  if snapshot_streak_days not between 0 and 10000 then
    raise exception 'Snapshot streak is outside the accepted range'
      using errcode = '22023';
  end if;

  if payload ->> 'lastQualifiedStudyDate' is not null then
    if (payload ->> 'lastQualifiedStudyDate') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Snapshot last qualified date is invalid'
        using errcode = '22023';
    end if;
    snapshot_last_qualified := (payload ->> 'lastQualifiedStudyDate')::date;
    if snapshot_last_qualified > snapshot_study_date then
      raise exception 'Snapshot last qualified date cannot be in the future'
        using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(payload -> 'channels') is distinct from 'array'
    or jsonb_array_length(payload -> 'channels') > 250 then
    raise exception 'Snapshot channels are invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload -> 'channels') as channel(value)
    where jsonb_typeof(channel.value) is distinct from 'object'
      or coalesce(channel.value ->> 'channelId', '') !~ '^UC[A-Za-z0-9_-]{20,}$'
      or length(coalesce(nullif(btrim(channel.value ->> 'channelName'), ''), '')) not between 1 and 200
      or (
        nullif(channel.value ->> 'latestVideoId', '') is null
        and (
          nullif(channel.value ->> 'latestVideoTitle', '') is not null
          or nullif(channel.value ->> 'latestVideoPublishedAt', '') is not null
        )
      )
      or (
        nullif(channel.value ->> 'latestVideoId', '') is not null
        and (
          (channel.value ->> 'latestVideoId') !~ '^[A-Za-z0-9_-]{11}$'
          or length(coalesce(nullif(btrim(channel.value ->> 'latestVideoTitle'), ''), '')) not between 1 and 300
          or nullif(channel.value ->> 'latestVideoPublishedAt', '') is null
        )
      )
  ) then
    raise exception 'Snapshot contains an invalid channel' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload -> 'channels') as channel(value)
    group by channel.value ->> 'channelId'
    having count(*) > 1
  ) then
    raise exception 'Snapshot contains duplicate channels' using errcode = '22023';
  end if;

  insert into public.reminder_eligibility_snapshots (
    user_id,
    timezone,
    locale,
    learning_language,
    study_date,
    points_today,
    last_qualified_study_date,
    current_streak_days,
    updated_at
  ) values (
    owner_id,
    snapshot_timezone,
    snapshot_locale,
    snapshot_language,
    snapshot_study_date,
    snapshot_points,
    snapshot_last_qualified,
    snapshot_streak_days,
    synced_at
  )
  on conflict (user_id) do update
  set timezone = excluded.timezone,
      locale = excluded.locale,
      learning_language = excluded.learning_language,
      study_date = excluded.study_date,
      points_today = excluded.points_today,
      last_qualified_study_date = excluded.last_qualified_study_date,
      current_streak_days = excluded.current_streak_days,
      updated_at = excluded.updated_at;

  delete from public.reminder_channel_follows
  where user_id = owner_id;

  insert into public.reminder_channel_follows (
    user_id,
    channel_id,
    channel_name,
    latest_video_id,
    latest_video_title,
    latest_video_published_at,
    updated_at
  )
  select
    owner_id,
    channel.value ->> 'channelId',
    btrim(channel.value ->> 'channelName'),
    nullif(channel.value ->> 'latestVideoId', ''),
    nullif(btrim(channel.value ->> 'latestVideoTitle'), ''),
    nullif(channel.value ->> 'latestVideoPublishedAt', '')::timestamptz,
    synced_at
  from jsonb_array_elements(payload -> 'channels') as channel(value);

  return synced_at;
end;
$$;

revoke all on function public.sync_my_reminder_eligibility_snapshot(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_my_reminder_eligibility_snapshot(jsonb)
  to authenticated;

comment on function public.sync_my_reminder_eligibility_snapshot(jsonb) is
  'Atomically replaces the authenticated owner''s derived reminder eligibility snapshot; ownership is never accepted from the caller.';
