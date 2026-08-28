begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(14);

select has_function(
  'public',
  'record_auth_health_check_from_monitor',
  array['text', 'integer', 'integer'],
  'the external monitor has one service-only aggregate recorder bridge'
);

select has_function(
  'public',
  'read_auth_health_monitor_status',
  array[]::text[],
  'the independent watchdog has one service-only aggregate status bridge'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.record_auth_health_check_from_monitor(text,integer,integer)'
    )
  ),
  'the recorder bridge is a security definer with an empty search path'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.read_auth_health_monitor_status()'
    )
  ),
  'the status bridge is a security definer with an empty search path'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.record_auth_health_check_from_monitor(text,integer,integer)',
    'execute'
  ),
  'service_role can record the fixed monitor result'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.read_auth_health_monitor_status()',
    'execute'
  ),
  'service_role can read the aggregate monitor status'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.record_auth_health_check_from_monitor(text,integer,integer)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_auth_health_check_from_monitor(text,integer,integer)',
    'execute'
  ),
  'browser roles cannot write Auth monitor results'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.read_auth_health_monitor_status()',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_auth_health_monitor_status()',
    'execute'
  ),
  'browser roles cannot read private Auth monitor status'
);

select results_eq(
  $query$
    select outcome, alert_state, consecutive_provider_failures
    from public.record_auth_health_check_from_monitor('available', 200, 8)
  $query$,
  $$values ('available'::text, 'healthy'::text, 0)$$,
  'the monitor bridge records a sanitized successful probe'
);

select results_eq(
  $query$
    select fresh, alert_state, last_outcome
    from public.read_auth_health_monitor_status()
  $query$,
  $$values (true, 'healthy'::text, 'available'::text)$$,
  'the watchdog reports a fresh healthy aggregate without identity data'
);

update private.auth_health_status
set last_checked_at = pg_catalog.now() - interval '11 minutes'
where singleton;

select results_eq(
  $query$
    select fresh, alert_state
    from public.read_auth_health_monitor_status()
  $query$,
  $$values (false, 'healthy'::text)$$,
  'the watchdog fails freshness after ten minutes without a recorded probe'
);

select results_eq(
  $query$
    with first_failure as materialized (
      select *
      from public.record_auth_health_check_from_monitor(
        'provider_unavailable',
        503,
        10
      )
    ),
    second_failure as materialized (
      select current_result.*
      from first_failure
      cross join lateral public.record_auth_health_check_from_monitor(
        'network_error',
        null,
        10000
      ) as current_result
    ),
    third_failure as materialized (
      select current_result.*
      from second_failure
      cross join lateral public.record_auth_health_check_from_monitor(
        'provider_unavailable',
        502,
        11
      ) as current_result
    )
    select alert_state, alert_action, consecutive_provider_failures
    from third_failure
  $query$,
  $$values ('open'::text, 'open'::text, 3)$$,
  'three externally scheduled provider failures open the aggregate alert'
);

select results_eq(
  $query$
    select fresh, alert_state, last_outcome
    from public.read_auth_health_monitor_status()
  $query$,
  $$values (true, 'open'::text, 'provider_unavailable'::text)$$,
  'the freshness watchdog exposes only the current aggregate alert class'
);

select ok(
  not pg_catalog.has_table_privilege(
    'anon',
    'private.auth_health_checks',
    'select'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'private.auth_health_checks',
    'select'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'private.auth_health_checks',
    'select'
  ),
  'the bridge does not grant direct access to private check history'
);

select * from finish();
rollback;
