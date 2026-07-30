import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getMaintenanceCompareUrl,
  normalizeMaintenanceBranchSpec,
  publishMaintenanceBranch
} from '../../scripts/publish-maintenance-branch.mjs'

function maintenanceSpec(overrides = {}) {
  return {
    baseBranch: 'master',
    branch: 'automation/refresh-channel-catalog-12345-1',
    commitMessage: 'Refresh channel catalog metadata',
    paths: ['data/channel-catalog.json'],
    repository: 'BriceChivu/Edenia',
    ...overrides
  }
}

test('maintenance branch publisher rejects unsafe paths and exits cleanly when current', () => {
  assert.throws(
    () => normalizeMaintenanceBranchSpec(maintenanceSpec({ paths: ['../config.local.js'] })),
    /explicit repository-relative file/
  )

  const commands = []
  const result = publishMaintenanceBranch(maintenanceSpec(), {
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      return ''
    }
  })

  assert.deepEqual(result, { branch: '', changed: false, compareUrl: '' })
  assert.deepEqual(commands, [
    ['git', ['status', '--porcelain=v1', '--', 'data/channel-catalog.json']]
  ])
})

test('maintenance branch publisher commits only allowlisted files and pushes a new branch', () => {
  const commands = []
  const spec = maintenanceSpec()
  const result = publishMaintenanceBranch(spec, {
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      if (command === 'git' && args[0] === 'status') return ' M data/channel-catalog.json'
      if (command === 'git' && args[0] === 'diff') return 'data/channel-catalog.json'
      return ''
    }
  })

  assert.deepEqual(result, {
    branch: spec.branch,
    changed: true,
    compareUrl: getMaintenanceCompareUrl(spec)
  })
  assert.ok(commands.some(([command, args]) => (
    command === 'git'
    && args[0] === 'add'
    && args.at(-1) === 'data/channel-catalog.json'
  )))
  assert.ok(commands.some(([command, args]) => (
    command === 'git'
    && args[0] === 'push'
    && args.at(-1) === `HEAD:refs/heads/${spec.branch}`
  )))
  assert.equal(commands.some(([command]) => command === 'gh'), false)
})

test('maintenance branch publisher refuses an unrelated staged file', () => {
  const commands = []
  assert.throws(
    () => publishMaintenanceBranch(maintenanceSpec(), {
      log: () => {},
      run(command, args) {
        commands.push([command, args])
        if (command === 'git' && args[0] === 'status') return ' M data/channel-catalog.json'
        if (command === 'git' && args[0] === 'diff') {
          return 'config.local.js\ndata/channel-catalog.json'
        }
        return ''
      }
    }),
    /out-of-scope maintenance commit/
  )
  assert.equal(commands.some(([command, args]) => (
    command === 'git' && args[0] === 'commit'
  )), false)
  assert.equal(commands.some(([command, args]) => (
    command === 'git' && args[0] === 'push'
  )), false)
})
