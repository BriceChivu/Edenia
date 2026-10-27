-- Email eligibility is a derived view of the accepted cloud head. Browser
-- clocks, totals and freshly uploaded projections are never study authority.
create function private.reminder_study_threshold()
returns integer language sql immutable security invoker set search_path = '' as $$ select 10; $$;

alter table public.reminder_eligibility_snapshots
  add column accepted_profile_id uuid,
  add column accepted_generation bigint,
  add column accepted_revision bigint,
  add column rule_version integer,
  add column input_version bigint,
  add column input_fingerprint text,
  add column relevant_activity_at timestamptz,
  add column study_day_provenance text;

create table private.reminder_projection_sources (
  user_id uuid primary key references auth.users(id) on delete cascade,
  input_version bigint not null default 1,
  input_fingerprint text,
  dirty boolean not null default true,
  relevant_activity_at timestamptz,
  refreshed_at timestamptz,
  retry_after timestamptz,
  failure_reason text
);
create table private.reminder_projection_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  points numeric not null check(points >= 0),
  primary key(user_id,study_date)
);
alter table private.reminder_projection_sources enable row level security;
alter table private.reminder_projection_days enable row level security;
revoke all on private.reminder_projection_sources,private.reminder_projection_days from public,anon,authenticated,service_role;

-- Deliberately exclude island state, progression, activity logs, and private
-- notes. The legacy path extracts only these accepted sections; typed writes
-- inspect one changed record and never serialize the complete profile.
create function private.reminder_video_input(p_value jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id',p_value->'id','channelId',p_value->'channelId',
    'title',p_value->'title','publishedAt',p_value->'publishedAt','duration',p_value->'duration',
    'isShort',p_value->'isShort','status',p_value->'status','hiddenFromGrid',p_value->'hiddenFromGrid',
    'removedFromFeedAt',p_value->'removedFromFeedAt','watchProgress',coalesce(p_value->'watchProgress','[]'::jsonb));
$$;
create function private.reminder_config_input(p_value jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object('channels',coalesce(p_value->'channels','[]'::jsonb),
    'includeShorts',p_value->'includeShorts','locale',p_value->'locale');
$$;
create function private.reminder_profile_inputs(p_profile jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object('config',private.reminder_config_input(p_profile->'config'),
    'learnerProfile',pg_catalog.jsonb_build_object('languages',p_profile#>'{learnerProfile,languages}',
      'updatedAt',p_profile#>'{learnerProfile,updatedAt}'),
    'videos',coalesce((select pg_catalog.jsonb_object_agg(v.key,private.reminder_video_input(v.value))
      from pg_catalog.jsonb_each(coalesce(p_profile->'videos','{}'::jsonb)) v),'{}'::jsonb),
    'anki',coalesce(p_profile->'anki','{}'::jsonb));
$$;
create function private.reminder_input_digest(p_inputs jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_inputs::text,'UTF8'),'sha256'),'hex');
$$;

create function private.reminder_record_input_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; old_input jsonb; new_input jsonb; record_kind text; record_name text;
begin
  if pg_catalog.pg_trigger_depth()>1 then return null; end if;
  owner_id:=coalesce(new.user_id,old.user_id); record_kind:=coalesce(new.kind,old.kind); record_name:=coalesce(new.record_key,old.record_key);
  -- Seeding unchanged records from a legacy head does not create activity.
  if record_kind='section' and record_name not in ('config','learnerProfile') then return null; end if;
  if not exists(select 1 from public.learner_profile_heads h where h.user_id=owner_id and h.records_active) then return null; end if;
  if record_kind='video' then
    if tg_op<>'INSERT' then old_input:=private.reminder_video_input(old.value); end if;
    if tg_op<>'DELETE' then new_input:=private.reminder_video_input(new.value); end if;
  elsif record_kind='anki' then old_input:=old.value; new_input:=new.value;
  elsif record_kind='section' and record_name='config' then
    if tg_op<>'INSERT' then old_input:=private.reminder_config_input(old.value); end if;
    if tg_op<>'DELETE' then new_input:=private.reminder_config_input(new.value); end if;
  elsif record_kind='section' and record_name='learnerProfile' then
    old_input:=pg_catalog.jsonb_build_object('languages',old.value->'languages','updatedAt',old.value->'updatedAt');
    new_input:=pg_catalog.jsonb_build_object('languages',new.value->'languages','updatedAt',new.value->'updatedAt');
  else return null; end if;
  if old_input is not distinct from new_input then return null; end if;
  insert into private.reminder_projection_sources as s(user_id,relevant_activity_at)
    values(owner_id,pg_catalog.statement_timestamp()) on conflict(user_id) do update
    set input_version=s.input_version+1,input_fingerprint=null,dirty=true,relevant_activity_at=excluded.relevant_activity_at,
      retry_after=null,failure_reason=null;
  return null;
end;
$$;
create trigger reminder_record_inputs after insert or update or delete on private.learner_profile_current_records
  for each row execute function private.reminder_record_input_changed();

create function private.reminder_accepted_head_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare source private.reminder_projection_sources%rowtype; inputs jsonb; fingerprint text; previous_fingerprint text;
begin
  if tg_op='UPDATE' and new.profile_id=old.profile_id and new.generation=old.generation and new.revision=old.revision then return new; end if;
  if not new.records_active then
    select private.reminder_profile_inputs(v.envelope->'profile') into inputs from public.learner_profile_versions v
      where v.id=new.current_version_id and v.user_id=new.user_id and v.profile_id=new.profile_id
        and v.generation=new.generation and v.revision=new.revision;
    fingerprint:=case when inputs is not null then private.reminder_input_digest(inputs) end;
    select s.* into source from private.reminder_projection_sources s where s.user_id=new.user_id;
    if tg_op='UPDATE' and source.input_fingerprint is null then
      -- Before the first bounded projection, there is no cached fingerprint.
      -- A cosmetic legacy write must not turn an old accepted profile into
      -- recent study/settings activity merely by warming this new cache.
      select private.reminder_input_digest(private.reminder_profile_inputs(v.envelope->'profile')) into previous_fingerprint
        from public.learner_profile_versions v where v.id=old.current_version_id and v.user_id=old.user_id
          and v.profile_id=old.profile_id and v.generation=old.generation and v.revision=old.revision;
    end if;
    insert into private.reminder_projection_sources as s(user_id,input_fingerprint,relevant_activity_at)
      values(new.user_id,fingerprint,case when tg_op='INSERT' or (coalesce(source.input_fingerprint,previous_fingerprint) is not null
        and coalesce(source.input_fingerprint,previous_fingerprint) is distinct from fingerprint)
        then pg_catalog.statement_timestamp() else source.relevant_activity_at end) on conflict(user_id) do update
      set input_version=case when coalesce(s.input_fingerprint,previous_fingerprint) is not distinct from excluded.input_fingerprint then s.input_version else s.input_version+1 end,
        dirty=s.dirty or coalesce(s.input_fingerprint,previous_fingerprint) is distinct from excluded.input_fingerprint,
        relevant_activity_at=excluded.relevant_activity_at,
        retry_after=case when coalesce(s.input_fingerprint,previous_fingerprint) is distinct from excluded.input_fingerprint then null else s.retry_after end,
        failure_reason=case when coalesce(s.input_fingerprint,previous_fingerprint) is distinct from excluded.input_fingerprint then null else s.failure_reason end,
        input_fingerprint=excluded.input_fingerprint;
  else
    insert into private.reminder_projection_sources(user_id) values(new.user_id) on conflict do nothing;
  end if;
  select s.* into strict source from private.reminder_projection_sources s where s.user_id=new.user_id;
  if tg_op='UPDATE' and new.profile_id=old.profile_id and new.generation=old.generation and not source.dirty then
    update public.reminder_eligibility_snapshots s set accepted_revision=new.revision
      where s.user_id=new.user_id and s.accepted_profile_id=old.profile_id and s.accepted_generation=old.generation
        and s.accepted_revision=old.revision and s.input_version=source.input_version and s.rule_version=1;
  elsif tg_op='UPDATE' and (new.profile_id is distinct from old.profile_id or new.generation is distinct from old.generation) then
    update private.reminder_projection_sources set dirty=true,input_version=input_version+1,retry_after=null,failure_reason=null where user_id=new.user_id;
  end if;
  return new;
end;
$$;
create trigger reminder_accepted_head after insert or update on public.learner_profile_heads
  for each row execute function private.reminder_accepted_head_changed();

create function private.reminder_projection_matches_head(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.reminder_eligibility_snapshots s
    join public.learner_profile_heads h on h.user_id=s.user_id
      and h.profile_id=s.accepted_profile_id and h.generation=s.accepted_generation and h.revision=s.accepted_revision
    join private.reminder_projection_sources i on i.user_id=s.user_id and not i.dirty and i.input_version=s.input_version
    where s.user_id=p_user and s.rule_version=1 and s.study_day_provenance='accepted-study-day-v1');
$$;
create function private.reminder_study_points(p_user uuid,p_date date)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when private.reminder_projection_matches_head(p_user) then
    coalesce((select d.points from private.reminder_projection_days d where d.user_id=p_user and d.study_date=p_date),0) end;
$$;

-- Caller already holds the same auth.users owner lock as every profile writer.
-- Bounded by the accepted 2 MiB profile limit; no island record is read.
create function private.refresh_reminder_eligibility(p_user uuid,p_now timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare head public.learner_profile_heads%rowtype; source private.reminder_projection_sources%rowtype;
  inputs jsonb; config jsonb; learner jsonb; videos jsonb; anki jsonb; fingerprint text;
  zone text; lang text; locale_name text; local_day date; last_day date; streak integer:=0; cursor_day date; observed timestamptz;
begin
  select h.* into head from public.learner_profile_heads h where h.user_id=p_user for update;
  if not found then return false; end if;
  select p.timezone into zone from public.reminder_preferences p where p.user_id=p_user;
  if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then return false; end if;
  local_day:=(p_now at time zone zone)::date;
  insert into private.reminder_projection_sources(user_id) values(p_user) on conflict do nothing;
  select s.* into strict source from private.reminder_projection_sources s where s.user_id=p_user for update;
  if private.reminder_projection_matches_head(p_user) then
    select max(d.study_date) into last_day from private.reminder_projection_days d where d.user_id=p_user
      and d.study_date<=local_day and d.points>=private.reminder_study_threshold();
    cursor_day:=case when private.reminder_study_points(p_user,local_day)>=private.reminder_study_threshold() then local_day else local_day-1 end;
    while coalesce(private.reminder_study_points(p_user,cursor_day),0)>=private.reminder_study_threshold() and streak<10000 loop
      streak:=streak+1;cursor_day:=cursor_day-1;
    end loop;
    update public.reminder_eligibility_snapshots set timezone=zone,study_date=local_day,
      points_today=least(100000,floor(private.reminder_study_points(p_user,local_day)))::integer,
      last_qualified_study_date=last_day,current_streak_days=streak where user_id=p_user;
    update private.reminder_projection_sources set refreshed_at=p_now where user_id=p_user;
    return true;
  end if;
  if head.records_active then
    select pg_catalog.jsonb_object_agg(r.record_key,r.value) into config from private.learner_profile_current_records r
      where r.user_id=p_user and r.profile_id=head.profile_id and r.generation=head.generation
        and r.kind='section' and r.record_key in ('config','learnerProfile');
    select coalesce(pg_catalog.jsonb_object_agg(r.record_key,private.reminder_video_input(r.value)),'{}'::jsonb) into videos
      from private.learner_profile_current_records r where r.user_id=p_user and r.profile_id=head.profile_id
        and r.generation=head.generation and r.kind='video';
    select coalesce(pg_catalog.jsonb_object_agg(r.record_key,r.value),'{}'::jsonb) into anki
      from private.learner_profile_current_records r where r.user_id=p_user and r.profile_id=head.profile_id
        and r.generation=head.generation and r.kind='anki';
    inputs:=private.reminder_profile_inputs(config||pg_catalog.jsonb_build_object('videos',videos,'anki',anki));
  else
    select private.reminder_profile_inputs(v.envelope->'profile') into inputs from public.learner_profile_versions v
      where v.id=head.current_version_id and v.user_id=p_user and v.profile_id=head.profile_id
        and v.generation=head.generation and v.revision=head.revision;
  end if;
  if inputs is null then return false; end if;
  fingerprint:=private.reminder_input_digest(inputs); config:=inputs->'config'; learner:=inputs->'learnerProfile';
  videos:=inputs->'videos';anki:=inputs->'anki';
  locale_name:=case when config->>'locale' in ('en','zh-Hant','zh-Hans','es','fr') then config->>'locale' else 'en' end;
  lang:=learner#>>'{languages,0}';
  if lang not in ('mandarin','japanese','korean','spanish','french','german','english','other') then lang:=null; end if;
  delete from private.reminder_projection_days where user_id=p_user;
  insert into private.reminder_projection_days(user_id,study_date,points)
    select p_user,f.study_date,sum(f.points) from (
      select (e.value->>'studyDay')::date as study_date,coalesce((e.value->>'experienceSeconds')::numeric,0)/60 as points
        from pg_catalog.jsonb_each(videos) v cross join lateral pg_catalog.jsonb_array_elements(coalesce(v.value->'watchProgress','[]'::jsonb)) e
        where coalesce((e.value->>'experienceSeconds')::numeric,0)>0
      union all select a.key::date,coalesce((a.value->>'experienceReviews')::numeric,0) from pg_catalog.jsonb_each(anki) a
    ) f group by f.study_date;
  select greatest(source.relevant_activity_at,
    case when (learner->>'updatedAt')::timestamptz<=p_now then (learner->>'updatedAt')::timestamptz end,
    max(f.observed_at) filter(where f.observed_at<=p_now)) into observed from (
    select (e.value->>'watchedAt')::timestamptz as observed_at from pg_catalog.jsonb_each(videos) v
      cross join lateral pg_catalog.jsonb_array_elements(coalesce(v.value->'watchProgress','[]'::jsonb)) e
      where coalesce((e.value->>'experienceSeconds')::numeric,0)>0
    union all select (a.value->>'observedAt')::timestamptz from pg_catalog.jsonb_each(anki) a
      where coalesce((a.value->>'reviewed')::numeric,0)>0 or coalesce((a.value->>'created')::numeric,0)>0
    ) f;
  select max(d.study_date) into last_day from private.reminder_projection_days d where d.user_id=p_user
    and d.study_date<=local_day and d.points>=private.reminder_study_threshold();
  select case when coalesce(d.points,0)>=private.reminder_study_threshold() then local_day else local_day-1 end into cursor_day
    from (select 1) x left join private.reminder_projection_days d on d.user_id=p_user and d.study_date=local_day;
  while exists(select 1 from private.reminder_projection_days d where d.user_id=p_user and d.study_date=cursor_day and d.points>=private.reminder_study_threshold()) and streak<10000 loop
    streak:=streak+1;cursor_day:=cursor_day-1;
  end loop;
  insert into public.reminder_eligibility_snapshots as s(user_id,timezone,locale,learning_language,study_date,points_today,
    last_qualified_study_date,current_streak_days,updated_at,accepted_profile_id,accepted_generation,accepted_revision,
    rule_version,input_version,input_fingerprint,relevant_activity_at,study_day_provenance)
    values(p_user,zone,locale_name,lang,local_day,least(100000,floor(coalesce((select d.points from private.reminder_projection_days d
      where d.user_id=p_user and d.study_date=local_day),0)))::integer,last_day,streak,p_now,
      head.profile_id,head.generation,head.revision,1,source.input_version,fingerprint,observed,'accepted-study-day-v1')
    on conflict(user_id) do update set timezone=excluded.timezone,locale=excluded.locale,learning_language=excluded.learning_language,
      study_date=excluded.study_date,points_today=excluded.points_today,last_qualified_study_date=excluded.last_qualified_study_date,
      current_streak_days=excluded.current_streak_days,updated_at=excluded.updated_at,accepted_profile_id=excluded.accepted_profile_id,
      accepted_generation=excluded.accepted_generation,accepted_revision=excluded.accepted_revision,rule_version=excluded.rule_version,
      input_version=excluded.input_version,input_fingerprint=excluded.input_fingerprint,relevant_activity_at=excluded.relevant_activity_at,
      study_day_provenance=excluded.study_day_provenance;
  delete from public.reminder_channel_follows where user_id=p_user;
  insert into public.reminder_channel_follows(user_id,channel_id,channel_name,updated_at,
    latest_video_id,latest_video_title,latest_video_published_at,streak_video_id,streak_video_title,streak_video_published_at)
    select p_user,c.value->>'id',left(coalesce(nullif(c.value->>'name',''),c.value->>'id'),200),p_now,
      latest.value->>'id',left(latest.value->>'title',300),(latest.value->>'publishedAt')::timestamptz,
      unwatched.value->>'id',left(unwatched.value->>'title',300),(unwatched.value->>'publishedAt')::timestamptz
    from pg_catalog.jsonb_array_elements(coalesce(config->'channels','[]'::jsonb)) with ordinality c(value,position)
    left join lateral(select v.value from pg_catalog.jsonb_each(videos) v where v.value->>'channelId'=c.value->>'id'
      and v.value->>'id' ~ '^[A-Za-z0-9_-]{11}$' and length(v.value->>'title')>0 and v.value->>'publishedAt' is not null
      and coalesce((v.value->>'hiddenFromGrid')::boolean,false)=false and v.value->>'removedFromFeedAt' is null
      and (coalesce((config->>'includeShorts')::boolean,true) or (coalesce((v.value->>'duration')::numeric,0)<=0 or (v.value->>'duration')::numeric>=180))
      order by v.value->>'publishedAt' desc,v.key limit 1) latest on true
    left join lateral(select v.value from pg_catalog.jsonb_each(videos) v where v.value->>'channelId'=c.value->>'id'
      and v.value->>'id' ~ '^[A-Za-z0-9_-]{11}$' and length(v.value->>'title')>0 and v.value->>'publishedAt' is not null
      and v.value->>'status'='unwatched' and coalesce((v.value->>'hiddenFromGrid')::boolean,false)=false and v.value->>'removedFromFeedAt' is null
      and (coalesce((config->>'includeShorts')::boolean,true) or (coalesce((v.value->>'duration')::numeric,0)<=0 or (v.value->>'duration')::numeric>=180))
      order by v.value->>'publishedAt' desc,v.key limit 1) unwatched on true
    where c.position<=250 and c.value->>'id' ~ '^UC[A-Za-z0-9_-]{20,}$' on conflict(user_id,channel_id) do nothing;
  update private.reminder_projection_sources set dirty=false,input_fingerprint=fingerprint,refreshed_at=p_now,retry_after=null,failure_reason=null where user_id=p_user;
  return true;
end;
$$;

create function public.refresh_reminder_eligibility_snapshots(p_limit integer default 10,p_now timestamptz default now())
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare target record; refreshed integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_now is null then raise exception 'Invalid reminder projection bound' using errcode='22023'; end if;
  for target in select u.id from auth.users u join public.learner_profile_heads h on h.user_id=u.id
    join public.reminder_preferences p on p.user_id=u.id
    left join private.reminder_projection_sources s on s.user_id=u.id
    where u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and (s.retry_after is null or s.retry_after<=p_now)
      and (s.user_id is null or s.dirty or s.refreshed_at is null or s.refreshed_at<p_now-interval '5 minutes')
    order by s.refreshed_at nulls first,u.id limit p_limit for update of u skip locked
  loop
    begin
      if private.refresh_reminder_eligibility(target.id,p_now) then refreshed:=refreshed+1; end if;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range or not_null_violation or check_violation then
      -- A corrupt accepted owner must not prevent other owners' bounded work.
      -- Keep its head untouched, invalidate derived authority, and avoid a hot
      -- retry loop. This exposes an operator reason without profile contents.
      insert into private.reminder_projection_sources as s(user_id,dirty,refreshed_at,retry_after,failure_reason)
        values(target.id,true,p_now,p_now+interval '1 hour','invalid-accepted-input') on conflict(user_id) do update
        set dirty=true,refreshed_at=p_now,retry_after=excluded.retry_after,failure_reason=excluded.failure_reason;
    end;
  end loop;
  return refreshed;
end;
$$;

-- Retain old-client compatibility without accepting old-client authority.
-- A signed-in visit merely asks for bounded recomputation of already accepted
-- facts. It cannot manufacture yesterday's XP or overwrite a newer device.
create or replace function public.sync_my_reminder_eligibility_snapshot(payload jsonb)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare owner_id uuid:=auth.uid(); synced_at timestamptz:=pg_catalog.statement_timestamp();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.jsonb_typeof(payload) is distinct from 'object' or pg_catalog.octet_length(payload::text)>262144
    or exists(select 1 from pg_catalog.jsonb_object_keys(payload) k where k not in
      ('timezone','locale','learningLanguage','studyDate','pointsToday','lastQualifiedStudyDate','currentStreakDays','channels')) then
    raise exception 'Snapshot payload is invalid' using errcode='22023'; end if;
  perform 1 from auth.users u where u.id=owner_id and u.email_confirmed_at is not null and u.deleted_at is null
    and not coalesce(u.is_anonymous,false) for update;
  if not found then raise exception 'Verified account required' using errcode='42501'; end if;
  perform private.refresh_reminder_eligibility(owner_id,synced_at);
  return synced_at;
end;
$$;

-- Existing rows have no accepted-head provenance, and remain ineligible until
-- the bounded worker derives them. No enrollment or learner record is changed.
insert into private.reminder_projection_sources(user_id)
  select h.user_id from public.learner_profile_heads h on conflict do nothing;
comment on column public.reminder_eligibility_snapshots.points_today is 'Integer floor of accepted credited video minutes plus credited Anki reviews; qualification uses exact numeric points at 10 XP.';
comment on column public.reminder_eligibility_snapshots.last_qualified_study_date is 'Latest accepted immutable Study day reaching 10 Study XP; no inference from client projections.';

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in ('reminder_study_threshold','reminder_video_input','reminder_config_input','reminder_profile_inputs','reminder_input_digest',
      'reminder_record_input_changed','reminder_accepted_head_changed','reminder_projection_matches_head','reminder_study_points','refresh_reminder_eligibility'))
      or (n.nspname='public' and p.proname='refresh_reminder_eligibility_snapshots')
  loop execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',f); end loop;
end; $$;
grant execute on function public.refresh_reminder_eligibility_snapshots(integer,timestamptz) to service_role;
revoke all on function public.sync_my_reminder_eligibility_snapshot(jsonb) from public,anon,service_role;
grant execute on function public.sync_my_reminder_eligibility_snapshot(jsonb) to authenticated;
