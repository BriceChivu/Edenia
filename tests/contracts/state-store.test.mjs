import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createStateStore,
  isStorageQuotaError
} from '../../src/state/store.js'

function quotaError(name = 'QuotaExceededError', code = 22) {
  const error = new Error('storage full')
  error.name = name
  error.code = code
  return error
}

function createHarness(options = {}) {
  const events = []
  const values = new Map()
  if (Object.prototype.hasOwnProperty.call(options, 'raw')) {
    values.set('edenia_v1', options.raw)
  }
  let primaryWriteAttempts = 0
  const pruneResults = [...(options.pruneResults || [])]
  const storage = {
    getItem(key) {
      events.push(['get', key])
      if (options.throwOnGet?.has(key)) throw new Error('get failed')
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      events.push(['set', key, value])
      if (key === 'edenia_v1') {
        primaryWriteAttempts += 1
        const primaryWriteError = options.primaryWriteErrors?.[
          primaryWriteAttempts - 1
        ]
        if (primaryWriteError) throw primaryWriteError
        if (primaryWriteAttempts <= (options.failPrimaryWrites || 0)) {
          throw new Error('set failed')
        }
      }
      if (options.throwOnSet?.has(key)) throw new Error('set failed')
      values.set(key, value)
    },
    removeItem(key) {
      events.push(['remove', key])
      if (options.throwOnRemove?.has(key)) throw new Error('remove failed')
      values.delete(key)
    }
  }
  const recoveredState = options.recoveredState ?? null
  const fallbackConfig = options.fallbackConfig ?? null
  const store = createStateStore({
    storage,
    storageKey: 'edenia_v1',
    normalizeLoadedState(state) {
      events.push(['normalize-loaded', state])
      if (options.throwDuringLoadNormalization) throw new Error('normalize failed')
      return options.shouldSave === true
    },
    normalizeStateBeforeSave(state) {
      events.push(['normalize-before-save', state])
      if (options.throwBeforeSave) throw new Error('save normalize failed')
    },
    createStateBackup(reason, backupOptions) {
      events.push(['backup', reason, backupOptions])
      if (options.throwDuringBackup) throw new Error('backup failed')
    },
    pruneOldestStateBackup(pruneOptions) {
      events.push(['prune', pruneOptions])
      return pruneResults.length ? pruneResults.shift() : true
    },
    saveConfigCookie(config) {
      events.push(['cookie', config])
    },
    syncPersistedStateToAnalytics(state) {
      events.push(['analytics', state])
    },
    getLatestBackupState() {
      events.push(['recover'])
      return recoveredState
    },
    loadConfigCookie() {
      events.push(['load-cookie'])
      return fallbackConfig
    },
    createDefaultStateFromConfig(config) {
      events.push(['default-from-cookie', config])
      return { fromCookie: config }
    }
  })
  return { events, storage, store, values }
}

test('state loading returns parsed state without writes when cleanup is unnecessary', () => {
  const state = { config: {}, videos: {}, anki: {} }
  const harness = createHarness({ raw: JSON.stringify(state) })
  assert.deepEqual(harness.store.loadState(), state)
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['get', 'normalize-loaded']
  )
})

test('automatic cleanup preserves forced pre-cleanup backup and save ordering', () => {
  const state = { config: { locale: 'en' }, videos: {}, anki: {} }
  const harness = createHarness({
    raw: JSON.stringify(state),
    shouldSave: true
  })
  const loaded = harness.store.loadState()
  assert.deepEqual(loaded, state)
  assert.deepEqual(
    harness.events.map(event => event[0]),
    [
      'get',
      'normalize-loaded',
      'normalize-before-save',
      'backup',
      'set',
      'cookie',
      'analytics'
    ]
  )
  assert.deepEqual(harness.events[3], [
    'backup',
    'before automatic cleanup',
    { force: true }
  ])
})

test('gated loading normalizes in memory without saving before activation', () => {
  const state = { config: { locale: 'en' }, videos: {}, anki: {} }
  const harness = createHarness({
    raw: JSON.stringify(state),
    shouldSave: true
  })

  assert.deepEqual(
    harness.store.loadState({ persistCleanup: false }),
    state
  )
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['get', 'normalize-loaded']
  )
})

test('load errors recover from backup before consulting the config cookie', () => {
  const recoveredState = { recovered: true }
  const parseFailure = createHarness({
    raw: '{invalid-json',
    recoveredState,
    fallbackConfig: { locale: 'fr' }
  })
  assert.equal(parseFailure.store.loadState(), recoveredState)
  assert.deepEqual(
    parseFailure.events.map(event => event[0]),
    ['get', 'recover']
  )

  const normalizationFailure = createHarness({
    raw: JSON.stringify({ config: {} }),
    recoveredState,
    throwDuringLoadNormalization: true
  })
  assert.equal(normalizationFailure.store.loadState(), recoveredState)
  assert.deepEqual(
    normalizationFailure.events.map(event => event[0]),
    ['get', 'normalize-loaded', 'recover']
  )
})

test('missing or unrecoverable state preserves cookie fallback and null behavior', () => {
  const fallbackConfig = { weeklyGoalHours: 8 }
  const fallback = createHarness({ fallbackConfig })
  assert.deepEqual(fallback.store.loadState(), {
    fromCookie: fallbackConfig
  })
  assert.deepEqual(
    fallback.events.map(event => event[0]),
    ['get', 'load-cookie', 'default-from-cookie']
  )

  const none = createHarness()
  assert.equal(none.store.loadState(), null)
  assert.deepEqual(
    none.events.map(event => event[0]),
    ['get', 'load-cookie']
  )
})

test('state saving normalizes, backs up, persists, cookies, then syncs analytics', () => {
  const state = { config: { theme: 'dark' }, value: 1 }
  const harness = createHarness()
  assert.equal(harness.store.saveState(state), true)
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['normalize-before-save', 'backup', 'set', 'cookie', 'analytics']
  )
  assert.deepEqual(harness.events[1], [
    'backup',
    'automatic backup',
    { force: false }
  ])
  assert.equal(harness.values.get('edenia_v1'), JSON.stringify(state))
})

test('save options preserve backup and analytics suppression independently', () => {
  const state = { config: {} }
  const harness = createHarness()
  assert.equal(harness.store.saveState(state, {
    backup: false,
    backupReason: 'ignored',
    forceBackup: true,
    syncAnalytics: false
  }), true)
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['normalize-before-save', 'set', 'cookie']
  )
})

test('failed writes prune once, retry once, and always save the config cookie', () => {
  const state = { config: { locale: 'en' } }
  const retry = createHarness({ failPrimaryWrites: 1 })
  assert.equal(retry.store.saveState(state), true)
  assert.deepEqual(
    retry.events.map(event => event[0]),
    [
      'normalize-before-save',
      'backup',
      'set',
      'prune',
      'set',
      'cookie',
      'analytics'
    ]
  )

  const failed = createHarness({ failPrimaryWrites: 2 })
  assert.equal(failed.store.saveState(state), false)
  assert.deepEqual(
    failed.events.map(event => event[0]),
    [
      'normalize-before-save',
      'backup',
      'set',
      'prune',
      'set',
      'cookie'
    ]
  )
})

test('import saving prunes older backups until a quota retry succeeds', () => {
  const state = { config: { locale: 'en' }, value: 1 }
  const firstQuotaError = quotaError()
  const secondQuotaError = quotaError()
  const harness = createHarness({
    primaryWriteErrors: [firstQuotaError, secondQuotaError],
    pruneResults: [true, true]
  })
  assert.deepEqual(harness.store.saveImportedState(state, {
    preserveBackupId: 'rollback'
  }), {
    persisted: true,
    error: null
  })
  assert.deepEqual(
    harness.events.map(event => event[0]),
    [
      'normalize-before-save',
      'set',
      'prune',
      'set',
      'prune',
      'set',
      'cookie',
      'analytics'
    ]
  )
  assert.deepEqual(harness.events.filter(event => event[0] === 'prune'), [
    ['prune', { preserveId: 'rollback' }],
    ['prune', { preserveId: 'rollback' }]
  ])
})

test('gated import leaves analytics synchronization to the lifecycle authority', () => {
  const state = { config: { locale: 'en' }, value: 1 }
  const harness = createHarness()

  assert.deepEqual(harness.store.saveImportedState(state, {
    preserveBackupId: 'rollback',
    syncAnalytics: false
  }), {
    persisted: true,
    error: null
  })
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['normalize-before-save', 'set', 'cookie']
  )
})

test('import saving preserves state when only the rollback backup remains', () => {
  const state = { config: { locale: 'en' }, value: 1 }
  const finalQuotaError = quotaError()
  const harness = createHarness({
    raw: JSON.stringify({ config: {}, value: 'existing' }),
    primaryWriteErrors: [quotaError(), finalQuotaError],
    pruneResults: [true, false]
  })
  assert.deepEqual(harness.store.saveImportedState(state, {
    preserveBackupId: 'rollback'
  }), {
    persisted: false,
    error: finalQuotaError
  })
  assert.equal(
    harness.values.get('edenia_v1'),
    JSON.stringify({ config: {}, value: 'existing' })
  )
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['normalize-before-save', 'set', 'prune', 'set', 'prune']
  )
})

test('import saving does not prune backups for non-quota failures', () => {
  const state = { config: { locale: 'en' }, value: 1 }
  const securityError = new Error('storage unavailable')
  securityError.name = 'SecurityError'
  const harness = createHarness({
    primaryWriteErrors: [securityError]
  })
  assert.deepEqual(harness.store.saveImportedState(state), {
    persisted: false,
    error: securityError
  })
  assert.deepEqual(
    harness.events.map(event => event[0]),
    ['normalize-before-save', 'set']
  )
})

test('quota detection recognizes browser storage error variants', () => {
  assert.equal(isStorageQuotaError(quotaError()), true)
  assert.equal(
    isStorageQuotaError(quotaError('NS_ERROR_DOM_QUOTA_REACHED', 1014)),
    true
  )
  assert.equal(isStorageQuotaError({ code: 22 }), true)
  assert.equal(isStorageQuotaError(new Error('storage full')), false)
  assert.equal(isStorageQuotaError(null), false)
})

test('pre-save normalization and backup failures still propagate', () => {
  const state = { config: {} }
  assert.throws(
    () => createHarness({ throwBeforeSave: true }).store.saveState(state),
    /save normalize failed/
  )
  assert.throws(
    () => createHarness({ throwDuringBackup: true }).store.saveState(state),
    /backup failed/
  )
})

test('storage probing removes its exact key on success, mismatch, and errors', () => {
  const success = createHarness()
  assert.equal(success.store.canPersistLocalState(), true)
  assert.deepEqual(
    success.events.map(event => event[0]),
    ['set', 'get', 'remove']
  )

  const mismatch = createHarness()
  mismatch.storage.getItem = key => {
    mismatch.events.push(['get', key])
    return 'different'
  }
  assert.equal(mismatch.store.canPersistLocalState(), false)
  assert.deepEqual(
    mismatch.events.map(event => event[0]),
    ['set', 'get', 'remove']
  )

  const failure = createHarness({
    throwOnSet: new Set(['edenia_v1_storage_probe'])
  })
  assert.equal(failure.store.canPersistLocalState(), false)
  assert.deepEqual(
    failure.events.map(event => event[0]),
    ['set', 'remove']
  )
})
