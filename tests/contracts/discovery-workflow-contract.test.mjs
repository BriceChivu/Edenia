import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(
  new URL('../../.github/workflows/discover-language-channels.yml', import.meta.url),
  'utf8'
)
const ciWorkflow = await readFile(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8'
)

test('discovery runs safely after the Pacific quota reset', () => {
  assert.match(workflow, /cron: '29 9 \* \* \*'/)
})

test('discovery validates generic and discovery-specific contracts before publishing', () => {
  const genericValidation = workflow.indexOf('npm run test:catalogs\n')
  const discoveryValidation = workflow.indexOf('npm run test:catalogs:discovery')
  const publisher = workflow.indexOf('node scripts/publish-discovery-pull-request.mjs')

  assert.ok(genericValidation >= 0)
  assert.ok(discoveryValidation > genericValidation)
  assert.ok(publisher > discoveryValidation)
})

test('CI routes discovery pipeline changes through catalog and contract checks', () => {
  const scopeRule = ciWorkflow.match(
    /\.github\/workflows\/discover-language-channels\.yml\|scripts\/discover-language-channels\.mjs\|scripts\/validate-discovered-channel-catalog\.mjs\)[\s\S]*?;;/
  )?.[0] || ''

  assert.match(scopeRule, /run_catalogs=true/)
  assert.match(scopeRule, /run_contracts=true/)
})
