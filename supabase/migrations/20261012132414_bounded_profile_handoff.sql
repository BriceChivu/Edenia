-- Two scalars per current head, no new profile history or event ledger.
alter table public.learner_profile_heads
  add column last_session_flush_at timestamptz,
  add column last_replacement_revision bigint not null default 0;

-- Fence pre-upgrade and intentional replacement state without keeping an
-- unbounded event history. Ordinary commits leave this boundary unchanged.
update public.learner_profile_heads set last_replacement_revision = revision;
create function private.reset_learner_profile_handoff_boundary()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.generation is distinct from old.generation or new.profile_id is distinct from old.profile_id then
    new.last_replacement_revision := 0;
  end if;
  return new;
end;
$$;
create trigger learner_profile_handoff_generation before update on public.learner_profile_heads
  for each row execute function private.reset_learner_profile_handoff_boundary();

create function private.record_learner_profile_handoff_replacement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_profile uuid; target_generation bigint; target_revision bigint;
begin
  if tg_table_name = 'learner_profile_import_backups' then
    target_profile := new.profile_id; target_generation := new.generation;
    target_revision := new.imported_revision;
    if new.restored_version_id is not null then
      select v.revision into target_revision from public.learner_profile_versions v where v.id = new.restored_version_id and v.user_id = new.user_id;
    end if;
  elsif tg_table_name = 'learner_profile_recoveries' then
    target_profile := new.restored_profile_id; target_generation := new.restored_generation;
    target_revision := new.restored_revision;
  elsif tg_table_name = 'learner_profile_conflicts' then
    select v.profile_id, v.generation, v.revision into target_profile, target_generation, target_revision
      from public.learner_profile_versions v where v.id = new.selected_version_id and v.user_id = new.user_id;
  elsif new.restored_version_id is not null then
    select v.profile_id, v.generation, v.revision into target_profile, target_generation, target_revision
      from public.learner_profile_versions v where v.id = new.restored_version_id and v.user_id = new.user_id;
  end if;
  update public.learner_profile_heads set last_replacement_revision = greatest(last_replacement_revision, target_revision)
    where user_id = new.user_id and profile_id = target_profile and generation = target_generation
      and last_replacement_revision < target_revision;
  return new;
end;
$$;
create trigger learner_profile_handoff_import after insert or update on private.learner_profile_import_backups
  for each row execute function private.record_learner_profile_handoff_replacement();
create trigger learner_profile_handoff_recovery after insert on private.learner_profile_recoveries
  for each row execute function private.record_learner_profile_handoff_replacement();
create trigger learner_profile_handoff_choice after update on private.learner_profile_conflicts
  for each row when (new.state = 'resolved') execute function private.record_learner_profile_handoff_replacement();
create trigger learner_profile_handoff_undo after update on private.learner_profile_resets
  for each row execute function private.record_learner_profile_handoff_replacement();
revoke all on function private.reset_learner_profile_handoff_boundary(), private.record_learner_profile_handoff_replacement()
  from public, anon, authenticated, service_role;

create function learner_profile_rpc.read_my_learner_profile_write_receipt(p_operation_id uuid)
returns table (status text, profile_id uuid, generation bigint, revision bigint,
  base_revision bigint, payload_sha256 text, request_sha256 text, last_replacement_revision bigint)
language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); gate private.learner_profile_access_control%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select value.* into strict gate from private.learner_profile_access_control value where value.singleton;
  if not private.learner_profile_trial_allows_owner() then
    raise exception 'Learner profile tester access disabled' using errcode = '42501';
  end if;
  if gate.rollout_state = 'off'
    or (gate.rollout_state = 'developer-canary' and gate.developer_user_id is distinct from owner_id)
    or private.learner_profile_account_is_locked(owner_id)
    or not exists (select 1 from auth.users u where u.id = owner_id and u.confirmed_at is not null
      and u.deleted_at is null and not coalesce(u.is_anonymous, false)) then
    raise exception 'Learner profile access disabled' using errcode = '42501';
  end if;
  return query select 'already_accepted'::text, r.profile_id, r.generation, r.accepted_revision,
    r.base_revision, r.result_sha256, r.request_sha256, coalesce((select h.last_replacement_revision from public.learner_profile_heads h where h.user_id = owner_id),0)
    from public.learner_profile_write_receipts r where r.user_id = owner_id and r.operation_id = p_operation_id;
  if not found then return query select 'not_accepted'::text, null::uuid, null::bigint,
    null::bigint, null::bigint, null::text, null::text, coalesce((select h.last_replacement_revision from public.learner_profile_heads h where h.user_id = owner_id),0); end if;
end;
$$;

create function learner_profile_rpc.commit_my_learner_profile_handoff(
  p_operation_id uuid, p_profile_id uuid, p_generation bigint, p_base_revision bigint,
  p_envelope jsonb, p_session_boundary boolean default false)
returns table (status text, profile_id uuid, generation bigint, revision bigint,
  base_revision bigint, payload_sha256 text, conflict_id uuid, retry_after_ms integer)
language plpgsql volatile security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); gate private.learner_profile_access_control%rowtype;
  head public.learner_profile_heads%rowtype; result record; instant timestamptz;
  urgent boolean := false;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select value.* into strict gate from private.learner_profile_access_control value where value.singleton;
  if not private.learner_profile_trial_allows_owner() then
    raise exception 'Learner profile tester access disabled' using errcode = '42501';
  end if;
  if gate.rollout_state = 'off'
    or (gate.rollout_state = 'developer-canary' and gate.developer_user_id is distinct from owner_id)
    or private.learner_profile_account_is_locked(owner_id) then
    raise exception 'Learner profile access disabled' using errcode = '42501';
  end if;
  -- The existing commit locks this same owner. Serialize the budget across
  -- phones, computers and reloads; a per-tab timer cannot enforce this limit.
  perform 1 from auth.users u where u.id = owner_id and u.confirmed_at is not null
    and u.deleted_at is null and not coalesce(u.is_anonymous, false) for update;
  if not found then raise exception 'Verified account required' using errcode = '42501'; end if;
  select value.* into head from public.learner_profile_heads value where value.user_id = owner_id;
  instant := pg_catalog.clock_timestamp();
  -- A device can go stale between its head check and this upload. Preserve
  -- its durable local candidate and recheck before creating protected history.
  -- Exact retries and already protected candidates keep their established path.
  if head.user_id is not null and (head.profile_id is distinct from p_profile_id
      or head.generation is distinct from p_generation or head.revision is distinct from p_base_revision)
    and not exists (select 1 from public.learner_profile_write_receipts r where r.user_id = owner_id and r.operation_id = p_operation_id)
    and not exists (select 1 from private.learner_profile_conflicts c where c.user_id = owner_id and c.operation_id = p_operation_id) then
    return query select 'head_changed'::text, head.profile_id, head.generation, head.revision,
      p_base_revision, null::text, null::uuid, 0;
    return;
  end if;
  -- Only a new write to the current head consumes the budget.
  if head.profile_id = p_profile_id and head.generation = p_generation and head.revision = p_base_revision
    and not exists (select 1 from public.learner_profile_write_receipts r where r.user_id = owner_id and r.operation_id = p_operation_id)
    and not exists (select 1 from private.learner_profile_conflicts c where c.user_id = owner_id and c.operation_id = p_operation_id) then
    urgent := coalesce(p_session_boundary, false)
      and head.updated_at > instant - interval '30 seconds'
      and (head.last_session_flush_at is null or head.last_session_flush_at <= instant - interval '5 minutes');
    if not urgent and head.updated_at > instant - interval '30 seconds' then
      return query select 'deferred'::text, head.profile_id, head.generation, head.revision,
        p_base_revision, null::text, null::uuid,
        greatest(1, ceil(extract(epoch from (head.updated_at + interval '30 seconds' - instant)) * 1000)::integer);
      return;
    end if;
  end if;
  select value.* into strict result from learner_profile_rpc.commit_my_learner_profile(
    p_operation_id, p_profile_id, p_generation, p_base_revision, p_envelope) value;
  if urgent and result.status = 'accepted' then
    update public.learner_profile_heads set last_session_flush_at = instant where user_id = owner_id;
  end if;
  return query select result.status, result.profile_id, result.generation, result.revision,
    result.base_revision, result.payload_sha256, result.conflict_id, 0;
end;
$$;

create function public.read_my_learner_profile_write_receipt(p_operation_id uuid)
returns table (status text, profile_id uuid, generation bigint, revision bigint,
  base_revision bigint, payload_sha256 text, request_sha256 text, last_replacement_revision bigint)
language sql stable security invoker set search_path = '' as $$
  select * from learner_profile_rpc.read_my_learner_profile_write_receipt(p_operation_id);
$$;
create function public.commit_my_learner_profile_handoff(
  p_operation_id uuid, p_profile_id uuid, p_generation bigint, p_base_revision bigint,
  p_envelope jsonb, p_session_boundary boolean default false)
returns table (status text, profile_id uuid, generation bigint, revision bigint,
  base_revision bigint, payload_sha256 text, conflict_id uuid, retry_after_ms integer)
language sql volatile security invoker set search_path = '' as $$
  select * from learner_profile_rpc.commit_my_learner_profile_handoff(
    p_operation_id, p_profile_id, p_generation, p_base_revision, p_envelope, p_session_boundary);
$$;
revoke all on function learner_profile_rpc.read_my_learner_profile_write_receipt(uuid),
  public.read_my_learner_profile_write_receipt(uuid),
  learner_profile_rpc.commit_my_learner_profile_handoff(uuid, uuid, bigint, bigint, jsonb, boolean),
  public.commit_my_learner_profile_handoff(uuid, uuid, bigint, bigint, jsonb, boolean)
  from public, anon, authenticated, service_role;
grant execute on function learner_profile_rpc.read_my_learner_profile_write_receipt(uuid),
  public.read_my_learner_profile_write_receipt(uuid),
  learner_profile_rpc.commit_my_learner_profile_handoff(uuid, uuid, bigint, bigint, jsonb, boolean),
  public.commit_my_learner_profile_handoff(uuid, uuid, bigint, bigint, jsonb, boolean)
  to authenticated;
