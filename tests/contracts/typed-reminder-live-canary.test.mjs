import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL(
  '../../supabase/migrations/20260812173000_add_typed_reminder_live_canary.sql',
  import.meta.url,
), 'utf8')
const databaseTest = await readFile(new URL(
  '../../supabase/tests/typed_reminder_live_canary.test.sql',
  import.meta.url,
), 'utf8')
const workflow = await readFile(new URL(
  '../../.github/workflows/ci.yml',
  import.meta.url,
), 'utf8')

test('typed live claims can promote only dry-run-materialized occurrences', () => {
  assert.match(migration, /create function public\.claim_due_typed_reminder_live/)
  assert.match(migration, /delivery\.email_type is not null/)
  assert.doesNotMatch(migration, /insert into private\.reminder_deliveries/i)
  assert.doesNotMatch(migration, /net\.http|cron\.schedule|resend\.com|auth\.users/i)
  assert.match(migration, /typed_reminder_live_delivery_disabled/)
  assert.match(migration, /p_batch_size < 1 or p_batch_size > 10/)
})

test('every typed pre-send mutation is service-only and switch-fenced', () => {
  for (const name of [
    'claim_due_typed_reminder_live',
    'store_typed_reminder_unsubscribe_token',
    'complete_typed_reminder_without_send',
    'begin_typed_reminder_provider_attempt',
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated, service_role`),
    )
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to service_role`),
    )
  }
  assert.ok((migration.match(/control\.delivery_enabled/g) ?? []).length >= 4)
  assert.match(migration, /private\.typed_reminder_delivery_is_current/)
  assert.match(migration, /recipient_not_allowlisted/)
})

test('CI runs the live canary database proof when its boundary changes', () => {
  assert.match(databaseTest, /select plan\(32\)/)
  assert.match(databaseTest, /autosaved opt-out wins at the final pre-network fence/)
  assert.match(databaseTest, /safe retry reuses the exact unsubscribe capability/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/typed_reminder_live_canary\.test\.sql --local/,
  )
})
