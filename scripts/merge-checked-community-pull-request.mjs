import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createSystemCommandRunner,
  mergeCheckedCatalogPullRequest
} from './merge-checked-catalog-pull-request.mjs'

export { createSystemCommandRunner }

export function mergeCheckedCommunityPullRequest(spec, options = {}) {
  return mergeCheckedCatalogPullRequest({
    ...spec,
    kind: 'community'
  }, options)
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Community catalog pull requests may only be merged from GitHub Actions.')
    }
    if (!String(process.env.GH_TOKEN || '').trim()) {
      throw new Error('GH_TOKEN is required to merge the community catalog pull request.')
    }
    mergeCheckedCommunityPullRequest({
      repository: process.env.GITHUB_REPOSITORY,
      pullRequestNumber: process.env.COMMUNITY_PR_NUMBER,
      checkedBaseSha: process.env.COMMUNITY_PR_BASE_SHA,
      checkedHeadSha: process.env.COMMUNITY_PR_HEAD_SHA,
      conclusion: process.env.COMMUNITY_CI_CONCLUSION
    })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
