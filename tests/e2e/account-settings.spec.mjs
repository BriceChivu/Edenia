import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'

const ACCOUNT_RETURN_ORIGIN = 'http://localhost:8000'

const runtimeConfig = `window.EDENIA_CONFIG = {
  youtubeApiKey: '',
  freePlusEnabled: false,
  plusCheckoutEnabled: false,
  accountFeaturesRollout: 'public',
  studyGuidanceEnabled: false,
  indexedDbBackupsEnabled: false,
  indexedDbBackupCleanupEnabled: false,
  supabaseUrl: 'https://account-ui-test.supabase.co',
  supabasePublishableKey: 'test-publishable-key'
}`
const googleRuntimeConfig = runtimeConfig.replace(
  "accountFeaturesRollout: 'public',",
  "accountFeaturesRollout: 'public',\n  googleIdentityClientId: '1234567890-test.apps.googleusercontent.com',\n  googleSignInMode: 'id_token',"
)
const disabledRuntimeConfig = runtimeConfig.replace(
  "accountFeaturesRollout: 'public'",
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
const ACCOUNT_AUTH_STORAGE_KEY = 'edenia_v1_plus_auth_v1'

function fakeAccessToken(userId, email) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    amr: [{ method: 'oauth' }],
    email,
    exp: 1893456000,
    role: 'authenticated',
    sub: userId
  })}.test-signature`
}

function createAuthenticatedSession({ userId, email }) {
  return {
    access_token: fakeAccessToken(userId, email),
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
  email = 'internal@example.com',
  sessionStorageKey = ACCOUNT_AUTH_STORAGE_KEY
} = {}) {
  await page.route('https://account-ui-test.supabase.co/auth/v1/user', route => {
    const authorization = String(
      route.request().headers().authorization || ''
    )
    const token = authorization.replace(/^Bearer\s+/i, '')
    let payload = null
    try {
      payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'))
    } catch {}
    if (!payload?.sub || !payload?.email) {
      return route.fulfill({ json: { message: 'invalid token' }, status: 401 })
    }
    return route.fulfill({
      json: {
        id: payload.sub,
        email: payload.email,
        app_metadata: { provider: 'google', providers: ['google'] },
        user_metadata: {},
        identities: []
      },
      status: 200
    })
  })
  await page.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(session))
    }
  }, {
    storageKey: sessionStorageKey,
    session: createAuthenticatedSession({ userId, email })
  })
}

async function seedReadyState(page, locale, storageKey = 'edenia_v1') {
  await page.evaluate(({ nextLocale, profileStorageKey }) => {
    const state = window.defaultState(4, [], 'light', [], nextLocale)
    const completedAt = new Date().toISOString()
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    localStorage.setItem(profileStorageKey, JSON.stringify(state))
  }, { nextLocale: locale, profileStorageKey: storageKey })
}

async function readLocalStudyEvidence(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    return {
      streak: state.streak,
      totalRewatchCount: state.totalRewatchCount,
      onboarding: state.onboarding
    }
  })
}

async function installGoogleButtonMock(page) {
  await page.addInitScript(() => {
    const labels = {
      en: 'Continue with Google',
      es: 'Continuar con Google',
      fr: 'Continuer avec Google',
      'zh-CN': '使用 Google 继续',
      'zh-TW': '使用 Google 繼續'
    }
    window.google = {
      accounts: {
        id: {
          initialize() {},
          renderButton(element, options) {
            const button = document.createElement('button')
            button.type = 'button'
            const label = labels[options.locale] || labels.en
            button.textContent = label
            button.setAttribute('aria-label', label)
            element.replaceChildren(button)
          }
        }
      }
    }
  })
}

test('Account settings are localized and responsive', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'phone-small',
    'tablet-portrait'
  ].includes(testInfo.project.name))
  await installGoogleButtonMock(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: googleRuntimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/')
  await seedReadyState(page, 'en')

  for (const [locale, [title, googleLabel]] of Object.entries(
    localeExpectations
  )) {
    await seedReadyState(page, locale)
    await page.goto('/?account=1')

    const settings = page.locator('#settingsPanel')
    const account = page.locator('#accountSettings')
    await expect(settings).toBeVisible()
    await expect(account).toBeVisible()
    await expect(account.getByRole('button', { name: title })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    const googleButton = account.getByRole('button', { name: googleLabel })
    await expect(googleButton).toBeEnabled()
    await expect(page.locator('#accountGoogleIdentityButton')).toHaveClass(
      /\baccount-google-identity-button\b/
    )
    await expect(page.locator('#accountEmail')).toHaveCSS('border-radius', '10px')
    await expect(page.locator('.settings-account-reminders')).toBeHidden()
    await expect(page.locator('#accountExportBtn')).toHaveCount(0)
    await expect(page.locator('#plusAccountSettings')).toHaveCount(0)
    await expect(page).toHaveURL(/\/$/)

    const geometry = await account.evaluate(element => ({
      accountWidth: element.scrollWidth,
      accountClientWidth: element.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }))
    expect(geometry.accountWidth).toBeLessThanOrEqual(geometry.accountClientWidth)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)

    const spacing = await settings.evaluate(element => {
      const rect = selector => element.querySelector(selector).getBoundingClientRect()
      const gap = (first, second) => rect(second).top - rect(first).bottom
      return {
        accountToHowTo: gap('#accountSettings', '.settings-howto-group'),
        howToToActivity: gap('.settings-howto-group', '.activity-log-panel'),
        activityToReplay: gap('.activity-log-panel', '.settings-replay-group'),
        replayButtonCount: element.querySelectorAll('.settings-replay-group .walkthrough-replay-btn').length,
        replayToData: gap('.settings-replay-group', '.settings-data-group')
      }
    })
    expect(spacing.accountToHowTo).toBe(10)
    expect(spacing.howToToActivity).toBe(10)
    expect(spacing.replayButtonCount).toBe(1)
    expect(spacing.activityToReplay).toBeGreaterThan(spacing.howToToActivity)
    expect(spacing.replayToData).toBeGreaterThan(spacing.howToToActivity)
  }
})

for (const dashboard of ['ordinary', 'main']) test(`default-on email choices need explicit enrollment and save independently in all locales (${dashboard})`, async ({ page, pageDiagnostics }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  test.setTimeout(120_000)
  const profileStorageKey = dashboard === 'main' ? 'edenia_v1_auth_trial_v1' : 'edenia_v1'
  const entryUrl = dashboard === 'main' ? '/?internal_test=1' : '/'
  const settingsUrl = dashboard === 'main' ? '/?internal_test=1&account=1' : '/?account=1'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  let cloudEnvelope = null
  let cloudRevision = 1
  const receipts = new Map()
  const acceptedEnvelope = async locale => (await createPortableLearnerProfileEnvelope({
    config: { locale, ankiEnabled: false, channels: [], weeklyGoalHours: 4 }, videos: {}, anki: {},
    learnerProfile: { languages: ['french'], level: 'beginner', createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z' },
    onboarding: { introSeenAt: '2026-10-08T00:00:00Z', setupCompleted: true, setupCompletedAt: '2026-10-08T00:00:00Z', walkthroughCompleted: true, walkthroughCompletedAt: '2026-10-08T00:00:00Z' },
    cityProgress: { maxLevelIndex: 0, experienceVersion: 1 }
  })).envelope
  if (dashboard === 'main') {
    cloudEnvelope = await acceptedEnvelope('en')
    await page.addInitScript(({ storageKey, owner, profileId, envelope }) => {
      if (sessionStorage.getItem('email-owned-profile-installed')) return
      localStorage.setItem(storageKey, JSON.stringify(envelope.profile))
      localStorage.setItem(storageKey + '_learner_profile_access_v1', JSON.stringify({
        version: 1, ownerId: owner, profileId, generation: 1, revision: 1, activatedAt: Date.now(), activationId: null, onboardingFinalizationPending: false
      }))
      localStorage.setItem(storageKey + '_learner_profile_sync_v1', JSON.stringify({
        version: 1, ownerId: owner, profileId, generation: 1, acceptedRevision: 1, pending: null, queued: null
      }))
      sessionStorage.setItem('email-owned-profile-installed', '1')
    }, { storageKey: profileStorageKey, owner: AUTHENTICATED_USER_ID, profileId, envelope: cloudEnvelope })
  }
  const calls = []
  let stored = null
  let failNextSave = false
  const enrollmentLabels = { en: 'Enable emails', 'zh-Hant': '啟用電子郵件', 'zh-Hans': '启用电子邮件', es: 'Activar correos', fr: 'Activer les e-mails' }
  await seedAuthenticatedSession(page, { sessionStorageKey: `${profileStorageKey}_plus_auth_v1` })
  const dashboardConfig = dashboard === 'main' ? runtimeConfig.replace("accountFeaturesRollout: 'public',", "accountFeaturesRollout: 'off', authTrialEnabled: true, indexedDbProfileEnabled: false, tinySwordsEnabled: false,") : runtimeConfig
  await page.route('**/config.local.js', route => route.fulfill({ body: dashboardConfig, contentType: 'text/javascript', status: 200 }))
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (dashboard === 'main') {
      const identity = () => ({ profile_id: profileId, generation: 1, revision: cloudRevision })
      if (name === 'learner_profile_heads') return route.fulfill({ json: { user_id: AUTHENTICATED_USER_ID, ...identity(), last_replacement_revision: 0 } })
      if (name === 'open_my_learner_profile' || name === 'resolve_my_learner_profile') return route.fulfill({ json: [{
        status: 'profile_ready', created: false, ...identity(), envelope: cloudEnvelope, reset_state: { status: 'none' }
      }] })
      if (name === 'read_my_latest_learner_profile_reset') return route.fulfill({ json: [{ status: 'none' }] })
      if (['commit_my_learner_profile', 'commit_my_learner_profile_handoff'].includes(name)) {
        const args = route.request().postDataJSON()
        if (receipts.has(args.p_operation_id)) return route.fulfill({ json: [{ ...receipts.get(args.p_operation_id), status: 'already_accepted' }] })
        cloudEnvelope = args.p_envelope
        cloudRevision = args.p_base_revision + 1
        const receipt = { status: 'accepted', ...identity(), base_revision: args.p_base_revision,
          payload_sha256: cloudEnvelope.integrity.payloadSha256,
          request_sha256: sha256Base64UrlSync(canonicalizeJson({ baseRevision: args.p_base_revision, envelope: args.p_envelope,
            generation: args.p_generation, operationId: args.p_operation_id, ownerId: AUTHENTICATED_USER_ID, profileId: args.p_profile_id })) }
        receipts.set(args.p_operation_id, receipt)
        return route.fulfill({ json: [receipt] })
      }
      if (name === 'read_my_learner_profile_write_receipt') {
        const receipt = receipts.get(route.request().postDataJSON().p_operation_id)
        return route.fulfill({ json: [{ ...(receipt ? { ...receipt, status: 'already_accepted' } : { status: 'not_accepted' }), last_replacement_revision: 0 }] })
      }
    }
    if (!['get_my_reminder_preferences', 'save_my_reminder_choice', 'enroll_my_reminder_choices'].includes(name)) {
      return route.fulfill({ json: [], status: 200 })
    }
    const args = route.request().postDataJSON()
    calls.push({ name, args })
    expect(args.p_expected_owner).toBe(AUTHENTICATED_USER_ID)
    if (name === 'get_my_reminder_preferences') {
      stored ||= { user_id: AUTHENTICATED_USER_ID, enabled: false, streak_reminders_enabled: true,
        discovery_emails_enabled: true, timezone: args.p_timezone, locale: args.p_locale,
        enrollment_epoch: 0, streak_choice_version: 0, discovery_choice_version: 0,
        streak_enrollment_version: null, discovery_enrollment_version: null, consent_granted_at: null,
        consent_revoked_at: null, delivery_paused: true, consent_source: 'account-default' }
    } else if (name === 'save_my_reminder_choice') {
      if (failNextSave) {
        failNextSave = false
        return route.fulfill({ json: { code: 'XX000', message: 'fixture write unavailable' }, status: 500 })
      }
      const prefix = args.p_choice
      stored[`${prefix === 'streak' ? 'streak_reminders' : 'discovery_emails'}_enabled`] = args.p_enabled
      stored[`${prefix}_choice_version`]++
      if (!args.p_enabled) stored[`${prefix}_enrollment_version`] = null
    } else {
      stored.streak_enrollment_version = args.p_streak ? 'edenia-email-enrollment-v3' : null
      stored.discovery_enrollment_version = args.p_discovery ? 'edenia-email-enrollment-v3' : null
      stored.enrollment_epoch++
      stored.consent_granted_at = '2026-10-27T10:00:00Z'
      stored.consent_revoked_at = null
    }
    return route.fulfill({ json: { ...stored }, status: 200 })
  })
  await page.goto(entryUrl)
  await expect.poll(() => page.evaluate(filename => [...document.scripts].filter(script =>
    new URL(script.src, location.href).pathname.endsWith('/' + filename)).length,
  dashboard === 'main' ? 'app.js' : 'production-app.js')).toBe(1)
  for (const locale of Object.keys(localeExpectations)) {
    stored = null
    const start = calls.length
    if (dashboard === 'main') { cloudEnvelope = await acceptedEnvelope(locale); cloudRevision++ }
    else await seedReadyState(page, locale, profileStorageKey)
    await page.goto(settingsUrl)
    if (dashboard === 'main') await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state', 'active')
    await expect(page.locator('#settingsPanel')).toBeVisible()
    await page.locator('.settings-account-toggle').click()
    await expect(page.locator('#accountSignedIn')).toBeVisible()
    await expect(page.locator('#reminderPreferenceFields')).toBeEnabled()
    await expect(page.locator('#streakRemindersEnabled')).toBeChecked()
    await expect(page.locator('#discoveryEmailsEnabled')).toBeChecked()
    await expect(page.locator('#reminderEnrollBtn')).toHaveText(enrollmentLabels[locale])
    await expect(page.locator('#reminderDeliveryPaused')).toBeVisible()
    await expect(page.locator('#reminderEnrollmentDisclosure')).toContainText('10 XP')
    expect(calls.slice(start).some(call => call.name === 'enroll_my_reminder_choices')).toBe(false)
    expect(stored.consent_granted_at).toBeNull()
    await page.locator('#streakRemindersEnabled').uncheck()
    await expect(page.locator('#reminderPreferenceFields')).toBeEnabled()
    expect(calls.at(-1)).toMatchObject({ name: 'save_my_reminder_choice', args: { p_choice: 'streak', p_enabled: false, p_expected_owner: AUTHENTICATED_USER_ID } })
    expect(calls.at(-1).args).not.toHaveProperty('p_discovery')
    await expect(page.locator('#discoveryEmailsEnabled')).toBeChecked()
    await page.locator('#streakRemindersEnabled').check()
    await expect(page.locator('#reminderPreferenceFields')).toBeEnabled()
    await page.locator('#reminderEnrollBtn').click()
    await expect(page.locator('#reminderEnrollBtn')).toBeHidden()
    expect(calls.at(-1)).toMatchObject({ name: 'enroll_my_reminder_choices', args: { p_streak: true, p_discovery: true, p_expected_owner: AUTHENTICATED_USER_ID } })
    expect(stored.streak_enrollment_version).toBe('edenia-email-enrollment-v3')
    expect(stored.discovery_enrollment_version).toBe('edenia-email-enrollment-v3')
    failNextSave = true
    await page.locator('#discoveryEmailsEnabled').uncheck()
    await expect(page.locator('#reminderFeedback')).toHaveAttribute('role', 'alert')
    await expect(page.locator('#discoveryEmailsEnabled')).toBeChecked()
    expect(stored.discovery_emails_enabled).toBe(true)
    await page.reload()
    await page.evaluate(() => openSettings())
    await page.locator('.settings-account-toggle').click()
    await expect(page.locator('#discoveryEmailsEnabled')).toBeChecked()
    await expect(page.locator('#reminderEnrollBtn')).toBeHidden()
    // A footer unsubscribe revokes both types. Reload must expose that state;
    // only a fresh owner action can enroll the newly selected type again.
    Object.assign(stored, { streak_reminders_enabled: false, discovery_emails_enabled: false,
      streak_enrollment_version: null, discovery_enrollment_version: null, consent_revoked_at: '2026-10-27T10:05:00Z',
      enrollment_epoch: stored.enrollment_epoch + 1,
      streak_choice_version: stored.streak_choice_version + 1, discovery_choice_version: stored.discovery_choice_version + 1 })
    await page.reload()
    await page.evaluate(() => openSettings())
    await page.locator('.settings-account-toggle').click()
    await expect(page.locator('#streakRemindersEnabled')).not.toBeChecked()
    await expect(page.locator('#discoveryEmailsEnabled')).not.toBeChecked()
    await expect(page.locator('#reminderEnrollBtn')).toBeDisabled()
    await page.locator('#streakRemindersEnabled').check()
    await expect(page.locator('#reminderEnrollBtn')).toBeEnabled()
    expect(stored.streak_enrollment_version).toBeNull()
    await page.locator('#reminderEnrollBtn').click()
    await expect(page.locator('#reminderEnrollBtn')).toBeHidden()
    expect(stored.consent_revoked_at).toBeNull()
    expect(stored.streak_enrollment_version).toBe('edenia-email-enrollment-v3')
    expect(stored.discovery_enrollment_version).toBeNull()
    const geometry = await page.locator('.settings-account-reminders').evaluate(element => ({
      width: element.scrollWidth, clientWidth: element.clientWidth,
      documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth
    }))
    expect(geometry.width).toBeLessThanOrEqual(geometry.clientWidth)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  }
  // Each locale deliberately induced exactly one HTTP 500. Keep the global
  // diagnostics guard active for every other console/runtime error.
  expect(pageDiagnostics).toEqual(Array(5).fill('console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)'))
  pageDiagnostics.length = 0
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
  let signOutCount = 0
  await seedAuthenticatedSession(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://account-ui-test.supabase.co/auth/v1/logout**', route => {
    signOutCount += 1
    return route.fulfill({ body: '', status: 204 })
  })
  await page.route('https://account-ui-test.supabase.co/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/subscriptions')) {
      await route.fulfill({ json: [], status: 200 })
      return
    }
    if (url.pathname.endsWith('/get_my_reminder_preferences')) {
      const token = request.headers().authorization?.replace(/^Bearer\s+/i, '')
      const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub
      await route.fulfill({ json: preferences[userId] || null, status: 200 })
      return
    }
    await route.fulfill({ json: [], status: 200 })
  })

  await page.goto('/')
  await seedReadyState(page, 'en')
  await page.evaluate(() => {
    const storageKey = 'edenia_v1'
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.streak = {
      current: 3,
      longest: 7,
      lastActivityDate: '2026-08-10'
    }
    state.totalRewatchCount = 4
    localStorage.setItem(storageKey, JSON.stringify(state))
  })
  await page.goto('/?account=1')

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
  await expect.poll(() => signOutCount).toBe(1)
  await expect.poll(() => page.evaluate(
    storageKey => localStorage.getItem(storageKey),
    ACCOUNT_AUTH_STORAGE_KEY
  )).toBeNull()

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

test('rollout off keeps Account settings unavailable', async ({
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

test('global off switch preserves the retained session and blocks the account deep link', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  // A fresh empty profile receives its weekly summary only on Sunday.
  // Keep the preservation check independent of the day CI happens to run.
  await page.clock.setFixedTime(new Date('2026-08-23T04:00:00.000Z'))
  const providerRequests = []
  page.on('request', request => {
    if (request.url().includes('account-ui-test.supabase.co')) providerRequests.push(request.url())
  })
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
    if (url.pathname.endsWith('/get_my_reminder_preferences')) reminderRequests.push(url.href)
    await route.fulfill({ json: [], status: 200 })
  })
  await page.route(
    'https://account-ui-test.supabase.co/functions/v1/export-account-data',
    route => {
      exportRequests.push(route.request().url())
      return route.fulfill({ json: {}, status: 200 })
    }
  )

  await page.goto('/')
  await seedReadyState(page, 'en')
  // Capture an opened profile, after its initial automatic study summary is
  // persisted, so the next navigation compares the same initialized settings.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#studyInsightCard')).toHaveAttribute('data-insight-id', 'weekly-summary')
  const retained = await page.evaluate(() => ({
    profile: localStorage.getItem('edenia_v1'),
    session: localStorage.getItem('edenia_v1_plus_auth_v1')
  }))
  await page.goto('/?account=1')

  await expect(page.locator('#settingsPanel')).toBeHidden()
  await expect(page).toHaveURL(/\?account=1$/)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('[data-settings-shell-action="open"]')).toHaveCount(1)
  const after = await page.evaluate(() => ({
    profile: localStorage.getItem('edenia_v1'),
    session: localStorage.getItem('edenia_v1_plus_auth_v1')
  }))
  expect(after.session).toBe(retained.session)
  const beforeProfile = JSON.parse(retained.profile)
  expect(JSON.parse(after.profile)).toMatchObject({
    config: beforeProfile.config, videos: beforeProfile.videos,
    streak: beforeProfile.streak, totalRewatchCount: beforeProfile.totalRewatchCount
  })
  expect(providerRequests).toEqual([])
  await expect(page.locator('#accountSettings')).toBeHidden()
  await expect(page.locator('#plusAccountSettings')).toHaveCount(0)
  await expect(page.getByText('Edenia Plus account', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Restore Plus', { exact: true })).toHaveCount(0)
  expect(reminderRequests).toEqual([])
  expect(exportRequests).toEqual([])
})

test('unconfigured Turnstile stays hidden and sends no CAPTCHA in localhost Account settings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig, contentType: 'text/javascript'
  }))
  const requests = []
  await page.route('https://account-ui-test.supabase.co/auth/v1/otp', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/`)
  await seedReadyState(page, 'en')
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?account=1`)
  await expect(page.locator('#accountEmail')).toBeVisible()
  await expect(page.locator('#accountTurnstile')).toBeHidden()
  await expect(page.locator('#accountTurnstileStatus')).toBeHidden()
  await expect(page.locator('#accountTurnstileStatus')).toBeEmpty()
  await expect(page.locator('#accountEmailBtn')).toBeEnabled()
  await page.locator('#accountEmail').fill('not-an-email')
  await page.locator('#accountEmailBtn').click()
  expect(requests).toHaveLength(0)
  await page.locator('#accountEmail').fill('learner@example.com')
  await page.locator('#accountEmailBtn').click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].gotrue_meta_security?.captcha_token).toBeUndefined()
  await expect(page.locator('#accountEmailCode')).toBeVisible()
  await expect(page.locator('#accountTurnstileStatus')).toBeHidden()
  await expect(page.locator('#accountTurnstileStatus')).toBeEmpty()
})

test('configured Turnstile script without an API stays visible and blocks tokenless settings requests', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig.replace("youtubeApiKey: '',", "youtubeApiKey: '', turnstileSiteKey: 'synthetic-site-key',"),
    contentType: 'text/javascript'
  }))
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
    body: '// Synthetic loaded script with unavailable Turnstile API.',
    contentType: 'text/javascript'
  }))
  const requests = []
  await page.route('https://account-ui-test.supabase.co/auth/v1/otp', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/`)
  await seedReadyState(page, 'en')
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?account=1`)
  await expect(page.locator('#accountTurnstileStatus')).toBeVisible()
  await expect(page.locator('#accountTurnstileStatus')).toHaveAttribute('data-turnstile-tone', 'error')
  await expect(page.locator('#accountEmailBtn')).toBeDisabled()
  await page.locator('#accountEmail').fill('learner@example.com')
  // Exercise the submit handler even if a caller bypasses the disabled button.
  await page.locator('#accountEmail').locator('..').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await expect(page.locator('#accountFeedback')).toBeVisible()
  expect(requests).toHaveLength(0)
  await expect(page.locator('#accountEmailBtn')).toBeDisabled()
})
