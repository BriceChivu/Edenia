begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,pg_catalog;
select no_plan();
select ok(not public.reminder_delivery_is_enabled(),'new delivery migration starts disabled');
select is((select count(*) from cron.job where jobname='edenia-study-reminder-dispatch'),0::bigint,'upgrade has no reminder schedule');
select is(private.invoke_reminder_dispatcher(),null::bigint,'disabled scheduler never reads credentials or queues HTTP');
select throws_ok($$select public.configure_reminder_dispatch_schedule(true)$$,'55000','reminder_delivery_disabled','schedule activation requires separate delivery activation');
select is(public.configure_reminder_dispatch_schedule(false),false,'rollback unschedule is idempotent');
select ok(not has_function_privilege('anon','public.configure_reminder_dispatch_schedule(boolean)','execute'),'anonymous cannot schedule');
select ok(not has_function_privilege('authenticated','public.configure_reminder_dispatch_schedule(boolean)','execute'),'browser cannot schedule');
select ok(not has_function_privilege('service_role','public.configure_reminder_dispatch_schedule(boolean)','execute'),'dispatcher cannot schedule itself');
select ok(not has_function_privilege('service_role','private.invoke_reminder_dispatcher()','execute'),'worker cannot extract Vault capability');
select is((select count(*) from net.http_request_queue),0::bigint,'inert preparation makes no HTTP requests');
select ok(exists(select 1 from pg_catalog.pg_extension where extname='pg_net'),'transport migration installs pg_net');
select ok(pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null,
 'installed transport has the exact scheduler HTTP signature');

-- Exercise the production failure with valid, synthetic Vault configuration.
-- Everything is transaction-local. pg_net does not send before commit, and
-- this test always rolls back its secrets, Cron rows and queued request.
do $$ begin
 perform vault.create_secret('https://scheduler-transport-fixture.supabase.co/functions/v1/dispatch-study-reminders',
  'reminder_dispatcher_url');
 perform vault.create_secret('scheduler-test-capability-'||repeat('x',32),'reminder_dispatcher_api_key');
 perform cron.schedule('edenia-study-reminder-dispatch','0 0 1 1 *','select 1;');
end $$;
update private.reminder_delivery_control set delivery_enabled=true;
drop extension pg_net;
select ok(not exists(select 1 from pg_catalog.pg_extension where extname='pg_net'),
 'regression actually removes the network extension');
select throws_ok($$select public.configure_reminder_dispatch_schedule(true)$$,'55000',
 'reminder_scheduler_transport_unavailable','missing transport fails closed despite valid Vault settings');
select is((select schedule from cron.job where jobname='edenia-study-reminder-dispatch'),'0 0 1 1 *',
 'failed activation leaves the prior schedule unchanged');
select is(public.configure_reminder_dispatch_schedule(false),false,'operator can unschedule even without transport');
select is((select count(*) from cron.job where jobname='edenia-study-reminder-dispatch'),0::bigint,
 'transport failure does not prevent rollback');
update private.reminder_delivery_control set delivery_enabled=false;

-- Restore transport here; fresh migration startup separately proves upgrade inertness.
create extension pg_net with schema extensions;
select ok(not public.reminder_delivery_is_enabled(),'transport installation does not enable delivery');
select is((select count(*) from cron.job where jobname='edenia-study-reminder-dispatch'),0::bigint,
 'transport installation does not install a Cron job');
select is((select count(*) from net.http_request_queue),0::bigint,'transport installation never queues HTTP');
select ok(not has_function_privilege(role_name,'public.configure_reminder_dispatch_schedule(boolean)','execute'),
 role_name||' still cannot configure the schedule after transport installation')
 from unnest(array['anon','authenticated','service_role']) role_name;
select ok(not has_function_privilege(role_name,'private.invoke_reminder_dispatcher()','execute'),
 role_name||' still cannot invoke the Vault-backed scheduler helper')
 from unnest(array['anon','authenticated','service_role']) role_name;

update private.reminder_delivery_control set delivery_enabled=true;
select is(public.configure_reminder_dispatch_schedule(true),true,'operator can explicitly activate restored transport');
select is((select command from cron.job where jobname='edenia-study-reminder-dispatch'),
 'select private.invoke_reminder_dispatcher();','Cron contains the private call without a copied secret');
select ok(private.invoke_reminder_dispatcher() is not null,'operator helper can enqueue through restored transport');
select is((select count(*) from net.http_request_queue),1::bigint,'only explicit invocation queues a request');
select is((select headers->>'apikey' from net.http_request_queue),'scheduler-test-capability-'||repeat('x',32),
 'private invocation uses the dedicated synthetic Vault capability');
select is(public.configure_reminder_dispatch_schedule(false),false,'operator can stop the restored schedule');
select * from finish();
rollback;
