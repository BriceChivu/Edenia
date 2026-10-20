import assert from 'node:assert/strict'
import test from 'node:test'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'
import { createRecentBackupsView, getRecentBackupEntries } from '../../src/features/settings/recent-backups-view.js'

const local = (id, createdAt = '2026-10-20') => ({ id, createdAt, reason: 'automatic backup' })
const conflict = (id, protectedUntil, selectedSide = 'device') => ({ id, protectedUntil, selectedSide, status: 'resolved' })
const reset = { id: 'reset', protectedUntil: 3_000, status: 'available' }

test('one list keeps deliberate recovery copies visible and local backups in date order', () => {
  const result = getRecentBackupEntries({
    local: [local('older', '2026-10-18'), local('newer')],
    conflicts: [conflict('cloud', 2_000), conflict('device', 2_500, 'cloud')], reset
  }, 1_000)
  assert.deepEqual(result.map(entry => entry.key), [
    'reset:reset', 'conflict:device', 'conflict:cloud', 'local:newer', 'local:older'
  ])
  assert.equal(result[1].side, 'device')
  assert.equal(result[2].side, 'cloud')
  assert.equal(result[1].createdAt, undefined, 'do not invent cloud save dates')
})

test('expired and unresolved recovery copies are excluded without hiding local backups', () => {
  assert.deepEqual(getRecentBackupEntries({ local: [local('kept')], reset,
    conflicts: [conflict('expired', 1_000), { ...conflict('open', 9_000), status: 'open' }]
  }, 3_000).map(entry => entry.key), ['local:kept'])
})

function harness() {
  let currentTime = 1_000
  let locale = 'en'
  let current = true
  let signedIn = false
  let expiry
  let restore = async () => {}
  const restored = []
  let unavailable = 0
  const elements = new Map()
  const root = {
    activeElement: null,
    createElement() {
      const listeners = new Map()
      return {
        children: [], dataset: {}, attributes: {}, open: false,
        append(...items) { this.children.push(...items) },
        replaceChildren(...items) { this.children = items },
        setAttribute(key, value) { this.attributes[key] = value },
        addEventListener(name, fn) { listeners.set(name, fn) },
        fire(name) { return listeners.get(name)?.({ preventDefault() {} }) },
        focus() { root.activeElement = this },
        showModal() { this.open = true }, close() { this.open = false },
        querySelectorAll() {
          return this.children.flatMap(child => [child, ...child.querySelectorAll()])
            .filter(child => child.dataset.backupKey)
        },
        querySelector() { return this.querySelectorAll()[0] }
      }
    },
    getElementById(id) { return elements.get(id) },
    querySelector() { return elements.get('toggle') }
  }
  for (const id of ['backupList', 'backupShowOlder', 'backupRestoreDialog', 'backupRestoreSummary',
    'backupRestoreBody', 'backupRestoreConfirm', 'backupRestoreCancel', 'toggle']) elements.set(id, root.createElement())
  const view = createRecentBackupsView({ root,
    translate: (key, params = {}) => Object.entries(params).reduce(
      (text, [key, value]) => text.replace(`{${key}}`, value), I18N[locale][key]),
    formatDateTime: String, formatReason: String,
    now: () => currentTime, setTimer: fn => { expiry = fn; return 1 }, clearTimer() {},
    getContext: () => ({ signedIn }), isContextCurrent: () => current,
    restore: entry => { restored.push(entry); return restore(entry) },
    unavailable: () => { unavailable++ }
  })
  return { view, elements, restored, root,
    setTime(value) { currentTime = value; expiry() },
    setLocale(value) { locale = value; view.render() },
    invalidate() { current = false },
    signIn() { signedIn = true },
    restoreWith(fn) { restore = fn },
    unavailable: () => unavailable,
    control(kind = 'local') {
      return elements.get('backupList').children.find(item => item.dataset.backupKind === kind)?.children[1]
    }
  }
}

test('restore requires confirmation; Cancel and Escape leave progress unchanged and return focus', async () => {
  const h = harness()
  h.view.render({ local: [local('one')] })
  const control = h.control()
  await control.fire('click')
  assert.equal(h.elements.get('backupRestoreDialog').open, true)
  assert.match(h.elements.get('backupRestoreBody').textContent, /in this browser/)
  assert.equal(h.root.activeElement, h.elements.get('backupRestoreCancel'))
  assert.equal(control.dataset.analyticsAction, 'restoreStateBackup')
  assert.equal(control.dataset.settingsBackupAction, 'restore')
  assert.equal(control.dataset.backupId, 'one')
  assert.equal(h.restored.length, 0)
  await h.elements.get('backupRestoreCancel').fire('click')
  assert.equal(h.elements.get('backupRestoreDialog').open, false)
  assert.equal(h.root.activeElement, control)
  await control.fire('click')
  await h.elements.get('backupRestoreDialog').fire('cancel')
  assert.equal(h.restored.length, 0)
  assert.equal(h.elements.get('backupRestoreDialog').open, false)
})

test('confirmation describes synced restoration and prevents duplicate submission', async () => {
  const h = harness()
  h.signIn()
  h.view.render({ local: [local('one')] })
  await h.control().fire('click')
  assert.match(h.elements.get('backupRestoreBody').textContent, /other devices/)
  let finish
  h.restoreWith(() => new Promise(resolve => { finish = resolve }))
  const pending = h.elements.get('backupRestoreConfirm').fire('click')
  await h.elements.get('backupRestoreConfirm').fire('click')
  assert.equal(h.restored.length, 1)
  assert.equal(h.elements.get('backupRestoreCancel').disabled, true)
  finish()
  await pending
  assert.equal(h.elements.get('backupRestoreDialog').open, false)
})

test('stale ownership cannot authorize a pending restore', async () => {
  const h = harness()
  h.view.render({ reset })
  await h.control('reset').fire('click')
  assert.match(h.elements.get('backupRestoreBody').textContent, /since starting over will be replaced/)
  assert.equal(h.control('reset').dataset.analyticsAction, 'settings.startOver.undo')
  h.invalidate()
  await h.elements.get('backupRestoreConfirm').fire('click')
  assert.equal(h.restored.length, 0)
  assert.equal(h.unavailable(), 1)
})

test('expiry removes recovery entries and cancels an open reset confirmation', async () => {
  const h = harness()
  h.view.render({ local: [local('kept')], conflicts: [conflict('one', 2_000)], reset })
  await h.control('reset').fire('click')
  h.setTime(2_000)
  assert.equal(h.control('conflict'), undefined)
  assert.equal(h.elements.get('backupRestoreDialog').open, true)
  h.setTime(3_000)
  assert.equal(h.control('reset'), undefined)
  assert.equal(h.elements.get('backupRestoreDialog').open, false)
  assert.ok(h.control())
})

test('all retained entries can be expanded and download-only copies retain the correct identity', async () => {
  const h = harness()
  h.view.render({ local: [1, 2, 3, 4, 5].map(id => local(String(id))),
    conflicts: [conflict('cloud-copy', 4_000)], reset })
  assert.equal(h.elements.get('backupList').children.length, 4)
  assert.equal(h.elements.get('backupShowOlder').hidden, false)
  const download = h.control('conflict')
  assert.equal(download.textContent, 'Download')
  assert.equal(download.dataset.profileConflictAction, 'export-protected')
  assert.equal(download.dataset.conflictId, 'cloud-copy')
  assert.equal(download.dataset.conflictSide, 'cloud')
  assert.equal(download.dataset.settingsBackupAction, undefined)
  await h.elements.get('backupShowOlder').fire('click')
  assert.equal(h.elements.get('backupList').children.length, 7)
  assert.equal(h.elements.get('backupShowOlder').hidden, true)
  h.setLocale('fr')
  assert.equal(h.control('conflict').textContent, 'Télécharger')
  assert.match(h.elements.get('backupList').children[1].children[0].children[1].textContent, /Disponible/)
})

test('Recent backups has translated labels and restore consequences in every locale', () => {
  const keys = ['settings.backups.title', 'settings.backups.note', 'backups.beforeStartOver',
    'backups.beforeChoice', 'backups.availableUntil', 'backups.thisBrowser', 'backups.download',
    'backups.showOlder', 'backups.restoreTitle', 'backups.cancel', 'backups.restoreConfirm',
    'backups.restoreLocalWarning', 'backups.restoreSyncedWarning', 'backups.restoreResetWarning']
  for (const locale of SUPPORTED_LOCALES) for (const key of keys) {
    assert.match(I18N[locale][key], /\S/, `${locale}: ${key}`)
  }
})
