import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { restorePreviousTinySwordsHistory } from '../../scripts/restore-tiny-swords-history.mjs'

const options = { repository: 'owner/repo', log() {} }
async function pagesArchive(run, { unsafe = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), 'edenia-previous-pages-'))
  const source = resolve(root, 'source'), destination = resolve(root, 'restored'), archive = resolve(root, 'artifact.tar')
  try {
    const game = resolve(source, 'tiny-swords-game', 'a'.repeat(64))
    await mkdir(game, { recursive: true })
    await writeFile(resolve(game, 'index.html'), 'previous game')
    await writeFile(resolve(source, 'config.local.js'), 'PRIVATE CONFIG MUST NOT BE COPIED')
    if (unsafe) await symlink(resolve(root, 'outside'), resolve(game, 'link'))
    execFileSync('tar', ['-cf', archive, '-C', source, '.'])
    const gh = args => {
      if (args[0] === 'run' && args[1] === 'list') return { status: 0, stdout: '[{"databaseId":123}]' }
      if (args[0] === 'api') return { status: 0, stdout: '{"artifacts":[{"name":"github-pages","expired":false}]}' }
      copyFileSync(archive, resolve(args[args.indexOf('--dir') + 1], 'artifact.tar'))
      return { status: 0, stdout: '' }
    }
    await run({ destination, gh })
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('the initial compatibility rollout restores the previous Pages game without copying app configuration', () => pagesArchive(async ({ destination, gh }) => {
  assert.equal(await restorePreviousTinySwordsHistory({ ...options, destination, gh }), true)
  assert.equal(await readFile(resolve(destination, 'tiny-swords-game', 'a'.repeat(64), 'index.html'), 'utf8'), 'previous game')
  assert.deepEqual(await readdir(destination), ['tiny-swords-game'])
}))

test('unsafe previous Pages entries cannot write a partial archive', () => pagesArchive(async ({ destination, gh }) => {
  await assert.rejects(restorePreviousTinySwordsHistory({ ...options, destination, gh }), /Pages game archive/)
  assert.deepEqual(await readdir(destination).catch(() => []), [])
}, { unsafe: true }))
test('history bootstrap distinguishes absent artifacts from a metadata outage', async () => {
  assert.equal(await restorePreviousTinySwordsHistory({ ...options, gh: () => ({ status: 0, stdout: '[]' }) }), false)
  await assert.rejects(restorePreviousTinySwordsHistory({ ...options, gh: () => ({ status: 1, stdout: '' }) }), /metadata/)
  let requests = 0
  assert.equal(await restorePreviousTinySwordsHistory({ ...options, gh: () => ({ status: 0,
    stdout: JSON.stringify(++requests === 1 ? [{ databaseId: 123 }] : { artifacts: [] }) }) }), false)
})
test('the compatibility archive takes priority over a previous Pages bootstrap', async () => {
  const destination = await mkdtemp(resolve(tmpdir(), 'edenia-game-preferred-'))
  try {
    const requests = []
    assert.equal(await restorePreviousTinySwordsHistory({ ...options, destination, gh: args => {
      requests.push(args)
      if (args[0] === 'api') return { status: 0, stdout: '{"artifacts":[{"name":"github-pages","expired":false},{"name":"tiny-swords-compatibility","expired":false}]}' }
      return { status: 0, stdout: args[1] === 'list' ? '[{"databaseId":123}]' : '' }
    } }), true)
    assert.equal(requests[2][requests[2].indexOf('--name') + 1], 'tiny-swords-compatibility')
  } finally { await rm(destination, { recursive: true, force: true }) }
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

test('publication cannot succeed before its complete compatibility archive is retained', async () => {
  const workflow = await readFile('.github/workflows/deploy-pages.yml', 'utf8')
  const retain = workflow.indexOf('- name: Retain complete game releases for the next deployment')
  const publish = workflow.indexOf('- name: Deploy to GitHub Pages')
  assert.ok(retain > 0 && publish > retain)
  assert.doesNotMatch(workflow.slice(retain, publish), /continue-on-error: true/)
})
