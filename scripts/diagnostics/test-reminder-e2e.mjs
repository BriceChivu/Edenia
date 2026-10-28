// Actual planner/RPCs + actual dispatcher/templates/unsubscribe handler, with a
// fake provider. Run only against a disposable, empty local Supabase container.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { reminderTestWindow } from './reminder-test-window.mjs'
import { runReminderDispatcher } from '../../supabase/functions/_shared/reminder-dispatcher.ts'
import { handleReminderUnsubscribeRequest } from '../../supabase/functions/_shared/reminder-unsubscribe.ts'
const container = process.env.REMINDER_TEST_DATABASE_CONTAINER
if (!/^supabase_db_[a-zA-Z0-9_-]+$/.test(container || '')) throw new Error('Set REMINDER_TEST_DATABASE_CONTAINER to an empty disposable local database')
const env = { ...process.env }
const q = value => `'${String(value).replaceAll("'", "''")}'`
function sql(source) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8', env }).trim()
}
assert.equal(sql('select count(*) from auth.users'), '0', 'Use an empty isolated database')
assert.equal(sql('select public.reminder_delivery_is_enabled()'), 'f')
assert.equal(sql('select count(*) from private.reminder_quota_reservations'), '0', 'Use a database with no retained provider usage')
const user = '521ee000-0000-4000-8000-000000000001'
const email = `${user}@example.test`
const point = await reminderTestWindow(sql)
const apiKey = 're_test_key_1234567890'
const from = 'Edenia <reminders@example.test>'
const variables = {
  RESEND_API_KEY: apiKey, REMINDER_FROM_ADDRESS: from,
  REMINDER_UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret-more-than-32-bytes',
  REMINDER_UNSUBSCRIBE_KEY_VERSION: 'test-key-v1',
  REMINDER_APP_URL: 'https://www.edenia.study/',
  REMINDER_UNSUBSCRIBE_PAGE_URL: 'https://www.edenia.study/unsubscribe/',
  SUPABASE_URL: 'https://example-project.supabase.co',
  REMINDER_ADMISSION_MODE: 'canary', REMINDER_LIVE_RECIPIENT_EMAIL: email,
}
const setFunctions = new Set(['claim_due_typed_reminder_live', 'evaluate_reminder_shadow'])
const allowed = new Set([...setFunctions, 'reminder_delivery_is_enabled', 'reminder_provider_attestation_is_current', 'refresh_reminder_provider_usage', 'refresh_reminder_eligibility_snapshots', 'store_typed_reminder_unsubscribe_token', 'bind_reminder_payload', 'begin_typed_reminder_provider_attempt', 'complete_reminder_provider_acceptance', 'complete_typed_reminder_without_send', 'defer_typed_reminder', 'complete_typed_reminder_rejection', 'consume_reminder_unsubscribe_token'])
const encode = value => value === null ? 'null' : typeof value === 'boolean' ? String(value) : typeof value === 'number' ? String(value) : q(value)
let failCompletion = true
const client = {
  async rpc(name, args = {}) {
    assert.ok(allowed.has(name), `Unexpected RPC ${name}`)
    if (name === 'complete_reminder_provider_acceptance' && failCompletion) {
      failCompletion = false
      return { data: null, error: { message: 'synthetic database completion failure' } }
    }
    const call = `public.${name}(${Object.entries(args).map(([key, value]) => { assert.match(key, /^p_[a-z_]+$/); return `${key}=>${encode(value)}` }).join(',')})`
    try {
      const result = setFunctions.has(name)
        ? sql(`select coalesce(json_agg(row_to_json(r)),'[]') from ${call} r`)
        : sql(`select to_json(${call})`)
      return { data: JSON.parse(result), error: null }
    } catch { return { data: null, error: { message: 'local database RPC failed' } } }
  },
  auth: { admin: { async getUserById(id) {
    assert.equal(id, user)
    return { data: { user: JSON.parse(sql(`select json_build_object('id',id,'email',email,'email_confirmed_at',email_confirmed_at,'deleted_at',deleted_at) from auth.users where id=${q(id)}`)) }, error: null }
  } } },
}
const logs = []
const attempts = []
const receipts = new Map()
let forcedObservation = null
const dependencies = {
  // Use the fixture database's clock for both attestation and fake observations;
  // separate host/VM clocks can legitimately trigger the production stale fence.
  readCapacity: async () => ({ dailyUsed: receipts.size, monthlyUsed: receipts.size,
    observedAt: forcedObservation ?? JSON.parse(sql('select to_json(clock_timestamp())')),
    dailyResetsAt: '', monthlyResetsAt: '' }),
  async send(input) {
    attempts.push(input)
    if (!receipts.has(input.deliveryId)) receipts.set(input.deliveryId, `fake-${input.deliveryId}`)
    return { status: 'accepted', providerMessageId: receipts.get(input.deliveryId) }
  },
}
try {
  sql(`begin; update private.learner_profile_access_control set rollout_state='signed-in-public'; ${readFileSync(new URL('../../supabase/tests/helpers/reminder_521_fixtures.sql', import.meta.url), 'utf8')} select pg_temp.email_fixture(${q(user)},${q(point.zone)},${q(point.date)},9,10); commit;`)
  const preview = await runReminderDispatcher(client, name => variables[name], entry => logs.push(entry), dependencies)
  assert.equal(preview.mode, 'dry_run')
  assert.equal(sql('select count(*) from private.reminder_deliveries'), '0')
  assert.equal(attempts.length, 0)
  sql(`select public.record_reminder_free_capacity(true,true,true,0,0,now(),extensions.digest(${q(apiKey)},'sha256'),extensions.digest(${q(from)},'sha256')); update private.reminder_delivery_control set delivery_enabled=true;`)
  forcedObservation = JSON.parse(sql("select to_json(attested_at-interval '1 millisecond') from private.reminder_free_capacity where singleton"))
  const staleObservation = await runReminderDispatcher(client, name => variables[name], entry => logs.push(entry), dependencies)
  assert.equal(staleObservation.mode, 'live')
  assert.equal(staleObservation.status, 'blocked')
  assert.equal(staleObservation.claimed, 0)
  assert.ok(logs.some(entry => entry.event === 'reminder_live_blocked' && entry.reason === 'provider_capacity_fenced'))
  assert.equal(attempts.length, 0, 'an observation before attestation cannot reach the provider')
  assert.equal(sql('select count(*) from private.reminder_deliveries'), '0')
  assert.equal(sql('select count(*) from private.reminder_quota_reservations'), '0')
  forcedObservation = null
  const first = await runReminderDispatcher(client, name => variables[name], entry => logs.push(entry), dependencies)
  assert.equal(first.completionFailed, 1, JSON.stringify({ first, logs }))
  assert.equal(attempts.length, 1)
  sql(`update private.reminder_deliveries set lease_expires_at=now()-interval '1 second' where user_id=${q(user)};`)
  const retry = await runReminderDispatcher(client, name => variables[name], entry => logs.push(entry), dependencies)
  assert.equal(retry.accepted, 1)
  assert.equal(attempts.length, 2)
  assert.deepEqual(attempts[0], attempts[1], 'retry preserves the same UUID and every frozen payload input')
  assert.equal(receipts.size, 1, 'fake provider idempotency accepts only one message')
  assert.equal(sql('select count(*) from private.reminder_quota_reservations'), '1')
  assert.equal(sql('select count(*) from private.reminder_provider_events'), '0', 'API acceptance does not invent inbox delivery')
  const settled = await runReminderDispatcher(client, name => variables[name], entry => logs.push(entry), dependencies)
  assert.equal(settled.claimed, 0)
  assert.equal(attempts.length, 2)
  const response = await handleReminderUnsubscribeRequest(new Request(attempts[0].unsubscribeApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), client)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'unsubscribed')
  assert.equal(sql(`select streak_reminders_enabled or discovery_emails_enabled from public.reminder_preferences where user_id=${q(user)}`), 'f')
  const serialized = JSON.stringify(logs)
  for (const secret of [email, apiKey, variables.REMINDER_UNSUBSCRIBE_SECRET, new URL(attempts[0].unsubscribeApiUrl).searchParams.get('token')]) assert.ok(!serialized.includes(secret))
  console.log('PASS actual PostgreSQL + dispatcher + fake provider: stale-observation fence, automatic planning, ambiguous completion, identical retry, quota reuse, no duplicate acceptance, one-click unsubscribe, redacted logs')
} finally {
  sql(`update private.reminder_delivery_control set delivery_enabled=false; delete from private.reminder_quota_reservations where delivery_id in(select id from private.reminder_deliveries where user_id=${q(user)}); delete from auth.users where id=${q(user)}; update private.reminder_free_capacity set verified_free=false,overage_disabled=false,sender_verified=false,observed_at=null,attested_at=null; update private.learner_profile_access_control set rollout_state='off';`)
}
