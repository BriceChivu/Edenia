-- Keep ordinary learner-profile history bounded without deleting protected
-- recovery records or the receipts that make retries safe.
create table private.learner_profile_maintenance_config (
  singleton boolean primary key default true,
  ordinary_retention_count integer not null default 8,
  protected_retention_days integer not null default 30,
  database_plan text not null default 'Free',
  database_limit_bytes bigint not null default 524288000,
  database_limit_verified_at timestamptz,
  pause_behavior text,
  restore_behavior text,
  pause_restore_constraints_verified_at timestamptz,
  warning_fraction numeric(5,4) not null default 0.7000,
  pause_fraction numeric(5,4) not null default 0.8500,
  cleanup_enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint learner_profile_maintenance_config_singleton_check
    check (singleton),
  constraint learner_profile_maintenance_config_retention_check
    check (ordinary_retention_count between 1 and 8),
  constraint learner_profile_maintenance_config_protection_check
    check (protected_retention_days = 30),
  constraint learner_profile_maintenance_config_limit_check
    check (database_limit_bytes > 0),
  constraint learner_profile_maintenance_config_plan_check
    check (pg_catalog.length(database_plan) between 1 and 64),
  constraint learner_profile_maintenance_config_pause_behavior_check
    check (
      pause_behavior is null
      or pg_catalog.length(pause_behavior) between 1 and 256
    ),
  constraint learner_profile_maintenance_config_restore_behavior_check
    check (
      restore_behavior is null
      or pg_catalog.length(restore_behavior) between 1 and 256
    ),
  constraint learner_profile_maintenance_config_fraction_check
    check (
      warning_fraction > 0
      and warning_fraction < pause_fraction
      and pause_fraction <= 1
    )
);

insert into private.learner_profile_maintenance_config (singleton)
values (true);

comment on table private.learner_profile_maintenance_config is
  'Operator-owned retention policy and capacity gate. Cleanup stays disabled until current capacity evidence is recorded.';

alter table private.learner_profile_maintenance_config enable row level security;
revoke all on table private.learner_profile_maintenance_config
  from public, anon, authenticated, service_role;

create table private.learner_profile_capacity_checks (
  singleton boolean primary key default true,
  checked_at timestamptz not null,
  database_size_bytes bigint not null,
  database_limit_bytes bigint not null,
  warning_threshold_bytes bigint not null,
  pause_threshold_bytes bigint not null,
  profile_count bigint not null,
  version_count bigint not null,
  profile_payload_bytes bigint not null,
  profile_payload_p50_bytes bigint,
  profile_payload_p95_bytes bigint,
  profile_payload_max_bytes bigint,
  protected_version_count bigint not null,
  protected_version_payload_bytes bigint not null,
  protected_candidate_payload_bytes bigint not null,
  protected_projected_cost_bytes bigint not null,
  ordinary_eligible_version_count bigint not null,
  ordinary_prunable_version_count bigint not null,
  profile_relation_bytes bigint not null,
  operational_relation_bytes bigint not null,
  database_read_only boolean not null,
  capacity_status text not null,
  constraint learner_profile_capacity_checks_singleton_check
    check (singleton),
  constraint learner_profile_capacity_checks_status_check
    check (capacity_status in ('ok', 'warning', 'pause')),
  constraint learner_profile_capacity_checks_nonnegative_check
    check (
      database_size_bytes >= 0
      and database_limit_bytes > 0
      and warning_threshold_bytes >= 0
      and pause_threshold_bytes >= 0
      and profile_count >= 0
      and version_count >= 0
      and profile_payload_bytes >= 0
      and coalesce(profile_payload_p50_bytes, 0) >= 0
      and coalesce(profile_payload_p95_bytes, 0) >= 0
      and coalesce(profile_payload_max_bytes, 0) >= 0
      and protected_version_count >= 0
      and protected_version_payload_bytes >= 0
      and protected_candidate_payload_bytes >= 0
      and protected_projected_cost_bytes >= 0
      and ordinary_eligible_version_count >= 0
      and ordinary_prunable_version_count >= 0
      and profile_relation_bytes >= 0
      and operational_relation_bytes >= 0
    )
);

comment on table private.learner_profile_capacity_checks is
  'Latest aggregate capacity evidence. It intentionally contains no owner identity or profile payload.';

comment on column private.learner_profile_capacity_checks.protected_projected_cost_bytes is
  'Raw protected payload and conflict-candidate bytes multiplied by the documented 2x planning factor.';

alter table private.learner_profile_capacity_checks enable row level security;
revoke all on table private.learner_profile_capacity_checks
  from public, anon, authenticated, service_role;

create or replace function private.learner_profile_capacity_report(
  p_owner_id uuid
)
returns table (
  capacity_status text,
  cleanup_allowed boolean,
  cleanup_enabled boolean,
  capacity_evidence_current boolean,
  capacity_policy_current boolean,
  database_size_bytes bigint,
  database_plan text,
  database_limit_bytes bigint,
  warning_threshold_bytes bigint,
  pause_threshold_bytes bigint,
  database_read_only boolean,
  profile_count bigint,
  version_count bigint,
  profile_payload_bytes bigint,
  profile_payload_p50_bytes bigint,
  profile_payload_p95_bytes bigint,
  profile_payload_max_bytes bigint,
  protected_version_count bigint,
  protected_version_payload_bytes bigint,
  protected_candidate_payload_bytes bigint,
  protected_projected_cost_bytes bigint,
  ordinary_eligible_version_count bigint,
  ordinary_prunable_version_count bigint,
  profile_relation_bytes bigint,
  operational_relation_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with config as (
    select value.*
    from private.learner_profile_maintenance_config as value
    where value.singleton
  ),
  protected_version_ids as (
    select head.current_version_id as version_id, head.user_id
    from public.learner_profile_heads as head
    where p_owner_id is null or head.user_id = p_owner_id

    union

    select conflict.cloud_version_id, conflict.user_id
    from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and (
        conflict.state = 'open'
        or conflict.protected_until > pg_catalog.now()
        or exists (
          select 1
          from private.learner_profile_recoveries as recovery
          where recovery.source_candidate_id = conflict.id
        )
      )

    union

    select conflict.selected_version_id, conflict.user_id
    from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and conflict.selected_version_id is not null
      and (
        conflict.protected_until > pg_catalog.now()
        or exists (
          select 1
          from private.learner_profile_recoveries as recovery
          where recovery.source_candidate_id = conflict.id
        )
      )

    union

    select reset.prior_version_id, reset.user_id
    from private.learner_profile_resets as reset
    where (p_owner_id is null or reset.user_id = p_owner_id)
      and reset.protected_until > pg_catalog.now()

    union

    select reset.reset_version_id, reset.user_id
    from private.learner_profile_resets as reset
    where (p_owner_id is null or reset.user_id = p_owner_id)
      and reset.protected_until > pg_catalog.now()

    union

    select reset.restored_version_id, reset.user_id
    from private.learner_profile_resets as reset
    where (p_owner_id is null or reset.user_id = p_owner_id)
      and reset.restored_version_id is not null
      and reset.protected_until > pg_catalog.now()

    union

    select backup.previous_version_id, backup.user_id
    from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.protected_until > pg_catalog.now()

    union

    select backup.imported_version_id, backup.user_id
    from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.imported_version_id is not null
      and backup.protected_until > pg_catalog.now()

    union

    select backup.restored_version_id, backup.user_id
    from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.restored_version_id is not null
      and backup.protected_until > pg_catalog.now()

    union

    select recovery.restored_version_id, recovery.user_id
    from private.learner_profile_recoveries as recovery
    where (p_owner_id is null or recovery.user_id = p_owner_id)
      and recovery.protected_until > pg_catalog.now()

    union

    select recovery.displaced_version_id, recovery.user_id
    from private.learner_profile_recoveries as recovery
    where (p_owner_id is null or recovery.user_id = p_owner_id)
      and recovery.displaced_version_id is not null
      and recovery.protected_until > pg_catalog.now()

    union

    select receipt.version_id, receipt.user_id
    from private.learner_profile_accountless_migration_receipts as receipt
    where p_owner_id is null or receipt.user_id = p_owner_id
  ),
  version_metrics as (
    select
      count(*)::bigint as version_count
    from public.learner_profile_versions as version
    where p_owner_id is null or version.user_id = p_owner_id
  ),
  profile_metrics as (
    select
      coalesce(sum(version.payload_bytes), 0)::bigint
        as profile_payload_bytes,
      percentile_cont(0.5) within group (
        order by version.payload_bytes
      )::bigint as profile_payload_p50_bytes,
      percentile_cont(0.95) within group (
        order by version.payload_bytes
      )::bigint as profile_payload_p95_bytes,
      coalesce(max(version.payload_bytes), 0)::bigint
        as profile_payload_max_bytes
    from public.learner_profile_heads as head
    join public.learner_profile_versions as version
      on version.id = head.current_version_id
     and version.user_id = head.user_id
     and version.profile_id = head.profile_id
    where p_owner_id is null or head.user_id = p_owner_id
  ),
  protected_metrics as (
    select
      count(*)::bigint as protected_version_count,
      coalesce(sum(version.payload_bytes), 0)::bigint
        as protected_version_payload_bytes
    from protected_version_ids as protected
    join public.learner_profile_versions as version
      on version.id = protected.version_id
     and version.user_id = protected.user_id
  ),
  candidate_metrics as (
    select coalesce(sum(conflict.device_payload_bytes), 0)::bigint
      as protected_candidate_payload_bytes
    from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and (
        conflict.state = 'open'
        or conflict.protected_until > pg_catalog.now()
        or exists (
          select 1
          from private.learner_profile_recoveries as recovery
          where recovery.source_candidate_id = conflict.id
        )
      )
  ),
  ordinary_ranked as (
    select
      version.id,
      row_number() over (
        partition by version.profile_id
        order by version.created_at desc, version.id desc
      ) as ordinary_rank
    from public.learner_profile_versions as version
    where (p_owner_id is null or version.user_id = p_owner_id)
      and not exists (
        select 1
        from protected_version_ids as protected
        where protected.version_id = version.id
          and protected.user_id = version.user_id
      )
  ),
  ordinary_metrics as (
    select
      count(*)::bigint as ordinary_eligible_version_count,
      count(*) filter (
        where ordinary_rank > config.ordinary_retention_count
      )::bigint as ordinary_prunable_version_count
    from ordinary_ranked
    cross join config
  ),
  database_metrics as (
    select
      pg_catalog.pg_database_size(pg_catalog.current_database())::bigint
        as database_size_bytes,
      (
        pg_catalog.current_setting('transaction_read_only', true) = 'on'
        or pg_catalog.current_setting('default_transaction_read_only', true) = 'on'
        or pg_catalog.pg_is_in_recovery()
      ) as database_read_only
  ),
  relation_metrics as (
    select
      (
        pg_catalog.pg_total_relation_size(
          'public.learner_profile_versions'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'public.learner_profile_heads'::pg_catalog.regclass
        )
      )::bigint as profile_relation_bytes,
      (
        pg_catalog.pg_total_relation_size(
          'public.learner_profile_write_receipts'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_conflicts'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_resets'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_import_backups'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_recoveries'::pg_catalog.regclass
        )
        + pg_catalog.pg_total_relation_size(
          'private.learner_profile_accountless_migration_receipts'::pg_catalog.regclass
        )
      )::bigint as operational_relation_bytes
  ),
  evidence as (
    select exists (
      select 1
      from private.learner_profile_capacity_checks as check_row
      cross join config
      where check_row.singleton
        and check_row.checked_at > pg_catalog.now() - interval '7 days'
        and check_row.database_limit_bytes = config.database_limit_bytes
        and check_row.warning_threshold_bytes = floor(
          config.database_limit_bytes::numeric * config.warning_fraction
        )::bigint
        and check_row.pause_threshold_bytes = floor(
          config.database_limit_bytes::numeric * config.pause_fraction
        )::bigint
    ) as capacity_evidence_current
  ),
  policy as (
    select exists (
      select 1
      from config
      where config.database_limit_verified_at
          > pg_catalog.now() - interval '7 days'
        and config.pause_restore_constraints_verified_at
          > pg_catalog.now() - interval '7 days'
    ) as capacity_policy_current
  ),
  metrics as (
    select
      case
        when database_metrics.database_size_bytes >= floor(
          config.database_limit_bytes::numeric * config.pause_fraction
        )::bigint then 'pause'::text
        when database_metrics.database_size_bytes >= floor(
          config.database_limit_bytes::numeric * config.warning_fraction
        )::bigint then 'warning'::text
        else 'ok'::text
      end as capacity_status,
      config.cleanup_enabled,
      config.database_plan,
      config.database_limit_bytes,
      floor(
        config.database_limit_bytes::numeric * config.warning_fraction
      )::bigint as warning_threshold_bytes,
      floor(
        config.database_limit_bytes::numeric * config.pause_fraction
      )::bigint as pause_threshold_bytes,
      database_metrics.*,
      version_metrics.*,
      profile_metrics.*,
      protected_metrics.*,
      candidate_metrics.*,
      (
        (
          protected_metrics.protected_version_payload_bytes
          + candidate_metrics.protected_candidate_payload_bytes
        ) * 2
      )::bigint as protected_projected_cost_bytes,
      ordinary_metrics.*,
      relation_metrics.*,
      evidence.capacity_evidence_current,
      policy.capacity_policy_current,
      count(distinct head.user_id)::bigint as profile_count
    from config
    cross join database_metrics
    cross join version_metrics
    cross join profile_metrics
    cross join protected_metrics
    cross join candidate_metrics
    cross join ordinary_metrics
    cross join relation_metrics
    cross join evidence
    cross join policy
    left join public.learner_profile_heads as head
      on p_owner_id is null or head.user_id = p_owner_id
    group by
      config.cleanup_enabled,
      config.database_plan,
      config.database_limit_bytes,
      config.warning_fraction,
      config.pause_fraction,
      database_metrics.database_size_bytes,
      database_metrics.database_read_only,
      version_metrics.version_count,
      profile_metrics.profile_payload_bytes,
      profile_metrics.profile_payload_p50_bytes,
      profile_metrics.profile_payload_p95_bytes,
      profile_metrics.profile_payload_max_bytes,
      protected_metrics.protected_version_count,
      protected_metrics.protected_version_payload_bytes,
      candidate_metrics.protected_candidate_payload_bytes,
      ordinary_metrics.ordinary_eligible_version_count,
      ordinary_metrics.ordinary_prunable_version_count,
      relation_metrics.profile_relation_bytes,
      relation_metrics.operational_relation_bytes,
      evidence.capacity_evidence_current,
      policy.capacity_policy_current
  )
  select
    metrics.capacity_status,
    (
      metrics.cleanup_enabled
      and metrics.capacity_policy_current
      and metrics.capacity_evidence_current
      and not metrics.database_read_only
      and metrics.capacity_status <> 'pause'
    ) as cleanup_allowed,
    metrics.cleanup_enabled,
    metrics.capacity_evidence_current,
    metrics.capacity_policy_current,
    metrics.database_size_bytes,
    metrics.database_plan,
    metrics.database_limit_bytes,
    metrics.warning_threshold_bytes,
    metrics.pause_threshold_bytes,
    metrics.database_read_only,
    metrics.profile_count,
    metrics.version_count,
    metrics.profile_payload_bytes,
    metrics.profile_payload_p50_bytes,
    metrics.profile_payload_p95_bytes,
    metrics.profile_payload_max_bytes,
    metrics.protected_version_count,
    metrics.protected_version_payload_bytes,
    metrics.protected_candidate_payload_bytes,
    metrics.protected_projected_cost_bytes,
    metrics.ordinary_eligible_version_count,
    metrics.ordinary_prunable_version_count,
    metrics.profile_relation_bytes,
    metrics.operational_relation_bytes
  from metrics;
$$;

revoke execute on function private.learner_profile_capacity_report(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.learner_profile_capacity_report(uuid)
  to service_role;

create or replace function private.record_learner_profile_capacity_policy(
  p_database_plan text,
  p_database_limit_bytes bigint,
  p_pause_behavior text,
  p_restore_behavior text
)
returns table (
  status text,
  database_plan text,
  database_limit_bytes bigint,
  pause_behavior text,
  restore_behavior text,
  warning_threshold_bytes bigint,
  pause_threshold_bytes bigint,
  verified_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  verified_at timestamptz := pg_catalog.now();
begin
  if p_database_plan is null
    or pg_catalog.length(pg_catalog.btrim(p_database_plan)) not between 1 and 64
    or p_database_limit_bytes is null
    or p_database_limit_bytes <= 0
    or p_pause_behavior is null
    or pg_catalog.length(pg_catalog.btrim(p_pause_behavior)) not between 1 and 256
    or p_restore_behavior is null
    or pg_catalog.length(pg_catalog.btrim(p_restore_behavior)) not between 1 and 256
  then
    raise exception 'Capacity policy evidence is invalid' using errcode = '22023';
  end if;

  update private.learner_profile_maintenance_config as config
  set database_plan = pg_catalog.btrim(p_database_plan),
      database_limit_bytes = p_database_limit_bytes,
      database_limit_verified_at = verified_at,
      pause_behavior = pg_catalog.btrim(p_pause_behavior),
      restore_behavior = pg_catalog.btrim(p_restore_behavior),
      pause_restore_constraints_verified_at = verified_at,
      cleanup_enabled = false,
      updated_at = verified_at
  where config.singleton;

  return query
  select
    'recorded'::text,
    config.database_plan,
    config.database_limit_bytes,
    config.pause_behavior,
    config.restore_behavior,
    floor(
      config.database_limit_bytes::numeric * config.warning_fraction
    )::bigint,
    floor(
      config.database_limit_bytes::numeric * config.pause_fraction
    )::bigint,
    verified_at
  from private.learner_profile_maintenance_config as config
  where config.singleton;
end;
$$;

revoke execute on function
  private.record_learner_profile_capacity_policy(text, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  private.record_learner_profile_capacity_policy(text, bigint, text, text)
  to service_role;

create or replace function private.record_learner_profile_capacity_check()
returns table (
  capacity_status text,
  cleanup_allowed boolean,
  cleanup_enabled boolean,
  capacity_evidence_current boolean,
  capacity_policy_current boolean,
  database_size_bytes bigint,
  database_plan text,
  database_limit_bytes bigint,
  warning_threshold_bytes bigint,
  pause_threshold_bytes bigint,
  database_read_only boolean,
  profile_count bigint,
  version_count bigint,
  profile_payload_bytes bigint,
  profile_payload_p50_bytes bigint,
  profile_payload_p95_bytes bigint,
  profile_payload_max_bytes bigint,
  protected_version_count bigint,
  protected_version_payload_bytes bigint,
  protected_candidate_payload_bytes bigint,
  protected_projected_cost_bytes bigint,
  ordinary_eligible_version_count bigint,
  ordinary_prunable_version_count bigint,
  profile_relation_bytes bigint,
  operational_relation_bytes bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  report record;
begin
  select * into strict report
  from private.learner_profile_capacity_report(null);

  insert into private.learner_profile_capacity_checks (
    singleton,
    checked_at,
    database_size_bytes,
    database_limit_bytes,
    warning_threshold_bytes,
    pause_threshold_bytes,
    profile_count,
    version_count,
    profile_payload_bytes,
    profile_payload_p50_bytes,
    profile_payload_p95_bytes,
    profile_payload_max_bytes,
    protected_version_count,
    protected_version_payload_bytes,
    protected_candidate_payload_bytes,
    protected_projected_cost_bytes,
    ordinary_eligible_version_count,
    ordinary_prunable_version_count,
    profile_relation_bytes,
    operational_relation_bytes,
    database_read_only,
    capacity_status
  ) values (
    true,
    pg_catalog.now(),
    report.database_size_bytes,
    report.database_limit_bytes,
    report.warning_threshold_bytes,
    report.pause_threshold_bytes,
    report.profile_count,
    report.version_count,
    report.profile_payload_bytes,
    report.profile_payload_p50_bytes,
    report.profile_payload_p95_bytes,
    report.profile_payload_max_bytes,
    report.protected_version_count,
    report.protected_version_payload_bytes,
    report.protected_candidate_payload_bytes,
    report.protected_projected_cost_bytes,
    report.ordinary_eligible_version_count,
    report.ordinary_prunable_version_count,
    report.profile_relation_bytes,
    report.operational_relation_bytes,
    report.database_read_only,
    report.capacity_status
  )
  on conflict (singleton) do update
  set checked_at = excluded.checked_at,
      database_size_bytes = excluded.database_size_bytes,
      database_limit_bytes = excluded.database_limit_bytes,
      warning_threshold_bytes = excluded.warning_threshold_bytes,
      pause_threshold_bytes = excluded.pause_threshold_bytes,
      profile_count = excluded.profile_count,
      version_count = excluded.version_count,
      profile_payload_bytes = excluded.profile_payload_bytes,
      profile_payload_p50_bytes = excluded.profile_payload_p50_bytes,
      profile_payload_p95_bytes = excluded.profile_payload_p95_bytes,
      profile_payload_max_bytes = excluded.profile_payload_max_bytes,
      protected_version_count = excluded.protected_version_count,
      protected_version_payload_bytes = excluded.protected_version_payload_bytes,
      protected_candidate_payload_bytes = excluded.protected_candidate_payload_bytes,
      protected_projected_cost_bytes = excluded.protected_projected_cost_bytes,
      ordinary_eligible_version_count = excluded.ordinary_eligible_version_count,
      ordinary_prunable_version_count = excluded.ordinary_prunable_version_count,
      profile_relation_bytes = excluded.profile_relation_bytes,
      operational_relation_bytes = excluded.operational_relation_bytes,
      database_read_only = excluded.database_read_only,
      capacity_status = excluded.capacity_status;

  return query
  select *
  from private.learner_profile_capacity_report(null);
end;
$$;

revoke execute on function private.record_learner_profile_capacity_check()
  from public, anon, authenticated, service_role;
grant execute on function private.record_learner_profile_capacity_check()
  to service_role;

create or replace function private.set_learner_profile_cleanup_enabled(
  p_enabled boolean
)
returns table (
  status text,
  cleanup_enabled boolean,
  capacity_status text,
  capacity_evidence_current boolean,
  capacity_policy_current boolean,
  database_read_only boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  report record;
begin
  if p_enabled is null then
    raise exception 'Cleanup enablement is invalid' using errcode = '22023';
  end if;

  select * into strict report
  from private.learner_profile_capacity_report(null);

  if p_enabled and (
    not report.capacity_evidence_current
    or not report.capacity_policy_current
    or report.database_read_only
    or report.capacity_status = 'pause'
  ) then
    return query select
      'not_enabled'::text,
      report.cleanup_enabled,
      report.capacity_status,
      report.capacity_evidence_current,
      report.capacity_policy_current,
      report.database_read_only;
    return;
  end if;

  update private.learner_profile_maintenance_config as config
  set cleanup_enabled = p_enabled,
      updated_at = pg_catalog.now()
  where config.singleton;

  select * into strict report
  from private.learner_profile_capacity_report(null);

  return query select
    case when p_enabled then 'enabled' else 'disabled' end,
    report.cleanup_enabled,
    report.capacity_status,
    report.capacity_evidence_current,
    report.capacity_policy_current,
    report.database_read_only;
end;
$$;

revoke execute on function private.set_learner_profile_cleanup_enabled(boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.set_learner_profile_cleanup_enabled(boolean)
  to service_role;

create or replace function private.run_learner_profile_maintenance(
  p_owner_id uuid,
  p_apply boolean
)
returns table (
  status text,
  capacity_status text,
  cleanup_allowed boolean,
  cleanup_enabled boolean,
  capacity_evidence_current boolean,
  database_read_only boolean,
  deleted_ordinary_versions bigint,
  deleted_expired_conflicts bigint,
  deleted_expired_import_backups bigint,
  deleted_expired_resets bigint,
  deleted_expired_recoveries bigint,
  database_size_bytes bigint,
  database_limit_bytes bigint,
  warning_threshold_bytes bigint,
  pause_threshold_bytes bigint,
  ordinary_eligible_version_count bigint,
  ordinary_prunable_version_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  report record;
  final_report record;
  deleted_ordinary bigint := 0;
  deleted_conflicts bigint := 0;
  deleted_import_backups bigint := 0;
  deleted_resets bigint := 0;
  deleted_recoveries bigint := 0;
  operation_status text;
begin
  if p_apply is null then
    raise exception 'Maintenance apply mode is invalid' using errcode = '22023';
  end if;

  lock table
    public.learner_profile_heads,
    public.learner_profile_versions,
    public.learner_profile_write_receipts,
    private.learner_profile_conflicts,
    private.learner_profile_import_backups,
    private.learner_profile_resets,
    private.learner_profile_recoveries,
    private.learner_profile_accountless_migration_receipts
    in share row exclusive mode;

  select * into strict report
  from private.learner_profile_capacity_report(p_owner_id);

  if not p_apply then
    operation_status := 'dry_run';
  elsif report.database_read_only then
    operation_status := 'read_only';
  elsif report.capacity_status = 'pause' then
    operation_status := 'capacity_pause';
  elsif not report.cleanup_enabled then
    operation_status := 'disabled';
  elsif not report.capacity_evidence_current then
    operation_status := 'evidence_required';
  elsif not report.cleanup_allowed then
    operation_status := 'not_allowed';
  else
    delete from private.learner_profile_recoveries as recovery
    where (p_owner_id is null or recovery.user_id = p_owner_id)
      and recovery.protected_until <= pg_catalog.now();
    get diagnostics deleted_recoveries = row_count;

    delete from private.learner_profile_conflicts as conflict
    where (p_owner_id is null or conflict.user_id = p_owner_id)
      and conflict.state = 'resolved'
      and conflict.protected_until <= pg_catalog.now()
      and not exists (
        select 1
        from private.learner_profile_recoveries as recovery
        where recovery.source_candidate_id = conflict.id
      );
    get diagnostics deleted_conflicts = row_count;

    delete from private.learner_profile_import_backups as backup
    where (p_owner_id is null or backup.user_id = p_owner_id)
      and backup.protected_until <= pg_catalog.now();
    get diagnostics deleted_import_backups = row_count;

    delete from private.learner_profile_resets as reset_record
    where (p_owner_id is null or reset_record.user_id = p_owner_id)
      and reset_record.protected_until <= pg_catalog.now();
    get diagnostics deleted_resets = row_count;

    with protected_version_ids as (
      select head.current_version_id as version_id, head.user_id
      from public.learner_profile_heads as head
      where p_owner_id is null or head.user_id = p_owner_id

      union

      select conflict.cloud_version_id, conflict.user_id
      from private.learner_profile_conflicts as conflict
      where (p_owner_id is null or conflict.user_id = p_owner_id)
        and (
          conflict.state = 'open'
          or conflict.protected_until > pg_catalog.now()
          or exists (
            select 1
            from private.learner_profile_recoveries as recovery
            where recovery.source_candidate_id = conflict.id
          )
        )

      union

      select conflict.selected_version_id, conflict.user_id
      from private.learner_profile_conflicts as conflict
      where (p_owner_id is null or conflict.user_id = p_owner_id)
        and conflict.selected_version_id is not null
        and (
          conflict.protected_until > pg_catalog.now()
          or exists (
            select 1
            from private.learner_profile_recoveries as recovery
            where recovery.source_candidate_id = conflict.id
          )
        )

      union

      select reset_record.prior_version_id, reset_record.user_id
      from private.learner_profile_resets as reset_record
      where (p_owner_id is null or reset_record.user_id = p_owner_id)
        and reset_record.protected_until > pg_catalog.now()

      union

      select reset_record.reset_version_id, reset_record.user_id
      from private.learner_profile_resets as reset_record
      where (p_owner_id is null or reset_record.user_id = p_owner_id)
        and reset_record.protected_until > pg_catalog.now()

      union

      select reset_record.restored_version_id, reset_record.user_id
      from private.learner_profile_resets as reset_record
      where (p_owner_id is null or reset_record.user_id = p_owner_id)
        and reset_record.restored_version_id is not null
        and reset_record.protected_until > pg_catalog.now()

      union

      select backup.previous_version_id, backup.user_id
      from private.learner_profile_import_backups as backup
      where (p_owner_id is null or backup.user_id = p_owner_id)
        and backup.protected_until > pg_catalog.now()

      union

      select backup.imported_version_id, backup.user_id
      from private.learner_profile_import_backups as backup
      where (p_owner_id is null or backup.user_id = p_owner_id)
        and backup.imported_version_id is not null
        and backup.protected_until > pg_catalog.now()

      union

      select backup.restored_version_id, backup.user_id
      from private.learner_profile_import_backups as backup
      where (p_owner_id is null or backup.user_id = p_owner_id)
        and backup.restored_version_id is not null
        and backup.protected_until > pg_catalog.now()

      union

      select recovery.restored_version_id, recovery.user_id
      from private.learner_profile_recoveries as recovery
      where (p_owner_id is null or recovery.user_id = p_owner_id)
        and recovery.protected_until > pg_catalog.now()

      union

      select recovery.displaced_version_id, recovery.user_id
      from private.learner_profile_recoveries as recovery
      where (p_owner_id is null or recovery.user_id = p_owner_id)
        and recovery.displaced_version_id is not null
        and recovery.protected_until > pg_catalog.now()

      union

      select receipt.version_id, receipt.user_id
      from private.learner_profile_accountless_migration_receipts as receipt
      where p_owner_id is null or receipt.user_id = p_owner_id
    ),
    ranked_candidates as (
      select
        version.id,
        row_number() over (
          partition by version.profile_id
          order by version.created_at desc, version.id desc
        ) as ordinary_rank
      from public.learner_profile_versions as version
      where (p_owner_id is null or version.user_id = p_owner_id)
        and not exists (
          select 1
          from protected_version_ids as protected
          where protected.version_id = version.id
            and protected.user_id = version.user_id
        )
    ),
    deleted as (
      delete from public.learner_profile_versions as version
      using ranked_candidates as candidate
      where version.id = candidate.id
        and candidate.ordinary_rank > (
          select ordinary_retention_count
          from private.learner_profile_maintenance_config
          where singleton
        )
      returning version.id
    )
    select count(*)::bigint into deleted_ordinary
    from deleted;

    if p_owner_id is null then
      perform private.record_learner_profile_capacity_check();
    end if;
    operation_status := 'applied';
  end if;

  select * into strict final_report
  from private.learner_profile_capacity_report(p_owner_id);

  return query select
    operation_status,
    final_report.capacity_status,
    final_report.cleanup_allowed,
    final_report.cleanup_enabled,
    final_report.capacity_evidence_current,
    final_report.database_read_only,
    deleted_ordinary,
    deleted_conflicts,
    deleted_import_backups,
    deleted_resets,
    deleted_recoveries,
    final_report.database_size_bytes,
    final_report.database_limit_bytes,
    final_report.warning_threshold_bytes,
    final_report.pause_threshold_bytes,
    final_report.ordinary_eligible_version_count,
    final_report.ordinary_prunable_version_count;
end;
$$;

revoke execute on function
  private.run_learner_profile_maintenance(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  private.run_learner_profile_maintenance(uuid, boolean)
  to service_role;

comment on function private.run_learner_profile_maintenance(uuid, boolean) is
  'Reports or applies owner-scoped learner-profile retention while preserving current heads, protected recovery records, and idempotency receipts.';
