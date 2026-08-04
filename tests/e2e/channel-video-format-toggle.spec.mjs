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
  { includeShorts = true, internalTest = true, locale = 'en' } = {}
) {
  const storageKey = internalTest ? internalStorageKey : normalStorageKey
  await page.goto(internalTest ? '/?internal_test=1' : '/')
  await waitForApplication(page)
  await page.evaluate(({
    includeShorts: seededIncludeShorts,
    locale: seededLocale,
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
        publishedAt: '2026-08-04T00:00:00.000Z'
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
  }, { includeShorts, locale, storageKey })
  await page.reload()
  await waitForApplication(page)
  return storageKey
}

test('internal format selection is orientation-based, independent, and ephemeral', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page)

  const channelA = page.locator('.channel-shelf[data-channel-key="channel-a"]')
  const channelB = page.locator('.channel-shelf[data-channel-key="channel-b"]')
  const channelC = page.locator('.channel-shelf[data-channel-key="channel-c"]')
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(3)
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
  const channelAShorts = channelA.locator(
    '[data-channel-video-format="shorts"][data-channel-video-format-action="select"]'
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

test('public mode and the global Shorts-off preference keep the legacy shelf path', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedFormatState(page, { internalTest: false })
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(0)
  await expect(page.locator('#videoGrid .video-card[data-video-id]')).toHaveCount(5)

  await seedFormatState(page, { includeShorts: false, internalTest: true })
  await expect(page.locator('.channel-shelf-format-switcher')).toHaveCount(0)
  await expect(page.locator(
    '#videoGrid .video-card[data-video-id="a-vertical-long-duration"]'
  )).toBeVisible()
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
      buttonHeights: buttons.map(button => button.getBoundingClientRect().height)
    }
  })
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.switcherLeft).toBeGreaterThanOrEqual(layout.shelfLeft)
  expect(layout.switcherRight).toBeLessThanOrEqual(layout.shelfRight)
  const minimumButtonHeight = testInfo.project.name === 'phone-small' ? 40 : 30
  layout.buttonHeights.forEach(height => {
    expect(height).toBeGreaterThanOrEqual(minimumButtonHeight)
  })
})
