import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
function between(start, end) {
  const at = source.indexOf(start)
  const until = source.indexOf(end, at)
  assert.ok(at >= 0 && until > at)
  return source.slice(at, until)
}
const signedIn = { sessionState: 'signed-in', userId: 'owner', email: 'private@example.com',
  busyAction: null, error: null, notice: null, authMethod: 'email' }

test('retryable cloud outcomes end the attempt and explicit retries start a fresh deadline', () => {
  let now = 10
  const calls = []
  const context = vm.createContext({
    LEARNER_PROFILE_ACCESS_STATES: { RESOLVING: 'resolving', MIGRATING: 'migrating',
      WAITING_CLOUD: 'waiting-cloud', ACTIVE: 'active' },
    LEARNER_PROFILE_OPENING_STATUS_PRESENTATION_DELAY_MS: 2_000,
    learnerProfileOpeningStartedAt: null, learnerProfileOpeningCompletionToastPending: false,
    learnerProfileOpeningFocusHandoffPending: false,
    document: { getElementById: () => null }, Date: { now: () => now },
    profileOpeningDiagnostics: { begin: () => calls.push('begin'), finish: value => calls.push(value),
      capture: () => ({ mark() {} }) }
  })
  vm.runInContext(between('function trackLearnerProfileOpening(', '\nasync function handleLearnerProfileAccessStateChange('), context)
  context.trackLearnerProfileOpening({ status: 'migrating' })
  assert.equal(context.learnerProfileOpeningStartedAt, 10)
  now = 5_000
  context.trackLearnerProfileOpening({ status: 'waiting-cloud', retryable: true })
  assert.equal(context.learnerProfileOpeningStartedAt, null)
  context.trackLearnerProfileOpening({ status: 'resolving' })
  assert.equal(context.learnerProfileOpeningStartedAt, 5_000)
  now = 5_100
  context.trackLearnerProfileOpening({ status: 'active' })
  assert.equal(context.learnerProfileOpeningCompletionToastPending, false)
  assert.deepEqual(calls, ['begin', 'waiting-cloud', 'begin'])
  context.trackLearnerProfileOpening(null)
  assert.equal(context.learnerProfileOpeningStartedAt, null)
})

test('owner retirement resets the presentation deadline before observing the next identity', () => {
  const calls = []
  const context = vm.createContext({
    accountAuthViewState: signedIn, learnerProfileOpeningStartedAt: 123,
    learnerProfileOpeningCompletionToastPending: true, learnerProfileOpeningFocusHandoffPending: true,
    learnerProfileAccessView: { hideOpeningNotice: () => calls.push('retire-notice') },
    profileOpeningDiagnostics: { finish: () => calls.push('retire-trace') },
    accountlessProfileMigrationController: { observeAuthentication: () => calls.push('migration') },
    learnerProfileAuthenticationAdapter: { observeAccountState: () => calls.push('identity') }
  })
  vm.runInContext(between('function applyAccountAuthenticationState(', '\nlet accountExportViewState'), context)
  context.applyAccountAuthenticationState({ ...signedIn, userId: 'other' })
  assert.deepEqual(calls, ['retire-notice', 'retire-trace', 'migration', 'identity'])
  assert.equal(context.learnerProfileOpeningStartedAt, null)
  assert.equal(context.learnerProfileOpeningCompletionToastPending, false)
  assert.equal(context.learnerProfileOpeningFocusHandoffPending, false)
  calls.length = 0
  context.applyAccountAuthenticationState({ ...signedIn, userId: 'other' })
  assert.deepEqual(calls, ['migration', 'identity'])
  calls.length = 0
  context.accountAuthViewState = { ...signedIn, sessionState: 'loading', userId: null }
  context.learnerProfileOpeningStartedAt = 500
  context.applyAccountAuthenticationState(signedIn)
  assert.deepEqual(calls, ['migration', 'identity'], 'first verification continues the opening attempt')
  assert.equal(context.learnerProfileOpeningStartedAt, 500)
})

test('late auth labels update presentation without observing identity or scanning profile history', () => {
  const calls = []
  const record = name => () => calls.push(name)
  const context = vm.createContext({
    accountAuthViewState: signedIn,
    ACCOUNT_SESSION_STATES: { LOADING: 'loading' },
    ACCOUNT_AUTH_ERRORS: { SIGN_OUT_FAILED: 'sign-out-failed' },
    LEARNER_PROFILE_ACCESS_STATES: { ACTIVE: 'active' },
    profileOpeningDiagnostics: { markStartup() {} },
    applyAccountAuthenticationState(state) { calls.push('identity'); context.accountAuthViewState = state },
    accountAnalyticsIdentity: { synchronize: record('analytics') },
    accountExportController: { synchronizeAccount: record('export') },
    reminderPreferencesController: { synchronizeAccount: record('reminders') },
    getReminderPreferenceDefaults: record('history-defaults'),
    learnerProfileLifecycleAuthority: { getState: () => ({ status: 'active' }), readActiveProfile: record('read-profile') },
    synchronizeAccountStudySnapshotForProfile: record('study'),
    renderAccountSettings: record('render'), personalizedOnboardingState: { step: 'account' },
    renderPersonalizedOnboarding: record('onboarding'), synchronizeGoogleIdentityServices: record('google'),
    accountLogoutFailureNotified: false, showToast: record('toast'), t: value => value
  })
  vm.runInContext(between('function handleAccountAuthenticationStateChange(', '\nfunction initializeAccountAuth()'), context)
  context.handleAccountAuthenticationStateChange({ ...signedIn, authMethod: 'google' })
  assert.deepEqual(calls, ['render', 'onboarding'])
  assert.equal(context.accountAuthViewState.authMethod, 'google')
  calls.length = 0
  context.handleAccountAuthenticationStateChange({ ...signedIn, authMethod: 'google' })
  assert.deepEqual(calls, ['render', 'onboarding'], 'SDK recovery repeats no identity or derived work')
  for (const changed of [{ userId: 'other' }, { error: 'session-error' },
    { sessionState: 'signed-out' }, { email: 'changed@example.com' }, { busyAction: 'sign-out' }]) {
    calls.length = 0
    context.handleAccountAuthenticationStateChange({ ...signedIn, ...changed })
    assert.ok(calls.includes('identity'))
    assert.ok(calls.includes('study'))
  }
})

test('hidden backup list does no bank work; first Settings opening reads current entries after showing shell', () => {
  let hidden = true
  let status = 'active'
  const calls = []
  const panel = { classList: { contains: () => hidden } }
  const entries = Array.from({ length: 5 }, (_, id) => ({ id }))
  const noop = () => {}
  const context = vm.createContext({
    document: { getElementById: id => id === 'settingsPanel' ? panel : {} },
    learnerProfileLifecycleAuthority: { getState: () => ({ status }) },
    LEARNER_PROFILE_ACCESS_STATES: { ACTIVE: 'active' },
    recentBackupsView: { clear: () => calls.push('clear'), render: data => calls.push(data.local) },
    LOCAL_BACKUPS_ENABLED: true, getStateBackupEntries: () => { calls.push('bank'); return entries },
    learnerProfileProtectedConflicts: [], learnerProfileProtectedReset: null,
    loadState: () => ({ config: { locale: 'en', channels: [] } }),
    applyLocale: noop, normalizeIncludeShorts: noop, isAnkiEnabled: noop,
    renderChannelList: noop, renderActivityLog: noop, setSettingsHowToOpen: noop,
    setSettingsAccountOpen: noop, setSettingsActivityLogOpen: noop, setSettingsBackupsOpen: noop,
    closeLocaleMenu: noop, renderPlusAccountSettings: noop,
    accountAuthViewState: signedIn, ACCOUNT_SESSION_STATES: { SIGNED_IN: 'signed-in' },
    openSettingsShell() { calls.push('show'); hidden = false }
  })
  vm.runInContext(between('function renderBackupList()', '\nfunction getBackupRestoreContext()')
    + between('function openSettings()', '\nfunction openProtectedProfileVersionsSettings()'), context)
  for (let i = 0; i < 8; i += 1) context.renderBackupList()
  assert.ok(calls.every(call => call === 'clear'))
  calls.length = 0
  context.openSettings()
  assert.deepEqual(calls, ['clear', 'show', 'bank', entries])
  status = 'locked'
  calls.length = 0
  context.renderBackupList()
  assert.deepEqual(calls, ['clear'], 'inactive owner cannot render an otherwise visible list')
})

function storageHarness({ trial = true, features = true, config = true, pending = false,
  session = () => new Promise(() => {}) } = {}) {
  const calls = []
  let journalReady, backupReady
  const journal = new Promise(resolve => { journalReady = resolve })
  const backup = new Promise(resolve => { backupReady = resolve })
  const context = vm.createContext({
    IS_AUTH_TRIAL: trial, ACCOUNT_FEATURES_ENABLED: features,
    hasSupabaseRuntimeConfig: () => config,
    profileOpeningDiagnostics: { markStartup() {} },
    getSupabaseClient: () => ({ auth: { getSession() { calls.push('session'); return session() } } }),
    profileRecoveryWorkspace: { initialize: () => journal,
      hasPending: () => pending, activate: () => calls.push('recovery') },
    resetRecoveryBackupStore: () => calls.push('recovery-bank'),
    initializeStateBackupStorage: () => { calls.push('backup'); return backup },
    primaryProfileRepository: {}, Promise
  })
  vm.runInContext(between('let accountSessionPrewarmed = false', '\nasync function requestAccountEmailCode(')
    + between('async function initializeBrowserStorage()', '\nasync function reconcileBackgroundProfileRecovery('), context)
  return { calls, context, journalReady, backupReady }
}

test('session preparation starts after journal safety and does not become another storage barrier', async () => {
  const h = storageHarness()
  const opening = h.context.initializeBrowserStorage()
  assert.deepEqual(h.calls, [])
  h.journalReady()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(h.calls, ['session', 'backup'])
  h.backupReady()
  await opening
  h.context.prewarmAccountSession()
  assert.deepEqual(h.calls, ['session', 'backup'], 'prewarm is once per page and never waits for its result')
})

test('pending recovery and disabled or missing-config account routes do not prewarm', async () => {
  for (const options of [{ pending: true }, { trial: false }, { features: false }, { config: false }]) {
    const h = storageHarness(options)
    h.journalReady()
    h.backupReady()
    await h.context.initializeBrowserStorage()
    assert.equal(h.calls.includes('session'), false)
    if (options.pending) assert.deepEqual(h.calls, ['recovery', 'recovery-bank'])
    else assert.deepEqual(h.calls, ['backup'])
  }
})

test('synchronous and asynchronous prewarm failures do not change local opening', async () => {
  for (const session of [() => { throw new Error('blocked') }, () => Promise.reject(new Error('offline'))]) {
    const h = storageHarness({ session })
    h.journalReady()
    h.backupReady()
    await h.context.initializeBrowserStorage()
    await Promise.resolve()
    assert.deepEqual(h.calls, ['session', 'backup'])
  }
})
