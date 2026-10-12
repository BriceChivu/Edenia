import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-10T04:00:00.000Z')
const storageKey = 'edenia_v1'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedNow)
})

async function waitForApplication(page) {
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
  })
}

async function seedRibbonState(page, { locale = 'en', theme = 'light', testerMode = false } = {}) {
  const seededKey = testerMode ? 'edenia_v1_internal_test_2' : storageKey
  await page.goto(testerMode ? '/?internal_test=2' : '/')
  await waitForApplication(page)
  await page.evaluate(({ seededLocale, seededTheme, seededStorageKey }) => {
    const state = window.defaultState(4, [], seededTheme, [], seededLocale)
    const completedAt = '2026-08-01T04:00:00.000Z'
    const channelId = 'ribbon-channel'
    const baseVideo = {
      channelId,
      channelTitle: 'Ribbon channel',
      duration: 600,
      status: 'unwatched',
      thumbnail: ''
    }
    const video = (id, title, publishedAt, overrides = {}) => ({
      ...baseVideo,
      id,
      title,
      publishedAt,
      ...overrides
    })

    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.channels = [{ id: channelId, name: 'Ribbon channel' }]
    state.config.channelVideoFormats = { [channelId]: 'videos' }
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.videos = {
      'no-state': video(
        'no-state',
        'No active label',
        '2026-08-01T04:00:00.000Z'
      ),
      'new-only': video(
        'new-only',
        'New only',
        '2026-08-10T01:00:00.000Z'
      ),
      'favorite-only': video(
        'favorite-only',
        'Favorite only',
        '2026-08-02T04:00:00.000Z',
        { favorite: true }
      ),
      'watch-later-only': video(
        'watch-later-only',
        'Watch later only',
        '2026-08-03T04:00:00.000Z',
        { status: 'watch-later', watchLater: true }
      ),
      'in-progress-only': video(
        'in-progress-only',
        'In progress only',
        '2026-08-04T04:00:00.000Z',
        {
          pausedAt: '2026-08-09T04:00:00.000Z',
          resumeAtSeconds: 75,
          status: 'partial'
        }
      ),
      'new-favorite': video(
        'new-favorite',
        'New and favorite',
        '2026-08-10T02:00:00.000Z',
        { favorite: true }
      ),
      'new-watch-favorite': video(
        'new-watch-favorite',
        'New, watch later, and favorite',
        '2026-08-10T02:30:00.000Z',
        { favorite: true, status: 'watch-later', watchLater: true }
      ),
      'all-priorities': video(
        'all-priorities',
        'All priorities',
        '2026-08-10T03:00:00.000Z',
        {
          favorite: true,
          pausedAt: '2026-08-10T03:30:00.000Z',
          resumeAtSeconds: 90,
          status: 'partial',
          watchLater: true
        }
      )
    }
    localStorage.setItem(seededStorageKey, JSON.stringify(state))
  }, {
    seededLocale: locale,
    seededStorageKey: seededKey,
    seededTheme: theme
  })
  await page.reload()
  await waitForApplication(page)
  return seededKey
}

test('shelf ribbons cover every priority and remain flush on responsive cards', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const isPhone = testInfo.project.name === 'phone-small'
  await seedRibbonState(page, {
    locale: isPhone ? 'fr' : 'en',
    theme: isPhone ? 'dark' : 'light'
  })

  const expectedCases = [
    ['no-state', null],
    ['new-only', 'new'],
    ['favorite-only', 'favorite'],
    ['watch-later-only', 'watch-later'],
    ['in-progress-only', 'partial'],
    ['new-favorite', 'favorite'],
    ['new-watch-favorite', 'watch-later'],
    ['all-priorities', 'partial']
  ]
  const expectedBackgrounds = {
    favorite: 'rgb(255, 228, 236)',
    new: 'rgb(229, 9, 20)',
    partial: 'rgb(252, 184, 49)',
    'watch-later': 'rgb(18, 188, 234)'
  }

  for (const [videoId, expectedVariant] of expectedCases) {
    const card = page.locator(
      `#videoGrid .channel-shelf-card[data-video-id="${videoId}"]`
    )
    const track = page.locator('#videoGrid .channel-shelf-track').first()
    await track.scrollIntoViewIfNeeded()
    await track.evaluate(element => element.scrollTo({ left: 0, behavior: 'instant' }))
    await page.waitForTimeout(50)
    for (let step = 0; step < 8 && !await card.count(); step += 1) {
      await track.evaluate(element => element.scrollBy({ left: element.clientWidth, behavior: 'instant' }))
      await page.waitForTimeout(50)
    }
    await expect(card).toHaveCount(1)
    await card.scrollIntoViewIfNeeded()
    const ribbon = card.locator('.channel-shelf-priority-badge')

    if (!expectedVariant) {
      await expect(ribbon).toHaveCount(0)
      continue
    }

    await expect(ribbon).toHaveCount(1)
    await expect(ribbon).toBeVisible()
    await expect(ribbon).toHaveClass(new RegExp(`\\b${expectedVariant}-priority-badge\\b`))
    await expect(ribbon.locator('.action-icon')).toHaveCount(0)
    const geometry = await card.evaluate(cardElement => {
      const ribbonElement = cardElement.querySelector('.channel-shelf-priority-badge')
      const cardRect = cardElement.getBoundingClientRect()
      const ribbonRect = ribbonElement.getBoundingClientRect()
      const style = getComputedStyle(ribbonElement)
      const duration = cardElement.querySelector('.dur-badge')
      const durationStyle = duration ? getComputedStyle(duration) : null
      const durationRect = duration?.getBoundingClientRect()
      const visibleDurationOverlap = Boolean(
        duration
        && durationStyle.display !== 'none'
        && durationStyle.visibility !== 'hidden'
        && durationRect.width > 0
        && durationRect.height > 0
        && Math.min(ribbonRect.right, durationRect.right) - Math.max(ribbonRect.left, durationRect.left) > 0.5
        && Math.min(ribbonRect.bottom, durationRect.bottom) - Math.max(ribbonRect.top, durationRect.top) > 0.5
      )
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        leftInset: ribbonRect.left - cardRect.left,
        pointerEvents: style.pointerEvents,
        ribbonInsideCard: ribbonRect.right <= cardRect.right + 0.5,
        topInset: ribbonRect.top - cardRect.top,
        visibleDurationOverlap
      }
    })

    expect(geometry.backgroundColor).toBe(expectedBackgrounds[expectedVariant])
    expect(geometry.borderRadius).toBe('0px 0px 4px 4px')
    expect(geometry.topInset).toBeGreaterThanOrEqual(0)
    expect(geometry.topInset).toBeLessThanOrEqual(3)
    expect(geometry.leftInset).toBeGreaterThanOrEqual(8)
    expect(geometry.leftInset).toBeLessThanOrEqual(12)
    expect(geometry.pointerEvents).toBe('none')
    expect(geometry.ribbonInsideCard).toBe(true)
    expect(geometry.visibleDurationOverlap).toBe(false)
  }
})

test('preview state changes replace New with the winning ribbon without rerendering the card', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedRibbonState(page)

  const card = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="new-only"]'
  )
  await card.scrollIntoViewIfNeeded()
  await expect(card.locator('.channel-shelf-priority-badge')).toHaveClass(
    /\bnew-priority-badge\b/
  )
  await card.hover()
  await expect(card).toHaveClass(/\bis-previewing\b/)
  await card.evaluate(element => {
    element.dataset.ribbonUpdateSentinel = 'retained'
  })

  await card.locator('.favorite-btn').click()
  await expect(card).toHaveAttribute('data-ribbon-update-sentinel', 'retained')
  await expect(card).toHaveClass(/\bis-previewing\b/)
  await expect(card.locator('.channel-shelf-priority-badge')).toHaveClass(
    /\bfavorite-priority-badge\b/
  )

  await card.locator('.watch-later-btn').click()
  await expect(card).toHaveAttribute('data-ribbon-update-sentinel', 'retained')
  await expect(card).toHaveClass(/\bis-previewing\b/)
  await expect(card.locator('.channel-shelf-priority-badge')).toHaveClass(
    /\bwatch-later-priority-badge\b/
  )
})

for (const testerMode of [false, true]) {
  test(`In progress preserves unfinished replays when Favorite is removed (${testerMode ? 'tester' : 'public'})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-standard')
    const seededKey = await seedRibbonState(page, { testerMode })
    await page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey))
      const base = state.videos['favorite-only']
      state.videos = Object.fromEntries([4, 60].map((resumeAtSeconds, index) => {
        const id = `replaying-favorite-${index}`
        return [id, {
          ...base, id, title: `Replaying favorite ${index}`, status: 'watched',
          watchedAt: '2026-08-09T04:00:00.000Z', resumeAtSeconds,
          pausedAt: '2026-08-10T03:00:00.000Z',
          watchProgress: [{ watchedAt: '2026-08-09T04:00:00.000Z', seconds: 600 }],
          watchProgressTracked: true
        }]
      }))
      localStorage.setItem(storageKey, JSON.stringify(state))
    }, seededKey)
    await page.reload()
    await waitForApplication(page)

    await page.locator('#videoGrid .channel-shelf').first().scrollIntoViewIfNeeded()
    await expect(page.locator('#videoGrid .partial-priority-badge')).toHaveCount(2)
    const progressTab = page.locator('[data-status-tab="partial"]')
    await expect(progressTab).toHaveText(/In progress\s*2/)
    await progressTab.click()
    await expect(page.locator('#videoGrid .channel-shelf-card')).toHaveCount(2)
    for (let index = 0; index < 2; index += 1) {
      await expect(page.locator(`#videoGrid [data-video-id="replaying-favorite-${index}"].channel-shelf-card`)).toBeVisible()
    }

    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).videos, seededKey)
    for (let index = 0; index < 2; index += 1) {
      const card = page.locator(`#videoGrid .channel-shelf-card[data-video-id="replaying-favorite-${index}"]`)
      await card.hover()
      await expect(card).toHaveClass(/\bis-previewing\b/)
      await card.locator('.favorite-btn').click()
      await expect(progressTab).toHaveText(/In progress\s*2/)
      await expect(card).toHaveCount(1)
      await expect(card.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(page.locator('[data-status-tab="favorite"]')).toHaveText(/Favorite\s*0/)
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).videos, seededKey)
    for (const [id, video] of Object.entries(before)) {
      expect(after[id]).toEqual({ ...video, favorite: false })
    }
    await page.reload()
    await waitForApplication(page)
    await expect(progressTab).toHaveText(/In progress\s*2/)
    await expect(page.locator('#nextStudyCard .next-study-meta')).toHaveText('Ribbon channel · In progress')
    await progressTab.click()
    await expect(page.locator('#videoGrid .channel-shelf-card')).toHaveCount(2)

    // Restore favorites for the remaining filter edge cases.
    for (let index = 0; index < 2; index += 1) {
      const card = page.locator(`#videoGrid .channel-shelf-card[data-video-id="replaying-favorite-${index}"]`)
      await card.hover()
      await expect(card).toHaveClass(/\bis-previewing\b/)
      await card.locator('.favorite-btn').click()
    }

    await page.evaluate(storageKey => {
      const state = JSON.parse(localStorage.getItem(storageKey))
      const base = state.videos['replaying-favorite-0']
      const cases = {
        partial: { status: 'partial', favorite: false, resumeAtSeconds: 75 },
        'resumed-watch-later': { status: 'watch-later', favorite: false, resumeAtSeconds: 45 },
        'replay-at-zero': { resumeAtSeconds: 0 },
        'completed-favorite': { resumeAtSeconds: null },
        'invalid-resume': { resumeAtSeconds: 'invalid' },
        'completed-nonfavorite': { favorite: false, resumeAtSeconds: null },
        'removed-replay': { removedFromFeedAt: '2026-08-09T04:00:00.000Z' }
      }
      for (const [id, overrides] of Object.entries(cases)) {
        state.videos[id] = { ...base, id, title: id, ...overrides }
      }
      localStorage.setItem(storageKey, JSON.stringify(state))
    }, seededKey)
    await page.reload()
    await waitForApplication(page)
    await expect(progressTab).toHaveText(/In progress\s*5/)
    await expect(page.locator('[data-status-tab="watch-later"]')).toHaveText(/Watch later\s*1/)
    await progressTab.click()
    await expect(page.locator('#videoGrid .channel-shelf-card')).toHaveCount(5)
    await expect(page.locator('#videoGrid .partial-priority-badge')).toHaveCount(5)
    for (const id of ['partial', 'resumed-watch-later', 'replay-at-zero']) {
      await expect(page.locator(`#videoGrid .channel-shelf-card[data-video-id="${id}"]`)).toHaveCount(1)
    }
    await expect.poll(() => page.evaluate(key => {
      const video = JSON.parse(localStorage.getItem(key)).videos['replaying-favorite-0']
      return { status: video.status, favorite: video.favorite, resumeAtSeconds: video.resumeAtSeconds }
    }, seededKey)).toEqual({ status: 'watched', favorite: true, resumeAtSeconds: 4 })
  })
}
