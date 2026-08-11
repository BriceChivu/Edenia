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
