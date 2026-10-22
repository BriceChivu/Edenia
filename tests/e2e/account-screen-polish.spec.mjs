import { expect, test } from '../support/network-fixture.mjs'

const origin = 'https://account-polish-fixture.supabase.co'
const storageKey = 'edenia_v1_auth_trial_v1'
const owner = '123e4567-e89b-42d3-a456-426614174000'
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const session = {
  access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ aud: 'authenticated', role: 'authenticated', sub: owner, exp: 1893456000 })}.fixture`,
  refresh_token: 'polish-refresh', expires_at: 1893456000, expires_in: 31536000, token_type: 'bearer',
  user: { id: owner, email: 'learner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [] }
}

async function configure(page) {
  // Local Auth permits the fixed callback origin, including on CI's 4173 server.
  const servedOrigin = `http://localhost:${Number(process.env.EDENIA_TEST_NORMAL_PORT || 8000)}`
  if (servedOrigin !== 'http://localhost:8000') {
    await page.route('http://localhost:8000/**', async route => {
      const requested = new URL(route.request().url())
      const served = new URL(
        `${requested.pathname.slice(1)}${requested.search}`,
        `${servedOrigin}${process.env.EDENIA_TEST_BASE_PATH || '/'}`
      )
      const response = await route.fetch({ url: served.href })
      await route.fulfill({ response })
    })
  }
  await page.addInitScript(() => {
    let configuration
    window.google = { accounts: { id: {
      initialize(value) { configuration = value },
      renderButton(element) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = 'Continue with Google'
        button.onclick = () => configuration?.callback?.({ credential: 'mock-google-token' })
        element.replaceChildren(button)
      }
    } } }
  })
  await page.route('**/config.local.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.EDENIA_CONFIG=${JSON.stringify({
    authTrialEnabled: true, accountFeaturesRollout: 'off', tinySwordsEnabled: false,
    indexedDbProfileEnabled: false, indexedDbBackupsEnabled: false,
    googleIdentityClientId: '1234567890-test.apps.googleusercontent.com', googleSignInMode: 'id_token',
    supabaseUrl: origin, supabasePublishableKey: 'test-key', youtubeApiKey: ''
  })}` }))
}

for (const method of ['email', 'google', 'existing session']) {
  test(`internal onboarding collapses email and continues after ${method} authentication`, async ({ page }, testInfo) => {
    test.skip(!['desktop-standard', 'tablet-portrait', 'phone-standard', 'phone-small'].includes(testInfo.project.name))
    await configure(page)
    if (method === 'existing session') {
      await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey + '_plus_auth_v1', session })
    }
    let envelope
    const openingRequests = []
    await page.route(`${origin}/**`, async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/auth/v1/verify' || path === '/auth/v1/token') return route.fulfill({ json: session })
      if (path === '/auth/v1/user') return route.fulfill({ json: session.user })
      if (['/rest/v1/rpc/resolve_my_learner_profile', '/rest/v1/rpc/open_my_learner_profile'].includes(path)) {
        const body = route.request().postDataJSON()
        openingRequests.push(body)
        envelope = body.p_onboarding_profile || envelope
        if (!envelope) return route.fulfill({ json: [{ status: 'onboarding_required' }] })
        return route.fulfill({ json: [{ status: 'profile_ready', created: true, profile_id: profileId, generation: 1, revision: 1, envelope, reset_state: { status: 'none' } }] })
      }
      if (path === '/rest/v1/learner_profile_heads') return route.fulfill({ json: { user_id: owner, profile_id: profileId, generation: 1, revision: 1 } })
      if (path === '/rest/v1/rpc/read_my_latest_learner_profile_reset') return route.fulfill({ json: [{ status: 'none' }] })
      return route.fulfill({ json: {} })
    })
    await page.goto('http://localhost:8000/?internal_test=1')
    await expect(page.locator('#introTrailer')).toBeVisible()
    await page.evaluate(() => finishIntroTrailer())
    await page.locator('[data-language-id="mandarin"]').click()
    await page.locator('[data-personalized-onboarding-action="continue-language"]').click()
    await page.locator('[data-level-id="beginner"]').click()
    await page.locator('[data-personalized-onboarding-step="channels"]').click()
    await page.locator('[data-personalized-onboarding-step="account"]').click()
    const panel = page.locator('#onboardingPanel')
    const disclosure = panel.locator('.account-email-disclosure')
    if (method !== 'existing session') {
      await expect(panel.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
      await expect(disclosure).not.toHaveAttribute('open')
      await expect(page.locator('#onboardingAccountEmail')).toBeHidden()
    }
    if (method === 'email') {
      await page.screenshot({ path: testInfo.outputPath('email-collapsed.png'), fullPage: true })
      await disclosure.locator('summary').focus()
      await disclosure.locator('summary').press('Enter')
      await expect(page.locator('#onboardingAccountEmail')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('email-expanded.png'), fullPage: true })
      await page.locator('#onboardingAccountEmail').fill('learner@example.test')
      await panel.getByRole('button', { name: 'Email me a code' }).click()
      await expect(disclosure).toHaveAttribute('open')
      await page.locator('#onboardingAccountEmailCode').fill('123456')
      await panel.getByRole('button', { name: 'Verify code' }).click()
    } else if (method === 'google') {
      await panel.getByRole('button', { name: 'Continue with Google' }).click()
    }
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect(panel).toBeHidden()
    expect(openingRequests.length).toBeGreaterThan(0)
    await expect(page.locator('.onboarding-account-identity')).toHaveCount(0)
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).onboarding.setupCompleted, storageKey)).toBe(true)
    await expect(page.locator('#learnerProfileSyncTitle')).toHaveCount(0)
  })
}

test('internal locked sign-in removes Back and keeps email collapsed', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard', 'phone-small'].includes(testInfo.project.name))
  await configure(page)
  await page.addInitScript(({ storageKey, owner, profileId }) => {
    const at = '2026-10-14T00:00:00.000Z'
    localStorage.setItem(storageKey, JSON.stringify({ config: { locale: 'en', channels: [] }, learnerProfile: { languages: ['mandarin'], level: 'beginner', createdAt: at, updatedAt: at }, onboarding: { introSeenAt: at, setupCompleted: true, setupCompletedAt: at }, videos: {}, anki: {} }))
    localStorage.setItem(storageKey + '_learner_profile_access_v1', JSON.stringify({ version: 1, ownerId: owner, profileId, generation: 1, revision: 1, activatedAt: Date.now(), activationId: null, onboardingFinalizationPending: false }))
  }, { storageKey, owner, profileId })
  await page.route(`${origin}/**`, route => route.fulfill({ json: {} }))
  await page.goto('http://localhost:8000/?internal_test=1')
  await page.locator('#learnerProfileAccessOpenSignIn').click()
  const authentication = page.locator('#learnerProfileAccessAuthentication')
  await expect(authentication).toBeVisible()
  await expect(authentication.locator('[data-profile-access-action="close-sign-in"]')).toHaveCount(0)
  await expect(page.locator('#accountEmail')).toBeHidden()
  await expect(page.locator('#accountEmailDivider')).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('locked-sign-in.png'), fullPage: true })
  await page.locator('#accountEmailDivider').press('Enter')
  await expect(page.locator('#accountEmail')).toBeVisible()
  await page.evaluate(() => renderAccountSettings({ sessionState: 'loading' }))
  await expect(page.locator('#accountLoading')).toBeVisible()
  const ratio = await page.locator('#accountLoading').evaluate(element => parseFloat(getComputedStyle(element).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize))
  expect(ratio).toBeCloseTo(1.1)
})
