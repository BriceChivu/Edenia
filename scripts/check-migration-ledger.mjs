import { execFileSync } from 'node:child_process'

const LEDGER_PATH = 'migration_changes.md'
const MIGRATION_START_SUBJECT = '^MIG-001:'
const AUTOMATION_COMMITS = new Map([
  ['Refresh channel catalog metadata', new Set(['data/channel-catalog.json'])],
  ['Discover language-learning channels', new Set(['data/channel-catalog.discovered.json'])],
  ['Update community channel catalog', new Set([
    'data/channel-catalog.candidates.json',
    'data/channel-catalog.community.json'
  ])]
])

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? '' : String(process.argv[index + 1] || '').trim()
}

function resolveBaseRevision() {
  const configured = argumentValue('--base')
    || process.env.MIGRATION_BASE_SHA
    || process.env.GITHUB_BASE_SHA
  if (configured && !/^0+$/.test(configured)) return configured

  try {
    return git(['rev-parse', 'HEAD^'])
  } catch {
    throw new Error('A base revision is required when HEAD has no parent')
  }
}

function isAncestor(ancestor, descendant) {
  try {
    git(['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch {
    return false
  }
}

function resolveAuditBaseRevision(baseRevision) {
  const migrationStartOutput = git([
    'log',
    '--reverse',
    '--format=%H',
    `--grep=${MIGRATION_START_SUBJECT}`,
    'HEAD'
  ])
  const migrationStart = migrationStartOutput
    ? migrationStartOutput.split('\n').find(Boolean)
    : ''

  if (!migrationStart || isAncestor(migrationStart, baseRevision)) {
    return {
      auditBaseRevision: baseRevision,
      migrationStart
    }
  }

  if (isAncestor(baseRevision, migrationStart)) {
    return {
      auditBaseRevision: `${migrationStart}^`,
      migrationStart
    }
  }

  throw new Error(
    `Migration start ${migrationStart} and base ${baseRevision} do not share an auditable path`
  )
}

function changedFiles(commit) {
  const output = git([
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '-r',
    '--root',
    commit
  ])
  return output ? output.split('\n').filter(Boolean) : []
}

function isAllowedAutomationCommit(subject, files) {
  const allowedFiles = AUTOMATION_COMMITS.get(subject)
  return Boolean(
    allowedFiles
    && files.length
    && files.every(file => allowedFiles.has(file))
  )
}

function ledgerEntryWasAdded(commit, migrationId) {
  const diff = git(['show', '--format=', '--unified=0', commit, '--', LEDGER_PATH])
  const headingPattern = new RegExp(`^\\+## ${migrationId}(?:\\s|\\b)`, 'm')
  return headingPattern.test(diff)
}

const baseRevision = resolveBaseRevision()
try {
  git(['merge-base', '--is-ancestor', baseRevision, 'HEAD'])
} catch {
  throw new Error(`${baseRevision} is not an ancestor of HEAD`)
}

const {
  auditBaseRevision,
  migrationStart
} = resolveAuditBaseRevision(baseRevision)
const revisionOutput = git([
  'rev-list',
  '--reverse',
  '--no-merges',
  `${auditBaseRevision}..HEAD`
])
const commits = revisionOutput ? revisionOutput.split('\n').filter(Boolean) : []
const violations = []

for (const commit of commits) {
  const subject = git(['show', '-s', '--format=%s', commit])
  const files = changedFiles(commit)

  if (isAllowedAutomationCommit(subject, files)) continue

  const subjectMatch = subject.match(/^(MIG-\d{3}):\s+\S/)
  if (!subjectMatch) {
    violations.push(`${commit.slice(0, 12)}: subject must start with "MIG-###: "`)
    continue
  }

  if (!files.includes(LEDGER_PATH)) {
    violations.push(`${commit.slice(0, 12)}: ${LEDGER_PATH} was not updated`)
    continue
  }

  if (!ledgerEntryWasAdded(commit, subjectMatch[1])) {
    violations.push(
      `${commit.slice(0, 12)}: no added "## ${subjectMatch[1]}" ledger heading`
    )
  }
}

if (violations.length) {
  console.error('Migration governance check failed:')
  violations.forEach(violation => console.error(`- ${violation}`))
  process.exitCode = 1
} else {
  const rangeDescription = auditBaseRevision === baseRevision
    ? 'configured base'
    : `MIG-001 boundary ${migrationStart.slice(0, 12)}`
  console.log(
    `Migration governance check passed for ${commits.length} commit(s) from ${rangeDescription}.`
  )
}
