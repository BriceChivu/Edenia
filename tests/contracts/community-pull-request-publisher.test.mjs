import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSystemCommandRunner,
  publishCommunityPullRequest
} from '../../scripts/publish-community-pull-request.mjs'

const CANDIDATES_PATH = 'data/channel-catalog.candidates.json'
const COMMUNITY_PATH = 'data/channel-catalog.community.json'
const BASE_SHA = '1234567890abcdef1234567890abcdef12345678'
const HEAD_SHA = 'abcdef1234567890abcdef1234567890abcdef12'
const CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa'

function candidates(channels = []) {
  return JSON.stringify({
    schemaVersion: 1,
    lookbackDays: 180,
    generatedAt: channels.length ? '2026-07-31T00:00:00Z' : null,
    channels
  })
}

function community(channels = []) {
  return JSON.stringify({
    schemaVersion: 1,
    minimumDistinctUsers: 2,
    generatedAt: channels.length ? '2026-07-31T00:00:00Z' : null,
    channels
  })
}

function promotedChannel() {
  return {
    catalogId: `community-${CHANNEL_ID}`,
    channelId: CHANNEL_ID,
    handle: '@publisherchannel',
    name: 'Publisher Channel',
    languages: ['mandarin'],
    distinctUserCount: 2,
    addCount: 2,
    lastSeenAt: '2026-07-31T00:00:00Z',
    promotedAt: '2026-07-31T00:00:00Z'
  }
}

test('system command runner preserves Git porcelain status prefixes for community files', () => {
  const run = createSystemCommandRunner()
  const output = run(
    process.execPath,
    ['-e', `process.stdout.write(" M ${CANDIDATES_PATH}\\n")`],
    { capture: true }
  )
  assert.equal(output, ` M ${CANDIDATES_PATH}`)
})

test('community publisher exits cleanly when generated catalogs are unchanged', () => {
  const commands = []
  const result = publishCommunityPullRequest({
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      return ''
    }
  })
  assert.deepEqual(result, { changed: false, pullRequest: '' })
  assert.deepEqual(commands, [['git', ['status', '--porcelain=v1']]])
})

test('community publisher creates one stable PR with an exact generated report', () => {
  const commands = []
  const writes = new Map()
  const promoted = promotedChannel()
  let revParseCount = 0
  const pullRequest = 'https://github.com/BriceChivu/Edenia/pull/200'
  const result = publishCommunityPullRequest({
    bodyPath: '/tmp/community-body.md',
    environment: {
      COMMUNITY_CATALOG_REPORT_PATH: '/tmp/community-report.json'
    },
    log: () => {},
    readText(path) {
      if (path === '/tmp/community-report.json') {
        return JSON.stringify({
          exclusions: [],
          blockedPromotions: []
        })
      }
      if (path.endsWith(CANDIDATES_PATH)) return candidates([promoted])
      if (path.endsWith(COMMUNITY_PATH)) return community([promoted])
      throw new Error(`Unexpected read: ${path}`)
    },
    writeText(path, value) {
      writes.set(path, value)
    },
    run(command, args) {
      commands.push([command, args])
      if (command === 'git' && args[0] === 'status') {
        return ` M ${CANDIDATES_PATH}\n M ${COMMUNITY_PATH}`
      }
      if (command === 'git' && args[0] === 'rev-parse') {
        revParseCount += 1
        return revParseCount === 1 ? BASE_SHA : HEAD_SHA
      }
      if (command === 'git' && args[0] === 'ls-remote') {
        return 'feedface\trefs/heads/automation/import-community-channel-catalog'
      }
      if (command === 'git' && args[0] === 'diff') {
        return `${CANDIDATES_PATH}\n${COMMUNITY_PATH}`
      }
      if (command === 'git' && args[0] === 'show') {
        return args[1].endsWith(CANDIDATES_PATH) ? candidates() : community()
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
        return pullRequest
      }
      return ''
    }
  })

  assert.equal(result.pullRequest, pullRequest)
  assert.equal(result.baseSha, BASE_SHA)
  assert.equal(result.headSha, HEAD_SHA)
  assert.match(result.body, /Publisher Channel/)
  assert.match(writes.get('/tmp/community-body.md'), /Base revision/)
  assert.ok(commands.some(([command, args]) => (
    command === 'git'
    && args[0] === 'push'
    && args.includes(
      '--force-with-lease=refs/heads/automation/import-community-channel-catalog:feedface'
    )
  )))
  assert.ok(commands.some(([command, args]) => (
    command === 'gh'
    && args[0] === 'pr'
    && args[1] === 'create'
    && args.includes('--body-file')
  )))
})

test('community publisher updates the existing stable PR and rejects unrelated changes', () => {
  const commands = []
  const promoted = promotedChannel()
  let revParseCount = 0
  const pullRequest = 'https://github.com/BriceChivu/Edenia/pull/201'
  const result = publishCommunityPullRequest({
    bodyPath: '/tmp/community-body.md',
    environment: {
      COMMUNITY_CATALOG_REPORT_PATH: '/tmp/community-report.json'
    },
    log: () => {},
    readText(path) {
      if (path === '/tmp/community-report.json') {
        return JSON.stringify({ exclusions: [], blockedPromotions: [] })
      }
      if (path.endsWith(CANDIDATES_PATH)) return candidates([promoted])
      if (path.endsWith(COMMUNITY_PATH)) return community([promoted])
      throw new Error(`Unexpected read: ${path}`)
    },
    writeText() {},
    run(command, args) {
      commands.push([command, args])
      if (command === 'git' && args[0] === 'status') return ` M ${CANDIDATES_PATH}`
      if (command === 'git' && args[0] === 'rev-parse') {
        revParseCount += 1
        return revParseCount === 1 ? BASE_SHA : HEAD_SHA
      }
      if (command === 'git' && args[0] === 'diff') return CANDIDATES_PATH
      if (command === 'git' && args[0] === 'show') {
        return args[1].endsWith(CANDIDATES_PATH) ? candidates() : community()
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') return pullRequest
      return ''
    }
  })
  assert.equal(result.pullRequest, pullRequest)
  assert.ok(commands.some(([command, args]) => (
    command === 'gh' && args[0] === 'pr' && args[1] === 'edit'
  )))
  const editIndex = commands.findIndex(([command, args]) => (
    command === 'gh' && args[0] === 'pr' && args[1] === 'edit'
  ))
  const pushIndex = commands.findIndex(([command, args]) => (
    command === 'git' && args[0] === 'push'
  ))
  assert.ok(editIndex >= 0 && editIndex < pushIndex)

  assert.throws(
    () => publishCommunityPullRequest({
      log: () => {},
      run(command, args) {
        if (command === 'git' && args[0] === 'status') {
          return ` M ${CANDIDATES_PATH}\n M app.js`
        }
        return ''
      }
    }),
    /out-of-scope community changes/
  )
})
