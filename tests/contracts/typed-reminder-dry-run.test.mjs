import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL(
    'supabase/migrations/20260812163511_add_typed_reminder_dry_run.sql',
    projectRoot
  ),
  'utf8'
)
const databaseTest = await readFile(
  new URL('supabase/tests/typed_reminder_dry_run.test.sql', projectRoot),
  'utf8'
)
const workflow = await readFile(
  new URL('.github/workflows/ci.yml', projectRoot),
  'utf8'
)
const discoveryCatalog = JSON.parse(await readFile(
  new URL('data/reminder-discovery-channels.json', projectRoot),
  'utf8'
))

test('typed reminder claims are structurally dry-run only', () => {
  assert.match(migration, /create function public\.claim_due_typed_reminder_dry_runs/)
  assert.match(migration, /typed_reminder_dry_run_delivery_enabled/)
  assert.match(migration, /where control\.singleton and control\.delivery_enabled/)
  assert.match(migration, /grant execute on function public\.claim_due_typed_reminder_dry_runs[\s\S]*?to service_role/)
  assert.doesNotMatch(
    migration,
    /create (?:or replace )?function public\.claim_due_reminder_deliveries/
  )
  assert.doesNotMatch(
    migration,
    /\bemail\s+(?:text|varchar|character varying)\b|api\.resend|fetch\s*\(|net\.http|cron\.schedule/i
  )
})

test('typed eligibility keeps each product rule explicit and fail closed', () => {
  assert.match(migration, /'streak'::text as email_type/)
  assert.match(migration, /'discovery'::text as email_type/)
  assert.match(migration, /recipient\.last_qualified_study_date = recipient\.local_date - 1/)
  assert.match(migration, /recipient\.points_today < 5/)
  assert.match(migration, /previous\.scheduled_local_date > recipient\.local_date - 3/)
  assert.match(migration, /recipient\.scheduled_for - interval '24 hours'/)
  assert.match(migration, /snapshot\.updated_at >= p_now - interval '30 days'/)
  assert.match(migration, /order by candidate\.user_id, candidate\.priority/)
  assert.match(migration, /private\.typed_reminder_delivery_is_current/)
})

test('database copy contains every reviewed discovery channel and no extras', () => {
  const migrationIds = new Set(
    [...migration.matchAll(/\(\n\s*'(UC[A-Za-z0-9_-]{20,})',\n\s*'[a-z0-9-]+',/g)]
      .map(match => match[1])
  )
  const sourceIds = new Set(discoveryCatalog.channels.map(channel => channel.channelId))
  assert.deepEqual(migrationIds, sourceIds)
})

test('CI runs the behavioral database boundary suite', () => {
  assert.match(databaseTest, /select plan\(40\)/)
  assert.match(databaseTest, /streak has priority when both email types qualify/)
  assert.match(databaseTest, /rolling 24-hour guard blocks a second local date/)
  assert.match(databaseTest, /two full intervening days/)
  assert.match(databaseTest, /autosaved preference changes are rechecked/)
  assert.match(databaseTest, /typed dry runs never create provider state/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/typed_reminder_dry_run\.test\.sql --local/
  )
})
