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
      videoOrganizationEnabled: true,
      channelVideoFormatToggleEnabled: true,
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

async function readIndexedDbBackups(
  page,
  databaseName = 'edenia_state_backups_v1'
) {
  return page.evaluate(databaseName => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('backups')) {
        request.result.createObjectStore('backups', { keyPath: 'id' })
      }
    }
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
  }), databaseName)
}

test('verified migration preserves progression and PostHog before removing legacy backups', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await page.clock.setFixedTime(fixedNow)
  await configureIndexedDbBackups(page, { enabled: false })
  await page.goto('/')
  await waitForApplication(page)
  await expect(page.locator('.backup-panel')).not.toHaveClass(/\bhidden\b/)

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
  await expect(page.locator('#backupRestoreDialog')).toBeVisible()
  await page.locator('#backupRestoreConfirm').click()
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
    const originalSetItem = profileBrowserStorage.setItem
    profileBrowserStorage.setItem = function (key, value) {
      if (key === 'edenia_v1') {
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

  await page.goto('/?internal_test=2')
  await waitForApplication(page)
  expect(await page.evaluate(() => ({
    normalBackups: localStorage.getItem('edenia_v1_backups'),
    normalPrimary: localStorage.getItem('edenia_v1')
  }))).toEqual({
    normalBackups: JSON.stringify([{
      id: 'normal-from-internal-test',
      createdAt: '2026-08-09T03:59:00.000Z',
      reason: 'automatic backup',
      sandbox: false,
      state: JSON.parse(normalPrimary)
    }]),
    normalPrimary
  })
  const testValues = await page.evaluate(() => {
    const primary = localStorage.getItem('edenia_v1_internal_test_2')
    localStorage.setItem('edenia_v1_internal_test_2_backups', '[{"test":true}]')
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
    backups: localStorage.getItem('edenia_v1_internal_test_2_backups'),
    analyticsState: localStorage.getItem(
      'edenia_posthog_state_internal_test_v2'
    ),
    posthogIdentity: localStorage.getItem('ph_phc_test_posthog'),
    primary: localStorage.getItem('edenia_v1_internal_test_2')
  }))).toEqual({
    backupPanelHidden: false,
    backups: '[{"test":true}]',
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

async function openBackupProbe(page) {
  const { build } = await import('esbuild')
  const compiled = await build({
    stdin: {
      contents: "export { createIndexedDbBackupStorage } from './src/state/indexed-db-backups.js'",
      resolveDir: process.cwd()
    },
    bundle: true, format: 'esm', write: false
  })
  await page.route('**/__backup-module.js', route => route.fulfill({
    contentType: 'text/javascript', body: compiled.outputFiles[0].text
  }))
  await page.route('**/__backup-probe', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Backup startup test</title>'
  }))
  await page.goto('/__backup-probe')
}

test('opening an unchanged backup bank reads once and writes no recovery snapshots', async ({ page }, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await openBackupProbe(page)
  const result = await page.evaluate(async () => {
    const { createIndexedDbBackupStorage } = await import('/__backup-module.js')
    const entry = { id: 'kept', createdAt: '2026-08-01', reason: 'automatic backup', sandbox: false, state: { config: {}, videos: {}, anki: {} } }
    let raw = JSON.stringify([entry])
    const options = {
      backupKey: 'bank', databaseName: 'startup-backups', cleanupLegacy: true,
      isValidEntry: entry => Boolean(entry.id && entry.state?.videos),
      legacyStorage: { getItem: () => raw, setItem: (_key, value) => { raw = value }, removeItem: () => { raw = null } }
    }
    const first = await createIndexedDbBackupStorage(options)
    first.close()
    let puts = 0, reads = 0
    const put = IDBObjectStore.prototype.put, getAll = IDBObjectStore.prototype.getAll
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'backups') puts++
      return put.apply(this, args)
    }
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'backups') reads++
      return getAll.apply(this, args)
    }
    const next = await createIndexedDbBackupStorage(options)
    const entries = (await next.flush()).entries
    next.close()
    return { puts, reads, entries, raw, entry }
  })
  expect(result.puts).toBe(0)
  expect(result.reads).toBe(1)
  expect(result.entries).toEqual([result.entry])
  expect(result.raw).toBeNull()
})

test('backup startup optimization preserves migration, concurrent additions, isolated reads, and failed-write rollback', async ({ page }, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await openBackupProbe(page)
  const result = await page.evaluate(async () => {
    const { createIndexedDbBackupStorage } = await import('/__backup-module.js')
    const entry = id => ({ id, createdAt: '2026-08-01', reason: 'automatic backup', sandbox: false, state: { config: {}, videos: {}, anki: {} } })
    let raw = JSON.stringify([entry('first')])
    const options = {
      backupKey: 'bank', databaseName: 'startup-backups', cleanupLegacy: true,
      isValidEntry: entry => Boolean(entry.id && entry.state?.videos),
      legacyStorage: { getItem: () => raw, setItem: (_key, value) => { raw = value }, removeItem: () => { raw = null } }
    }
    const first = await createIndexedDbBackupStorage(options)
    const stale = await createIndexedDbBackupStorage(options)
    raw = JSON.stringify([entry('migrated')])
    let puts = 0
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) { if (this.name === 'backups') puts++; return put.apply(this, args) }
    const migrated = await createIndexedDbBackupStorage(options)
    const migrationWrites = puts
    migrated.close()
    first.storage.setItem('bank', JSON.stringify([entry('first'), entry('added')]))
    await first.flush()
    stale.storage.setItem('bank', JSON.stringify([{ ...entry('first'), reason: 'edited' }]))
    const flushed = await stale.flush()
    const ids = flushed.entries.map(entry => entry.id).sort()
    flushed.entries[0].reason = 'outside mutation'
    const isolated = JSON.parse(stale.storage.getItem('bank')).every(entry => entry.reason !== 'outside mutation')
    const beforeFailure = stale.storage.getItem('bank')
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'backups') throw new DOMException('Test quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
    stale.storage.setItem('bank', JSON.stringify([entry('failed')]))
    const failed = await stale.flush()
    const rolledBack = stale.storage.getItem('bank') === beforeFailure
    IDBObjectStore.prototype.put = put
    const reopened = await createIndexedDbBackupStorage(options)
    const persistedIds = (await reopened.flush()).entries.map(entry => entry.id).sort()
    first.close(); stale.close(); reopened.close()
    return { migrationWrites, raw, ids, isolated, failed: failed.persisted, rolledBack, persistedIds }
  })
  expect(result).toEqual({
    migrationWrites: 1, raw: null, ids: ['added', 'first', 'migrated'],
    isolated: true, failed: false, rolledBack: true, persistedIds: ['added', 'first', 'migrated']
  })
})
