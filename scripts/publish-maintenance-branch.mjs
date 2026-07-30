import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'

function requiredText(value, label) {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function validateBranchName(value, label) {
  const branch = requiredText(value, label)
  if (
    !/^[a-z0-9][a-z0-9._/-]*$/i.test(branch)
    || branch.includes('..')
    || branch.endsWith('/')
  ) {
    throw new Error(`${label} is invalid: ${branch}`)
  }
  return branch
}

function validateMaintenancePath(value) {
  const path = requiredText(value, 'Maintenance path')
  const segments = path.split('/')
  if (
    path.startsWith('/')
    || path.includes('\\')
    || /[\n\r*?[\]]/.test(path)
    || segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Maintenance path must be an explicit repository-relative file: ${path}`)
  }
  return path
}

export function normalizeMaintenanceBranchSpec(spec) {
  const paths = Array.from(new Set(
    (Array.isArray(spec?.paths) ? spec.paths : []).map(validateMaintenancePath)
  ))
  if (!paths.length) throw new Error('At least one maintenance path is required.')

  const repository = requiredText(spec?.repository, 'Repository')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error(`Repository must use owner/name format: ${repository}`)
  }

  return {
    baseBranch: validateBranchName(spec?.baseBranch || 'master', 'Base branch'),
    branch: validateBranchName(spec?.branch, 'Automation branch'),
    commitMessage: requiredText(spec?.commitMessage, 'Commit message'),
    paths,
    repository
  }
}

export function parseMaintenanceBranchArgs(argv, environment = process.env) {
  const values = { paths: [] }
  const flagNames = new Map([
    ['--base', 'baseBranch'],
    ['--branch', 'branch'],
    ['--commit-message', 'commitMessage'],
    ['--path', 'paths']
  ])

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const name = flagNames.get(flag)
    const value = argv[index + 1]
    if (!name || value === undefined) {
      throw new Error(`Unknown or incomplete maintenance branch argument: ${flag || '(empty)'}`)
    }
    if (name === 'paths') values.paths.push(value)
    else values[name] = value
  }

  return normalizeMaintenanceBranchSpec({
    ...values,
    repository: environment.GITHUB_REPOSITORY
  })
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

export function getMaintenanceCompareUrl(spec) {
  const normalized = normalizeMaintenanceBranchSpec(spec)
  const [owner, repositoryName] = normalized.repository.split('/')
  const base = encodeURIComponent(normalized.baseBranch)
  const branch = encodeURIComponent(normalized.branch)
  return `https://github.com/${owner}/${repositoryName}/compare/${base}...${branch}?expand=1`
}

export function publishMaintenanceBranch(spec, options = {}) {
  const normalized = normalizeMaintenanceBranchSpec(spec)
  const run = options.run || createSystemCommandRunner(options.cwd)
  const log = options.log || console.log

  const changedPaths = run(
    'git',
    ['status', '--porcelain=v1', '--', ...normalized.paths],
    { capture: true }
  )
  if (!changedPaths) {
    log('Maintenance files are already current; no review branch was created.')
    return { branch: '', changed: false, compareUrl: '' }
  }

  run('git', ['config', 'user.name', BOT_NAME])
  run('git', ['config', 'user.email', BOT_EMAIL])
  run('git', ['switch', '-c', normalized.branch])
  run('git', ['add', '--', ...normalized.paths])

  const stagedPaths = run(
    'git',
    ['diff', '--cached', '--name-only'],
    { capture: true }
  ).split(/\r?\n/).filter(Boolean)
  if (!stagedPaths.length || stagedPaths.some(path => !normalized.paths.includes(path))) {
    throw new Error('Refusing to publish an empty or out-of-scope maintenance commit.')
  }

  run('git', ['commit', '-m', normalized.commitMessage])
  run('git', ['push', 'origin', `HEAD:refs/heads/${normalized.branch}`])

  const compareUrl = getMaintenanceCompareUrl(normalized)
  log(`Maintenance review branch created: ${normalized.branch}`)
  log(`Open a pull request from: ${compareUrl}`)
  return {
    branch: normalized.branch,
    changed: true,
    compareUrl
  }
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Maintenance review branches may only be published from GitHub Actions.')
    }
    const spec = parseMaintenanceBranchArgs(process.argv.slice(2))
    publishMaintenanceBranch(spec)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
