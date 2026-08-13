-- Remove the authenticated SECURITY DEFINER function from the public Data API.
-- A future authenticated server transport will verify the caller, then pass
-- that verified UUID to the service-role-only bridge below. Browser roles keep
-- no access to the private schema or either privileged function.

alter function public.export_account_server_data()
  set schema private;

revoke all on function private.export_account_server_data()
  from public, anon, authenticated, service_role;

create function public.export_account_server_data_for_service(
  p_verified_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  previous_claim_sub text := pg_catalog.current_setting(
    'request.jwt.claim.sub',
    true
  );
  exported_data jsonb;
begin
  if p_verified_user_id is null or not exists (
    select 1
    from auth.users as account_user
    where account_user.id = p_verified_user_id
  ) then
    raise exception 'account_export_user_not_found'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_verified_user_id::text,
    true
  );

  begin
    exported_data := private.export_account_server_data();
  exception
    when others then
      perform pg_catalog.set_config(
        'request.jwt.claim.sub',
        coalesce(previous_claim_sub, ''),
        true
      );
      raise;
  end;

  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(previous_claim_sub, ''),
    true
  );

  return exported_data;
end
$function$;

comment on function private.export_account_server_data() is
  'Private self-scoped implementation of the account server-data export.';
comment on function public.export_account_server_data_for_service(uuid) is
  'Service-only bridge for a server-verified account export owner UUID.';

revoke all on function public.export_account_server_data_for_service(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.export_account_server_data_for_service(uuid)
  to service_role;
