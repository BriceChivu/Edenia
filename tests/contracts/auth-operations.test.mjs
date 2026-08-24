import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { classifyAuthHealthResponse } from '../../scripts/check-auth-health.mjs'

const workflow = await readFile(
  new URL('../../.github/workflows/auth-health-monitor.yml', import.meta.url),
  'utf8'
)
const runbook = await readFile(
  new URL('../../docs/auth-operations.md', import.meta.url),
  'utf8'
)
const migration = await readFile(
  new URL('../../supabase/migrations/20260824021719_add_auth_monitoring_and_operator_recovery.sql', import.meta.url),
  'utf8'
)
const probe = await readFile(
  new URL('../../scripts/check-auth-health.mjs', import.meta.url),
  'utf8'
)

test('Auth health classification keeps expected client errors separate from provider failures', () => {
  assert.equal(classifyAuthHealthResponse({ status: 204 }), 'available')
  assert.equal(classifyAuthHealthResponse({ status: 400 }), 'expected_client_error')
  assert.equal(classifyAuthHealthResponse({ status: 503 }), 'provider_unavailable')
  assert.equal(classifyAuthHealthResponse({ error: new Error('timeout') }), 'network_error')
})

test('Auth health monitoring probes the provider on a five-minute schedule without sign-in data', () => {
  assert.match(workflow, /cron:\s*['"]\*\/5 \* \* \* \*['"]/)
  assert.match(workflow, /SUPABASE_URL:/)
  assert.match(workflow, /SUPABASE_PUBLISHABLE_KEY:/)
  assert.match(workflow, /SUPABASE_DB_URL:/)
  assert.match(workflow, /check-auth-health\.mjs/)
  assert.match(probe, /auth\/v1\/health/)
  assert.doesNotMatch(workflow, /signInWithOtp|verifyOtp|email|otp|token/i)
})

test('operator runbook defines gate-first recovery, sanitized selection, rollback triggers, and the under-13 path', () => {
  assert.match(runbook, /begin_learner_profile_recovery/)
  assert.match(runbook, /list_learner_profile_operator_candidates/)
  assert.match(runbook, /restore_learner_profile_from_operator_candidate/)
  assert.match(runbook, /fresh browser/i)
  assert.match(runbook, /under-13/i)
  assert.match(runbook, /guardian consent/i)
  assert.match(runbook, /record_under_13_profile_removal/)
  assert.match(runbook, /wrong-profile|unsafe accepted writes|silent overwrite/i)
  assert.match(runbook, /sessions? (?:remain )?valid|revok/i)
  assert.doesNotMatch(runbook, /select\s+.*(?:email|envelope|state_json)/i)
})

test('operator recovery is service-only, gate-first, metadata-only, and protected', () => {
  assert.match(migration, /create table private\.auth_health_checks/)
  assert.match(migration, /create table private\.learner_profile_operator_recovery_incidents/)
  assert.match(migration, /create table private\.learner_profile_account_locks/)
  assert.match(migration, /removal_status/)
  assert.match(migration, /record_auth_health_check/)
  assert.match(migration, /begin_learner_profile_recovery/)
  assert.match(migration, /list_learner_profile_operator_candidates/)
  assert.match(migration, /restore_learner_profile_from_operator_candidate/)
  assert.match(migration, /record_under_13_profile_removal/)
  assert.match(migration, /rollout_state = 'off'/)
  assert.match(migration, /payload_sha256/)
  assert.match(migration, /payload_bytes/)
  assert.match(migration, /protected_until/)
  assert.match(migration, /source = 'operator'/)
  assert.doesNotMatch(migration, /delete from public\.learner_profile_write_receipts/)
  assert.match(migration, /revoke execute[\s\S]*record_auth_health_check[\s\S]*from public, anon, authenticated, service_role/)
})
