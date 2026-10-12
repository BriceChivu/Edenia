import vm from 'node:vm'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appUrl = new URL('../../src/app.js', import.meta.url)
const plusPageUrl = new URL('../../src/plus-page.js', import.meta.url)
const plusPageHtmlUrl = new URL('../../plus/index.html', import.meta.url)

test('general account auth starts only behind the rollout and public config gates', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(
    source,
    /const ACCOUNT_FEATURES_ENABLED = deriveAccountFeaturesEnabled\(\s*RUNTIME_ENVIRONMENT,\s*getAccountFeaturesRollout\(\),\s*getAuthTrialEnabled\(\)\s*\)/
  )
  assert.match(
    source,
    /function initializeAccountAuth\(\) \{\s*if \(!ACCOUNT_FEATURES_ENABLED\) return[\s\S]*if \(!hasSupabaseRuntimeConfig\(\)\) \{/
  )
  assert.match(
    source,
    /applyLocale\(state\.config\.locale\)\s*if \(!accountAuthInitialized\) initializeAccountAuth\(\)\s*initializePlusAccount\(\)/
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
    /function initializePlusAccount\(\) \{\s*if \(!ACCOUNT_FEATURES_ENABLED \|\| IS_SANDBOX \|\| !hasSupabaseRuntimeConfig\(\)\) return/
  )
  assert.match(
    source,
    /const client = getSupabaseClient\(\)[\s\S]*createAccountAuthController\(\{\s*client,/
  )
  assert.equal(
    source.match(/createEdeniaSupabaseClient\(\{/g)?.length,
    1
  )
})

test('page exit captures the final local save before releasing its activation', async () => {
  const source = await readFile(appUrl, 'utf8')
  const start = source.indexOf("window.addEventListener('pagehide', event => {")
  const end = source.indexOf("\nif (!IS_SANDBOX)", start)
  assert.ok(start >= 0 && end > start)
  const calls = []
  let complete, handler
  const capture = new Promise(resolve => { complete = resolve })
  const controller = { destroy: () => calls.push('other-cleanup') }
  vm.runInNewContext(source.slice(start, end), {
    window: { addEventListener: (type, callback) => { if (type === 'pagehide') handler = callback } },
    learnerProfilePageLeaving: false,
    syncActiveVideoShelfPlayer(options) { assert.equal(options.captureStoppedPlayback, true); calls.push('capture'); return capture },
    learnerProfileLifecycleAuthority: { flushSessionBoundary: options => { assert.equal(options.allowNewUpload, false); calls.push('flush') }, destroy: () => calls.push('release') },
    learnerProfileReverificationController: controller, accountAuthController: controller,
    googleIdentityServicesController: controller, turnstileController: controller,
    accountStudySnapshotController: controller, plusAccountController: controller,
    activeVideoShelfPlayer: null, trackVideoPlaybackSessionEnded() {}
  })
  handler({ persisted: false })
  assert.equal(calls[0], 'capture')
  assert.equal(calls.includes('release'), false, 'An unfinished local save retains its owner fence')
  complete(true)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls.slice(-2), ['flush', 'release'])
})

test('internal Account UI replaces the retired Plus settings presentation', async () => {
  const source = await readFile(appUrl, 'utf8')

  assert.match(
    source,
    /function renderAccountSettings\([\s\S]*group\.classList\.toggle\('hidden', !ACCOUNT_FEATURES_ENABLED\)/
  )
  assert.match(
    source,
    /function renderPlusAccountSettings\(\) \{[\s\S]*group\?\.classList\.add\('hidden'\)[\s\S]*if \(ACCOUNT_FEATURES_ENABLED\) renderAccountSettings\(\)/
  )
  assert.match(
    source,
    /initializeAccountAuth\(\)\s*initializePlusAccount\(\)\s*initializeRequestedAccountSettings\(\)/
  )
})

test('legacy Plus routes and dialogs share the internal account rollout', async () => {
  const source = await readFile(appUrl, 'utf8')
  const plusPageSource = await readFile(plusPageUrl, 'utf8')
  const plusPageHtml = await readFile(plusPageHtmlUrl, 'utf8')

  assert.match(
    source,
    /function openPlusUpgradeModal\(featureId = null\) \{\s*if \(!ACCOUNT_FEATURES_ENABLED\) return false/
  )
  assert.match(
    source,
    /function initializeRequestedPlusModal\(\) \{\s*if \(!ACCOUNT_FEATURES_ENABLED\) return/
  )
  assert.match(
    plusPageSource,
    /const accountFeaturesEnabled = deriveAccountFeaturesEnabled\([\s\S]*getAccountFeaturesRollout\(\)/
  )
  assert.match(
    plusPageSource,
    /if \(!accountFeaturesEnabled \|\| runtimeEnvironment\.isAuthTrial\) \{\s*window\.location\.replace\(appReturnUrl\.href\)/
  )
  assert.match(plusPageHtml, /id="plusPage" data-plus-upgrade-root hidden/)
})

test('Account UI actions do not read, write, import, or export study progress', async () => {
  const accountActionsSource = await readFile(
    new URL('../../src/features/settings/account-actions.js', import.meta.url),
    'utf8'
  )
  const reminderActionsSource = await readFile(
    new URL('../../src/features/settings/reminder-preference-actions.js', import.meta.url),
    'utf8'
  )
  const reminderControllerSource = await readFile(
    new URL('../../src/integrations/reminder-preferences-controller.js', import.meta.url),
    'utf8'
  )

  for (const source of [
    accountActionsSource,
    reminderActionsSource,
    reminderControllerSource
  ]) {
    assert.doesNotMatch(
      source,
      /localStorage|loadState|saveState|progress|backup|state_backups|syncEdenia/i
    )
  }
  assert.doesNotMatch(reminderControllerSource, /\bemail\s*:/i)
})

test('account session state drives isolated UUID analytics identity with safe properties', async () => {
  const source = await readFile(appUrl, 'utf8')
  const identitySource = await readFile(
    new URL('../../src/integrations/account-analytics-identity.js', import.meta.url),
    'utf8'
  )

  assert.match(
    source,
    /function applyAccountAuthenticationState\(state,[\s\S]*accountAuthViewState = state\s*accountlessProfileMigrationController\?\.observeAuthentication\(state\)[\s\S]*learnerProfileAuthenticationAdapter\.observeAccountState\(state\)[\s\S]*onStateChange\(state\) \{\s*applyAccountAuthenticationState\(state\)\s*accountAnalyticsIdentity\.synchronize\(state\)[\s\S]*reminderPreferencesController\.synchronizeAccount\([\s\S]*renderAccountSettings\(state\)/
  )
  assert.match(
    source,
    /addEventListener\('edenia:analytics-ready',[\s\S]*accountAnalyticsIdentity\.synchronize\(accountAuthViewState\)/
  )
  assert.match(identitySource, /accountState\?\.userId/)
  assert.match(identitySource, /properties\.email = email/)
  assert.doesNotMatch(
    identitySource,
    /authMethod|auth_method|provider|subject|displayName|\bname\b/i
  )
  assert.doesNotMatch(identitySource, /localStorage|loadState|saveState|progress|syncEdenia/i)
})

test('authentication credentials have no application persistence or analytics seam', async () => {
  const accountAuthSource = await readFile(
    new URL('../../src/integrations/account-auth-controller.js', import.meta.url),
    'utf8'
  )
  const googleAuthSource = await readFile(
    new URL('../../src/integrations/google-identity-services-controller.js', import.meta.url),
    'utf8'
  )
  const settingsActionsSource = await readFile(
    new URL('../../src/features/settings/account-actions.js', import.meta.url),
    'utf8'
  )
  const onboardingActionsSource = await readFile(
    new URL('../../src/features/onboarding/account-actions.js', import.meta.url),
    'utf8'
  )
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
  const appSource = await readFile(appUrl, 'utf8')

  for (const source of [
    accountAuthSource,
    googleAuthSource,
    settingsActionsSource,
    onboardingActionsSource
  ]) {
    assert.doesNotMatch(
      source,
      /localStorage|sessionStorage|posthog|trackEdeniaEvent|identifyEdeniaAuthenticatedUser/i
    )
  }
  assert.match(html, /settings-account-signed-out hidden ph-no-capture/)
  assert.match(html, /settings-account-identity ph-no-capture/)
  assert.match(appSource, /onboarding-account-identity ph-no-capture/)
  assert.match(appSource, /onboarding-account-email-form ph-no-capture/)
  assert.match(appSource, /onboarding-account-code-form ph-no-capture/)
})
