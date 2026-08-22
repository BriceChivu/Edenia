import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileSyncView
} from '../../src/features/profile-access/sync-view.js'

function element() {
  const classes = new Set(['hidden'])
  return {
    classList: {
      contains: value => classes.has(value),
      toggle(value, force) {
        if (force) classes.add(value)
        else classes.delete(value)
      }
    },
    dataset: {},
    textContent: ''
  }
}

test('sync status stays quiet when idle and exposes every pending or failed state accessibly', () => {
  const actions = element()
  const guidance = element()
  const header = element()
  const settings = element()
  const elements = {
    learnerProfileSyncActions: actions,
    learnerProfileSyncGuidance: guidance,
    learnerProfileSyncSettingsStatus: settings,
    learnerProfileSyncStatus: header
  }
  const view = createLearnerProfileSyncView({
    root: { getElementById: id => elements[id] },
    translate: key => ({
      'progressSync.needsAttention': 'Needs attention',
      'progressSync.notBackedUp': 'Not backed up',
      'progressSync.notYetBackedUp': 'Not yet backed up',
      'progressSync.backupGuidance': 'Study stays on this device.',
      'progressSync.syncing': 'Syncing…',
      'progressSync.upToDate': 'Up to date',
      'progressSync.waiting': 'Saved on this device — waiting to sync.'
    })[key]
  })

  view.render({ status: 'idle' })
  assert.equal(header.classList.contains('hidden'), true)
  assert.equal(settings.classList.contains('hidden'), true)
  assert.equal(actions.classList.contains('hidden'), true)
  assert.equal(guidance.classList.contains('hidden'), true)

  for (const [status, expected] of [
    ['syncing', 'Syncing…'],
    ['up-to-date', 'Up to date'],
    ['waiting', 'Saved on this device — waiting to sync.'],
    ['not-yet-backed-up', 'Not yet backed up'],
    ['not-backed-up', 'Not backed up'],
    ['needs-attention', 'Needs attention'],
    ['conflicting', 'Needs attention']
  ]) {
    view.render({ status })
    assert.equal(header.textContent, expected)
    assert.equal(settings.textContent, expected)
    assert.equal(header.dataset.syncStatus, status)
    assert.equal(settings.dataset.syncStatus, status)
    assert.equal(header.classList.contains('hidden'), false)
    assert.equal(settings.classList.contains('hidden'), false)
  }

  view.render({ status: 'not-backed-up' })
  assert.equal(guidance.textContent, 'Study stays on this device.')
  assert.equal(guidance.classList.contains('hidden'), false)
  assert.equal(actions.classList.contains('hidden'), false)

  view.render({ status: 'waiting' })
  assert.equal(guidance.classList.contains('hidden'), true)
  assert.equal(actions.classList.contains('hidden'), true)
})
