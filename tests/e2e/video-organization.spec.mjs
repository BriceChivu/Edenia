import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-03T04:00:00.000Z')
const normalStorageKey = 'edenia_v1'

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

async function seedVideoOrganizationState(
  page,
  { locale = 'en', theme = 'light', testerMode = false } = {}
) {
  const storageKey = testerMode ? 'edenia_v1_internal_test_2' : normalStorageKey
  await page.goto(testerMode ? '/?internal_test=2' : '/')
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(({ locale: seededLocale, storageKey: seededStorageKey, theme: seededTheme }) => {
    const state = window.defaultState(4, [], seededTheme, [], seededLocale)
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
    localStorage.setItem(seededStorageKey, JSON.stringify(state))
  }, { locale, storageKey, theme })
  await page.reload()
  await waitForApplication(page)
  await page.locator('#videoGrid .channel-shelf').first().scrollIntoViewIfNeeded()
  return storageKey
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
  const stateBefore = await page.evaluate(
    key => localStorage.getItem(key),
    normalStorageKey
  )

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
  const stateAfter = await page.evaluate(
    key => localStorage.getItem(key),
    normalStorageKey
  )
  expect(stateAfter).toBe(stateBefore)
})

test('completion prompt wraps actions without localized overlap', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const locales = testInfo.project.name === 'phone-small'
    ? ['fr']
    : ['en', 'es', 'fr', 'zh-Hans', 'zh-Hant']

  for (const locale of locales) {
    await seedVideoOrganizationState(page, {
      locale,
      theme: testInfo.project.name === 'phone-small' ? 'dark' : 'light'
    })
    await installFakeYoutubePlayer(page)
    await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
    await expect(page.locator('.video-player-overlay')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (
      window.__edeniaFakeYoutubePlayer?.getPlayerState?.()
    ))).toBe(1)

    await page.evaluate(() => {
      const player = window.__edeniaFakeYoutubePlayer
      player.currentTime = 480
      player.state = 0
      player.events.onStateChange?.({ data: 0 })
    })

    const prompt = page.locator('.video-watch-reminder-popover.is-player')
    await expect(prompt).toBeVisible()
    await prompt.evaluate(element => Promise.all(
      element.getAnimations().map(animation => animation.finished)
    ))
    const layout = await prompt.evaluate(element => {
      const actions = element.querySelector('.video-watch-reminder-actions')
      const actionsRect = actions.getBoundingClientRect()
      const promptRect = element.getBoundingClientRect()
      const buttonRects = Array.from(actions.querySelectorAll('button'), button => (
        button.getBoundingClientRect()
      ))
      const overlaps = (first, second) => (
        Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0.5
        && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0.5
      )
      return {
        stacked: getComputedStyle(actions).flexDirection === 'column',
        topPadding: actionsRect.top - promptRect.top,
        bottomPadding: promptRect.bottom - actionsRect.bottom,
        buttonsInsidePrompt: buttonRects.every(rect => (
          rect.left >= promptRect.left - 0.5
          && rect.right <= promptRect.right + 0.5
          && rect.top >= promptRect.top - 0.5
          && rect.bottom <= promptRect.bottom + 0.5
        )),
        buttonsOverlap: buttonRects.some((rect, index) => (
          buttonRects.slice(index + 1).some(otherRect => overlaps(rect, otherRect))
        )),
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        verticalOverflow: element.scrollHeight - element.clientHeight
      }
    })

    expect(layout.buttonsInsidePrompt, locale).toBe(true)
    expect(layout.buttonsOverlap, locale).toBe(false)
    expect(layout.horizontalOverflow, locale).toBeLessThanOrEqual(1)
    expect(layout.verticalOverflow, locale).toBeLessThanOrEqual(1)
    expect(layout.stacked).toBe(testInfo.project.name === 'phone-small')
    if (!layout.stacked) expect(Math.abs(layout.topPadding - layout.bottomPadding)).toBeLessThanOrEqual(1)

  }
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
  await expect(items.first()).toHaveText(
    isPhone ? 'Retirer d’En cours' : 'Remove from in progress'
  )
  await expect(popover.locator('.video-actions-divider')).toHaveCount(0)
  await expect(popover.locator('.video-actions-list')).toHaveClass(/\bhas-divider\b/)
  const alignment = await page.evaluate(() => {
    const cardRect = document.querySelector(
      '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
    ).getBoundingClientRect()
    const popoverRect = document.getElementById('videoActionsPopover').getBoundingClientRect()
    const popoverStyle = getComputedStyle(document.getElementById('videoActionsPopover'))
    const popoverInnerLeft = popoverRect.left + parseFloat(popoverStyle.borderLeftWidth)
    const popoverInnerRight = popoverRect.right - parseFloat(popoverStyle.borderRightWidth)
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
    const horizontalGaps = menuItems.map(item => {
      const rect = item.getBoundingClientRect()
      return {
        left: Math.abs(rect.left - popoverInnerLeft),
        right: Math.abs(popoverInnerRight - rect.right)
      }
    })
    return {
      cardLeftDifference: Math.abs(cardRect.left - popoverRect.left),
      cardRightDifference: Math.abs(cardRect.right - popoverRect.right),
      horizontalGaps,
      popoverPadding: popoverStyle.padding,
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
  expect(alignment.popoverPadding).toBe('0px')
  for (const gap of alignment.horizontalGaps) {
    expect(gap.left).toBeLessThanOrEqual(0.1)
    expect(gap.right).toBeLessThanOrEqual(0.1)
  }
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

test('phone remove-from-progress toast stays on one line when it fits and never splits Undo', async ({
  page
}, testInfo) => {
  test.skip(!['phone-standard', 'phone-small'].includes(testInfo.project.name))
  await seedVideoOrganizationState(page)

  const card = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
  )
  await card.scrollIntoViewIfNeeded()
  await card.locator('[data-video-organization-action="menu"]').click()
  await page.locator(
    '#videoActionsPopover [data-video-organization-action="remove-continue"]'
  ).click()

  const toast = page.locator('#toast')
  await expect(toast).toHaveClass(/\bhas-action\b/)
  await expect(toast.locator('span')).toHaveText('Removed from in progress')
  await expect(toast.locator('.toast-action')).toHaveText('Undo')
  const layout = await toast.evaluate(element => {
    const messageRect = element.querySelector('span').getBoundingClientRect()
    const action = element.querySelector('.toast-action')
    const actionRect = action.getBoundingClientRect()
    const actionStyle = getComputedStyle(action)
    const rect = element.getBoundingClientRect()
    return {
      actionFlexShrink: actionStyle.flexShrink,
      actionWhiteSpace: actionStyle.whiteSpace,
      actionWordBreak: actionStyle.wordBreak,
      fitsViewport: rect.left >= 0 && rect.right <= window.innerWidth,
      sameLine: Math.abs(
        (messageRect.top + messageRect.height / 2)
        - (actionRect.top + actionRect.height / 2)
      ) <= 1
    }
  })
  expect(layout).toEqual({
    actionFlexShrink: '0',
    actionWhiteSpace: 'nowrap',
    actionWordBreak: 'keep-all',
    fitsViewport: true,
    sameLine: true
  })
})

test('Watched Favorite reveals and highlights the active rewatch card', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(testInfo.project.name))
  await seedVideoOrganizationState(page)

  const watchedCard = page.locator(
    '#watchedGrid .video-card[data-video-id="watched-favorite-video"]'
  )
  await page.locator('#watchedSection').scrollIntoViewIfNeeded()
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

  const persistedVideo = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).videos['watched-favorite-video']
  ), normalStorageKey)
  expect(persistedVideo.status).toBe('watched')
  expect(persistedVideo.watchedAt).toBe('2026-08-02T06:00:00.000Z')
  expect(persistedVideo.favorite).toBe(true)
})

test('phone Favorite keeps the same video and shelf position', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')
  await seedVideoOrganizationState(page)
  await page.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey))
    for (let index = 0; index < 10; index += 1) {
      const id = `public-shelf-video-${index}`
      state.videos[id] = {
        id,
        title: `Public shelf video ${index}`,
        channelId: 'organization-channel',
        channelTitle: 'Organization channel',
        duration: 300,
        publishedAt: new Date(Date.UTC(2026, 6, 30, index)).toISOString(),
        status: 'unwatched',
        thumbnail: ''
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, normalStorageKey)
  await page.reload()
  await waitForApplication(page)

  const videoId = 'public-shelf-video-4'
  const track = page.locator('.channel-shelf-track').first()
  const card = page.locator(
    `#videoGrid .channel-shelf-card[data-video-id="${videoId}"]`
  )
  await track.scrollIntoViewIfNeeded()
  await track.evaluate(element => element.scrollTo({ left: element.scrollWidth / 2, behavior: 'instant' }))
  await expect(card).toHaveCount(1)
  await track.evaluate((element, targetVideoId) => {
    const target = element.querySelector(
      `.channel-shelf-card[data-video-id="${targetVideoId}"]`
    )
    element.style.scrollBehavior = 'auto'
    element.scrollLeft = target?.parentElement?.offsetLeft || 0
  }, videoId)
  await expect.poll(() => card.evaluate(element => (
    Math.round(element.getBoundingClientRect().left)
  ))).toBe(14)
  const positionBefore = await card.evaluate(element => ({
    left: element.getBoundingClientRect().left,
    scrollLeft: element.closest('.channel-shelf-track').scrollLeft
  }))

  await card.locator('.favorite-btn').click()
  const updatedCard = page.locator(
    `#videoGrid .channel-shelf-card[data-video-id="${videoId}"]`
  )
  await expect(updatedCard.locator('.favorite-btn')).toBeFocused()
  await expect(updatedCard.locator('.favorite-btn')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect.poll(() => updatedCard.evaluate(element => ({
    left: element.getBoundingClientRect().left,
    scrollLeft: element.closest('.channel-shelf-track').scrollLeft
  }))).toEqual(positionBefore)
})

test('normal visitors use the permanent organization flow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page)

  const card = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
  )
  await expect(card).toHaveCount(1)
  await expect(card.locator('[data-video-organization-action="menu"]')).toHaveCount(1)
  await expect(card.locator('[data-video-set-aside-action="request"]')).toHaveCount(0)
  await expect(page.locator('#removedSection')).toBeVisible()
  await expect(page.locator('#removedCount')).toHaveText('1')

  await card.scrollIntoViewIfNeeded()
  await card.hover()
  await card.locator('[data-video-organization-action="menu"]').click()
  await page.locator(
    '#videoActionsPopover [data-video-organization-action="remove-feed"]'
  ).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator('#removedCount')).toHaveText('2')

  const persisted = await page.evaluate(({ normalKey, internalKey }) => ({
    internal: localStorage.getItem(internalKey),
    video: JSON.parse(localStorage.getItem(normalKey)).videos['menu-anchor-video']
  }), {
    normalKey: normalStorageKey,
    internalKey: 'edenia_v1_internal_test'
  })
  expect(persisted.video.status).toBe('partial')
  expect(persisted.video.setAside).toBeUndefined()
  expect(persisted.video.removedFromFeedAt).toBeTruthy()
  expect(persisted.internal).toBeNull()
})

test('released organization actions preserve retired test storage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify({ sentinel: 'retired-state' }))
  }, 'edenia_v1_internal_test')
  await seedVideoOrganizationState(page)

  const card = page.locator(
    '#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]'
  )
  await card.scrollIntoViewIfNeeded()
  await card.hover()
  await card.locator('[data-video-organization-action="menu"]').click()
  await expect(page.locator('#videoActionsPopover')).toBeVisible()
  await page.locator(
    '#videoActionsPopover [data-video-organization-action="remove-feed"]'
  ).click()

  const persisted = await page.evaluate(({ normalKey, internalKey }) => ({
    internal: JSON.parse(localStorage.getItem(internalKey)),
    normal: JSON.parse(localStorage.getItem(normalKey))
  }), {
    normalKey: normalStorageKey,
    internalKey: 'edenia_v1_internal_test'
  })
  expect(persisted.normal.videos['menu-anchor-video'].removedFromFeedAt).toBeTruthy()
  expect(persisted.internal).toEqual({ sentinel: 'retired-state' })
})

test('enabled organization migrates legacy state and history idempotently', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(storageKey => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const setAsideAt = '2026-08-01T03:00:00.000Z'
    const hiddenAt = '2026-08-02T03:00:00.000Z'
    const removedChannelHiddenAt = '2026-08-03T03:00:00.000Z'
    state.config.channels = [{
      id: 'active-channel',
      name: 'Active channel'
    }]
    state.config.removedChannelIds = ['removed-channel']
    state.config.setAsidePromptSeen = true
    state.videos['legacy-set-aside'] = {
      id: 'legacy-set-aside',
      title: 'Legacy set aside',
      channelId: 'active-channel',
      channelTitle: 'Active channel',
      duration: 600,
      publishedAt: '2026-07-30T03:00:00.000Z',
      status: 'watched',
      watchedAt: setAsideAt,
      setAside: true,
      setAsideAt,
      setAsideResumeAtSeconds: 75,
      thumbnail: ''
    }
    state.videos['legacy-individually-hidden'] = {
      id: 'legacy-individually-hidden',
      title: 'Legacy individually hidden',
      channelId: 'active-channel',
      channelTitle: 'Active channel',
      duration: 300,
      publishedAt: '2026-07-29T03:00:00.000Z',
      status: 'unwatched',
      hiddenFromGrid: true,
      hiddenFromGridAt: hiddenAt,
      thumbnail: ''
    }
    state.videos['removed-channel-hidden'] = {
      id: 'removed-channel-hidden',
      title: 'Removed channel hidden',
      channelId: 'removed-channel',
      channelTitle: 'Removed channel',
      duration: 240,
      publishedAt: '2026-07-28T03:00:00.000Z',
      status: 'unwatched',
      hiddenFromGrid: true,
      hiddenFromGridAt: removedChannelHiddenAt,
      thumbnail: ''
    }
    state.undoStack = [{
      id: 'legacy-set-aside-action',
      type: 'video-status',
      videoId: 'legacy-set-aside',
      before: {
        video: {
          ...state.videos['legacy-set-aside'],
          setAsideResumeAtSeconds: 45
        }
      },
      after: {
        video: { ...state.videos['legacy-set-aside'] }
      }
    }]
    state.redoStack = [{
      id: 'legacy-hidden-action',
      type: 'video-status',
      videoId: 'legacy-individually-hidden',
      before: {
        video: { ...state.videos['legacy-individually-hidden'] }
      },
      after: {
        video: { ...state.videos['legacy-individually-hidden'] }
      }
    }]
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, normalStorageKey)

  const readMigratedState = () => page.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey))
    return {
      configHasPromptFlag: Object.prototype.hasOwnProperty.call(
        state.config,
        'setAsidePromptSeen'
      ),
      individuallyHidden: state.videos['legacy-individually-hidden'],
      removedChannelHidden: state.videos['removed-channel-hidden'],
      setAside: state.videos['legacy-set-aside'],
      undoBefore: state.undoStack[0].before.video,
      undoAfter: state.undoStack[0].after.video,
      redoBefore: state.redoStack[0].before.video,
      redoAfter: state.redoStack[0].after.video
    }
  }, normalStorageKey)

  await page.reload()
  await waitForApplication(page)
  const firstMigration = await readMigratedState()

  expect(firstMigration.configHasPromptFlag).toBe(false)
  expect(firstMigration.setAside).toMatchObject({
    pausedAt: '2026-08-01T03:00:00.000Z',
    removedFromFeedAt: '2026-08-01T03:00:00.000Z',
    resumeAtSeconds: 75,
    status: 'partial',
    watchedAt: null,
    watchProgressTracked: true
  })
  for (const key of ['setAside', 'setAsideAt', 'setAsideResumeAtSeconds']) {
    expect(firstMigration.setAside).not.toHaveProperty(key)
    expect(firstMigration.undoBefore).not.toHaveProperty(key)
    expect(firstMigration.undoAfter).not.toHaveProperty(key)
  }
  expect(firstMigration.undoBefore).toMatchObject({
    pausedAt: '2026-08-01T03:00:00.000Z',
    removedFromFeedAt: '2026-08-01T03:00:00.000Z',
    resumeAtSeconds: 45,
    status: 'partial',
    watchedAt: null
  })
  expect(firstMigration.undoAfter).toMatchObject({
    pausedAt: '2026-08-01T03:00:00.000Z',
    removedFromFeedAt: '2026-08-01T03:00:00.000Z',
    resumeAtSeconds: 75,
    status: 'partial',
    watchedAt: null
  })
  expect(firstMigration.individuallyHidden).toMatchObject({
    hiddenFromGrid: false,
    hiddenFromGridAt: null,
    removedFromFeedAt: '2026-08-02T03:00:00.000Z'
  })
  expect(firstMigration.removedChannelHidden).toMatchObject({
    hiddenFromGrid: true,
    hiddenFromGridAt: '2026-08-03T03:00:00.000Z'
  })
  expect(firstMigration.removedChannelHidden).not.toHaveProperty('removedFromFeedAt')
  for (const snapshot of [firstMigration.redoBefore, firstMigration.redoAfter]) {
    expect(snapshot).toMatchObject({
      hiddenFromGrid: true,
      hiddenFromGridAt: '2026-08-02T03:00:00.000Z'
    })
    expect(snapshot).not.toHaveProperty('removedFromFeedAt')
  }

  await page.reload()
  await waitForApplication(page)
  expect(await readMigratedState()).toEqual(firstMigration)
})


test('public feed refresh preserves Watch later and study progress', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { youtubeApiKey: "", accountFeaturesRollout: "public" }',
    contentType: 'application/javascript'
  }))
  await seedVideoOrganizationState(page)
  await page.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.config.channels = [{ id: 'UC0000000000000000000000', name: 'Fixture Language Channel' }]
    state.videos = { fixture0001: {
      id: 'fixture0001', title: 'Before refresh', channelId: state.config.channels[0].id,
      channelTitle: state.config.channels[0].name, status: 'partial', watchLater: true,
      favorite: true, resumeAtSeconds: 42, duration: 600,
      watchProgress: [{ seconds: 42, watchedAt: '2026-08-01T04:00:00.000Z' }],
      watchProgressTracked: true
    } }
    state.channelRefreshes = {}
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, normalStorageKey)
  await page.unroute('**/config.local.js')
  await page.route('**/config.local.js', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { youtubeApiKey: "fixture-key", accountFeaturesRollout: "public" }',
    contentType: 'application/javascript'
  }))
  await page.reload()
  await waitForApplication(page)
  await expect.poll(() => page.evaluate(storageKey => (
    JSON.parse(localStorage.getItem(storageKey)).videos.fixture0001.title
  ), normalStorageKey)).toBe('Fixture Study Video')
  const video = await page.evaluate(storageKey => (
    JSON.parse(localStorage.getItem(storageKey)).videos.fixture0001
  ), normalStorageKey)
  expect(video).toMatchObject({ status: 'partial', watchLater: true, favorite: true, resumeAtSeconds: 42 })
  expect(video.watchProgress).toEqual([{ seconds: 42, watchedAt: '2026-08-01T04:00:00.000Z' }])
})

for (const testerMode of [false, true]) {
  test(`embedded subtitles retain focus for selection and copy (${testerMode ? 'tester' : 'production'})`, async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-standard')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Island stub</title>'
    }))
    // Keep the subtitle in a cross-origin embed, like asbplayer's injected text.
    await page.route('https://www.youtube.com/embed/**', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><style>
        body { margin: 20px; } #subtitle { display: inline-block; font: 24px monospace; user-select: text; }
      </style><span id="subtitle">Selectable subtitle text</span>
      <script>addEventListener('keydown', event => document.body.dataset.lastKey = event.key)</script>`
    }))
    await seedVideoOrganizationState(page, { testerMode })
    await installFakeYoutubePlayer(page)
    await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
    const overlay = page.locator('.video-player-overlay')
    const iframe = overlay.locator('iframe')
    const subtitle = page.frameLocator('.video-player-overlay iframe').locator('#subtitle')
    await expect(subtitle).toBeVisible()
    await subtitle.click()
    await expect(iframe).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.frameLocator('.video-player-overlay iframe').locator('body')).toHaveAttribute('data-last-key', 'ArrowRight')
    const box = await subtitle.boundingBox()
    await page.mouse.move(box.x + 1, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()
    await expect.poll(() => subtitle.evaluate(() => getSelection().toString())).toBe('Selectable subtitle text')
    await page.keyboard.press('ControlOrMeta+c')
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Selectable subtitle text')
    // Keys inside the cross-origin frame stay with it; the backdrop still closes.
    await page.keyboard.press('Escape')
    await expect(overlay).toBeVisible()
    await overlay.click({ position: { x: 2, y: 2 } })
    await expect(overlay).toHaveCount(0)
    await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
    await expect(overlay).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(overlay).toHaveCount(0)
  })
}

async function endFakeVideo(page) {
  await page.evaluate(() => {
    const player = window.__edeniaFakeYoutubePlayer
    player.currentTime = 480
    player.state = 0
    player.events.onStateChange?.({ data: 0 })
  })
  await expect(page.locator('.video-watch-reminder-popover.is-player')).toBeVisible()
}

for (const action of ['favorite', 'confirm', 'dismiss']) {
  test(`ending ${action} closes the player and preserves the intended organization`, async ({ page }, testInfo) => {
    test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
    await seedVideoOrganizationState(page)
    await installFakeYoutubePlayer(page)
    await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
    await endFakeVideo(page)
    await page.locator(`[data-video-watch-prompt-action="${action}"]`).click()
    await expect(page.locator('.video-player-overlay')).toHaveCount(0)
    const video = await page.evaluate(() => loadState().videos['menu-anchor-video'])
    expect(video.status).toBe(action === 'confirm' ? 'watched' : 'partial')
    expect(video.favorite === true).toBe(action === 'favorite')
    expect((video.watchProgress || []).reduce((sum, entry) => sum + entry.seconds, 0)).toBe(0)
    await page.reload()
    const restored = await page.evaluate(() => loadState().videos['menu-anchor-video'])
    expect(restored.status).toBe(video.status)
    expect(restored.favorite === true).toBe(video.favorite === true)
  })
}

test('Favorite from the ending popup keeps an existing favorite', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page)
  await page.evaluate(async () => {
    const state = loadState()
    state.videos['menu-anchor-video'].favorite = true
    await saveState(state)
  })
  await installFakeYoutubePlayer(page)
  await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
  await endFakeVideo(page)
  await page.locator('[data-video-watch-prompt-action="favorite"]').click()
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => loadState().videos['menu-anchor-video'].favorite)).toBe(true)
})

test('Rewatch starts at zero and earns fresh XP without moving to watched or crediting seeks', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await seedVideoOrganizationState(page, { testerMode: true })
  await page.evaluate(async () => {
    const state = loadState()
    const video = state.videos['menu-anchor-video']
    video.watchProgress = [{ watchedAt: '2026-08-03T04:00:00.000Z', seconds: 480, experienceSeconds: 480 }]
    video.watchCycleCoverage = [{ start: 0, end: 480 }]
    await saveState(state)
  })
  const scoreBefore = await page.evaluate(() => getCurrentCityScore(loadState()))
  await installFakeYoutubePlayer(page)
  await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
  await endFakeVideo(page)
  await page.locator('[data-video-watch-prompt-action="rewatch"]').click()
  await expect(page.locator('.video-watch-reminder-popover.is-player')).toHaveCount(0)
  await expect(page.locator('.video-player-overlay')).toBeVisible()
  expect(await page.evaluate(() => window.__edeniaFakeYoutubePlayer.currentTime)).toBe(0)
  expect(await page.evaluate(() => getCurrentCityScore(loadState()))).toBe(scoreBefore)
  await page.evaluate(async () => {
    const player = window.__edeniaFakeYoutubePlayer
    for (let sample = 0; sample < 60; sample += 1) {
      player.currentTime += 1
      await syncActiveVideoShelfPlayer({ persist: true })
    }
    player.currentTime = 400
    await syncActiveVideoShelfPlayer({ persist: true })
  })
  const result = await page.evaluate(() => {
    const state = loadState()
    const video = state.videos['menu-anchor-video']
    return { score: getCurrentCityScore(state), status: video.status, seconds: getTotalVideoWatchProgressSeconds(video), coverage: video.watchCycleCoverage }
  })
  expect(result).toEqual({ score: scoreBefore + 1, status: 'partial', seconds: 540, coverage: [{ start: 0, end: 60 }] })
  await page.keyboard.press('Escape')
  await page.reload()
  expect(await page.evaluate(() => getCurrentCityScore(loadState()))).toBe(scoreBefore + 1)
  await installFakeYoutubePlayer(page)
  await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
  await page.evaluate(async () => {
    const player = window.__edeniaFakeYoutubePlayer
    player.currentTime = 60
    await syncActiveVideoShelfPlayer({ persist: true })
    for (let sample = 0; sample < 60; sample += 1) {
      player.currentTime += 1
      await syncActiveVideoShelfPlayer({ persist: true })
    }
  })
  expect(await page.evaluate(() => getCurrentCityScore(loadState()))).toBe(scoreBefore + 2)
})

test('the main-page menu offers watched at 70% and moving it adds no extra XP', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await seedVideoOrganizationState(page)
  async function setCoverage(seconds) {
    await page.evaluate(async seconds => {
      const state = loadState()
      const video = state.videos['menu-anchor-video']
      video.resumeAtSeconds = 479
      video.watchCycleCoverage = [{ start: 0, end: seconds }]
      video.watchProgress = [{ watchedAt: '2026-08-03T04:00:00.000Z', seconds, experienceSeconds: seconds }]
      await saveState(state)
    }, seconds)
    await page.reload()
    await waitForApplication(page)
  }
  async function openMenu() {
    const card = page.locator('#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]')
    await card.scrollIntoViewIfNeeded()
    if (testInfo.project.name === 'desktop-standard') await card.hover()
    await card.locator('[data-video-organization-action="menu"]').click()
  }
  await setCoverage(335)
  await openMenu()
  await expect(page.locator('[data-video-organization-action="put-watched"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await setCoverage(336)
  const scoreBefore = await page.evaluate(() => getCurrentCityScore(loadState()))
  await openMenu()
  const move = page.locator('[data-video-organization-action="put-watched"]')
  await expect(move).toHaveText('Put in watched section')
  await move.click()
  expect(await page.evaluate(() => loadState().videos['menu-anchor-video'].status)).toBe('watched')
  expect(await page.evaluate(() => getCurrentCityScore(loadState()))).toBe(scoreBefore)
})

for (const scenario of ['watched replay', 'watched favorite', 'partial favorite', 'legacy watched favorite']) {
  test(`Put in watched section clears organization for a ${scenario} without changing study facts`, async ({ page }, testInfo) => {
    test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
    await seedVideoOrganizationState(page, { testerMode: testInfo.project.name === 'desktop-standard' })
    await page.evaluate(async scenario => {
      const state = loadState()
      const video = state.videos['menu-anchor-video']
      Object.assign(video, {
        status: scenario === 'partial favorite' ? 'partial' : 'watched',
        favorite: true,
        watchLater: true,
        watchedAt: scenario === 'partial favorite' ? null : '2026-08-02T06:00:00.000Z',
        watchedConfirmationUnlockedAt: '2026-08-02T06:00:00.000Z',
        resumeAtSeconds: scenario.endsWith('watched favorite') ? null : 53,
        watchCycleCoverage: [{ start: 0, end: 53 }],
        watchProgress: [{ watchedAt: '2026-08-02T06:00:00.000Z', seconds: 480, experienceSeconds: 480 }]
      })
      if (scenario === 'legacy watched favorite') {
        video.watchProgress = []
        delete video.watchProgressTracked
        delete video.watchCycleCoverage
      }
      await saveState(state)
    }, scenario)
    await page.reload()
    await waitForApplication(page)
    const before = await page.evaluate(() => ({
      video: structuredClone(loadState().videos['menu-anchor-video']),
      score: getCurrentCityScore(loadState())
    }))
    const card = page.locator('#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]')
    await card.scrollIntoViewIfNeeded()
    if (testInfo.project.name === 'desktop-standard') await card.hover()
    await card.locator('[data-video-organization-action="menu"]').click()
    const move = page.locator('[data-video-organization-action="put-watched"]')
    await expect(move).toBeVisible()
    const separatorPositions = await page.locator('#videoActionsPopover .video-actions-list').evaluate(list => {
      const items = Array.from(list.querySelectorAll('[role="menuitem"]'))
      const owners = [list, ...items]
      return owners.flatMap(owner => {
        const style = getComputedStyle(owner, '::before')
        if (style.content === 'none' || style.content === 'normal') return []
        return [owner.getBoundingClientRect().top + parseFloat(style.top)]
      }).map(y => Math.min(...items.slice(1).map(item => Math.abs(item.getBoundingClientRect().top - y))))
    })
    expect(separatorPositions).toHaveLength((await page.locator('#videoActionsPopover [role="menuitem"]').count()) - 1)
    for (const distance of separatorPositions) expect(distance).toBeLessThanOrEqual(1)
    await move.click()
    await expect(card).toHaveCount(0)
    const after = await page.evaluate(() => ({
      video: loadState().videos['menu-anchor-video'],
      score: getCurrentCityScore(loadState())
    }))
    expect(after.video).toMatchObject({ status: 'watched', favorite: false, watchLater: false, resumeAtSeconds: null, pausedAt: null })
    expect(after.video.watchProgress).toEqual(before.video.watchProgress)
    expect(after.score).toBe(before.score)
    if (before.video.status === 'watched') expect(after.video.watchedAt).toBe(before.video.watchedAt)
    await page.reload()
    await waitForApplication(page)
    await expect(card).toHaveCount(0)
    const watchedToggle = page.locator('#watchedSectionToggle')
    if (await watchedToggle.getAttribute('aria-expanded') !== 'true') await watchedToggle.click()
    await expect(page.locator('#watchedGrid .video-card[data-video-id="menu-anchor-video"]')).toBeVisible()
    expect(await page.evaluate(() => markVideo('menu-anchor-video', 'watched', { putInWatchedSection: true, creditOnlyRecordedProgress: true }))).toBe(false)
    await page.evaluate(() => undoLastVideoAction())
    expect(await page.evaluate(() => loadState().videos['menu-anchor-video'])).toEqual(before.video)
    expect(await page.evaluate(() => getCurrentCityScore(loadState()))).toBe(before.score)
  })
}

for (const status of ['partial', 'watched']) {
  test(`ending Put in watched section removes Favorite from a ${status} video`, async ({ page }, testInfo) => {
    test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
    await seedVideoOrganizationState(page, { testerMode: testInfo.project.name === 'desktop-standard' })
    await page.evaluate(async status => {
      const state = loadState()
      Object.assign(state.videos['menu-anchor-video'], {
        status, favorite: true, watchLater: true,
        watchedAt: status === 'watched' ? '2026-08-02T06:00:00.000Z' : null,
        watchedConfirmationUnlockedAt: '2026-08-02T06:00:00.000Z',
        watchProgress: [{ watchedAt: '2026-08-02T06:00:00.000Z', seconds: 480, experienceSeconds: 480 }]
      })
      await saveState(state)
    }, status)
    await page.reload()
    await waitForApplication(page)
    const before = await page.evaluate(() => ({
      score: getCurrentCityScore(loadState()),
      progress: structuredClone(loadState().videos['menu-anchor-video'].watchProgress)
    }))
    await installFakeYoutubePlayer(page)
    await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
    await endFakeVideo(page)
    await page.locator('[data-video-watch-prompt-action="confirm"]').click()
    await expect(page.locator('.video-player-overlay')).toHaveCount(0)
    await expect(page.locator('#videoGrid .channel-shelf-card[data-video-id="menu-anchor-video"]')).toHaveCount(0)
    const after = await page.evaluate(() => ({ video: loadState().videos['menu-anchor-video'], score: getCurrentCityScore(loadState()) }))
    expect(after.video).toMatchObject({ status: 'watched', favorite: false, watchLater: false, resumeAtSeconds: null })
    expect(after.video.watchProgress).toEqual(before.progress)
    expect(after.score).toBe(before.score)
  })
}

test('ending popup uses the available player width and keeps its corner close control clear', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page, { locale: 'fr' })
  await installFakeYoutubePlayer(page)
  await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
  await endFakeVideo(page)
  const popup = page.locator('.video-watch-reminder-popover.is-player')
  for (const width of [1440, 900, 700, 644, 640, 390, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const layout = await popup.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const close = element.querySelector('.video-watch-reminder-close').getBoundingClientRect()
      const buttons = [...element.querySelectorAll('.video-watch-reminder-actions button')].map(button => button.getBoundingClientRect())
      return {
        overflow: element.scrollWidth - element.clientWidth,
        inside: buttons.every(button => button.left >= rect.left && button.right <= rect.right),
        clear: buttons.every(button => button.right <= close.left || button.top >= close.bottom),
        topGap: close.top - rect.top,
        rightGap: rect.right - close.right,
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        stacked: getComputedStyle(element.querySelector('.video-watch-reminder-actions')).flexDirection === 'column'
      }
    })
    expect(layout.overflow, `width ${width}`).toBeLessThanOrEqual(1)
    expect(layout.inside, `width ${width}`).toBe(true)
    expect(layout.clear, `width ${width}`).toBe(true)
    expect(layout.topGap).toBeLessThanOrEqual(3)
    expect(layout.rightGap).toBeLessThanOrEqual(3)
    expect(layout.visible).toBe(true)
    if (width <= 640) expect(layout.stacked).toBe(true)
    if (width >= 900) expect(layout.stacked).toBe(false)
  }
})

test('Favorite waits for durable storage and can be retried after a failed save', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page, { testerMode: true })
  await page.route('**/config.local.js*', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false, indexedDbProfileEnabled: true }',
    contentType: 'application/javascript'
  }))
  await page.reload()
  await waitForApplication(page)
  await installFakeYoutubePlayer(page)
  await page.evaluate(() => window.openVideoPlayer('menu-anchor-video'))
  await endFakeVideo(page)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    window.__restoreVideoWrites = () => { IDBObjectStore.prototype.put = put }
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('Synthetic storage exhaustion', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.locator('[data-video-watch-prompt-action="favorite"]').click()
  await expect.poll(() => page.evaluate(() => activeVideoShelfPlayer.completionPromptActionPending)).toBe(false)
  await expect(page.locator('.video-watch-reminder-popover.is-player')).toBeVisible()
  expect(await page.evaluate(() => loadState().videos['menu-anchor-video'].favorite === true)).toBe(false)
  await page.evaluate(() => window.__restoreVideoWrites())
  await page.locator('[data-video-watch-prompt-action="favorite"]').click()
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  await page.reload()
  expect(await page.evaluate(() => loadState().videos['menu-anchor-video'].favorite)).toBe(true)
  expect(await page.evaluate(() => loadState().videos['menu-anchor-video'].status)).toBe('partial')
})
