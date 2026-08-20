import { expect, test } from '../support/network-fixture.mjs'

const internalRuntimeConfig = `window.EDENIA_CONFIG = {
  youtubeApiKey: '',
  freePlusEnabled: false,
  plusCheckoutEnabled: false,
  accountFeaturesRollout: 'internal',
  googleIdentityClientId: '1234567890-test.apps.googleusercontent.com',
  googleSignInMode: 'id_token',
  studyGuidanceEnabled: false,
  indexedDbBackupsEnabled: false,
  indexedDbBackupCleanupEnabled: false,
  supabaseUrl: 'https://account-ui-test.supabase.co',
  supabasePublishableKey: 'test-publishable-key'
}`
const accountReturnOrigin = 'http://localhost:8000'
const servedApplicationOrigin = `http://localhost:${Number(
  process.env.EDENIA_TEST_NORMAL_PORT || 8000
)}`

async function useAccountReturnOrigin(page) {
  if (servedApplicationOrigin === accountReturnOrigin) return

  await page.route(`${accountReturnOrigin}/**`, async route => {
    const requestedUrl = new URL(route.request().url())
    const servedUrl = new URL(
      `${requestedUrl.pathname}${requestedUrl.search}`,
      `${servedApplicationOrigin}/`
    )
    const response = await route.fetch({ url: servedUrl.href })
    await route.fulfill({ response })
  })
}

async function seedAccountStep(page, {
  locale = 'en',
  storageKey = 'edenia_v1_internal_test'
} = {}) {
  await page.evaluate(({ nextLocale, nextStorageKey }) => {
    const state = window.defaultState(4, [], 'light', [], nextLocale)
    const reachedAt = new Date().toISOString()
    state.onboarding.introSeenAt = reachedAt
    state.onboarding.accountStepReachedAt = reachedAt
    state.learnerProfile = {
      languages: ['mandarin'],
      level: 'beginner',
      selectedChannelCatalogIds: [],
      createdAt: reachedAt,
      updatedAt: reachedAt
    }
    localStorage.setItem(nextStorageKey, JSON.stringify(state))
  }, {
    nextLocale: locale,
    nextStorageKey: storageKey
  })
}

async function installGoogleButtonMock(page) {
  await page.addInitScript(() => {
    let configuration = null
    window.google = {
      accounts: {
        id: {
          initialize(value) {
            configuration = value
          },
          renderButton(element) {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = 'Continue with Google'
            button.setAttribute('aria-label', 'Continue with Google')
            button.addEventListener('click', () => configuration?.callback?.({
              credential: 'mock-google-id-token'
            }))
            element.replaceChildren(button)
          }
        }
      }
    }
  })
}

test('gated Account onboarding supports email sign-in and responsive completion', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'phone-small',
    'tablet-portrait'
  ].includes(testInfo.project.name))
  await useAccountReturnOrigin(page)
  await installGoogleButtonMock(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: internalRuntimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))

  const otpRequests = []
  await page.route('https://account-ui-test.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/auth/v1/otp') {
      otpRequests.push(request.postDataJSON())
    }
    await route.fulfill({ json: {}, status: 200 })
  })

  await page.goto(`${accountReturnOrigin}/?internal_test=1`)
  await seedAccountStep(page)
  await page.goto(`${accountReturnOrigin}/?internal_test=1&account=1`)

  const panel = page.locator('#onboardingPanel')
  await expect(panel).toBeVisible()
  await expect(page.locator('#settingsPanel')).toBeHidden()
  await expect(panel.getByRole('heading', {
    name: 'Sign in or create your account'
  })).toBeVisible()
  await expect(panel.getByText(
    'Use Google, or enter a six-digit code sent to your email.'
  )).toBeVisible()
  await expect(page.locator('#onboardingProgressLabel')).toHaveText('Step 4 of 4')
  await expect(panel.getByText(
    'Your current study progress stays in this browser.'
  )).toHaveCount(0)

  const googleButton = panel.getByRole('button', { name: 'Continue with Google' })
  const emailButton = panel.getByRole('button', { name: 'Email me a code' })
  const emailInput = page.locator('#onboardingAccountEmail')
  const skipButton = panel.getByRole('button', { name: 'Skip for now' })
  await expect(googleButton).toBeEnabled()
  await expect(emailButton).toBeEnabled()
  await expect(emailButton).toHaveClass(/\bbtn-secondary\b/)

  await expect(emailButton).toHaveCSS('border-width', '2px')
  await expect(emailInput).toHaveCSS('border-radius', '10px')
  await expect(skipButton).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')

  const geometry = await panel.evaluate(element => ({
    panelWidth: element.scrollWidth,
    panelClientWidth: element.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))
  expect(geometry.panelWidth).toBeLessThanOrEqual(geometry.panelClientWidth)
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)

  await emailInput.fill('LEARNER@EXAMPLE.COM')
  await emailButton.click()
  await expect.poll(() => otpRequests.length).toBe(1)
  expect(otpRequests[0]).toMatchObject({
    email: 'learner@example.com',
    create_user: true
  })
  await expect(panel.getByText(
    'Enter the six-digit code sent to your email.'
  )).toBeVisible()
  const codeInput = page.locator('#onboardingAccountEmailCode')
  await expect(codeInput).toBeVisible()
  await expect(codeInput).toHaveAttribute('inputmode', 'numeric')
  await expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code')

  await skipButton.click()
  await expect(panel).toBeHidden()
  const completion = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return {
      accountStepReachedAt: state.onboarding.accountStepReachedAt,
      setupCompleted: state.onboarding.setupCompleted
    }
  })
  expect(completion).toEqual({
    accountStepReachedAt: null,
    setupCompleted: true
  })
})

test('switch-off onboarding retains immediate accountless completion', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: internalRuntimeConfig.replace(
      "accountFeaturesRollout: 'internal'",
      "accountFeaturesRollout: 'off'"
    ),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/')
  await seedAccountStep(page, { storageKey: 'edenia_v1' })
  await page.reload()

  const panel = page.locator('#onboardingPanel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Your starter study feed' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'One last step' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Start my journey' })).toBeVisible()
})
