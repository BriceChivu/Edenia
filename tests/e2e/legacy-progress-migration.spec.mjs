import { expect, test } from '../support/network-fixture.mjs'

const DESTINATION_ORIGIN = 'http://localhost:8000'
const DESTINATION_URL = `${DESTINATION_ORIGIN}/?legacy_migration_test=1`
const HELPER_ORIGIN = 'http://localhost:8002'
const HELPER_URL =
  `${HELPER_ORIGIN}/_legacy_migration_site/?legacy_migration_test=1`
const CREATE_URL =
  `${HELPER_ORIGIN}/functions/v1/create-legacy-progress-transfer`
const CONSUME_URL =
  `${DESTINATION_ORIGIN}/functions/v1/consume-legacy-progress-transfer`
const STORAGE_PROJECT_NAMES = new Set([
  'desktop-standard',
  'webkit-storage'
])

function futureExpiry() {
  return new Date(Date.now() + 15 * 60_000).toISOString()
}

function studyState(marker, { setupCompleted = true } = {}) {
  const completedAt = '2026-08-12T10:00:00.000Z'
  return {
    config: {
      ankiDisabledAt: completedAt,
      ankiEnabled: false,
      ankiPendingResumeBaseline: null,
      ankiResumeBaselines: {},
      channels: [{ id: 'legacy-channel', name: 'Legacy channel' }],
      channelShelfOrder: ['legacy-channel'],
      historyView: 'summary',
      includeShorts: true,
      locale: 'en',
      removedChannelIds: [],
      removedDefaultChannelIds: [],
      shortsEnableRefetchAvailableAt: null,
      studyInsights: { collapsed: false, enabled: true, history: [] },
      studyMarker: marker,
      theme: 'light',
      trackedChannelPolicy: {
        version: 1,
        freeAllowance: 5,
        grandfatheredAt: null,
        lastConfirmedTier: null,
        downgradePending: false
      },
      weeklyGoalHours: 6
    },
    videos: {
      legacyVideo: {
        id: 'legacyVideo',
        status: 'in_progress',
        title: 'Legacy study video'
      }
    },
    anki: {
      '2026-08-12': { created: 2, reviewed: 17 }
    },
    streak: { current: 0, longest: 0, lastActivityDate: null },
    cityProgress: { maxLevelIndex: 0, pendingLevelIndex: null },
    undoStack: [],
    redoStack: [],
    activityLog: [],
    lastVideoMarkedWatchedAt: null,
    lastVideoOpenedAt: null,
    totalRewatchCount: 0,
    channelRefreshes: {},
    onboarding: {
      version: 2,
      accountStepReachedAt: null,
      introSeenAt: setupCompleted ? completedAt : null,
      levelUpGuidanceShownAt: null,
      recommendationsAppliedAt: null,
      setupCompleted,
      setupCompletedAt: setupCompleted ? completedAt : null,
      starterFeed: {
        status: 'idle',
        catalogIds: [],
        processedCatalogIds: [],
        failedCatalogIds: [],
        addedChannelCount: 0,
        mergedVideoCount: 0,
        skippedShortCount: 0,
        queuedAt: null,
        startedAt: null,
        completedAt: null
      },
      walkthroughCompleted: setupCompleted,
      walkthroughCompletedAt: setupCompleted ? completedAt : null
    },
    noAnkiFrequentUserPrompt: {
      watchedVideoDateKeys: [],
      response: null,
      respondedAt: null
    },
    learnerProfile: {
      languages: [],
      level: null,
      selectedChannelCatalogIds: [],
      createdAt: null,
      updatedAt: null
    },
    defaultChannelsVersion: 2
  }
}

async function seedLegacyOrigin(page, primaryRaw = null) {
  await page.goto(`${HELPER_ORIGIN}/tests/fixtures/legacy-origin/seed/`)
  await page.evaluate(raw => {
    localStorage.removeItem('edenia_v1_backups')
    if (raw === null) localStorage.removeItem('edenia_v1')
    else localStorage.setItem('edenia_v1', raw)
  }, primaryRaw)
  return page.evaluate(() => ({
    backups: localStorage.getItem('edenia_v1_backups'),
    primary: localStorage.getItem('edenia_v1')
  }))
}

async function installDestinationSeed(page, primaryRaw = null) {
  await page.addInitScript(raw => {
    if (
      location.origin !== 'http://localhost:8000'
      || sessionStorage.getItem('legacy-migration-destination-seeded') === '1'
    ) return
    for (const key of [
      'edenia_v1',
      'edenia_v1_backups',
      'edenia_v1_legacy_progress_migration_v1'
    ]) localStorage.removeItem(key)
    if (raw !== null) localStorage.setItem('edenia_v1', raw)
    sessionStorage.setItem('legacy-migration-destination-seeded', '1')
  }, primaryRaw)
}

async function installMigrationRoutes(page, { automaticEnabled = true } = {}) {
  const appConfig = `window.EDENIA_CONFIG = ${JSON.stringify({
    youtubeApiKey: '',
    freePlusEnabled: false,
    plusCheckoutEnabled: false,
    accountFeaturesRollout: 'off',
    studyGuidanceEnabled: false,
    indexedDbBackupsEnabled: false,
    indexedDbBackupCleanupEnabled: false,
    legacyProgressMigrationEnabled: automaticEnabled,
    supabaseUrl: DESTINATION_ORIGIN,
    supabasePublishableKey: 'sb_publishable_localtest'
  })}\n`
  const helperConfig = `window.EDENIA_LEGACY_MIGRATION_CONFIG = ${JSON.stringify({
    createTransferUrl: CREATE_URL,
    returnUrl: DESTINATION_URL,
    supabasePublishableKey: 'sb_publishable_localtest',
    supabaseUrl: `${HELPER_ORIGIN}/`
  })}\n`
  await page.route(`${DESTINATION_ORIGIN}/config.local.js*`, route => (
    route.fulfill({
      body: appConfig,
      contentType: 'text/javascript',
      status: 200
    })
  ))
  await page.route(
    `${HELPER_ORIGIN}/_legacy_migration_site/config.local.js*`,
    route => route.fulfill({
      body: helperConfig,
      contentType: 'text/javascript',
      status: 200
    })
  )

  const transfers = new Map()
  const calls = []
  await page.route(CREATE_URL, route => {
    const body = route.request().postDataJSON()
    calls.push({ action: 'create', body })
    transfers.set(body.capability_digest, body)
    return route.fulfill({
      body: JSON.stringify({
        expires_at: futureExpiry(),
        status: 'created'
      }),
      contentType: 'application/json',
      status: 201
    })
  })
  await page.route(CONSUME_URL, route => {
    const requestBody = route.request().postDataJSON()
    calls.push({
      action: requestBody.action,
      body: requestBody,
      headers: route.request().headers()
    })
    const transfer = transfers.get(requestBody.capability_digest)
    if (requestBody.action === 'claim' && transfer) {
      return route.fulfill({
        body: JSON.stringify({
          ciphertext: transfer.ciphertext,
          ciphertext_bytes: transfer.ciphertext_bytes,
          ciphertext_digest: transfer.ciphertext_digest,
          expires_at: futureExpiry(),
          iv: transfer.iv,
          status: 'claimed'
        }),
        contentType: 'application/json',
        status: 200
      })
    }
    if (requestBody.action === 'complete' && transfer) {
      transfers.delete(requestBody.capability_digest)
      return route.fulfill({
        body: JSON.stringify({ status: 'completed' }),
        contentType: 'application/json',
        status: 200
      })
    }
    return route.fulfill({
      body: JSON.stringify({ status: 'invalid' }),
      contentType: 'application/json',
      status: 400
    })
  })
  return { calls, transfers }
}

async function readDestination(page) {
  return page.evaluate(() => ({
    backups: JSON.parse(localStorage.getItem('edenia_v1_backups') || '[]'),
    marker: JSON.parse(
      localStorage.getItem('edenia_v1_legacy_progress_migration_v1')
        || 'null'
    ),
    primary: JSON.parse(localStorage.getItem('edenia_v1') || 'null'),
    values: Object.values(localStorage)
  }))
}

test('automatic round trip restores progress only after backup and hash verification', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const primaryRaw = JSON.stringify(studyState('LEGACY_ROUND_TRIP'))
  const before = await seedLegacyOrigin(page, primaryRaw)
  await installDestinationSeed(page)
  const relay = await installMigrationRoutes(page)

  await page.goto(DESTINATION_URL)
  await expect(page.getByRole('heading', {
    name: 'Checking for progress from your old Edenia address'
  })).toBeVisible()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/, {
    timeout: 15_000
  })
  await expect(page).toHaveURL(DESTINATION_URL)

  const destination = await readDestination(page)
  expect(destination.primary.config.studyMarker).toBe('LEGACY_ROUND_TRIP')
  expect(destination.primary.onboarding.setupCompleted).toBe(true)
  expect(destination.primary.activityLog.find(entry => (
    entry.id.startsWith('legacy-migration-')
  ))).toMatchObject({
    actor: 'auto',
    detail: 'Securely recovered from the previous Edenia address.',
    status: 'success',
    title: 'Old Edenia progress restored',
    type: 'import'
  })
  expect(destination.backups).toHaveLength(1)
  expect(destination.backups[0].reason).toBe('legacy origin recovery')
  expect(destination.backups[0].state.config.studyMarker)
    .toBe('LEGACY_ROUND_TRIP')
  expect(destination.backups[0].state.activityLog || []).toHaveLength(0)
  expect(destination.marker).toEqual({
    schema: 'edenia-legacy-progress-migration-v1',
    status: 'completed',
    updatedAt: expect.any(String)
  })
  expect(destination.values.join('\n')).not.toMatch(
    /edenia-legacy-progress=transfer|ciphertext/i
  )
  expect(relay.transfers.size).toBe(0)
  expect(relay.calls.map(call => call.action)).toEqual([
    'create',
    'claim',
    'complete'
  ])
  expect(relay.calls[1].headers.authorization).toBeUndefined()
  expect(relay.calls[1].headers.apikey).toBe('sb_publishable_localtest')
  expect(Object.keys(relay.calls[1].body).sort()).toEqual([
    'action',
    'capability_digest'
  ])

  const after = await seedLegacyOrigin(page, primaryRaw)
  expect(after).toEqual(before)
})

test('conclusive no-state result reaches current new-user onboarding', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await seedLegacyOrigin(page)
  await installDestinationSeed(page)
  const relay = await installMigrationRoutes(page)

  await page.goto(DESTINATION_URL)
  await expect(page.locator('#introTrailer')).not.toHaveClass(/\bhidden\b/, {
    timeout: 15_000
  })
  const destination = await readDestination(page)
  expect(destination.marker.status).toBe('checked_none')
  expect(relay.calls).toEqual([])
})

test('switch-off path preserves ordinary startup and makes no migration call', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await installDestinationSeed(page)
  const relay = await installMigrationRoutes(page, {
    automaticEnabled: false
  })

  await page.goto(DESTINATION_URL)
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  const destination = await readDestination(page)
  expect(destination.marker).toBeNull()
  expect(relay.calls).toEqual([])
  await expect(page.locator('#legacyProgressRecoverySettings'))
    .not.toHaveClass(/\bhidden\b/)
})

test('Settings recovery keeps a different destination primary byte-identical', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const legacyRaw = JSON.stringify(studyState('LEGACY_CONFLICT'))
  const destinationRaw = JSON.stringify(studyState('DESTINATION_PROGRESS'))
  await seedLegacyOrigin(page, legacyRaw)
  await installDestinationSeed(page, destinationRaw)
  const relay = await installMigrationRoutes(page, {
    automaticEnabled: false
  })

  await page.goto(DESTINATION_URL)
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  const primaryBeforeRecovery = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await page.locator('.gear-btn').click()
  await page.getByRole('button', {
    name: 'Recover progress from the old Edenia address'
  }).click()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/, {
    timeout: 15_000
  })
  await expect(page.locator('#toast')).toContainText(
    'saved as a local backup without replacing anything'
  )

  const destination = await readDestination(page)
  expect(JSON.stringify(destination.primary)).toBe(primaryBeforeRecovery)
  const conflictBackups = destination.backups.filter(backup => (
    backup.reason === 'legacy origin conflict'
  ))
  expect(conflictBackups).toHaveLength(1)
  expect(conflictBackups[0]).toMatchObject({
    reason: 'legacy origin conflict',
    state: { config: { studyMarker: 'LEGACY_CONFLICT' } }
  })
  expect(relay.calls.map(call => call.action)).toEqual([
    'create',
    'claim',
    'complete'
  ])
})
