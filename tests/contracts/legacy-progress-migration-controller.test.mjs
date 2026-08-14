import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLegacyProgressMigrationController,
  LEGACY_PROGRESS_MIGRATION_SCHEMA
} from '../../src/state/legacy-progress-migration.js'

function state(id) {
  return { id, config: {}, videos: {}, anki: {} }
}

function createHarness(options = {}) {
  const values = new Map()
  const events = []
  const backups = [...(options.backups || [])]
  if (options.primaryRaw !== undefined) {
    values.set('edenia_v1', options.primaryRaw)
  }
  if (options.marker) {
    values.set('migration', JSON.stringify(options.marker))
  }
  let fragment = options.fragment || null
  let backupCounter = 0
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      events.push(['set', key])
      values.set(key, value)
    }
  }
  const view = {
    failures: [],
    notices: [],
    async waitForDisclosure() {
      events.push(['disclosure'])
      return options.disclosure !== false
    },
    showFailure(actions) {
      this.failures.push(actions)
    },
    showPendingCleanup() {
      this.notices.push('pending')
    },
    showConflict() {
      this.notices.push('conflict')
    },
    showRecovered(value) {
      this.notices.push(value.alreadyPresent ? 'same' : 'recovered')
    },
    async persistImportedState(value, saveOptions) {
      events.push(['save-primary', saveOptions?.preserveBackupId])
      if (options.saveFails) return { persisted: false }
      values.set('edenia_v1', JSON.stringify(value))
      return { persisted: true }
    }
  }
  const controllerOptions = {
    automaticEnabled: options.automaticEnabled === true,
    async createVerifiedBackupFromState(reason, value) {
      events.push(['backup', reason])
      if (options.backupFails) return null
      const existing = backups.find(entry => (
        entry.reason === reason
        && JSON.stringify(entry.state) === JSON.stringify(value)
      ))
      if (existing) return existing
      const entry = {
        id: `backup-${++backupCounter}`,
        reason,
        state: JSON.parse(JSON.stringify(value))
      }
      backups.push(entry)
      return entry
    },
    decorateMigratedState(value) {
      events.push(['decorate'])
      value.migrated = true
    },
    async decryptTransfer() {
      events.push(['decrypt'])
      if (options.decryptFails) throw new Error('tampered')
      return {
        createdAt: '2026-08-13T00:00:00.000Z',
        state: options.incoming || state('legacy'),
        stateSha256: 'S'.repeat(43)
      }
    },
    destinationEligible: options.destinationEligible !== false,
    async deriveCapabilityDigest() {
      events.push(['digest'])
      return 'D'.repeat(43)
    },
    getBackupEntries() {
      return backups
    },
    helperUrl: 'https://bricechivu.github.io/edenia-migrate/',
    markerKey: 'migration',
    navigate(url) {
      events.push(['navigate', url])
    },
    normalizeImportedState(value) {
      return value && value.config && value.videos && value.anki
        ? JSON.parse(JSON.stringify(value))
        : null
    },
    now: () => new Date('2026-08-13T00:00:00.000Z'),
    onManualImport(done) {
      events.push(['manual-import'])
      options.manualImportDone = done
    },
    onResume() {
      events.push(['resume'])
    },
    prepareStateForHash(value) {
      return value
    },
    primaryKey: 'edenia_v1',
    relayClient: {
      async claim() {
        events.push(['claim'])
        if (options.claimFails) throw new Error('offline')
        return {
          ciphertext: 'ciphertext',
          ciphertextDigest: 'C'.repeat(43),
          iv: 'iv'
        }
      },
      async complete() {
        events.push(['complete'])
        if (options.completeFails) throw new Error('lost response')
        return 'completed'
      }
    },
    runtimeValid: options.runtimeValid !== false,
    saveImportedState(value, saveOptions) {
      return view.persistImportedState(value, saveOptions)
    },
    storage,
    takeFragment() {
      const value = fragment
      fragment = null
      return value
    },
    view
  }
  const controller = createLegacyProgressMigrationController(controllerOptions)
  return {
    backups,
    controller,
    controllerOptions,
    events,
    storage,
    values,
    view
  }
}

function marker(harness) {
  const value = harness.values.get('migration')
  return value === undefined ? null : JSON.parse(value)
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() >= deadline) {
      assert.fail(`Timed out waiting for ${label}`)
    }
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

test('controller refuses ambiguous runtime gate wiring', () => {
  const { controllerOptions } = createHarness()
  for (const field of [
    'automaticEnabled',
    'destinationEligible',
    'runtimeValid'
  ]) {
    assert.throws(
      () => createLegacyProgressMigrationController({
        ...controllerOptions,
        [field]: undefined
      }),
      /dependencies are incomplete/
    )
  }
})

test('switch-off path has no migration side effects', async () => {
  const harness = createHarness()
  assert.deepEqual(await harness.controller.runBeforeApplicationStart(), {
    disposition: 'continue'
  })
  assert.deepEqual(harness.events, [])
  assert.equal(harness.values.has('migration'), false)
})

test('an ineligible destination discards migration input without starting work', async () => {
  const harness = createHarness({
    automaticEnabled: true,
    destinationEligible: false,
    fragment: `transfer.${'A'.repeat(43)}`
  })
  assert.deepEqual(await harness.controller.runBeforeApplicationStart(), {
    disposition: 'continue'
  })
  assert.deepEqual(harness.events, [])
  assert.equal(harness.view.failures.length, 0)
})

test('an empty canonical destination fails closed when relay config is absent', async () => {
  const harness = createHarness({
    automaticEnabled: true,
    runtimeValid: false
  })
  assert.deepEqual(await harness.controller.runBeforeApplicationStart(), {
    disposition: 'waiting'
  })
  assert.equal(harness.view.failures.length, 1)
  assert.equal(harness.events.some(event => event[0] === 'disclosure'), false)
  assert.equal(harness.events.some(event => event[0] === 'resume'), false)
  harness.view.failures[0].onRetry()
  await waitFor(
    () => harness.events.some(event => event[0] === 'navigate'),
    'helper navigation after invalid canonical relay configuration'
  )
})

test('a returned transfer is handled even when relay config is unavailable', async () => {
  const harness = createHarness({
    claimFails: true,
    fragment: `transfer.${'A'.repeat(43)}`,
    runtimeValid: false
  })
  assert.deepEqual(await harness.controller.runBeforeApplicationStart(), {
    disposition: 'waiting'
  })
  assert.equal(harness.events.some(event => event[0] === 'claim'), true)
  assert.equal(harness.view.failures.length, 1)
  assert.equal(marker(harness), null)
})

test('empty automatic destination discloses then redirects or records cancel', async () => {
  const redirect = createHarness({ automaticEnabled: true })
  assert.deepEqual(await redirect.controller.runBeforeApplicationStart(), {
    disposition: 'redirected'
  })
  assert.deepEqual(redirect.events, [
    ['disclosure'],
    ['navigate', 'https://bricechivu.github.io/edenia-migrate/']
  ])

  const cancelled = createHarness({
    automaticEnabled: true,
    disclosure: false
  })
  assert.equal(
    (await cancelled.controller.runBeforeApplicationStart()).disposition,
    'continue'
  )
  assert.equal(marker(cancelled).status, 'deferred')
})

test('none and deferred helper results stop automatic checks', async () => {
  for (const [fragment, status] of [
    ['none', 'checked_none'],
    ['deferred', 'deferred']
  ]) {
    const harness = createHarness({ automaticEnabled: true, fragment })
    assert.equal(
      (await harness.controller.runBeforeApplicationStart()).disposition,
      'continue'
    )
    assert.equal(marker(harness).status, status)
    assert.equal(harness.events.some(event => event[0] === 'navigate'), false)
  }
})

test('empty destination verifies recovery backup before authoritative save', async () => {
  const harness = createHarness({
    fragment: `transfer.${'A'.repeat(43)}`,
    incoming: state('legacy')
  })
  assert.equal(
    (await harness.controller.runBeforeApplicationStart()).disposition,
    'continue'
  )
  assert.ok(
    harness.events.findIndex(event => event[0] === 'backup')
      < harness.events.findIndex(event => event[0] === 'save-primary')
  )
  assert.deepEqual(
    harness.events.find(event => event[0] === 'save-primary'),
    ['save-primary', harness.backups[0].id]
  )
  assert.equal(harness.backups[0].reason, 'legacy origin recovery')
  assert.deepEqual(JSON.parse(harness.values.get('edenia_v1')), {
    ...state('legacy'),
    migrated: true
  })
  assert.equal(marker(harness).status, 'completed')
  assert.deepEqual(harness.view.notices, ['recovered'])
})

test('completion uncertainty stores only the digest and retries idempotently', async () => {
  const first = createHarness({
    completeFails: true,
    fragment: `transfer.${'A'.repeat(43)}`
  })
  assert.equal(
    (await first.controller.runBeforeApplicationStart()).disposition,
    'continue'
  )
  assert.deepEqual(marker(first), {
    schema: LEGACY_PROGRESS_MIGRATION_SCHEMA,
    status: 'local_saved_pending_ack',
    updatedAt: '2026-08-13T00:00:00.000Z',
    capabilityDigest: 'D'.repeat(43)
  })
  assert.doesNotMatch(first.values.get('migration'), /AAAAA/)

  const second = createHarness({ marker: marker(first) })
  assert.equal(
    (await second.controller.runBeforeApplicationStart()).disposition,
    'continue'
  )
  assert.equal(marker(second).status, 'completed')
  assert.deepEqual(second.events.filter(event => event[0] === 'complete'), [
    ['complete']
  ])
})

test('different nonempty destination remains byte-identical and gets a conflict backup', async () => {
  const primaryRaw = JSON.stringify(state('destination'))
  const harness = createHarness({
    fragment: `transfer.${'A'.repeat(43)}`,
    incoming: state('legacy'),
    primaryRaw
  })
  assert.equal(
    (await harness.controller.runBeforeApplicationStart()).disposition,
    'continue'
  )
  assert.equal(harness.values.get('edenia_v1'), primaryRaw)
  assert.equal(harness.backups[0].reason, 'legacy origin conflict')
  assert.equal(harness.events.some(event => event[0] === 'save-primary'), false)
  assert.deepEqual(harness.view.notices, ['conflict'])
})

test('matching destination remains unchanged but has a verified recovery backup', async () => {
  const incoming = state('same')
  const primaryRaw = JSON.stringify(incoming)
  const harness = createHarness({
    fragment: `transfer.${'A'.repeat(43)}`,
    incoming,
    primaryRaw
  })
  assert.equal(
    (await harness.controller.runBeforeApplicationStart()).disposition,
    'continue'
  )
  assert.equal(harness.values.get('edenia_v1'), primaryRaw)
  assert.equal(harness.backups[0].reason, 'legacy origin recovery')
  assert.deepEqual(harness.view.notices, ['same'])
})

test('claim, decrypt, backup, and save failures wait for explicit recovery', async () => {
  for (const option of [
    { claimFails: true },
    { decryptFails: true },
    { backupFails: true },
    { saveFails: true }
  ]) {
    const harness = createHarness({
      fragment: `transfer.${'A'.repeat(43)}`,
      ...option
    })
    assert.equal(
      (await harness.controller.runBeforeApplicationStart()).disposition,
      'waiting'
    )
    assert.equal(harness.view.failures.length, 1)
    assert.equal(marker(harness)?.status, undefined)
    harness.view.failures[0].onContinue()
    assert.equal(marker(harness).status, 'deferred')
    assert.equal(harness.events.some(event => event[0] === 'resume'), true)
  }
})

test('local retry reuses the one relay claim while lost claim restarts the helper', async () => {
  const localOptions = {
    backupFails: true,
    fragment: `transfer.${'A'.repeat(43)}`
  }
  const local = createHarness(localOptions)
  assert.equal(
    (await local.controller.runBeforeApplicationStart()).disposition,
    'waiting'
  )
  localOptions.backupFails = false
  local.view.failures[0].onRetry()
  await waitFor(
    () => local.events.some(event => event[0] === 'resume'),
    'the retained local migration retry'
  )
  assert.equal(
    local.events.filter(event => event[0] === 'claim').length,
    1
  )
  assert.equal(local.events.some(event => event[0] === 'save-primary'), true)
  assert.equal(local.events.some(event => event[0] === 'resume'), true)

  const lost = createHarness({
    claimFails: true,
    fragment: `transfer.${'A'.repeat(43)}`
  })
  await lost.controller.runBeforeApplicationStart()
  lost.view.failures[0].onRetry()
  await waitFor(
    () => lost.events.some(event => event[0] === 'navigate'),
    'a fresh helper navigation after a lost relay claim'
  )
  assert.deepEqual(
    lost.events.filter(event => event[0] === 'navigate'),
    [['navigate', 'https://bricechivu.github.io/edenia-migrate/']]
  )
  assert.equal(lost.events.some(event => event[0] === 'resume'), false)
})

test('Settings recovery stays available independently of the automatic flag', () => {
  const harness = createHarness()
  assert.equal(harness.controller.startRecoveryFromSettings(), true)
  assert.deepEqual(harness.events, [[
    'navigate',
    'https://bricechivu.github.io/edenia-migrate/'
  ]])
})
