import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const [handler, entrypoint, contract, adapter, config, packageJson] =
  await Promise.all([
    readFile(new URL(
      'supabase/functions/_shared/reminder-provider-webhook.ts',
      projectRoot,
    ), 'utf8'),
    readFile(new URL(
      'supabase/functions/resend-reminder-webhook/index.ts',
      projectRoot,
    ), 'utf8'),
    readFile(new URL(
      'supabase/functions/_shared/reminder-provider-contract.ts',
      projectRoot,
    ), 'utf8'),
    readFile(new URL(
      'supabase/functions/_shared/resend-reminder-adapter.ts',
      projectRoot,
    ), 'utf8'),
    readFile(new URL('supabase/config.toml', projectRoot), 'utf8'),
    readFile(new URL('package.json', projectRoot), 'utf8'),
  ])

test('webhook verification uses the bounded raw body before event parsing or RPC', () => {
  const bodyIndex = handler.indexOf('readBoundedRawBody(request)')
  const verifyIndex = handler.indexOf('verifier.verify(rawBody.body')
  const parseIndex = handler.lastIndexOf('parseReminderProviderEvent(')
  const recordIndex = handler.indexOf('dependencies.recordEvent(parsed.input)')
  assert.ok(bodyIndex >= 0)
  assert.ok(verifyIndex > bodyIndex)
  assert.ok(parseIndex > verifyIndex)
  assert.ok(recordIndex > parseIndex)
  assert.match(handler, /MAX_WEBHOOK_BODY_BYTES = 64 \* 1024/)
  assert.match(handler, /new Webhook\(secret\)/)
  assert.doesNotMatch(handler, /request\.json\(\)/)
})

test('send and receive paths share exact non-personal provider tags', () => {
  assert.match(
    contract,
    /RESEND_REMINDER_SOURCE_TAG = 'edenia-study-reminder'/,
  )
  assert.match(adapter, /from '\.\/reminder-provider-contract\.ts'/)
  assert.match(handler, /from '\.\/reminder-provider-contract\.ts'/)
  assert.match(adapter, /name: 'delivery_id'/)
  assert.match(handler, /tags\.delivery_id/)
})

test('the signed payload contributes only bounded event correlation metadata', () => {
  assert.match(handler, /const providerMessageId = data\.email_id/)
  assert.doesNotMatch(handler, /data\.(?:to|from|subject|message_id)/)
  assert.match(handler, /EVENT_ID_PATTERN/)
  assert.match(handler, /DELIVERY_ID_PATTERN/)
  assert.match(handler, /PROVIDER_MESSAGE_ID_PATTERN/)
  assert.match(handler, /TIMESTAMP_WITH_ZONE_PATTERN/)
  assert.match(
    handler,
    /tags\.source !== RESEND_REMINDER_SOURCE_TAG[\s\S]*?status: 'ignored'/,
  )
})

test('missing signing configuration fails closed before reading request data', () => {
  const verifierIndex = handler.indexOf('createVerifier(dependencies.webhookSecret)')
  const headerIndex = handler.indexOf('readSignatureHeaders(request)')
  const bodyIndex = handler.indexOf('readBoundedRawBody(request)')
  assert.ok(verifierIndex >= 0)
  assert.ok(headerIndex > verifierIndex)
  assert.ok(bodyIndex > headerIndex)
  assert.match(entrypoint, /Deno\.env\.get\('RESEND_WEBHOOK_SECRET'\)/)
  assert.match(handler, /status: 'unavailable'/)
  assert.match(handler, /'Retry-After': '300'/)
})

test('the public provider endpoint is signature-only and included in type checks', () => {
  assert.match(config, /\[functions\.resend-reminder-webhook\][\s\S]*?verify_jwt = false/)
  assert.match(entrypoint, /record_reminder_provider_event/)
  assert.doesNotMatch(entrypoint, /RESEND_API_KEY|api\.resend\.com|delivery_enabled/iu)
  assert.doesNotMatch(handler, /access-control-allow-origin/iu)
  assert.match(packageJson, /resend-reminder-webhook\/deno\.json/)
  assert.match(packageJson, /"svix": "1\.99\.1"/)
})

test('the webhook chunk cannot enable sending or scheduling', () => {
  const source = [handler, entrypoint, contract].join('\n')
  assert.doesNotMatch(
    source,
    /cron\.schedule|pg_cron|api\.resend\.com|RESEND_API_KEY|delivery_enabled\s*=\s*true/iu,
  )
})
