import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAccountlessProfileMigrationController
} from '../../src/state/accountless-profile-migration.js'

const DAY_MS = 24 * 60 * 60 * 1000
const STARTED_AT = Date.parse('2026-08-22T00:00:00.000Z')

function createStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values
  }
}

function createHarness({
  emergencyRollbackEnabled = false,
  finalCutoverAt = null,
  now = STARTED_AT,
  storage = createStorage()
} = {}) {
  let currentNow = now
  const states = []
  const controller = createAccountlessProfileMigrationController({
    clock: { now: () => currentNow },
    createOperationId: () => 'migration-operation-1',
    emergencyRollbackEnabled,
    finalCutoverAt,
    onStateChange: state => states.push(state),
    storage,
    storageKey: 'accountless-profile-migration'
  })
  return {
    controller,
    states,
    storage,
    setNow: value => { currentNow = value }
  }
}

test('an Accountless profile receives a persisted 30-day notice that Later snoozes', () => {
  const harness = createHarness()

  assert.equal(harness.controller.start({ hasAccountlessProfile: true }).status, 'notice')
  assert.equal(harness.controller.getState().daysRemaining, 30)
  assert.equal(harness.controller.later(), true)
  assert.equal(harness.controller.getState().status, 'hidden')

  const persisted = JSON.parse(
    harness.storage.getItem('accountless-profile-migration')
  )
  assert.deepEqual(persisted, {
    attempt: null,
    finalGateAt: STARTED_AT + (30 * DAY_MS),
    graceStartedAt: STARTED_AT,
    nextNoticeAt: STARTED_AT + DAY_MS,
    version: 1
  })

  const reloaded = createHarness({
    now: STARTED_AT + (12 * 60 * 60 * 1000),
    storage: harness.storage
  })
  assert.equal(reloaded.controller.start({ hasAccountlessProfile: true }).status, 'hidden')

  reloaded.setNow(STARTED_AT + DAY_MS)
  assert.equal(reloaded.controller.refresh().status, 'notice')
  assert.equal(reloaded.controller.getState().daysRemaining, 29)
})

test('the final-seven-day countdown becomes more prominent and cannot be hidden', () => {
  const storage = createStorage()
  storage.setItem('accountless-profile-migration', JSON.stringify({
    attempt: null,
    finalGateAt: STARTED_AT + (30 * DAY_MS),
    graceStartedAt: STARTED_AT,
    nextNoticeAt: null,
    version: 1
  }))
  const harness = createHarness({
    now: STARTED_AT + (23 * DAY_MS),
    storage
  })

  assert.deepEqual(
    harness.controller.start({ hasAccountlessProfile: true }),
    {
      daysRemaining: 7,
      dismissible: false,
      finalGateAt: STARTED_AT + (30 * DAY_MS),
      status: 'countdown',
      urgencyLevel: 1
    }
  )
  assert.equal(harness.controller.later(), false)
  assert.equal(harness.controller.getState().status, 'countdown')

  harness.setNow(STARTED_AT + (28 * DAY_MS))
  assert.equal(harness.controller.refresh().daysRemaining, 2)
  assert.equal(harness.controller.getState().urgencyLevel, 6)

  harness.setNow(STARTED_AT + (30 * DAY_MS))
  assert.equal(harness.controller.refresh().daysRemaining, 0)
  assert.equal(harness.controller.getState().status, 'final-gate')
  assert.equal(harness.controller.getState().entryRequired, true)
  assert.equal(harness.controller.later(), false)
})

test('the serious-incident rollback restores accountless access after the final gate', () => {
  const storage = createStorage()
  storage.setItem('accountless-profile-migration', JSON.stringify({
    attempt: null,
    finalGateAt: STARTED_AT,
    graceStartedAt: STARTED_AT - (30 * DAY_MS),
    nextNoticeAt: null,
    version: 1
  }))
  const harness = createHarness({
    emergencyRollbackEnabled: true,
    now: STARTED_AT + DAY_MS,
    storage
  })

  assert.deepEqual(
    harness.controller.start({ hasAccountlessProfile: true }),
    { emergencyRollback: true, status: 'hidden' }
  )
  assert.equal(harness.controller.isEntryRequired(), false)
})

test('the serious-incident rollback suppresses automatic accountless attachment', () => {
  const harness = createHarness({ emergencyRollbackEnabled: true })

  assert.deepEqual(
    harness.controller.start({ hasAccountlessProfile: true }),
    { emergencyRollback: true, status: 'hidden' }
  )
  harness.controller.observeAuthentication({ status: 'signed-in' })

  assert.equal(harness.controller.getAttachment(), null)
  assert.equal(
    JSON.parse(
      harness.storage.getItem('accountless-profile-migration')
    ).attempt,
    null
  )
})

test('the authoritative cutover fails closed when local grace state is missing or corrupt', () => {
  for (const storedValue of [null, '{not-json']) {
    const storage = createStorage()
    if (storedValue !== null) {
      storage.setItem('accountless-profile-migration', storedValue)
    }
    const harness = createHarness({
      finalCutoverAt: STARTED_AT - 1,
      storage
    })

    assert.equal(
      harness.controller.start({ hasAccountlessProfile: true }).status,
      'final-gate'
    )
    assert.equal(harness.controller.isEntryRequired(), true)
    assert.equal(harness.controller.later(), false)
  }
})

test('a pending pre-authentication attempt reloads through the final welcome', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })
  assert.equal(harness.controller.begin(), true)
  harness.setNow(STARTED_AT + (31 * DAY_MS))

  const reloaded = createHarness({
    now: STARTED_AT + (31 * DAY_MS),
    storage: harness.storage
  })
  assert.equal(
    reloaded.controller.start({ hasAccountlessProfile: true }).status,
    'final-gate'
  )
  assert.equal(reloaded.controller.begin(), true)
  assert.equal(
    reloaded.controller.getState().status,
    'awaiting-authentication'
  )
})

test('a legacy confirmation attempt reloads without showing Continue as', () => {
  const storage = createStorage()
  storage.setItem('accountless-profile-migration', JSON.stringify({
    attempt: {
      id: 'migration-operation-1',
      retryCount: 0,
      startedAt: STARTED_AT,
      status: 'confirming-session'
    },
    finalGateAt: STARTED_AT + (30 * DAY_MS),
    graceStartedAt: STARTED_AT,
    nextNoticeAt: null,
    version: 1
  }))
  const harness = createHarness({ storage })

  assert.equal(
    harness.controller.start({ hasAccountlessProfile: true }).status,
    'awaiting-authentication'
  )
  harness.controller.observeAuthentication({ status: 'signed-in' })
  assert.equal(harness.controller.getState().status, 'attaching')
})

test('a signed-in Accountless profile starts attachment without persisting identity', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({
    email: 'owner@example.test',
    status: 'signed-in',
    userId: '123e4567-e89b-42d3-a456-426614174000'
  })

  assert.deepEqual(harness.controller.getState(), {
    daysRemaining: 30,
    finalGateAt: STARTED_AT + (30 * DAY_MS),
    status: 'attaching'
  })
  const persistedAttachment = harness.storage.getItem(
    'accountless-profile-migration'
  )
  assert.doesNotMatch(persistedAttachment, /owner@example\.test/)
  assert.doesNotMatch(
    persistedAttachment,
    /123e4567-e89b-42d3-a456-426614174000/
  )
  assert.deepEqual(harness.controller.getAttachment(), {
    operationId: 'migration-operation-1'
  })

  const reloaded = createHarness({ storage: harness.storage })
  reloaded.controller.start({ hasAccountlessProfile: true })
  reloaded.controller.observeAuthentication({
    email: 'owner@example.test',
    status: 'signed-in',
    userId: '123e4567-e89b-42d3-a456-426614174000'
  })
  assert.equal(reloaded.controller.getState().status, 'attaching')
  assert.deepEqual(reloaded.controller.getAttachment(), {
    operationId: 'migration-operation-1'
  })
})

test('failed or cancelled authentication keeps the migration voluntary', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })

  assert.equal(harness.controller.begin(), true)
  assert.equal(
    harness.controller.getState().status,
    'awaiting-authentication'
  )
  harness.controller.observeAuthentication({ status: 'unavailable' })
  assert.equal(
    harness.controller.getState().status,
    'awaiting-authentication'
  )
  assert.equal(harness.controller.getAttachment(), null)

  assert.equal(harness.controller.later(), true)
  assert.equal(harness.controller.getState().status, 'hidden')
  assert.equal(
    JSON.parse(harness.storage.getItem('accountless-profile-migration')).attempt,
    null
  )
})

test('a signed-in session restored while authentication is pending attaches automatically', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })
  assert.equal(harness.controller.begin(), true)
  assert.equal(
    harness.controller.getState().status,
    'awaiting-authentication'
  )

  const reloaded = createHarness({ storage: harness.storage })
  reloaded.controller.start({ hasAccountlessProfile: true })
  reloaded.controller.observeAuthentication({
    email: 'restored@example.test',
    status: 'signed-in'
  })

  assert.equal(reloaded.controller.getState().status, 'attaching')
  assert.deepEqual(reloaded.controller.getAttachment(), {
    operationId: 'migration-operation-1'
  })
})

test('a failed first backup retries the same durable operation after reload', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })
  harness.controller.begin()
  harness.controller.observeAuthentication({ status: 'signed-in' })

  assert.equal(harness.controller.markBackupFailed(), true)
  assert.equal(harness.controller.getState().status, 'backup-failed')
  assert.equal(harness.controller.getAttachment(), null)
  assert.equal(harness.controller.later(), true)
  assert.equal(harness.controller.getState().status, 'backup-failed')

  const reloaded = createHarness({ storage: harness.storage })
  reloaded.controller.start({ hasAccountlessProfile: true })
  reloaded.controller.observeAuthentication({ status: 'signed-in' })
  assert.equal(reloaded.controller.getState().status, 'backup-failed')
  assert.equal(reloaded.controller.retry(), true)
  assert.equal(reloaded.controller.getState().status, 'attaching')
  assert.deepEqual(reloaded.controller.getAttachment(), {
    operationId: 'migration-operation-1'
  })
  assert.equal(
    JSON.parse(reloaded.storage.getItem('accountless-profile-migration'))
      .attempt.retryCount,
    1
  )
})

test('completion removes the one-time migration record', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })
  harness.controller.begin()
  harness.controller.observeAuthentication({ status: 'signed-in' })

  assert.equal(harness.controller.complete(), true)
  assert.equal(harness.storage.getItem('accountless-profile-migration'), null)
  assert.deepEqual(harness.controller.getState(), { status: 'hidden' })
})

test('ordinary conflict comparison hides the gate without losing migration state', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })
  harness.controller.begin()
  harness.controller.observeAuthentication({ status: 'signed-in' })

  assert.equal(harness.controller.markConflictReady(), true)
  assert.deepEqual(harness.controller.getState(), {
    daysRemaining: 30,
    finalGateAt: STARTED_AT + (30 * DAY_MS),
    status: 'hidden'
  })
  assert.equal(harness.controller.hasPendingMigration(), true)
  assert.equal(harness.controller.getAttachment(), null)

  const reloaded = createHarness({ storage: harness.storage })
  assert.equal(
    reloaded.controller.start({ hasLegacyProfile: true }).status,
    'hidden'
  )
  assert.equal(reloaded.controller.hasPendingMigration(), true)
  assert.equal(reloaded.controller.complete(), true)
  assert.equal(harness.storage.getItem('accountless-profile-migration'), null)
})

test('a populated signed-in profile cannot claim the accountless attempt', () => {
  const harness = createHarness()
  harness.controller.start({ hasAccountlessProfile: true })
  harness.controller.observeAuthentication({ status: 'signed-out' })
  harness.controller.begin()
  harness.controller.observeAuthentication({ status: 'signed-in' })

  assert.equal(harness.controller.markSignedInProfilePresent(), true)
  assert.equal(harness.controller.getState().status, 'signed-in-profile-present')
  assert.equal(harness.controller.getAttachment(), null)
  assert.equal(harness.controller.later(), true)
  assert.equal(harness.controller.getState().status, 'hidden')
})
