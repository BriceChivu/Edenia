import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-07-28T04:00:00.000Z')
const TEST_PROJECTS = new Set([
  'desktop-standard',
  'tablet-portrait',
  'phone-standard'
])
const LAYOUT_TOLERANCE_PX = 1

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

async function seedOnboardedHeatmapProfile(page) {
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.anki['2026-07-28'] = { reviewed: 6, created: 1 }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)
}

async function readHeatmapLayout(page) {
  return page.locator('#historyHeatmapView').evaluate(container => {
    const scroll = container.querySelector('.heatmap-scroll')
    const grid = container.querySelector('.heatmap-grid')
    const day = container.querySelector('.heatmap-day')
    if (!scroll || !grid || !day) {
      throw new Error('Expected a rendered Study History heatmap')
    }
    const containerRect = container.getBoundingClientRect()
    const dayRect = day.getBoundingClientRect()
    const gridStyle = getComputedStyle(grid)
    return {
      cellHeight: dayRect.height,
      cellWidth: dayRect.width,
      columnGap: Number.parseFloat(gridStyle.columnGap),
      containerRight: containerRect.right,
      containerWidth: containerRect.width,
      documentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ),
      maxScrollLeft: scroll.scrollWidth - scroll.clientWidth,
      scrollLeft: scroll.scrollLeft,
      viewportWidth: document.documentElement.clientWidth
    }
  })
}

async function addLongHistoryAndVideo(page) {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const channel = {
      id: 'heatmap-scroll-channel',
      name: 'Heatmap scroll channel'
    }
    const video = {
      channelId: channel.id,
      channelTitle: channel.name,
      duration: 600,
      favorite: false,
      id: 'heatmap-scroll-video',
      publishedAt: '2026-07-27T04:00:00.000Z',
      status: 'unwatched',
      thumbnail: 'https://i.ytimg.com/vi/heatmap-scroll-video/hqdefault.jpg',
      title: 'Heatmap scroll lesson'
    }
    state.anki['2025-08-01'] = { reviewed: 6, created: 1 }
    state.config.channels = [channel]
    state.videos = { [video.id]: video }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)
}

test('Study History heatmap keeps fixed cells and opens long history at the newest week', async ({
  page
}, testInfo) => {
  test.skip(!TEST_PROJECTS.has(testInfo.project.name))

  await seedOnboardedHeatmapProfile(page)
  await page.locator('[data-history-view="heatmap"]').click()
  const shortLayout = await readHeatmapLayout(page)

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki['2025-08-01'] = { reviewed: 6, created: 1 }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)
  const longLayout = await readHeatmapLayout(page)

  for (const layout of [shortLayout, longLayout]) {
    expect(layout.cellWidth).toBe(18)
    expect(layout.cellHeight).toBe(18)
    expect(layout.columnGap).toBe(4)
    expect(layout.containerRight).toBeLessThanOrEqual(
      layout.viewportWidth + LAYOUT_TOLERANCE_PX
    )
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
  }
  expect(longLayout.containerWidth).toBeGreaterThan(shortLayout.containerWidth)
  expect(Math.abs(
    longLayout.scrollLeft - longLayout.maxScrollLeft
  )).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
})

test('Study History heatmap preserves manual history position until the view is reopened', async ({
  page
}, testInfo) => {
  test.skip(!['tablet-portrait', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedOnboardedHeatmapProfile(page)
  await addLongHistoryAndVideo(page)
  const heatmapTab = page.locator('[data-history-view="heatmap"]')
  const summaryTab = page.locator('[data-history-view="summary"]')
  await heatmapTab.click()

  const manualScrollLeft = await page.locator('.heatmap-scroll').evaluate(
    scroll => {
      const target = Math.min(80, scroll.scrollWidth - scroll.clientWidth - 20)
      if (target <= 0) throw new Error('Expected an overflowing heatmap')
      scroll.scrollLeft = target
      scroll.dispatchEvent(new Event('scroll'))
      return scroll.scrollLeft
    }
  )
  await page.locator(
    '[data-video-id="heatmap-scroll-video"] .favorite-btn'
  ).press('Enter')
  await expect.poll(() => page.locator('.heatmap-scroll').evaluate(
    scroll => scroll.scrollLeft
  )).toBeCloseTo(manualScrollLeft, 0)

  await summaryTab.click()
  await heatmapTab.click()
  const reopenedLayout = await readHeatmapLayout(page)
  expect(Math.abs(
    reopenedLayout.scrollLeft - reopenedLayout.maxScrollLeft
  )).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
})
