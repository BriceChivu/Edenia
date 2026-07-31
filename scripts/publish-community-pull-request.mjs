import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { buildCommunityCatalogPullRequestBody } from './community-catalog-pr-report.mjs'

const BASE_BRANCH = 'master'
const AUTOMATION_BRANCH = 'automation/import-community-channel-catalog'
const CANDIDATES_PATH = 'data/channel-catalog.candidates.json'
const COMMUNITY_PATH = 'data/channel-catalog.community.json'
const ALLOWED_PATHS = new Set([CANDIDATES_PATH, COMMUNITY_PATH])
const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function parseJson(value, label) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    throw new Error(`${label} must contain valid JSON.`)
  }
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
    return capture ? String(result.stdout || '').trimEnd() : ''
  }
}

export function publishCommunityPullRequest(options = {}) {
  const run = options.run || createSystemCommandRunner(options.cwd)
  const log = options.log || console.log
  const readText = options.readText || (path => readFileSync(path, 'utf8'))
  const writeText = options.writeText || ((path, value) => writeFileSync(path, value, 'utf8'))
  const environment = options.environment || process.env
  const changedPaths = run(
    'git',
    ['status', '--porcelain=v1'],
    { capture: true }
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(3))
  if (!changedPaths.length) {
    log('Community catalogs are already current; no pull request update is needed.')
    return { changed: false, pullRequest: '' }
  }
  if (changedPaths.some(path => !ALLOWED_PATHS.has(path))) {
    throw new Error(
      `Refusing to publish out-of-scope community changes: ${changedPaths.join(', ')}`
    )
  }

  const reportPath = requiredText(
    options.reportPath || environment.COMMUNITY_CATALOG_REPORT_PATH,
    'Community catalog report path'
  )
  const importReport = parseJson(readText(reportPath), 'Community catalog report')
  const baseSha = run('git', ['rev-parse', 'HEAD'], { capture: true })
  const remoteLine = run(
    'git',
    ['ls-remote', '--heads', 'origin', `refs/heads/${AUTOMATION_BRANCH}`],
    { capture: true }
  )
  const remoteSha = remoteLine.split(/\s+/)[0] || ''
  run('git', ['config', 'user.name', BOT_NAME])
  run('git', ['config', 'user.email', BOT_EMAIL])
  run('git', ['switch', '-C', AUTOMATION_BRANCH])
  run('git', ['add', '--', CANDIDATES_PATH, COMMUNITY_PATH])
  const stagedPaths = run(
    'git',
    ['diff', '--cached', '--name-only'],
    { capture: true }
  ).split(/\r?\n/).filter(Boolean)
  if (
    !stagedPaths.length
    || stagedPaths.some(path => !ALLOWED_PATHS.has(path))
  ) {
    throw new Error('Refusing to publish an empty or out-of-scope community commit.')
  }
  run('git', ['commit', '-m', 'Import community channel catalog'])
  const headSha = run('git', ['rev-parse', 'HEAD'], { capture: true })

  const baseCandidates = parseJson(
    run('git', ['show', `${baseSha}:${CANDIDATES_PATH}`], { capture: true }),
    'Base candidate catalog'
  )
  const baseCommunity = parseJson(
    run('git', ['show', `${baseSha}:${COMMUNITY_PATH}`], { capture: true }),
    'Base community catalog'
  )
  const currentCandidates = parseJson(
    readText(resolve(options.cwd || process.cwd(), CANDIDATES_PATH)),
    'Current candidate catalog'
  )
  const currentCommunity = parseJson(
    readText(resolve(options.cwd || process.cwd(), COMMUNITY_PATH)),
    'Current community catalog'
  )
  const body = buildCommunityCatalogPullRequestBody({
    baseCandidates,
    baseCommunity,
    baseSha,
    currentCandidates,
    currentCommunity,
    headSha,
    importReport
  })
  const bodyPath = options.bodyPath || resolve(
    environment.RUNNER_TEMP || options.cwd || process.cwd(),
    'community-catalog-pull-request.md'
  )
  writeText(bodyPath, `${body}\n`)

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
  if (pullRequest) {
    // Put the report in place before the synchronizing push can trigger CI and auto-merge.
    run('gh', ['pr', 'edit', pullRequest, '--body-file', bodyPath])
  }

  const pushArgs = ['push']
  if (remoteSha) {
    pushArgs.push(
      `--force-with-lease=refs/heads/${AUTOMATION_BRANCH}:${remoteSha}`
    )
  }
  pushArgs.push('origin', `HEAD:refs/heads/${AUTOMATION_BRANCH}`)
  run('git', pushArgs)

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
        'Import community channel catalog',
        '--body-file',
        bodyPath
      ],
      { capture: true }
    )
  }
  log(`Community catalog pull request is waiting for checked auto-merge: ${pullRequest}`)
  return {
    baseSha,
    body,
    changed: true,
    headSha,
    pullRequest
  }
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Community catalog pull requests may only be published from GitHub Actions.')
    }
    if (!String(process.env.GH_TOKEN || '').trim()) {
      throw new Error('GH_TOKEN is required to publish the community catalog pull request.')
    }
    publishCommunityPullRequest()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
