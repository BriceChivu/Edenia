import test from 'node:test'
import assert from 'node:assert/strict'
import { describeProfileStorageFailure, getStorageRecoveryPresentation, createStorageRecoveryReport, annotateStorageFailure } from '../../src/state/profile-storage-recovery.js'
import { renderStorageRecovery } from '../../src/features/onboarding/storage-recovery-view.js'
import { I18N } from '../../src/i18n/index.js'

test('unrecoverable saved-data failures offer help without pretending a retry can repair them', () => {
  for (const message of ['The migrated learner profile is missing', 'Invalid durable learner profile', 'Invalid legacy learner profile', 'Profile migration has conflicting durable copies']) {
    const failure = describeProfileStorageFailure(new Error(message))
    assert.equal(getStorageRecoveryPresentation(failure).canCheck, false)
    assert.equal(getStorageRecoveryPresentation(failure).titleKey, 'onboarding.recovery.saved.title')
  }
})
test('temporary failures offer one real storage check and then an actionable terminal screen', () => {
  for (const error of [new DOMException('secret payload', 'QuotaExceededError'), new DOMException('secret payload', 'SecurityError'), new Error('Profile database opening timed out')]) {
    const failure = describeProfileStorageFailure(error)
    assert.equal(getStorageRecoveryPresentation(failure).canCheck, true)
    assert.equal(getStorageRecoveryPresentation(failure, { checked: true }).canCheck, false)
  }
})
test('diagnostics exclude exception payloads, URLs, credentials and identifiers', () => {
  const report = createStorageRecoveryReport({ failure: describeProfileStorageFailure(new Error('SECRET PROFILE')), checked: true, mode: 'auth-trial', release: 'https://secret/token' })
  assert.deepEqual(JSON.parse(report), { diagnostic: 'edenia-storage-recovery-v1', code: 'storage-unavailable', outcome: 'failure', storageCheckedAgain: true, mode: 'auth-trial', release: null, error: { name: 'Error', message: null }, storageState: { migrationMarker: null, accessMetadataPresent: false, cloudOperationPresent: false }, operation: null, recovery: null, capabilities: { indexedDb: false, secureContext: false, online: true, browser: null, platform: null } })
  assert.ok(!report.includes('SECRET'))
})
test('diagnostics retain known storage errors while discarding arbitrary exception text', () => {
  for (const message of ['Profile database opening blocked', 'Profile transaction failed', 'IndexedDB backup store is missing']) {
    const report = JSON.parse(createStorageRecoveryReport({ failure: describeProfileStorageFailure(new Error(message)) }))
    assert.equal(report.error.message, message)
  }
  const report = JSON.parse(createStorageRecoveryReport({ failure: describeProfileStorageFailure(new Error('Profile database opening blocked PRIVATE TOKEN')) }))
  assert.equal(report.error.message, null)
})
test('recovery journal diagnostics retain the safe storage tier and bounded operation details', () => {
  const report = JSON.parse(createStorageRecoveryReport({ recovery: 'indexed-db',
    failure: { ...describeProfileStorageFailure(new Error('Recovery archive transaction timed out')), storageTarget: 'recovery-journal' } }))
  assert.equal(report.recovery, 'indexed-db')
  assert.equal(report.storageTarget, 'recovery-journal')
  assert.equal(report.error.message, 'Recovery archive transaction timed out')
  const unsafe = createStorageRecoveryReport({ failure: { storageTarget: 'PRIVATE TOKEN', errorMessage: 'Recovery archive transaction timed out PRIVATE TOKEN' } })
  assert.ok(!unsafe.includes('PRIVATE'))
})
test('each locale explains preservation, synced-copy recovery and manual clipboard fallback', () => {
  for (const [locale, dictionary] of Object.entries(I18N)) {
    const t = key => {
      assert.equal(typeof dictionary[key], 'string', `${locale}: ${key}`)
      return dictionary[key]
    }
    const renderHeading = (title, body) => `<h2>${t(title)}</h2><p>${t(body)}</p>`
    for (const failure of [describeProfileStorageFailure(new Error('Invalid durable learner profile')), describeProfileStorageFailure(new DOMException('', 'QuotaExceededError')), describeProfileStorageFailure(new DOMException('', 'SecurityError')), describeProfileStorageFailure(new Error())]) {
      for (const checked of [false, true]) {
        const html = renderStorageRecovery({ failure, checked, t, renderHeading })
        assert.ok(html.includes('data-onboarding-recovery-action="copy-details"'))
        assert.ok(html.includes('readonly'))
        assert.equal(html.includes('data-onboarding-recovery-action="retry"'), failure.retryable && !checked)
      }
    }
  }
})


test('native failures retain the first storage boundary without leaking arbitrary annotations', () => {
  const error = new DOMException('PRIVATE PROFILE', 'InvalidStateError')
  assert.equal(annotateStorageFailure(error, 'primary-profile', 'transaction-open'), error)
  annotateStorageFailure(error, 'backup', 'database-open')
  const report = JSON.parse(createStorageRecoveryReport({ failure: describeProfileStorageFailure(error) }))
  assert.equal(report.storageTarget, 'primary-profile')
  assert.equal(report.phase, 'transaction-open')
  assert.equal(report.error.name, 'InvalidStateError')
  assert.equal(report.error.message, null)
  const unsafe = annotateStorageFailure(new Error('PRIVATE'), 'PRIVATE TARGET', 'PRIVATE PHASE')
  assert.ok(!createStorageRecoveryReport({ failure: describeProfileStorageFailure(unsafe) }).includes('PRIVATE'))
})

test('durable outcome fields cannot promote memory-only or arbitrary saved diagnostics', () => {
  for (const recovery of ['none', 'memory', 'session', 'PRIVATE']) {
    const parsed = JSON.parse(createStorageRecoveryReport({ failure: { code: 'storage-unavailable' }, outcome: 'fallback-saved', recovery }))
    assert.equal(parsed.outcome, 'failure')
  }
  const old = JSON.parse(createStorageRecoveryReport({ failure: { code: 'storage-unavailable' }, recovery: 'indexed-db' }))
  assert.equal(old.outcome, 'failure', 'a legacy error report is not proof of a settled durable outcome')
  const unsafe = createStorageRecoveryReport({ outcome: 'PRIVATE', failure: { code: 'storage-unavailable' } })
  assert.ok(!unsafe.includes('PRIVATE'))
})
