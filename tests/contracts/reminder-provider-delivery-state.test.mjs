import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL(
    'supabase/migrations/20260812090000_add_reminder_provider_delivery_state.sql',
    projectRoot
  ),
  'utf8'
)
const databaseTest = await readFile(
  new URL('supabase/tests/reminder_provider_delivery_state.test.sql', projectRoot),
  'utf8'
)
const workflow = await readFile(
  new URL('.github/workflows/ci.yml', projectRoot),
  'utf8'
)

test('provider delivery state is durable without adding a sender', () => {
  for (const column of [
    'provider_name',
    'send_started_at',
    'send_retry_deadline',
    'provider_accepted_at',
    'provider_message_id',
    'permanent_failure_at',
    'failure_code',
    'outcome_ambiguous_at'
  ]) {
    assert.match(migration, new RegExp(`add column ${column}\\b`))
  }

  assert.match(migration, /send_started_at \+ interval '23 hours'/)
  assert.match(migration, /status = 'outcome_ambiguous'/)
  assert.match(migration, /reminder_deliveries_provider_message_id_key/)
  assert.doesNotMatch(
    migration,
    /\bemail\s+(?:text|varchar|character varying)\b/i
  )
  assert.doesNotMatch(
    migration,
    /cron\.schedule|pg_cron|net\.http|fetch\s*\(|api\.resend|postmark|sendgrid/i
  )
})

test('live claims and provider outcomes stay behind server-only fences', () => {
  assert.match(migration, /p_delivery_mode text default 'dry_run'/)
  assert.match(migration, /p_delivery_mode not in \('dry_run', 'live'\)/)
  assert.match(migration, /reminder_live_delivery_disabled/)
  assert.match(migration, /reminder_dry_run_delivery_enabled/)
  assert.match(migration, /create function public\.begin_reminder_provider_attempt/)
  assert.match(
    migration,
    /create function public\.complete_reminder_provider_acceptance/
  )
  assert.match(
    migration,
    /create function public\.complete_reminder_provider_failure/
  )
  assert.match(migration, /delivery\.claim_token = p_claim_token/)
  assert.match(migration, /delivery\.lease_expires_at > p_started_at/)
  assert.match(migration, /delivery\.send_retry_deadline > p_accepted_at/)
  assert.match(
    migration,
    /revoke execute on function public\.begin_reminder_provider_attempt\([\s\S]*?from public, anon, authenticated/
  )
  assert.match(
    migration,
    /grant execute on function public\.complete_reminder_provider_acceptance\([\s\S]*?to service_role/
  )
})

test('database verification covers retries, ambiguity, suppression, and CI', () => {
  assert.match(databaseTest, /select plan\(59\)/)
  assert.match(databaseTest, /retrying the same provider begin is idempotent/)
  assert.match(databaseTest, /stale crashed-worker token cannot record provider acceptance/)
  assert.match(databaseTest, /unknown outcome is never sent again at the retry deadline/)
  assert.match(databaseTest, /suppression can fence a provider attempt/)
  assert.match(databaseTest, /authenticated browser cannot begin a provider attempt/)
  assert.match(databaseTest, /unauthenticated client cannot claim provider work/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_provider_delivery_state\.test\.sql --local/
  )
})
