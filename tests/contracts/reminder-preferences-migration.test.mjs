import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migrationsRoot = new URL('supabase/migrations/', projectRoot)

async function readReminderMigration() {
  const migrationFiles = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_add_reminder_preferences.sql')
  )
  assert.equal(migrationFiles.length, 1)
  return readFile(new URL(migrationFiles[0], migrationsRoot), 'utf8')
}

test('reminder preferences store schedule and consent without email or delivery', async () => {
  const migration = await readReminderMigration()

  assert.match(migration, /create table public\.reminder_preferences/)
  for (const column of [
    'user_id uuid',
    'enabled boolean',
    'days smallint\[\]',
    'local_time time without time zone',
    'timezone text',
    'locale text',
    'consent_granted_at timestamptz',
    'consent_revoked_at timestamptz',
    'consent_version text',
    'consent_source text'
  ]) {
    assert.match(migration, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(migration, /\bemail\s+(?:text|varchar|character varying)\b/i)
  assert.doesNotMatch(migration, /cron\.|cron\.schedule|pg_cron|net\.http|send[_ -]?email/i)
  assert.match(migration, /cardinality\(days\) =\s*case when 1 = any\(days\)/)
  assert.match(migration, /pg_catalog\.timezone\(/)
})

test('reminder preferences use explicit grants and owner-only RLS policies', async () => {
  const migration = await readReminderMigration()

  assert.match(migration, /alter table public\.reminder_preferences enable row level security/)
  assert.match(
    migration,
    /revoke all on table public\.reminder_preferences\s+from public, anon, authenticated, service_role/
  )
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.reminder_preferences\s+to authenticated/
  )
  assert.match(migration, /reminder_preferences_pkey primary key \(user_id\)/)
  assert.match(migration, /create index reminder_preferences_enabled_schedule_idx/)

  assert.equal((migration.match(/to authenticated/g) || []).length, 5)
  assert.match(
    migration,
    /for insert[\s\S]*?with check \(\(select auth\.uid\(\)\) is not null and \(select auth\.uid\(\)\) = user_id\)/
  )
  assert.match(
    migration,
    /for update[\s\S]*?using \(\(select auth\.uid\(\)\) is not null and \(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) is not null and \(select auth\.uid\(\)\) = user_id\)/
  )
  assert.doesNotMatch(migration, /\bto (?:public|anon)\b/)
})
