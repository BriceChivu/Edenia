import assert from 'node:assert/strict'
import test from 'node:test'

import {
  consumeReminderDestination
} from '../../src/integrations/reminder-destination.js'

function consume(search, enabled = true) {
  const replacements = []
  const result = consumeReminderDestination({
    enabled,
    location: { href: `https://example.test/${search}` },
    history: {
      state: { kept: true },
      replaceState(state, title, url) {
        replacements.push({ state, title, url })
      }
    }
  })
  return { replacements, result }
}

test('accepts only complete streak and discovery destinations', () => {
  assert.deepEqual(
    consume('?internal_test=1&reminder=streak').result,
    { emailType: 'streak', videoId: null, channelId: null }
  )
  assert.deepEqual(
    consume('?internal_test=1&reminder=discovery&video=abcdefghijk&channel=UCC_fdR7zZ_5SU--xuOrEdKw').result,
    {
      emailType: 'discovery',
      videoId: 'abcdefghijk',
      channelId: 'UCC_fdR7zZ_5SU--xuOrEdKw'
    }
  )
})

test('consumes malformed, duplicate, and switch-off parameters without acting', () => {
  for (const [search, enabled] of [
    ['?internal_test=1&reminder=discovery&video=too-short', true],
    ['?internal_test=1&reminder=streak&video=abcdefghijk', true],
    ['?internal_test=1&reminder=discovery&reminder=streak&video=abcdefghijk&channel=UCC_fdR7zZ_5SU--xuOrEdKw', true],
    ['?reminder=discovery&video=abcdefghijk&channel=UCC_fdR7zZ_5SU--xuOrEdKw', false]
  ]) {
    const consumed = consume(search, enabled)
    assert.equal(consumed.result, null)
    assert.deepEqual(consumed.replacements, [{
      state: { kept: true },
      title: '',
      url: enabled ? '/?internal_test=1' : '/'
    }])
  }
})

test('leaves ordinary URLs untouched and preserves unrelated parameters', () => {
  assert.deepEqual(consume('?internal_test=1'), {
    replacements: [],
    result: null
  })
  const consumed = consume(
    '?internal_test=1&source=email&reminder=streak#study'
  )
  assert.equal(
    consumed.replacements[0].url,
    '/?internal_test=1&source=email#study'
  )
})
