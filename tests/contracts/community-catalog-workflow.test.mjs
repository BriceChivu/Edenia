import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readRepositoryFile = relativePath =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8')

test('community import uses a stable App-authenticated pull-request publisher', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/import-community-channel-catalog.yml'
  )

  assert.match(workflow, /actions\/create-github-app-token@/)
  assert.match(workflow, /permissions:\s*\n\s+contents: read/)
  assert.match(workflow, /publish-community-pull-request\.mjs/)
  assert.match(workflow, /test:catalogs:community/)
  assert.doesNotMatch(workflow, /publish-maintenance-branch\.mjs/)
  assert.doesNotMatch(workflow, /github\.run_id/)
})

test('community merge workflow verifies the tested PR head, base, and current master', async () => {
  const workflow = await readRepositoryFile(
    '.github/workflows/merge-checked-community-catalog.yml'
  )

  assert.match(workflow, /automation\/import-community-channel-catalog/)
  assert.match(workflow, /workflow_run\.pull_requests\[0\]\.base\.sha/)
  assert.match(workflow, /workflow_run\.pull_requests\[0\]\.head\.sha/)
  assert.match(workflow, /merge-checked-community-pull-request\.mjs/)
})

test('catalog CI invokes the strict community validator for community data changes', async () => {
  const workflow = await readRepositoryFile('.github/workflows/ci.yml')

  assert.match(workflow, /data\/channel-catalog\.candidates\.json/)
  assert.match(workflow, /data\/channel-catalog\.community\.json/)
  assert.match(workflow, /validate-community-channel-catalog\.mjs/)
})

test('shared catalog merger rejects a changed PR head, base, or master', async () => {
  const merger = await readRepositoryFile(
    'scripts/merge-checked-catalog-pull-request.mjs'
  )

  assert.match(merger, /pullRequest\.head\?\.sha !== checkedHeadSha/)
  assert.match(merger, /pullRequest\.base\?\.sha !== checkedBaseSha/)
  assert.match(merger, /currentBaseSha !== checkedBaseSha/)
  assert.match(merger, /--match-head-commit/)
})
