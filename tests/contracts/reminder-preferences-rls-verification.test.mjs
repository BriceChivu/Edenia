import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../../supabase/tests/reminder_preferences_rls.test.sql', import.meta.url),
  'utf8'
)

test('pgTAP reminder isolation covers two users, anonymous CRUD, and reassignment', () => {
  assert.match(source, /select plan\(35\)/)
  assert.match(source, /11111111-1111-4111-8111-111111111111/)
  assert.match(source, /22222222-2222-4222-8222-222222222222/)
  assert.match(source, /set local role authenticated/)
  assert.match(source, /set local role anon/)

  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(
      source,
      new RegExp(`an unauthenticated client cannot ${operation}`)
    )
  }
  assert.match(source, /user A cannot reassign their preference to user B/)
  assert.match(source, /user B cannot reassign their preference to user A/)
  for (const operation of ['select', 'update', 'delete']) {
    assert.match(source, new RegExp(`user A cannot ${operation} user B preference`))
    assert.match(source, new RegExp(`user B cannot ${operation} user A preference`))
  }
})

test('pgTAP reminder verification is transactional and checks schema boundaries', () => {
  assert.match(source, /^begin;/)
  assert.match(source, /select \* from finish\(\);\s*rollback;\s*$/)
  assert.match(source, /reminder_preferences has RLS enabled/)
  assert.match(source, /hasnt_column\([\s\S]*?'email'/)
  assert.match(source, /new streak email choices default on/)
  assert.match(source, /new discovery email choices default on/)
  assert.match(source, /the obsolete schedule path cannot be re-enabled/)
  assert.match(source, /duplicate reminder days are rejected/)
  assert.match(source, /unknown IANA timezones are rejected/)
  assert.doesNotMatch(source, /cron\.schedule|pg_cron|net\.http|send[_ -]?email/i)
})
