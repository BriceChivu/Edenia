import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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

const runCommand = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, options)
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.once('error', reject)
  child.once('close', code => resolve({ code, stderr, stdout }))
})

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

const close = server => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve())
})

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

test('Auth health monitoring reports an undeployed recorder without leaking credentials', async t => {
  const scratchDirectory = await mkdtemp(join(tmpdir(), 'edenia-auth-health-'))
  const psqlPath = join(scratchDirectory, 'psql')
  await writeFile(
    psqlPath,
    '#!/bin/sh\n'
      + 'echo "ERROR: function private.record_auth_health_check(text, integer, integer) does not exist" >&2\n'
      + 'exit 1\n'
  )
  await chmod(psqlPath, 0o755)
  t.after(() => rm(scratchDirectory, { recursive: true, force: true }))

  const authServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"name":"GoTrue"}')
  })
  await listen(authServer)
  t.after(() => close(authServer))
  const address = authServer.address()
  const databaseUrl = 'postgresql://operator:fixture-secret@example.test/edenia'
  const result = await runCommand(
    process.execPath,
    [fileURLToPath(new URL('../../scripts/check-auth-health.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        PATH: `${scratchDirectory}:${process.env.PATH}`,
        SUPABASE_DB_URL: databaseUrl,
        SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
        SUPABASE_URL: `http://127.0.0.1:${address.port}`
      }
    }
  )

  assert.equal(result.code, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'Auth health recorder schema is not deployed\n')
  assert.doesNotMatch(result.stderr, /fixture-secret|postgresql:/)
})

test('Auth health workflow does not label every monitor failure as an Auth outage', () => {
  assert.match(workflow, /title=Edenia Auth health monitor failure/)
  assert.match(workflow, /Inspect the sanitized probe diagnostic/)
  assert.doesNotMatch(workflow, /title=Edenia Auth outage/)
})

test('operator runbook defines gate-first recovery, sanitized selection, rollback triggers, and the under-13 path', () => {
  assert.match(runbook, /Auth health recorder schema is not deployed/)
  assert.match(runbook, /does not by itself\s+prove an Auth outage/)
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
