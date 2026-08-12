-- Materialize the two product email types in a dry-run-only path. The existing
-- live claim RPC remains unchanged and cannot claim these rows because browser
-- clients are permanently fenced from the legacy `enabled` schedule flag.
-- No provider call, Cron schedule, recipient email lookup, or live-send path is
-- added by this migration.
create table private.reminder_discovery_channels (
  channel_id text primary key,
  catalog_id text not null unique,
  learning_language text not null,
  channel_name text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  constraint reminder_discovery_channels_channel_id_check check (
    channel_id ~ '^UC[A-Za-z0-9_-]{20,}$'
  ),
  constraint reminder_discovery_channels_catalog_id_check check (
    length(catalog_id) between 1 and 100
    and catalog_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint reminder_discovery_channels_language_check check (
    learning_language in (
      'mandarin', 'japanese', 'korean', 'spanish',
      'french', 'german', 'english'
    )
  ),
  constraint reminder_discovery_channels_name_check check (
    length(channel_name) between 1 and 200
  ),
  constraint reminder_discovery_channels_summary_check check (
    length(summary) between 1 and 300
  )
);

insert into private.reminder_discovery_channels (
  channel_id,
  catalog_id,
  learning_language,
  channel_name,
  summary
) values
  (
    'UCC_fdR7zZ_5SU--xuOrEdKw',
    'mandarin-grace',
    'mandarin',
    'Grace Mandarin Chinese',
    'Practical Mandarin pronunciation, vocabulary, and culture lessons.'
  ),
  (
    'UCu6sZrHyl4hSS2PvlUo2XZA',
    'japanese-shun',
    'japanese',
    'Japanese with Shun',
    'A Japanese podcast with natural, learner-friendly conversations.'
  ),
  (
    'UC5r3WHrX4Z7peSYpDlgktGw',
    'korean-ttmik',
    'korean',
    'Talk To Me In Korean',
    'Korean lessons and conversations for building practical listening skills.'
  ),
  (
    'UCouyFdE9-Lrjo3M_2idKq1A',
    'spanish-dreaming',
    'spanish',
    'Dreaming Spanish',
    'Comprehensible-input videos that teach Spanish through stories and everyday topics.'
  ),
  (
    'UCVzyfpNuFF4ENY8zNTIW7ug',
    'french-piece',
    'french',
    'Piece of French',
    'Casual French conversations and everyday-life videos for natural listening practice.'
  ),
  (
    'UCbxb2fqe9oNgglAoYqsYOtQ',
    'german-easy',
    'german',
    'Easy German',
    'Street interviews and real conversations with German speakers.'
  ),
  (
    'UC2L7vR43LKuBXXV2AentEMw',
    'english-lukes-podcast',
    'english',
    'Luke''s English Podcast',
    'Long-form English conversations and stories for listening practice.'
  );

comment on table private.reminder_discovery_channels is
  'Server-only copy of the reviewed discovery-email allowlist. Changes require a reviewed migration.';

alter table private.reminder_discovery_channels enable row level security;
revoke all on table private.reminder_discovery_channels
  from public, anon, authenticated, service_role;

alter table private.reminder_deliveries
  add column email_type text,
  add column learning_language text,
  add column channel_id text,
  add column channel_name text,
  add column channel_summary text,
  add column video_id text,
  add column video_title text,
  add column video_published_at timestamptz,
  add column eligibility_snapshot_updated_at timestamptz,
  add constraint reminder_deliveries_email_type_check check (
    email_type is null or email_type in ('streak', 'discovery')
  ),
  add constraint reminder_deliveries_learning_language_check check (
    learning_language is null
    or learning_language in (
      'mandarin', 'japanese', 'korean', 'spanish',
      'french', 'german', 'english', 'other'
    )
  ),
  add constraint reminder_deliveries_channel_id_check check (
    channel_id is null or channel_id ~ '^UC[A-Za-z0-9_-]{20,}$'
  ),
  add constraint reminder_deliveries_channel_name_check check (
    channel_name is null or length(channel_name) between 1 and 200
  ),
  add constraint reminder_deliveries_channel_summary_check check (
    channel_summary is null or length(channel_summary) between 1 and 300
  ),
  add constraint reminder_deliveries_video_id_check check (
    video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  add constraint reminder_deliveries_video_title_check check (
    video_title is null or length(video_title) between 1 and 300
  ),
  add constraint reminder_deliveries_typed_payload_check check (
    (
      email_type is null
      and learning_language is null
      and channel_id is null
      and channel_name is null
      and channel_summary is null
      and video_id is null
      and video_title is null
      and video_published_at is null
      and eligibility_snapshot_updated_at is null
    )
    or (
      email_type = 'streak'
      and eligibility_snapshot_updated_at is not null
      and channel_summary is null
      and (
        (
          channel_id is null
          and channel_name is null
          and video_id is null
          and video_title is null
          and video_published_at is null
        )
        or (
          channel_id is not null
          and channel_name is not null
          and video_id is not null
          and video_title is not null
          and video_published_at is not null
        )
      )
    )
    or (
      email_type = 'discovery'
      and learning_language is not null
      and channel_id is not null
      and channel_name is not null
      and channel_summary is not null
      and video_id is not null
      and video_title is not null
      and video_published_at is not null
      and eligibility_snapshot_updated_at is not null
    )
  );

comment on column private.reminder_deliveries.email_type is
  'Frozen product email type. Null identifies the retired schedule-based path.';
comment on column private.reminder_deliveries.eligibility_snapshot_updated_at is
  'Server timestamp of the owner snapshot used to create this occurrence.';
comment on column private.reminder_deliveries.channel_summary is
  'Reviewed discovery copy frozen with the occurrence for retry consistency.';

create index reminder_deliveries_typed_claimable_idx
  on private.reminder_deliveries (scheduled_for, email_type, id)
  where email_type is not null and status in ('pending', 'claimed');
create index reminder_deliveries_user_type_date_idx
  on private.reminder_deliveries (user_id, email_type, scheduled_local_date desc)
  where email_type is not null;

create function private.typed_reminder_delivery_is_current(
  p_delivery_id uuid,
  p_at timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from private.reminder_deliveries as delivery
    join private.reminder_delivery_testers as tester
      on tester.user_id = delivery.user_id
    join public.reminder_preferences as preference
      on preference.user_id = delivery.user_id
    join public.reminder_eligibility_snapshots as snapshot
      on snapshot.user_id = delivery.user_id
    where delivery.id = p_delivery_id
      and delivery.email_type is not null
      and p_at is not null
      and preference.consent_granted_at is not null
      and preference.consent_revoked_at is null
      and preference.consent_version = delivery.consent_version
      and preference.consent_granted_at = delivery.consent_granted_at
      and snapshot.timezone = delivery.timezone
      and snapshot.locale = delivery.locale
      and snapshot.updated_at >= p_at - interval '30 days'
      and snapshot.updated_at = delivery.eligibility_snapshot_updated_at
      and not exists (
        select 1
        from private.reminder_suppressions as suppression
        where suppression.user_id = delivery.user_id
      )
      and (
        (
          delivery.email_type = 'streak'
          and preference.streak_reminders_enabled
          and snapshot.current_streak_days > 0
          and snapshot.last_qualified_study_date
            = delivery.scheduled_local_date - 1
          and snapshot.study_date <= delivery.scheduled_local_date
          and (
            snapshot.study_date < delivery.scheduled_local_date
            or snapshot.points_today < 5
          )
          and (
            delivery.video_id is null
            or exists (
              select 1
              from public.reminder_channel_follows as follow
              where follow.user_id = delivery.user_id
                and follow.channel_id = delivery.channel_id
                and follow.streak_video_id = delivery.video_id
                and follow.streak_video_published_at = delivery.video_published_at
            )
          )
        )
        or (
          delivery.email_type = 'discovery'
          and preference.discovery_emails_enabled
          and snapshot.learning_language = delivery.learning_language
          and exists (
            select 1
            from private.reminder_discovery_channels as reviewed
            where reviewed.channel_id = delivery.channel_id
              and reviewed.learning_language = delivery.learning_language
              and reviewed.channel_name = delivery.channel_name
              and reviewed.summary = delivery.channel_summary
          )
          and not exists (
            select 1
            from public.reminder_channel_follows as owned_follow
            where owned_follow.user_id = delivery.user_id
              and owned_follow.channel_id = delivery.channel_id
          )
          and exists (
            select 1
            from public.reminder_channel_follows as other_follow
            join public.reminder_eligibility_snapshots as other_snapshot
              on other_snapshot.user_id = other_follow.user_id
            where other_follow.user_id <> delivery.user_id
              and other_follow.channel_id = delivery.channel_id
              and other_follow.latest_video_id = delivery.video_id
              and other_follow.latest_video_published_at = delivery.video_published_at
              and other_snapshot.learning_language = delivery.learning_language
              and other_snapshot.updated_at >= p_at - interval '30 days'
          )
          and not exists (
            select 1
            from private.reminder_deliveries as previous
            where previous.user_id = delivery.user_id
              and previous.email_type = 'discovery'
              and previous.id <> delivery.id
              and previous.scheduled_local_date < delivery.scheduled_local_date
              and previous.scheduled_local_date
                > delivery.scheduled_local_date - 3
          )
        )
      )
  )
$$;

revoke all on function private.typed_reminder_delivery_is_current(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function public.claim_due_typed_reminder_dry_runs(
  p_now timestamptz default now(),
  p_batch_size integer default 25,
  p_due_window_seconds integer default 900,
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  user_id uuid,
  scheduled_local_date date,
  scheduled_for timestamptz,
  timezone text,
  locale text,
  consent_version text,
  attempt_count integer,
  email_type text,
  learning_language text,
  channel_id text,
  channel_name text,
  channel_summary text,
  video_id text,
  video_title text,
  video_published_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_now is null then
    raise exception 'typed_reminder_claim_now_required' using errcode = '22023';
  end if;
  if p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'typed_reminder_claim_batch_out_of_range' using errcode = '22023';
  end if;
  if p_due_window_seconds < 60 or p_due_window_seconds > 3600 then
    raise exception 'typed_reminder_due_window_out_of_range' using errcode = '22023';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'typed_reminder_lease_out_of_range' using errcode = '22023';
  end if;
  if exists (
    select 1
    from private.reminder_delivery_control as control
    where control.singleton and control.delivery_enabled
  ) then
    raise exception 'typed_reminder_dry_run_delivery_enabled'
      using errcode = '55000';
  end if;

  with recipients as materialized (
    select
      preference.user_id,
      preference.streak_reminders_enabled,
      preference.discovery_emails_enabled,
      preference.consent_version,
      preference.consent_granted_at,
      snapshot.timezone,
      snapshot.locale,
      snapshot.learning_language,
      snapshot.study_date,
      snapshot.points_today,
      snapshot.last_qualified_study_date,
      snapshot.current_streak_days,
      snapshot.updated_at as snapshot_updated_at,
      (p_now at time zone snapshot.timezone)::date as local_date,
      (
        (p_now at time zone snapshot.timezone)::date + time '19:00'
      ) at time zone snapshot.timezone as scheduled_for
    from public.reminder_preferences as preference
    join private.reminder_delivery_testers as tester
      on tester.user_id = preference.user_id
    join public.reminder_eligibility_snapshots as snapshot
      on snapshot.user_id = preference.user_id
    where preference.consent_granted_at is not null
      and preference.consent_revoked_at is null
      and snapshot.updated_at >= p_now - interval '30 days'
      and snapshot.study_date <= (p_now at time zone snapshot.timezone)::date
      and not exists (
        select 1
        from private.reminder_suppressions as suppression
        where suppression.user_id = preference.user_id
      )
  ),
  due_recipients as materialized (
    select recipient.*
    from recipients as recipient
    where recipient.scheduled_for <= p_now
      and recipient.scheduled_for
        >= p_now - pg_catalog.make_interval(secs => p_due_window_seconds)
      and not exists (
        select 1
        from private.reminder_deliveries as recent
        where recent.user_id = recipient.user_id
          and recent.scheduled_for
            > recipient.scheduled_for - interval '24 hours'
          and recent.scheduled_for <= recipient.scheduled_for
      )
  ),
  streak_candidates as (
    select
      recipient.user_id,
      recipient.local_date,
      recipient.scheduled_for,
      recipient.timezone,
      recipient.locale,
      recipient.learning_language,
      recipient.consent_version,
      recipient.consent_granted_at,
      recipient.snapshot_updated_at,
      'streak'::text as email_type,
      1 as priority,
      candidate.channel_id,
      candidate.channel_name,
      null::text as channel_summary,
      candidate.video_id,
      candidate.video_title,
      candidate.video_published_at
    from due_recipients as recipient
    left join lateral (
      select
        follow.channel_id,
        follow.channel_name,
        follow.streak_video_id as video_id,
        follow.streak_video_title as video_title,
        follow.streak_video_published_at as video_published_at
      from public.reminder_channel_follows as follow
      where follow.user_id = recipient.user_id
        and follow.streak_video_id is not null
        and follow.streak_video_published_at >= p_now - interval '7 days'
      order by follow.streak_video_published_at desc, follow.channel_id
      limit 1
    ) as candidate on true
    where recipient.streak_reminders_enabled
      and recipient.current_streak_days > 0
      and recipient.last_qualified_study_date = recipient.local_date - 1
      and (
        recipient.study_date < recipient.local_date
        or recipient.points_today < 5
      )
  ),
  discovery_candidates as (
    select
      recipient.user_id,
      recipient.local_date,
      recipient.scheduled_for,
      recipient.timezone,
      recipient.locale,
      recipient.learning_language,
      recipient.consent_version,
      recipient.consent_granted_at,
      recipient.snapshot_updated_at,
      'discovery'::text as email_type,
      2 as priority,
      candidate.channel_id,
      candidate.channel_name,
      candidate.channel_summary,
      candidate.video_id,
      candidate.video_title,
      candidate.video_published_at
    from due_recipients as recipient
    cross join lateral (
      select
        reviewed.channel_id,
        reviewed.channel_name,
        reviewed.summary as channel_summary,
        (array_agg(
          other_follow.latest_video_id
          order by other_follow.latest_video_published_at desc, other_follow.user_id
        ))[1] as video_id,
        (array_agg(
          other_follow.latest_video_title
          order by other_follow.latest_video_published_at desc, other_follow.user_id
        ))[1] as video_title,
        max(other_follow.latest_video_published_at) as video_published_at,
        count(distinct other_follow.user_id) as learner_count
      from private.reminder_discovery_channels as reviewed
      join public.reminder_channel_follows as other_follow
        on other_follow.channel_id = reviewed.channel_id
      join public.reminder_eligibility_snapshots as other_snapshot
        on other_snapshot.user_id = other_follow.user_id
      where reviewed.learning_language = recipient.learning_language
        and other_follow.user_id <> recipient.user_id
        and other_follow.latest_video_id is not null
        and other_follow.latest_video_published_at >= p_now - interval '30 days'
        and other_snapshot.learning_language = recipient.learning_language
        and other_snapshot.updated_at >= p_now - interval '30 days'
        and not exists (
          select 1
          from public.reminder_channel_follows as owned_follow
          where owned_follow.user_id = recipient.user_id
            and owned_follow.channel_id = reviewed.channel_id
        )
      group by
        reviewed.channel_id,
        reviewed.channel_name,
        reviewed.summary
      order by
        learner_count desc,
        video_published_at desc,
        reviewed.channel_id
      limit 1
    ) as candidate
    where recipient.discovery_emails_enabled
      and recipient.learning_language is not null
      and not exists (
        select 1
        from private.reminder_deliveries as previous
        where previous.user_id = recipient.user_id
          and previous.email_type = 'discovery'
          and previous.scheduled_local_date < recipient.local_date
          and previous.scheduled_local_date > recipient.local_date - 3
      )
  ),
  selected as (
    select distinct on (candidate.user_id) candidate.*
    from (
      select * from streak_candidates
      union all
      select * from discovery_candidates
    ) as candidate
    order by candidate.user_id, candidate.priority
  )
  insert into private.reminder_deliveries (
    user_id,
    scheduled_local_date,
    scheduled_local_time,
    scheduled_for,
    timezone,
    locale,
    consent_version,
    consent_granted_at,
    email_type,
    learning_language,
    channel_id,
    channel_name,
    channel_summary,
    video_id,
    video_title,
    video_published_at,
    eligibility_snapshot_updated_at
  )
  select
    selected.user_id,
    selected.local_date,
    time '19:00',
    selected.scheduled_for,
    selected.timezone,
    selected.locale,
    selected.consent_version,
    selected.consent_granted_at,
    selected.email_type,
    selected.learning_language,
    selected.channel_id,
    selected.channel_name,
    selected.channel_summary,
    selected.video_id,
    selected.video_title,
    selected.video_published_at,
    selected.snapshot_updated_at
  from selected
  on conflict on constraint reminder_deliveries_user_local_date_key do nothing;

  update private.reminder_deliveries as delivery
  set status = 'suppressed',
      claim_token = null,
      lease_expires_at = null,
      suppressed_at = p_now,
      updated_at = p_now
  where delivery.email_type is not null
    and delivery.send_started_at is null
    and (
      delivery.status = 'pending'
      or (
        delivery.status = 'claimed'
        and delivery.lease_expires_at <= p_now
      )
    )
    and not private.typed_reminder_delivery_is_current(delivery.id, p_now);

  return query
  with candidates as materialized (
    select delivery.id
    from private.reminder_deliveries as delivery
    where delivery.email_type is not null
      and delivery.send_started_at is null
      and delivery.scheduled_for <= p_now
      and (
        delivery.status = 'pending'
        or (
          delivery.status = 'claimed'
          and delivery.lease_expires_at <= p_now
        )
      )
      and private.typed_reminder_delivery_is_current(delivery.id, p_now)
    order by delivery.scheduled_for, delivery.id
    for update of delivery skip locked
    limit p_batch_size
  ),
  claimed as (
    update private.reminder_deliveries as delivery
    set status = 'claimed',
        claim_token = gen_random_uuid(),
        lease_expires_at = p_now
          + pg_catalog.make_interval(secs => p_lease_seconds),
        attempt_count = delivery.attempt_count + 1,
        last_claimed_at = p_now,
        updated_at = p_now
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select
    claimed.id,
    claimed.claim_token,
    claimed.user_id,
    claimed.scheduled_local_date,
    claimed.scheduled_for,
    claimed.timezone,
    claimed.locale,
    claimed.consent_version,
    claimed.attempt_count,
    claimed.email_type,
    claimed.learning_language,
    claimed.channel_id,
    claimed.channel_name,
    claimed.channel_summary,
    claimed.video_id,
    claimed.video_title,
    claimed.video_published_at
  from claimed
  order by claimed.scheduled_for, claimed.id;
end;
$$;

revoke all on function public.claim_due_typed_reminder_dry_runs(
  timestamptz, integer, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_due_typed_reminder_dry_runs(
  timestamptz, integer, integer, integer
) to service_role;

create function public.complete_typed_reminder_dry_run(
  p_claim_token uuid,
  p_observed_at timestamptz default now()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  completed boolean := false;
begin
  if p_claim_token is null or p_observed_at is null then
    return false;
  end if;
  if exists (
    select 1
    from private.reminder_delivery_control as control
    where control.singleton and control.delivery_enabled
  ) then
    return false;
  end if;

  update private.reminder_deliveries as delivery
  set status = 'dry_run_observed',
      claim_token = null,
      lease_expires_at = null,
      dry_run_observed_at = p_observed_at,
      updated_at = p_observed_at
  where delivery.status = 'claimed'
    and delivery.email_type is not null
    and delivery.claim_token = p_claim_token
    and delivery.lease_expires_at > p_observed_at
    and delivery.send_started_at is null
    and private.typed_reminder_delivery_is_current(
      delivery.id,
      p_observed_at
    )
  returning true into completed;

  if not coalesce(completed, false) then
    update private.reminder_deliveries as delivery
    set status = 'suppressed',
        claim_token = null,
        lease_expires_at = null,
        suppressed_at = p_observed_at,
        updated_at = p_observed_at
    where delivery.status = 'claimed'
      and delivery.email_type is not null
      and delivery.claim_token = p_claim_token
      and delivery.lease_expires_at > p_observed_at
      and delivery.send_started_at is null;
  end if;

  return coalesce(completed, false);
end;
$$;

revoke all on function public.complete_typed_reminder_dry_run(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_typed_reminder_dry_run(uuid, timestamptz)
  to service_role;

comment on function public.claim_due_typed_reminder_dry_runs(
  timestamptz, integer, integer, integer
) is
  'Creates and leases typed tester occurrences only while live delivery is disabled; the legacy live claim RPC remains separate.';
comment on function public.complete_typed_reminder_dry_run(uuid, timestamptz) is
  'Rechecks account preferences and study eligibility before recording a typed dry-run observation.';
