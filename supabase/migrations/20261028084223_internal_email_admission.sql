-- Add internal admission without activating delivery or rewriting consent.
alter table private.reminder_delivery_control drop constraint reminder_delivery_control_admission_mode_check;
alter table private.reminder_delivery_control add constraint reminder_delivery_control_admission_mode_check check(admission_mode in ('canary','internal','public'));
alter table private.reminder_payload_bindings drop constraint reminder_payload_bindings_admission_mode_check;
alter table private.reminder_payload_bindings add constraint reminder_payload_bindings_admission_mode_check check(admission_mode in ('canary','internal','public'));
create function private.reminder_admission_allows_owner(p_user uuid,p_mode text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_mode
 when 'public' then true
 when 'internal' then exists(select 1 from private.learner_profile_access_control c where c.singleton
   and c.rollout_state<>'off' and (p_user=c.developer_user_id or p_user=any(c.tester_user_ids)))
 when 'canary' then exists(select 1 from private.reminder_delivery_testers t where t.user_id=p_user)
 else false end
$$;
revoke all on function private.reminder_admission_allows_owner(uuid,text) from public,anon,authenticated,service_role;
create or replace function private.reminder_candidates(p_utc_date date,p_at timestamptz)
returns table(user_id uuid,local_date date,scheduled_for timestamptz,timezone text,
 locale text,learning_language text,consent_version text,consent_granted_at timestamptz,
 snapshot_updated_at timestamptz,enrollment_epoch bigint,choice_version bigint,
 email_type text,channel_id text,channel_name text,channel_summary text,
 video_id text,video_title text,video_published_at timestamptz)
language sql stable set search_path='' as $$
 with owners as materialized (
  select p.*,s.timezone as accepted_timezone,s.locale as accepted_locale,s.learning_language,
   s.updated_at as snapshot_updated_at,s.relevant_activity_at,
   (((p_utc_date+o.day_offset)+time '19:00') at time zone s.timezone) as due,
   (p_utc_date+o.day_offset)::date as local_date
  from public.reminder_preferences p join public.reminder_eligibility_snapshots s using(user_id)
  cross join (values(-1),(0),(1)) o(day_offset)
  cross join private.reminder_delivery_control ctl
  where s.timezone=p.timezone
   and private.reminder_projection_matches_head(p.user_id)
   and private.reminder_admission_allows_owner(p.user_id,ctl.admission_mode)
 ), eligible as (
  select o.*,case when public.reminder_type_enrolled(o.user_id,'streak')
   and private.reminder_study_points(o.user_id,o.local_date-1)>=private.reminder_study_threshold()
   and coalesce(private.reminder_study_points(o.user_id,o.local_date),0)<private.reminder_study_threshold()
   then 'streak' when public.reminder_type_enrolled(o.user_id,'discovery')
   and o.learning_language is not null and o.relevant_activity_at>=p_at-interval '30 days'
   and not exists(select 1 from private.reminder_deliveries d where d.user_id=o.user_id
     and d.email_type='discovery' and d.may_have_sent
     and d.scheduled_local_date>o.local_date-7 and d.scheduled_local_date<=o.local_date)
   then 'discovery' end as kind
  from owners o where (o.due at time zone 'UTC')::date=p_utc_date
   and not exists(select 1 from private.reminder_deliveries d where d.user_id=o.user_id
     and d.may_have_sent and d.send_started_at>o.due-interval '24 hours'
     and d.send_started_at<=o.due)
 )
 select e.user_id,e.local_date,e.due,e.accepted_timezone,e.accepted_locale,e.learning_language,
  e.consent_version,e.consent_granted_at,e.snapshot_updated_at,e.enrollment_epoch,
  case e.kind when 'streak' then e.streak_choice_version else e.discovery_choice_version end,
  e.kind,c.channel_id,c.channel_name,c.summary,
  null::text,null::text,null::timestamptz
 from eligible e left join lateral (
  select r.* from private.reminder_discovery_channels r
  where e.kind='discovery' and r.channel_id=(private.email_discovery_recommendations(e.user_id,e.due)#>>'{0,channelId}')

 ) c on true
 where e.kind='streak' or (e.kind='discovery' and c.channel_id is not null)
$$;

create or replace function private.typed_reminder_delivery_is_current(p_delivery_id uuid,p_at timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.reminder_deliveries d
 join public.reminder_preferences p on p.user_id=d.user_id
 join public.reminder_eligibility_snapshots s on s.user_id=d.user_id
 join private.reminder_delivery_control ctl on ctl.singleton
 where d.id=p_delivery_id and d.email_type is not null and p_at is not null
 and p_at>=d.scheduled_for and p_at<d.scheduled_for+interval '1 hour'
 and (p_at at time zone d.timezone)::date=d.scheduled_local_date
 and private.reminder_admission_allows_owner(d.user_id,ctl.admission_mode)
 and public.reminder_type_enrolled(d.user_id,d.email_type)
 and p.enrollment_epoch=d.enrollment_epoch
 and (case d.email_type when 'streak' then p.streak_choice_version else p.discovery_choice_version end)=d.choice_version
 and private.reminder_projection_matches_head(d.user_id)
 and s.timezone=d.timezone and s.locale=d.locale and p.timezone=d.timezone
 and not exists(select 1 from private.reminder_deliveries previous where previous.user_id=d.user_id
   and previous.id<>d.id and previous.may_have_sent and previous.send_started_at>p_at-interval '24 hours')
 and ((d.email_type='streak' and (d.streak_days is null or d.streak_days=s.current_streak_days) and (d.video_id is null or exists(select 1 from public.reminder_channel_follows vf where vf.user_id=d.user_id and vf.channel_id=d.channel_id and vf.streak_video_id=d.video_id and vf.streak_video_title=d.video_title and coalesce(vf.streak_video_mode,'new')=coalesce(d.video_mode,'new'))) and (d.remaining_minutes is null or d.remaining_minutes=greatest(1,ceil(private.reminder_study_threshold()-coalesce(private.reminder_study_points(d.user_id,d.scheduled_local_date),0))::integer)) and private.reminder_study_points(d.user_id,d.scheduled_local_date-1)>=private.reminder_study_threshold()
   and coalesce(private.reminder_study_points(d.user_id,d.scheduled_local_date),0)<private.reminder_study_threshold())
 or (d.email_type='discovery'
   and not(public.reminder_type_enrolled(d.user_id,'streak')
     and private.reminder_study_points(d.user_id,d.scheduled_local_date-1)>=private.reminder_study_threshold()
     and coalesce(private.reminder_study_points(d.user_id,d.scheduled_local_date),0)<private.reminder_study_threshold())
   and private.email_discovery_payload_current(d.id,p_at)
   and s.learning_language=d.learning_language
   and s.relevant_activity_at>=p_at-interval '30 days'
   and exists(select 1 from private.reminder_discovery_channels r where r.channel_id=d.channel_id
     and r.learning_language=any(s.learning_languages) and r.channel_name=d.channel_name and r.summary=d.channel_summary)
   and not exists(select 1 from public.reminder_channel_follows f where f.user_id=d.user_id and f.channel_id=d.channel_id)
   and not exists(select 1 from private.reminder_deliveries previous where previous.user_id=d.user_id
     and previous.id<>d.id and previous.email_type='discovery' and previous.may_have_sent
     and ((previous.scheduled_local_date>d.scheduled_local_date-7)
       or (previous.channel_id=d.channel_id and previous.send_started_at>p_at-interval '90 days'))))))
$$;

create or replace function public.bind_reminder_payload(p_claim_token uuid,p_recipient_digest bytea,
 p_sender_digest bytea,p_payload_digest bytea,p_template_version text,p_unsubscribe_key_version text,
 p_api_key_digest bytea,p_admission_mode text,
 p_at timestamptz default now()) returns boolean
language plpgsql security definer set search_path='' as $$
declare d private.reminder_deliveries; b private.reminder_payload_bindings;
begin
 if p_at is null or octet_length(p_recipient_digest)<>32 or octet_length(p_sender_digest)<>32
 or octet_length(p_payload_digest)<>32 or p_template_version is null or p_unsubscribe_key_version is null
 or p_api_key_digest is null or octet_length(p_api_key_digest)<>32
 or p_admission_mode is null or p_admission_mode not in ('canary','internal','public')
 then return false; end if;
 select * into d from private.reminder_deliveries where claim_token=p_claim_token for update;
 if not found or d.status<>'claimed' or d.lease_expires_at<=p_at
  or not private.typed_reminder_delivery_is_current(d.id,p_at) then return false; end if;
 select * into b from private.reminder_payload_bindings where delivery_id=d.id;
 if found then return b.recipient_digest=p_recipient_digest and b.sender_digest=p_sender_digest
  and b.payload_digest=p_payload_digest and b.template_version=p_template_version
  and b.unsubscribe_key_version=p_unsubscribe_key_version
  and b.api_key_digest=p_api_key_digest and b.admission_mode=p_admission_mode; end if;
 if d.send_started_at is not null then return false; end if;
 insert into private.reminder_payload_bindings values(d.id,p_recipient_digest,p_sender_digest,
  p_payload_digest,p_template_version,p_unsubscribe_key_version,p_at,p_api_key_digest,p_admission_mode);
 return true;
end $$;
