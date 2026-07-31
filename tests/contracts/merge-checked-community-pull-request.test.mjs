import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeCheckedCommunityPullRequest
} from '../../scripts/merge-checked-community-pull-request.mjs'

const REPOSITORY = 'BriceChivu/Edenia'
const HEAD_SHA = '1234567890abcdef1234567890abcdef12345678'
const BASE_SHA = 'abcdef1234567890abcdef1234567890abcdef12'

function mergeSpec(overrides = {}) {
  return {
    repository: REPOSITORY,
    pullRequestNumber: '321',
    checkedBaseSha: BASE_SHA,
    checkedHeadSha: HEAD_SHA,
    conclusion: 'success',
    ...overrides
  }
}

function pullRequest(overrides = {}) {
  return {
    state: 'open',
    draft: false,
    base: { ref: 'master', sha: BASE_SHA },
    head: {
      ref: 'automation/import-community-channel-catalog',
      sha: HEAD_SHA,
      repo: { full_name: REPOSITORY }
    },
    ...overrides
  }
}

test('checked community merger accepts only both generated catalog files at the tested revisions', () => {
  const commands = []
  const result = mergeCheckedCommunityPullRequest(mergeSpec(), {
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      if (command === 'gh' && args[1] === `repos/${REPOSITORY}/pulls/321`) {
        return JSON.stringify(pullRequest())
      }
      if (command === 'gh' && args[1].includes('/git/ref/heads/')) return BASE_SHA
      if (command === 'gh' && args.includes('--paginate')) {
        return [
          'data/channel-catalog.community.json',
          'data/channel-catalog.candidates.json'
        ].join('\n')
      }
      return ''
    }
  })

  assert.deepEqual(result, {
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    kind: 'community',
    merged: true,
    pullRequestNumber: 321
  })
  assert.ok(commands.some(([command, args]) => (
    command === 'gh'
    && args[0] === 'pr'
    && args[1] === 'merge'
    && args.includes('--match-head-commit')
    && args.includes(HEAD_SHA)
  )))
})

test('checked community merger accepts one generated file but rejects extra or stale boundaries', () => {
  const oneFile = mergeCheckedCommunityPullRequest(mergeSpec(), {
    log: () => {},
    run(command, args) {
      if (command === 'gh' && args[1] === `repos/${REPOSITORY}/pulls/321`) {
        return JSON.stringify(pullRequest())
      }
      if (command === 'gh' && args[1].includes('/git/ref/heads/')) return BASE_SHA
      if (command === 'gh' && args.includes('--paginate')) {
        return 'data/channel-catalog.candidates.json'
      }
      return ''
    }
  })
  assert.equal(oneFile.merged, true)

  assert.throws(
    () => mergeCheckedCommunityPullRequest(mergeSpec(), {
      log: () => {},
      run(command, args) {
        if (command === 'gh' && args[1] === `repos/${REPOSITORY}/pulls/321`) {
          return JSON.stringify(pullRequest())
        }
        if (command === 'gh' && args[1].includes('/git/ref/heads/')) return BASE_SHA
        return 'data/channel-catalog.candidates.json\ndata/channel-catalog.community.json\napp.js'
      }
    }),
    /out-of-scope files/
  )

  assert.throws(
    () => mergeCheckedCommunityPullRequest(mergeSpec(), {
      log: () => {},
      run(command, args) {
        if (command === 'gh' && args[1] === `repos/${REPOSITORY}/pulls/321`) {
          return JSON.stringify(pullRequest({
            base: {
              ref: 'master',
              sha: 'fedcba1234567890fedcba1234567890fedcba12'
            }
          }))
        }
        return BASE_SHA
      }
    }),
    /base changed after CI/
  )
})
