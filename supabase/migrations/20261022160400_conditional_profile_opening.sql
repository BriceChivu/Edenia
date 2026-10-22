-- Keep the existing resolver's ownership, rollout, validation and recovery
-- checks. Only the response transport changes; old clients keep their RPC.
create function learner_profile_rpc.open_my_learner_profile(
  p_onboarding_profile jsonb default null,
  p_cached_profile_id uuid default null,
  p_cached_generation bigint default null,
  p_cached_revision bigint default null,
  p_cached_profile_sha256 text default null
)
returns table (
  status text, created boolean, profile_id uuid, generation bigint,
  revision bigint, envelope jsonb, profile_sha256 text, reset_state jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  opened record;
  content_hash text;
  reset_receipt jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select result.* into strict opened
  from learner_profile_rpc.resolve_my_learner_profile(p_onboarding_profile) as result;
  if opened.status = 'profile_ready' then
    -- Resolution holds the existing owner/head locks through this receipt read.
    select pg_catalog.to_jsonb(receipt) into reset_receipt
    from learner_profile_rpc.read_my_latest_learner_profile_reset() as receipt;
    if opened.created = false
      and opened.profile_id = p_cached_profile_id
      and opened.generation = p_cached_generation
      and opened.revision = p_cached_revision
      and p_cached_profile_sha256 ~ '^[A-Za-z0-9_-]{43}$'
    then
      content_hash := pg_catalog.rtrim(pg_catalog.translate(pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(
          private.canonical_jsonb_text(opened.envelope -> 'profile'), 'UTF8'
        ), 'sha256'), 'base64'), '+/', '-_'), '=');
      if content_hash = p_cached_profile_sha256 then
        return query select 'profile_unchanged'::text, false,
          opened.profile_id, opened.generation, opened.revision, null::jsonb,
          content_hash, reset_receipt;
        return;
      end if;
    end if;
  end if;
  return query select opened.status, opened.created, opened.profile_id,
    opened.generation, opened.revision, opened.envelope, null::text, reset_receipt;
end;
$$;

revoke execute on function learner_profile_rpc.open_my_learner_profile(jsonb, uuid, bigint, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function learner_profile_rpc.open_my_learner_profile(jsonb, uuid, bigint, bigint, text)
  to authenticated;

create function public.open_my_learner_profile(
  p_onboarding_profile jsonb default null,
  p_cached_profile_id uuid default null,
  p_cached_generation bigint default null,
  p_cached_revision bigint default null,
  p_cached_profile_sha256 text default null
)
returns table (
  status text, created boolean, profile_id uuid, generation bigint,
  revision bigint, envelope jsonb, profile_sha256 text, reset_state jsonb
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from learner_profile_rpc.open_my_learner_profile(
    p_onboarding_profile, p_cached_profile_id, p_cached_generation,
    p_cached_revision, p_cached_profile_sha256
  );
$$;

revoke execute on function public.open_my_learner_profile(jsonb, uuid, bigint, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.open_my_learner_profile(jsonb, uuid, bigint, bigint, text)
  to authenticated;

comment on function public.open_my_learner_profile(jsonb, uuid, bigint, bigint, text) is
  'Opens the verified owner profile with its reset receipt; omits the envelope only for an exact cached identity and content match.';
