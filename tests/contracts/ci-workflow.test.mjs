import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
    /steps\.scope\.outputs\.supabase == 'true'/
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
