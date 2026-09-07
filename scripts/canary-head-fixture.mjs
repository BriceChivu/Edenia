// Prepared for later packet authority only. Caller must have persisted the
// private snapshot, a unique mutation intent, and an armed containment watchdog.
// Packet 0 invokes this only through its uniquely generated disposable database.
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u
const HASH = /^[a-f0-9]{64}$/u
export async function injectCanaryHeadFixture(query, snapshot, kind) {
  if (!snapshot || snapshot.validHead !== true
    || typeof snapshot.owner !== 'string' || !UUID.test(snapshot.owner)
    || typeof snapshot.currentVersion !== 'string' || !UUID.test(snapshot.currentVersion)
    || typeof snapshot.headRowHash !== 'string' || !HASH.test(snapshot.headRowHash)
    || !['missing-head', 'unusable-head'].includes(kind)) throw new Error('Invalid private head fixture')
  // Read-only preflight alone is not a mutation fence. Recheck the exact gate,
  // head bytes and protected current version while holding the relevant locks.
  const mutation = kind === 'missing-head'
    ? `delete from public.learner_profile_heads where user_id = '${snapshot.owner}'::uuid;`
    : `update public.learner_profile_heads set revision = revision + 1 where user_id = '${snapshot.owner}'::uuid;`
  await query(`begin;
    set local lock_timeout = '1s';
    set local statement_timeout = '5s';
    do $fixture$
    declare changed integer;
    begin
      perform 1 from private.learner_profile_access_control
        where singleton and rollout_state = 'developer-canary' and developer_user_id = '${snapshot.owner}'::uuid for update;
      if not found then raise exception 'Fixture gate does not match'; end if;
      perform 1 from public.learner_profile_heads h
        where h.user_id = '${snapshot.owner}'::uuid and h.current_version_id = '${snapshot.currentVersion}'::uuid
          and encode(extensions.digest(to_jsonb(h)::text, 'sha256'), 'hex') = '${snapshot.headRowHash}' for update;
      if not found then raise exception 'Fixture head changed'; end if;
      perform 1 from private.learner_profile_recoveries r
        where r.user_id = '${snapshot.owner}'::uuid and r.restored_version_id = '${snapshot.currentVersion}'::uuid
          and r.protected_until > now() + interval '10 minutes' for update;
      if not found then raise exception 'Fixture requires a protected restored current version'; end if;
      ${mutation}
      get diagnostics changed = row_count;
      if changed <> 1 then raise exception 'Fixture target is ambiguous'; end if;
    end;
    $fixture$;
    commit;
    select true as fixture_applied;`)
  return { fixtureDispatched: true }
}
