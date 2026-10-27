-- Checked choices are preferences, not permission to send. No existing grant,
-- including account-default/migration-default, is promoted to enrollment.
alter table public.reminder_preferences
  drop constraint reminder_preferences_email_consent_check,
  add column enrollment_epoch bigint not null default 0 check (enrollment_epoch >= 0),
  add column streak_choice_version bigint not null default 0 check (streak_choice_version >= 0),
  add column discovery_choice_version bigint not null default 0 check (discovery_choice_version >= 0),
  add column streak_enrollment_version text,
  add column discovery_enrollment_version text;

-- Old clients cannot manufacture enrollment or reverse a later unsubscribe.
revoke insert, update, delete on public.reminder_preferences from authenticated;

create or replace function private.reminder_owner_view(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.to_jsonb(p) || pg_catalog.jsonb_build_object(
    'delivery_paused', not coalesce((select delivery_enabled from private.reminder_delivery_control where singleton),false),
    'enrollment_blocked', exists (
      select 1 from private.reminder_suppressions s
      where s.user_id = p_user_id and s.reason <> 'unsubscribed'
    )
  ) from public.reminder_preferences p where p.user_id = p_user_id;
$$;
revoke all on function private.reminder_owner_view(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_my_reminder_preferences(p_timezone text, p_locale text, p_expected_owner uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'reminder_owner_required' using errcode = '42501'; end if;
  -- Bind the initiating browser owner as well as the token used at dispatch.
  -- The shared Auth client may switch sessions while fetching a request token.
  if p_expected_owner is distinct from v_owner then raise exception 'reminder_owner_changed' using errcode = '42501'; end if;
  -- ON CONFLICT handles simultaneous first reads without replacing saved off choices.
  insert into public.reminder_preferences(user_id, timezone, locale, consent_version, consent_source)
  values (v_owner, p_timezone, p_locale, 'edenia-email-enrollment-v3', 'account-default')
  on conflict (user_id) do nothing;
  return private.reminder_owner_view(v_owner);
end;
$$;
revoke all on function public.get_my_reminder_preferences(text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_my_reminder_preferences(text,text,uuid) to authenticated;

create or replace function public.save_my_reminder_choice(
  p_choice text, p_enabled boolean, p_expected_version bigint,
  p_enrollment_epoch bigint, p_timezone text, p_locale text, p_expected_owner uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_pref public.reminder_preferences;
begin
  if v_owner is null then raise exception 'reminder_owner_required' using errcode = '42501'; end if;
  -- Bind the initiating browser owner as well as the token used at dispatch.
  -- The shared Auth client may switch sessions while fetching a request token.
  if p_expected_owner is distinct from v_owner then raise exception 'reminder_owner_changed' using errcode = '42501'; end if;
  if p_choice is null or p_choice not in ('streak','discovery') or p_enabled is null
    or p_expected_version is null or p_enrollment_epoch is null then
    raise exception 'reminder_choice_invalid' using errcode = '22023';
  end if;
  select * into v_pref from public.reminder_preferences where user_id = v_owner for update;
  if not found or v_pref.enrollment_epoch <> p_enrollment_epoch
    or (case when p_choice = 'streak' then v_pref.streak_choice_version else v_pref.discovery_choice_version end) <> p_expected_version then
    raise exception 'reminder_choice_stale' using errcode = '40001';
  end if;
  -- A toggle changes only this choice. Turning it on never silently enrolls it.
  update public.reminder_preferences set
    streak_reminders_enabled = case when p_choice = 'streak' then p_enabled else streak_reminders_enabled end,
    discovery_emails_enabled = case when p_choice = 'discovery' then p_enabled else discovery_emails_enabled end,
    streak_choice_version = streak_choice_version + case when p_choice = 'streak' then 1 else 0 end,
    discovery_choice_version = discovery_choice_version + case when p_choice = 'discovery' then 1 else 0 end,
    streak_enrollment_version = case when p_choice = 'streak' and not p_enabled then null else streak_enrollment_version end,
    discovery_enrollment_version = case when p_choice = 'discovery' and not p_enabled then null else discovery_enrollment_version end,
    timezone = p_timezone, locale = p_locale, updated_at = pg_catalog.clock_timestamp()
  where user_id = v_owner;
  return private.reminder_owner_view(v_owner);
end;
$$;
revoke all on function public.save_my_reminder_choice(text,boolean,bigint,bigint,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_my_reminder_choice(text,boolean,bigint,bigint,text,text,uuid) to authenticated;

create or replace function public.enroll_my_reminder_choices(
  p_streak boolean, p_discovery boolean, p_streak_version bigint,
  p_discovery_version bigint, p_enrollment_epoch bigint, p_expected_owner uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_pref public.reminder_preferences;
begin
  if v_owner is null then raise exception 'reminder_owner_required' using errcode = '42501'; end if;
  -- Bind the initiating browser owner as well as the token used at dispatch.
  -- The shared Auth client may switch sessions while fetching a request token.
  if p_expected_owner is distinct from v_owner then raise exception 'reminder_owner_changed' using errcode = '42501'; end if;
  if p_streak is null or p_discovery is null or not (p_streak or p_discovery)
    or p_streak_version is null or p_discovery_version is null or p_enrollment_epoch is null then
    raise exception 'reminder_enrollment_invalid' using errcode = '22023';
  end if;
  if not exists(select 1 from auth.users u where u.id = v_owner and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and nullif(pg_catalog.btrim(u.email),'') is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())) then
    raise exception 'reminder_verified_owner_required' using errcode = '42501';
  end if;
  select * into v_pref from public.reminder_preferences where user_id = v_owner for update;
  if not found or v_pref.enrollment_epoch <> p_enrollment_epoch
    or v_pref.streak_choice_version <> p_streak_version or v_pref.discovery_choice_version <> p_discovery_version
    or v_pref.streak_reminders_enabled <> p_streak or v_pref.discovery_emails_enabled <> p_discovery then
    raise exception 'reminder_choice_stale' using errcode = '40001';
  end if;
  if exists(select 1 from private.reminder_suppressions where user_id = v_owner and reason <> 'unsubscribed') then
    raise exception 'reminder_enrollment_suppressed' using errcode = '42501';
  end if;
  -- Only this deliberate, verified-owner action can reverse an ordinary unsubscribe.
  delete from private.reminder_suppressions where user_id = v_owner and reason = 'unsubscribed';
  update public.reminder_preferences set
    streak_enrollment_version = case when p_streak then 'edenia-email-enrollment-v3' else null end,
    discovery_enrollment_version = case when p_discovery then 'edenia-email-enrollment-v3' else null end,
    consent_granted_at = pg_catalog.clock_timestamp(), consent_revoked_at = null,
    consent_version = 'edenia-email-enrollment-v3', consent_source = 'settings-enable-emails',
    enrollment_epoch = enrollment_epoch + 1, updated_at = pg_catalog.clock_timestamp()
  where user_id = v_owner;
  return private.reminder_owner_view(v_owner);
end;
$$;
revoke all on function public.enroll_my_reminder_choices(boolean,boolean,bigint,bigint,bigint,uuid) from public, anon, authenticated, service_role;
grant execute on function public.enroll_my_reminder_choices(boolean,boolean,bigint,bigint,bigint,uuid) to authenticated;

-- Trigger on revocation also fences legacy provider/unsubscribe entry points.
create or replace function private.disable_email_preferences_on_consent_revocation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.consent_revoked_at is not null then
    new.streak_reminders_enabled := false;
    new.discovery_emails_enabled := false;
    new.streak_enrollment_version := null;
    new.discovery_enrollment_version := null;
    new.enrollment_epoch := case when tg_op = 'UPDATE' then old.enrollment_epoch + 1 else new.enrollment_epoch + 1 end;
    new.streak_choice_version := new.streak_choice_version + 1;
    new.discovery_choice_version := new.discovery_choice_version + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.disable_email_preferences_on_consent_revocation() from public, anon, authenticated, service_role;

-- Take the preference lock first in both suppression and re-enrollment. Escalate
-- an earlier unsubscribe to a hard bounce/complaint instead of losing that event.
create or replace function private.apply_reminder_suppression(
  p_user_id uuid,p_reason text,p_source text,p_suppressed_at timestamptz
)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_suppressed_at is null or not exists(select 1 from auth.users where id = p_user_id) then return false; end if;
  perform 1 from public.reminder_preferences where user_id = p_user_id for update;
  insert into private.reminder_suppressions(user_id,reason,source,suppressed_at)
    values(p_user_id,p_reason,p_source,p_suppressed_at)
  on conflict(user_id) do update set reason = excluded.reason, source = excluded.source, suppressed_at = excluded.suppressed_at
    where reminder_suppressions.reason = 'unsubscribed' and excluded.reason <> 'unsubscribed';
  update public.reminder_preferences set enabled = false,
    consent_revoked_at = coalesce(consent_revoked_at,p_suppressed_at),updated_at = p_suppressed_at where user_id = p_user_id;
  update private.reminder_deliveries set status = 'suppressed',claim_token = null,lease_expires_at = null,
    suppressed_at = p_suppressed_at,updated_at = p_suppressed_at where user_id = p_user_id and status in ('pending','claimed');
  return true;
end;
$$;
revoke all on function private.apply_reminder_suppression(uuid,text,text,timestamptz) from public, anon, authenticated, service_role;

create or replace function public.reminder_type_enrolled(p_user_id uuid,p_email_type text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.reminder_preferences p join auth.users u on u.id = p.user_id
    where p.user_id = p_user_id and p.consent_revoked_at is null
      and not coalesce(u.is_anonymous,false)
      and u.email_confirmed_at is not null and nullif(pg_catalog.btrim(u.email),'') is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.statement_timestamp())
      and case p_email_type
        when 'streak' then p.streak_reminders_enabled and p.streak_enrollment_version = 'edenia-email-enrollment-v3'
        when 'discovery' then p.discovery_emails_enabled and p.discovery_enrollment_version = 'edenia-email-enrollment-v3'
        else false end
      and not exists(select 1 from private.reminder_suppressions s where s.user_id = p.user_id));
$$;
revoke all on function public.reminder_type_enrolled(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.reminder_type_enrolled(uuid,text) to service_role;

-- The callback implementation takes a delivery lock before applying a
-- suppression. Acquire the preference lock first, matching provider-begin and
-- owner enrollment, so a callback cannot deadlock those paths in reverse order.
alter function public.record_reminder_provider_event(text,text,text,uuid,text,timestamptz,timestamptz)
  set schema private;
revoke all on function private.record_reminder_provider_event(text,text,text,uuid,text,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;
create function public.record_reminder_provider_event(
  p_provider_name text,p_event_id text,p_event_type text,p_delivery_id uuid,
  p_provider_message_id text,p_event_created_at timestamptz,p_received_at timestamptz default now()
)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  perform 1 from public.reminder_preferences p where p.user_id = (
    select d.user_id from private.reminder_deliveries d where d.id = p_delivery_id
  ) for update;
  return private.record_reminder_provider_event(p_provider_name,p_event_id,p_event_type,
    p_delivery_id,p_provider_message_id,p_event_created_at,p_received_at);
end;
$$;
revoke all on function public.record_reminder_provider_event(text,text,text,uuid,text,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.record_reminder_provider_event(text,text,text,uuid,text,timestamptz,timestamptz)
  to service_role;
