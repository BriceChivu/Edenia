import test from 'node:test'
import assert from 'node:assert/strict'
import { createStorageLifecycleDiagnostics, createStorageOperationMonitor } from '../../src/state/storage-operation-diagnostics.js'
import { describeProfileStorageFailure, createStorageRecoveryReport } from '../../src/state/profile-storage-recovery.js'

test('a timed-out operation retains coarse timing, request progress and only lifecycle changes within its span', () => {
  const document = new EventTarget()
  document.visibilityState = 'visible'
  const eventTarget = new EventTarget()
  const lifecycle = createStorageLifecycleDiagnostics({ document, eventTarget })
  document.dispatchEvent(new Event('freeze')) // Before the operation, excluded.
  let time = 1000
  const diagnostic = createStorageOperationMonitor({ storageTarget: 'primary-profile', timeoutMs: 8000,
    mode: 'readwrite', lifecycle, now: () => time })
  const transaction = new EventTarget()
  diagnostic.observe(transaction)
  transaction.dispatchEvent(new Event('success'))
  document.visibilityState = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  document.dispatchEvent(new Event('resume'))
  eventTarget.dispatchEvent(new Event('pagehide'))
  const show = new Event('pageshow'); show.persisted = true; eventTarget.dispatchEvent(show)
  time = 19041
  const error = diagnostic.failure(new Error('Profile transaction timed out'), 'transaction-complete', 'timeout')
  const report = JSON.parse(createStorageRecoveryReport({ failure: describeProfileStorageFailure(error) }))
  assert.deepEqual(report.storageOperation, {
    elapsedMs: 18000, timeoutMs: 8000, timerLatenessMs: 10000, mode: 'readwrite', requestState: 'responded', eventType: 'timeout',
    lifecycle: { visibilityAtStart: 'visible', visibilityAtEnd: 'hidden', hiddenDuringOperation: true,
      frozenDuringOperation: false, resumedDuringOperation: true, pageHiddenDuringOperation: true, pageRestoredDuringOperation: true, wasDiscarded: false }
  })
})

test('resumed, restored and discarded pages are bounded flags without activity or wall-clock data', () => {
  const document = new EventTarget(); document.visibilityState = 'hidden'; document.wasDiscarded = true
  const lifecycle = createStorageLifecycleDiagnostics({ document, eventTarget: new EventTarget() })
  const monitor = createStorageOperationMonitor({ storageTarget: 'recovery-journal', lifecycle, now: () => 0 })
  document.dispatchEvent(new Event('freeze'))
  const failure = describeProfileStorageFailure(monitor.failure(new Error(), 'request', 'request-exception'))
  assert.equal(failure.storageOperation.lifecycle.frozenDuringOperation, true)
  assert.equal(failure.storageOperation.lifecycle.hiddenDuringOperation, true)
  assert.equal(failure.storageOperation.lifecycle.wasDiscarded, true)
  assert.equal(failure.storageOperation.mode, 'unknown')
})

test('native names survive while diagnostic values and private error messages are rebuilt from a strict allowlist', () => {
  const report = createStorageRecoveryReport({ failure: { ...describeProfileStorageFailure(new DOMException('PRIVATE profile content', 'ConstraintError')),
    storageOperation: { elapsedMs: 1e20, timeoutMs: 'PRIVATE', timerLatenessMs: Infinity,
      mode: 'PRIVATE', requestState: 'PRIVATE', eventType: 'PRIVATE', url: 'PRIVATE',
      lifecycle: { visibilityAtStart: 'PRIVATE', secret: 'PRIVATE', hiddenDuringOperation: 'PRIVATE' } } } })
  assert.doesNotMatch(report, /PRIVATE|url|secret/)
  const decoded = JSON.parse(report)
  assert.deepEqual(decoded.error, { name: 'ConstraintError', message: null })
  assert.equal(decoded.storageOperation.elapsedMs, 86400000)
  assert.equal(decoded.storageOperation.timerLatenessMs, undefined)
  assert.equal(decoded.storageOperation.mode, 'unknown')
  assert.equal(decoded.storageOperation.lifecycle.hiddenDuringOperation, false)
})

test('unavailable lifecycle and performance APIs do not prevent failure reporting', () => {
  const document = { get visibilityState() { throw new Error('unavailable') }, get wasDiscarded() { throw new Error('unavailable') } }
  const lifecycle = createStorageLifecycleDiagnostics({ document, eventTarget: null })
  const monitor = createStorageOperationMonitor({ storageTarget: 'backup', lifecycle, now: () => { throw new Error('unavailable') } })
  monitor.observe({ addEventListener() { throw new Error('unavailable') } })
  const failure = describeProfileStorageFailure(monitor.failure(new Error(), 'database-open', 'database-error'))
  assert.equal(failure.storageOperation.elapsedMs, 0)
  assert.equal(failure.storageOperation.lifecycle.visibilityAtStart, 'unknown')
})
