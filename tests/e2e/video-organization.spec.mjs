import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-03T04:00:00.000Z')

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

async function seedVideoOrganizationState(page, { locale = 'en' } = {}) {
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(({ locale: seededLocale }) => {
    const state = window.defaultState(4, [], 'light', [], seededLocale)
    const completedAt = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.channels = [{
      id: 'organization-channel',
      name: 'Organization channel'
    }]
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.videos['removed-preview-video'] = {
      id: 'removed-preview-video',
      title: 'Removed preview video',
      channelId: 'organization-channel',
      channelTitle: 'Organization channel',
      duration: 600,
      publishedAt: '2026-08-01T04:00:00.000Z',
      pausedAt: '2026-08-02T04:00:00.000Z',
      removedFromFeedAt: '2026-08-03T03:00:00.000Z',
      resumeAtSeconds: 42,
      status: 'partial',
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-08-02T04:00:00.000Z',
        seconds: 42
      }],
      watchProgressTracked: true
    }
    state.videos['menu-anchor-video'] = {
      id: 'menu-anchor-video',
      title: 'Menu anchor video',
      channelId: 'organization-channel',
      channelTitle: 'Organization channel',
      duration: 480,
      publishedAt: '2026-08-02T04:00:00.000Z',
      pausedAt: '2026-08-03T02:00:00.000Z',
      resumeAtSeconds: 60,
      status: 'partial',
      watchProgressTracked: true,
      thumbnail: ''
    }
    state.videos['watched-favorite-video'] = {
      id: 'watched-favorite-video',
      title: 'Watched favorite destination',
      channelId: 'organization-channel',
      channelTitle: 'Organization channel',
      duration: 720,
      publishedAt: '2026-07-31T04:00:00.000Z',
      watchedAt: '2026-08-02T06:00:00.000Z',
      status: 'watched',
      favorite: false,
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-08-02T06:00:00.000Z',
        seconds: 720
      }],
      watchProgressTracked: true
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, { locale })
  await page.reload()
  await waitForApplication(page)
}

async function installFakeYoutubePlayer(page) {
  await page.evaluate(() => {
    window.__edeniaFakeYoutubePlayer = null
    window.YT = {
      Player: class FakeYoutubePlayer {
        constructor(_iframe, config) {
          this.currentTime = 0
          this.events = config.events
          this.state = 5
          window.__edeniaFakeYoutubePlayer = this
          queueMicrotask(() => this.events.onReady?.({ target: this }))
        }

        destroy() {}
        getCurrentTime() { return this.currentTime }
        getPlaybackRate() { return 1 }
        getPlayerState() { return this.state }
        playVideo() {
          this.state = 1
          this.events.onStateChange?.({ data: 1 })
        }
        seekTo(seconds) { this.currentTime = Number(seconds) || 0 }
      }
    }
  })
}

test('Removed preview playback never mutates study state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page)
  await installFakeYoutubePlayer(page)

  await page.locator('#removedSectionToggle').click()
  const previewButton = page.locator(
    '#removedGrid [data-video-preview-action="removed-thumbnail"]'
  )
  await expect(previewButton).toHaveCount(1)
  const stateBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))

  await previewButton.click()
  await expect(page.locator('.video-player-overlay')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaFakeYoutubePlayer?.getPlayerState?.()
  ))).toBe(1)

  await page.waitForTimeout(1100)
  await page.evaluate(() => {
    const player = window.__edeniaFakeYoutubePlayer
    player.currentTime += 1
    player.state = 2
    player.events.onStateChange?.({ data: 2 })
    player.state = 0
    player.events.onStateChange?.({ data: 0 })
  })
  await expect(page.locator('.video-watch-reminder-popover.is-player')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  await expect(page.locator(
    '#removedGrid .removed-card[data-video-id="removed-preview-video"]'
  )).toHaveCount(1)
  const stateAfter = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  expect(stateAfter).toBe(stateBefore)
})

test('More menu aligns to its card and keeps option geometry uniform', async ({ page }, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-small'
  ].includes(testInfo.project.name))
  const isPhone = testInfo.project.name === 'phone-small'
  await seedVideoOrganizationState(page, { locale: isPhone ? 'fr' : 'en' })

  const card = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
  )
  await card.scrollIntoViewIfNeeded()
  if (testInfo.project.name === 'desktop-standard') {
    await card.hover()
  } else if (testInfo.project.name === 'tablet-portrait') {
    await card.locator('.thumb-link').click()
    await expect(card).toHaveClass(/\bis-previewing\b/)
  }
  const trigger = card.locator('[data-video-organization-action="menu"]')
  await trigger.click()

  const popover = page.locator('#videoActionsPopover')
  const items = popover.locator('[role="menuitem"]')
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(items).toHaveCount(2)
  await expect(popover.locator('.video-actions-divider')).toHaveCount(0)
  await expect(popover.locator('.video-actions-list')).toHaveClass(/\bhas-divider\b/)
  const alignment = await page.evaluate(() => {
    const cardRect = document.querySelector(
      '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
    ).getBoundingClientRect()
    const popoverRect = document.getElementById('videoActionsPopover').getBoundingClientRect()
    const menuItems = Array.from(document.querySelectorAll(
      '#videoActionsPopover [role="menuitem"]'
    ))
    const itemMetrics = menuItems.map(item => {
      const rect = item.getBoundingClientRect()
      const style = getComputedStyle(item)
      return {
        height: rect.height,
        width: rect.width,
        borderRadius: style.borderRadius,
        borderTopWidth: style.borderTopWidth,
        marginTop: style.marginTop,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        overflowX: item.scrollWidth - item.clientWidth,
        overflowY: item.scrollHeight - item.clientHeight
      }
    })
    return {
      cardLeftDifference: Math.abs(cardRect.left - popoverRect.left),
      cardRightDifference: Math.abs(cardRect.right - popoverRect.right),
      viewportRight: popoverRect.right <= window.innerWidth - 11,
      viewportLeft: popoverRect.left >= 11,
      itemMetrics
    }
  })
  if (!isPhone) {
    expect(alignment.cardLeftDifference).toBeLessThanOrEqual(0.1)
    expect(alignment.cardRightDifference).toBeLessThanOrEqual(0.1)
  }
  expect(alignment.viewportLeft).toBe(true)
  expect(alignment.viewportRight).toBe(true)
  expect(alignment.itemMetrics[0]).toEqual(alignment.itemMetrics[1])
  expect(alignment.itemMetrics[0].overflowX).toBeLessThanOrEqual(0)
  expect(alignment.itemMetrics[0].overflowY).toBeLessThanOrEqual(0)

  if (testInfo.project.name === 'desktop-standard') {
    await items.nth(0).hover()
    const firstHover = await items.nth(0).evaluate(item => getComputedStyle(item).backgroundColor)
    await items.nth(1).hover()
    const secondHover = await items.nth(1).evaluate(item => getComputedStyle(item).backgroundColor)
    expect(firstHover).toBe(secondHover)

    await page.evaluate(() => window.scrollBy(0, -120))
    await expect(popover).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
  }
})

test('Watched Favorite reveals and highlights the active rewatch card', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(testInfo.project.name))
  await seedVideoOrganizationState(page)

  const watchedCard = page.locator(
    '#watchedGrid .video-card[data-video-id="watched-favorite-video"]'
  )
  await expect(watchedCard).toHaveCount(1)
  await expect(watchedCard.locator('[data-video-organization-action="menu"]')).toHaveCount(0)
  await expect(watchedCard.locator('.favorite-btn')).toHaveCount(1)
  await watchedCard.locator('.favorite-btn').click()

  await expect(watchedCard).toHaveCount(0)
  const activeCard = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="watched-favorite-video"]'
  )
  await expect(activeCard).toHaveCount(1)
  await expect(activeCard).toHaveClass(/\bnext-study-focus-arriving\b/)
  await expect(activeCard.locator('.favorite-btn')).toBeFocused()
  await expect(activeCard.locator('[data-video-organization-action="menu"]')).toHaveCount(1)

  const persistedVideo = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).videos['watched-favorite-video']
  ))
  expect(persistedVideo.status).toBe('watched')
  expect(persistedVideo.watchedAt).toBe('2026-08-02T06:00:00.000Z')
  expect(persistedVideo.favorite).toBe(true)
})
