import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const playwrightConfig = await readFile(
  new URL('playwright.config.mjs', projectRoot),
  'utf8'
)

test('browser tests use one worker in local and CI runs', () => {
  assert.match(playwrightConfig, /\n\s*workers:\s*1,\n/)
  assert.doesNotMatch(
    playwrightConfig,
    /workers:\s*process\.env\.CI\s*\?\s*1\s*:\s*undefined/
  )
})
