import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSystemCommandRunner,
  publishDiscoveryPullRequest
} from '../../scripts/publish-discovery-pull-request.mjs'

const CATALOG_PATH = 'data/channel-catalog.discovered.json'

test('system command runner preserves Git porcelain status prefixes', () => {
  const run = createSystemCommandRunner()
  const output = run(
    process.execPath,
    ['-e', `process.stdout.write(" M ${CATALOG_PATH}\\n")`],
    { capture: true }
  )
  assert.equal(output, ` M ${CATALOG_PATH}`)
})

test('discovery publisher exits cleanly when the catalog is unchanged', () => {
  const commands = []
  const result = publishDiscoveryPullRequest({
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      return ''
    }
  })
  assert.deepEqual(result, { changed: false, pullRequest: '' })
  assert.deepEqual(commands, [['git', ['status', '--porcelain=v1']]])
})

test('discovery publisher updates one stable PR for checked merging', () => {
  const commands = []
  const pullRequest = 'https://github.com/BriceChivu/Edenia/pull/123'
  const result = publishDiscoveryPullRequest({
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      if (command === 'git' && args[0] === 'status') return ` M ${CATALOG_PATH}`
      if (command === 'git' && args[0] === 'ls-remote') {
        return 'abc123\trefs/heads/automation/discover-language-channels'
      }
      if (command === 'git' && args[0] === 'diff') return CATALOG_PATH
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'list') {
        return pullRequest
      }
      return ''
    }
  })

  assert.deepEqual(result, { changed: true, pullRequest })
  assert.ok(commands.some(([command, args]) => (
    command === 'git'
    && args[0] === 'push'
    && args.includes('--force-with-lease=refs/heads/automation/discover-language-channels:abc123')
  )))
  assert.equal(commands.some(([command, args]) => (
    command === 'gh' && args[0] === 'pr' && args[1] === 'merge'
  )), false)
  assert.equal(commands.some(([command, args]) => (
    command === 'gh' && args[0] === 'pr' && args[1] === 'create'
  )), false)
})

test('discovery publisher creates a PR when no stable PR is open', () => {
  const commands = []
  const pullRequest = 'https://github.com/BriceChivu/Edenia/pull/124'
  const result = publishDiscoveryPullRequest({
    log: () => {},
    run(command, args) {
      commands.push([command, args])
      if (command === 'git' && args[0] === 'status') return ` M ${CATALOG_PATH}`
      if (command === 'git' && args[0] === 'diff') return CATALOG_PATH
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
        return pullRequest
      }
      return ''
    }
  })
  assert.deepEqual(result, { changed: true, pullRequest })
  assert.ok(commands.some(([command, args]) => (
    command === 'gh' && args[0] === 'pr' && args[1] === 'create'
  )))
})

test('discovery publisher refuses unrelated working-tree changes', () => {
  assert.throws(
    () => publishDiscoveryPullRequest({
      log: () => {},
      run(command, args) {
        if (command === 'git' && args[0] === 'status') {
          return ` M ${CATALOG_PATH}\n M app.js`
        }
        return ''
      }
    }),
    /out-of-scope discovery changes/
  )
})
