import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL(
    'supabase/migrations/20260812103000_fence_live_reminder_prerequisites.sql',
    projectRoot
  ),
  'utf8'
)
const databaseTest = await readFile(
  new URL('supabase/tests/reminder_live_prerequisites.test.sql', projectRoot),
  'utf8'
)
const workflow = await readFile(
  new URL('.github/workflows/ci.yml', projectRoot),
  'utf8'
)

test('live prerequisites strengthen state without adding a sender', () => {
  assert.match(
    migration,
    /drop function public\.store_reminder_unsubscribe_token\(\s*uuid, bytea, timestamptz/
  )
  assert.match(
    migration,
    /create function public\.store_reminder_unsubscribe_token\([\s\S]*?p_claim_token uuid/
  )
  assert.match(migration, /delivery\.claim_token = p_claim_token/)
  assert.match(migration, /for update of delivery/)
  assert.match(migration, /create function public\.complete_reminder_without_send/)
  assert.match(migration, /p_failure_code <> 'recipient_unavailable'/)
  assert.match(migration, /delivery\.send_started_at is null/)
  assert.doesNotMatch(
    migration,
    /\bemail\s+(?:text|varchar|character varying)\b|api\.resend|fetch\s*\(|net\.http|cron\.schedule/i
  )
})

test('new RPCs remain service-only and preserve no-provider truth', () => {
  assert.match(
    migration,
    /revoke execute on function public\.store_reminder_unsubscribe_token\([\s\S]*?from public, anon, authenticated/
  )
  assert.match(
    migration,
    /grant execute on function public\.complete_reminder_without_send\([\s\S]*?to service_role/
  )
  assert.match(databaseTest, /select plan\(45\)/)
  assert.match(databaseTest, /crashed worker cannot store with its stale claim token/)
  assert.match(databaseTest, /changed preference snapshot fences capability storage/)
  assert.match(databaseTest, /removing the tester UUID immediately fences token storage/)
  assert.match(databaseTest, /without inventing provider attempt state/)
  assert.match(databaseTest, /started provider attempt cannot be rewritten/)
  assert.match(databaseTest, /authenticated client cannot store a capability/)
  assert.match(databaseTest, /unauthenticated client cannot complete a no-send outcome/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_live_prerequisites\.test\.sql --local/
  )
})
