import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-03T04:00:00.000Z')
const minimumTouchTargetWithSubpixelTolerance = 43.9

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

async function seedVideoOrganizationState(page) {
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
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
      watchedAt: null,
      status: 'unwatched',
      thumbnail: ''
    }
    state.videos['menu-resume-video'] = {
      id: 'menu-resume-video',
      title: 'Menu resume video',
      channelId: 'organization-channel',
      channelTitle: 'Organization channel',
      duration: 540,
      publishedAt: '2026-08-02T05:00:00.000Z',
      pausedAt: '2026-08-03T02:00:00.000Z',
      resumeAtSeconds: 90,
      status: 'partial',
      thumbnail: '',
      watchProgressTracked: true
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
  })
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

test('card-owned More menu stays contained and closes predictably', async ({ page }, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard',
    'phone-small'
  ].includes(testInfo.project.name))
  await seedVideoOrganizationState(page)

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

  const menu = card.locator('.video-actions-menu')
  await expect(menu).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.locator('[role="menuitem"]')).toHaveCount(1)
  await expect(menu.locator('[role="menuitem"]')).toBeFocused()
  const containment = await page.evaluate(() => {
    const cardElement = document.querySelector(
      '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
    )
    const triggerElement = cardElement.querySelector('[data-video-organization-action="menu"]')
    const menuElement = document.getElementById(triggerElement.getAttribute('aria-controls'))
    const cardRect = cardElement.getBoundingClientRect()
    const menuRect = menuElement.getBoundingClientRect()
    return {
      belongsToCard: cardElement.contains(menuElement),
      top: menuRect.top >= cardRect.top - 1,
      right: menuRect.right <= cardRect.right + 1,
      bottom: menuRect.bottom <= cardRect.bottom + 1,
      left: menuRect.left >= cardRect.left - 1,
      itemHeight: menuElement.querySelector('[role="menuitem"]')
        .getBoundingClientRect().height
    }
  })
  expect({
    belongsToCard: containment.belongsToCard,
    top: containment.top,
    right: containment.right,
    bottom: containment.bottom,
    left: containment.left
  }).toEqual({
    belongsToCard: true,
    top: true,
    right: true,
    bottom: true,
    left: true
  })
  expect(containment.itemHeight).toBeGreaterThanOrEqual(
    minimumTouchTargetWithSubpixelTolerance
  )
  if (['desktop-standard', 'tablet-portrait'].includes(testInfo.project.name)) {
    await expect(card).toHaveClass(/\bis-previewing\b/)
  }

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(menu).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
  await expect(menu).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('Continue Watching menu shows two vertical actions inside its card', async ({ page }, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard',
    'phone-small'
  ].includes(testInfo.project.name))
  await seedVideoOrganizationState(page)

  const card = page.locator('#nextStudyCard')
  await card.scrollIntoViewIfNeeded()
  const trigger = card.locator('[data-video-organization-action="menu"]')
  await trigger.click()
  const menu = card.locator('.video-actions-menu')
  const items = menu.locator('[role="menuitem"]')
  await expect(menu).toBeVisible()
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toHaveText('Remove from Continue Watching')
  await expect(items.nth(1)).toHaveText('Remove from feed')
  await expect(items.nth(0)).toBeFocused()

  const containment = await page.evaluate(() => {
    const cardElement = document.getElementById('nextStudyCard')
    const menuElement = cardElement.querySelector('.video-actions-menu')
    const cardRect = cardElement.getBoundingClientRect()
    const menuRect = menuElement.getBoundingClientRect()
    return {
      top: menuRect.top >= cardRect.top - 1,
      right: menuRect.right <= cardRect.right + 1,
      bottom: menuRect.bottom <= cardRect.bottom + 1,
      left: menuRect.left >= cardRect.left - 1,
      itemHeights: Array.from(menuElement.querySelectorAll('[role="menuitem"]'))
        .map(item => item.getBoundingClientRect().height)
    }
  })
  expect({
    top: containment.top,
    right: containment.right,
    bottom: containment.bottom,
    left: containment.left
  }).toEqual({ top: true, right: true, bottom: true, left: true })
  expect(Math.min(...containment.itemHeights)).toBeGreaterThanOrEqual(
    minimumTouchTargetWithSubpixelTolerance
  )

  await page.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(items.nth(0)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('inline organization actions preserve progress and feed-removal semantics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page)

  const nextStudy = page.locator('#nextStudyCard')
  await nextStudy.scrollIntoViewIfNeeded()
  await nextStudy.locator('[data-video-organization-action="menu"]').click()
  await nextStudy.locator('[data-video-organization-action="remove-continue"]').click()
  await expect(nextStudy).toBeHidden()
  const resumedVideo = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).videos['menu-resume-video']
  ))
  expect(resumedVideo.status).toBe('unwatched')
  expect(resumedVideo.resumeAtSeconds).toBeNull()
  expect(resumedVideo.removedFromFeedAt).toBeUndefined()

  const feedCard = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
  )
  await feedCard.hover()
  await feedCard.locator('[data-video-organization-action="menu"]').click()
  await feedCard.locator('[data-video-organization-action="remove-feed"]').click()
  await expect(feedCard).toHaveCount(0)
  const removedVideo = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).videos['menu-anchor-video']
  ))
  expect(removedVideo.status).toBe('unwatched')
  expect(typeof removedVideo.removedFromFeedAt).toBe('string')
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
