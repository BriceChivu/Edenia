import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeCheckedDiscoveryPullRequest
} from '../../scripts/merge-checked-discovery-pull-request.mjs'

const REPOSITORY = 'BriceChivu/Edenia'
const HEAD_SHA = '1234567890abcdef1234567890abcdef12345678'

function mergeSpec(overrides = {}) {
  return {
    repository: REPOSITORY,
    pullRequestNumber: '123',
    checkedHeadSha: HEAD_SHA,
    conclusion: 'success',
    ...overrides
  }
}

function pullRequest(overrides = {}) {
  return {
    state: 'open',
    draft: false,
    base: { ref: 'master' },
    head: {
      ref: 'automation/discover-language-channels',
      sha: HEAD_SHA,
      repo: { full_name: REPOSITORY }
    },
    ...overrides
  }
}

test('checked discovery merger merges only the exact CI-tested catalog revision', () => {
  const commands = []
  const result = mergeCheckedDiscoveryPullRequest(mergeSpec(), {
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      if (command === 'gh' && args[0] === 'api' && !args.includes('--paginate')) {
        return JSON.stringify(pullRequest())
      }
      if (command === 'gh' && args[0] === 'api' && args.includes('--paginate')) {
        return 'data/channel-catalog.discovered.json'
      }
      return ''
    }
  })

  assert.deepEqual(result, {
    merged: true,
    pullRequestNumber: 123,
    headSha: HEAD_SHA
  })
  assert.ok(commands.some(([command, args]) => (
    command === 'gh'
    && args[0] === 'pr'
    && args[1] === 'merge'
    && args.includes('--match-head-commit')
    && args.includes(HEAD_SHA)
  )))
})

test('checked discovery merger rejects stale CI and unrelated pull requests', () => {
  assert.throws(
    () => mergeCheckedDiscoveryPullRequest(mergeSpec({ conclusion: 'failure' })),
    /only after successful CI/
  )
  assert.throws(
    () => mergeCheckedDiscoveryPullRequest(mergeSpec(), {
      log: () => {},
      run() {
        return JSON.stringify(pullRequest({
          head: {
            ref: 'feature/not-catalog-automation',
            sha: HEAD_SHA,
            repo: { full_name: REPOSITORY }
          }
        }))
      }
    }),
    /outside the discovery automation boundary/
  )
  assert.throws(
    () => mergeCheckedDiscoveryPullRequest(mergeSpec(), {
      log: () => {},
      run() {
        return JSON.stringify(pullRequest({
          head: {
            ref: 'automation/discover-language-channels',
            sha: 'abcdef1234567890abcdef1234567890abcdef12',
            repo: { full_name: REPOSITORY }
          }
        }))
      }
    }),
    /changed after CI/
  )
})

test('checked discovery merger rejects any additional changed path', () => {
  assert.throws(
    () => mergeCheckedDiscoveryPullRequest(mergeSpec(), {
      log: () => {},
      run(command, args) {
        if (command === 'gh' && args[0] === 'api' && !args.includes('--paginate')) {
          return JSON.stringify(pullRequest())
        }
        return 'data/channel-catalog.discovered.json\napp.js'
      }
    }),
    /out-of-scope files/
  )
})
