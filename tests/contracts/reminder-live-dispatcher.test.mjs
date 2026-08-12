import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const files = await Promise.all([
  'supabase/functions/_shared/reminder-dispatcher.ts',
  'supabase/functions/_shared/reminder-live-config.ts',
  'supabase/functions/_shared/reminder-live.ts',
  'supabase/functions/dispatch-study-reminders/index.ts',
].map(path => readFile(new URL(path, projectRoot), 'utf8')))
const [dispatcher, config, live, entrypoint] = files
const combined = files.join('\n')

test('live configuration is checked before the live runner can claim work', () => {
  const configIndex = dispatcher.indexOf('readReminderLiveConfig(readEnvironment)')
  const runnerIndex = dispatcher.indexOf('runReminderLive(client, config')
  assert.ok(configIndex >= 0)
  assert.ok(runnerIndex > configIndex)
  assert.match(config, /RESEND_API_KEY/)
  assert.match(config, /REMINDER_FROM_ADDRESS/)
  assert.match(config, /REMINDER_UNSUBSCRIBE_SECRET/)
  assert.match(config, /REMINDER_APP_URL/)
  assert.match(config, /REMINDER_UNSUBSCRIBE_PAGE_URL/)
  assert.match(config, /SUPABASE_URL/)
  assert.match(config, /REMINDER_LIVE_RECIPIENT_EMAIL/)
})

test('the live worker is bounded and fences immediately before provider I/O', () => {
  assert.match(live, /const CLAIM_BATCH_SIZE = 5/)
  assert.match(live, /const LEASE_SECONDS = 5 \* 60/)
  assert.match(live, /claim_due_typed_reminder_live/)
  const allowlistIndex = live.indexOf('recipient !== config.allowedRecipientEmail')
  const tokenIndex = live.search(/client\.rpc\([\s\n]*'store_typed_reminder_unsubscribe_token'/)
  const beginIndex = live.search(/client\.rpc\([\s\n]*'begin_typed_reminder_provider_attempt'/)
  const sendIndex = live.indexOf('providerResult = await send({')
  assert.ok(allowlistIndex >= 0)
  assert.ok(tokenIndex > allowlistIndex)
  assert.ok(beginIndex > tokenIndex)
  assert.ok(sendIndex > beginIndex)
  assert.match(live, /complete_typed_reminder_without_send/)
  assert.match(live, /complete_reminder_provider_acceptance/)
  assert.match(live, /complete_reminder_provider_failure/)
})

test('the deployment adds neither a schedule nor a credential value', () => {
  assert.match(entrypoint, /withSupabase\(\s*\{ auth: ['"]secret:default['"] \}/)
  assert.match(entrypoint, /Deno\.env\.get\(name\)/)
  assert.doesNotMatch(combined, /cron\.schedule|pg_cron|net\.http_post/iu)
  assert.doesNotMatch(
    combined,
    /(?:RESEND_API_KEY|REMINDER_UNSUBSCRIBE_SECRET)\s*[=:]\s*['"](?:re_|[A-Za-z0-9_-]{32})/u
  )
})

test('live logs omit recipients, secrets, capabilities, and provider bodies', () => {
  const logCalls = live.match(/log\(\{[\s\S]*?\n\s*\}\)/gu) || []
  assert.ok(logCalls.length >= 5)
  const logs = logCalls.join('\n')
  assert.doesNotMatch(
    logs,
    /email|apiKey|unsubscribeApiUrl|tokenDigest|claimToken|providerMessageId|recipient\s*:/iu
  )
})
