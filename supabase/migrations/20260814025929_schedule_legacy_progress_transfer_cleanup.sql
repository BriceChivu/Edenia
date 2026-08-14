create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'edenia-legacy-progress-transfer-cleanup',
  '*/5 * * * *',
  $job$
    select private.cleanup_legacy_progress_transfers(pg_catalog.now(), 1000);

    delete from cron.job_run_details
    where jobid = (
      select jobid
      from cron.job
      where jobname = 'edenia-legacy-progress-transfer-cleanup'
    )
      and end_time < pg_catalog.now() - interval '30 days';
  $job$
);
