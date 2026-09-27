import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const workflow = await readFile(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8'
)

function readStep(name) {
  const marker = `      - name: ${name}\n`
  const start = workflow.indexOf(marker)
  assert.notEqual(start, -1, `missing CI step: ${name}`)
  const next = workflow.indexOf('\n      - name: ', start + marker.length)
  return workflow.slice(start, next === -1 ? undefined : next)
}

function readCaseArmContaining(step, marker) {
  const start = step.indexOf(marker)
  assert.notEqual(start, -1, `missing CI case marker: ${marker}`)
  const end = step.indexOf('\n                  ;;', start)
  assert.notEqual(end, -1, `unterminated CI case marker: ${marker}`)
  return step.slice(start, end)
}

test('Supabase backend CI installs Node dependencies before running its tests', () => {
  const installStep = readStep('Install dependencies')
  const backendTestStep = readStep('Run Supabase backend tests')

  assert.match(installStep, /run: npm ci/)
  assert.match(
    installStep,
    /needs\.scope\.outputs\.supabase == 'true'/
  )
  assert.ok(workflow.indexOf(installStep) < workflow.indexOf(backendTestStep))
})

test('divergent profile database changes run their pgTAP acceptance suite', () => {
  const scopeStep = readStep('Determine test scope')
  const databaseStep = readStep('Verify database safety')
  const databaseChanges = [
    '.github/workflows/ci.yml',
    'supabase/migrations/*_resolve_divergent_learner_profiles.sql',
    'supabase/migrations/*_choose_divergent_learner_profile.sql',
    'supabase/tests/learner_profile_conflict_resolution.test.sql'
  ]

  for (const change of databaseChanges) {
    assert.match(readCaseArmContaining(scopeStep, change), /run_supabase_db=true/)
  }
  assert.match(
    databaseStep,
    /^          supabase test db supabase\/tests\/learner_profile_conflict_resolution\.test\.sql --local$/m
  )
})

test('trusted predecessor recovery database changes run their pgTAP acceptance suite', () => {
  const scopeStep = readStep('Determine test scope')
  const databaseStep = readStep('Verify database safety')
  const databaseChanges = [
    'supabase/migrations/*_automatic_trusted_predecessor_recovery.sql',
    'supabase/tests/learner_profile_recovery.test.sql'
  ]

  for (const change of databaseChanges) {
    const scopeArm = readCaseArmContaining(scopeStep, change)
    assert.match(scopeArm, /run_supabase=true/)
    assert.match(scopeArm, /run_supabase_db=true/)
  }
  assert.match(
    databaseStep,
    /^          supabase test db supabase\/tests\/learner_profile_recovery\.test\.sql --local$/m
  )
})

test('Start over database changes run their pgTAP acceptance suite', () => {
  const scopeStep = readStep('Determine test scope')
  const databaseStep = readStep('Verify database safety')
  const databaseChanges = [
    'supabase/migrations/*_start_over_learner_profile.sql',
    'supabase/tests/learner_profile_start_over.test.sql'
  ]

  for (const change of databaseChanges) {
    const scopeArm = readCaseArmContaining(scopeStep, change)
    assert.match(scopeArm, /run_supabase=true/)
    assert.match(scopeArm, /run_supabase_db=true/)
  }
  assert.match(
    databaseStep,
    /^          supabase test db supabase\/tests\/learner_profile_start_over\.test\.sql --local$/m
  )
})

// Execute the actual required-check shell so skipped or failed dependencies
// cannot accidentally turn a protected branch's CI check green.
test('verify accepts only successful selected suites', () => {
  const step = readStep('Require all selected suites to pass')
  const script = step.split('        run: |\n')[1]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n')
  for (const scope of ['success', 'failure', 'cancelled', 'skipped']) {
    for (const checks of ['success', 'failure', 'cancelled', 'skipped']) {
      for (const required of ['true', 'false', '']) {
        for (const browser of ['success', 'failure', 'cancelled', 'skipped']) {
          const result = spawnSync('bash', ['-c', script], {
            env: {
              ...process.env,
              SCOPE_RESULT: scope,
              CHECKS_RESULT: checks,
              BROWSER_REQUIRED: required,
              BROWSER_RESULT: browser,
              PIXEL_TOWN_RESULT: browser
            },
            encoding: 'utf8'
          })
          const shouldPass = scope === 'success' && checks === 'success' && (
            (required === 'true' && browser === 'success') ||
            (required === 'false' && browser === 'skipped')
          )
          assert.equal(result.status === 0, shouldPass,
            JSON.stringify({ scope, checks, required, browser }))
        }
      }
    }
  }
})

test('workflow changes exercise browser shards and verify waits for their aggregate result', () => {
  assert.match(readCaseArmContaining(readStep('Determine test scope'),
    '.github/workflows/ci.yml'), /run_browser=true/)
  assert.match(workflow, /  browser:\n    needs: scope\n    if: needs\.scope\.outputs\.browser == 'true'/)
  assert.match(workflow, /fail-fast: false\n      matrix:\n        shard: \[1, 2, 3, 4\]/)
  assert.match(readStep('Run browser tests'), /--shard=\$\{\{ matrix\.shard \}\}\/4/)
  assert.match(workflow, /  verify:\n    needs: \[scope, checks, browser, pixel-town\]\n    if: \$\{\{ always\(\) \}\}/)
  assert.match(readStep('Require all selected suites to pass'),
    /BROWSER_RESULT: \$\{\{ needs\.browser\.result \}\}/)
})


test('required pixel-town failures cannot pass the aggregate check', () => {
  const script = readStep('Require all selected suites to pass').split('        run: |\n')[1]
    .split('\n').map(line => line.replace(/^          /, '')).join('\n')
  for(const town of ['success','failure','cancelled','skipped']) {
    const result=spawnSync('bash',['-c',script],{env:{...process.env,SCOPE_RESULT:'success',CHECKS_RESULT:'success',BROWSER_REQUIRED:'true',BROWSER_RESULT:'success',PIXEL_TOWN_RESULT:town}})
    assert.equal(result.status===0,town==='success')
  }
})
