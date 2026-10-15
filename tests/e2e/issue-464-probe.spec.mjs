import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

async function seedLibrary(page) {
  if (process.env.EDENIA_LIBRARY_BASELINE_BUNDLE) {
    const body = await readFile(process.env.EDENIA_LIBRARY_BASELINE_BUNDLE, 'utf8')
    await page.route('**/app.js*', route => route.fulfill({ body, contentType: 'application/javascript' }))
  }
  await page.goto('/')
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-09-01T00:00:00.000Z'
    Object.assign(state.onboarding, {
      introSeenAt: completedAt, setupCompleted: true, setupCompletedAt: completedAt,
      walkthroughCompleted: true, walkthroughCompletedAt: completedAt, levelUpGuidanceShownAt: completedAt
    })
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.includeShorts = true
    state.config.channels = Array.from({ length: 20 }, (_, i) => ({ id: `large-${i}`, name: `Library ${i}` }))
    for (let i = 0; i < 7000; i++) {
      const channel = state.config.channels[Math.floor(i / 300) % 20]
      state.videos[`large-${i}`] = {
        id: `large-${i}`, title: `Synthetic lesson ${i}`, channelId: channel.id,
        channelTitle: channel.name, duration: 600, thumbnail: '',
        publishedAt: new Date(Date.UTC(2026, 8, 1) - i * 60000).toISOString(),
        aspectRatio: i % 5 === 4 ? 9 / 16 : 16 / 9,
        status: i >= 6000 && i < 6500 ? 'watched' : 'unwatched',
        watchedAt: i >= 6000 && i < 6500 ? completedAt : null,
        removedFromFeedAt: i >= 6500 ? completedAt : null,
        favorite: false
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('.channel-shelf').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('Continue watching and Study History reach unmounted saved videos', async ({ page }, testInfo) => {
  await seedLibrary(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const now = new Date().toISOString()
    Object.assign(state.videos['large-5999'], {
      status: 'partial', resumeAtSeconds: 60, pausedAt: now,
      watchProgressTracked: true, watchProgress: [{ watchedAt: now, seconds: 60 }]
    })
    Object.assign(state.videos['large-6498'], {
      watchedAt: now, watchProgressTracked: true, watchProgress: [{ watchedAt: now, seconds: 600 }]
    })
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('.video-card[data-video-id="large-5999"]')).toHaveCount(0)
  if (!testInfo.project.name.startsWith('phone')) {
    await page.locator('[data-next-study-action="focus"][data-video-id="large-5999"]').click()
    await page.evaluate(() => renderFeed(loadState({ persistCleanup: false })))
    // The expanded preview can extend past the shelf; its source slot is the scroll destination.
    await expect(page.locator('.channel-shelf-slot').filter({ has: page.locator('.video-card[data-video-id="large-5999"]') })).toBeInViewport({ ratio: .98 })
    await page.evaluate(() => renderFeed(loadState({ persistCleanup: false })))
    await expect(page.locator('.video-card[data-video-id="large-5999"]')).toBeVisible()
    await page.keyboard.press('Escape')
  } else {
    await page.locator('.next-study-mobile-link[data-video-id="large-5999"]').click()
    await expect(page.locator('.video-player-overlay')).toBeVisible()
    await page.keyboard.press('Escape')
  }
  const historyItem = page.locator('[data-history-watched-video-action="jump"][data-video-id="large-6498"]').first()
  const cell = page.locator('[data-history-watched-popover-action="toggle"]').filter({ has: historyItem }).first()
  if (testInfo.project.use.hasTouch) await cell.locator('.history-video-count').press('Space')
  else await cell.hover()
  await cell.hover()
  await historyItem.focus()
  await page.mouse.move(0, 0)
  // Cross the 80 ms pointer-leave deadline with keyboard focus still inside.
  await page.waitForTimeout(150)
  await expect(historyItem).toBeFocused()
  await page.evaluate(() => renderStudyHistoryPanel(loadState({ persistCleanup: false })))
  await expect(historyItem).toBeFocused()
  await historyItem.press('Enter')
  await expect(page.locator('#watchedGrid .video-card[data-video-id="large-6498"]')).toBeInViewport({ ratio: .98 })
  expect(await page.locator('.video-card').count()).toBeLessThan(180)
})
