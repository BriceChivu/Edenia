import { spawnSync } from 'node:child_process'

const POLICIES = Object.freeze({
  community: {
    automationBranch: 'automation/import-community-channel-catalog',
    label: 'community catalog',
    requireAllPaths: false,
    paths: [
      'data/channel-catalog.candidates.json',
      'data/channel-catalog.community.json'
    ]
  },
  discovery: {
    automationBranch: 'automation/discover-language-channels',
    label: 'discovery catalog',
    requireAllPaths: true,
    paths: ['data/channel-catalog.discovered.json']
  }
})
const BASE_BRANCH = 'master'

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function requiredSha(value, label) {
  const sha = requiredText(value, label)
  if (!/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error(`${label} must be a full Git commit SHA.`)
  }
  return sha
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

export function mergeCheckedCatalogPullRequest(spec, options = {}) {
  const kind = requiredText(spec?.kind, 'Catalog automation kind')
  const policy = POLICIES[kind]
  if (!policy) throw new Error(`Unsupported catalog automation kind: ${kind}.`)
  const repository = requiredText(spec?.repository, 'Repository')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error('Repository must use owner/name format.')
  }
  const pullRequestNumber = requiredText(spec?.pullRequestNumber, 'Pull request number')
  if (!/^\d+$/.test(pullRequestNumber)) {
    throw new Error('Pull request number must be numeric.')
  }
  const checkedHeadSha = requiredSha(spec?.checkedHeadSha, 'Checked head SHA')
  const checkedBaseSha = requiredSha(spec?.checkedBaseSha, 'Checked base SHA')
  if (spec?.conclusion !== 'success') {
    throw new Error(`The ${policy.label} pull request may merge only after successful CI.`)
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
    || pullRequest.head?.ref !== policy.automationBranch
    || pullRequest.head?.repo?.full_name !== repository
  ) {
    throw new Error(
      `Refusing to merge a pull request outside the ${policy.label} automation boundary.`
    )
  }
  if (pullRequest.head?.sha !== checkedHeadSha) {
    throw new Error('Refusing to merge because the pull request changed after CI completed.')
  }
  if (pullRequest.base?.sha !== checkedBaseSha) {
    throw new Error('Refusing to merge because the pull request base changed after CI started.')
  }
  const currentBaseSha = run(
    'gh',
    [
      'api',
      `repos/${repository}/git/ref/heads/${BASE_BRANCH}`,
      '--jq',
      '.object.sha'
    ],
    { capture: true }
  )
  if (currentBaseSha !== checkedBaseSha) {
    throw new Error('Refusing to merge because master moved after CI started.')
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
  ).split(/\r?\n/).filter(Boolean).sort()
  const expectedPaths = [...policy.paths].sort()
  if (
    !changedFiles.length
    || changedFiles.some(path => !expectedPaths.includes(path))
    || (policy.requireAllPaths && changedFiles.length !== expectedPaths.length)
  ) {
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
  log(`Merged checked ${policy.label} pull request #${pullRequestNumber}.`)
  return {
    baseSha: checkedBaseSha,
    headSha: checkedHeadSha,
    kind,
    merged: true,
    pullRequestNumber: Number(pullRequestNumber)
  }
}
