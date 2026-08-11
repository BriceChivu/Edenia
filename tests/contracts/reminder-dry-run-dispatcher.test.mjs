import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const functionRoot = new URL(
  'supabase/functions/dispatch-study-reminders/',
  projectRoot
)
const config = await readFile(
  new URL('supabase/config.toml', projectRoot),
  'utf8'
)
const source = await readFile(new URL('index.ts', functionRoot), 'utf8')
const shared = await readFile(
  new URL('supabase/functions/_shared/reminder-dry-run.ts', projectRoot),
  'utf8'
)
const denoConfig = JSON.parse(await readFile(
  new URL('deno.json', functionRoot),
  'utf8'
))
const denoLock = JSON.parse(await readFile(
  new URL('deno.lock', functionRoot),
  'utf8'
))

test('dry-run dispatcher uses named secret-key authentication in its handler', () => {
  assert.match(
    config,
    /\[functions\.dispatch-study-reminders\][\s\S]*?verify_jwt = false/
  )
  assert.match(
    config,
    /entrypoint = "\.\/functions\/dispatch-study-reminders\/index\.ts"/
  )
  assert.equal(
    denoConfig.imports['@supabase/server'],
    'npm:@supabase/server@1.4.1'
  )
  assert.match(
    denoLock.specifiers['npm:@supabase/server@1.4.1'],
    /^1\.4\.1_/
  )
  assert.match(source, /withSupabase\(\s*\{ auth: 'secret:default' \}/)
  assert.match(source, /context\.supabaseAdmin/)
  assert.doesNotMatch(source, /auth:\s*['"](?:none|user|publishable)/)
})

test('dry-run dispatcher remains manual, bounded, and provider-free', () => {
  assert.match(shared, /const CLAIM_BATCH_SIZE = 25/)
  assert.match(shared, /const DUE_WINDOW_SECONDS = 15 \* 60/)
  assert.match(shared, /const LEASE_SECONDS = 2 \* 60/)
  assert.match(shared, /reminder_delivery_is_enabled/)
  assert.match(shared, /claim_due_reminder_deliveries/)
  assert.match(shared, /complete_reminder_dry_run/)
  assert.match(shared, /event: 'reminder_dry_run_intended'/)
  assert.doesNotMatch(
    source + shared,
    /cron\.schedule|pg_cron|net\.http|resend|postmark|sendgrid|mailgun/i
  )
  assert.doesNotMatch(source + shared, /auth\.users|\.from\(['"]auth|email/i)
  assert.doesNotMatch(source + shared, /fetch\s*\(/)
})

test('dry-run logs identify occurrences without exposing fencing tokens', () => {
  const intendedLog = shared.match(
    /log\(\{\s*event: 'reminder_dry_run_intended',[\s\S]*?\n\s*\}\)/
  )?.[0] || ''
  assert.match(intendedLog, /delivery_id: claim\.deliveryId/)
  assert.match(intendedLog, /user_id: claim\.userId/)
  assert.match(intendedLog, /scheduled_for: claim\.scheduledFor/)
  assert.match(intendedLog, /locale: claim\.locale/)
  assert.doesNotMatch(intendedLog, /claimToken|claim_token/)
})
