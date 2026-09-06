import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { injectCanaryHeadFixture } from './canary-head-fixture.mjs'
import { readFile } from 'node:fs/promises'
import { observeCanaryProfile, compareCanaryProfiles } from './canary-profile-verifier.mjs'

// Only the disposable database runner calls this helper. All fixture writes
// belong to its generated local container, never a linked operator target.
export async function rehearseCanaryProfileVerifier(query, onMissingHead) {
  const owner = '11111111-1111-4111-8111-111111111111'
  const source = await readFile(new URL('../supabase/tests/first_signed_in_profile.test.sql', import.meta.url), 'utf8')
  const envelope = source.match(/\$profile\$\s*(\{[^]*?\})\s*\$profile\$/u)?.[1]
  if (!envelope) throw new Error('Reviewed synthetic onboarding fixture is missing')
  const jsonQuery = async sql => JSON.parse((await query(`select coalesce(json_agg(row_to_json(observation)), '[]'::json) from (${sql.replace(/;$/u, '')}) observation;`)).trim())
  await query(`begin;
    insert into auth.users (id, email, email_confirmed_at) values ('${owner}', 'verifier@example.test', now());
    update private.learner_profile_access_control set rollout_state = 'developer-canary', developer_user_id = '${owner}' where singleton;
    set local role authenticated;
    set local request.jwt.claim.role = 'authenticated';
    set local request.jwt.claim.sub = '${owner}';
    select count(*) from public.resolve_my_learner_profile($fixture$${envelope}$fixture$::jsonb);
    commit;`)
  const before = await observeCanaryProfile(jsonQuery, owner)
  assert.equal(before.validHead, true)
  assert.equal(before.versionHashes.length, 1)
  assert.equal(compareCanaryProfiles(before, await observeCanaryProfile(jsonQuery, owner)).headUnchanged, true)
  await query(`update public.learner_profile_heads set updated_at = updated_at + interval '1 second' where user_id = '${owner}';`)
  assert.equal(compareCanaryProfiles(before, await observeCanaryProfile(jsonQuery, owner)).headUnchanged, false)
  await query(`update public.learner_profile_versions set payload_bytes = payload_bytes + 1 where user_id = '${owner}';`)
  assert.equal((await observeCanaryProfile(jsonQuery, owner)).validHead, false)
  await query(`update public.learner_profile_versions set payload_bytes = payload_bytes - 1 where user_id = '${owner}';`)
  await query(`delete from public.learner_profile_heads where user_id = '${owner}';`)
  assert.equal((await observeCanaryProfile(jsonQuery, owner)).headCount, 0)
  const incident = '22222222-2222-4222-8222-222222222222'
  const operation = '33333333-3333-4333-8333-333333333333'
  await query(`select count(*) from private.begin_learner_profile_recovery('${incident}', 'profile-recovery', '${owner}', 'RECOVER ${owner}', '${'a'.repeat(40)}', 'internal', true, false, false, null, 'valid');`)
  await query(`select count(*) from private.restore_learner_profile_from_operator_candidate('${incident}', '${operation}', (select id from public.learner_profile_versions where user_id = '${owner}'), 'RESTORE ' || (select id::text from public.learner_profile_versions where user_id = '${owner}'));`)
  const after = await observeCanaryProfile(jsonQuery, owner)
  const comparison = compareCanaryProfiles(before, after)
  assert.equal(comparison.validHead, true)
  assert.equal(comparison.logicalProfileUnchanged, true)
  assert.equal(comparison.priorVersionsPreserved, true)
  assert.equal(comparison.priorProtectionsPreserved, true)
  assert.equal(comparison.revisionUnchanged, false)
  assert.equal(BigInt(after.revision), BigInt(before.revision) + 1n)
  assert.equal(after.versionHashes.length, 2)
  const retried = await query(`select count(*) from private.restore_learner_profile_from_operator_candidate('${incident}', '${operation}', (select selected_version_id from private.learner_profile_operator_recovery_incidents where incident_id = '${incident}' and target_user_id = '${owner}'), 'RESTORE ' || (select selected_version_id::text from private.learner_profile_operator_recovery_incidents where incident_id = '${incident}' and target_user_id = '${owner}'));`)
  assert.equal(retried.trim(), '1')
  assert.equal(compareCanaryProfiles(after, await observeCanaryProfile(jsonQuery, owner)).headUnchanged, true)
  for (const kind of ['missing-head', 'unusable-head']) {
    const protectedBefore = await observeCanaryProfile(jsonQuery, owner)
    await query(`update private.learner_profile_access_control set rollout_state = 'developer-canary', developer_user_id = '${owner}' where singleton;`)
    await assert.rejects(() => injectCanaryHeadFixture(query, { ...protectedBefore, headRowHash: 'f'.repeat(64) }, kind), /failed/)
    await injectCanaryHeadFixture(query, protectedBefore, kind)
    const injected = await observeCanaryProfile(jsonQuery, owner)
    assert.equal(injected.validHead, false)
    assert.equal(compareCanaryProfiles(protectedBefore, injected).retainedVersionsUnchanged, true)
    assert.equal(compareCanaryProfiles(protectedBefore, injected).protectedStateUnchanged, true)
    if (kind === 'missing-head') await onMissingHead(owner)
    const nextIncident = randomUUID()
    const nextOperation = randomUUID()
    await query(`select count(*) from private.begin_learner_profile_recovery('${nextIncident}', 'profile-recovery', '${owner}', 'RECOVER ${owner}', '${'a'.repeat(40)}', 'internal', true, false, false, null, 'valid');`)
    await query(`select count(*) from private.restore_learner_profile_from_operator_candidate('${nextIncident}', '${nextOperation}', '${protectedBefore.currentVersion}', 'RESTORE ${protectedBefore.currentVersion}');`)
    const recovered = await observeCanaryProfile(jsonQuery, owner)
    const verified = compareCanaryProfiles(protectedBefore, recovered)
    assert.equal(verified.validHead, true)
    assert.equal(verified.logicalProfileUnchanged, true)
    assert.equal(verified.priorVersionsPreserved, true)
    assert.equal(verified.priorProtectionsPreserved, true)
    assert.equal(recovered.protectionHashes.length, protectedBefore.protectionHashes.length + 1)
    assert.equal(BigInt(recovered.revision) > BigInt(protectedBefore.revision), true)
  }
  return { protectedFixtureRecoveryVerified: true, validHeadVerified: true, changedHeadDetected: true, corruptMetadataDetected: true, missingHeadDetected: true, operatorRecoveryVerified: true, priorVersionsPreserved: true, logicalProfileUnchanged: true, revisionAdvancedOnce: true, retryDidNotDuplicate: true }
}
