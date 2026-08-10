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

async function seedRibbonState(page, { locale = 'en', theme = 'light' } = {}) {
  await page.goto('/')
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
    seededStorageKey: storageKey,
    seededTheme: theme
  })
  await page.reload()
  await waitForApplication(page)
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
