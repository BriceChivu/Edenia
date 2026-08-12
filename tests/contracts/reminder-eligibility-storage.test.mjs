import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migrationUrl = new URL(
  'supabase/migrations/20260812160120_add_reminder_eligibility_snapshots.sql',
  projectRoot
)
const databaseTestUrl = new URL(
  'supabase/tests/reminder_eligibility_snapshots.test.sql',
  projectRoot
)

test('reminder eligibility storage is bounded, owner-derived, and atomic', async () => {
  const migration = await readFile(migrationUrl, 'utf8')

  assert.match(migration, /create table public\.reminder_eligibility_snapshots/)
  assert.match(migration, /create table public\.reminder_channel_follows/)
  assert.match(migration, /references auth\.users \(id\) on delete cascade/g)
  assert.match(migration, /alter table public\.reminder_eligibility_snapshots enable row level security/)
  assert.match(migration, /alter table public\.reminder_channel_follows enable row level security/)
  assert.match(migration, /grant select on table public\.reminder_eligibility_snapshots to authenticated/)
  assert.match(migration, /grant select on table public\.reminder_channel_follows to authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*to authenticated/i)
  assert.match(
    migration,
    /create or replace function public\.sync_my_reminder_eligibility_snapshot\(payload jsonb\)[\s\S]*security definer[\s\S]*owner_id uuid := auth\.uid\(\)/
  )
  assert.match(migration, /jsonb_array_length\(payload -> 'channels'\) > 250/)
  assert.match(migration, /delete from public\.reminder_channel_follows[\s\S]*insert into public\.reminder_channel_follows/)
  assert.doesNotMatch(migration, /\bemail\b/i)
})

test('database verification covers two users, anonymous access, and reassignment', async () => {
  const source = await readFile(databaseTestUrl, 'utf8')

  assert.match(source, /user A can atomically sync their own derived snapshot/)
  assert.match(source, /user B can sync a separately owned snapshot/)
  assert.match(source, /user A cannot select user B snapshot data/)
  assert.match(source, /client cannot submit or reassign an owner UUID/)
  assert.match(source, /clients cannot reassign a stored owner UUID/)
  for (const operation of ['select eligibility snapshots', 'select followed channels', 'execute the snapshot RPC', 'insert followed channels']) {
    assert.match(source, new RegExp(`unauthenticated client cannot ${operation}`))
  }
  assert.match(source, /rejected replacement preserves the previous channel set/)
})

test('CI always applies the migration and runs its database isolation test', async () => {
  const workflow = await readFile(new URL('.github/workflows/ci.yml', projectRoot), 'utf8')

  assert.match(
    workflow,
    /supabase\/migrations\/\*_add_reminder_eligibility_snapshots\.sql\|supabase\/tests\/reminder_eligibility_snapshots\.test\.sql/
  )
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_eligibility_snapshots\.test\.sql --local/
  )
})
