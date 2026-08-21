import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindLearnerProfileConflictActions
} from '../../src/features/profile-access/conflict-actions.js'

const selectors = [
  'export-device',
  'export-cloud',
  'export-both',
  'choose-device',
  'choose-cloud',
  'confirm-choice',
  'cancel-choice',
  'export-protected'
]

function createHarness() {
  const exportList = {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    contains(control) {
      return control?.exportList === this
    }
  }
  const controls = new Map(selectors.map(name => {
    const control = {
      dataset: { profileConflictAction: name },
      exportList: name === 'export-protected' ? exportList : null,
      listeners: new Map(),
      addEventListener(type, listener) {
        this.listeners.set(type, listener)
      },
      click() {
        this.listeners.get('click')?.({ currentTarget: this })
        this.exportList?.listeners.get('click')?.({ target: this })
      },
      closest(selector) {
        return selector === '[data-profile-conflict-action="export-protected"]'
          && this.dataset.profileConflictAction === 'export-protected'
          ? this
          : null
      }
    }
    return [`[data-profile-conflict-action="${name}"]`, control]
  }))
  return {
    controls,
    root: {
      querySelector(selector) {
        if (selector === '[data-profile-conflict-export-list]') {
          return exportList
        }
        return controls.get(selector) || null
      }
    }
  }
}

test('conflict controls forward exports and deliberate two-step choices', () => {
  const { controls, root } = createHarness()
  const calls = []
  const actions = {
    cancelChoice: () => calls.push(['cancel']),
    confirmChoice: side => calls.push(['confirm', side]),
    exportBoth: () => calls.push(['export-both']),
    exportVersion: (side, conflictId) => calls.push([
      'export',
      side,
      conflictId
    ]),
    requestChoice: side => calls.push(['request', side])
  }

  assert.equal(bindLearnerProfileConflictActions(root, actions), 8)
  controls.get('[data-profile-conflict-action="export-device"]').click()
  controls.get('[data-profile-conflict-action="export-cloud"]').click()
  controls.get('[data-profile-conflict-action="export-both"]').click()
  controls.get('[data-profile-conflict-action="choose-device"]').click()
  controls.get('[data-profile-conflict-action="choose-cloud"]').click()
  const confirm = controls.get(
    '[data-profile-conflict-action="confirm-choice"]'
  )
  confirm.dataset.conflictSide = 'cloud'
  confirm.click()
  controls.get('[data-profile-conflict-action="cancel-choice"]').click()
  const protectedExport = controls.get(
    '[data-profile-conflict-action="export-protected"]'
  )
  protectedExport.dataset.conflictSide = 'device'
  protectedExport.dataset.conflictId = 'conflict-2'
  protectedExport.click()

  assert.deepEqual(calls, [
    ['export', 'device', undefined],
    ['export', 'cloud', undefined],
    ['export-both'],
    ['request', 'device'],
    ['request', 'cloud'],
    ['confirm', 'cloud'],
    ['cancel'],
    ['export', 'device', 'conflict-2']
  ])
  assert.equal(bindLearnerProfileConflictActions(root, actions), 0)
})
