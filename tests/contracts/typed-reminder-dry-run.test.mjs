import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const [migration, databaseTest, workflow, launchMigration, catalog] = await Promise.all([
  read('supabase/migrations/20261027085359_free_reminder_dispatch.sql'),
  read('supabase/tests/typed_reminder_dry_run.test.sql'),
  read('.github/workflows/ci.yml'),
  read('supabase/migrations/20260812163511_add_typed_reminder_dry_run.sql'),
  read('data/reminder-discovery-channels.json').then(JSON.parse),
])

test('current shadow evaluation retires mutating preview and uses a read-only aggregate', () => {
  const evaluator = migration.slice(migration.indexOf('create function public.evaluate_reminder_shadow'), migration.indexOf('create function public.plan_typed_reminders'))
  assert.match(evaluator, /language sql stable security definer/)
  assert.match(evaluator, /count\(\*\)/)
  assert.doesNotMatch(evaluator, /insert into|update .*set|delete from|net\.http|cron\.schedule/i)
  assert.match(migration, /revoke execute on function public\.claim_due_typed_reminder_dry_runs[\s\S]*?from public,anon,authenticated,service_role/)
  assert.match(migration, /revoke execute on function public\.complete_typed_reminder_dry_run[\s\S]*?from public,anon,authenticated,service_role/)
})

test('current eligibility uses accepted facts and the 10 XP/seven-day/90-day policy', () => {
  assert.match(migration, /reminder_projection_matches_head/)
  assert.match(migration, /reminder_study_points\(o\.user_id,o\.local_date-1\)>=private\.reminder_study_threshold\(\)/)
  assert.match(migration, /reminder_study_points\(o\.user_id,o\.local_date\),0\)<private\.reminder_study_threshold\(\)/)
  assert.match(migration, /scheduled_local_date>o\.local_date-7/)
  assert.match(migration, /interval '90 days'/)
  assert.match(migration, /interval '24 hours'/)
  assert.match(migration, /public\.reminder_type_enrolled/)
})

test('database launch catalog contains every reviewed channel and no extras', () => {
  const ids = new Set([...launchMigration.matchAll(/\(\n\s*'(UC[A-Za-z0-9_-]{20,})',\n\s*'[a-z0-9-]+',/g)].map(match => match[1]))
  assert.deepEqual(ids, new Set(catalog.channels.map(channel => channel.channelId)))
})

test('CI runs behavioral no-side-effect and eligibility proofs', () => {
  for (const proof of ['preview materializes no real occurrence', 'preview consumes no daily admission token', 'preview consumes no quota', 'checked preferences alone never enroll', 'zero peers']) assert.ok(databaseTest.includes(proof), proof)
  assert.match(workflow, /supabase test db supabase\/tests\/typed_reminder_dry_run\.test\.sql --local/)
  assert.match(workflow, /supabase test db supabase\/tests\/accepted_reminder_eligibility\.test\.sql --local/)
})
