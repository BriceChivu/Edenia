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

test('Account onboarding reuses same-device email auth and preserves its draft', () => {
  assert.match(
    appSource,
    /bindOnboardingAccountActions\(content, \{\s*requestEmailCode: requestOnboardingAccountEmailCode,\s*verifyEmailCode: verifyAccountEmailCode\s*\}\)/
  )
  assert.match(
    appSource,
    /function persistOnboardingAccountDraft\(\) \{\s*return persistPersonalizedOnboardingDraft\(\{\s*markAccountStepReached: true\s*\}\)\s*\}/
  )
  assert.match(
    appSource,
    /if \(markAccountStepReached\) state\.onboarding\.accountStepReachedAt = now\s*if \(saveOnboardingWorkingState\(state\)\)/
  )
  assert.match(
    appSource,
    /function requestOnboardingAccountEmailCode\(email, form = null\) \{\s*personalizedOnboardingState\.accountEmail = String\(email \|\| ''\)\s*return requestAccountEmailCode\(email, form\)/
  )
  assert.match(
    appSource,
    /accountAuthController\.requestEmailCode\(email, \{\s*captchaRequired: TURNSTILE_READY,\s*captchaToken,\s*locale: getCurrentLocale\(\)\s*\}\)/
  )
})

test('Account onboarding uses the official Google mount and accessible code entry', () => {
  assert.match(appSource, /data-google-identity-button/)
  assert.doesNotMatch(appSource, /account-auth-google-mark/)
  assert.match(
    appSource,
    /class="btn-secondary onboarding-account-email-button"/
  )
  assert.match(
    appSource,
    /class="btn-secondary onboarding-account-email-button"[^>]*data-analytics-action="onboardingAccountEmail"/
  )
  assert.doesNotMatch(
    appSource,
    /Your current study progress stays in this browser/
  )
  assert.doesNotMatch(styleSource, /\.account-auth-google(?:-mark)?\b/)
  assert.match(styleSource, /\.account-google-identity-button\s*\{/)
  assert.match(appSource, /class="account-auth-email-input" id="onboardingAccountEmail"/)
  assert.match(
    appSource,
    /id="onboardingAccountEmailCode"[^>]*inputmode="numeric"[^>]*autocomplete="one-time-code"[^>]*maxlength="6"/
  )
  assert.match(
    appSource,
    /data-analytics-action="onboardingAccountEmailCode"/
  )
  assert.match(appSource, /btn-ghost onboarding-account-skip/)
  assert.match(appSource, /onboarding-account-email-form ph-no-capture/)
  assert.match(appSource, /onboarding-account-code-form ph-no-capture/)
  assert.doesNotMatch(styleSource, /onboarding-account-local-note/)
})
