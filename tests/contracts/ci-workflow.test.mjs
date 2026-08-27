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
