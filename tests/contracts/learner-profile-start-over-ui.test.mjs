import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const docs = await readFile(
  new URL('../../docs/account-authentication.md', import.meta.url),
  'utf8'
)

test('Start over and Undo have complete learner-facing copy in every locale', () => {
  const requiredKeys = [
    'settings.startOver.open',
    'settings.startOver.warning',
    'settings.startOver.cancel',
    'settings.startOver.confirm',
    'settings.startOver.undoTitle',
    'settings.startOver.undoAvailableUntil',
    'settings.startOver.undo',
    'toast.startOverFailed',
    'toast.startOverUndoFailed'
  ]

  for (const locale of SUPPORTED_LOCALES) {
    for (const key of requiredKeys) {
      assert.equal(
        typeof I18N[locale][key],
        'string',
        `${locale} is missing ${key}`
      )
      assert.match(I18N[locale][key], /\S/)
    }
  }
})

test('successful Start over emits one content-free product event', () => {
  assert.match(
    appSource,
    /profileStartedOver:\s*\(\)\s*=>\s*trackEdeniaEvent\('profile_started_over'\)/
  )
  assert.doesNotMatch(
    appSource,
    /profileStartedOver:\s*\([^)]*\)\s*=>\s*trackEdeniaEvent\('profile_started_over',/
  )
})

test('account documentation separates Start over from account deletion', () => {
  assert.match(docs, /## Start over and Undo/)
  assert.match(docs, /30 days/)
  assert.match(docs, /account\s+deletion remains outside the MVP/i)
})
