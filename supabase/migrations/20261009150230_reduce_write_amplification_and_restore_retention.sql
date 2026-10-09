-- Retention must remain possible under capacity pressure. Operator approval
-- enables cleanup; fresh measurements and read-write mode remain required.
-- Capacity policy freshness still reports separately for admission decisions.
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
      and metrics.capacity_evidence_current
      and not metrics.database_read_only
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
        and version.id in (
          select id from ranked_candidates
          where ordinary_rank > (select ordinary_retention_count
            from private.learner_profile_maintenance_config where singleton)
          order by ordinary_rank desc, id
          limit 500
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

create or replace function public.sync_my_reminder_eligibility_snapshot(payload jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  synced_at timestamptz := statement_timestamp();
  snapshot_timezone text;
  snapshot_locale text;
  snapshot_language text;
  snapshot_study_date date;
  snapshot_points integer;
  snapshot_last_qualified date;
  snapshot_streak_days integer;
  server_local_date date;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Snapshot payload must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(payload) as supplied(key)
    where supplied.key not in (
      'timezone', 'locale', 'learningLanguage', 'studyDate',
      'pointsToday', 'lastQualifiedStudyDate', 'currentStreakDays', 'channels'
    )
  ) then
    raise exception 'Snapshot payload contains an unsupported field'
      using errcode = '22023';
  end if;

  snapshot_timezone := nullif(btrim(payload ->> 'timezone'), '');
  snapshot_locale := nullif(btrim(payload ->> 'locale'), '');
  snapshot_language := nullif(btrim(payload ->> 'learningLanguage'), '');

  if snapshot_timezone is null
    or length(snapshot_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = snapshot_timezone
    ) then
    raise exception 'Snapshot timezone is invalid' using errcode = '22023';
  end if;
  if snapshot_locale not in ('en', 'zh-Hant', 'zh-Hans', 'es', 'fr') then
    raise exception 'Snapshot locale is invalid' using errcode = '22023';
  end if;
  if snapshot_language is not null and snapshot_language not in (
    'mandarin', 'japanese', 'korean', 'spanish',
    'french', 'german', 'english', 'other'
  ) then
    raise exception 'Snapshot learning language is invalid' using errcode = '22023';
  end if;
  if coalesce(payload ->> 'studyDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Snapshot study date is invalid' using errcode = '22023';
  end if;
  snapshot_study_date := (payload ->> 'studyDate')::date;
  server_local_date := (synced_at at time zone snapshot_timezone)::date;
  if abs(snapshot_study_date - server_local_date) > 1 then
    raise exception 'Snapshot study date is outside the accepted clock boundary'
      using errcode = '22023';
  end if;

  if jsonb_typeof(payload -> 'pointsToday') is distinct from 'number'
    or coalesce(payload ->> 'pointsToday', '') !~ '^\d+$' then
    raise exception 'Snapshot points are invalid' using errcode = '22023';
  end if;
  snapshot_points := (payload ->> 'pointsToday')::integer;
  if snapshot_points not between 0 and 100000 then
    raise exception 'Snapshot points are outside the accepted range'
      using errcode = '22023';
  end if;

  if jsonb_typeof(payload -> 'currentStreakDays') is distinct from 'number'
    or coalesce(payload ->> 'currentStreakDays', '') !~ '^\d+$' then
    raise exception 'Snapshot streak is invalid' using errcode = '22023';
  end if;
  snapshot_streak_days := (payload ->> 'currentStreakDays')::integer;
  if snapshot_streak_days not between 0 and 10000 then
    raise exception 'Snapshot streak is outside the accepted range'
      using errcode = '22023';
  end if;

  if payload ->> 'lastQualifiedStudyDate' is not null then
    if (payload ->> 'lastQualifiedStudyDate') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Snapshot last qualified date is invalid'
        using errcode = '22023';
    end if;
    snapshot_last_qualified := (payload ->> 'lastQualifiedStudyDate')::date;
    if snapshot_last_qualified > snapshot_study_date then
      raise exception 'Snapshot last qualified date cannot be in the future'
        using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(payload -> 'channels') is distinct from 'array'
    or jsonb_array_length(payload -> 'channels') > 250 then
    raise exception 'Snapshot channels are invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload -> 'channels') as channel(value)
    where jsonb_typeof(channel.value) is distinct from 'object'
      or coalesce(channel.value ->> 'channelId', '') !~ '^UC[A-Za-z0-9_-]{20,}$'
      or length(coalesce(nullif(btrim(channel.value ->> 'channelName'), ''), '')) not between 1 and 200
      or (
        nullif(channel.value ->> 'latestVideoId', '') is null
        and (
          nullif(channel.value ->> 'latestVideoTitle', '') is not null
          or nullif(channel.value ->> 'latestVideoPublishedAt', '') is not null
        )
      )
      or (
        nullif(channel.value ->> 'latestVideoId', '') is not null
        and (
          (channel.value ->> 'latestVideoId') !~ '^[A-Za-z0-9_-]{11}$'
          or length(coalesce(nullif(btrim(channel.value ->> 'latestVideoTitle'), ''), '')) not between 1 and 300
          or nullif(channel.value ->> 'latestVideoPublishedAt', '') is null
        )
      )
      or (
        nullif(channel.value ->> 'streakVideoId', '') is null
        and (
          nullif(channel.value ->> 'streakVideoTitle', '') is not null
          or nullif(channel.value ->> 'streakVideoPublishedAt', '') is not null
        )
      )
      or (
        nullif(channel.value ->> 'streakVideoId', '') is not null
        and (
          (channel.value ->> 'streakVideoId') !~ '^[A-Za-z0-9_-]{11}$'
          or length(coalesce(nullif(btrim(channel.value ->> 'streakVideoTitle'), ''), '')) not between 1 and 300
          or nullif(channel.value ->> 'streakVideoPublishedAt', '') is null
        )
      )
  ) then
    raise exception 'Snapshot contains an invalid channel' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload -> 'channels') as channel(value)
    group by channel.value ->> 'channelId'
    having count(*) > 1
  ) then
    raise exception 'Snapshot contains duplicate channels' using errcode = '22023';
  end if;

  -- Serialize same-owner replacements without blocking other owners.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 814));

  insert into public.reminder_eligibility_snapshots as existing (
    user_id,
    timezone,
    locale,
    learning_language,
    study_date,
    points_today,
    last_qualified_study_date,
    current_streak_days,
    updated_at
  ) values (
    owner_id,
    snapshot_timezone,
    snapshot_locale,
    snapshot_language,
    snapshot_study_date,
    snapshot_points,
    snapshot_last_qualified,
    snapshot_streak_days,
    synced_at
  )
  on conflict (user_id) do update
  set timezone = excluded.timezone,
      locale = excluded.locale,
      learning_language = excluded.learning_language,
      study_date = excluded.study_date,
      points_today = excluded.points_today,
      last_qualified_study_date = excluded.last_qualified_study_date,
      current_streak_days = excluded.current_streak_days,
      updated_at = excluded.updated_at
  where row(existing.timezone, existing.locale, existing.learning_language, existing.study_date, existing.points_today, existing.last_qualified_study_date, existing.current_streak_days)
    is distinct from row(excluded.timezone, excluded.locale, excluded.learning_language, excluded.study_date, excluded.points_today, excluded.last_qualified_study_date, excluded.current_streak_days)
    or existing.updated_at < synced_at - interval '1 day';

  delete from public.reminder_channel_follows
  where user_id = owner_id
    and not exists (select 1 from jsonb_array_elements(payload -> 'channels') as channel(value)
      where channel.value ->> 'channelId' = reminder_channel_follows.channel_id);

  insert into public.reminder_channel_follows as existing (
    user_id,
    channel_id,
    channel_name,
    latest_video_id,
    latest_video_title,
    latest_video_published_at,
    streak_video_id,
    streak_video_title,
    streak_video_published_at,
    updated_at
  )
  select
    owner_id,
    channel.value ->> 'channelId',
    btrim(channel.value ->> 'channelName'),
    nullif(channel.value ->> 'latestVideoId', ''),
    nullif(btrim(channel.value ->> 'latestVideoTitle'), ''),
    nullif(channel.value ->> 'latestVideoPublishedAt', '')::timestamptz,
    nullif(channel.value ->> 'streakVideoId', ''),
    nullif(btrim(channel.value ->> 'streakVideoTitle'), ''),
    nullif(channel.value ->> 'streakVideoPublishedAt', '')::timestamptz,
    synced_at
  from jsonb_array_elements(payload -> 'channels') as channel(value)
  on conflict (user_id, channel_id) do update
  set channel_name = excluded.channel_name,
      latest_video_id = excluded.latest_video_id,
      latest_video_title = excluded.latest_video_title,
      latest_video_published_at = excluded.latest_video_published_at,
      streak_video_id = excluded.streak_video_id,
      streak_video_title = excluded.streak_video_title,
      streak_video_published_at = excluded.streak_video_published_at,
      updated_at = excluded.updated_at
  where row(existing.channel_name, existing.latest_video_id, existing.latest_video_title, existing.latest_video_published_at, existing.streak_video_id, existing.streak_video_title, existing.streak_video_published_at)
    is distinct from row(excluded.channel_name, excluded.latest_video_id, excluded.latest_video_title, excluded.latest_video_published_at, excluded.streak_video_id, excluded.streak_video_title, excluded.streak_video_published_at)
    or existing.updated_at < synced_at - interval '1 day';

  return synced_at;
end;
$$;

revoke all on function public.sync_my_reminder_eligibility_snapshot(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_my_reminder_eligibility_snapshot(jsonb)
  to authenticated;

comment on function public.sync_my_reminder_eligibility_snapshot(jsonb) is
  'Atomically replaces the authenticated owner''s derived reminder eligibility snapshot; ownership is never accepted from the caller.';

-- Retention no longer depends on the retired Auth experiment or a weekly backup.
select cron.schedule('edenia-learner-profile-retention', '*/10 * * * *', $job$
  set lock_timeout = '5s';
  set statement_timeout = '60s';
  select private.record_learner_profile_capacity_check();
  select private.run_learner_profile_maintenance(null, true);
  delete from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'edenia-learner-profile-retention')
    and end_time < now() - interval '7 days';
$job$);
