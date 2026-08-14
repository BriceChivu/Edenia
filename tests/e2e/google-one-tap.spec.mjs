import { expect, test } from '../support/network-fixture.mjs'

const SUPABASE_ORIGIN = 'https://account-ui-test.supabase.co'
const PRODUCTION_ORIGIN = 'https://www.edenia.study'
const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

function runtimeConfig({ oneTap = false, turnstile = true } = {}) {
  return `window.EDENIA_CONFIG = ${JSON.stringify({
    accountFeaturesRollout: 'internal',
    freePlusEnabled: false,
    googleIdentityClientId: '1234567890-test.apps.googleusercontent.com',
    googleOneTapEnabled: oneTap,
    googleSignInMode: 'id_token',
    indexedDbBackupCleanupEnabled: false,
    indexedDbBackupsEnabled: false,
    plusCheckoutEnabled: false,
    studyGuidanceEnabled: false,
    supabasePublishableKey: 'test-publishable-key',
    supabaseUrl: SUPABASE_ORIGIN,
    turnstileSiteKey: turnstile ? '1x00000000000000000000AA' : '',
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

function authenticatedSession() {
  return {
    access_token: fakeAccessToken(AUTHENTICATED_USER_ID),
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'google', providers: ['google'] },
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

async function installProviderMocks(page) {
  await page.addInitScript(() => {
    const tracker = {
      google: {
        autoSelectDisabled: false,
        cancelCount: 0,
        configurations: [],
        disableAutoSelectCount: 0,
        promptCount: 0,
        renderOptions: []
      },
      posthogIdentify: [],
      turnstile: {
        configurations: {},
        nextWidgetId: 1,
        removeCount: 0,
        resetCount: 0
      }
    }
    window.__edeniaAuthE2e = tracker

    let activeGoogleConfiguration = null
    tracker.google.triggerAutomaticCredential = () => {
      if (tracker.google.autoSelectDisabled) return false
      activeGoogleConfiguration?.callback?.({
        credential: 'mock-google-id-token'
      })
      return true
    }
    window.google = {
      accounts: {
        id: {
          cancel() {
            tracker.google.cancelCount += 1
          },
          disableAutoSelect() {
            tracker.google.autoSelectDisabled = true
            tracker.google.disableAutoSelectCount += 1
          },
          initialize(configuration) {
            activeGoogleConfiguration = configuration
            tracker.google.configurations.push({
              autoSelect: configuration.auto_select,
              nonce: configuration.nonce
            })
          },
          prompt() {
            tracker.google.promptCount += 1
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
      capture() {},
      get_session_replay_url() { return null },
      identify(userId, properties) {
        tracker.posthogIdentify.push([userId, { ...properties }])
      },
      init() {},
      register() {},
      reset() {},
      setPersonProperties() {}
    }
  })
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

async function proxyProductionOrigin(page) {
  await page.route(`${PRODUCTION_ORIGIN}/**`, async route => {
    const requested = new URL(route.request().url())
    const localUrl = `http://localhost:8000${requested.pathname}${requested.search}`
    const response = await route.fetch({ url: localUrl })
    await route.fulfill({ response })
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

test('official Google and Turnstile flows preserve local study data', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installProviderMocks(page)
  const requests = []
  await stubSupabase(page, requests)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/?internal_test=1')
  await seedStudyState(page, {
    setupCompleted: true,
    walkthroughCompleted: true
  })
  await page.goto('/?internal_test=1&account=1')
  const studyStateBefore = await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))

  const officialGoogleButton = page.locator(
    '#accountGoogleIdentityButton button'
  )
  await expect(officialGoogleButton).toBeVisible()
  await expect(page.locator('#accountGoogleBtn')).toBeHidden()
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
  await expect(page).toHaveURL(/^http:\/\/localhost:8000\//)

  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.google.disableAutoSelectCount
  ))).toBe(1)

  const emailInput = page.locator('#accountEmail')
  const emailButton = page.locator('#accountEmailBtn')
  await expect(emailButton).toBeEnabled()
  await emailInput.fill('LEARNER@EXAMPLE.COM')
  await emailButton.click()
  await expect(page.getByText(
    'Check your email for the secure sign-in link.'
  )).toBeVisible()
  const otpRequest = requests.find(request => request.path === '/auth/v1/otp')
  expect(otpRequest.body).toMatchObject({
    create_user: true,
    email: 'learner@example.com',
    gotrue_meta_security: { captcha_token: 'mock-turnstile-token' }
  })
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.turnstile.resetCount
  ))).toBe(1)
  expect(await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))).toBe(studyStateBefore)
})

test('One Tap waits for both onboarding milestones and sign-out suppresses auto-select', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installProviderMocks(page)
  await proxyProductionOrigin(page)
  const requests = []
  await stubSupabase(page, requests)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({ oneTap: true, turnstile: false }),
    contentType: 'text/javascript',
    status: 200
  }))

  const internalUrl = `${PRODUCTION_ORIGIN}/?internal_test=1`
  await page.goto(internalUrl)
  await seedStudyState(page, {
    setupCompleted: false,
    walkthroughCompleted: false
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => (
    window.__edeniaAuthE2e.google.promptCount
  ))).toBe(0)

  await seedStudyState(page, {
    setupCompleted: true,
    walkthroughCompleted: false
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => (
    window.__edeniaAuthE2e.google.promptCount
  ))).toBe(0)

  await seedStudyState(page, {
    setupCompleted: true,
    walkthroughCompleted: true
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.google.promptCount
  ))).toBe(1)
  const eligibleConfiguration = await page.evaluate(() => (
    window.__edeniaAuthE2e.google.configurations.at(-1)
  ))
  expect(eligibleConfiguration.autoSelect).toBe(true)
  const studyStateBefore = await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))

  expect(await page.evaluate(() => (
    window.__edeniaAuthE2e.google.triggerAutomaticCredential()
  ))).toBe(true)
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.posthogIdentify.at(-1)
  ))).toEqual([
    AUTHENTICATED_USER_ID,
    { auth_method: 'google', email: 'learner@example.com' }
  ])
  expect(await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))).toBe(studyStateBefore)
  await expect(page).toHaveURL(new RegExp(`^${PRODUCTION_ORIGIN.replaceAll('.', '\\.')}/`))

  await page.goto(`${PRODUCTION_ORIGIN}/?internal_test=1&account=1`)
  await expect(page.locator('.settings-account-toggle')).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaAuthE2e.google.disableAutoSelectCount
  ))).toBe(1)
  await page.waitForTimeout(100)
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  expect(await page.evaluate(() => (
    localStorage.getItem('edenia_v1_internal_test')
  ))).toBe(studyStateBefore)
})
