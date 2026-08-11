import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL(
    'supabase/migrations/20260812030000_add_reminder_suppression_safety.sql',
    projectRoot
  ),
  'utf8'
)
const databaseTest = await readFile(
  new URL('supabase/tests/reminder_suppression_safety.test.sql', projectRoot),
  'utf8'
)
const workflow = await readFile(
  new URL('.github/workflows/ci.yml', projectRoot),
  'utf8'
)

test('suppression state and unsubscribe capabilities remain private and inert', () => {
  assert.match(migration, /create table private\.reminder_suppressions/)
  assert.match(migration, /create table private\.reminder_unsubscribe_tokens/)
  assert.match(migration, /token_digest bytea primary key/)
  assert.match(migration, /octet_length\(token_digest\) = 32/)
  assert.match(migration, /alter table private\.reminder_suppressions enable row level security/)
  assert.match(migration, /alter table private\.reminder_unsubscribe_tokens enable row level security/)
  assert.match(
    migration,
    /revoke all on table private\.reminder_unsubscribe_tokens\s+from public, anon, authenticated, service_role/
  )
  assert.doesNotMatch(migration, /\bemail\s+(?:text|varchar|character varying)\b/i)
  assert.doesNotMatch(migration, /cron\.schedule|pg_cron|net\.http|api\.resend|postmark|sendgrid/i)
})

test('suppression is sticky across client preference changes and outstanding claims', () => {
  assert.match(
    migration,
    /not exists \([\s\S]*?from private\.reminder_suppressions as suppression[\s\S]*?suppression\.user_id = preference\.user_id/
  )
  assert.match(
    migration,
    /not exists \([\s\S]*?from private\.reminder_suppressions as suppression[\s\S]*?suppression\.user_id = delivery\.user_id/
  )
  assert.match(migration, /status in \('pending', 'claimed', 'dry_run_observed', 'suppressed'\)/)
  assert.match(migration, /delivery\.status in \('pending', 'claimed'\)/)
  assert.match(migration, /consent_revoked_at = coalesce/)
  assert.match(migration, /on conflict \(user_id\) do nothing/)
})

test('single-use digest RPCs are service-only and covered in the database suite', () => {
  assert.match(migration, /create or replace function public\.store_reminder_unsubscribe_token/)
  assert.match(migration, /create or replace function public\.consume_reminder_unsubscribe_token/)
  assert.match(migration, /create or replace function public\.record_reminder_suppression/)
  assert.match(migration, /security definer\nset search_path = ''/)
  assert.match(
    migration,
    /revoke execute on function public\.consume_reminder_unsubscribe_token\([\s\S]*?from public, anon, authenticated/
  )
  assert.match(
    migration,
    /grant execute on function public\.consume_reminder_unsubscribe_token\([\s\S]*?to service_role/
  )
  assert.match(databaseTest, /select plan\(55\)/)
  assert.match(databaseTest, /client preference changes cannot bypass server suppression/)
  assert.match(databaseTest, /a consumed digest cannot apply a second mutation/)
  assert.match(databaseTest, /replayed provider suppression is idempotent/)
  assert.match(databaseTest, /an unauthenticated client cannot consume a digest directly/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_suppression_safety\.test\.sql --local/
  )
})
