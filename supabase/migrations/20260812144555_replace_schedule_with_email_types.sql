-- Replace the obsolete user-selected schedule with two independent email
-- choices. Keep the legacy scheduler columns temporarily so deployed workers
-- remain schema-compatible, but fence browser clients off from that path.
alter table public.reminder_preferences
  add column streak_reminders_enabled boolean not null default true,
  add column discovery_emails_enabled boolean not null default true;

update public.reminder_preferences as preference
set enabled = false,
    streak_reminders_enabled = (
      preference.consent_revoked_at is null
      and not exists (
        select 1
        from private.reminder_suppressions as suppression
        where suppression.user_id = preference.user_id
      )
    ),
    discovery_emails_enabled = (
      preference.consent_revoked_at is null
      and not exists (
        select 1
        from private.reminder_suppressions as suppression
        where suppression.user_id = preference.user_id
      )
    ),
    consent_granted_at = case
      when preference.consent_revoked_at is null
        and not exists (
          select 1
          from private.reminder_suppressions as suppression
          where suppression.user_id = preference.user_id
        )
        then coalesce(preference.consent_granted_at, now())
      else preference.consent_granted_at
    end,
    consent_version = 'edenia-email-preferences-v2',
    consent_source = case
      when preference.consent_revoked_at is null
        and not exists (
          select 1
          from private.reminder_suppressions as suppression
          where suppression.user_id = preference.user_id
        )
        then 'migration-default'
      else preference.consent_source
    end,
    updated_at = now();

alter table public.reminder_preferences
  add constraint reminder_preferences_email_consent_check check (
    not (streak_reminders_enabled or discovery_emails_enabled)
    or (consent_granted_at is not null and consent_revoked_at is null)
  );

create or replace function private.reject_client_legacy_reminder_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.enabled then
    raise exception 'Legacy reminder scheduling is disabled'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_client_legacy_reminder_schedule()
  from public, anon, authenticated, service_role;

create trigger reject_client_legacy_reminder_schedule
  before insert or update of enabled on public.reminder_preferences
  for each row
  execute function private.reject_client_legacy_reminder_schedule();

create or replace function private.disable_email_preferences_on_consent_revocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.consent_revoked_at is not null then
    new.streak_reminders_enabled := false;
    new.discovery_emails_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function private.disable_email_preferences_on_consent_revocation()
  from public, anon, authenticated, service_role;

create trigger disable_email_preferences_on_consent_revocation
  before insert or update of consent_revoked_at on public.reminder_preferences
  for each row
  execute function private.disable_email_preferences_on_consent_revocation();

comment on column public.reminder_preferences.streak_reminders_enabled is
  'Whether the owner wants streak-protection email reminders.';
comment on column public.reminder_preferences.discovery_emails_enabled is
  'Whether the owner wants channel-discovery emails.';
comment on function private.reject_client_legacy_reminder_schedule() is
  'Rejects attempts by authenticated browser clients to enable the obsolete schedule path.';
comment on function private.disable_email_preferences_on_consent_revocation() is
  'Keeps both user-visible email choices off whenever consent is revoked.';
