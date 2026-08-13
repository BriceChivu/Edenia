-- Reconcile the Plus backup entitlement after the service-only billing
-- prerequisites were restored by later applied migrations. Cloud backups stay
-- append-only for browser clients, while past-due access matches the seven-day
-- recovery window enforced by the application entitlement model.

update public.subscriptions
set past_due_since = coalesce(past_due_since, updated_at, now())
where status = 'past_due'
  and past_due_since is null;

drop policy if exists "Plus users can view their own state backup"
  on public.state_backups;
drop policy if exists "Plus users can insert their own state backup"
  on public.state_backups;
drop policy if exists "Plus users can update their own state backup"
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
        and (
          subscriptions.status = 'active'
          or (
            subscriptions.status = 'past_due'
            and subscriptions.past_due_since is not null
            and subscriptions.past_due_since > now() - interval '7 days'
          )
        )
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
        and (
          subscriptions.status = 'active'
          or (
            subscriptions.status = 'past_due'
            and subscriptions.past_due_since is not null
            and subscriptions.past_due_since > now() - interval '7 days'
          )
        )
    )
  );

-- The backup-history migration made browser backups immutable. Enforce that
-- invariant even if an older environment retained an UPDATE grant or policy.
revoke update on table public.state_backups from public, anon, authenticated;
