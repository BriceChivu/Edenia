-- Restore the service-only rate-limit primitive needed by account exports in
-- environments where the earlier billing-hardening migration was not recorded
-- or was only partially applied. This is intentionally limited to the two
-- canonical objects used by the deployed export function.

create table if not exists public.billing_rate_limit_buckets (
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
revoke all on table public.billing_rate_limit_buckets
  from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_rate_limit_buckets
  to service_role;

create or replace function public.consume_billing_rate_limit(
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
as $function$
declare
  rate_limit_bucket public.billing_rate_limit_buckets%rowtype;
  rate_limit_window interval;
begin
  if char_length(p_scope) not between 1 and 80
    or p_subject_hash !~ '^[0-9a-f]{64}$'
    or p_window_seconds not between 1 and 86400
    or p_max_requests not between 1 and 1000
  then
    raise exception 'invalid_billing_rate_limit';
  end if;

  rate_limit_window := make_interval(secs => p_window_seconds);

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
      when public.billing_rate_limit_buckets.window_started_at
        + rate_limit_window <= p_now
        then p_now
      else public.billing_rate_limit_buckets.window_started_at
    end,
    request_count = case
      when public.billing_rate_limit_buckets.window_started_at
        + rate_limit_window <= p_now
        then 1
      else public.billing_rate_limit_buckets.request_count + 1
    end,
    updated_at = p_now
  returning * into rate_limit_bucket;

  allowed := rate_limit_bucket.request_count <= p_max_requests;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        rate_limit_bucket.window_started_at + rate_limit_window - p_now
      )))::integer
    )
  end;
  return next;
end;
$function$;

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

comment on table public.billing_rate_limit_buckets is
  'Service-owned fixed-window request counters keyed by hashed subjects.';
comment on function public.consume_billing_rate_limit(
  text,
  text,
  integer,
  integer,
  timestamptz
) is
  'Atomically consumes one request from a bounded service-owned rate limit.';
