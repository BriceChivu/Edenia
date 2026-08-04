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
    overflow = false
  } = {}
) {
  const storageKey = internalTest ? internalStorageKey : normalStorageKey
  await page.goto(internalTest ? '/?internal_test=1' : '/')
  await waitForApplication(page)
  await page.evaluate(({
    includeShorts: seededIncludeShorts,
    locale: seededLocale,
    overflow: seededOverflow,
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
      for (let index = 0; index < 6; index += 1) {
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
        favorite: false,
        status: 'unwatched',
        thumbnail: '',
        watchedAt: null
      }
    })
    localStorage.setItem(seededStorageKey, JSON.stringify(state))
  }, { includeShorts, locale, overflow, storageKey })
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

test('internal format selection is orientation-based, independent, and ephemeral', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page)

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

  const storedBefore = await page.evaluate(
    key => localStorage.getItem(key),
    internalStorageKey
  )
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
    key => localStorage.getItem(key),
    internalStorageKey
  )
  expect(storedAfter).toBe(storedBefore)
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

test('public mode preserves the preference while the internal rollout includes every duration', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page, { includeShorts: false, internalTest: false })
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(0)
  await expect(page.locator('#videoGrid .video-card[data-video-id]')).toHaveCount(4)
  await expect(page.locator(
    '#videoGrid .video-card[data-video-id="a-horizontal-short-duration"]'
  )).toHaveCount(0)
  const publicStatusTabsDesign = await page.locator('.status-tabs').evaluate(element => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth
    }
  })
  expect(publicStatusTabsDesign.borderWidth).not.toBe('0px')
  expect(publicStatusTabsDesign.background).not.toBe('rgba(0, 0, 0, 0)')
  await page.locator('.gear-btn').click()
  await expect(page.locator('.settings-shorts-group')).toBeVisible()

  await seedFormatState(page, { includeShorts: false, internalTest: true })
  await expect(page.locator('body')).toHaveClass(/\bchannel-video-format-toggle-enabled\b/)
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(3)
  await expect(page.locator(
    '#videoGrid .video-card[data-video-id="a-horizontal-short-duration"]'
  )).toBeVisible()
  expect(await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config.includeShorts
  ), internalStorageKey)).toBe(false)
  await page.locator('.gear-btn').click()
  await expect(page.locator('.settings-shorts-group')).toHaveClass(/\bhidden\b/)
})

test('format controls fit long localized channel headers on desktop and phone', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
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
      buttonHeights: buttons.map(button => button.getBoundingClientRect().height),
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
  const isPhone = testInfo.project.name === 'phone-small'
  const minimumButtonHeight = isPhone ? 40 : 24
  layout.buttonHeights.forEach(height => {
    expect(height).toBeGreaterThanOrEqual(minimumButtonHeight)
  })
  if (isPhone) {
    expect(layout.switcherHeight).toBeGreaterThanOrEqual(40)
  } else {
    expect(layout.arrowHeights).toHaveLength(2)
    layout.arrowHeights.forEach(height => {
      expect(layout.switcherHeight).toBeCloseTo(height, 1)
    })
  }
})
