import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-04T04:00:00.000Z')
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

async function seedFormatState(
  page,
  {
    includeShorts = true,
    internalTest = true,
    locale = 'en',
    overflow = false,
    publishedAt = null,
    runtimeFlag = null
  } = {}
) {
  const storageKey = internalTest ? internalStorageKey : normalStorageKey
  if (typeof runtimeFlag === 'boolean') {
    await page.route('**/config.local.js', route => route.fulfill({
      body: `window.EDENIA_CONFIG = {
        youtubeApiKey: '',
        freePlusEnabled: false,
        plusCheckoutEnabled: false,
        videoOrganizationEnabled: true,
        channelVideoFormatToggleEnabled: ${runtimeFlag},
        supabaseUrl: '',
        supabasePublishableKey: ''
      }`,
      contentType: 'application/javascript',
      status: 200
    }))
  }
  await page.goto(internalTest ? '/?internal_test=1' : '/')
  await waitForApplication(page)
  await page.evaluate(({
    includeShorts: seededIncludeShorts,
    locale: seededLocale,
    overflow: seededOverflow,
    publishedAt: seededPublishedAt,
    storageKey: seededStorageKey
  }) => {
    const state = window.defaultState(4, [], 'light', [], seededLocale)
    const completedAt = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.includeShorts = seededIncludeShorts
    state.config.channels = [
      {
        id: 'channel-a',
        name: 'A deliberately long channel name for layout validation'
      },
      { id: 'channel-b', name: 'Channel B' },
      { id: 'channel-c', name: 'Channel C' }
    ]
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt

    const videos = [
      {
        id: 'a-horizontal-short-duration',
        title: 'Horizontal short-duration video',
        channelId: 'channel-a',
        channelTitle: state.config.channels[0].name,
        duration: 60,
        aspectRatio: 16 / 9,
        publishedAt: '2026-08-04T03:00:00.000Z'
      },
      {
        id: 'a-vertical-long-duration',
        title: 'Vertical long-duration video',
        channelId: 'channel-a',
        channelTitle: state.config.channels[0].name,
        duration: 600,
        aspectRatio: 9 / 16,
        publishedAt: '2026-08-04T02:00:00.000Z'
      },
      {
        id: 'b-horizontal',
        title: 'Channel B horizontal video',
        channelId: 'channel-b',
        channelTitle: 'Channel B',
        duration: 480,
        aspectRatio: 16 / 9,
        publishedAt: '2026-08-04T01:00:00.000Z'
      },
      {
        id: 'b-vertical',
        title: 'Channel B vertical video',
        channelId: 'channel-b',
        channelTitle: 'Channel B',
        duration: 420,
        aspectRatio: 9 / 16,
        publishedAt: seededOverflow
          ? '2026-08-04T01:30:00.000Z'
          : '2026-08-04T00:00:00.000Z'
      },
      {
        id: 'c-horizontal-only',
        title: 'Channel C horizontal only',
        channelId: 'channel-c',
        channelTitle: 'Channel C',
        duration: 360,
        aspectRatio: 16 / 9,
        publishedAt: '2026-08-03T23:00:00.000Z'
      }
    ]
    if (seededOverflow) {
      for (let index = 0; index < 12; index += 1) {
        videos.push(
          {
            id: `a-vertical-overflow-${index}`,
            title: `Channel A vertical overflow ${index}`,
            channelId: 'channel-a',
            channelTitle: state.config.channels[0].name,
            duration: 600 + index,
            aspectRatio: 9 / 16,
            publishedAt: new Date(Date.UTC(2026, 7, 4, 1, 50 - index)).toISOString()
          },
          {
            id: `b-horizontal-overflow-${index}`,
            title: `Channel B horizontal overflow ${index}`,
            channelId: 'channel-b',
            channelTitle: 'Channel B',
            duration: 600 + index,
            aspectRatio: 16 / 9,
            publishedAt: new Date(Date.UTC(2026, 7, 4, 0, 50 - index)).toISOString()
          }
        )
      }
    }
    videos.forEach(video => {
      state.videos[video.id] = {
        ...video,
        publishedAt: seededPublishedAt || video.publishedAt,
        favorite: false,
        status: 'unwatched',
        thumbnail: '',
        watchedAt: null
      }
    })
    localStorage.setItem(seededStorageKey, JSON.stringify(state))
  }, { includeShorts, locale, overflow, publishedAt, storageKey })
  await page.reload()
  await waitForApplication(page)
  return storageKey
}

async function expectRightArrowScrollsFromHiddenFirstSlot(shelf) {
  const track = shelf.locator('.channel-shelf-track')
  const nextButton = shelf.locator('[data-shelf-direction="1"]')
  expect(await shelf.evaluate(element => (
    element.querySelector('.channel-shelf-slot')?.hidden === true
  ))).toBe(true)
  await expect(nextButton).toBeEnabled()
  await expect(track).toHaveJSProperty('scrollLeft', 0)
  await nextButton.click()
  await expect.poll(() => track.evaluate(element => element.scrollLeft))
    .toBeGreaterThan(0)
}

test('internal format selection persists per channel and emits channel-aware analytics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page)
  await page.evaluate(() => {
    window.__channelFormatAnalyticsEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__channelFormatAnalyticsEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'channel-format-regression'
      },
      setPersonProperties() {}
    }
  })

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  const channelB = page.locator('.channel-shelf[data-channel-key="channel-b"]')
  const channelC = page.locator('.channel-shelf[data-channel-key="channel-c"]')
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(3)
  const channelAVideos = channelA.locator(
    '[data-channel-video-format="videos"][data-channel-video-format-action="select"]'
  )
  const channelAShorts = channelA.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  )
  await expect(channelAVideos).toHaveAttribute('aria-label', 'Videos')
  await expect(channelAShorts).toHaveAttribute('aria-label', 'Shorts')
  await expect(channelAVideos.locator('.channel-shelf-format-icon')).toHaveCount(1)
  await expect(channelAShorts.locator('.channel-shelf-format-icon')).toHaveCount(1)
  await expect(channelAVideos).toHaveText('')
  await expect(channelAShorts).toHaveText('')
  await expect(channelA.locator('.channel-shelf-format-count')).toHaveCount(0)
  await expect(channelA).toHaveAttribute('data-channel-selected-video-format', 'videos')
  await expect(channelA.locator(
    '.video-card[data-video-id="a-horizontal-short-duration"]'
  )).toBeVisible()
  await expect(channelA.locator(
    '.video-card[data-video-id="a-vertical-long-duration"]'
  )).toBeHidden()

  await channelAShorts.focus()
  await channelAShorts.press('Space')
  await expect(channelAShorts).toBeFocused()
  await expect(channelAShorts).toHaveAttribute('aria-pressed', 'true')
  await expect(channelA).toHaveAttribute('data-channel-selected-video-format', 'shorts')
  await expect(channelA.locator(
    '.video-card[data-video-id="a-horizontal-short-duration"]'
  )).toBeHidden()
  await expect(channelA.locator(
    '.video-card[data-video-id="a-vertical-long-duration"]'
  )).toBeVisible()
  await expect(channelB.locator(
    '.video-card[data-video-id="b-horizontal"]'
  )).toBeVisible()
  await expect(channelB.locator(
    '.video-card[data-video-id="b-vertical"]'
  )).toBeHidden()

  await channelC.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  ).click()
  await expect(channelC).toBeVisible()
  await expect(channelC.locator(
    '[data-channel-video-format-empty="shorts"]'
  )).toBeVisible()
  await expect(channelC.locator('[data-channel-video-format-count-label]')).toHaveText('0 videos')

  const storedAfter = await page.evaluate(
    key => JSON.parse(localStorage.getItem(key)).config.channelVideoFormats,
    internalStorageKey
  )
  expect(storedAfter).toEqual({
    'channel-a': 'shorts',
    'channel-c': 'shorts'
  })
  expect(await page.evaluate(() => (
    window.__channelFormatAnalyticsEvents
      .filter(event => event.eventName === 'channel_video_format_viewed')
  ))).toEqual([
    {
      eventName: 'channel_video_format_viewed',
      properties: expect.objectContaining({
        channel_id: 'channel-a',
        channel_name: 'A deliberately long channel name for layout validation',
        persistence_succeeded: true,
        previous_format: 'videos',
        selected_format: 'shorts',
        surface: 'channel_shelf',
        visible_video_count: 1
      })
    },
    {
      eventName: 'channel_video_format_viewed',
      properties: expect.objectContaining({
        channel_id: 'channel-c',
        channel_name: 'Channel C',
        persistence_succeeded: true,
        previous_format: 'videos',
        selected_format: 'shorts',
        surface: 'channel_shelf',
        visible_video_count: 0
      })
    }
  ])

  await page.reload()
  await waitForApplication(page)
  const reloadedChannelA = page.locator(
    '.channel-shelf[data-channel-key="channel-a"]'
  )
  await expect(reloadedChannelA).toHaveAttribute(
    'data-channel-selected-video-format',
    'shorts'
  )
  await expect(reloadedChannelA.locator(
    '.video-card[data-video-id="a-vertical-long-duration"]'
  )).toBeVisible()
})

test('status filters show the available format without overwriting channel preferences', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page)
  await page.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.videos['a-horizontal-short-duration'].status = 'unwatched'
    state.videos['a-vertical-long-duration'].status = 'partial'
    state.videos['b-horizontal'].status = 'partial'
    state.videos['b-vertical'].status = 'unwatched'
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, internalStorageKey)
  await page.reload()
  await waitForApplication(page)

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  const channelB = page.locator('.channel-shelf[data-channel-key="channel-b"]')
  await channelB.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  ).click()
  await expect(channelB).toHaveAttribute('data-channel-selected-video-format', 'shorts')

  await page.locator('[data-status-tab="partial"]').click()
  await expect(channelA).toHaveAttribute('data-channel-selected-video-format', 'shorts')
  await expect(channelA.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  )).toHaveAttribute('aria-pressed', 'true')
  await expect(channelA.locator(
    '.video-card[data-video-id="a-vertical-long-duration"]'
  )).toBeVisible()
  await expect(channelA.locator('[data-channel-video-format-count-label]')).toHaveText('1 video')

  await expect(channelB).toHaveAttribute('data-channel-selected-video-format', 'videos')
  await expect(channelB.locator(
    '[data-channel-video-format="videos"][data-channel-video-format-action="select"]'
  )).toHaveAttribute('aria-pressed', 'true')
  await expect(channelB.locator(
    '.video-card[data-video-id="b-horizontal"]'
  )).toBeVisible()
  await expect(channelB.locator('[data-channel-video-format-count-label]')).toHaveText('1 video')
  await expect(page.locator('.channel-shelf-format-empty:not([hidden])')).toHaveCount(0)

  await page.locator('[data-status-tab="all"]').click()
  await expect(channelA).toHaveAttribute('data-channel-selected-video-format', 'videos')
  await expect(channelB).toHaveAttribute('data-channel-selected-video-format', 'shorts')
})

test('shelf arrows scroll when the selected format hides the first source slot', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page, { overflow: true })

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  await channelA.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  ).click()
  await expectRightArrowScrollsFromHiddenFirstSlot(channelA)

  const channelB = page.locator('.channel-shelf[data-channel-key="channel-b"]')
  await expect(channelB).toHaveAttribute('data-channel-selected-video-format', 'videos')
  await expectRightArrowScrollsFromHiddenFirstSlot(channelB)
})

test('expanded desktop Shorts use compact localized timestamps without crowding actions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const oneWeekAgo = new Date(fixedNow.getTime() - (10 * 86_400_000)).toISOString()
  const fifteenMonthsAgo = new Date(fixedNow.getTime() - (450 * 86_400_000)).toISOString()
  const cases = [
    {
      locale: 'es',
      publishedAt: oneWeekAgo,
      full: 'hace 1 semana',
      compact: 'hace 1 sem'
    },
    {
      locale: 'es',
      publishedAt: fifteenMonthsAgo,
      full: 'hace 15 meses',
      compact: 'hace 15 m'
    },
    {
      locale: 'fr',
      publishedAt: oneWeekAgo,
      full: 'il y a 1 semaine',
      compact: 'il y a 1 sem'
    }
  ]

  for (const expected of cases) {
    await seedFormatState(page, expected)
    const channel = page.locator('.channel-shelf[data-channel-key="channel-a"]')
    const videoCard = channel.locator(
      '.channel-shelf-slot[data-channel-video-format="videos"] .channel-shelf-card'
    ).first()
    await expect(videoCard.locator('.pub-ago')).toHaveText(expected.full)

    await channel.locator(
      '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
    ).click()
    const shortCard = channel.locator(
      '.channel-shelf-slot[data-channel-video-format="shorts"]:not([hidden]) .channel-shelf-card'
    ).first()
    await shortCard.scrollIntoViewIfNeeded()
    await shortCard.hover()
    await expect(shortCard).toHaveClass(/\bis-previewing\b/)
    await expect.poll(() => shortCard.evaluate(card => {
      const width = card.getBoundingClientRect().width
      const targetWidth = Number.parseFloat(
        getComputedStyle(card).getPropertyValue('--shelf-preview-size')
      )
      return Math.abs(width - targetWidth) < 0.1
    })).toBe(true)

    const fullLabel = shortCard.locator('.pub-ago-full')
    const compactLabel = shortCard.locator('.pub-ago-compact')
    await expect(fullLabel).toHaveText(expected.full)
    await expect(fullLabel).toHaveCSS('display', 'none')
    await expect(compactLabel).toHaveText(expected.compact)
    await expect(compactLabel).toBeVisible()

    const layout = await shortCard.evaluate(card => {
      const cardRect = card.getBoundingClientRect()
      const timestampRect = card.querySelector('.pub-ago-compact').getBoundingClientRect()
      const actionRects = Array.from(card.querySelectorAll('.card-actions .action-btn'))
        .map(button => button.getBoundingClientRect())
      return {
        actionLeft: Math.min(...actionRects.map(rect => rect.left)) - cardRect.left,
        timestampRight: timestampRect.right - cardRect.left
      }
    })
    expect(layout.timestampRight).toBeLessThanOrEqual(layout.actionLeft)
    await page.mouse.move(0, 0)
    await expect(shortCard).not.toHaveClass(/\bis-floating-preview\b/)
  }
})

test('mobile Shorts retain full localized timestamps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')
  await seedFormatState(page, {
    locale: 'es',
    publishedAt: new Date(fixedNow.getTime() - (10 * 86_400_000)).toISOString()
  })

  const channel = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  await channel.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  ).click()
  const shortCard = channel.locator(
    '.channel-shelf-slot[data-channel-video-format="shorts"]:not([hidden]) .channel-shelf-card'
  ).first()
  await expect(shortCard.locator('.pub-ago-full')).toHaveText('hace 1 semana')
  await expect(shortCard.locator('.pub-ago-full')).toHaveCSS('display', 'inline')
  await expect(shortCard.locator('.pub-ago-compact')).toHaveCSS('display', 'none')
})

test('vertical cards resize without changing the channel shelf footprint', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'tablet-portrait'].includes(testInfo.project.name))
  await seedFormatState(page, { overflow: true })

  const openPreview = async card => {
    if (testInfo.project.name === 'desktop-standard') {
      await card.hover()
    } else {
      await card.evaluate(element => element.click())
    }
    await expect(card).toHaveClass(/\bis-previewing\b/)
  }
  const closePreview = async card => {
    if (testInfo.project.name === 'desktop-standard') {
      await page.mouse.move(0, 0)
    } else {
      await page.evaluate(() => document.body.click())
    }
    await expect(card).not.toHaveClass(/\bis-floating-preview\b/)
  }

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  const channelB = page.locator('.channel-shelf[data-channel-key="channel-b"]')
  const track = channelA.locator('.channel-shelf-track')
  const horizontalSlot = channelA.locator(
    '.channel-shelf-slot[data-channel-video-format="videos"]:not([hidden])'
  ).first()
  const initialLayout = await page.evaluate(() => {
    const shelf = document.querySelector('.channel-shelf[data-channel-key="channel-a"]')
    const nextShelf = document.querySelector('.channel-shelf[data-channel-key="channel-b"]')
    const shelfTrack = shelf.querySelector('.channel-shelf-track')
    const slot = shelf.querySelector(
      '.channel-shelf-slot[data-channel-video-format="videos"]:not([hidden])'
    )
    const trackStyle = getComputedStyle(shelfTrack)
    return {
      gap: Number.parseFloat(trackStyle.columnGap || trackStyle.gap),
      cardHeight: slot.querySelector('.channel-shelf-card').getBoundingClientRect().height,
      nextShelfTop: nextShelf.getBoundingClientRect().top + window.scrollY,
      slotHeight: slot.getBoundingClientRect().height,
      slotWidth: slot.getBoundingClientRect().width,
      trackHeight: shelfTrack.getBoundingClientRect().height
    }
  })
  await expect(horizontalSlot).toBeVisible()
  const horizontalCard = horizontalSlot.locator('.channel-shelf-card')
  await horizontalCard.scrollIntoViewIfNeeded()
  await openPreview(horizontalCard)
  await expect.poll(() => horizontalCard.evaluate(card => (
    card.getBoundingClientRect().width
  ))).toBeCloseTo(
    Math.min(Math.max(initialLayout.slotWidth * 1.25, 295), 315),
    2
  )
  const horizontalPreviewHeight = await horizontalCard.evaluate(card => (
    card.getBoundingClientRect().height
  ))
  const horizontalPreviewSpacing = await horizontalCard.evaluate(card => {
    const bodyStyle = getComputedStyle(card.querySelector('.card-body'))
    const footerStyle = getComputedStyle(card.querySelector('.card-footer'))
    return {
      bodyGap: bodyStyle.gap,
      bodyJustifyContent: bodyStyle.justifyContent,
      footerJustifyContent: footerStyle.justifyContent
    }
  })
  await closePreview(horizontalCard)

  await channelA.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  ).click()
  const shortsSlot = channelA.locator(
    '.channel-shelf-slot[data-channel-video-format="shorts"]:not([hidden])'
  ).first()
  const shortsCard = shortsSlot.locator('.channel-shelf-card')
  await expect(shortsCard).toBeVisible()

  const collapsedLayout = await shortsSlot.evaluate(slot => {
    const card = slot.querySelector('.channel-shelf-card')
    const shelf = slot.closest('.channel-shelf')
    const nextShelf = document.querySelector('.channel-shelf[data-channel-key="channel-b"]')
    const shelfTrack = shelf.querySelector('.channel-shelf-track')
    const trackStyle = getComputedStyle(shelfTrack)
    const thumbnailRect = card.querySelector('.thumb-link').getBoundingClientRect()
    const thumbnailStyle = getComputedStyle(card.querySelector('.thumb'))
    const slotRect = slot.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    return {
      cardHeight: cardRect.height,
      cardWidth: cardRect.width,
      gap: Number.parseFloat(trackStyle.columnGap || trackStyle.gap),
      nextShelfTop: nextShelf.getBoundingClientRect().top + window.scrollY,
      slotHeight: slotRect.height,
      slotWidth: slotRect.width,
      thumbnailAspectRatio: thumbnailRect.width / thumbnailRect.height,
      thumbnailObjectFit: thumbnailStyle.objectFit,
      thumbnailScale: new DOMMatrix(thumbnailStyle.transform).a,
      thumbnailTransitionDuration: thumbnailStyle.transitionDuration,
      trackHeight: shelfTrack.getBoundingClientRect().height
    }
  })
  expect(collapsedLayout.cardWidth).toBeCloseTo(105, 0)
  expect(collapsedLayout.cardHeight).toBeCloseTo(initialLayout.cardHeight, 4)
  expect(collapsedLayout.slotWidth).toBeCloseTo(105, 0)
  expect(collapsedLayout.slotHeight).toBeCloseTo(initialLayout.slotHeight, 4)
  expect(collapsedLayout.trackHeight).toBeCloseTo(initialLayout.trackHeight, 4)
  expect(collapsedLayout.nextShelfTop).toBeCloseTo(initialLayout.nextShelfTop, 4)
  expect(collapsedLayout.gap).toBe(initialLayout.gap)
  expect(collapsedLayout.thumbnailObjectFit).toBe('cover')
  expect(collapsedLayout.thumbnailScale).toBeCloseTo(1.4, 2)
  expect(collapsedLayout.thumbnailTransitionDuration).toBe('0s')

  await shortsCard.scrollIntoViewIfNeeded()
  await openPreview(shortsCard)
  const openingThumbnailAspectRatio = await shortsCard.evaluate(card => {
    const thumbnailRect = card.querySelector('.thumb-link').getBoundingClientRect()
    return thumbnailRect.width / thumbnailRect.height
  })
  expect(openingThumbnailAspectRatio).toBeGreaterThan(0.65)
  expect(openingThumbnailAspectRatio).toBeLessThanOrEqual((31 / 40) + 0.01)
  await expect.poll(() => shortsCard.evaluate(card => {
    const width = card.getBoundingClientRect().width
    const targetWidth = Number.parseFloat(
      getComputedStyle(card).getPropertyValue('--shelf-preview-size')
    )
    return Math.abs(width - targetWidth) < 0.1
  })).toBe(true)
  const expandedLayout = await shortsCard.evaluate(card => {
    const cardStyle = getComputedStyle(card)
    const cardRect = card.getBoundingClientRect()
    const thumbnailRect = card.querySelector('.thumb-link').getBoundingClientRect()
    const bodyRect = card.querySelector('.card-body').getBoundingClientRect()
    const bodyStyle = getComputedStyle(card.querySelector('.card-body'))
    const titleRect = card.querySelector('.card-title').getBoundingClientRect()
    const dateRect = card.querySelector('.pub-ago').getBoundingClientRect()
    const channelNameStyle = getComputedStyle(card.querySelector('.channel-name'))
    const footerStyle = getComputedStyle(card.querySelector('.card-footer'))
    const thumbnailStyle = getComputedStyle(card.querySelector('.thumb'))
    const actionRects = Array.from(card.querySelectorAll('.card-actions .action-btn'))
      .map(button => button.getBoundingClientRect())
    return {
      actionRects: actionRects.map(rect => ({
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top
      })),
      bodyGap: bodyStyle.gap,
      bodyHeight: bodyRect.height,
      bodyJustifyContent: bodyStyle.justifyContent,
      borderBlock: Number.parseFloat(cardStyle.borderTopWidth)
        + Number.parseFloat(cardStyle.borderBottomWidth),
      card: {
        bottom: cardRect.bottom,
        height: cardRect.height,
        left: cardRect.left,
        right: cardRect.right,
        top: cardRect.top,
        width: cardRect.width
      },
      channelNameDisplay: channelNameStyle.display,
      dateHeight: dateRect.height,
      footerJustifyContent: footerStyle.justifyContent,
      thumbnailAspectRatio: thumbnailRect.width / thumbnailRect.height,
      thumbnailBottomInset: Number.parseFloat(
        getComputedStyle(card.querySelector('.thumb-link')).bottom
      ),
      thumbnailHeight: thumbnailRect.height,
      thumbnailObjectFit: thumbnailStyle.objectFit,
      thumbnailScale: new DOMMatrix(thumbnailStyle.transform).a,
      thumbnailTransitionDuration: thumbnailStyle.transitionDuration,
      titleHeight: titleRect.height
    }
  })
  expect(expandedLayout.card.width).toBeGreaterThanOrEqual(145)
  expect(expandedLayout.card.width).toBeLessThanOrEqual(150)
  expect(Math.abs(expandedLayout.card.height - horizontalPreviewHeight))
    .toBeLessThanOrEqual(0.5)
  expect(
    expandedLayout.thumbnailHeight
      + expandedLayout.bodyHeight
      + expandedLayout.borderBlock
  )
    .toBeCloseTo(expandedLayout.card.height, 0)
  expect(expandedLayout.channelNameDisplay).toBe('none')
  expect(expandedLayout.bodyGap).toBe(horizontalPreviewSpacing.bodyGap)
  expect(expandedLayout.bodyJustifyContent).toBe(
    horizontalPreviewSpacing.bodyJustifyContent
  )
  expect(expandedLayout.footerJustifyContent).toBe(
    horizontalPreviewSpacing.footerJustifyContent
  )
  expect(expandedLayout.titleHeight).toBeGreaterThan(0)
  expect(expandedLayout.dateHeight).toBeGreaterThan(0)
  expect(expandedLayout.actionRects).toHaveLength(3)
  expandedLayout.actionRects.forEach(rect => {
    expect(rect.left).toBeGreaterThanOrEqual(expandedLayout.card.left)
    expect(rect.right).toBeLessThanOrEqual(expandedLayout.card.right)
    expect(rect.top).toBeGreaterThanOrEqual(expandedLayout.card.top)
    expect(rect.bottom).toBeLessThanOrEqual(expandedLayout.card.bottom)
  })
  expect(expandedLayout.thumbnailObjectFit).toBe('cover')
  expect(expandedLayout.thumbnailAspectRatio).toBeCloseTo(31 / 40, 2)
  expect(expandedLayout.thumbnailBottomInset).toBeGreaterThan(0)
  expect(expandedLayout.thumbnailScale).toBeCloseTo(
    collapsedLayout.thumbnailScale,
    2
  )
  expect(expandedLayout.thumbnailTransitionDuration).toBe('0s')
  if (testInfo.project.name === 'desktop-standard') {
    await page.mouse.move(0, 0)
    await shortsCard.evaluate(card => {
      const thumbnail = card.querySelector('.thumb-link')
      card.shortsClosingThumbnailSettled = new Promise(resolve => {
        const finish = event => {
          if (event.propertyName !== 'bottom') return
          window.clearTimeout(timeout)
          thumbnail.removeEventListener('transitionend', finish)
          const cardRect = card.getBoundingClientRect()
          const cardStyle = getComputedStyle(card)
          const thumbnailRect = thumbnail.getBoundingClientRect()
          const thumbnailStyle = getComputedStyle(thumbnail)
          resolve({
            bottomGap: cardRect.bottom
              - Number.parseFloat(cardStyle.borderBottomWidth)
              - thumbnailRect.bottom,
            bottomInset: Number.parseFloat(thumbnailStyle.bottom),
            cardHeight: cardRect.height,
            timedOut: false,
            transitionDuration: thumbnailStyle.transitionDuration
          })
        }
        const timeout = window.setTimeout(() => {
          thumbnail.removeEventListener('transitionend', finish)
          resolve({ timedOut: true })
        }, 230)
        thumbnail.addEventListener('transitionend', finish)
      })
      window.closeVideoShelfPreview(card)
    })
    await expect(shortsCard).toHaveClass(/\bis-preview-closing\b/)
    await page.waitForTimeout(80)
    const closingLayout = await shortsCard.evaluate(card => {
      const cardRect = card.getBoundingClientRect()
      const bodyStyle = getComputedStyle(card.querySelector('.card-body'))
      const thumbnailRect = card.querySelector('.thumb-link').getBoundingClientRect()
      const bodyRect = card.querySelector('.card-body').getBoundingClientRect()
      const titleRect = card.querySelector('.card-title').getBoundingClientRect()
      const thumbnailLinkStyle = getComputedStyle(card.querySelector('.thumb-link'))
      const thumbnailStyle = getComputedStyle(card.querySelector('.thumb'))
      return {
        bodyOpacity: Number.parseFloat(bodyStyle.opacity),
        bodyPointerEvents: bodyStyle.pointerEvents,
        cardHeight: cardRect.height,
        panelIsBehindThumbnail: Number.parseFloat(thumbnailLinkStyle.zIndex)
          > Number.parseFloat(bodyStyle.zIndex),
        panelOverlapsThumbnail: thumbnailRect.bottom > bodyRect.top,
        thumbnailAspectRatio: thumbnailRect.width / thumbnailRect.height,
        thumbnailFrameTransitionDuration: thumbnailLinkStyle.transitionDuration,
        thumbnailHeight: thumbnailRect.height,
        thumbnailScale: new DOMMatrix(thumbnailStyle.transform).a,
        thumbnailTransitionDuration: thumbnailStyle.transitionDuration,
        titleHeight: titleRect.height
      }
    })
    expect(closingLayout.thumbnailHeight).toBeLessThan(closingLayout.cardHeight)
    expect(closingLayout.bodyOpacity).toBe(1)
    expect(closingLayout.bodyPointerEvents).toBe('auto')
    expect(closingLayout.panelIsBehindThumbnail).toBe(true)
    expect(closingLayout.panelOverlapsThumbnail).toBe(true)
    expect(closingLayout.thumbnailAspectRatio).toBeGreaterThan(0.65)
    expect(closingLayout.thumbnailAspectRatio)
      .toBeLessThanOrEqual(expandedLayout.thumbnailAspectRatio + 0.01)
    expect(closingLayout.thumbnailFrameTransitionDuration).toBe('0.155s')
    expect(closingLayout.thumbnailScale).toBeCloseTo(
      collapsedLayout.thumbnailScale,
      2
    )
    expect(closingLayout.thumbnailTransitionDuration).toBe('0s')
    expect(closingLayout.titleHeight).toBeGreaterThan(0)
    const thumbnailSettled = await shortsCard.evaluate(card => (
      card.shortsClosingThumbnailSettled
    ))
    // The card width and thumbnail bottom transitions end together, so browsers
    // may remove the closing class before delivering this transitionend event.
    expect(thumbnailSettled.timedOut).toBe(false)
    expect(thumbnailSettled.transitionDuration).toBe('0.155s')
    expect(thumbnailSettled.bottomInset).toBeCloseTo(0, 2)
    expect(thumbnailSettled.bottomGap).toBeCloseTo(0, 0)
    expect(thumbnailSettled.cardHeight).toBeGreaterThan(collapsedLayout.cardHeight)
    await expect(shortsCard).not.toHaveClass(/\bis-floating-preview\b/)
    const collapsedBottomGap = await shortsCard.evaluate(card => {
      const cardRect = card.getBoundingClientRect()
      const cardStyle = getComputedStyle(card)
      const thumbnailRect = card.querySelector('.thumb-link').getBoundingClientRect()
      return cardRect.bottom
        - Number.parseFloat(cardStyle.borderBottomWidth)
        - thumbnailRect.bottom
    })
    expect(collapsedBottomGap).toBeCloseTo(0, 0)
  } else {
    await closePreview(shortsCard)
  }
  await expect(track).toHaveJSProperty('scrollLeft', 0)
  await expect(channelB).toBeVisible()
})

test('mobile Shorts cards stay vertical with fixed cropping and visible actions', async ({ page }, testInfo) => {
  test.skip(!['phone-standard', 'phone-small'].includes(testInfo.project.name))
  await seedFormatState(page)

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  const horizontalSlot = channelA.locator(
    '.channel-shelf-slot[data-channel-video-format="videos"]:not([hidden])'
  ).first()
  const horizontalLayout = await horizontalSlot.evaluate(slot => {
    const card = slot.querySelector('.channel-shelf-card')
    const cardRect = card.getBoundingClientRect()
    return {
      ratio: cardRect.width / cardRect.height,
      titleDisplay: getComputedStyle(card.querySelector('.card-copy')).display
    }
  })

  await channelA.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
  ).click()
  const shortsSlot = channelA.locator(
    '.channel-shelf-slot[data-channel-video-format="shorts"]:not([hidden])'
  ).first()
  await expect(shortsSlot).toBeVisible()

  const layout = await shortsSlot.evaluate(slot => {
    const card = slot.querySelector('.channel-shelf-card')
    const thumbnailLink = card.querySelector('.thumb-link')
    const thumbnail = card.querySelector('.thumb')
    const actions = Array.from(card.querySelectorAll('.card-actions .action-btn'))
    const slotRect = slot.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const thumbnailRect = thumbnailLink.getBoundingClientRect()
    const thumbnailStyle = getComputedStyle(thumbnail)
    return {
      actionCount: actions.length,
      actionsFit: actions.every(action => {
        const rect = action.getBoundingClientRect()
        return rect.left >= cardRect.left && rect.right <= cardRect.right
      }),
      actionsVisible: actions.every(action => {
        const style = getComputedStyle(action)
        const rect = action.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden'
          && rect.width > 0 && rect.height > 0
      }),
      cardRatio: cardRect.width / cardRect.height,
      cardWidth: cardRect.width,
      slotRatio: slotRect.width / slotRect.height,
      thumbnailFillsCard: Math.abs(
        thumbnailRect.left - (cardRect.left + card.clientLeft)
      ) <= 1
        && Math.abs(thumbnailRect.top - (cardRect.top + card.clientTop)) <= 1
        && Math.abs(
          thumbnailRect.right - (cardRect.right - card.clientLeft)
        ) <= 1
        && Math.abs(
          thumbnailRect.bottom - (cardRect.bottom - card.clientTop)
        ) <= 1,
      thumbnailObjectFit: thumbnailStyle.objectFit,
      thumbnailScale: new DOMMatrix(thumbnailStyle.transform).a,
      thumbnailTransitionDuration: thumbnailStyle.transitionDuration,
      titleDisplay: getComputedStyle(card.querySelector('.card-copy')).display
    }
  })

  expect(horizontalLayout.ratio).toBeCloseTo(16 / 9, 2)
  expect(horizontalLayout.titleDisplay).not.toBe('none')
  expect(layout.cardWidth).toBeGreaterThanOrEqual(154)
  expect(layout.cardRatio).toBeCloseTo(3 / 4, 2)
  expect(layout.slotRatio).toBeCloseTo(3 / 4, 2)
  expect(layout.titleDisplay).toBe('none')
  expect(layout.actionCount).toBe(3)
  expect(layout.actionsVisible).toBe(true)
  expect(layout.actionsFit).toBe(true)
  expect(layout.thumbnailFillsCard).toBe(true)
  expect(layout.thumbnailObjectFit).toBe('cover')
  expect(layout.thumbnailScale).toBeCloseTo(1.4, 2)
  expect(layout.thumbnailTransitionDuration).toBe('0s')
})

test('retired false marker cannot disable permanent format controls or migrate preferences', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await seedFormatState(page, {
    includeShorts: false,
    internalTest: false,
    runtimeFlag: false
  })
  await expect(page.locator('body')).toHaveClass(
    /\bchannel-video-format-toggle-enabled\b/
  )
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(3)
  await expect(page.locator(
    '#videoGrid .video-card[data-video-id="a-horizontal-short-duration"]'
  )).toBeVisible()
  expect(await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config.includeShorts
  ), normalStorageKey)).toBe(false)
  const permanentStatusTabsDesign = await page.locator('.status-tabs').evaluate(element => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth
    }
  })
  expect(permanentStatusTabsDesign.borderWidth).toBe('0px')
  expect(permanentStatusTabsDesign.background).toBe('rgba(0, 0, 0, 0)')
  await page.locator('.gear-btn').click()
  await expect(page.locator('.settings-shorts-group')).toHaveClass(/\bhidden\b/)
  await page.evaluate(() => {
    const input = document.getElementById('settingsIncludeShorts')
    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config.includeShorts
  ), normalStorageKey)).toBe(false)
})

test('compatibility marker true preserves permanent controls in normal mode', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await seedFormatState(page, {
    includeShorts: false,
    internalTest: false,
    runtimeFlag: true
  })

  await expect(page.locator('body')).toHaveClass(
    /\bchannel-video-format-toggle-enabled\b/
  )
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(3)
  await expect(page.locator(
    '#videoGrid .video-card[data-video-id="a-horizontal-short-duration"]'
  )).toBeVisible()
  expect(await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config.includeShorts
  ), normalStorageKey)).toBe(false)

  await page.locator('.gear-btn').click()
  await expect(page.locator('.settings-shorts-group')).toHaveClass(/\bhidden\b/)
})

test('format controls fit long localized channel headers on desktop and phone', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard', 'phone-small'].includes(
    testInfo.project.name
  ))
  await seedFormatState(page, { locale: 'fr' })

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  const switcher = channelA.locator('.channel-shelf-format-switcher')
  await expect(switcher).toBeVisible()
  await expect(switcher).toHaveAttribute(
    'aria-label',
    'Type de vidéo pour A deliberately long channel name for layout validation'
  )
  const layout = await page.evaluate(() => {
    const shelf = document.querySelector(
      '.channel-shelf[data-channel-key="channel-a"]'
    )
    const switcherElement = shelf.querySelector('.channel-shelf-format-switcher')
    const buttons = Array.from(
      switcherElement.querySelectorAll('.channel-shelf-format-option')
    )
    const selectedButton = switcherElement.querySelector(
      '.channel-shelf-format-option[aria-pressed="true"]'
    )
    const statusTabs = document.querySelector('.status-tabs')
    const activeStatusTab = statusTabs.querySelector('.status-tab.active')
    const insightTabs = document.querySelector('.study-insight-tabs')
    const activeInsightTab = insightTabs.querySelector('.study-insight-tab.active')
    const switcherStyle = getComputedStyle(switcherElement)
    const selectedStyle = getComputedStyle(selectedButton)
    const statusTabsStyle = getComputedStyle(statusTabs)
    const activeStatusTabStyle = getComputedStyle(activeStatusTab)
    const insightTabsStyle = getComputedStyle(insightTabs)
    const activeInsightTabStyle = getComputedStyle(activeInsightTab)
    const shelfRect = shelf.getBoundingClientRect()
    const switcherRect = switcherElement.getBoundingClientRect()
    const titleRowRect = shelf.querySelector('.channel-shelf-title-row')
      .getBoundingClientRect()
    const addButtonRect = document.getElementById('manualVideoBtn')
      .getBoundingClientRect()
    return {
      documentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ),
      viewportWidth: document.documentElement.clientWidth,
      shelfLeft: shelfRect.left,
      shelfRight: shelfRect.right,
      switcherLeft: switcherRect.left,
      switcherRight: switcherRect.right,
      switcherHeight: switcherRect.height,
      switcherCenterY: switcherRect.top + switcherRect.height / 2,
      titleRowCenterY: titleRowRect.top + titleRowRect.height / 2,
      buttonHeights: buttons.map(button => button.getBoundingClientRect().height),
      buttonWidths: buttons.map(button => button.getBoundingClientRect().width),
      addButtonWidth: addButtonRect.width,
      arrowHeights: Array.from(
        shelf.querySelectorAll('.channel-shelf-scroll')
      ).map(button => button.getBoundingClientRect().height),
      switcherDesign: {
        background: switcherStyle.backgroundColor,
        borderWidth: switcherStyle.borderTopWidth,
        borderRadius: switcherStyle.borderRadius,
        padding: switcherStyle.padding
      },
      statusTabsDesign: {
        background: statusTabsStyle.backgroundColor,
        borderWidth: statusTabsStyle.borderTopWidth,
        borderRadius: statusTabsStyle.borderRadius,
        padding: statusTabsStyle.padding
      },
      insightTabsDesign: {
        background: insightTabsStyle.backgroundColor,
        borderWidth: insightTabsStyle.borderTopWidth,
        borderRadius: insightTabsStyle.borderRadius,
        padding: insightTabsStyle.padding
      },
      selectedDesign: {
        background: selectedStyle.backgroundColor,
        boxShadow: selectedStyle.boxShadow,
        color: selectedStyle.color,
        borderRadius: selectedStyle.borderRadius
      },
      activeStatusTabDesign: {
        background: activeStatusTabStyle.backgroundColor,
        boxShadow: activeStatusTabStyle.boxShadow,
        color: activeStatusTabStyle.color,
        borderRadius: activeStatusTabStyle.borderRadius
      },
      activeInsightTabDesign: {
        background: activeInsightTabStyle.backgroundColor,
        boxShadow: activeInsightTabStyle.boxShadow,
        color: activeInsightTabStyle.color,
        borderRadius: activeInsightTabStyle.borderRadius
      },
      iconImages: Object.fromEntries(buttons.map(button => [
        button.dataset.channelVideoFormat,
        getComputedStyle(button.querySelector('.channel-shelf-format-icon')).backgroundImage
      ]))
    }
  })
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.switcherLeft).toBeGreaterThanOrEqual(layout.shelfLeft)
  expect(layout.switcherRight).toBeLessThanOrEqual(layout.shelfRight)
  expect(layout.switcherDesign).toEqual(layout.insightTabsDesign)
  expect(layout.statusTabsDesign).toEqual(layout.insightTabsDesign)
  expect(layout.selectedDesign).toEqual(layout.activeInsightTabDesign)
  expect(layout.activeStatusTabDesign).toEqual(layout.activeInsightTabDesign)
  expect(layout.iconImages.videos).toContain('images/brands/youtube-black.svg')
  expect(layout.iconImages.shorts).toContain(
    'images/brands/youtube-shorts-black-logo.svg'
  )
  const isPhone = testInfo.project.name.startsWith('phone-')
  const minimumButtonHeight = isPhone ? 40 : 24
  layout.buttonHeights.forEach(height => {
    expect(height).toBeGreaterThanOrEqual(minimumButtonHeight)
  })
  if (isPhone) {
    expect(layout.switcherHeight).toBeGreaterThanOrEqual(40)
    expect(layout.switcherCenterY).toBeCloseTo(layout.titleRowCenterY, 0)
    layout.buttonWidths.forEach(width => {
      expect(width).toBeCloseTo(layout.addButtonWidth, 1)
    })
  } else {
    expect(layout.arrowHeights).toHaveLength(2)
    layout.arrowHeights.forEach(height => {
      expect(layout.switcherHeight).toBeCloseTo(height, 1)
    })
  }
})
