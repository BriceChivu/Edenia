-- Cloud backups are a server-enforced Plus benefit, not a client-side convention.
drop policy if exists "Users can view their own state backup"
  on public.state_backups;
drop policy if exists "Users can upsert their own state backup"
  on public.state_backups;
drop policy if exists "Users can update their own state backup"
  on public.state_backups;

create policy "Plus users can view their own state backup"
  on public.state_backups
  as permissive
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.subscriptions
      where subscriptions.user_id = (select auth.uid())
        and subscriptions.status in ('active', 'past_due')
    )
  );

create policy "Plus users can insert their own state backup"
  on public.state_backups
  as permissive
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.subscriptions
      where subscriptions.user_id = (select auth.uid())
        and subscriptions.status in ('active', 'past_due')
    )
  );

create policy "Plus users can update their own state backup"
  on public.state_backups
  as permissive
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.subscriptions
      where subscriptions.user_id = (select auth.uid())
        and subscriptions.status in ('active', 'past_due')
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.subscriptions
      where subscriptions.user_id = (select auth.uid())
        and subscriptions.status in ('active', 'past_due')
    )
  );

revoke all privileges on table public.state_backups from anon, authenticated;
grant select, insert, update on table public.state_backups to authenticated;
