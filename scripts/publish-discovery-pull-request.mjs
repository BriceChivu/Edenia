import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const BASE_BRANCH = 'master'
const AUTOMATION_BRANCH = 'automation/discover-language-channels'
const CATALOG_PATH = 'data/channel-catalog.discovered.json'
const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'

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
    return capture ? String(result.stdout || '').trimEnd() : ''
  }
}

export function publishDiscoveryPullRequest(options = {}) {
  const run = options.run || createSystemCommandRunner(options.cwd)
  const log = options.log || console.log
  const changedPaths = run(
    'git',
    ['status', '--porcelain=v1'],
    { capture: true }
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(3))
  if (!changedPaths.length) {
    log('Discovery catalog is already current; no pull request update is needed.')
    return { changed: false, pullRequest: '' }
  }
  if (changedPaths.some(path => path !== CATALOG_PATH)) {
    throw new Error(
      `Refusing to publish out-of-scope discovery changes: ${changedPaths.join(', ')}`
    )
  }

  const remoteLine = run(
    'git',
    ['ls-remote', '--heads', 'origin', `refs/heads/${AUTOMATION_BRANCH}`],
    { capture: true }
  )
  const remoteSha = remoteLine.split(/\s+/)[0] || ''
  run('git', ['config', 'user.name', BOT_NAME])
  run('git', ['config', 'user.email', BOT_EMAIL])
  run('git', ['switch', '-C', AUTOMATION_BRANCH])
  run('git', ['add', '--', CATALOG_PATH])
  const stagedPaths = run(
    'git',
    ['diff', '--cached', '--name-only'],
    { capture: true }
  ).split(/\r?\n/).filter(Boolean)
  if (stagedPaths.length !== 1 || stagedPaths[0] !== CATALOG_PATH) {
    throw new Error('Refusing to publish an empty or out-of-scope discovery commit.')
  }
  run('git', ['commit', '-m', 'Discover language-learning channels'])

  const pushArgs = ['push']
  if (remoteSha) {
    pushArgs.push(
      `--force-with-lease=refs/heads/${AUTOMATION_BRANCH}:${remoteSha}`
    )
  }
  pushArgs.push('origin', `HEAD:refs/heads/${AUTOMATION_BRANCH}`)
  run('git', pushArgs)

  let pullRequest = run(
    'gh',
    [
      'pr',
      'list',
      '--base',
      BASE_BRANCH,
      '--head',
      AUTOMATION_BRANCH,
      '--state',
      'open',
      '--json',
      'url',
      '--jq',
      '.[0].url'
    ],
    { capture: true }
  )
  if (!pullRequest) {
    pullRequest = run(
      'gh',
      [
        'pr',
        'create',
        '--base',
        BASE_BRANCH,
        '--head',
        AUTOMATION_BRANCH,
        '--title',
        'Discover language-learning channels',
        '--body',
        [
          'Automated daily language-channel discovery.',
          '',
          'This pull request is restricted to the generated discovery catalog and will merge only after the required catalog safety checks pass.',
          '',
          'If a guardrail fails, this pull request remains open for maintainer attention.'
        ].join('\n')
      ],
      { capture: true }
    )
  }
  log(`Discovery pull request is waiting for checked auto-merge: ${pullRequest}`)
  return { changed: true, pullRequest }
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Discovery pull requests may only be published from GitHub Actions.')
    }
    if (!String(process.env.GH_TOKEN || '').trim()) {
      throw new Error('GH_TOKEN is required to publish the discovery pull request.')
    }
    publishDiscoveryPullRequest()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
