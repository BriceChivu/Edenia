-- Keep normal retention bounded at 100 versions. A direct recovery session may
-- lower its batch size while catching up on large portable profiles; the session
-- setting cannot increase the normal cap and disappears on disconnect.
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
          limit least(100, greatest(1, coalesce(
            nullif(current_setting('edenia.retention_batch_limit', true), '')::integer, 100)))
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

