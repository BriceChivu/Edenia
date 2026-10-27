-- Inert scheduler plumbing only. No job, Vault value, delivery switch, or
-- provider attestation is created/enabled by this migration.
create function private.invoke_reminder_dispatcher()
returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text; capability text; request_id bigint;
begin
  if not public.reminder_delivery_is_enabled() then return null; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='reminder_dispatcher_url';
  select decrypted_secret into capability from vault.decrypted_secrets where name='reminder_dispatcher_api_key';
  if endpoint is null or endpoint !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/dispatch-study-reminders$'
    or capability is null or length(capability)<32 or capability ~ '[[:space:]]' then
    raise exception 'reminder_scheduler_configuration_unavailable' using errcode='55000';
  end if;
  select net.http_post(url:=endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','apikey',capability),
    body:='{}'::jsonb,timeout_milliseconds:=10000) into request_id;
  return request_id;
end $$;
revoke all on function private.invoke_reminder_dispatcher() from public,anon,authenticated,service_role;

-- Calling this is an explicit operator activation, never a side effect of
-- deployment. The Cron command contains only this function name; its dedicated
-- rotatable capability remains in Vault and is never copied into cron.job.
create function public.configure_reminder_dispatch_schedule(p_enable boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare job record;
begin
  if p_enable is null then raise exception 'reminder_schedule_choice_required' using errcode='22023'; end if;
  for job in select jobid from cron.job where jobname='edenia-study-reminder-dispatch' loop
    perform cron.unschedule(job.jobid);
  end loop;
  if not p_enable then return false; end if;
  if not public.reminder_delivery_is_enabled() then
    raise exception 'reminder_delivery_disabled' using errcode='55000';
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='reminder_dispatcher_url'
    and decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/dispatch-study-reminders$')
    or not exists(select 1 from vault.decrypted_secrets where name='reminder_dispatcher_api_key'
      and length(decrypted_secret)>=32 and decrypted_secret !~ '[[:space:]]') then
    raise exception 'reminder_scheduler_configuration_unavailable' using errcode='55000';
  end if;
  perform cron.schedule('edenia-study-reminder-dispatch','*/5 * * * *',
    'select private.invoke_reminder_dispatcher();');
  return true;
end $$;
revoke all on function public.configure_reminder_dispatch_schedule(boolean) from public,anon,authenticated,service_role;
-- Only the database owner/operator may install a schedule. A dispatch key is
-- deliberately insufficient authority to create or change its own schedule.
comment on function public.configure_reminder_dispatch_schedule(boolean) is 'Operator-only schedule activation; migration does not call it. Delivery remains separately disabled.';
