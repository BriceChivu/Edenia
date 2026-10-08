-- Local continuation only: installing this migration neither opens a gate nor
-- admits an account. Selected verified UUIDs are configured by the operator.
alter table private.learner_profile_access_control
  add column tester_user_ids uuid[] not null default '{}'::uuid[];
alter table private.learner_profile_access_control
  drop constraint learner_profile_access_control_rollout_check;
alter table private.learner_profile_access_control
  add constraint learner_profile_access_control_rollout_check check (
    rollout_state in ('off', 'developer-canary', 'tester-trial', 'signed-in-public')
  ),
  add constraint learner_profile_access_control_testers_check check (
    array_position(tester_user_ids, null) is null
    and (rollout_state <> 'tester-trial' or cardinality(tester_user_ids) > 0)
  );

-- No caller-supplied owner or JWT user_metadata. Read admission afresh for each
-- statement so removal takes effect without waiting for an Auth token refresh.
-- Retain the existing off/canary/public read policies outside this trial.
create function private.learner_profile_trial_allows_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.learner_profile_access_control as gate
    where gate.singleton
      and (
        gate.rollout_state <> 'tester-trial'
        or (
          auth.uid() = any(gate.tester_user_ids)
          and exists (
            select 1 from auth.users as account
            where account.id = auth.uid()
              and account.confirmed_at is not null
              and account.deleted_at is null
              and not coalesce(account.is_anonymous, false)
          )
          and not private.learner_profile_account_is_locked(auth.uid())
        )
      )
  );
$$;
revoke all on function private.learner_profile_trial_allows_owner()
  from public, anon, authenticated, service_role;
grant execute on function private.learner_profile_trial_allows_owner()
  to authenticated;

-- Keep each mature protocol body, return shape, grant, and owner check intact.
-- Add one common boundary to the complete, fixed RPC inventory, including
-- receipt/conflict readers that predate the server write gate. Abort on drift.
do $$
declare
  target record;
  definition text;
  patched text;
  patched_count integer := 0;
begin
  for target in
    select proc.oid
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'learner_profile_rpc'
      and proc.proname = any(array[
        'resolve_my_learner_profile', 'commit_my_learner_profile',
        'read_my_learner_profile_conflict', 'choose_my_learner_profile_conflict',
        'start_over_my_learner_profile', 'read_my_latest_learner_profile_reset',
        'undo_my_learner_profile_start_over',
        'list_my_learner_profile_recovery_candidates',
        'read_my_learner_profile_recovery_candidate', 'restore_my_learner_profile',
        'import_my_learner_profile', 'read_my_learner_profile_import_backup',
        'rollback_my_learner_profile_import', 'migrate_my_accountless_profile'
      ])
  loop
    definition := pg_catalog.pg_get_functiondef(target.oid);
    patched := pg_catalog.replace(definition, E'\nbegin\n', E'\nbegin\n  if not private.learner_profile_trial_allows_owner() then\n    raise exception ''Learner profile tester access disabled'' using errcode = ''42501'';\n  end if;\n');
    if patched = definition then
      raise exception 'Tester admission RPC inventory changed';
    end if;
    execute patched;
    patched_count := patched_count + 1;
  end loop;
  if patched_count <> 14 then
    raise exception 'Tester admission RPC inventory incomplete: %', patched_count;
  end if;
end;
$$;

drop policy "Users can view their own learner profile head"
  on public.learner_profile_heads;
create policy "Users can view their own learner profile head"
  on public.learner_profile_heads for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not private.learner_profile_account_is_locked(user_id)
    and (select private.learner_profile_trial_allows_owner())
  );
drop policy "Users can view their own learner profile versions"
  on public.learner_profile_versions;
create policy "Users can view their own learner profile versions"
  on public.learner_profile_versions for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not private.learner_profile_account_is_locked(user_id)
    and (select private.learner_profile_trial_allows_owner())
  );

comment on column private.learner_profile_access_control.tester_user_ids is
  'Operator-selected exact verified Auth UUIDs, used only while the existing profile gate is tester-trial; no browser grants or tester-management API.';
