// Exercise a real retry storing its existing token while the owner unsubscribes.
// Requires an empty disposable local Supabase database. No provider is contacted.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { reminderTestWindow } from './reminder-test-window.mjs'
const container = process.env.REMINDER_TEST_DATABASE_CONTAINER
if (!/^supabase_db_[a-zA-Z0-9_-]+$/.test(container || '')) throw new Error('Set REMINDER_TEST_DATABASE_CONTAINER to an empty disposable local database')
const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
const sql = source => execFileSync('docker', args, { input: source, encoding: 'utf8' }).trim()
const quote = value => `'${String(value).replaceAll("'", "''")}'`
assert.equal(sql('select count(*) from auth.users'), '0')
assert.equal(sql('select public.reminder_delivery_is_enabled()'), 'f')
assert.equal(sql('select count(*) from private.reminder_quota_reservations'), '0', 'Use a database with no retained provider usage')
const owner = '521dd000-0000-4000-8000-000000000001'
const point = await reminderTestWindow(sql)
function query(source) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => code ? reject(new Error(`Local concurrency query failed: ${stderr.slice(0, 200)}`)) : resolve(stdout.trim()))
    child.stdin.end(source)
  })
}
try {
  sql(`begin;
    update private.learner_profile_access_control set rollout_state='signed-in-public';
    ${readFileSync(new URL('../../supabase/tests/helpers/reminder_521_fixtures.sql', import.meta.url), 'utf8')}
    select pg_temp.email_fixture(${quote(owner)},${quote(point.zone)},${quote(point.date)},9,10);
    select public.refresh_reminder_eligibility_snapshots(10,now());
    update private.reminder_delivery_control set delivery_enabled=true,admission_mode='canary';
    select pg_temp.email_capacity(now());
    create temporary table first_claim as select * from public.claim_due_typed_reminder_live();
    select public.store_typed_reminder_unsubscribe_token(delivery_id,claim_token,extensions.digest(delivery_id::text,'sha256'),now()) from first_claim;
    select pg_temp.bind_email(claim_token,now()) from first_claim;
    select public.begin_typed_reminder_provider_attempt(claim_token,'resend',now()) from first_claim;
    update private.reminder_deliveries set lease_expires_at=now()-interval '1 second' where user_id=${quote(owner)};
    select * from public.claim_due_typed_reminder_live();
    commit;`)
  const claim = JSON.parse(sql(`select json_build_object('id',id,'token',claim_token) from private.reminder_deliveries where user_id=${quote(owner)}`))
  assert.ok(claim?.id && claim?.token)
  const digest = `extensions.digest(${quote(claim.id)},'sha256')`
  // The owner locks the capability first, as the real endpoint does. While
  // it holds that row, a retry stores the same immutable digest. The retired
  // store locked delivery -> token, creating a cycle when opt-out resumed.
  const results = await Promise.all([
    query(`begin; set lock_timeout='3s'; set statement_timeout='5s';
      select 'owner-locked' from private.reminder_unsubscribe_tokens where delivery_id=${quote(claim.id)} for update;
      select pg_sleep(0.5);
      select public.consume_reminder_unsubscribe_token(${digest},clock_timestamp()); commit;`),
    query(`begin; set lock_timeout='3s'; set statement_timeout='5s'; select pg_sleep(0.1);
      select public.store_typed_reminder_unsubscribe_token(${quote(claim.id)},${quote(claim.token)},${digest},clock_timestamp()); commit;`),
  ])
  assert.ok(results[0].split('\n').includes('unsubscribed'), 'unsubscribe completes without a lock cycle')
  assert.ok(results[1].split('\n').includes('t'), 'retry stores the immutable token while unsubscribe holds it')
  assert.equal(sql(`select count(*) from private.reminder_suppressions where user_id=${quote(owner)}`), '1')
  assert.equal(sql(`select count(*) from public.reminder_preferences where user_id=${quote(owner)} and consent_revoked_at is not null and streak_enrollment_version is null and discovery_enrollment_version is null`), '1')
  assert.equal(sql(`select count(*) from private.reminder_deliveries where user_id=${quote(owner)} and status='suppressed'`), '1')
  console.log('PASS real PostgreSQL retry/unsubscribe race: both complete, both enrollments revoked, occurrence suppressed, no provider request')
} finally {
  sql(`update private.reminder_delivery_control set delivery_enabled=false,admission_mode='canary';
    delete from private.reminder_quota_reservations;
    delete from auth.users where id=${quote(owner)};
    update private.reminder_free_capacity set verified_free=false,overage_disabled=false,sender_verified=false,observed_at=null,attested_at=null;
    update private.learner_profile_access_control set rollout_state='off';`)
}
