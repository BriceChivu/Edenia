import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL(
    'supabase/migrations/20260811181142_add_reminder_dispatch_ledger.sql',
    projectRoot
  ),
  'utf8'
)
const databaseTest = await readFile(
  new URL('supabase/tests/reminder_dispatch_ledger.test.sql', projectRoot),
  'utf8'
)
const workflow = await readFile(
  new URL('.github/workflows/ci.yml', projectRoot),
  'utf8'
)

test('reminder dispatch state remains private, allowlisted, and live-off', () => {
  assert.match(migration, /create schema if not exists private/)
  assert.match(migration, /create table private\.reminder_delivery_control/)
  assert.match(migration, /create table private\.reminder_delivery_testers/)
  assert.match(migration, /create table private\.reminder_deliveries/)
  assert.match(
    migration,
    /insert into private\.reminder_delivery_control \(singleton, delivery_enabled\)[\s\S]*?values \(true, false\)/
  )
  assert.match(
    migration,
    /unique \(user_id, scheduled_local_date\)/
  )
  assert.match(
    migration,
    /revoke all on schema private from public, anon, authenticated, service_role/
  )
  assert.doesNotMatch(migration, /\bemail\s+(?:text|varchar|character varying)\b/i)
  assert.doesNotMatch(migration, /cron\.schedule|pg_cron|net\.http|resend|postmark|sendgrid/i)
})
test('reminder claims use short leases, fencing tokens, and nonblocking locks', () => {
  assert.match(migration, /for update of delivery skip locked/)
  assert.match(migration, /claim_token = gen_random_uuid\(\)/)
  assert.match(migration, /attempt_count = delivery\.attempt_count \+ 1/)
  assert.match(migration, /delivery\.lease_expires_at <= p_now/)
  assert.match(migration, /delivery\.claim_token = p_claim_token/)
  assert.match(migration, /delivery\.lease_expires_at > p_observed_at/)
  assert.match(migration, /security definer\nset search_path = ''/)
  assert.match(
    migration,
    /grant execute on function public\.claim_due_reminder_deliveries\([\s\S]*?to service_role/
  )
  assert.match(
    migration,
    /revoke execute on function public\.claim_due_reminder_deliveries\([\s\S]*?from public, anon, authenticated/
  )
})

test('reminder scheduler tests exercise DST, concurrency, retry, and client denial', () => {
  assert.match(databaseTest, /select plan\(64\)/)
  assert.match(databaseTest, /America\/New_York/)
  assert.match(databaseTest, /nonexistent spring-forward wall time/)
  assert.match(databaseTest, /ambiguous fall-back wall time/)
  assert.match(databaseTest, /dblink_send_query\([\s\S]*?'dispatch_worker_a'/)
  assert.match(databaseTest, /dblink_send_query\([\s\S]*?'dispatch_worker_b'/)
  assert.match(databaseTest, /stale crashed-worker token cannot complete/)
  assert.match(databaseTest, /an authenticated browser cannot invoke/)
  assert.match(databaseTest, /an anonymous client cannot invoke/)
  assert.match(databaseTest, /non-allowlisted user never enters the private ledger/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_dispatch_ledger\.test\.sql --local/
  )
})
