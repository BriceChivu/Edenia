-- Store only an authenticated owner's reminder choices. Email addresses stay in
-- Supabase Auth and delivery is intentionally outside this table and migration.
create table public.reminder_preferences (
  user_id uuid not null,
  enabled boolean not null default false,
  days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[],
  local_time time without time zone not null default time '19:00',
  timezone text not null,
  locale text not null,
  consent_granted_at timestamptz,
  consent_revoked_at timestamptz,
  consent_version text not null,
  consent_source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_preferences_pkey primary key (user_id),
  constraint reminder_preferences_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint reminder_preferences_days_check check (
    cardinality(days) between 1 and 7
    and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and cardinality(days) =
      case when 1 = any(days) then 1 else 0 end
      + case when 2 = any(days) then 1 else 0 end
      + case when 3 = any(days) then 1 else 0 end
      + case when 4 = any(days) then 1 else 0 end
      + case when 5 = any(days) then 1 else 0 end
      + case when 6 = any(days) then 1 else 0 end
      + case when 7 = any(days) then 1 else 0 end
  ),
  constraint reminder_preferences_timezone_check check (
    char_length(timezone) between 1 and 100
    and (
      timezone = 'UTC'
      or timezone ~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+$'
    )
    and pg_catalog.timezone(
      timezone,
      timestamp '2000-01-01 00:00:00'
    ) is not null
  ),
  constraint reminder_preferences_locale_check check (
    locale in ('en', 'zh-Hant', 'zh-Hans', 'es', 'fr')
  ),
  constraint reminder_preferences_consent_version_check check (
    char_length(consent_version) between 1 and 80
  ),
  constraint reminder_preferences_consent_source_check check (
    char_length(consent_source) between 1 and 80
  ),
  constraint reminder_preferences_enabled_consent_check check (
    not enabled
    or (consent_granted_at is not null and consent_revoked_at is null)
  )
);

comment on table public.reminder_preferences is
  'Owner-isolated reminder choices only. Contains no email address and performs no delivery.';
comment on column public.reminder_preferences.days is
  'ISO weekdays: Monday=1 through Sunday=7.';
comment on column public.reminder_preferences.timezone is
  'IANA timezone validated by PostgreSQL and the Edenia client.';

-- The primary key indexes user_id for owner-scoped policy lookups. This partial
-- index supports a future server-owned scheduler without creating one here.
create index reminder_preferences_enabled_schedule_idx
  on public.reminder_preferences (timezone, local_time)
  where enabled = true;

alter table public.reminder_preferences enable row level security;

revoke all on table public.reminder_preferences
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.reminder_preferences
  to authenticated;
grant select, insert, update, delete on table public.reminder_preferences
  to service_role;

create policy "Users can view their own reminder preferences"
  on public.reminder_preferences
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can create their own reminder preferences"
  on public.reminder_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can update their own reminder preferences"
  on public.reminder_preferences
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can delete their own reminder preferences"
  on public.reminder_preferences
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
