import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const BASE_BRANCH = 'master'
const AUTOMATION_BRANCH = 'automation/discover-language-channels'
const CATALOG_PATH = 'data/channel-catalog.discovered.json'

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

export function createSystemCommandRunner(cwd = process.cwd()) {
  return (command, args, options = {}) => {
    const capture = options.capture === true
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`${command} failed with exit code ${result.status}.`)
    }
    return capture ? String(result.stdout || '').trim() : ''
  }
}

export function mergeCheckedDiscoveryPullRequest(spec, options = {}) {
  const repository = requiredText(spec?.repository, 'Repository')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error('Repository must use owner/name format.')
  }
  const pullRequestNumber = requiredText(spec?.pullRequestNumber, 'Pull request number')
  if (!/^\d+$/.test(pullRequestNumber)) {
    throw new Error('Pull request number must be numeric.')
  }
  const checkedHeadSha = requiredText(spec?.checkedHeadSha, 'Checked head SHA')
  if (!/^[a-f0-9]{40}$/i.test(checkedHeadSha)) {
    throw new Error('Checked head SHA must be a full Git commit SHA.')
  }
  if (spec?.conclusion !== 'success') {
    throw new Error('The discovery pull request may merge only after successful CI.')
  }

  const run = options.run || createSystemCommandRunner(options.cwd)
  const log = options.log || console.log
  const pullRequest = JSON.parse(run(
    'gh',
    ['api', `repos/${repository}/pulls/${pullRequestNumber}`],
    { capture: true }
  ))
  if (
    pullRequest.state !== 'open'
    || pullRequest.draft === true
    || pullRequest.base?.ref !== BASE_BRANCH
    || pullRequest.head?.ref !== AUTOMATION_BRANCH
    || pullRequest.head?.repo?.full_name !== repository
  ) {
    throw new Error('Refusing to merge a pull request outside the discovery automation boundary.')
  }
  if (pullRequest.head?.sha !== checkedHeadSha) {
    throw new Error('Refusing to merge because the pull request changed after CI completed.')
  }

  const changedFiles = run(
    'gh',
    [
      'api',
      '--paginate',
      `repos/${repository}/pulls/${pullRequestNumber}/files`,
      '--jq',
      '.[].filename'
    ],
    { capture: true }
  ).split(/\r?\n/).filter(Boolean)
  if (changedFiles.length !== 1 || changedFiles[0] !== CATALOG_PATH) {
    throw new Error(
      `Refusing to merge out-of-scope files: ${changedFiles.join(', ') || 'no files'}`
    )
  }

  run('gh', [
    'pr',
    'merge',
    pullRequestNumber,
    '--repo',
    repository,
    '--squash',
    '--delete-branch',
    '--match-head-commit',
    checkedHeadSha
  ])
  log(`Merged checked discovery pull request #${pullRequestNumber}.`)
  return {
    merged: true,
    pullRequestNumber: Number(pullRequestNumber),
    headSha: checkedHeadSha
  }
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Discovery pull requests may only be merged from GitHub Actions.')
    }
    if (!String(process.env.GH_TOKEN || '').trim()) {
      throw new Error('GH_TOKEN is required to merge the discovery pull request.')
    }
    mergeCheckedDiscoveryPullRequest({
      repository: process.env.GITHUB_REPOSITORY,
      pullRequestNumber: process.env.DISCOVERY_PR_NUMBER,
      checkedHeadSha: process.env.DISCOVERY_PR_HEAD_SHA,
      conclusion: process.env.DISCOVERY_CI_CONCLUSION
    })
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
