import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(new URL(
  'supabase/migrations/20260813132440_legacy_progress_transfer_relay.sql',
  projectRoot
), 'utf8')
const cleanupMigration = await readFile(new URL(
  'supabase/migrations/20260814025929_schedule_legacy_progress_transfer_cleanup.sql',
  projectRoot
), 'utf8')
const databaseTest = await readFile(new URL(
  'supabase/tests/legacy_progress_transfer_relay.test.sql',
  projectRoot
), 'utf8')
const handler = await readFile(new URL(
  'supabase/functions/_shared/legacy-progress-transfer.ts',
  projectRoot
), 'utf8')
const createEntrypoint = await readFile(new URL(
  'supabase/functions/create-legacy-progress-transfer/index.ts',
  projectRoot
), 'utf8')
const consumeEntrypoint = await readFile(new URL(
  'supabase/functions/consume-legacy-progress-transfer/index.ts',
  projectRoot
), 'utf8')
const config = await readFile(new URL('supabase/config.toml', projectRoot), 'utf8')
const workflow = await readFile(new URL('.github/workflows/ci.yml', projectRoot), 'utf8')

test('legacy relay is private, encrypted, bounded, and disabled by default', () => {
  assert.match(migration, /create table private\.legacy_progress_transfer_control/)
  assert.match(migration, /create table private\.legacy_progress_transfers/)
  assert.match(migration, /create table private\.legacy_progress_transfer_daily_metrics/)
  assert.match(
    migration,
    /values \(true, false, false\)/
  )
  assert.match(migration, /capability_digest bytea primary key/)
  assert.match(migration, /initialization_vector bytea/)
  assert.match(migration, /ciphertext bytea/)
  assert.match(migration, /ciphertext_digest bytea/)
  assert.match(migration, /ciphertext_bytes between 17 and 2097168/)
  assert.match(migration, /for update;/)
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /security definer\nset search_path = ''/)
  assert.match(
    migration,
    /revoke all on table private\.legacy_progress_transfers[\s\S]*?service_role/
  )
  assert.doesNotMatch(
    migration,
    /\n\s+(?:email|user_id|account_id|posthog_id|ip_address|user_agent|plaintext|source_hash)\s+(?:text|uuid|bytea)/i
  )
  assert.doesNotMatch(migration, /cron\.schedule|pg_cron|net\.http/i)
})

test('relay HTTP surface uses exact origin, wire, and logging policy', () => {
  assert.match(handler, /https:\/\/bricechivu\.github\.io/)
  assert.match(handler, /https:\/\/www\.edenia\.study/)
  assert.match(handler, /http:\/\/localhost:8002/)
  assert.match(handler, /http:\/\/localhost:8000/)
  assert.match(handler, /MAXIMUM_JSON_BODY_BYTES = 3 \* 1024 \* 1024/)
  assert.match(handler, /request\.headers\.has\('authorization'\)/)
  assert.match(handler, /PUBLISHABLE_KEY_PATTERN/)
  assert.match(handler, /'Cache-Control': 'no-store'/)
  assert.match(handler, /'Referrer-Policy': 'no-referrer'/)
  assert.doesNotMatch(handler, /Access-Control-Allow-Origin['"]?:\s*['"]\*/)
  assert.doesNotMatch(handler, /console\.|request\.text\(\)/)
  assert.match(createEntrypoint, /auth: 'publishable:default', cors: false/)
  assert.match(consumeEntrypoint, /auth: 'publishable:default', cors: false/)
  assert.match(
    createEntrypoint,
    /request\.method === 'OPTIONS'[\s\S]*?legacyProgressTransferPreflightResponse\(request, 'create'\)[\s\S]*?: handleAuthenticatedRequest\(request\)/
  )
  assert.match(
    consumeEntrypoint,
    /request\.method === 'OPTIONS'[\s\S]*?legacyProgressTransferPreflightResponse\(request, 'consume'\)[\s\S]*?: handleAuthenticatedRequest\(request\)/
  )
  assert.doesNotMatch(createEntrypoint, /auth: 'none'/)
  assert.doesNotMatch(consumeEntrypoint, /auth: 'none'/)
  assert.match(config, /\[functions\.create-legacy-progress-transfer\][\s\S]*?verify_jwt = false/)
  assert.match(config, /\[functions\.consume-legacy-progress-transfer\][\s\S]*?verify_jwt = false/)
})

test('retained database tests cover concurrency, permissions, and CI routing', () => {
  assert.match(databaseTest, /select plan\(61\)/)
  assert.match(databaseTest, /legacy_relay_worker_a/)
  assert.match(databaseTest, /legacy_relay_worker_b/)
  assert.match(databaseTest, /only one concurrent worker receives ciphertext/)
  assert.match(databaseTest, /acceptance can stop while valid transfers keep draining/)
  assert.match(databaseTest, /completion immediately removes every payload byte/)
  assert.match(databaseTest, /an authenticated browser cannot invoke the service RPC/)
  assert.match(databaseTest, /the service role cannot read private ciphertext directly/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/legacy_progress_transfer_relay\.test\.sql --local/
  )
  assert.match(workflow, /test:legacy-progress-relay-function/)
})

test('relay cleanup is scheduled locally without network or browser credentials', () => {
  assert.match(
    cleanupMigration,
    /create extension if not exists pg_cron with schema pg_catalog/
  )
  assert.match(
    cleanupMigration,
    /cron\.schedule\([\s\S]*?'edenia-legacy-progress-transfer-cleanup'[\s\S]*?'\*\/5 \* \* \* \*'/
  )
  assert.match(
    cleanupMigration,
    /private\.cleanup_legacy_progress_transfers\(pg_catalog\.now\(\), 1000\)/
  )
  assert.match(cleanupMigration, /cron\.job_run_details/)
  assert.match(cleanupMigration, /interval '30 days'/)
  assert.doesNotMatch(cleanupMigration, /net\.http|apikey|authorization/i)
})
