import { expect, test } from '../support/network-fixture.mjs'

const runtimeConfig = `window.EDENIA_CONFIG = {
  youtubeApiKey: '',
  freePlusEnabled: false,
  plusCheckoutEnabled: false,
  accountFeaturesRollout: 'internal',
  studyGuidanceEnabled: false,
  indexedDbBackupsEnabled: false,
  indexedDbBackupCleanupEnabled: false,
  supabaseUrl: 'https://account-ui-test.supabase.co',
  supabasePublishableKey: 'test-publishable-key'
}`

const localeExpectations = {
  en: ['Account & reminders', 'Continue with Google'],
  'zh-Hant': ['帳戶與提醒', '使用 Google 繼續'],
  'zh-Hans': ['账户与提醒', '使用 Google 继续'],
  es: ['Cuenta y recordatorios', 'Continuar con Google'],
  fr: ['Compte et rappels', 'Continuer avec Google']
}

const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

function fakeAccessToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: 1893456000,
    role: 'authenticated',
    sub: AUTHENTICATED_USER_ID
  })}.test-signature`
}

async function seedAuthenticatedSession(page) {
  await page.addInitScript(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session))
  }, {
    storageKey: 'edenia_v1_internal_test_plus_auth_v1',
    session: {
      access_token: fakeAccessToken(),
      expires_at: 1893456000,
      expires_in: 31536000,
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      user: {
        id: AUTHENTICATED_USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'internal@example.com',
        app_metadata: { provider: 'google', providers: ['google'] },
        user_metadata: {},
        identities: [],
        created_at: '2026-08-01T00:00:00.000Z'
      }
    }
  })
}

async function seedReadyState(page, locale) {
  await page.evaluate(nextLocale => {
    const state = window.defaultState(4, [], 'light', [], nextLocale)
    const completedAt = new Date().toISOString()
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  }, locale)
}

test('internal Account settings are localized and responsive without exposing public mode', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/?internal_test=1')
  await seedReadyState(page, 'en')

  for (const [locale, [title, googleLabel]] of Object.entries(localeExpectations)) {
    await seedReadyState(page, locale)
    await page.goto('/?internal_test=1&account=1')

    const settings = page.locator('#settingsPanel')
    const account = page.locator('#accountSettings')
    await expect(settings).toBeVisible()
    await expect(account).toBeVisible()
    await expect(account.getByRole('heading', { name: title })).toBeVisible()
    await expect(account.getByRole('button', { name: googleLabel })).toBeEnabled()
    await expect(page.locator('#reminderScheduleFields')).toHaveAttribute('disabled', '')
    await expect(page.locator('#reminderSaveBtn')).toBeDisabled()
    await expect(page.locator('#plusAccountSettings')).toBeHidden()
    await expect(page).toHaveURL(/\?internal_test=1$/)

    const geometry = await account.evaluate(element => ({
      accountWidth: element.scrollWidth,
      accountClientWidth: element.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }))
    expect(geometry.accountWidth).toBeLessThanOrEqual(geometry.accountClientWidth)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  }
})

test('signed-in internal user can save a preference without creating delivery', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const savedRows = []
  await seedAuthenticatedSession(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/subscriptions')) {
      await route.fulfill({ json: [], status: 200 })
      return
    }
    if (!url.pathname.endsWith('/reminder_preferences')) {
      await route.fulfill({ json: [], status: 200 })
      return
    }
    if (request.method() === 'GET') {
      await route.fulfill({ json: [], status: 200 })
      return
    }
    const row = request.postDataJSON()
    savedRows.push(row)
    await route.fulfill({
      json: {
        ...row,
        created_at: '2026-08-11T00:00:00.000Z'
      },
      status: 201
    })
  })

  await page.goto('/?internal_test=1')
  await seedReadyState(page, 'en')
  await page.goto('/?internal_test=1&account=1')

  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await expect(page.locator('#reminderScheduleFields')).toBeEnabled()
  await page.locator('#reminderEnabled').check()
  const dayControls = page.locator('input[name="reminderDay"]')
  for (let index = 0; index < await dayControls.count(); index += 1) {
    await dayControls.nth(index).uncheck()
  }
  await page.locator('input[name="reminderDay"][value="2"]').check()
  await page.locator('input[name="reminderDay"][value="4"]').check()
  await page.locator('#reminderLocalTime').fill('08:15')
  await page.locator('#reminderTimezone').fill('Asia/Taipei')
  await expect(page.locator('#reminderSaveBtn')).toBeDisabled()
  await page.locator('#reminderConsent').check()
  await page.locator('#reminderSaveBtn').click()

  await expect.poll(() => savedRows.length).toBe(1)
  expect(savedRows[0]).toMatchObject({
    user_id: AUTHENTICATED_USER_ID,
    enabled: true,
    days: [2, 4],
    local_time: '08:15',
    timezone: 'Asia/Taipei',
    locale: 'en',
    consent_version: 'reminder-email-v1',
    consent_source: 'settings'
  })
  expect(savedRows[0]).not.toHaveProperty('email')
  await expect(page.locator('#reminderFeedback')).toContainText(
    'No email has been scheduled or sent.'
  )
})

test('ordinary public mode keeps the internal Account settings section unavailable', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/')
  await expect(page.locator('#accountSettings')).toBeHidden()
})
