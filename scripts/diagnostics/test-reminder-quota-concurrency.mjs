// Two real PostgreSQL sessions contend for the final free-capacity slot.
// No provider is contacted. Use a disposable empty local Supabase database.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { reminderTestWindow } from './reminder-test-window.mjs'
const container=process.env.REMINDER_TEST_DATABASE_CONTAINER
if(!/^supabase_db_[a-zA-Z0-9_-]+$/.test(container||'')) throw new Error('Set REMINDER_TEST_DATABASE_CONTAINER to an empty disposable local database')
const args=['exec','-i',container,'psql','-X','-U','postgres','-At','-v','ON_ERROR_STOP=1']
const sql=source=>execFileSync('docker',args,{input:source,encoding:'utf8'}).trim()
const q=value=>`'${String(value).replaceAll("'","''")}'`
assert.equal(sql('select count(*) from auth.users'),'0')
assert.equal(sql('select public.reminder_delivery_is_enabled()'),'f')
assert.equal(sql('select count(*) from private.reminder_quota_reservations'), '0', 'Use a database with no retained provider usage')
const users=['521cc000-0000-4000-8000-000000000001','521cc000-0000-4000-8000-000000000002']
const point = await reminderTestWindow(sql)
function query(source) {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']})
    let stdout='',stderr=''
    child.stdout.on('data',chunk=>stdout+=chunk)
    child.stderr.on('data',chunk=>stderr+=chunk)
    child.on('error',reject)
    child.on('close',code=>code?reject(new Error(`Local concurrent query failed: ${stderr.slice(0,200)}`)):resolve(stdout.trim()))
    child.stdin.end(source)
  })
}
try {
  sql(`begin; update private.learner_profile_access_control set rollout_state='signed-in-public'; ${readFileSync(new URL('../../supabase/tests/helpers/reminder_521_fixtures.sql',import.meta.url),'utf8')}
    ${users.map(id=>`select pg_temp.email_fixture(${q(id)},${q(point.zone)},${q(point.date)},9,10);`).join('\n')}
    select public.refresh_reminder_eligibility_snapshots(10,now());
    update private.reminder_delivery_control set delivery_enabled=true;
    select pg_temp.email_capacity(now());
    create temporary table claims as select * from public.claim_due_typed_reminder_live();
    select public.store_typed_reminder_unsubscribe_token(delivery_id,claim_token,extensions.digest(delivery_id::text,'sha256'),now()) from claims;
    select pg_temp.bind_email(claim_token,now()) from claims;
    insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at,consumed_at)
      select gen_random_uuid(),(now() at time zone 'UTC')::date,now(),now() from generate_series(1,59);
    commit;`)
  const claims=JSON.parse(sql(`select json_agg(claim_token) from private.reminder_deliveries where user_id in(${users.map(q).join(',')})`))
  assert.equal(claims.length,2)
  // Both independent sessions wait at the same start gate. Each then executes
  // the actual final provider-begin RPC; its shared row lock owns quota admission.
  const results=await Promise.all(claims.map(token=>query(`set lock_timeout='3s'; select public.begin_typed_reminder_provider_attempt(${q(token)},'resend',clock_timestamp()) from (select pg_sleep(0.25)) gate;`)))
  assert.deepEqual(results.map(value=>value.split('\n').at(-1)).sort(),['f','t'])
  assert.equal(sql('select count(*) from private.reminder_quota_reservations where released_at is null'),'60')
  assert.equal(sql(`select count(*) from private.reminder_deliveries where user_id in(${users.map(q).join(',')}) and may_have_sent`),'1')
  console.log('PASS two concurrent PostgreSQL workers: exactly one final quota admission, 60 total reservations, no provider requests')
} finally {
  sql(`update private.reminder_delivery_control set delivery_enabled=false; delete from private.reminder_quota_reservations; delete from auth.users where id in(${users.map(q).join(',')}); update private.reminder_free_capacity set verified_free=false,overage_disabled=false,sender_verified=false,observed_at=null,attested_at=null; update private.learner_profile_access_control set rollout_state='off';`)
}
