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
const externalMonitorMigration = await readFile(
  new URL('../../supabase/migrations/20260828041926_add_external_auth_monitor_bridge.sql', import.meta.url),
  'utf8'
)
const probe = await readFile(
  new URL('../../scripts/check-auth-health.mjs', import.meta.url),
  'utf8'
)
const freshnessCheck = await readFile(
  new URL('../../scripts/check-auth-health-freshness.mjs', import.meta.url),
  'utf8'
)
const monitorHandler = await readFile(
  new URL('../../supabase/functions/_shared/auth-health-monitor.ts', import.meta.url),
  'utf8'
)
const monitorFunction = await readFile(
  new URL('../../supabase/functions/auth-health-monitor/index.ts', import.meta.url),
  'utf8'
)
const monitorProbe = await readFile(
  new URL('../../supabase/functions/_shared/auth-health-probe.ts', import.meta.url),
  'utf8'
)
const setupWizard = await readFile(
  new URL('../../scripts/setup-auth-monitoring.sh', import.meta.url),
  'utf8'
)
const ciWorkflow = await readFile(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
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

test('GitHub is only the secondary freshness watchdog and manual diagnostic', () => {
  assert.doesNotMatch(workflow, /cron:\s*['"]\*\/5 \* \* \* \*['"]/)
  assert.match(workflow, /Secondary stale-record watchdog only/)
  assert.match(workflow, /check-auth-health-freshness\.mjs/)
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/)
  assert.match(workflow, /SUPABASE_URL:/)
  assert.match(workflow, /EDENIA_AUTH_MONITOR_TOKEN:/)
  assert.match(workflow, /check-auth-health\.mjs/)
  assert.doesNotMatch(workflow, /signInWithOtp|verifyOtp|email|otp/i)
})

test('the Independent Auth monitor endpoint probes Auth, records aggregates, and exposes a stale watchdog', () => {
  assert.match(monitorProbe, /auth\/v1\/health/)
  assert.match(monitorFunction, /record_auth_health_check_from_monitor/)
  assert.match(monitorFunction, /read_auth_health_monitor_status/)
  assert.match(monitorHandler, /x-edenia-auth-monitor-canary/)
  assert.match(monitorHandler, /canaryEnabled/)
  assert.match(monitorHandler, /Cache-Control': 'no-store/)
  assert.doesNotMatch(
    `${monitorFunction}\n${monitorProbe}\n${monitorHandler}`,
    /signInWithOtp|verifyOtp|profile|cookie|user_id/i
  )
  assert.match(freshnessCheck, /method: 'GET'/)
  assert.match(freshnessCheck, /Authorization: `Bearer \$\{token\}`/)
})

test('the repeatable setup keeps the Auth monitor capability private and requires hosted proof', () => {
  const totalStageAssignments = [...setupWizard.matchAll(/^TOTAL_STAGES=(\d+)$/gm)]
  const totalStages = Number(totalStageAssignments.at(-1)?.[1])
  const authoredStages = setupWizard.match(/^stage "/gm) ?? []
  assert.equal(totalStages, authoredStages.length)
  assert.match(setupWizard, /https:\/\/app\.pulsetic\.com\/monitors/)
  assert.match(setupWizard, /Interval: 5 minutes/)
  assert.match(setupWizard, /set_secret EDENIA_AUTH_MONITOR_TOKEN/)
  assert.match(setupWizard, /supabase secrets set --env-file/)
  assert.match(setupWizard, /provider_unavailable/)
  assert.match(setupWizard, /DOWN notification within 10 minutes/)
  assert.match(setupWizard, /at least 24 continuous hours/)
  assert.match(setupWizard, /temporary Website Monitoring monitor[\s\S]*https:\/\/example\.com/)
  assert.match(setupWizard, /saved Advanced Settings/)
  assert.match(setupWizard, /MONITOR_REGION=ap-northeast-1/)
  assert.match(setupWizard, /forceFunctionRegion=\$MONITOR_REGION/)
  assert.match(setupWizard, /DEPLOYED_REGION[\s\S]*MONITOR_REGION/)
  assert.match(setupWizard, /x-sb-edge-region:[\s\S]*BASELINE_REGION[\s\S]*MONITOR_REGION/i)
  assert.match(setupWizard, /HTTP Method: POST/)
  assert.match(setupWizard, /Authorization = Bearer/)
  assert.match(setupWizard, /Expected statuses: 200/)
  assert.match(setupWizard, /returns 200 for healthy outcomes and 503 for monitor failures/)
  assert.match(setupWizard, /real DOWN[\s\S]*real UP/)
  assert.match(setupWizard, /sign in at least every 80 days/i)
  assert.doesNotMatch(setupWizard, /UptimeRobot|Create an API monitor|Add OR assertions|Test Notification|simulated DOWN/i)
  assert.doesNotMatch(setupWizard, /write_env EDENIA_AUTH_MONITOR_TOKEN/)
  assert.doesNotMatch(setupWizard, /echo[^\n]*AUTH_MONITOR_TOKEN/)
  assert.match(runbook, /Independent Auth monitor operated through Pulsetic[\s\S]*Free Website Monitoring/)
  assert.match(runbook, /temporary[\s\S]*`https:\/\/example\.com`/)
  assert.match(runbook, /saved Advanced Settings[\s\S]*HTTP Method[\s\S]*`POST`/)
  assert.match(runbook, /`forceFunctionRegion=ap-northeast-1`/)
  assert.match(runbook, /`x-sb-edge-region`[\s\S]*`ap-northeast-1`/)
  assert.match(runbook, /`Authorization`[\s\S]*`Bearer <Auth monitor capability>`/)
  assert.match(runbook, /HTTP 200 is UP and HTTP 503 is DOWN/)
  assert.match(runbook, /real canary DOWN and\s+recovery notifications/i)
  assert.match(runbook, /sign in at least every 80 days/i)
  assert.doesNotMatch(runbook, /UptimeRobot|Test Notification|simulated DOWN|Assert HTTP 200 and JSON/i)
  assert.match(runbook, /Detection SLA:[\s\S]*within ten minutes/)
  assert.match(runbook, /largest aggregate gap at most 10 minutes|no gap over ten minutes/i)
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
  assert.match(workflow, /title=Edenia Auth monitor is stale or unavailable/)
  assert.match(workflow, /independent external monitor/)
  assert.doesNotMatch(workflow, /title=Edenia Auth outage/)
})

test('freshness watchdog sends the bearer capability without logging it', async t => {
  let receivedAuthorization = ''
  const server = createServer((request, response) => {
    receivedAuthorization = request.headers.authorization || ''
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"status":"healthy"}')
  })
  await listen(server)
  t.after(() => close(server))
  const address = server.address()
  const token = 'c'.repeat(64)
  const result = await runCommand(
    process.execPath,
    [fileURLToPath(new URL('../../scripts/check-auth-health-freshness.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        EDENIA_AUTH_MONITOR_TOKEN: token,
        SUPABASE_URL: `http://127.0.0.1:${address.port}`
      }
    }
  )

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Auth monitor freshness status=200\n')
  assert.equal(result.stderr, '')
  assert.equal(receivedAuthorization, `Bearer ${token}`)
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(token))
})

test('freshness watchdog fails with a bounded diagnostic for stale aggregate state', async t => {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'application/json' })
    response.end('{"status":"stale","detail":"fixture-secret"}')
  })
  await listen(server)
  t.after(() => close(server))
  const address = server.address()
  const result = await runCommand(
    process.execPath,
    [fileURLToPath(new URL('../../scripts/check-auth-health-freshness.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        EDENIA_AUTH_MONITOR_TOKEN: 'd'.repeat(64),
        SUPABASE_URL: `http://127.0.0.1:${address.port}`
      }
    }
  )

  assert.equal(result.code, 1)
  assert.equal(result.stdout, 'Auth monitor freshness status=503\n')
  assert.equal(
    result.stderr,
    'Auth health records are stale, alerting, or unavailable\n'
  )
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /fixture-secret/)
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

test('Independent Auth monitor database bridges are service-only and CI runs their security suite', () => {
  assert.match(externalMonitorMigration, /record_auth_health_check_from_monitor/)
  assert.match(externalMonitorMigration, /read_auth_health_monitor_status/)
  assert.match(
    externalMonitorMigration,
    /security definer\nset search_path = ''/g
  )
  assert.match(
    externalMonitorMigration,
    /revoke execute[\s\S]*from public, anon, authenticated, service_role/
  )
  assert.match(
    ciWorkflow,
    /supabase\/tests\/auth_monitoring_freshness\.test\.sql/
  )
  assert.match(ciWorkflow, /npm run test:auth-monitor-function/)
})
