-- Additive billing hardening for Edenia Plus. Existing subscription and
-- checkout-redemption rows are intentionally preserved.

create table public.billing_rate_limit_buckets (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null,
  constraint billing_rate_limit_buckets_pkey primary key (scope, subject_hash),
  constraint billing_rate_limit_buckets_scope_check
    check (char_length(scope) between 1 and 80),
  constraint billing_rate_limit_buckets_subject_hash_check
    check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint billing_rate_limit_buckets_request_count_check
    check (request_count >= 1)
);

alter table public.billing_rate_limit_buckets enable row level security;
revoke all on table public.billing_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_rate_limit_buckets
  to service_role;

create function public.consume_billing_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_window_seconds integer,
  p_max_requests integer,
  p_now timestamptz default now()
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket public.billing_rate_limit_buckets%rowtype;
  v_window interval;
begin
  if char_length(p_scope) not between 1 and 80
    or p_subject_hash !~ '^[0-9a-f]{64}$'
    or p_window_seconds not between 1 and 86400
    or p_max_requests not between 1 and 1000
  then
    raise exception 'invalid_billing_rate_limit';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.billing_rate_limit_buckets (
    scope,
    subject_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_scope, p_subject_hash, p_now, 1, p_now)
  on conflict (scope, subject_hash) do update
  set
    window_started_at = case
      when public.billing_rate_limit_buckets.window_started_at + v_window <= p_now
        then p_now
      else public.billing_rate_limit_buckets.window_started_at
    end,
    request_count = case
      when public.billing_rate_limit_buckets.window_started_at + v_window <= p_now
        then 1
      else public.billing_rate_limit_buckets.request_count + 1
    end,
    updated_at = p_now
  returning * into v_bucket;

  allowed := v_bucket.request_count <= p_max_requests;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        v_bucket.window_started_at + v_window - p_now
      )))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_billing_rate_limit(
  text,
  text,
  integer,
  integer,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_billing_rate_limit(
  text,
  text,
  integer,
  integer,
  timestamptz
) to service_role;

create table public.stripe_webhook_events (
  event_id text not null,
  event_type text not null,
  livemode boolean not null,
  claim_id uuid not null,
  claimed_at timestamptz not null,
  processed_at timestamptz,
  constraint stripe_webhook_events_pkey primary key (event_id),
  constraint stripe_webhook_events_event_id_check
    check (event_id ~ '^evt_[A-Za-z0-9_]{6,250}$'),
  constraint stripe_webhook_events_event_type_check
    check (char_length(event_type) between 1 and 200)
);

create index stripe_webhook_events_processed_at_idx
  on public.stripe_webhook_events (processed_at)
  where processed_at is not null;

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.stripe_webhook_events
  to service_role;

create function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_claim_id uuid,
  p_stale_before timestamptz,
  p_claimed_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]{6,250}$'
    or char_length(p_event_type) not between 1 and 200
    or p_claim_id is null
    or p_stale_before >= p_claimed_at
  then
    raise exception 'invalid_stripe_webhook_claim';
  end if;

  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    livemode,
    claim_id,
    claimed_at
  )
  values (p_event_id, p_event_type, p_livemode, p_claim_id, p_claimed_at)
  on conflict (event_id) do nothing
  returning * into v_event;

  if found then
    return 'claimed';
  end if;

  select * into v_event
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if v_event.event_type <> p_event_type or v_event.livemode <> p_livemode then
    raise exception 'stripe_webhook_event_identity_mismatch';
  end if;

  if v_event.processed_at is not null then
    return 'processed';
  end if;

  if v_event.claimed_at >= p_stale_before then
    return 'in_progress';
  end if;

  update public.stripe_webhook_events
  set claim_id = p_claim_id, claimed_at = p_claimed_at
  where event_id = p_event_id;
  return 'claimed';
end;
$$;

create function public.complete_stripe_webhook_event(
  p_event_id text,
  p_claim_id uuid,
  p_processed_at timestamptz default now()
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.stripe_webhook_events
    set processed_at = p_processed_at
    where event_id = p_event_id
      and claim_id = p_claim_id
      and processed_at is null
    returning event_id
  )
  select exists (select 1 from completed);
$$;

create function public.release_stripe_webhook_event(
  p_event_id text,
  p_claim_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    delete from public.stripe_webhook_events
    where event_id = p_event_id
      and claim_id = p_claim_id
      and processed_at is null
    returning event_id
  )
  select exists (select 1 from released);
$$;

revoke all on function public.claim_stripe_webhook_event(
  text,
  text,
  boolean,
  uuid,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(
  text,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.release_stripe_webhook_event(text, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(
  text,
  text,
  boolean,
  uuid,
  timestamptz,
  timestamptz
) to service_role;
grant execute on function public.complete_stripe_webhook_event(
  text,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.release_stripe_webhook_event(text, uuid)
  to service_role;

-- Keep server-enforced Plus resources aligned with the browser entitlement:
-- active subscriptions retain access, and past-due subscriptions retain it
-- only during the seven-day recovery window.
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
        and (
          subscriptions.status = 'active'
          or (
            subscriptions.status = 'past_due'
            and subscriptions.past_due_since is not null
            and subscriptions.past_due_since > now() - interval '7 days'
          )
        )
    )
  )
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
