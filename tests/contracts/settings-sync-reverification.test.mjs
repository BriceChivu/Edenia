import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { bindSettingsSyncActions } from '../../src/features/settings/sync-actions.js'
import { createLearnerProfileReverificationController } from '../../src/integrations/learner-profile-reverification.js'
import { LEARNER_PROFILE_ACCESS_STATES } from '../../src/state/learner-profile-lifecycle.js'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

// Exercise the real app callbacks with independently controlled Auth/FileReader
// completion. Native picker behavior remains a separate local browser check.
function sourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker)
  const end = appSource.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start)
  return appSource.slice(start, end)
}

function deferred() {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}

function element(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : [])
  const listeners = new Map()
  return {
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name) }
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatch: name => listeners.get(name)?.(),
    click() { this.dispatch('click') },
    focus() {},
    disabled: false,
    textContent: '',
    value: ''
  }
}

function createHarness({ delayedVerification = false, delayedImport = false } = {}) {
  const panel = element()
  const toast = element()
  const input = element(true)
  const confirmation = element(true)
  const choose = element()
  const ids = new Map([
    ['settingsPanel', panel], ['toast', toast], ['syncFileInput', input],
    ['syncImportConfirm', confirmation], ['syncImportConfirmFile', element()]
  ])
  const selectors = new Map([
    ['[data-settings-sync-action="export"]', element()],
    ['[data-settings-sync-action="choose-file"]', choose],
    ['#syncFileInput[data-settings-sync-action="import-file"]', input],
    ['[data-settings-sync-action="confirm-import"]', element()],
    ['[data-settings-sync-action="cancel-import"]', element()]
  ])
  const windowListeners = new Map()
  const authRequest = deferred()
  const calls = { reverifications: 0, profileRefreshes: 0, imports: 0 }
  const readers = []
  const verification = deferred()
  const imported = deferred()
  let access = {
    status: 'active', ownerId: 'test-owner', profileId: 'test-profile',
    activation: { generation: 1 }
  }
  const context = vm.createContext({
    LEARNER_PROFILE_ACCESS_STATES,
    ACCOUNT_SESSION_STATES: { SIGNED_IN: 'signed-in' },
    ACCOUNT_FEATURES_ENABLED: true,
    PORTABLE_LEARNER_PROFILE_SCHEMA: 'edenia-portable-learner-profile',
    LEARNER_PROFILE_CLOUD_ENVELOPE_MAX_BYTES: 2_000_000,
    IS_SANDBOX: false,
    bindSettingsSyncActions,
    createLearnerProfileReverificationController,
    learnerProfileReverificationController: null,
    learnerProfileLifecycleAuthority: {
      getState: () => access,
      refresh() {
        calls.profileRefreshes += 1
        access = { status: 'waiting-cloud', ownerId: null, profileId: null }
        context.handleLearnerProfileAccessStateChange(access)
      },
      async importActiveProfile() {
        calls.imports += 1
        if (delayedImport) await imported.promise
        return { status: 'imported' }
      }
    },
    accountAuthController: {
      reverify() {
        calls.reverifications += 1
        return authRequest.promise
      }
    },
    document: {
      activeElement: null,
      getElementById: id => ids.get(id) || null,
      querySelector: selector => selectors.get(selector) || null
    },
    window: {
      navigator: { onLine: true },
      addEventListener: (name, callback) => windowListeners.set(name, callback),
      removeEventListener: name => windowListeners.delete(name),
      setTimeout: callback => callback()
    },
    FileReader: class {
      constructor() { readers.push(this) }
      readAsText() {}
    },
    verifyPortableLearnerProfileEnvelope: async serialized => {
      if (delayedVerification) await verification.promise
      return JSON.parse(serialized)
    },
    getImportedSyncState: profile => profile,
    LOCAL_BACKUPS_ENABLED: false,
    STORAGE_KEY: 'test-state',
    localStorage: { getItem: () => null },
    appendActivityLog() {},
    syncStreak() {},
    saveImportedState: () => ({ persisted: true }),
    normalizeLoadedState() {},
    showToast(message) { toast.textContent = message; toast.classList.add('show') },
    openSettings() {},
    hide(id) { ids.get(id)?.classList.add('hidden') },
    t: key => key,
    console: { error() {} },
    trackLearnerProfileOpening() {},
    learnerProfileAccessVisualTestActive: false,
    protectedConflictAnnouncementIds: new Set(),
    accountlessProfileMigrationController: null,
    learnerProfileAccessView: { render() {} },
    learnerProfileConflictView: { hideConflict() {}, hideProtected() {} },
    renderStartOverUndo() {},
    hasPersistedLearnerProfile: () => true,
    introTrailerState: { active: false },
    personalizedOnboardingState: { active: false },
    synchronizeAccountStudySnapshotForProfile() {},
    parkLearnerProfileDom() {}
  })
  vm.runInContext([
    sourceBetween('let legacyProgressManualImportDone', '\nfunction normalizeLegacyProgressState('),
    sourceBetween('function handleLearnerProfileAccessStateChange(', '\nfunction synchronizeAccountStudySnapshotForProfile('),
    sourceBetween('function startLearnerProfileReverification()', '\nfunction initializeAccountAuth()'),
    sourceBetween('function closeSettings()', '\nfunction setSettingsAccordionOpen('),
    sourceBetween('async function exportSyncFile()', '\nfunction formatBackupTimestamp('),
    sourceBetween('bindSettingsSyncActions(document, {', '\nbindLegacyProgressRecoveryActions(')
  ].join('\n'), context)
  context.startLearnerProfileReverification()
  return {
    calls, panel, toast, input, confirmation,
    finishImport: () => imported.resolve(),
    beginLegacy(done) {
      context.legacyDone = done
      vm.runInContext('(function(done) {' + sourceBetween('    onManualImport(done) {', '\n    onResume:').split('onManualImport(done) {')[1].replace(/},\s*$/, '') + '})(legacyDone)', context)
    },
    choose: () => choose.click(),
    focus: () => windowListeners.get('focus')(),
    close: () => context.closeSettings(),
    reopen: () => panel.classList.remove('hidden'),
    cancel: () => context.cancelPendingLearnerProfileImport(),
    finishVerification: () => verification.resolve(),
    replaceOwner() {
      access = { status: 'active', ownerId: 'other-owner', profileId: 'other-profile', activation: { generation: 2 } }
    },
    confirm: () => context.confirmPendingLearnerProfileImport(),
    select() {
      input.files = [{ name: 'synthetic-profile.json' }]
      input.dispatch('change')
    },
    finishRead: async serialized => {
      readers.at(-1).result = serialized
      await readers.at(-1).onload()
    },
    finishAuth: async () => {
      authRequest.resolve({ sessionState: 'signed-in', userId: 'test-owner' })
      for (let index = 0; index < 5; index += 1) await Promise.resolve()
    },
    revoke() {
      access = { status: 'locked', ownerId: null, profileId: null }
      context.handleLearnerProfileAccessStateChange(access)
    }
  }
}

for (const order of ['file-before-auth', 'auth-before-file']) {
  test(`picker return ${order} keeps invalid-file feedback while rechecking Auth`, async () => {
    const harness = createHarness()
    harness.choose()
    harness.focus()
    harness.select()
    if (order === 'file-before-auth') {
      await harness.finishRead('{ invalid JSON')
      await harness.finishAuth()
    } else {
      await harness.finishAuth()
      await harness.finishRead('{ invalid JSON')
    }
    assert.equal(harness.calls.reverifications, 1, 'Auth must still be checked on picker return')
    assert.equal(harness.panel.classList.contains('hidden'), false, 'Picker return must not close Settings')
    assert.equal(harness.toast.classList.contains('show'), true)
    assert.equal(harness.toast.textContent, 'toast.invalidSyncJson')
    assert.equal(harness.calls.profileRefreshes, 0)
    harness.close()
    assert.equal(harness.calls.profileRefreshes, 1, 'Closing Settings runs the deferred cloud reopening')
  })
}

test('valid import remains explicitly confirmable across picker-return reverification', async () => {
  const harness = createHarness()
  harness.choose()
  harness.focus()
  harness.select()
  await harness.finishRead(JSON.stringify({
    schema: 'edenia-portable-learner-profile', profile: { config: { locale: 'en' } }
  }))
  assert.equal(harness.confirmation.classList.contains('hidden'), false)
  await harness.finishAuth()
  assert.equal(harness.panel.classList.contains('hidden'), false)
  assert.equal(harness.confirmation.classList.contains('hidden'), false)
  assert.equal(harness.calls.imports, 0, 'File selection cannot write before explicit confirmation')
  await harness.confirm()
  assert.equal(harness.calls.imports, 1)
})

test('Auth revocation still closes the import surface and cancels its confirmation', async () => {
  const harness = createHarness()
  harness.choose()
  harness.focus()
  harness.select()
  await harness.finishRead(JSON.stringify({
    schema: 'edenia-portable-learner-profile', profile: { config: { locale: 'en' } }
  }))
  harness.revoke()
  await harness.finishAuth()
  assert.equal(harness.panel.classList.contains('hidden'), true)
  assert.equal(harness.confirmation.classList.contains('hidden'), true)
  await harness.confirm()
  harness.close()
  assert.equal(harness.calls.imports, 0)
  assert.equal(harness.calls.profileRefreshes, 0)
})

test('ordinary focus without a picker still reopens the verified profile', async () => {
  const harness = createHarness()
  harness.focus()
  await harness.finishAuth()
  assert.equal(harness.calls.reverifications, 1)
  assert.equal(harness.calls.profileRefreshes, 1)
})

const validSelection = JSON.stringify({
  schema: 'edenia-portable-learner-profile', profile: { config: { locale: 'en' } }
})

for (const interruption of ['close', 'close-reopen', 'cancel', 'replace-owner', 'revoke']) {
  for (const delayedVerification of [false, true]) {
    test(`${interruption} fences import completion during ${delayedVerification ? 'verification' : 'file reading'}`, async () => {
      const harness = createHarness({ delayedVerification })
      harness.choose()
      harness.select()
      let reading
      if (delayedVerification) reading = harness.finishRead(validSelection)
      if (interruption === 'replace-owner') harness.replaceOwner()
      else if (interruption === 'revoke') harness.revoke()
      else if (interruption === 'cancel') harness.cancel()
      else {
        harness.close()
        if (interruption === 'close-reopen') harness.reopen()
      }
      if (delayedVerification) {
        harness.finishVerification()
        await reading
      } else await harness.finishRead(validSelection)
      assert.equal(harness.confirmation.classList.contains('hidden'), true)
      await harness.confirm()
      assert.equal(harness.calls.imports, 0)
      assert.equal(harness.input.disabled, false)
    })
  }
}

test('a confirmation cannot be applied to a replacement owner', async () => {
  const harness = createHarness()
  harness.choose()
  harness.select()
  await harness.finishRead(validSelection)
  harness.replaceOwner()
  await harness.confirm()
  assert.equal(harness.calls.imports, 0)
})


test('a second chooser releases the shared input while an earlier read is pending', () => {
  const harness = createHarness()
  harness.choose()
  harness.select()
  assert.equal(harness.input.disabled, true)
  harness.choose()
  assert.equal(harness.input.disabled, false)
})

test('a late import confirmation cannot clear a newer selection', async () => {
  const harness = createHarness({ delayedImport: true })
  harness.choose()
  harness.select()
  await harness.finishRead(validSelection)
  const confirming = harness.confirm()
  harness.choose()
  harness.select()
  await harness.finishRead(validSelection)
  harness.finishImport()
  await confirming
  assert.equal(harness.confirmation.classList.contains('hidden'), false)
})

test('legacy manual import can retry an invalid file while Settings remains hidden', async () => {
  const harness = createHarness()
  harness.close()
  const first = []
  const second = []
  harness.beginLegacy(result => first.push(result))
  harness.select()
  await harness.finishRead('{invalid')
  harness.beginLegacy(result => second.push(result))
  harness.select()
  await harness.finishRead(validSelection)
  assert.equal(first.length, 0)
  assert.equal(second.length, 1)
  assert.equal(harness.input.disabled, false)
  assert.equal(harness.panel.classList.contains('hidden'), true)
})
