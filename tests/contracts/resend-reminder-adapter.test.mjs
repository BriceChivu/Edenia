import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const adapter = await readFile(
  new URL(
    'supabase/functions/_shared/resend-reminder-adapter.ts',
    projectRoot
  ),
  'utf8'
)
const adapterTest = await readFile(
  new URL(
    'supabase/functions/_shared/resend-reminder-adapter.test.ts',
    projectRoot
  ),
  'utf8'
)
const dispatcher = await readFile(
  new URL(
    'supabase/functions/dispatch-study-reminders/index.ts',
    projectRoot
  ),
  'utf8'
)
const dryRun = await readFile(
  new URL('supabase/functions/_shared/reminder-dry-run.ts', projectRoot),
  'utf8'
)
const liveDispatcher = await readFile(
  new URL('supabase/functions/_shared/reminder-live.ts', projectRoot),
  'utf8'
)

test('Resend adapter locks the provider and deduplication contract', () => {
  assert.match(adapter, /https:\/\/api\.resend\.com\/emails/)
  assert.match(adapter, /edenia-study-reminder-v1\/\$\{deliveryId\.toLowerCase\(\)\}/)
  assert.match(adapter, /'Idempotency-Key': idempotencyKey/)
  assert.match(adapter, /'User-Agent': 'Edenia-reminders\/1\.0'/)
  assert.match(adapter, /'List-Unsubscribe': `<\$\{unsubscribeApiUrl\}>`/)
  assert.match(adapter, /'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'/)
  assert.doesNotMatch(adapter, /Deno\.env|process\.env|console\.|\.log\(/)
})

test('Resend adapter results cannot expose provider bodies or recipient data', () => {
  assert.match(adapter, /MAX_PROVIDER_BODY_BYTES = 16 \* 1024/)
  assert.match(adapter, /status: 'accepted'/)
  assert.match(adapter, /status: 'deferred'/)
  assert.match(adapter, /status: 'blocked'/)
  assert.doesNotMatch(adapter, /message:\s*(?:body|error)|providerBody|rawBody/)
  assert.match(adapterTest, /doesNotMatch\(JSON\.stringify\(result\), \/@\|re_test_key/i)
  assert.match(adapterTest, /idempotency conflicts/)
  assert.match(adapterTest, /unknown success bodies as retryable ambiguous responses/)
  assert.match(adapterTest, /network failures and timeouts/)
})

test('the provider adapter is reachable only through the fenced live runner', () => {
  assert.match(dispatcher, /reminder-dispatcher/)
  assert.match(liveDispatcher, /resend-reminder-adapter/)
  assert.match(liveDispatcher, /begin_reminder_provider_attempt/)
  assert.match(liveDispatcher, /store_reminder_unsubscribe_token/)
  assert.doesNotMatch(dryRun, /resend-reminder-adapter/)
  assert.doesNotMatch(dispatcher, /api\.resend\.com/)
  assert.doesNotMatch(dryRun, /api\.resend\.com|RESEND_API_KEY/)
})
