-- Let the externally scheduled Auth monitor use the existing private recorder
-- without exposing the recorder or its aggregate status to browser roles.
create or replace function public.record_auth_health_check_from_monitor(
  p_outcome text,
  p_http_status integer,
  p_latency_ms integer
)
returns table (
  outcome text,
  alert_state text,
  alert_action text,
  consecutive_provider_failures integer,
  checked_at timestamptz
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from private.record_auth_health_check(
    p_outcome,
    p_http_status,
    p_latency_ms
  );
$$;

comment on function public.record_auth_health_check_from_monitor(
  text,
  integer,
  integer
) is
  'Service-only bridge for sanitized external Auth monitor outcomes.';

revoke execute on function public.record_auth_health_check_from_monitor(
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.record_auth_health_check_from_monitor(
  text,
  integer,
  integer
) to service_role;

create or replace function public.read_auth_health_monitor_status()
returns table (
  fresh boolean,
  alert_state text,
  last_outcome text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    not report.stale,
    report.alert_state,
    report.last_outcome
  from private.auth_health_report() as report;
$$;

comment on function public.read_auth_health_monitor_status() is
  'Service-only aggregate status for the independent Auth-monitor freshness watchdog.';

revoke execute on function public.read_auth_health_monitor_status()
  from public, anon, authenticated, service_role;
grant execute on function public.read_auth_health_monitor_status()
  to service_role;
