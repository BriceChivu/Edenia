import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsBackupRestoreActions
} from '../../src/features/settings/backup-restore-actions.js'

function createControl(id) {
  const control = new EventTarget()
  control.dataset = { backupId: id }
  return control
}

function createHarness(initialControls = []) {
  let controls = initialControls
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, '[data-settings-backup-action="restore"]')
        return controls
      }
    },
    replaceControls(nextControls) {
      controls = nextControls
    }
  }
}

test('backup Restore binding reads each live ID without forwarding events', () => {
  const first = createControl('first')
  const second = createControl('second')
  const { root } = createHarness([first, second])
  const calls = []
  assert.equal(bindSettingsBackupRestoreActions(root, {
    restore(...args) {
      calls.push(args)
    }
  }), 2)

  first.dataset.backupId = 'first-live'
  const firstEvent = new Event('click', { cancelable: true })
  const secondEvent = new Event('click', { cancelable: true })
  assert.equal(first.dispatchEvent(firstEvent), true)
  assert.equal(second.dispatchEvent(secondEvent), true)
  assert.deepEqual(calls, [['first-live'], ['second']])
  assert.equal(firstEvent.defaultPrevented, false)
  assert.equal(secondEvent.defaultPrevented, false)
})

test('backup Restore binding is idempotent and binds replacement controls', () => {
  const original = createControl('original')
  const replacement = createControl('replacement')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    restore(id) {
      calls.push(id)
    }
  }

  assert.equal(bindSettingsBackupRestoreActions(harness.root, actions), 1)
  assert.equal(bindSettingsBackupRestoreActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  harness.replaceControls([replacement])
  assert.equal(bindSettingsBackupRestoreActions(harness.root, actions), 1)
  replacement.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['original', 'replacement'])

  harness.replaceControls([])
  assert.equal(bindSettingsBackupRestoreActions(harness.root, actions), 0)
})

test('backup Restore binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsBackupRestoreActions(null, { restore() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsBackupRestoreActions(root, {}),
    /restore callback/
  )
})
