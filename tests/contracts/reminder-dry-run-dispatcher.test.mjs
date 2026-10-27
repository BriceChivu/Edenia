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
const claimShared = await readFile(
  new URL('supabase/functions/_shared/reminder-delivery-claim.ts', projectRoot),
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
  assert.match(
    source,
    /withSupabase\(\s*\{ auth: 'secret:reminder_dispatcher' \}/
  )
  assert.match(source, /context\.supabaseAdmin/)
  assert.doesNotMatch(source, /auth:\s*['"](?:none|user|publishable)/)
})

test('shadow evaluation is read-only and provider-free', () => {
  assert.match(shared, /readReminderDeliveryEnabled/)
  assert.match(claimShared, /reminder_delivery_is_enabled/)
  assert.match(shared, /evaluate_reminder_shadow/)
  assert.doesNotMatch(shared, /claim_due_typed_reminder_dry_runs|complete_typed_reminder_dry_run/)
  assert.doesNotMatch(source + shared + claimShared, /cron\.schedule|pg_cron|net\.http|resend|postmark|sendgrid|mailgun/i)
  assert.doesNotMatch(source + shared + claimShared, /auth\.users|\.from\(['"]auth|\.email\b|email_address|recipientEmail/i)
  assert.doesNotMatch(source + shared + claimShared, /fetch\s*\(/)
})

test('preview logs carry aggregate counts without personal or capability fields', () => {
  assert.match(shared, /event: 'reminder_shadow_candidates'/)
  assert.match(shared, /candidate_count/)
  assert.match(shared, /claimed: 0/)
  assert.doesNotMatch(shared, /user_id:|delivery_id:|claim_token:|claimToken|tokenDigest/)
})
