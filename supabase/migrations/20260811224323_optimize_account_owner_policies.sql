-- Keep the existing owner-only SELECT decisions while allowing Postgres to
-- evaluate auth.uid() once per statement instead of once per candidate row.

alter policy "Users can view their own subscription"
  on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own founding member status"
  on public.founding_members
  using ((select auth.uid()) = user_id);
