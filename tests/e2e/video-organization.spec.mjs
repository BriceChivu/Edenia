import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-03T04:00:00.000Z')
const normalStorageKey = 'edenia_v1'
const internalStorageKey = 'edenia_v1_internal_test'

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
  { locale = 'en', internalTest = true, theme = 'light' } = {}
) {
  const storageKey = internalTest ? internalStorageKey : normalStorageKey
  await page.goto(internalTest ? '/?internal_test=1' : '/')
  await waitForApplication(page)
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
    internalStorageKey
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
    internalStorageKey
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
      const copyRect = element.querySelector('.video-watch-reminder-copy').getBoundingClientRect()
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
        actionsOnSecondRow: actionsRect.top >= copyRect.bottom - 0.5,
        buttonsInsidePrompt: buttonRects.every(rect => (
          rect.left >= promptRect.left - 0.5
          && rect.right <= promptRect.right + 0.5
          && rect.top >= promptRect.top - 0.5
          && rect.bottom <= promptRect.bottom + 0.5
        )),
        buttonsOverlap: buttonRects.some((rect, index) => (
          buttonRects.slice(index + 1).some(otherRect => overlaps(rect, otherRect))
        )),
        copyOverlapsActions: overlaps(copyRect, actionsRect),
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        verticalOverflow: element.scrollHeight - element.clientHeight
      }
    })

    expect(layout.buttonsInsidePrompt, locale).toBe(true)
    expect(layout.buttonsOverlap, locale).toBe(false)
    expect(layout.copyOverlapsActions, locale).toBe(false)
    expect(layout.horizontalOverflow, locale).toBeLessThanOrEqual(1)
    expect(layout.verticalOverflow, locale).toBeLessThanOrEqual(1)
    if (locale === 'fr') expect(layout.actionsOnSecondRow).toBe(true)
    if (locale === 'en' && testInfo.project.name === 'desktop-standard') {
      expect(layout.actionsOnSecondRow).toBe(false)
    }
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
  ), internalStorageKey)
  expect(persistedVideo.status).toBe('watched')
  expect(persistedVideo.watchedAt).toBe('2026-08-02T06:00:00.000Z')
  expect(persistedVideo.favorite).toBe(true)
})

test('phone Favorite keeps the same video and shelf position', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')
  await seedVideoOrganizationState(page, { internalTest: false })
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
  await seedVideoOrganizationState(page, { internalTest: false })

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
    internalKey: internalStorageKey
  })
  expect(persisted.video.status).toBe('partial')
  expect(persisted.video.setAside).toBeUndefined()
  expect(persisted.video.removedFromFeedAt).toBeTruthy()
  expect(persisted.internal).toBeNull()
})

test('internal organization actions stay in isolated test storage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify({ sentinel: 'normal-state' }))
  }, normalStorageKey)
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
    internalKey: internalStorageKey
  })
  expect(persisted.internal.videos['menu-anchor-video'].removedFromFeedAt).toBeTruthy()
  expect(persisted.normal).toEqual({ sentinel: 'normal-state' })
})

test('enabled organization migrates legacy state and history idempotently', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.goto('/?internal_test=1')
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
  }, internalStorageKey)

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
  }, internalStorageKey)

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
