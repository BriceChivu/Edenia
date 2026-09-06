// Operator-only, read-only observations. The caller supplies the privately
// confirmed owner through the already verified operator channel. Never publish
// snapshots: they are private comparison material, not report records.
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u
const HASH = /^[a-f0-9]{64}$/u

export async function observeCanaryProfile(query, owner) {
  if (typeof owner !== 'string' || !UUID.test(owner)) throw new Error('Invalid private verifier target')
  const rows = await query(`with heads as (
    select h.*, encode(extensions.digest(to_jsonb(h)::text, 'sha256'), 'hex') as row_hash, v.envelope, v.payload_sha256, v.payload_bytes,
      v.generation as version_generation, v.revision as version_revision
    from public.learner_profile_heads h
    join public.learner_profile_versions v on v.id = h.current_version_id and v.user_id = h.user_id and v.profile_id = h.profile_id
    where h.user_id = '${owner}'::uuid
  ), versions as (
    select encode(extensions.digest(to_jsonb(v)::text, 'sha256'), 'hex') as hash
    from public.learner_profile_versions v where v.user_id = '${owner}'::uuid
  ), protections as (
    select encode(extensions.digest(to_jsonb(p)::text, 'sha256'), 'hex') as hash from private.learner_profile_conflicts p where user_id = '${owner}'::uuid
    union all select encode(extensions.digest(to_jsonb(p)::text, 'sha256'), 'hex') from private.learner_profile_resets p where user_id = '${owner}'::uuid
    union all select encode(extensions.digest(to_jsonb(p)::text, 'sha256'), 'hex') from private.learner_profile_import_backups p where user_id = '${owner}'::uuid
    union all select encode(extensions.digest(to_jsonb(p)::text, 'sha256'), 'hex') from private.learner_profile_recoveries p where user_id = '${owner}'::uuid
  ) select
    (select count(*)::integer from public.learner_profile_heads where user_id = '${owner}'::uuid) as head_count,
    (select count(*) = 1 and bool_and(generation = version_generation and revision = version_revision
      and payload_sha256 = envelope #>> '{integrity,payloadSha256}'
      and payload_bytes = (envelope #>> '{integrity,byteLength}')::integer
      and private.is_valid_learner_profile_envelope(envelope)) from heads) as valid_head,
    (select encode(extensions.digest(to_jsonb(h)::text, 'sha256'), 'hex') from heads h) as head_hash,
    (select encode(extensions.digest((envelope -> 'profile')::text, 'sha256'), 'hex') from heads) as profile_hash,
    (select row_hash from heads) as head_row_hash,
    (select current_version_id::text from heads) as current_version,
    (select generation::text from heads) as generation,
    (select revision::text from heads) as revision,
    (select coalesce(json_agg(hash order by hash), '[]'::json) from versions) as version_hashes,
    (select coalesce(json_agg(hash order by hash), '[]'::json) from protections) as protection_hashes;`)
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Ambiguous verifier observation')
  const row = rows[0]
  if (![0, 1].includes(row.head_count) || ![true, false, null].includes(row.valid_head)
    || !Array.isArray(row.version_hashes) || !row.version_hashes.every(hash => typeof hash === 'string' && HASH.test(hash))) throw new Error('Invalid verifier observation')
  if (!Array.isArray(row.protection_hashes) || !row.protection_hashes.every(hash => typeof hash === 'string' && HASH.test(hash))) throw new Error('Invalid protection observation')
  for (const key of ['head_hash', 'profile_hash', 'head_row_hash']) if (row[key] !== null && !(typeof row[key] === 'string' && HASH.test(row[key]))) throw new Error('Invalid verifier fingerprint')
  for (const key of ['generation', 'revision']) if (row[key] !== null && !(typeof row[key] === 'string' && /^[1-9][0-9]*$/u.test(row[key]))) throw new Error('Invalid verifier revision')
  if (row.current_version !== null && !(typeof row.current_version === 'string' && UUID.test(row.current_version))) throw new Error('Invalid private head identity')
  return { owner, currentVersion: row.current_version, headRowHash: row.head_row_hash, headCount: row.head_count, validHead: row.valid_head === true, headHash: row.head_hash, profileHash: row.profile_hash, generation: row.generation, revision: row.revision, versionHashes: [...row.version_hashes], protectionHashes: [...row.protection_hashes] }
}

export function compareCanaryProfiles(before, after) {
  if (before.owner !== after.owner) throw new Error('Verifier target changed')
  const retained = new Set(after.versionHashes)
  const protections = new Set(after.protectionHashes)
  return {
    headUnchanged: before.headCount === after.headCount && before.headHash === after.headHash,
    retainedVersionsUnchanged: JSON.stringify(before.versionHashes) === JSON.stringify(after.versionHashes),
    protectedStateUnchanged: JSON.stringify(before.protectionHashes) === JSON.stringify(after.protectionHashes),
    priorProtectionsPreserved: before.protectionHashes.every(hash => protections.has(hash)),
    priorVersionsPreserved: before.versionHashes.every(hash => retained.has(hash)),
    logicalProfileUnchanged: before.validHead && after.validHead && before.profileHash === after.profileHash,
    generationUnchanged: before.generation === after.generation,
    revisionUnchanged: before.revision === after.revision,
    validHead: after.validHead
  }
}
