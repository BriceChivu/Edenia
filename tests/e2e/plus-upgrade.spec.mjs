import { expect, test } from '../support/network-fixture.mjs'

test.beforeEach(async ({ page }) => {
  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = {
      youtubeApiKey: '',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      accountFeaturesRollout: 'internal',
      supabaseUrl: '',
      supabasePublishableKey: ''
    }`,
    contentType: 'application/javascript',
    status: 200
  }))
})

async function seedCompletedHistoryState(
  page,
  { ankiEnabled = true, includeRecent = true } = {}
) {
  await page.goto('/')
  await page.evaluate(({ enabled, shouldIncludeRecent }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = new Date().toISOString()
    state.config.ankiEnabled = enabled
    state.config.ankiDisabledAt = enabled ? null : completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt

    const localDate = daysFromToday => {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() + daysFromToday)
      return date
    }
    const dateKey = date => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-')
    const oldDate = localDate(-56)
    const recentDate = localDate(-7)
    const makeVideo = (id, title, date, seconds) => ({
      id,
      title,
      channelId: 'history-channel',
      channelTitle: 'History channel',
      duration: 900,
      publishedAt: date.toISOString(),
      status: 'watched',
      watchedAt: date.toISOString(),
      watchProgress: [{ watchedAt: date.toISOString(), seconds }],
      watchProgressTracked: true,
      thumbnail: ''
    })
    state.videos = {
      'old-history-video': makeVideo(
        'old-history-video',
        'Old exact history value',
        oldDate,
        300
      )
    }
    if (shouldIncludeRecent) {
      state.videos['recent-history-video'] = makeVideo(
        'recent-history-video',
        'Recent exact history value',
        recentDate,
        180
      )
    }
    if (enabled) {
      state.anki[dateKey(oldDate)] = { reviewed: 37, created: 4 }
      if (shouldIncludeRecent) {
        state.anki[dateKey(recentDate)] = { reviewed: 11, created: 2 }
      }
    }
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  }, { enabled: ankiEnabled, shouldIncludeRecent: includeRecent })
}

async function seedCompletedInsightState(page) {
  await page.goto('/')
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = new Date().toISOString()
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt

    const localDate = daysFromToday => {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() + daysFromToday)
      return date
    }
    const inactiveAt = localDate(-10).toISOString()
    state.videos = {
      'insight-inactive-video': {
        id: 'insight-inactive-video',
        title: 'Saved study activity',
        channelId: 'insight-channel',
        channelTitle: 'Insight channel',
        duration: 900,
        publishedAt: inactiveAt,
        status: 'watched',
        watchedAt: inactiveAt,
        watchProgress: [{ watchedAt: inactiveAt, seconds: 300 }],
        watchProgressTracked: true,
        thumbnail: ''
      }
    }
    state.config.studyInsights.history = Array.from(
      { length: 7 },
      (_, index) => {
        const recordedAt = localDate(-100 + index).toISOString()
        return {
          key: `seed-insight-${index}`,
          insightId: `seed-insight-${index}`,
          type: 'steady-process',
          variant: 0,
          activeDays: index + 1,
          ankiDays: index,
          firstRecordedAt: recordedAt,
          recordedAt
        }
      }
    ).reverse()
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  })
}

test('public Plus page returns to Edenia without rendering authentication', async ({ page }) => {
  await page.goto('/plus/')

  await expect(page).toHaveURL(/\/$/)
  await expect(page).not.toHaveTitle('Edenia Plus')
  await expect(page.locator('input[type="email"]:visible')).toHaveCount(0)
  await expect(page.getByText('Restore Plus', { exact: true })).toHaveCount(0)

  await page.goto('/?plus=1')
  await expect(page.locator('#plusUpgradeModal')).toBeHidden()
  await expect(page.locator('#plusUpgradeModal input[type="email"]:visible')).toHaveCount(0)
})

test('internal Plus page presents the approved offer and keeps purchasing disabled', async ({ page }) => {
  await page.goto('/plus/?internal_test=1')

  await expect(page).toHaveTitle('Edenia Plus')
  await expect(page.locator('[data-plus-benefits] .plus-benefit')).toHaveCount(3)
  await expect(page.getByText('Complete Study History and heatmap')).toBeVisible()
  await expect(page.getByText('Every Study Insight', { exact: true })).toBeVisible()
  await expect(page.getByText('Unlimited tracked channels')).toBeVisible()

  const plans = page.locator('[data-plus-plans] .plus-plan')
  await expect(plans).toHaveCount(2)
  await expect(plans.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await plans.nth(0).click()
  await expect(plans.nth(0)).toHaveAttribute('aria-pressed', 'true')

  const checkout = page.locator('[data-plus-checkout]')
  await expect(checkout).toBeDisabled()
  await expect(checkout).toHaveText('Plus purchasing is not open yet')

  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }))
  expect(width.document).toBeLessThanOrEqual(width.viewport)
})

test('contextual Plus modal traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/?internal_test=1&plus=1&feature=complete-study-history')

  const modal = page.locator('#plusUpgradeModal')
  const dialog = modal.getByRole('dialog')
  const close = dialog.locator('[data-plus-action="close"]')
  await expect(modal).toBeVisible()
  await expect(dialog.getByRole('heading', {
    name: 'Your earlier study history is still here.'
  })).toBeVisible()
  await expect(close).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(dialog.locator('a[href="plus/"]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
})

test('Free stores every Study Insight but reveals only the first five lifetime entries', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard'
  ].includes(testInfo.project.name))
  const activate = locator => testInfo.project.name === 'desktop-standard'
    ? locator.click()
    : locator.tap()

  await seedCompletedInsightState(page)
  await page.goto('/?internal_test=1&plus_access=free')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
      .config.studyInsights.history.length
  ))).toBe(8)
  await expect(page.locator('#studyInsightCurrentPanel')).toHaveClass(
    /\bis-insight-restricted\b/
  )
  await expect(page.locator('#studyInsightCard')).not.toHaveAttribute(
    'data-insight-id'
  )
  await expect(page.locator('#studyInsightTitle')).toHaveText('')
  await expect(page.locator('#studyInsightBody')).toHaveText('')
  await expect(page.locator('#studyInsightEvidence')).toHaveText('')

  const currentLock = page.locator(
    '#studyInsightCurrentLock [data-insight-access-action="request"]'
  )
  await expect(currentLock).toContainText(
    'This new Study Insight is saved for Plus.'
  )
  await currentLock.focus()
  await currentLock.press('Enter')
  const modal = page.locator('#plusUpgradeModal')
  await expect(modal.getByRole('heading', {
    name: 'Every Study Insight stays available.'
  })).toBeVisible()
  await activate(modal.locator('.plus-modal-close'))

  await activate(page.locator('#studyInsightPreviousTab'))
  await expect(page.locator('#studyInsightHistoryCount')).toHaveText('7')
  await expect(page.locator(
    '#studyInsightHistoryPanel .study-insight-history-item'
  )).toHaveCount(5)
  const archiveLock = page.locator(
    '#studyInsightHistoryPanel [data-insight-access-action="request"]'
  )
  await expect(archiveLock).toContainText(
    '2 more saved insights with Edenia Plus'
  )

  const restrictedRecordedAt = await page.evaluate(() => {
    const history = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
      .config.studyInsights.history
    return ['seed-insight-5', 'seed-insight-6'].map(key => (
      history.find(entry => entry.key === key).recordedAt
    ))
  })
  const insightMarkup = await page.locator('#studyInsightCard').innerHTML()
  for (const recordedAt of restrictedRecordedAt) {
    expect(insightMarkup).not.toContain(recordedAt)
  }

  await archiveLock.focus()
  await archiveLock.press('Enter')
  await expect(modal).toBeVisible()
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }))
  expect(width.document).toBeLessThanOrEqual(width.viewport)
})

test('Plus reveals the current Study Insight and complete saved archive', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedInsightState(page)
  await page.goto('/?internal_test=1&plus_access=plus')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  await expect(page.locator('#studyInsightCard')).toHaveAttribute(
    'data-insight-id',
    'routine-reset'
  )
  await expect(page.locator('#studyInsightTitle')).toHaveText(
    'Get back on track with one small step'
  )
  await expect(page.locator('#studyInsightCurrentPanel')).not.toHaveClass(
    /\bis-insight-restricted\b/
  )
  await expect(page.locator('#studyInsightCurrentLock')).toBeHidden()

  await page.locator('#studyInsightPreviousTab').click()
  await expect(page.locator('#studyInsightHistoryCount')).toHaveText('7')
  await expect(page.locator(
    '#studyInsightHistoryPanel .study-insight-history-item'
  )).toHaveCount(7)
  await expect(page.locator(
    '#studyInsightHistoryPanel .study-insight-history-lock'
  )).toHaveCount(0)
})

test('Free history keeps older periods visible but redacts summary and heatmap values', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard'
  ].includes(testInfo.project.name))
  const activate = locator => testInfo.project.name === 'desktop-standard'
    ? locator.click()
    : locator.tap()

  await seedCompletedHistoryState(page, { ankiEnabled: true })
  await page.goto('/?internal_test=1&plus_access=free')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  await activate(page.locator(
    '[data-history-period-action="toggle"][data-history-range="week"]'
  ))
  const lockedPeriod = page.locator(
    '#historyWeekPeriodPopover '
      + '[data-history-period-action="select"]'
      + '[data-history-access-state="locked"]'
  ).last()
  await expect(lockedPeriod).toBeVisible()
  await expect(lockedPeriod).toContainText('Plus')
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1_internal_test')
  )
  await lockedPeriod.focus()
  await lockedPeriod.press('Enter')

  const modal = page.locator('#plusUpgradeModal')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading', {
    name: 'Your earlier study history is still here.'
  })).toBeVisible()
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1_internal_test')
  )).toBe(storedBefore)
  await activate(modal.locator('.plus-modal-close'))

  await activate(page.locator('[data-history-view="heatmap"]'))
  const lockedDay = page.locator(
    '#historyHeatmapView [data-history-access-state="locked"]'
  ).first()
  await expect(lockedDay).toBeVisible()
  const exposed = await lockedDay.evaluate(element => ({
    className: element.className,
    created: element.getAttribute('data-created'),
    date: element.getAttribute('data-date'),
    points: element.getAttribute('data-points'),
    reviewed: element.getAttribute('data-reviewed'),
    streak: element.getAttribute('data-streak-days'),
    time: element.getAttribute('data-time'),
    videos: element.getAttribute('data-videos')
  }))
  expect(exposed).toEqual({
    className: 'heatmap-day is-history-restricted',
    created: null,
    date: null,
    points: null,
    reviewed: null,
    streak: null,
    time: null,
    videos: null
  })
  await lockedDay.focus()
  await lockedDay.press('Enter')
  await expect(modal).toBeVisible()
})

test('Free summary replaces an old selected period with non-sensitive placeholders', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard'
  ].includes(testInfo.project.name))
  await seedCompletedHistoryState(page, {
    ankiEnabled: true,
    includeRecent: false
  })
  await page.goto('/?internal_test=1&plus_access=free')

  const summary = page.locator('#historySummaryView')
  await expect(summary).toHaveAttribute('data-history-access-state', 'locked')
  await expect(page.locator('.history-stat-val')).toHaveText([
    '••',
    '••',
    '••',
    '••'
  ])
  await expect(page.locator('#historyTable')).not.toContainText(
    'Old exact history value'
  )
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }))
  expect(width.document).toBeLessThanOrEqual(width.viewport)
  const upgrade = page.locator(
    '#historyTable [data-history-access-action="request"]'
  )
  await expect(upgrade).toHaveText('See Edenia Plus')
  await upgrade.focus()
  await upgrade.press('Enter')
  await expect(page.locator('#plusUpgradeModal')).toBeVisible()
})

test('Plus reveals old no-Anki summary and heatmap values', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedCompletedHistoryState(page, { ankiEnabled: false })
  await page.goto('/?internal_test=1&plus_access=plus')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  await page.locator(
    '[data-history-period-action="toggle"][data-history-range="week"]'
  ).click()
  const oldestPeriod = page.locator(
    '#historyWeekPeriodPopover [data-history-period-action="select"]'
  ).last()
  await expect(oldestPeriod).not.toHaveClass(/\bis-history-restricted\b/)
  await oldestPeriod.click()
  await expect(page.locator('#historyStudyTime')).toHaveText('5 min')
  await expect(page.locator('#historyThirdStatLabel')).toHaveText('days studied')
  await expect(page.locator('#historyTable .history-row:not(.history-row-head)'))
    .toHaveCount(1)

  await page.locator('[data-history-view="heatmap"]').click()
  await expect(page.locator(
    '#historyHeatmapView [data-history-access-state]'
  )).toHaveCount(0)
  await expect(page.locator(
    '#historyHeatmapView [data-history-heatmap-action="tooltip"][data-time="5 min"]'
  )).toHaveCount(1)
})

test('Free transition keeps the first five shelves and preserves saved video state', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  const completedAt = '2026-07-20T04:00:00.000Z'
  await page.goto('/')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await page.evaluate(seedCompletedAt => {
    const channelIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const state = window.defaultState(
      4,
      channelIds.map(id => ({ id, name: `Channel ${id}` })),
      'light',
      [],
      'en'
    )
    const completedAt = seedCompletedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.config.channelShelfOrder = ['g', 'b', 'a', 'e', 'd', 'c', 'f']
    state.config.trackedChannelPolicy = {
      version: 1,
      freeAllowance: 7,
      grandfatheredAt: completedAt,
      lastConfirmedTier: 'plus',
      downgradePending: false
    }
    const video = (id, channelId, overrides = {}) => ({
      id,
      channelId,
      channelTitle: `Channel ${channelId}`,
      title: `Video ${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: '2026-07-27T04:00:00.000Z',
      duration: 600,
      status: 'unwatched',
      ...overrides
    })
    state.videos = {
      'manual-c': video('manual-c', 'c', {
        source: 'manual',
        manuallyAdded: true
      }),
      'feed-c': video('feed-c', 'c'),
      'watched-f': video('watched-f', 'f', {
        status: 'watched',
        watchedAt: '2026-07-28T04:00:00.000Z'
      }),
      'later-f': video('later-f', 'f', {
        status: 'watch-later',
        watchLater: true
      })
    }
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  }, completedAt)

  await page.goto('/?internal_test=1&plus_access=free')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return {
      channelIds: state.config.channels.map(channel => channel.id),
      removedChannelIds: state.config.removedChannelIds,
      policy: state.config.trackedChannelPolicy,
      videoVisibility: Object.fromEntries(
        Object.entries(state.videos).map(([id, video]) => [id, video.hiddenFromGrid === true])
      )
    }
  })).toEqual({
    channelIds: ['a', 'b', 'd', 'e', 'g'],
    removedChannelIds: ['c', 'f'],
    policy: {
      version: 1,
      freeAllowance: 5,
      grandfatheredAt: completedAt,
      lastConfirmedTier: 'free',
      downgradePending: false
    },
    videoVisibility: {
      'manual-c': false,
      'feed-c': true,
      'watched-f': false,
      'later-f': false
    }
  })

  await expect(page.locator('.video-card[data-video-id="manual-c"]')).toBeVisible()
  await expect(page.locator('.video-card[data-video-id="later-f"]')).toBeVisible()
  await expect(page.locator('.video-card[data-video-id="feed-c"]')).toHaveCount(0)
  await expect(page.locator('#toast')).toContainText('Removed: Channel c and Channel f')
})

test('Free channel allowance gates direct, catalog, and restore flows but keeps single videos available', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard'
  ].includes(testInfo.project.name))
  const activate = locator => testInfo.project.name === 'desktop-standard'
    ? locator.click()
    : locator.tap()

  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = {
      youtubeApiKey: 'fixture-key',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      accountFeaturesRollout: 'internal',
      supabaseUrl: '',
      supabasePublishableKey: ''
    }`,
    contentType: 'application/javascript',
    status: 200
  }))
  await page.goto('/')
  await page.evaluate(() => {
    const trackedIds = [
      'UC00000000000000000001',
      'UC00000000000000000002',
      'UC00000000000000000003',
      'UC00000000000000000004',
      'UC00000000000000000005'
    ]
    const state = window.defaultState(
      4,
      trackedIds.map((id, index) => ({ id, name: `Tracked ${index + 1}` })),
      'light',
      [],
      'en'
    )
    const completedAt = '2026-08-01T04:00:00.000Z'
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.undoStack = [{
      type: 'channel-remove',
      channelId: 'UC00000000000000000006',
      channelName: 'Removed sixth channel',
      createdAt: completedAt,
      before: {
        channel: {
          id: 'UC00000000000000000006',
          name: 'Removed sixth channel'
        },
        refresh: null,
        removedChannelIds: [],
        removedDefaultChannelIds: [],
        videos: {}
      },
      after: {
        channel: null,
        refresh: null,
        removedChannelIds: ['UC00000000000000000006'],
        removedDefaultChannelIds: [],
        videos: {}
      }
    }]
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  })

  await page.goto('/?internal_test=1&plus_access=free')
  await expect(page.locator('#manualVideoChannelAccess')).toContainText(
    'All 5 Free tracked-channel slots are in use'
  )

  await activate(page.locator('#manualVideoBtn'))
  const input = page.locator('#manualVideoUrlInput')
  await input.fill('UC00000000000000000006')
  await input.press('Enter')

  const modal = page.locator('#plusUpgradeModal')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading', {
    name: 'Grow your study feed without a channel limit.'
  })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1_internal_test')).config.channels.length
  ))).toBe(5)
  await activate(modal.locator('.plus-modal-close'))

  await activate(page.locator('#manualVideoBtn'))
  await input.fill('BBC Earth')
  const catalogResult = page.locator(
    '#manualChannelSuggestions .manual-channel-suggestion.is-plus-restricted'
  ).first()
  await expect(catalogResult).toContainText('Edenia Plus required')
  await activate(catalogResult)
  await expect(modal).toBeVisible()
  await activate(modal.locator('.plus-modal-close'))

  await activate(page.locator('#undoBtn'))
  await activate(page.locator(
    '#undoTooltip [data-undo-redo-action="apply"]'
  ))
  await expect(modal).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return {
      channelCount: state.config.channels.length,
      undoCount: state.undoStack.length
    }
  })).toEqual({ channelCount: 5, undoCount: 1 })
  await activate(modal.locator('.plus-modal-close'))

  if (await page.locator('#manualVideoPopover').evaluate(element => (
    element.classList.contains('hidden')
  ))) {
    await activate(page.locator('#manualVideoBtn'))
  }
  await input.fill('https://www.youtube.com/watch?v=fixture0001')
  await input.press('Enter')
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return {
      channelCount: state.config.channels.length,
      hasVideo: Boolean(state.videos.fixture0001),
      tracksVideoChannel: state.config.channels.some(
        channel => channel.id === 'UC0000000000000000000000'
      )
    }
  })).toEqual({
    channelCount: 5,
    hasVideo: true,
    tracksVideoChannel: false
  })
})
