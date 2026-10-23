import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createHealthMonitor, healthMonitoringAllowed } from '../../src/integrations/health-monitor.js'
import { createStorageRecoveryReporter } from '../../src/integrations/storage-recovery-reporting.js'

function fixture(options = {}) {
  const events = []
  let time = 100
  const monitor = createHealthMonitor({ enabled: true, capture: (event, properties) => events.push({ event, properties }), now: () => time, release: 'abc123-p1-g1', ...options })
  return { monitor, events, advance: value => { time += value } }
}

test('only ordinary public visits can collect health observations', () => {
  assert.equal(healthMonitoringAllowed('https://www.edenia.study/', true), true)
  assert.equal(healthMonitoringAllowed('https://www.edenia.study/?utm_source=test', true), true)
  for (const href of ['http://localhost:8000/', 'https://www.edenia.study/plus/', 'https://edenia.study/', 'https://www.edenia.study/?sandbox=1', 'https://www.edenia.study/?internal_test=2', 'https://www.edenia.study/?internal_test=1', 'https://www.edenia.study/#access_token=secret', 'https://www.edenia.study/?code=secret', 'https://www.edenia.study/?error_description=secret']) {
    assert.equal(healthMonitoringAllowed(href, !href.includes('sandbox')), false, href)
  }
  assert.equal(healthMonitoringAllowed('https://www.edenia.study/', false), false)
})

test('health telemetry cannot interrupt saving and never captures outside its gate', () => {
  const { monitor, events } = fixture({ enabled: false })
  monitor.start(); monitor.ready(); monitor.report('save', 'failure'); monitor.exception(new Error('private'))
  assert.deepEqual(events, [])
  const broken = fixture({ capture: () => { throw new Error('transport unavailable') } }).monitor
  assert.equal(broken.report('save', 'failure'), false)
  assert.equal(broken.ready(), false)
})

test('allowlist discards arbitrary profile data and errors but retains repair categories', () => {
  const { monitor, events } = fixture({ release: 'secret?token=private' })
  monitor.report('save', 'degraded', { reason: 'recovery-copy', recovery: 'memory', duration: 13.6, profile: 'secret', message: 'private', url: 'token', rating: 'poor' })
  monitor.report('private', 'failure', { reason: 'private' })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].properties, { health_schema: 1, health_environment: 'public', health_release: 'unknown', health_operation: 'save', health_outcome: 'degraded', health_reason: 'recovery-copy', health_duration_ms: 14, health_recovery: 'memory', health_rating: 'poor' })
})

test('save sampling and a hard event budget bound runaway collection', () => {
  const { monitor, events, advance } = fixture({ limit: 3 })
  monitor.report('save', 'success'); monitor.report('save', 'success')
  monitor.report('save', 'failure', { reason: 'save-failed' }); monitor.report('save', 'failure', { reason: 'save-failed' })
  advance(60000); monitor.report('save', 'success'); advance(60000); monitor.report('save', 'failure')
  assert.equal(events.length, 4)
  assert.equal(events.at(-1).properties.health_outcome, 'limited')
})

test('page-performance metrics arriving together retain independent observations', () => {
  const { monitor, events } = fixture()
  for (const [metric, value] of [['LCP', 2400], ['INP', 180], ['CLS', .06]]) {
    monitor.report('web_vital', 'observed', { metric, value, rating: 'good' })
  }
  monitor.report('web_vital', 'observed', { metric: 'CLS', value: .06, rating: 'good' })
  assert.deepEqual(events.map(event => [event.properties.health_metric, event.properties.health_value]), [['LCP', 2400], ['INP', 180], ['CLS', .06]])
})

test('startup and timing distinguish successful startup from hidden-tab wait', () => {
  const { monitor, events, advance } = fixture({ hidden: () => true })
  monitor.start(); monitor.start(); advance(40000); monitor.checkStartup(); monitor.ready(); monitor.ready()
  assert.deepEqual(events.map(x => x.properties.health_outcome), ['started', 'success'])
  assert.equal(events[1].properties.health_duration_ms, undefined)
  const visible = fixture(); visible.monitor.start(); visible.advance(30000); visible.monitor.checkStartup(); visible.monitor.checkStartup()
  assert.equal(visible.events.filter(x => x.properties.health_outcome === 'slow').length, 1)
})

test('runtime issues retain first-party code locations without exception values or auth URLs', () => {
  const { monitor, events } = fixture()
  const error = { name: 'TypeError', message: 'PRIVATE LEARNER DATA', stack: 'TypeError: PRIVATE LEARNER DATA\n at privateFunction (https://www.edenia.study/app.js?v=abc&token=SECRET:42:7)\n at other (https://extension.example/tool.js:3:2)' }
  monitor.exception(error); monitor.exception(error)
  assert.equal(events.filter(x => x.event === '$exception').length, 1)
  const encoded = JSON.stringify(events)
  assert.ok(!encoded.includes('PRIVATE') && !encoded.includes('SECRET') && !encoded.includes('privateFunction') && !encoded.includes('https:'))
  assert.deepEqual(events[1].properties.$exception_list[0].stacktrace.frames, [{ filename: 'app.js', lineno: 42, colno: 7, in_app: true }])
  monitor.exception({ stack: 'Error\n at https://extension.example/tool.js:3:2' })
  assert.equal(events.length, 2)
})

test('routine cooldowns, empty feeds and skipped refreshes do not create incidents', () => {
  const { monitor, events } = fixture()
  for (const failure_reason of ['cooldown', 'daily_limit', 'no_channels']) monitor.observeEvent('refresh_completed', { result: 'failure', failure_reason })
  monitor.observeEvent('refresh_completed', { result: 'skipped' })
  monitor.observeEvent('refresh_completed', { result: 'partial', elapsed_ms: 27, private: 'secret' })
  assert.equal(events.length, 1)
  assert.equal(events[0].properties.health_outcome, 'degraded')
})

for (const source of ['src/app.js', 'compat/production/src/app.js']) {
  test(`${source}: storage recovery completion is healthy and retains diagnostic context`, async () => {
    const code = await readFile(source, 'utf8')
    const start = code.indexOf('const storageRecoveryReporter = createStorageRecoveryReporter(')
    const fn = code.slice(start, code.indexOf('\n// Retry network delivery', start))
    const reports = []
    const diagnostics = []
    let outcome = { outcome: 'failure', recovery: 'none' }
    const context = vm.createContext({ createStorageRecoveryReporter, reportWindowHealth: (...args) => reports.push(args),
      profileRecoveryWorkspace: { getTier: () => 'none', getDiagnosticContext: () => ({ incidentId: 'recovery-1' }),
        getDiagnosticState: () => outcome },
      window: { localStorage: { getItem: () => null } }, STORAGE_KEY: 'profile', LEARNER_PROFILE_ACCESS_KEY: 'access', LEARNER_PROFILE_SYNC_KEY: 'sync',
      ...(source === 'src/app.js' ? { IS_AUTH_TRIAL: false, IS_TINY_SWORDS_TESTER: false } : {}),
      getFeedbackAssetVersion: () => 'abc123', getBrowserDefaultLocale: () => 'en',
      navigator: {}, automaticStorageFeedback: async details => { diagnostics.push(details); return 'sent' } })
    vm.runInContext(fn + '\nthis.report = reportBackgroundStorageFailure', context)
    await context.report('save', { code: 'storage-unavailable' })
    assert.equal(reports.at(-1)[1], 'degraded')
    outcome = { outcome: 'recovered', recovery: 'none' }
    await context.report('reconcile', { code: 'storage-recovered', phase: 'promotion' }, { incidentId: 'original-incident' })
    assert.equal(reports.at(-1)[1], 'success')
    assert.equal(reports.at(-1)[2].reason, 'none')
    assert.equal(diagnostics.at(-1).incidentId, 'original-incident')
    assert.equal(diagnostics.at(-1).failure.phase, 'promotion')
    context.profileRecoveryWorkspace.getTier = () => 'memory'
    context.profileRecoveryWorkspace.whenSettled = async () => {
      context.profileRecoveryWorkspace.getTier = () => 'indexed-db'
      outcome = { outcome: 'fallback-saved', recovery: 'indexed-db' }
    }
    await context.report('save', { code: 'storage-full' })
    assert.equal(diagnostics.at(-1).recovery, 'indexed-db')
    assert.equal(reports.at(-1)[2].recovery, 'indexed-db')
  })
  test(`${source}: recovery saves are warnings and monitoring cannot change persistence results`, async () => {
    const code = await readFile(source, 'utf8')
    const fn = code.slice(code.indexOf('function saveState(state'), code.indexOf('\nfunction isCurrentLearnerProfileOperation'))
    const reports = []
    const state = {}
    let persisted = true
    let recovery = false
    const context = vm.createContext({ performance: { now: () => 20 }, primaryProfileStorageUnavailable: false,
      profileRecoveryWorkspace: { isActive: () => recovery, getTier: () => recovery ? 'memory' : 'none' },
      reportWindowHealth: (...args) => reports.push(args), rememberPersistedPortableProfile: () => {},
      isCurrentLearnerProfileOperation: () => true, loadPersistedState: () => null,
      applicationStarted: false, document: { getElementById: () => null }, getPortableProfileSnapshot: () => null,
      persistedPortableProfileSnapshots: new WeakMap(), learnerProfileLifecycleAuthority: null,
      savePersistedState: () => persisted, mapPersistenceResult: (result, complete) => result?.then ? result.then(complete) : complete(result) })
    vm.runInContext(fn + '\nthis.save = saveState', context)
    assert.equal(context.save(state), true)
    assert.equal(reports.at(-1)[1], 'success')
    recovery = true; assert.equal(context.save(state), true); assert.equal(reports.at(-1)[1], 'degraded')
    persisted = Promise.resolve(true); assert.equal(await context.save(state), true)
    persisted = false; assert.equal(context.save(state), false); assert.equal(reports.at(-1)[1], 'failure')
    context.isCurrentLearnerProfileOperation = () => false
    const count = reports.length; assert.equal(context.save(state), false); assert.equal(reports.length, count)
  })
}
