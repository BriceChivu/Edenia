import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const [migration, databaseTest, workflow] = await Promise.all([
  read('supabase/migrations/20261027085359_free_reminder_dispatch.sql'),
  read('supabase/tests/typed_reminder_live_canary.test.sql'),
  read('.github/workflows/ci.yml'),
])

test('live claims automatically plan occurrences with bounded batches and no provider I/O in SQL', () => {
  assert.match(migration, /create function public\.plan_typed_reminders/)
  assert.match(migration, /insert into private\.reminder_deliveries/)
  assert.match(migration, /perform public\.plan_typed_reminders\(p_now\)/)
  assert.match(migration, /p_batch_size not between 1 and 10/)
  assert.match(migration, /for update of d skip locked/)
  assert.doesNotMatch(migration, /net\.http|api\.resend\.com/)
})

test('provider begin retains accepted-head, enrollment, payload, recipient and quota fences', () => {
  assert.match(migration, /private\.typed_reminder_delivery_is_current/)
  assert.match(migration, /private\.reminder_projection_matches_head/)
  assert.match(migration, /public\.reminder_type_enrolled/)
  assert.match(migration, /b\.recipient_digest<>extensions\.digest\(v_email,'sha256'\)/)
  assert.match(migration, /private\.reserve_reminder_capacity/)
  assert.match(migration, /public\.reminder_delivery_is_enabled/)
  assert.match(migration, /p_at<d\.scheduled_for\+interval '1 hour'/)
  assert.match(migration, /interval '23 hours'/)
})

test('CI runs live retry, free-capacity and fairness proofs', () => {
  for (const proof of ['live claim automatically plans without dry-run preparation', 'retry keeps stable delivery UUID', 'same-period retry reuses reservation', 'one-hour cutoff never sends late', 'API accepted does not invent inbox delivery']) assert.ok(databaseTest.includes(proof), proof)
  for (const suite of ['typed_reminder_live_canary', 'free_reminder_dispatch', 'reminder_capacity_fairness']) assert.ok(workflow.includes(`supabase test db supabase/tests/${suite}.test.sql --local`))
})
