import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createAccountAuthController } from '../../src/integrations/account-auth-controller.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const styleSource = await readFile(
  new URL('../../src/styles/20-settings-onboarding.css', import.meta.url),
  'utf8'
)

test('Account onboarding is appended only when account entry is required', () => {
  assert.match(
    appSource,
    /const stepOrder = ACCOUNT_ENTRY_REQUIRED\s*\? \[\.\.\.profileStepOrder, 'account'\]\s*: profileStepOrder/
  )
  assert.match(
    appSource,
    /if \(ACCOUNT_ENTRY_REQUIRED\) \{\s*return `[\s\S]*data-personalized-onboarding-step="account"/
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

function createTurnstileControlsHarness({
  configured = false,
  controller = null,
  status,
  widgetPresent = true,
  busyAction = null,
  sessionState = 'signed-out'
} = {}) {
  const classes = initial => {
    const values = new Set(initial)
    return {
      contains: value => values.has(value),
      toggle(value, enabled) {
        if (enabled) values.add(value)
        else values.delete(value)
      }
    }
  }
  const statusElement = {
    classList: classes(['hidden']),
    textContent: '',
    dataset: {},
    closest: () => form
  }
  const widget = { classList: classes(['hidden']), closest: () => form }
  const submit = { disabled: Boolean(busyAction) || sessionState === 'unavailable' }
  const form = {
    querySelector(selector) {
      if (selector === '[data-turnstile-widget]') return widgetPresent ? widget : null
      if (selector === '[data-turnstile-status]') return statusElement
      if (selector === 'button[type="submit"]') return submit
      return null
    }
  }
  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-turnstile-widget]') return widgetPresent ? [widget] : []
      if (selector === '[data-turnstile-status]') return [statusElement]
      throw new Error(`Unexpected selector: ${selector}`)
    }
  }
  const start = appSource.indexOf('function getTurnstileStatusView(')
  const end = appSource.indexOf('\nconst ACCOUNT_EXPORT_FEEDBACK_VIEWS', start)
  assert.ok(start > 0 && end > start)
  const controls = new Function(
    'TURNSTILE_READY', 'turnstileController', 'turnstileWidgetStatuses',
    'accountAuthViewState', 'ACCOUNT_SESSION_STATES', 't',
    `${appSource.slice(start, end)}; return { synchronizeTurnstileControls, mountTurnstileWidgets }`
  )(configured, controller, new Map(status ? [[widget, status]] : []),
    { busyAction, sessionState },
    { SIGNED_OUT: 'signed-out', UNAVAILABLE: 'unavailable' }, key => key)
  return { ...controls, root, statusElement, widget, submit }
}

test('static Turnstile placeholder stays hidden and empty when runtime is unconfigured', () => {
  const harness = createTurnstileControlsHarness()
  harness.synchronizeTurnstileControls(harness.root)
  assert.equal(harness.statusElement.textContent, '')
  assert.equal(harness.statusElement.classList.contains('hidden'), true)
  assert.equal(harness.widget.classList.contains('hidden'), true)
  assert.equal(harness.submit.disabled, false)
})

test('configured Turnstile without a controller stays visible and blocks submission', () => {
  const harness = createTurnstileControlsHarness({ configured: true })
  harness.synchronizeTurnstileControls(harness.root)
  assert.equal(harness.statusElement.classList.contains('hidden'), false)
  assert.equal(harness.statusElement.textContent, 'settings.account.securityCheckUnavailable')
  assert.equal(harness.submit.disabled, true)
})

test('configured Turnstile without a widget stays visible and blocks submission', () => {
  const harness = createTurnstileControlsHarness({
    configured: true, controller: {}, widgetPresent: false, status: 'ready'
  })
  harness.synchronizeTurnstileControls(harness.root)
  assert.equal(harness.statusElement.classList.contains('hidden'), false)
  assert.equal(harness.statusElement.textContent, 'settings.account.securityCheckUnavailable')
  assert.equal(harness.submit.disabled, true)
})

test('mount synchronizes the configured unavailable surface even without a controller', () => {
  const harness = createTurnstileControlsHarness({ configured: true })
  assert.equal(harness.mountTurnstileWidgets(harness.root), false)
  assert.equal(harness.submit.disabled, true)
  assert.equal(harness.statusElement.textContent, 'settings.account.securityCheckUnavailable')
})

for (const status of ['loading', 'pending', 'interactive', 'expired', 'unavailable', 'error', 'consumed', 'ready']) {
  test(`configured Turnstile ${status} preserves guidance and submission state`, () => {
    const harness = createTurnstileControlsHarness({ configured: true, controller: {}, status })
    harness.synchronizeTurnstileControls(harness.root)
    assert.equal(harness.submit.disabled, status !== 'ready')
    assert.equal(harness.statusElement.classList.contains('hidden'), status === 'ready')
    assert.equal(harness.statusElement.textContent === '', status === 'ready')
  })
}

for (const configured of [false, true]) {
  for (const state of [{ busyAction: 'email-code-request' }, { sessionState: 'unavailable' }]) {
    test(`Turnstile configured=${configured} preserves auth blocking ${JSON.stringify(state)}`, () => {
      const harness = createTurnstileControlsHarness({ configured, controller: {}, status: 'ready', ...state })
      harness.synchronizeTurnstileControls(harness.root)
      assert.equal(harness.submit.disabled, true)
    })
  }
}

function createEmailRequestHarness({ configured, controller = null, requestFails = false } = {}) {
  const calls = []
  const options = []
  const client = { auth: {
    getSession() {}, refreshSession() {}, onAuthStateChange() {}, verifyOtp() {}, signOut() {},
    async signInWithOtp(request) {
      calls.push(request)
      return { error: requestFails ? { status: 500 } : null }
    }
  } }
  const auth = createAccountAuthController({
    client, history: { replaceState() {} },
    location: { href: 'http://localhost:8000/?internal_test=1&account=1' },
    onStateChange() {}, schedule() {}
  })
  const start = appSource.indexOf('async function requestAccountEmailCode(')
  const end = appSource.indexOf('\nfunction requestOnboardingAccountEmailCode(', start)
  assert.ok(start > 0 && end > start)
  const request = new Function(
    'TURNSTILE_READY', 'turnstileController', 'accountAuthController', 'getCurrentLocale',
    `${appSource.slice(start, end)}; return requestAccountEmailCode`
  )(configured, controller, {
    requestEmailCode(email, nextOptions) {
      options.push(nextOptions)
      return auth.requestEmailCode(email, nextOptions)
    }
  }, () => 'en')
  return { request, calls, options }
}

test('unconfigured app request explicitly disables CAPTCHA and omits it from local Auth options', async () => {
  const harness = createEmailRequestHarness({ configured: false })
  assert.equal(await harness.request('learner@example.com'), true)
  assert.equal(harness.options[0].captchaRequired, false)
  assert.equal(harness.options[0].captchaToken, '')
  assert.equal(Object.hasOwn(harness.calls[0].options, 'captchaToken'), false)
})

test('runtime unconfigured cannot consume or send a token from a stray controller', async () => {
  const harness = createEmailRequestHarness({ configured: false, controller: {
    consumeToken() { throw new Error('Unconfigured runtime must not consume tokens') }, reset() {}
  } })
  assert.equal(await harness.request('learner@example.com'), true)
  assert.equal(Object.hasOwn(harness.calls[0].options, 'captchaToken'), false)
})

test('configured app request without a controller or widget never sends tokenless Auth traffic', async () => {
  for (const controller of [null, { consumeToken: () => null, reset() {} }]) {
    const harness = createEmailRequestHarness({ configured: true, controller })
    assert.equal(await harness.request('learner@example.com'), false)
    assert.equal(harness.options[0].captchaRequired, true)
    assert.equal(harness.calls.length, 0)
  }
})

for (const requestFails of [false, true]) {
  test(`configured app resets its widget after request failure=${requestFails}`, async () => {
    const widget = {}
    const resets = []
    const harness = createEmailRequestHarness({ configured: true, requestFails, controller: {
      consumeToken(element) { assert.equal(element, widget); return 'synthetic-token' },
      reset(element) { resets.push(element) }
    } })
    assert.equal(await harness.request('learner@example.com', { querySelector: () => widget }), !requestFails)
    assert.equal(harness.calls[0].options.captchaToken, 'synthetic-token')
    assert.deepEqual(resets, [widget])
  })
}
