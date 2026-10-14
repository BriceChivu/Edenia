import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { selectCiScope, DATA_SMOKE } from '../../scripts/ci-scope.mjs'

const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')

test('isolated feed CSS selects feature acceptance and data smoke without game acceptance', () => {
  const scope = selectCiScope(['src/styles/70-video-feed.css'])
  assert.equal(scope.browser, true)
  assert.equal(scope.game, false)
  assert.ok(scope.browser_files.includes('large-video-library.spec.mjs'))
  for (const name of DATA_SMOKE) assert.ok(scope.browser_files.includes(`${name}.spec.mjs`))
})

test('learner-data and unknown shared changes retain browser and real game acceptance', () => {
  for (const file of ['src/state/store.js', 'src/state/portable-state.js', 'src/integrations/learner-profile-cloud-persistence.js',
    'src/domain/portable-profile-combination.js', 'src/app.js', 'src/new-shared-module.js',
    'godot/tiny-swords/scripts/terrain.gd', 'scripts/tiny-swords-xp-parent.js', 'tests/support/network-fixture.mjs']) {
    const scope = selectCiScope([file])
    assert.equal(scope.browser, true, file)
    assert.equal(scope.game, true, file)
    assert.deepEqual(scope.browser_files, [], file)
  }
})

test('all migrations and SQL tests, including new names and config, select database security', () => {
  for (const file of ['supabase/migrations/20990101000000_unrecognized.sql', 'supabase/tests/new_policy.test.sql', 'supabase/config.toml']) {
    const scope = selectCiScope([file])
    assert.equal(scope.supabase, true, file)
    assert.equal(scope.supabase_db, true, file)
    assert.equal(scope.game, true, file)
  }
  for (const suite of ['learner_profile_conflict_resolution', 'learner_profile_recovery', 'learner_profile_start_over']) {
    assert.ok(workflow.includes(`supabase test db supabase/tests/${suite}.test.sql --local`))
  }
})

test('scope unions paths without a narrow UI path hiding shared data changes', () => {
  const scope = selectCiScope(['src/styles/70-video-feed.css', 'src/state/backups.js'])
  assert.equal(scope.game, true)
  assert.equal(scope.supabase_db, true)
  assert.deepEqual(scope.browser_files, [])
})

test('docs and catalog-only changes avoid builds; full regression retains all coverage', () => {
  assert.equal(selectCiScope(['docs/example.md']).build, false)
  const catalog = selectCiScope(['data/channel-catalog.community.json'])
  assert.equal(catalog.community_catalog, true)
  assert.equal(catalog.build, false)
  const full = selectCiScope([], { full: true })
  for (const key of ['contracts', 'browser', 'game', 'build', 'supabase_db', 'full_matrix']) assert.equal(full[key], true)
  assert.deepEqual(full.browser_files, [])
})

test('CI infrastructure changes exercise every required safety suite', () => {
  for (const file of ['.github/workflows/ci.yml', 'scripts/ci-scope.mjs', 'scripts/build-ci-sites.mjs', 'playwright.config.mjs', 'package-lock.json']) {
    const scope = selectCiScope([file])
    for (const key of ['contracts', 'browser', 'game', 'supabase', 'supabase_db']) assert.equal(scope[key], true, `${file}: ${key}`)
  }
})

// Execute the exact required-check shell. Skipped/failed selected dependencies
// must never become green merely because the other jobs succeeded.
test('verify rejects failed/cancelled/skipped selected suites and malformed scope', () => {
  const marker = '      - name: Require all selected suites to pass\n'
  const script = workflow.slice(workflow.indexOf(marker)).split('        run: |\n')[1]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n')
  const good = { ...process.env, SCOPE_RESULT: 'success', CHECKS_RESULT: 'success',
    BUILD_REQUIRED: 'true', BUILD_RESULT: 'success', BROWSER_REQUIRED: 'true', BROWSER_RESULT: 'success',
    GAME_REQUIRED: 'true', GAME_RESULT: 'success' }
  const run = env => spawnSync('bash', ['-c', script], { env, encoding: 'utf8' }).status
  assert.equal(run(good), 0)
  for (const key of ['SCOPE_RESULT', 'CHECKS_RESULT', 'BUILD_RESULT', 'BROWSER_RESULT', 'GAME_RESULT']) {
    for (const result of ['failure', 'cancelled', 'skipped', '']) assert.notEqual(run({ ...good, [key]: result }), 0, `${key}: ${result}`)
  }
  for (const lane of ['BUILD', 'BROWSER', 'GAME']) {
    assert.equal(run({ ...good, [`${lane}_REQUIRED`]: 'false', [`${lane}_RESULT`]: 'skipped' }), 0)
    for (const result of ['success', 'failure', 'cancelled']) assert.notEqual(run({ ...good, [`${lane}_REQUIRED`]: 'false', [`${lane}_RESULT`]: result }), 0)
    assert.notEqual(run({ ...good, [`${lane}_REQUIRED`]: '' }), 0)
  }
})

test('browser consumers download shared builds and game lanes run independently', () => {
  const consumers = workflow.slice(workflow.indexOf('\n  browser:\n'))
  assert.doesNotMatch(consumers, /run: npm run build|setup-godot/)
  for (const lane of ['chromium', 'webkit', 'public']) assert.ok(consumers.includes(`lane: ${lane}`))
  assert.match(workflow, /needs: \[scope, build, checks, browser, tiny-swords\]/)
  assert.ok(workflow.indexOf('run: npm ci') < workflow.indexOf('run: npm run test:supabase'))
})
