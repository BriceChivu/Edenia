-- Install transport only. Delivery and Cron activation remain separate,
-- explicit operator actions; no request is queued by this migration.
create extension if not exists pg_net with schema extensions;

-- Validate activation before changing a prior schedule. Rollback must still
-- work when transport has been removed or is unavailable.
create or replace function public.configure_reminder_dispatch_schedule(p_enable boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare job record;
begin
  if p_enable is null then raise exception 'reminder_schedule_choice_required' using errcode='22023'; end if;
  if p_enable then
    if not public.reminder_delivery_is_enabled() then
      raise exception 'reminder_delivery_disabled' using errcode='55000';
    end if;
    if not exists(select 1 from pg_catalog.pg_extension where extname='pg_net')
      or pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
      or pg_catalog.to_regclass('net.http_request_queue') is null then
      raise exception 'reminder_scheduler_transport_unavailable' using errcode='55000';
    end if;
    if not exists(select 1 from vault.decrypted_secrets where name='reminder_dispatcher_url'
      and decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/dispatch-study-reminders$')
      or not exists(select 1 from vault.decrypted_secrets where name='reminder_dispatcher_api_key'
        and length(decrypted_secret)>=32 and decrypted_secret !~ '[[:space:]]') then
      raise exception 'reminder_scheduler_configuration_unavailable' using errcode='55000';
    end if;
  end if;
  for job in select jobid from cron.job where jobname='edenia-study-reminder-dispatch' loop
    perform cron.unschedule(job.jobid);
  end loop;
  if not p_enable then return false; end if;
  perform cron.schedule('edenia-study-reminder-dispatch','*/5 * * * *',
    'select private.invoke_reminder_dispatcher();');
  return true;
end $$;
revoke all on function public.configure_reminder_dispatch_schedule(boolean),
 private.invoke_reminder_dispatcher() from public,anon,authenticated,service_role;
