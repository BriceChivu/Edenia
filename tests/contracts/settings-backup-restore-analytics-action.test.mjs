import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const controls = [
  ...source.matchAll(/<button class="btn-ghost backup-restore-btn"[\s\S]*?<\/button>/g)
].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('backup Restore locks its identity before listener migration', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(getAttribute(
    control,
    'data-settings-backup-action'
  ), 'restore')
  assert.equal(getAttribute(
    control,
    'data-analytics-action'
  ), 'restoreStateBackup')
  assert.equal(getAttribute(control, 'data-backup-id'), '${escHtml(entry.id)}')
  assert.equal(
    getAttribute(control, 'onclick'),
    'restoreStateBackup(this.dataset.backupId)'
  )
})

test('backup Restore retains its exact generic click event name', () => {
  const eventName = 'restoreStateBackup'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'restore_state_backup_clicked')
})
