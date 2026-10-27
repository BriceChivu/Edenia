import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../../supabase/tests/reminder_preferences_rls.test.sql', import.meta.url),'utf8')
test('database preferences verify ownership and RPC-only enrollment boundaries', () => {
  for (const term of ['get_my_reminder_preferences','save_my_reminder_choice','enroll_my_reminder_choices',
    'reminder_owner_changed','reminder_choice_stale','reminder_verified_owner_required','reminder_enrollment_suppressed',
    'same-choice stale save rejected','different stale tab choice preserves earlier change',
    'stale save after unsubscribe cannot restore choice','hard suppression is never lost',
    'read does not grant consent','new streak email choices default on','new discovery email choices default on']) {
    assert.ok(source.includes(term),term)
  }
  assert.match(source,/set local role authenticated/)
  assert.match(source,/set local role anon/)
  assert.match(source,/user B selects only own preferences/)
  for (const operation of ['select','insert','update','delete']) assert.ok(source.includes(`an unauthenticated client cannot ${operation}`))
})
test('database verification is isolated and does not schedule or send', () => {
  assert.match(source,/^begin;/)
  assert.match(source,/select \* from finish\(\);\s*rollback;\s*$/)
  assert.doesNotMatch(source,/cron\.schedule|net\.http|send[_ -]?email/i)
})
