import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appUrl = new URL('../../src/app.js', import.meta.url)

test('general account auth starts only behind the rollout and public config gates', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(
    source,
    /const ACCOUNT_FEATURES_ENABLED = deriveAccountFeaturesEnabled\(\s*RUNTIME_ENVIRONMENT,\s*getAccountFeaturesRollout\(\)\s*\)/
  )
  assert.match(
    source,
    /function initializeAccountAuth\(\) \{\s*if \(!ACCOUNT_FEATURES_ENABLED \|\| !hasSupabaseRuntimeConfig\(\)\) return/
  )
  assert.match(
    source,
    /applyLocale\(state\.config\.locale\)\s*initializeAccountAuth\(\)\s*initializePlusAccount\(\)/
  )
})

test('general accounts and Plus reuse one browser auth client and storage session', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(
    source,
    /function getSupabaseClient\(\) \{[\s\S]*storageKey: ACCOUNT_AUTH_STORAGE_KEY[\s\S]*return supabaseClient\s*\}/
  )
  assert.match(
    source,
    /function initializePlusAccount\(\) \{[\s\S]*const client = getSupabaseClient\(\)/
  )
  assert.match(
    source,
    /createAccountAuthController\(\{\s*client: getSupabaseClient\(\)/
  )
  assert.equal(
    source.match(/createEdeniaSupabaseClient\(\{/g)?.length,
    1
  )
})

test('account auth subscription is released with the existing Plus lifecycle', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(
    source,
    /window\.addEventListener\('pagehide', event => \{\s*if \(!event\.persisted\) accountAuthController\?\.destroy\(\)\s*if \(!event\.persisted\) plusAccountController\?\.destroy\(\)/
  )
})
