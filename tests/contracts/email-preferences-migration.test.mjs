import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationsRoot = new URL('../../supabase/migrations/', import.meta.url)

async function readMigration() {
  const matches = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_replace_schedule_with_email_types.sql')
  )
  assert.equal(matches.length, 1)
  return readFile(new URL(matches[0], migrationsRoot), 'utf8')
}

test('email choices default on while the obsolete scheduler is fenced off', async () => {
  const migration = await readMigration()

  assert.match(
    migration,
    /add column streak_reminders_enabled boolean not null default true/
  )
  assert.match(
    migration,
    /add column discovery_emails_enabled boolean not null default true/
  )
  assert.match(migration, /set enabled = false,/)
  assert.match(migration, /from private\.reminder_suppressions as suppression/)
  assert.match(migration, /else preference\.consent_source/)
  assert.doesNotMatch(migration, /consent_revoked_at\s*=\s*null/)
  assert.match(
    migration,
    /if current_user = 'authenticated' and new\.enabled then/
  )
  assert.match(
    migration,
    /create trigger reject_client_legacy_reminder_schedule/
  )
  assert.match(
    migration,
    /create trigger disable_email_preferences_on_consent_revocation/
  )
  assert.match(migration, /new\.streak_reminders_enabled := false/)
  assert.match(migration, /new\.discovery_emails_enabled := false/)
  assert.match(
    migration,
    /not \(streak_reminders_enabled or discovery_emails_enabled\)/
  )
  assert.doesNotMatch(
    migration,
    /\bemail\s+(?:text|varchar|character varying)\b|cron\.|net\.http|api\.resend/iu
  )
})
