import { expect, test } from '../support/network-fixture.mjs'

const SUPABASE_ORIGIN = 'https://account-ui-test.supabase.co'
const LOCAL_ORIGIN = 'http://localhost:8000'
const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

function runtimeConfig() {
  return `window.EDENIA_CONFIG = ${JSON.stringify({
    accountFeaturesRollout: 'internal',
    freePlusEnabled: false,
    googleIdentityClientId: '1234567890-test.apps.googleusercontent.com',
    googleSignInMode: 'id_token',
    indexedDbBackupCleanupEnabled: false,
    indexedDbBackupsEnabled: false,
    plusCheckoutEnabled: false,
    studyGuidanceEnabled: false,
    supabasePublishableKey: 'test-publishable-key',
    supabaseUrl: SUPABASE_ORIGIN,
    turnstileSiteKey: '1x00000000000000000000AA',
    youtubeApiKey: ''
  })}`
}

function fakeAccessToken(userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: 1893456000,
    role: 'authenticated',
    sub: userId
  })}.test-signature`
}

function authenticatedSession(provider = 'google') {
  return {
    access_token: fakeAccessToken(AUTHENTICATED_USER_ID),
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider, providers: [provider] },
      aud: 'authenticated',
      created_at: '2026-08-01T00:00:00.000Z',
      email: 'learner@example.com',
      id: AUTHENTICATED_USER_ID,
      identities: [],
      role: 'authenticated',
      user_metadata: {}
    }
  }
}

async function installProviderMocks(page, {
  analyticsEnabled = false,
  identifyThrows = false,
  resetThrows = false
} = {}) {
  await page.addInitScript(options => {
    if (options.analyticsEnabled) {
      Object.defineProperty(window, 'EDENIA_ANALYTICS_ENABLED', {
        configurable: false,
        get() { return true },
        set() {}
      })
    }
    const tracker = {
      google: {
        configurations: [],
        renderOptions: []
      },
      posthogCapture: [],
      posthogIdentify: [],
      posthogInit: [],
      posthogResetCount: 0,
      turnstile: {
        configurations: {},
        nextWidgetId: 1,
        removeCount: 0,
        resetCount: 0
      }
    }
    window.__edeniaAuthE2e = tracker

    let activeGoogleConfiguration = null
    window.google = {
      accounts: {
        id: {
          initialize(configuration) {
            activeGoogleConfiguration = configuration
            tracker.google.configurations.push({
              autoSelect: configuration.auto_select,
              nonce: configuration.nonce
            })
          },
          renderButton(element, options) {
            tracker.google.renderOptions.push({ ...options })
            const button = document.createElement('button')
            button.type = 'button'
            button.setAttribute('aria-label', 'Continue with Google')
            button.textContent = 'Continue with Google'
            button.addEventListener('click', () => {
              activeGoogleConfiguration?.callback?.({
                credential: 'mock-google-id-token'
              })
            })
            element.replaceChildren(button)
          }
        }
      }
    }

    window.turnstile = {
      remove() {
        tracker.turnstile.removeCount += 1
      },
      render(element, options) {
        const widgetId = tracker.turnstile.nextWidgetId++
        tracker.turnstile.configurations[widgetId] = options
        const label = document.createElement('span')
        label.textContent = 'Security check'
        element.replaceChildren(label)
        queueMicrotask(() => options.callback('mock-turnstile-token'))
        return widgetId
      },
      reset() {
        tracker.turnstile.resetCount += 1
      }
    }

    window.posthog = {
      __loaded: true,
      capture(...args) { tracker.posthogCapture.push(args) },
      get_session_replay_url() { return null },
      identify(userId, properties) {
        tracker.posthogIdentify.push([userId, { ...properties }])
        if (options.identifyThrows) throw new Error('identify unavailable')
      },
      init(_projectKey, configuration) {
        tracker.posthogInit.push(configuration)
      },
      register() {},
      reset() {
        tracker.posthogResetCount += 1
        if (options.resetThrows) throw new Error('reset unavailable')
      },
      setPersonProperties() {}
    }
  }, { analyticsEnabled, identifyThrows, resetThrows })
}

async function stubSupabase(page, requests) {
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    let body = null
    try { body = request.postDataJSON() } catch {}
    requests.push({ body, method: request.method(), path: url.pathname })

    if (url.pathname === '/auth/v1/token') {
      await route.fulfill({ json: authenticatedSession(), status: 200 })
      return
    }
    if (url.pathname === '/auth/v1/verify') {
      await route.fulfill({ json: authenticatedSession('email'), status: 200 })
      return
    }
    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ body: '', status: 204 })
      return
    }
    if (url.pathname === '/auth/v1/otp') {
      await route.fulfill({ json: {}, status: 200 })
      return
    }
    await route.fulfill({ json: [], status: 200 })
  })
}

async function seedStudyState(page, { setupCompleted, walkthroughCompleted }) {
  await page.evaluate(({ setup, walkthrough }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = new Date().toISOString()
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = setup
    state.onboarding.setupCompletedAt = setup ? completedAt : null
    state.onboarding.walkthroughCompleted = walkthrough
    state.onboarding.walkthroughCompletedAt = walkthrough ? completedAt : null
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.streak = {
      current: 6,
      lastActivityDate: '2026-08-14',
      longest: 9
    }
    state.totalRewatchCount = 3
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  }, {
    setup: setupCompleted,
    walkthrough: walkthroughCompleted
  })
}

test('official Google and same-device email-code flows preserve local study data', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'phone-small',
    'tablet-portrait'
  ].includes(testInfo.project.name))
  await installProviderMocks(page)
  const requests = []
  await stubSupabase(page, requests)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto(`${LOCAL_ORIGIN}/?internal_test=1`)
  await seedStudyState(page, {
    setupCompleted: true,
    walkthroughCompleted: true
  })
  await page.goto(`${LOCAL_ORIGIN}/?internal_test=1&account=1`)
  const studyStateBefore = await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))

  const officialGoogleButton = page.locator(
    '#accountGoogleIdentityButton button'
  )
  await expect(officialGoogleButton).toBeVisible()
  expect(await page.evaluate(() => (
    'prompt' in window.google.accounts.id
  ))).toBe(false)
  await officialGoogleButton.click()

  await expect(page.locator('.settings-account-toggle')).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await expect(page.locator('#accountUserEmail')).toHaveText(
    'learner@example.com'
  )
  const tokenRequest = requests.find(request => request.path === '/auth/v1/token')
  expect(tokenRequest.body).toMatchObject({
    id_token: 'mock-google-id-token',
    provider: 'google'
  })
  expect(tokenRequest.body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))).toBe(studyStateBefore)
  await expect(page).toHaveURL(new RegExp(`^${LOCAL_ORIGIN}/`))

  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  expect(await page.evaluate(() => (
    window.__edeniaAuthE2e.google.configurations.at(-1).autoSelect
  ))).toBe(false)

  const emailInput = page.locator('#accountEmail')
  const emailButton = page.locator('#accountEmailBtn')
  await expect(emailButton).toBeEnabled()
  const collapsedGap = await page.locator('.settings-account-email-form').evaluate(
    form => {
      const input = form.querySelector('input').getBoundingClientRect()
      const button = form.querySelector('button').getBoundingClientRect()
      return button.top - input.bottom
    }
  )
  expect(collapsedGap).toBeLessThanOrEqual(12)
  await page.evaluate(() => {
    window.__edeniaAuthE2e.turnstile.configurations[1][
      'before-interactive-callback'
    ]()
  })
  const interactiveGap = await page.locator('.settings-account-email-form').evaluate(
    form => {
      const input = form.querySelector('input').getBoundingClientRect()
      const button = form.querySelector('button').getBoundingClientRect()
      return button.top - input.bottom
    }
  )
  expect(interactiveGap).toBeGreaterThan(collapsedGap)
  await page.evaluate(() => {
    window.__edeniaAuthE2e.turnstile.configurations[1][
      'after-interactive-callback'
    ]()
  })
  await emailInput.fill('LEARNER@EXAMPLE.COM')
  await emailInput.press('Enter')
  await expect(page.getByText(
    'Enter the six-digit code sent to your email.'
  )).toBeVisible()
  const otpRequest = requests.find(request => request.path === '/auth/v1/otp')
  expect(otpRequest.body).toMatchObject({
    create_user: true,
    data: { edenia_auth_locale: 'en' },
    email: 'learner@example.com',
    gotrue_meta_security: { captcha_token: 'mock-turnstile-token' }
  })
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.turnstile.resetCount
  ))).toBe(1)
  const codeInput = page.locator('#accountEmailCode')
  await expect(codeInput).toBeVisible()
  await expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')
  await codeInput.fill('123456')
  await codeInput.press('Enter')
  const verifyRequest = requests.find(request => request.path === '/auth/v1/verify')
  expect(verifyRequest.body).toMatchObject({
    email: 'learner@example.com',
    token: '123456',
    type: 'email'
  })
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  expect(await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))).toBe(studyStateBefore)
  const analyticsPayload = await page.evaluate(() => JSON.stringify({
    capture: window.__edeniaAuthE2e.posthogCapture,
    identify: window.__edeniaAuthE2e.posthogIdentify
  }))
  expect(analyticsPayload).not.toContain('123456')
  expect(analyticsPayload).not.toContain('mock-google-id-token')
  expect(analyticsPayload).not.toContain('mock-turnstile-token')
})

test('browser auth identifies one UUID and protects replay from Auth fields and URLs', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await installProviderMocks(page, { analyticsEnabled: true })
  const requests = []
  await stubSupabase(page, requests)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto(`${LOCAL_ORIGIN}/?internal_test=1`)
  await seedStudyState(page, {
    setupCompleted: true,
    walkthroughCompleted: true
  })
  await page.goto(
    `${LOCAL_ORIGIN}/?internal_test=1&account=1&code=browser-secret`
      + '#access_token=fragment-secret'
  )
  const replayProtection = await page.evaluate(() => {
    const configuration = window.__edeniaAuthE2e.posthogInit.at(-1)
    return {
      authSurfaceBlocked: document.querySelector('#accountSignedOut')
        .classList.contains('ph-no-capture'),
      currentUrl: configuration.get_current_url(),
      fragmentCaptureDisabled: configuration.disable_capture_url_hashes,
      maskAllInputs: configuration.session_recording.maskAllInputs,
      ordinaryProductVisible: !document.querySelector('#videoGrid')
        .classList.contains('ph-no-capture'),
      replayEnabled: configuration.disable_session_recording === false
    }
  })
  expect(replayProtection).toMatchObject({
    authSurfaceBlocked: true,
    fragmentCaptureDisabled: true,
    maskAllInputs: true,
    ordinaryProductVisible: true,
    replayEnabled: true
  })
  const protectedUrl = new URL(replayProtection.currentUrl)
  expect(protectedUrl.searchParams.get('code')).toBe('[REDACTED]')
  expect(new URLSearchParams(protectedUrl.hash.slice(1)).get('access_token'))
    .toBe('[REDACTED]')
  const browserUrl = new URL(page.url())
  expect(browserUrl.searchParams.get('code')).toBe('[REDACTED]')
  expect(new URLSearchParams(browserUrl.hash.slice(1)).get('access_token'))
    .toBe('[REDACTED]')

  await page.locator('#accountGoogleIdentityButton button').click()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogIdentify
  ))).toEqual([[
    AUTHENTICATED_USER_ID,
    { email: 'learner@example.com' }
  ]])

  await page.locator('.settings-account-toggle').click()
  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogResetCount
  ))).toBe(1)
})

test('an analytics identify exception cannot block browser authentication', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await installProviderMocks(page, {
    analyticsEnabled: true,
    identifyThrows: true
  })
  const requests = []
  await stubSupabase(page, requests)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto(`${LOCAL_ORIGIN}/?internal_test=1`)
  await seedStudyState(page, {
    setupCompleted: true,
    walkthroughCompleted: true
  })
  await page.goto(`${LOCAL_ORIGIN}/?internal_test=1&account=1`)
  await page.locator('#accountGoogleIdentityButton button').click()
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await expect(page.locator('#accountUserEmail')).toHaveText(
    'learner@example.com'
  )
})
