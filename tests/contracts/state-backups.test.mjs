import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createStateBackupStore,
  STATE_BACKUP_AUTO_INTERVAL_MS,
  STATE_BACKUP_LIMIT
} from '../../src/state/backups.js'

function validState(id = 'state') {
  return {
    id,
    config: {},
    videos: {},
    anki: {}
  }
}

function createHarness(options = {}) {
  const events = []
  const values = new Map()
  if (Object.prototype.hasOwnProperty.call(options, 'storedState')) {
    values.set('edenia_v1', JSON.stringify(options.storedState))
  }
  if (Object.prototype.hasOwnProperty.call(options, 'backupValue')) {
    values.set('edenia_v1_backups', options.backupValue)
  }
  let backupWriteAttempts = 0
  const storage = {
    getItem(key) {
      events.push(['get', key])
      if (options.throwOnGet?.has(key)) throw new Error('get failed')
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      events.push(['set', key, value])
      if (key === 'edenia_v1_backups') {
        backupWriteAttempts += 1
        if (backupWriteAttempts <= (options.failBackupWrites || 0)) {
          throw new Error('quota')
        }
      }
      values.set(key, value)
    },
    removeItem(key) {
      events.push(['remove', key])
      if (options.throwOnRemove) throw new Error('remove failed')
      values.delete(key)
    }
  }
  const prepared = []
  const store = createStateBackupStore({
    storage,
    storageKey: 'edenia_v1',
    stateBackupKey: 'edenia_v1_backups',
    isSandbox: options.isSandbox === true,
    isValidStateShape(state) {
      return Boolean(state?.config && state?.videos && state?.anki)
    },
    prepareStateForBackup(state) {
      prepared.push(state)
      if (options.prepareReturnsNull) return null
      return { ...state, prepared: true }
    },
    now: () => new Date(options.now || '2026-07-28T12:00:00.000Z'),
    random: () => 0.5
  })
  return { events, prepared, storage, store, values }
}

test('backup constants preserve limit and automatic interval', () => {
  assert.equal(STATE_BACKUP_LIMIT, 8)
  assert.equal(STATE_BACKUP_AUTO_INTERVAL_MS, 600_000)
})

test('backup reads filter invalid entries, sort newest first, and retain eight', () => {
  const entries = Array.from({ length: 10 }, (_, index) => ({
    id: `entry-${index}`,
    createdAt: new Date(Date.UTC(2026, 6, 1 + index)).toISOString(),
    state: validState(`state-${index}`)
  }))
  entries.push({ id: 'missing-date', state: validState() })
  entries.push({
    id: 'invalid-state',
    createdAt: '2026-08-01T00:00:00.000Z',
    state: {}
  })
  const harness = createHarness({
    backupValue: JSON.stringify(entries)
  })
  const result = harness.store.getStateBackupEntries()
  assert.equal(result.length, 8)
  assert.equal(result[0].id, 'entry-9')
  assert.equal(result.at(-1).id, 'entry-2')

  for (const backupValue of ['{invalid', JSON.stringify({ nope: true })]) {
    assert.deepEqual(
      createHarness({ backupValue }).store.getStateBackupEntries(),
      []
    )
  }
})

test('backup writes degrade one entry at a time and remove when none fit', () => {
  const entries = [
    { id: 'one' },
    { id: 'two' },
    { id: 'three' }
  ]
  const degraded = createHarness({ failBackupWrites: 1 })
  degraded.store.writeStateBackupEntries(entries)
  assert.deepEqual(
    JSON.parse(degraded.values.get('edenia_v1_backups')),
    entries.slice(0, 2)
  )
  assert.deepEqual(
    degraded.events.map(event => event[0]),
    ['set', 'set']
  )

  const removed = createHarness({ failBackupWrites: 3 })
  removed.store.writeStateBackupEntries(entries)
  assert.equal(removed.values.has('edenia_v1_backups'), false)
  assert.deepEqual(
    removed.events.map(event => event[0]),
    ['set', 'set', 'set', 'remove']
  )
})

test('pruning removes exactly the oldest retained backup', () => {
  const entries = [
    {
      id: 'new',
      createdAt: '2026-07-28T00:00:00.000Z',
      state: validState('new')
    },
    {
      id: 'old',
      createdAt: '2026-07-27T00:00:00.000Z',
      state: validState('old')
    }
  ]
  const harness = createHarness({
    backupValue: JSON.stringify(entries)
  })
  assert.equal(harness.store.pruneOldestStateBackup(), true)
  assert.deepEqual(
    JSON.parse(harness.values.get('edenia_v1_backups')).map(entry => entry.id),
    ['new']
  )
  assert.equal(harness.store.pruneOldestStateBackup(), true)
  assert.equal(harness.values.has('edenia_v1_backups'), false)
  assert.equal(createHarness().store.pruneOldestStateBackup(), false)
})

test('pruning preserves a protected rollback backup', () => {
  const entries = [
    {
      id: 'protected',
      createdAt: '2026-07-28T00:00:00.000Z',
      state: validState('protected')
    },
    {
      id: 'older',
      createdAt: '2026-07-27T00:00:00.000Z',
      state: validState('older')
    }
  ]
  const harness = createHarness({
    backupValue: JSON.stringify(entries)
  })
  assert.equal(harness.store.pruneOldestStateBackup({
    preserveId: 'protected'
  }), true)
  assert.deepEqual(
    JSON.parse(harness.values.get('edenia_v1_backups')).map(entry => entry.id),
    ['protected']
  )
  assert.equal(harness.store.pruneOldestStateBackup({
    preserveId: 'protected'
  }), false)
})

test('failed protected pruning leaves the existing backup list untouched', () => {
  const entries = [
    {
      id: 'protected',
      createdAt: '2026-07-28T00:00:00.000Z',
      state: validState('protected')
    },
    {
      id: 'older',
      createdAt: '2026-07-27T00:00:00.000Z',
      state: validState('older')
    }
  ]
  const harness = createHarness({
    backupValue: JSON.stringify(entries),
    failBackupWrites: 1
  })
  assert.equal(harness.store.pruneOldestStateBackup({
    preserveId: 'protected'
  }), false)
  assert.deepEqual(
    JSON.parse(harness.values.get('edenia_v1_backups')),
    entries
  )
})

test('stored backup preparation preserves parse and callback failure behavior', () => {
  const state = validState('stored')
  const harness = createHarness({ storedState: state })
  assert.deepEqual(harness.store.getStoredStateForBackup(), {
    ...state,
    prepared: true
  })
  assert.equal(harness.prepared.length, 1)

  const invalid = createHarness()
  invalid.values.set('edenia_v1', '{invalid')
  assert.equal(invalid.store.getStoredStateForBackup(), null)
  assert.equal(
    createHarness({
      storedState: state,
      prepareReturnsNull: true
    }).store.getStoredStateForBackup(),
    null
  )
})

test('backup creation preserves metadata, order, and sandbox flag', () => {
  const state = validState('stored')
  const harness = createHarness({
    storedState: state,
    isSandbox: true
  })
  const entry = harness.store.createStateBackup('before reset', {
    force: true
  })
  assert.deepEqual(entry, {
    id: 'ms4lsw00-i',
    createdAt: '2026-07-28T12:00:00.000Z',
    reason: 'before reset',
    sandbox: true,
    state: {
      ...state,
      prepared: true
    }
  })
  assert.equal(
    JSON.parse(harness.values.get('edenia_v1_backups'))[0].id,
    entry.id
  )
})

test('backup creation reports failure when even the rollback entry cannot fit', () => {
  const harness = createHarness({
    storedState: validState('stored'),
    failBackupWrites: 1
  })
  assert.equal(
    harness.store.createStateBackup('before sync import', { force: true }),
    null
  )
  assert.equal(harness.values.has('edenia_v1_backups'), false)
})

test('failed backup creation preserves existing backups', () => {
  const existingBackup = {
    id: 'existing',
    createdAt: '2026-07-27T00:00:00.000Z',
    state: validState('existing')
  }
  const harness = createHarness({
    storedState: validState('current'),
    backupValue: JSON.stringify([existingBackup]),
    failBackupWrites: 2
  })
  assert.equal(
    harness.store.createStateBackup('before sync import', { force: true }),
    null
  )
  assert.deepEqual(
    JSON.parse(harness.values.get('edenia_v1_backups')),
    [existingBackup]
  )
})

test('automatic backups preserve throttle, force override, and state dedupe', () => {
  const state = validState('stored')
  const prepared = { ...state, prepared: true }
  const recent = {
    id: 'recent',
    createdAt: '2026-07-28T11:55:00.000Z',
    reason: 'automatic backup',
    sandbox: false,
    state: validState('different')
  }
  const throttled = createHarness({
    storedState: state,
    backupValue: JSON.stringify([recent])
  })
  assert.equal(throttled.store.createStateBackup(), null)

  const forced = createHarness({
    storedState: state,
    backupValue: JSON.stringify([recent])
  })
  assert.ok(forced.store.createStateBackup('automatic backup', {
    force: true
  }))

  const duplicate = createHarness({
    storedState: state,
    backupValue: JSON.stringify([{
      ...recent,
      createdAt: '2026-07-28T11:00:00.000Z',
      state: prepared
    }])
  })
  assert.equal(duplicate.store.createStateBackup(), null)
  assert.equal(
    duplicate.store.createStateBackup('before sync import', {
      force: true,
      returnExisting: true
    })?.id,
    'recent'
  )

  const named = createHarness({
    storedState: state,
    backupValue: JSON.stringify([recent])
  })
  assert.ok(named.store.createStateBackup('before import'))
})

test('latest backup is prepared again and empty backup sources return null', () => {
  const state = validState('latest')
  const harness = createHarness({
    backupValue: JSON.stringify([{
      id: 'latest',
      createdAt: '2026-07-28T00:00:00.000Z',
      state
    }])
  })
  assert.deepEqual(harness.store.getLatestBackupState(), {
    ...state,
    prepared: true
  })
  assert.equal(createHarness().store.getLatestBackupState(), null)
  assert.equal(
    createHarness({
      storedState: state,
      prepareReturnsNull: true
    }).store.createStateBackup(),
    null
  )
})
