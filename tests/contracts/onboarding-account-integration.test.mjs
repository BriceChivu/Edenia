import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const styleSource = await readFile(
  new URL('../../src/styles/20-settings-onboarding.css', import.meta.url),
  'utf8'
)

test('Account onboarding is appended only through the existing account gate', () => {
  assert.match(
    appSource,
    /const stepOrder = ACCOUNT_FEATURES_ENABLED\s*\? \[\.\.\.profileStepOrder, 'account'\]\s*: profileStepOrder/
  )
  assert.match(
    appSource,
    /if \(ACCOUNT_FEATURES_ENABLED\) \{\s*return `[\s\S]*data-personalized-onboarding-step="account"/
  )
  assert.match(
    appSource,
    /if \(canResumeOnboardingAccountStep\(loadState\(\)\)\) return\s*window\.setTimeout\(\(\) => openSettings\(\), 0\)/
  )
})

test('Account onboarding reuses auth methods and preserves an OAuth draft', () => {
  assert.match(
    appSource,
    /bindOnboardingAccountActions\(content, \{\s*signInWithGoogle: signInAccountWithGoogle,\s*sendMagicLink: sendOnboardingAccountMagicLink\s*\}\)/
  )
  assert.match(
    appSource,
    /state\.onboarding\.accountStepReachedAt = now\s*if \(saveState\(state\)\) return true/
  )
  assert.match(
    appSource,
    /function sendOnboardingAccountMagicLink\(email\) \{\s*personalizedOnboardingState\.accountEmail = String\(email \|\| ''\)\s*return sendAccountMagicLink\(email\)/
  )
})

test('Account onboarding keeps the requested button hierarchy and omits local-progress copy', () => {
  assert.match(
    appSource,
    /class="btn-primary onboarding-account-google"/
  )
  assert.match(
    appSource,
    /class="btn-secondary onboarding-account-email-button"/
  )
  assert.doesNotMatch(
    appSource,
    /Your current study progress stays in this browser/
  )
  assert.match(
    styleSource,
    /\.onboarding-account-google \{[\s\S]*background: var\(--planet-cyan\);/
  )
  assert.doesNotMatch(styleSource, /onboarding-account-local-note/)
})
