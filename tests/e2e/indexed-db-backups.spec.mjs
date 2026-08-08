import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-09T04:00:00.000Z')
const STORAGE_PROJECT_NAMES = new Set([
  'desktop-standard',
  'webkit-storage'
])

async function configureIndexedDbBackups(
  page,
  { cleanup = true, enabled = true } = {}
) {
  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = ${JSON.stringify({
      youtubeApiKey: '',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      videoOrganizationEnabled: false,
      channelVideoFormatToggleEnabled: false,
      studyGuidanceEnabled: false,
      indexedDbBackupsEnabled: enabled,
      indexedDbBackupCleanupEnabled: enabled && cleanup,
      supabaseUrl: '',
      supabasePublishableKey: ''
    })}\n`,
    contentType: 'text/javascript',
    status: 200
  }))
}

async function waitForApplication(page) {
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
}

async function readIndexedDbBackups(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('edenia_state_backups_v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('backups', 'readonly')
      const entriesRequest = transaction.objectStore('backups').getAll()
      entriesRequest.onerror = () => reject(entriesRequest.error)
      entriesRequest.onsuccess = () => {
        resolve(entriesRequest.result)
        database.close()
      }
    }
  }))
}

test('verified migration preserves progression and PostHog before removing legacy backups', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await page.clock.setFixedTime(fixedNow)
  await configureIndexedDbBackups(page, { enabled: false })
  await page.goto('/')
  await waitForApplication(page)

  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-08-01T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const before = await page.evaluate(() => {
    const primary = localStorage.getItem('edenia_v1')
    const backupState = JSON.parse(primary)
    backupState.config.weeklyGoalHours = 7
    const backups = JSON.stringify([{
      id: 'legacy-verified',
      createdAt: '2026-08-09T03:59:00.000Z',
      reason: 'before reset',
      sandbox: false,
      state: backupState
    }])
    const analyticsState = JSON.stringify({
      schemaVersion: 2,
      protected: 'analytics-state'
    })
    localStorage.setItem('edenia_v1_backups', backups)
    localStorage.setItem('edenia_posthog_state_v2', analyticsState)
    localStorage.setItem('ph_phc_test_posthog', 'protected-distinct-id')
    return { analyticsState, backups, primary }
  })

  await page.unroute('**/config.local.js')
  await configureIndexedDbBackups(page)
  await page.reload()
  await waitForApplication(page)
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )).toBeNull()

  const after = await page.evaluate(() => ({
    analyticsState: localStorage.getItem('edenia_posthog_state_v2'),
    marker: localStorage.getItem('edenia_v1_backups_indexed_db_v1'),
    posthogIdentity: localStorage.getItem('ph_phc_test_posthog'),
    primary: localStorage.getItem('edenia_v1')
  }))
  expect(after).toEqual({
    analyticsState: before.analyticsState,
    marker: '1',
    posthogIdentity: 'protected-distinct-id',
    primary: before.primary
  })

  const migrated = await readIndexedDbBackups(page)
  expect(migrated).toHaveLength(1)
  expect(migrated[0]).toMatchObject({
    id: 'legacy-verified',
    reason: 'before reset',
    state: {
      config: { weeklyGoalHours: 7 }
    }
  })

  await page.locator('.gear-btn').click()
  await page.locator('.backup-toggle').click()
  await page.locator(
    '[data-settings-backup-action="restore"][data-backup-id="legacy-verified"]'
  ).click()
  await expect(page.locator('#toast')).toHaveText('Backup restored')
  expect(await page.evaluate(
    () => JSON.parse(localStorage.getItem('edenia_v1')).config.weeklyGoalHours
  )).toBe(7)
  expect(await readIndexedDbBackups(page)).toHaveLength(2)
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )).toBeNull()

  const primaryBeforeFailedReset = await page.evaluate(() => {
    const primary = localStorage.getItem('edenia_v1')
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'edenia_v1') {
        throw new DOMException('Test quota limit', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    }
    return primary
  })
  await page.locator('[data-settings-reset-confirm-action="show"]').click()
  const reset = page.locator(
    '[data-settings-reset-confirm-action="confirm"]'
  )
  await reset.click()
  await expect(page.locator('#toast')).toHaveText(
    'Could not save this change. '
      + 'Your existing progress was not changed.'
  )
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )).toBe(primaryBeforeFailedReset)
  expect(await readIndexedDbBackups(page)).toHaveLength(3)
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )).toBeNull()
  await expect(reset).not.toHaveAttribute('aria-disabled')
})

test('malformed legacy data and test-mode progression are never broadly cleared', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await page.clock.setFixedTime(fixedNow)
  await configureIndexedDbBackups(page)
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(() => {
    localStorage.setItem('edenia_v1_backups', '{malformed')
  })
  await page.reload()
  await waitForApplication(page)
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )).toBe('{malformed')

  const normalPrimary = await page.evaluate(() => {
    const primary = localStorage.getItem('edenia_v1')
    localStorage.setItem('edenia_v1_backups', JSON.stringify([{
      id: 'normal-from-internal-test',
      createdAt: '2026-08-09T03:59:00.000Z',
      reason: 'automatic backup',
      sandbox: false,
      state: JSON.parse(primary)
    }]))
    return primary
  })

  await page.goto('/?internal_test=1')
  await waitForApplication(page)
  expect(await page.evaluate(() => ({
    normalBackups: localStorage.getItem('edenia_v1_backups'),
    normalPrimary: localStorage.getItem('edenia_v1')
  }))).toEqual({
    normalBackups: null,
    normalPrimary
  })
  const testValues = await page.evaluate(() => {
    const primary = localStorage.getItem('edenia_v1_internal_test')
    localStorage.setItem('edenia_v1_internal_test_backups', '[{"test":true}]')
    localStorage.setItem(
      'edenia_posthog_state_internal_test_v2',
      '{"protected":true}'
    )
    localStorage.setItem('ph_phc_test_posthog', 'protected-test-identity')
    return { primary }
  })
  await page.reload()
  await waitForApplication(page)

  expect(await page.evaluate(() => ({
    backupPanelHidden: document.querySelector('.backup-panel')
      .classList.contains('hidden'),
    backups: localStorage.getItem('edenia_v1_internal_test_backups'),
    analyticsState: localStorage.getItem(
      'edenia_posthog_state_internal_test_v2'
    ),
    posthogIdentity: localStorage.getItem('ph_phc_test_posthog'),
    primary: localStorage.getItem('edenia_v1_internal_test')
  }))).toEqual({
    backupPanelHidden: true,
    backups: null,
    analyticsState: '{"protected":true}',
    posthogIdentity: 'protected-test-identity',
    primary: testValues.primary
  })

  await page.goto('http://localhost:8001/?sandbox=1')
  await waitForApplication(page)
  const sandboxValues = await page.evaluate(() => {
    const primary = localStorage.getItem('edenia_v1_sandbox')
    localStorage.setItem('edenia_v1_sandbox_backups', '[{"test":true}]')
    localStorage.setItem('edenia_posthog_state_v2', '{"sandbox":true}')
    localStorage.setItem('ph_phc_test_posthog', 'protected-sandbox-identity')
    return { primary }
  })
  await page.reload()
  await waitForApplication(page)
  expect(await page.evaluate(() => ({
    backupPanelHidden: document.querySelector('.backup-panel')
      .classList.contains('hidden'),
    backups: localStorage.getItem('edenia_v1_sandbox_backups'),
    analyticsState: localStorage.getItem('edenia_posthog_state_v2'),
    posthogIdentity: localStorage.getItem('ph_phc_test_posthog'),
    primary: localStorage.getItem('edenia_v1_sandbox')
  }))).toEqual({
    backupPanelHidden: true,
    backups: null,
    analyticsState: '{"sandbox":true}',
    posthogIdentity: 'protected-sandbox-identity',
    primary: sandboxValues.primary
  })
})
