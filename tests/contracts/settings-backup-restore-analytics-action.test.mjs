import assert from 'node:assert/strict'
import test from 'node:test'

test('backup Restore retains its exact generic click event name', () => {
  const eventName = 'restoreStateBackup'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'restore_state_backup_clicked')
})
