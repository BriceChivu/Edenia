import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { restorePreviousTinySwordsHistory } from '../../scripts/restore-tiny-swords-history.mjs'

const options = { repository: 'owner/repo', log() {} }
test('history bootstrap distinguishes absent artifacts from a metadata outage', async () => {
  assert.equal(await restorePreviousTinySwordsHistory({ ...options, gh: () => ({ status: 0, stdout: '[]' }) }), false)
  await assert.rejects(restorePreviousTinySwordsHistory({ ...options, gh: () => ({ status: 1, stdout: '' }) }), /metadata/)
  let requests = 0
  assert.equal(await restorePreviousTinySwordsHistory({ ...options, gh: () => ({ status: 0,
    stdout: JSON.stringify(++requests === 1 ? [{ databaseId: 123 }] : { artifacts: [] }) }) }), false)
})
test('an archive that exists must download successfully before old releases may be replaced', async () => {
  const destination = await mkdtemp(resolve(tmpdir(), 'edenia-game-download-'))
  try {
    let requests = 0
    await assert.rejects(restorePreviousTinySwordsHistory({ ...options, destination, gh: () => {
      requests++
      return requests === 1 ? { status: 0, stdout: '[{"databaseId":123}]' }
        : requests === 2 ? { status: 0, stdout: '{"artifacts":[{"name":"tiny-swords-compatibility","expired":false}]}' }
        : { status: 1 }
    } }), /refusing to drop/)
    assert.equal(requests, 3)
  } finally { await rm(destination, { recursive: true, force: true }) }
})
