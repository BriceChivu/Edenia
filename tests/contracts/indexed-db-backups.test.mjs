import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  mergeStateBackupEntries,
  parseLegacyStateBackupEntries,
  readIndexedDbBackupEntries,
  shouldMirrorLegacyStateBackups,
  stateBackupEntriesMatch
} from '../../src/state/indexed-db-backups.js'

function validEntry(id, createdAt = '2026-08-01T00:00:00.000Z') {
  return {
    id,
    createdAt,
    reason: 'automatic backup',
    sandbox: false,
    state: {
      config: {},
      videos: {},
      anki: {}
    }
  }
}

function isValidEntry(entry) {
  return Boolean(
    entry?.id
    && entry?.createdAt
    && entry?.state?.config
    && entry?.state?.videos
    && entry?.state?.anki
  )
}

function createEventTarget(properties = {}) {
  const listeners = new Map()
  return {
    ...properties,
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener(event)
      }
    }
  }
}

function createMissingIndexedDb() {
  const calls = []
  return {
    calls,
    open(name, version) {
      calls.push(['open', name, version])
      const request = createEventTarget({ error: null, result: null })
      request.transaction = {
        abort() {
          calls.push(['abort'])
          request.error = new DOMException('Missing database', 'AbortError')
          queueMicrotask(() => request.dispatch('error'))
        }
      }
      queueMicrotask(() => request.dispatch('upgradeneeded', {
        oldVersion: 0
      }))
      return request
    }
  }
}

function createExistingIndexedDb(entries, { transactionError = null } = {}) {
  const calls = []
  const database = createEventTarget({
    objectStoreNames: {
      contains(name) {
        calls.push(['contains', name])
        return name === 'backups'
      }
    },
    close() {
      calls.push(['close'])
    },
    transaction(name, mode) {
      calls.push(['transaction', name, mode])
      if (transactionError) throw transactionError
      const transaction = createEventTarget({ error: null })
      transaction.objectStore = storeName => {
        calls.push(['objectStore', storeName])
        return {
          getAll() {
            calls.push(['getAll'])
            const request = createEventTarget({
              error: null,
              result: structuredClone(entries)
            })
            queueMicrotask(() => {
              request.dispatch('success')
              transaction.dispatch('complete')
            })
            return request
          }
        }
      }
      return transaction
    }
  })
  return {
    calls,
    open(name, version) {
      calls.push(['open', name, version])
      const request = createEventTarget({
        error: null,
        result: database,
        transaction: null
      })
      queueMicrotask(() => request.dispatch('success'))
      return request
    }
  }
}

test('CI installs every browser used by the storage migration suite', async () => {
  const projectRoot = new URL('../../', import.meta.url)
  const [playwrightConfig, workflow] = await Promise.all([
    readFile(new URL('playwright.config.mjs', projectRoot), 'utf8'),
    readFile(new URL('.github/workflows/ci.yml', projectRoot), 'utf8')
  ])

  assert.match(playwrightConfig, /name: 'webkit-storage'/)
  assert.match(
    workflow,
    /npx playwright install --with-deps chromium webkit/
  )
})

test('legacy parsing distinguishes absence from malformed or duplicate data', () => {
  assert.deepEqual(parseLegacyStateBackupEntries(null, isValidEntry), {
    entries: [],
    exists: false,
    valid: true
  })

  for (const raw of [
    '{invalid',
    JSON.stringify({ nope: true }),
    JSON.stringify([validEntry('duplicate'), validEntry('duplicate')]),
    JSON.stringify([validEntry('valid'), { id: 'invalid' }])
  ]) {
    assert.deepEqual(parseLegacyStateBackupEntries(raw, isValidEntry), {
      entries: [],
      exists: true,
      valid: false
    })
  }
})

test('legacy parsing clones every valid entry without silently dropping data', () => {
  const entries = [
    validEntry('one'),
    validEntry('two', '2026-07-31T00:00:00.000Z')
  ]
  const result = parseLegacyStateBackupEntries(
    JSON.stringify(entries),
    isValidEntry
  )
  assert.deepEqual(result, {
    entries,
    exists: true,
    valid: true
  })
  assert.notEqual(result.entries, entries)
})

test('migration merging is idempotent and lets legacy copies reconcile IDs', () => {
  const indexed = [
    validEntry('indexed', '2026-08-01T00:00:00.000Z'),
    { ...validEntry('shared'), reason: 'indexed copy' }
  ]
  const legacy = [
    { ...validEntry('shared'), reason: 'legacy copy' },
    validEntry('legacy', '2026-08-02T00:00:00.000Z')
  ]
  const merged = mergeStateBackupEntries(indexed, legacy)

  assert.deepEqual(merged.map(entry => entry.id), [
    'legacy',
    'indexed',
    'shared'
  ])
  assert.equal(
    merged.find(entry => entry.id === 'shared').reason,
    'legacy copy'
  )
  assert.deepEqual(mergeStateBackupEntries(merged, legacy), merged)
})

test('legacy mirroring follows the staged cleanup and quota boundary', () => {
  assert.equal(shouldMirrorLegacyStateBackups({
    cleanupLegacy: false,
    legacyExists: true,
    legacyRemoved: false,
    legacyValid: true
  }), true)
  assert.equal(shouldMirrorLegacyStateBackups({
    cleanupLegacy: true,
    legacyExists: true,
    legacyRemoved: false,
    legacyValid: true
  }), true)
  assert.equal(shouldMirrorLegacyStateBackups({
    cleanupLegacy: true,
    legacyExists: true,
    legacyRemoved: true,
    legacyValid: true
  }), false)
  assert.equal(shouldMirrorLegacyStateBackups({
    cleanupLegacy: true,
    legacyExists: true,
    legacyRemoved: false,
    legacyValid: false
  }), false)
})

test('verification compares complete backup content independent of order', () => {
  const first = validEntry('first')
  const second = validEntry('second')
  assert.equal(stateBackupEntriesMatch([first, second], [second, first]), true)
  assert.equal(stateBackupEntriesMatch(
    [first],
    [{ ...first, reason: 'changed' }]
  ), false)
  assert.equal(stateBackupEntriesMatch([first], []), false)
  assert.equal(stateBackupEntriesMatch(null, []), false)
})

test('read-only backup access aborts a missing database without creating stores', async () => {
  const indexedDb = createMissingIndexedDb()
  assert.deepEqual(await readIndexedDbBackupEntries({
    indexedDb,
    isValidEntry
  }), {
    exists: false,
    entries: [],
    error: null
  })
  assert.deepEqual(indexedDb.calls, [
    ['open', 'edenia_state_backups_v1', 1],
    ['abort']
  ])
})

test('read-only backup access clones valid entries and closes the database', async () => {
  const entries = [validEntry('read-only')]
  const indexedDb = createExistingIndexedDb(entries)
  const result = await readIndexedDbBackupEntries({
    indexedDb,
    isValidEntry
  })
  assert.deepEqual(result, {
    exists: true,
    entries,
    error: null
  })
  assert.notEqual(result.entries, entries)
  assert.deepEqual(indexedDb.calls, [
    ['open', 'edenia_state_backups_v1', 1],
    ['contains', 'backups'],
    ['transaction', 'backups', 'readonly'],
    ['objectStore', 'backups'],
    ['getAll'],
    ['close']
  ])
})

test('read-only backup access fails closed on invalid persisted entries', async () => {
  const indexedDb = createExistingIndexedDb([{ id: 'invalid' }])
  const result = await readIndexedDbBackupEntries({
    indexedDb,
    isValidEntry
  })
  assert.equal(result.exists, true)
  assert.deepEqual(result.entries, [])
  assert.match(result.error?.message || '', /invalid state backup/)
  assert.equal(indexedDb.calls.at(-1)[0], 'close')
})

test('read-only backup access retains existence when an existing database read fails', async () => {
  const indexedDb = createExistingIndexedDb([], {
    transactionError: new Error('read failed')
  })
  const result = await readIndexedDbBackupEntries({
    indexedDb,
    isValidEntry
  })
  assert.equal(result.exists, true)
  assert.deepEqual(result.entries, [])
  assert.match(result.error?.message || '', /read failed/)
  assert.equal(indexedDb.calls.at(-1)[0], 'close')
})

test('read-only backup access validates its IndexedDB boundary', async () => {
  await assert.rejects(
    readIndexedDbBackupEntries({ indexedDb: null, isValidEntry }),
    /requires IndexedDB/
  )
  await assert.rejects(
    readIndexedDbBackupEntries({ indexedDb: createMissingIndexedDb() }),
    /entry validator/
  )
})
