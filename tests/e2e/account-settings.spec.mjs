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
const disabledRuntimeConfig = runtimeConfig.replace(
  "accountFeaturesRollout: 'internal'",
  "accountFeaturesRollout: 'off'"
)

const localeExpectations = {
  en: [
    'Account',
    'Continue with Google'
  ],
  'zh-Hant': [
    '帳戶',
    '使用 Google 繼續'
  ],
  'zh-Hans': [
    '账户',
    '使用 Google 继续'
  ],
  es: [
    'Cuenta',
    'Continuar con Google'
  ],
  fr: [
    'Compte',
    'Continuer avec Google'
  ]
}

const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const SECOND_AUTHENTICATED_USER_ID = '223e4567-e89b-42d3-a456-426614174001'
const ACCOUNT_AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'

function fakeAccessToken(userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: 1893456000,
    role: 'authenticated',
    sub: userId
  })}.test-signature`
}

function createAuthenticatedSession({ userId, email }) {
  return {
    access_token: fakeAccessToken(userId),
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: `test-refresh-token-${userId}`,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-08-01T00:00:00.000Z'
    }
  }
}

async function seedAuthenticatedSession(page, {
  userId = AUTHENTICATED_USER_ID,
  email = 'internal@example.com'
} = {}) {
  await page.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(session))
    }
  }, {
    storageKey: ACCOUNT_AUTH_STORAGE_KEY,
    session: createAuthenticatedSession({ userId, email })
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

async function readLocalStudyEvidence(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return {
      streak: state.streak,
      totalRewatchCount: state.totalRewatchCount,
      onboarding: state.onboarding
    }
  })
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

  for (const [locale, [title, googleLabel]] of Object.entries(
    localeExpectations
  )) {
    await seedReadyState(page, locale)
    await page.goto('/?internal_test=1&account=1')

    const settings = page.locator('#settingsPanel')
    const account = page.locator('#accountSettings')
    await expect(settings).toBeVisible()
    await expect(account).toBeVisible()
    await expect(account.getByRole('button', { name: title })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    await expect(account.getByRole('button', { name: googleLabel })).toBeEnabled()
    await expect(page.locator('.settings-account-reminders')).toBeHidden()
    await expect(page.locator('#accountExportBtn')).toHaveCount(0)
    await expect(page.locator('#plusAccountSettings')).toHaveCount(0)
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

test('first signed-in load enables both email types and each toggle saves automatically', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const savedRows = []
  let storedPreference = null
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
      await route.fulfill({
        json: storedPreference ? [storedPreference] : [],
        status: 200
      })
      return
    }
    const row = request.postDataJSON()
    savedRows.push(row)
    storedPreference = {
      ...row,
      created_at: '2026-08-11T00:00:00.000Z'
    }
    await route.fulfill({
      json: storedPreference,
      status: 201
    })
  })

  await page.goto('/?internal_test=1')
  await seedReadyState(page, 'en')
  await page.goto('/?internal_test=1&account=1')

  const accountToggle = page.locator('.settings-account-toggle')
  await expect(accountToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#accountSettingsContent')).toBeHidden()
  await accountToggle.click()
  await expect(accountToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  const buttonAppearance = locator => locator.evaluate(element => {
    const styles = getComputedStyle(element)
    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor,
      borderRadius: styles.borderRadius,
      color: styles.color
    }
  })
  const [signOutAppearance, walkthroughAppearance] = await Promise.all([
    buttonAppearance(page.locator('#accountSignOutBtn')),
    buttonAppearance(page.locator('[data-settings-replay-action="walkthrough"]'))
  ])
  expect(signOutAppearance).toEqual(walkthroughAppearance)
  await expect.poll(() => savedRows.length).toBe(1)
  await expect(page.locator('#reminderPreferenceFields')).toBeEnabled()
  await expect(page.locator('#streakRemindersEnabled')).toBeChecked()
  await expect(page.locator('#discoveryEmailsEnabled')).toBeChecked()
  expect(savedRows[0]).toMatchObject({
    user_id: AUTHENTICATED_USER_ID,
    enabled: false,
    streak_reminders_enabled: true,
    discovery_emails_enabled: true,
    locale: 'en',
    consent_version: 'edenia-email-preferences-v2',
    consent_source: 'account-default'
  })
  expect(savedRows[0]).not.toHaveProperty('email')
  await page.locator('#streakRemindersEnabled').uncheck()
  await expect.poll(() => savedRows.length).toBe(2)
  expect(savedRows[1]).toMatchObject({
    user_id: AUTHENTICATED_USER_ID,
    enabled: false,
    streak_reminders_enabled: false,
    discovery_emails_enabled: true,
    consent_version: 'edenia-email-preferences-v2',
    consent_source: 'settings'
  })
  await expect(page.locator('#reminderFeedback')).toBeHidden()
})

test('shared-browser account switching clears the previous cloud view only', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const preferences = {
    [AUTHENTICATED_USER_ID]: {
      user_id: AUTHENTICATED_USER_ID,
      streak_reminders_enabled: true,
      discovery_emails_enabled: false,
      timezone: 'Asia/Taipei',
      locale: 'en',
      consent_granted_at: '2026-08-11T01:00:00.000Z',
      consent_revoked_at: null,
      consent_version: 'edenia-email-preferences-v2',
      consent_source: 'settings',
      created_at: '2026-08-11T01:00:00.000Z',
      updated_at: '2026-08-11T01:00:00.000Z'
    },
    [SECOND_AUTHENTICATED_USER_ID]: {
      user_id: SECOND_AUTHENTICATED_USER_ID,
      streak_reminders_enabled: false,
      discovery_emails_enabled: true,
      timezone: 'Europe/Paris',
      locale: 'fr',
      consent_granted_at: '2026-08-11T02:00:00.000Z',
      consent_revoked_at: null,
      consent_version: 'edenia-email-preferences-v2',
      consent_source: 'settings',
      created_at: '2026-08-11T02:00:00.000Z',
      updated_at: '2026-08-11T02:00:00.000Z'
    }
  }
  await seedAuthenticatedSession(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://account-ui-test.supabase.co/auth/v1/logout**', route => (
    route.fulfill({ body: '', status: 204 })
  ))
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/subscriptions')) {
      await route.fulfill({ json: [], status: 200 })
      return
    }
    if (url.pathname.endsWith('/reminder_preferences')) {
      const userId = String(url.searchParams.get('user_id') || '').replace(/^eq\./, '')
      await route.fulfill({ json: preferences[userId] || null, status: 200 })
      return
    }
    await route.fulfill({ json: [], status: 200 })
  })

  await page.goto('/?internal_test=1')
  await seedReadyState(page, 'en')
  await page.evaluate(() => {
    const storageKey = 'edenia_v1_internal_test'
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.streak = {
      current: 3,
      longest: 7,
      lastActivityDate: '2026-08-10'
    }
    state.totalRewatchCount = 4
    localStorage.setItem(storageKey, JSON.stringify(state))
  })
  await page.goto('/?internal_test=1&account=1')

  const localProgressBefore = await readLocalStudyEvidence(page)
  await expect(page.locator('.settings-account-toggle')).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountUserEmail')).toHaveText('internal@example.com')
  await expect(page.locator('#streakRemindersEnabled')).toBeChecked()
  await expect(page.locator('#discoveryEmailsEnabled')).not.toBeChecked()

  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('.settings-account-toggle')).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  await expect(page.locator('.settings-account-reminders')).toBeHidden()
  await expect.poll(() => readLocalStudyEvidence(page)).toEqual(localProgressBefore)

  await page.evaluate(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session))
  }, {
    storageKey: ACCOUNT_AUTH_STORAGE_KEY,
    session: createAuthenticatedSession({
      userId: SECOND_AUTHENTICATED_USER_ID,
      email: 'second@example.com'
    })
  })
  await page.reload()

  await page.locator('[data-settings-shell-action="open"]').click()
  await expect(page.locator('.settings-account-toggle')).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  await page.locator('.settings-account-toggle').click()
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await expect(page.locator('#accountUserEmail')).toHaveText('second@example.com')
  await expect(page.locator('#streakRemindersEnabled')).not.toBeChecked()
  await expect(page.locator('#discoveryEmailsEnabled')).toBeChecked()
  expect(await readLocalStudyEvidence(page)).toEqual(localProgressBefore)
})

test('ordinary public mode keeps the internal Account settings section unavailable', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const exportRequests = []
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route(
    'https://account-ui-test.supabase.co/functions/v1/export-account-data',
    route => {
      exportRequests.push(route.request().url())
      return route.fulfill({ json: {}, status: 200 })
    }
  )

  await page.goto('/')
  await expect(page.locator('#accountSettings')).toBeHidden()
  await expect(page.locator('#accountExportBtn')).toHaveCount(0)
  expect(exportRequests).toEqual([])
})

test('global off switch blocks the account deep link and reminder reads', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const reminderRequests = []
  const exportRequests = []
  await seedAuthenticatedSession(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: disabledRuntimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/reminder_preferences')) reminderRequests.push(url.href)
    await route.fulfill({ json: [], status: 200 })
  })
  await page.route(
    'https://account-ui-test.supabase.co/functions/v1/export-account-data',
    route => {
      exportRequests.push(route.request().url())
      return route.fulfill({ json: {}, status: 200 })
    }
  )

  await page.goto('/?internal_test=1')
  await seedReadyState(page, 'en')
  await page.goto('/?internal_test=1&account=1')

  await expect(page.locator('#settingsPanel')).toBeHidden()
  await expect(page).toHaveURL(/\?internal_test=1&account=1$/)
  await page.locator('[data-settings-shell-action="open"]').click()
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await expect(page.locator('#accountSettings')).toBeHidden()
  await expect(page.locator('#plusAccountSettings')).toHaveCount(0)
  await expect(page.getByText('Edenia Plus account', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Restore Plus', { exact: true })).toHaveCount(0)
  expect(reminderRequests).toEqual([])
  expect(exportRequests).toEqual([])
})
