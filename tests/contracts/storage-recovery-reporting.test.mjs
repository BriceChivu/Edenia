import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'
import { createStorageRecoveryReporter } from '../../src/integrations/storage-recovery-reporting.js'
import { createStorageRecoveryFeedback } from '../../src/integrations/storage-recovery-feedback.js'
import { describeProfileStorageFailure } from '../../src/state/profile-storage-recovery.js'

function fixture({ onDurableSave = () => {} } = {}) {
  const values = new Map([['profile', '{"points":1}']])
  const disk = { raw: null, fail: false, failOnce: false, stallNext: null }
  const storage = { getItem: key => values.get(key) ?? null,
    setItem() { throw new DOMException('Fixture', 'QuotaExceededError') } }
  const reports = [], health = [], pending = []
  const feedback = createStorageRecoveryFeedback({ location: { origin: 'https://www.edenia.study' }, getStores: () => [],
    fetch: async (_, options) => { reports.push(JSON.parse(options.body)); return { ok: true } } })
  let reporter
  const workspace = createProfileRecoveryWorkspace({ storageKey: 'profile', accessKey: 'access', keys: ['access'],
    getPrimary: () => storage, capture: () => ({ profile: values.get('profile') }),
    journal: {
      async read() { return { raw: disk.raw, candidates: [] } },
      async save(raw, expected, { canPersist = () => true } = {}) {
        await disk.stallNext?.()
        if (disk.fail || disk.failOnce) { disk.failOnce = false; throw new Error('Recovery archive transaction timed out') }
        if (!canPersist()) return { saved: false, cancelled: true, raw: disk.raw }
        assert.ok(disk.raw === expected || disk.raw === raw)
        disk.raw = raw
        return { saved: true, raw }
      }
    },
    onStorageFailure(error, operation = 'save') {
      pending.push(reporter.report(operation, describeProfileStorageFailure(error)))
    },
    onDurableSave() { onDurableSave(); pending.push(reporter.recoverySaved()) }
  })
  reporter = createStorageRecoveryReporter({ workspace, deliver: feedback,
    getDetails: () => ({ mode: 'auth-trial', release: 'test', locale: 'en' }),
    onOutcome: value => health.push(value) })
  return { workspace, reporter, reports, health, disk, pending,
    async settle() { for (let i = 0; i < 6; i++) { await Promise.all([...pending]); await Promise.resolve() } }
  }
}

test('a Web Storage failure followed by a durable journal write reports saved recovery progress', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  await f.settle()
  assert.equal(f.reports.length, 1)
  const p = f.reports[0].properties
  assert.equal(p.storage_recovery_outcome, 'fallback-saved')
  assert.equal(p.feedback_category, 'other')
  assert.match(p.feedback_message, /^Progress saved in recovery storage/)
  assert.match(p.feedback_message, /QuotaExceededError/)
  assert.equal(f.health[0].outcome, 'fallback-saved')
})

test('a failed journal attempt followed by its queued retry retains the error with a durable outcome', async () => {
  const f = fixture()
  f.disk.failOnce = true
  f.workspace.activate()
  assert.equal(await f.workspace.flush(), true)
  await f.settle()
  assert.ok(f.reports.every(report => report.properties.storage_recovery_outcome === 'fallback-saved'))
  assert.ok(f.reports.some(report => report.properties.feedback_message.includes('Recovery archive transaction timed out')))
})

test('memory-only progress remains a failure and a later durable save emits a matching completion', async () => {
  const f = fixture()
  f.disk.fail = true
  f.workspace.activate()
  assert.equal(await f.workspace.flush(), false)
  await f.settle()
  assert.ok(f.reports.length > 0)
  assert.ok(f.reports.every(report => report.properties.storage_recovery_outcome === 'failure'))
  const incident = f.reports[0].properties.storage_recovery_incident_id
  f.disk.fail = false
  assert.equal(await f.workspace.flush(), true)
  await f.settle()
  const durable = f.reports.filter(report => report.properties.storage_recovery_outcome === 'fallback-saved')
  assert.equal(durable.length, 1)
  assert.equal(durable[0].properties.storage_recovery_incident_id, incident)
  assert.match(durable[0].properties.feedback_message, /storage-fallback-saved/)
  // Ordinary successful saves do not create another completion notification.
  const edit = f.workspace.repository.snapshot(); edit.points = 2
  assert.equal(await f.workspace.repository.save(edit), true)
  await f.settle()
  assert.equal(f.reports.filter(report => report.properties.storage_recovery_outcome === 'fallback-saved').length, 1)
})

test('primary promotion has its own outcome and late failures cannot reopen the incident', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  await f.settle()
  const context = f.workspace.getDiagnosticContext()
  assert.equal(await f.workspace.markPromotion({ points: 1 }), true)
  assert.equal(await f.workspace.complete(), true)
  await f.reporter.report('reconcile', { code: 'storage-recovered' }, context)
  const before = f.reports.length
  await f.reporter.report('save', describeProfileStorageFailure(new Error('Recovery archive transaction timed out')), context)
  await f.reporter.recoverySaved()
  await f.settle()
  assert.equal(f.reports.length, before)
  assert.equal(f.reports.at(-1).properties.storage_recovery_outcome, 'recovered')
  assert.match(f.reports.at(-1).properties.feedback_message, /^Primary storage restored/)
})

test('pending journal edits cannot inherit an earlier durable outcome', async () => {
  const f = fixture()
  f.workspace.activate(); await f.workspace.flush(); await f.settle()
  let release
  const held = new Promise(resolve => { release = resolve })
  f.disk.stallNext = () => held
  f.disk.fail = true
  const edit = f.workspace.repository.snapshot(); edit.points = 2
  const save = f.workspace.repository.save(edit)
  assert.equal(f.workspace.getDiagnosticState(f.workspace.getDiagnosticContext().incidentId).outcome, 'failure')
  release()
  assert.equal(await save, false)
  await f.settle()
  assert.equal(f.reports.at(-1).properties.storage_recovery_outcome, 'failure')
})

test('a durable retry corrects a failure even when the IndexedDB tier never changed', async () => {
  const f = fixture()
  f.workspace.activate(); await f.workspace.flush(); await f.settle()
  const incident = f.workspace.getDiagnosticContext().incidentId
  f.disk.fail = true
  assert.equal(await f.workspace.flush(), false)
  await f.settle()
  assert.equal(f.workspace.getTier(), 'indexed-db')
  assert.equal(f.reports.at(-1).properties.storage_recovery_outcome, 'failure')
  f.disk.fail = false
  assert.equal(await f.workspace.flush(), true)
  await f.settle()
  assert.equal(f.reports.at(-1).properties.storage_recovery_outcome, 'fallback-saved')
  assert.equal(f.reports.at(-1).properties.storage_recovery_incident_id, incident)
  assert.equal(JSON.parse(f.disk.raw).values.profile, '{"points":1}')
  const before = f.reports.length
  f.disk.fail = true
  assert.equal(await f.workspace.flush(), false)
  await f.settle()
  assert.equal(f.reports.at(-1).properties.storage_recovery_outcome, 'failure')
  f.disk.fail = false
  assert.equal(await f.workspace.flush(), true)
  await f.settle()
  assert.equal(f.reports.at(-1).properties.storage_recovery_outcome, 'fallback-saved')
  assert.equal(f.reports.length, before + 2, 'each real outcome transition has its own report occurrence')
})

test('diagnostic delivery failure cannot change durable recovery acknowledgement', async () => {
  const f = fixture()
  const reporter = createStorageRecoveryReporter({ workspace: f.workspace,
    getDetails() { throw new Error('Diagnostic failure') }, deliver() { throw new Error('Network failure') } })
  f.workspace.activate(); await f.workspace.flush(); await f.settle()
  assert.equal(await reporter.report('save', { code: 'storage-unavailable' }), 'failed')
  const edit = f.workspace.repository.snapshot(); edit.points = 2
  assert.equal(await f.workspace.repository.save(edit), true)
})

test('a failing durable-save observer cannot reject verified journal or local saves', async () => {
  const fail = () => { throw new Error('Diagnostic failure') }
  const f = fixture({ onDurableSave: fail })
  f.workspace.activate()
  assert.equal(await f.workspace.flush(), true)
  const edit = f.workspace.repository.snapshot(); edit.points = 2
  assert.equal(await f.workspace.repository.save(edit), true)
  const values = new Map()
  const local = createProfileRecoveryWorkspace({ storageKey: 'profile', accessKey: 'access', keys: ['access'],
    getPrimary: () => ({ getItem: key => values.get(key) ?? null, setItem: (key, raw) => values.set(key, raw) }),
    capture: () => ({ profile: '{"points":1}' }), onDurableSave: fail })
  local.activate()
  const localEdit = local.repository.snapshot(); localEdit.points = 2
  assert.equal(local.repository.save(localEdit), true)
  assert.equal(local.getDiagnosticState(local.getDiagnosticContext().incidentId).outcome, 'fallback-saved')
})

test('a delayed failure cannot borrow another incident’s durable copy', async () => {
  const f = fixture()
  f.workspace.activate(); await f.workspace.flush(); await f.settle()
  await f.reporter.report('open', { code: 'storage-unavailable' }, { incidentId: 'unrelated-incident' })
  const last = f.reports.at(-1).properties
  assert.equal(last.storage_recovery_outcome, 'failure')
  assert.match(last.feedback_message, /"recovery": "none"/)
})

test('session-only recovery and an empty journal workspace never claim durable progress', async () => {
  const values = new Map()
  const session = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const workspace = createProfileRecoveryWorkspace({ storageKey: 'profile', accessKey: 'access', keys: ['access'],
    getPrimary: () => ({ getItem: () => null, setItem() { throw new DOMException('', 'QuotaExceededError') } }),
    getSecondary: () => session, capture: () => ({ profile: '{"points":1}' }) })
  workspace.activate()
  assert.equal(workspace.getTier(), 'session')
  assert.equal(workspace.getDiagnosticState(workspace.getDiagnosticContext().incidentId).outcome, 'failure')
  const f = fixture()
  f.workspace.activate({ profile: null }); await f.workspace.flush(); await f.settle()
  assert.equal(f.workspace.getDiagnosticState(f.workspace.getDiagnosticContext().incidentId).outcome, 'failure')
})
