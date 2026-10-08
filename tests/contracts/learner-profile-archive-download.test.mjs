import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { unzipSync } from 'fflate'
import { createPortableLearnerProfileConflictArchive } from '../../src/state/portable-learner-profile-archive.js'
const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const start = source.indexOf('async function downloadLearnerProfileConflictArchive(')
const end = source.indexOf('\nasync function exportSyncFile(', start)
const profile = title => ({ videos: { v: { id: 'v', title } }, anki: {}, config: { channels: [] } })
function harness() {
  const downloads = []
  let blob
  const context = vm.createContext({
    createPortableLearnerProfileConflictArchive, Date, Blob,
    PORTABLE_LEARNER_PROFILE_RECOVERY_MAX_BYTES: 8 * 1024 * 1024,
    toDateKey: () => '2026-10-09',
    URL: { createObjectURL(value) { blob = value; return 'blob:archive' }, revokeObjectURL() {} },
    document: { body: { appendChild() {} }, createElement: () => ({
      click() { downloads.push(this.download) }, remove() {}
    }) }
  })
  vm.runInContext(source.slice(start, end), context)
  return { downloads, download: (profiles, options) => context.downloadLearnerProfileConflictArchive(profiles, options), blob: () => blob }
}
test('the browser adapter requests exactly one ZIP containing both sync alternatives', async () => {
  const h = harness()
  assert.equal(await h.download({ device: profile('Device'), cloud: profile('Cloud') }), true)
  assert.deepEqual(h.downloads, ['edenia-sync-both-2026-10-09.zip'])
  assert.equal(h.blob().type, 'application/zip')
  assert.equal(Object.keys(unzipSync(new Uint8Array(await h.blob().arrayBuffer()))).length, 2)
})
test('retiring the comparison during archive preparation cancels every download', async () => {
  const h = harness()
  let active = true
  const pending = h.download({ device: profile('Device'), cloud: profile('Cloud') }, { isCurrent: () => active })
  active = false
  assert.equal(await pending, false)
  assert.equal(h.downloads.length, 0)
})
test('an invalid alternative cannot create a partial download', async () => {
  const h = harness()
  assert.equal(await h.download({ device: profile('Device'), cloud: {} }), false)
  assert.equal(h.downloads.length, 0)
})
