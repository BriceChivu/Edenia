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
  authenticatedUserId = null,
  identifyThrows = false
} = {}) {
  await page.addInitScript(options => {
    if (
      options.analyticsEnabled
      && new URLSearchParams(window.location.search).get('account') === '1'
    ) {
      Object.defineProperty(window, 'EDENIA_ANALYTICS_ENABLED', {
        configurable: false,
        get() { return true },
        set() {}
      })
    }
    if (options.authenticatedUserId) {
      localStorage.setItem(
        'edenia_posthog_authenticated_user_v1',
        options.authenticatedUserId
      )
    }
    const tracker = {
      google: {
        configurations: [],
        renderOptions: []
      },
      posthogCapture: [],
      posthogDistinctId: options.authenticatedUserId || 'anonymous-browser-id',
      posthogIdentify: [],
      posthogInit: [],
      posthogLifecycle: [],
      posthogResetCount: 0,
      posthogStartRecordingCount: 0,
      posthogUserId: options.authenticatedUserId,
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
      capture(...args) {
        tracker.posthogCapture.push([tracker.posthogDistinctId, ...args])
        tracker.posthogLifecycle.push([
          'capture', tracker.posthogDistinctId, args[0]
        ])
      },
      get_distinct_id() { return tracker.posthogDistinctId },
      get_property(key) {
        return key === '$user_id' ? tracker.posthogUserId : undefined
      },
      get_session_replay_url() { return null },
      identify(userId, properties) {
        tracker.posthogIdentify.push({
          fromDistinctId: tracker.posthogDistinctId,
          properties: { ...properties },
          userId
        })
        tracker.posthogLifecycle.push([
          'identify', tracker.posthogDistinctId, userId
        ])
        if (options.identifyThrows) throw new Error('identify unavailable')
        tracker.posthogDistinctId = userId
        tracker.posthogUserId = userId
      },
      init(_projectKey, configuration) {
        tracker.posthogInit.push(configuration)
      },
      register() {},
      reset() {
        tracker.posthogLifecycle.push(['reset', tracker.posthogDistinctId])
        tracker.posthogResetCount += 1
        tracker.posthogDistinctId = `anonymous-after-reset-${tracker.posthogResetCount}`
        tracker.posthogUserId = null
      },
      setPersonProperties() {},
      startSessionRecording() {
        tracker.posthogStartRecordingCount += 1
      }
    }
  }, { analyticsEnabled, authenticatedUserId, identifyThrows })
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

async function openCompletedAccountPage(page, {
  destination = `${LOCAL_ORIGIN}/?internal_test=1&account=1`,
  providerMocks = {}
} = {}) {
  await installProviderMocks(page, providerMocks)
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
  await page.goto(destination)
  return requests
}

test('official Google and same-device email-code flows preserve local study data', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'phone-small',
    'tablet-portrait'
  ].includes(testInfo.project.name))
  const requests = await openCompletedAccountPage(page)
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
  await expect(page.locator('#accountUserEmail').locator('..')).toHaveClass(
    /ph-no-capture/
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
  await openCompletedAccountPage(page, {
    destination: `${LOCAL_ORIGIN}/?internal_test=1&account=1`
      + '&token=query-secret#token=fragment-secret',
    providerMocks: { analyticsEnabled: true }
  })
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
      replayBlocked: configuration.disable_session_recording === true
    }
  })
  expect(replayProtection).toMatchObject({
    authSurfaceBlocked: true,
    fragmentCaptureDisabled: true,
    maskAllInputs: true,
    ordinaryProductVisible: true,
    replayBlocked: true
  })
  const protectedUrl = new URL(replayProtection.currentUrl)
  expect(protectedUrl.searchParams.get('token')).toBe('[REDACTED]')
  expect(protectedUrl.hash).toBe('')
  const browserUrl = new URL(page.url())
  expect(browserUrl.searchParams.get('token')).toBe('query-secret')
  expect(new URLSearchParams(browserUrl.hash.slice(1)).get('token'))
    .toBe('fragment-secret')

  expect(await page.evaluate(() => (
    window.__edeniaAuthE2e.posthogStartRecordingCount
  ))).toBe(0)
  await page.evaluate(() => {
    window.history.replaceState(
      window.history.state,
      '',
      '/?internal_test=1&account=1'
    )
    window.resumeEdeniaSessionRecording()
  })
  expect(await page.evaluate(() => (
    window.__edeniaAuthE2e.posthogStartRecordingCount
  ))).toBe(1)

  const anonymousDistinctId = await page.evaluate(() => (
    window.__edeniaAuthE2e.posthogDistinctId
  ))
  expect(anonymousDistinctId).toBe('anonymous-browser-id')
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogCapture.some(
      ([distinctId]) => distinctId === 'anonymous-browser-id'
    )
  ))).toBe(true)

  await page.locator('#accountGoogleIdentityButton button').click()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogIdentify
  ))).toEqual([{
    fromDistinctId: 'anonymous-browser-id',
    properties: { email: 'learner@example.com' },
    userId: AUTHENTICATED_USER_ID
  }])

  await page.locator('.settings-account-toggle').click()
  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogResetCount
  ))).toBe(1)
})

test('a persisted learner resets before a different browser account identifies', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const previousUserId = 'e5410993-1277-4813-88f6-2ddf3108cb97'
  await openCompletedAccountPage(page, {
    providerMocks: {
      analyticsEnabled: true,
      authenticatedUserId: previousUserId
    }
  })

  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogResetCount
  ))).toBe(1)
  await page.locator('#accountGoogleIdentityButton button').click()

  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogLifecycle.filter(
      ([event]) => event === 'reset' || event === 'identify'
    )
  ))).toEqual([
    ['reset', previousUserId],
    ['identify', 'anonymous-after-reset-1', AUTHENTICATED_USER_ID]
  ])
})

test('an analytics identify exception cannot block browser authentication', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await openCompletedAccountPage(page, {
    providerMocks: {
      analyticsEnabled: true,
      identifyThrows: true
    }
  })
  await page.locator('#accountGoogleIdentityButton button').click()
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await expect(page.locator('#accountUserEmail')).toHaveText(
    'learner@example.com'
  )
})
