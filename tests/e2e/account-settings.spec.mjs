import { expect, test } from '../support/network-fixture.mjs'
import { readFile } from 'node:fs/promises'

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
    'Account & reminders',
    'Continue with Google',
    'visible to anyone using this browser profile'
  ],
  'zh-Hant': [
    '帳戶與提醒',
    '使用 Google 繼續',
    '任何使用此瀏覽器設定檔的人都能看到'
  ],
  'zh-Hans': [
    '账户与提醒',
    '使用 Google 继续',
    '任何使用此浏览器配置文件的人都能看到'
  ],
  es: [
    'Cuenta y recordatorios',
    'Continuar con Google',
    'visible para cualquiera que use este perfil del navegador'
  ],
  fr: [
    'Compte et rappels',
    'Continuer avec Google',
    'visible par toute personne utilisant ce profil de navigateur'
  ]
}

const exportLocaleExpectations = {
  en: ['Download account data', 'Study progress saved in this browser is not included.'],
  'zh-Hant': ['下載帳戶資料', '儲存在此瀏覽器中的學習進度不會包含在內'],
  'zh-Hans': ['下载账户数据', '不包括保存在此浏览器中的学习进度'],
  es: ['Descargar datos de la cuenta', 'No se incluye el progreso de estudio guardado en este navegador'],
  fr: ['Télécharger les données du compte', 'La progression enregistrée dans ce navigateur n’est pas incluse']
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

  for (const [locale, [title, googleLabel, sharedBrowserCopy]] of Object.entries(
    localeExpectations
  )) {
    await seedReadyState(page, locale)
    await page.goto('/?internal_test=1&account=1')

    const settings = page.locator('#settingsPanel')
    const account = page.locator('#accountSettings')
    await expect(settings).toBeVisible()
    await expect(account).toBeVisible()
    await expect(account.getByRole('heading', { name: title })).toBeVisible()
    await expect(account.getByRole('button', { name: googleLabel })).toBeEnabled()
    await expect(account).toContainText(sharedBrowserCopy)
    await expect(page.locator('#reminderScheduleFields')).toHaveAttribute('disabled', '')
    await expect(page.locator('#reminderSaveBtn')).toBeDisabled()
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

test('signed-in account export copy is localized and responsive', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await seedAuthenticatedSession(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', route => (
    route.fulfill({ json: [], status: 200 })
  ))

  await page.goto('/?internal_test=1')
  for (const [locale, [buttonLabel, scopeCopy]] of Object.entries(
    exportLocaleExpectations
  )) {
    await seedReadyState(page, locale)
    await page.goto('/?internal_test=1&account=1')

    const account = page.locator('#accountSettings')
    const exportSection = page.locator('.settings-account-export')
    await expect(page.locator('#accountSignedIn')).toBeVisible()
    await expect(exportSection.getByRole('button', { name: buttonLabel })).toBeEnabled()
    await expect(exportSection).toContainText(scopeCopy)

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

test('signed-in user downloads only the matching server export', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const exportRequests = []
  const exportedData = {
    schema_version: 'edenia-account-export-v1',
    generated_at: '2026-08-12T00:00:00.000Z',
    scope: {
      server_data: true,
      current_device_progress: false
    },
    account: {
      id: AUTHENTICATED_USER_ID,
      email: 'internal@example.com',
      providers: ['google']
    },
    billing: { subscription: null },
    cloud_backup_snapshots: [],
    reminders: { preference: null, delivery_occurrences: [] }
  }
  await seedAuthenticatedSession(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', route => (
    route.fulfill({ json: [], status: 200 })
  ))
  await page.route(
    'https://account-ui-test.supabase.co/functions/v1/export-account-data',
    async route => {
      const request = route.request()
      exportRequests.push({
        method: request.method(),
        body: request.postDataJSON()
      })
      await new Promise(resolve => setTimeout(resolve, 150))
      await route.fulfill({ json: exportedData, status: 200 })
    }
  )

  await page.goto('/?internal_test=1')
  await seedReadyState(page, 'en')
  await page.evaluate(() => {
    const storageKey = 'edenia_v1_internal_test'
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.streak = { current: 6, longest: 9, lastActivityDate: '2026-08-11' }
    state.totalRewatchCount = 12
    localStorage.setItem(storageKey, JSON.stringify(state))
  })
  await page.goto('/?internal_test=1&account=1')
  const localProgressBefore = await readLocalStudyEvidence(page)

  const downloadPromise = page.waitForEvent('download')
  await page.locator('#accountExportBtn').click()
  await expect(page.locator('#accountExportBtn')).toBeDisabled()
  await expect(page.locator('#accountExportBtn')).toHaveText('Preparing download…')
  await expect(page.locator('.settings-account-export')).toHaveAttribute(
    'aria-busy',
    'true'
  )
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^edenia-account-data-\d{4}-\d{2}-\d{2}\.json$/
  )
  const downloadedData = JSON.parse(await readFile(await download.path(), 'utf8'))

  expect(exportRequests).toEqual([{ method: 'POST', body: {} }])
  expect(downloadedData).toEqual(exportedData)
  expect(downloadedData.account.id).toBe(AUTHENTICATED_USER_ID)
  expect(downloadedData.scope.current_device_progress).toBe(false)
  expect(downloadedData).not.toHaveProperty('streak')
  expect(downloadedData).not.toHaveProperty('totalRewatchCount')
  expect(await readLocalStudyEvidence(page)).toEqual(localProgressBefore)
  await expect(page.locator('#accountExportFeedback')).toContainText(
    'Account data downloaded.'
  )
  await expect(page.locator('.settings-account-export')).toHaveAttribute(
    'aria-busy',
    'false'
  )
})

test('shared-browser account switching clears the previous cloud view only', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const preferences = {
    [AUTHENTICATED_USER_ID]: {
      user_id: AUTHENTICATED_USER_ID,
      enabled: true,
      days: [1, 3],
      local_time: '06:10',
      timezone: 'Asia/Taipei',
      locale: 'en',
      consent_granted_at: '2026-08-11T01:00:00.000Z',
      consent_revoked_at: null,
      consent_version: 'reminder-email-v1',
      consent_source: 'settings',
      created_at: '2026-08-11T01:00:00.000Z',
      updated_at: '2026-08-11T01:00:00.000Z'
    },
    [SECOND_AUTHENTICATED_USER_ID]: {
      user_id: SECOND_AUTHENTICATED_USER_ID,
      enabled: false,
      days: [2, 4],
      local_time: '21:45',
      timezone: 'Europe/Paris',
      locale: 'fr',
      consent_granted_at: null,
      consent_revoked_at: null,
      consent_version: 'reminder-email-v1',
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
  await expect(page.locator('#accountUserEmail')).toHaveText('internal@example.com')
  await expect(page.locator('#reminderLocalTime')).toHaveValue('06:10')

  await page.locator('#accountSignOutBtn').click()
  await expect(page.locator('#accountSignedOut')).toBeVisible()
  await expect(page.locator('#reminderScheduleFields')).toHaveAttribute('disabled', '')
  await expect(page.locator('#reminderLocalTime')).toHaveValue('19:00')
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
  await expect(page.locator('#accountSignedIn')).toBeVisible()
  await expect(page.locator('#accountUserEmail')).toHaveText('second@example.com')
  await expect(page.locator('#reminderLocalTime')).toHaveValue('21:45')
  await expect(page.locator('#reminderTimezone')).toHaveValue('Europe/Paris')
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
  await expect(page.locator('#accountExportBtn')).toBeHidden()
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
