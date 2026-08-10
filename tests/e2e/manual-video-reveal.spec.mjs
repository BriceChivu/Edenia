import { expect, test } from '../support/network-fixture.mjs'

const testedProjects = new Set([
  'desktop-standard',
  'tablet-portrait',
  'phone-standard'
])
const fixtureChannelId = 'UC0000000000000000000000'
const fixtureVideoId = 'fixture0001'

async function seedCompletedState(page, options = {}) {
  const trackFixtureChannel = options.trackFixtureChannel !== false
  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = {
      youtubeApiKey: 'fixture-key',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      videoOrganizationEnabled: true,
      channelVideoFormatToggleEnabled: true,
      supabaseUrl: '',
      supabasePublishableKey: ''
    }`,
    contentType: 'application/javascript',
    status: 200
  }))
  await page.goto('/')
  await page.evaluate(({ channelId, trackFixtureChannel }) => {
    const channels = trackFixtureChannel
      ? [{ id: channelId, name: 'Fixture Language Channel' }]
      : []
    const state = window.defaultState(4, channels, 'light', [], 'en')
    const completedAt = '2026-08-05T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    for (let index = 0; index < 8; index += 1) {
      const id = `existing-${index}`
      state.videos[id] = {
        id,
        title: `Existing fixture video ${index + 1}`,
        channelId,
        channelTitle: 'Fixture Language Channel',
        thumbnail: 'https://i.ytimg.com/fixture-video.jpg',
        publishedAt: `2026-07-${String(28 - index).padStart(2, '0')}T04:00:00.000Z`,
        duration: 754,
        status: 'unwatched',
        source: 'youtube'
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, { channelId: fixtureChannelId, trackFixtureChannel })
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await page.evaluate(() => {
    window.__manualVideoRevealEvents = []
    window.__manualVideoRevealScrollCalls = []
    const scrollIntoView = Element.prototype.scrollIntoView
    const scrollTo = Element.prototype.scrollTo
    Element.prototype.scrollIntoView = function (...args) {
      if (this.matches?.('.channel-shelf')) {
        window.__manualVideoRevealScrollCalls.push('shelf')
      }
      return scrollIntoView.apply(this, args)
    }
    Element.prototype.scrollTo = function (...args) {
      if (this.matches?.('.channel-shelf-track')) {
        window.__manualVideoRevealScrollCalls.push('track')
      }
      return scrollTo.apply(this, args)
    }
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__manualVideoRevealEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'manual-video-reveal-regression'
      },
      setPersonProperties() {}
    }
  })
}

async function addFixtureVideo(page, projectName) {
  const addButton = page.locator('#manualVideoBtn')
  if (projectName === 'desktop-standard') {
    await addButton.click()
  } else {
    await addButton.tap()
  }
  const input = page.locator('#manualVideoUrlInput')
  await input.fill(`https://www.youtube.com/watch?v=${fixtureVideoId}`)
  await input.press('Enter')
}

test('adding a video scrolls to its card and reports a visible reveal', async ({
  page
}, testInfo) => {
  test.skip(!testedProjects.has(testInfo.project.name))
  await seedCompletedState(page)

  await addFixtureVideo(page, testInfo.project.name)

  const card = page.locator(`.video-card[data-video-id="${fixtureVideoId}"]`)
  await expect(card).toBeAttached()
  await expect.poll(() => page.evaluate(() => (
    window.__manualVideoRevealEvents.find(
      event => event.eventName === 'manual_video_reveal_completed'
    )?.properties || null
  ))).toMatchObject({
    video_url: `https://www.youtube.com/watch?v=${fixtureVideoId}`,
    result: 'visible',
    card_found: true,
    scroll_requested: true,
    highlight_started: true,
    card_visible_after_reveal: true
  })

  const geometry = await card.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const track = element.closest('.channel-shelf-track')
    const trackRect = track.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      trackLeft: trackRect.left,
      trackRight: trackRect.right,
      trackScrollLeft: track.scrollLeft,
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth
    }
  })
  expect(geometry.trackScrollLeft).toBeGreaterThan(0)
  expect(geometry.left).toBeGreaterThanOrEqual(Math.max(0, geometry.trackLeft) - 1)
  expect(geometry.right).toBeLessThanOrEqual(
    Math.min(geometry.viewportWidth, geometry.trackRight) + 1
  )
  expect(geometry.top).toBeGreaterThanOrEqual(-1)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
})

test('a newly tracked channel performs one reveal after its refresh render', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedCompletedState(page, { trackFixtureChannel: false })

  await addFixtureVideo(page, testInfo.project.name)

  await expect.poll(() => page.evaluate(() => (
    window.__manualVideoRevealEvents.find(event => (
      event.eventName === 'refresh_completed'
      && event.properties.trigger === 'channel_added'
    ))?.properties.result || null
  ))).toBe('success')
  await expect.poll(() => page.evaluate(() => (
    window.__manualVideoRevealEvents.filter(
      event => event.eventName === 'manual_video_reveal_completed'
    ).length
  ))).toBe(1)
  await expect.poll(() => page.evaluate(() => (
    window.__manualVideoRevealScrollCalls
  ))).toEqual(['shelf', 'track'])

  await page.evaluate(() => new Promise(resolve => {
    let remainingFrames = 4
    const waitForFrame = () => {
      remainingFrames -= 1
      if (remainingFrames === 0) {
        resolve()
        return
      }
      window.requestAnimationFrame(waitForFrame)
    }
    window.requestAnimationFrame(waitForFrame)
  }))
  expect(await page.evaluate(() => window.__manualVideoRevealScrollCalls)).toEqual([
    'shelf',
    'track'
  ])

  const card = page.locator(`.video-card[data-video-id="${fixtureVideoId}"]`)
  await expect(card).toBeInViewport({ ratio: 0.98 })
})
