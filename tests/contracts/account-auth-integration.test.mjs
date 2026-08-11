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
    /function initializeAccountAuth\(\) \{\s*if \(!ACCOUNT_FEATURES_ENABLED\) return[\s\S]*if \(!hasSupabaseRuntimeConfig\(\)\) \{/
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

test('internal Account UI replaces only the internal Plus settings presentation', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(
    source,
    /function renderAccountSettings\([\s\S]*group\.classList\.toggle\('hidden', !ACCOUNT_FEATURES_ENABLED\)/
  )
  assert.match(
    source,
    /function renderPlusAccountSettings\([\s\S]*if \(ACCOUNT_FEATURES_ENABLED\) \{\s*group\.classList\.add\('hidden'\)\s*renderAccountSettings\(\)\s*return/
  )
  assert.match(
    source,
    /initializeAccountAuth\(\)\s*initializePlusAccount\(\)\s*initializeRequestedAccountSettings\(\)/
  )
})

test('Account UI actions do not read, write, import, or export study progress', async () => {
  const source = await readFile(
    new URL('../../src/features/settings/account-actions.js', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /localStorage|loadState|saveState|progress|backup|sync/i)
})

test('account session state drives isolated UUID-only analytics identity', async () => {
  const source = await readFile(appUrl, 'utf8')
  const identitySource = await readFile(
    new URL('../../src/integrations/account-analytics-identity.js', import.meta.url),
    'utf8'
  )

  assert.match(
    source,
    /onStateChange\(state\) \{\s*accountAuthViewState = state\s*accountAnalyticsIdentity\.synchronize\(state\)\s*renderAccountSettings\(state\)/
  )
  assert.match(identitySource, /accountState\?\.userId/)
  assert.doesNotMatch(identitySource, /email|localStorage|loadState|saveState|progress|syncEdenia/i)
})
