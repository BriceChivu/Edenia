import { expect, test } from '../support/network-fixture.mjs'

async function seed(page) {
  await page.goto('/')
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const now = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: now, setupCompleted: true, setupCompletedAt: now,
      walkthroughCompleted: true, walkthroughCompletedAt: now, levelUpGuidanceShownAt: now })
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = now
    state.config.channels = [{ id: 'anchor', name: 'Anchor' }]
    for (let i = 0; i < 20; i++) state.videos[`anchor-${i}`] = {
      id: `anchor-${i}`, channelId: 'anchor', channelTitle: 'Anchor', title: `Lesson ${i}`,
      duration: 600, aspectRatio: 16 / 9, status: 'unwatched', thumbnail: '', favorite: true,
      publishedAt: new Date(Date.UTC(2026, 8, 20 - i)).toISOString()
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await page.locator('.channel-shelf').scrollIntoViewIfNeeded()
}

test('removal menu returns focus on failure, retry and the last-card empty state', async ({ page }) => {
  await seed(page)
  const card = page.locator('.video-card[data-video-id="anchor-0"]')
  await card.locator('.more-btn').focus()
  await card.locator('.more-btn').press('Enter')
  const remove = page.locator('#videoActionsList [data-video-organization-action="remove-feed"]')
  await expect(remove).toBeFocused()
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 'edenia_v1') throw new DOMException('Full', 'QuotaExceededError')
      return window.__setItem.call(this, key, value)
    }
  })
  await remove.press('Enter')
  await expect(card.locator('.more-btn')).toBeFocused()
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem })
  await card.locator('.more-btn').press('Enter')
  await remove.press('Enter')
  await expect(page.locator('.video-card[data-video-id="anchor-1"] .more-btn')).toBeFocused()
  await page.evaluate(() => {
    const state = window.loadState()
    for (const id of Object.keys(state.videos)) if (id !== 'anchor-1') delete state.videos[id]
    window.saveState(state)
    window.renderAll(state)
  })
  const last = page.locator('.video-card[data-video-id="anchor-1"] .more-btn')
  await last.focus()
  await last.press('Enter')
  await remove.press('Enter')
  await expect(page.locator('#videoGrid .empty-state')).toBeFocused()
})

test('Favorites keep publication ordering after Watch later and retain the next favorite on removal', async ({ page }) => {
  await seed(page)
  await page.evaluate(() => document.querySelector('[data-status-tab="favorite"]').click())
  await page.evaluate(() => window.markVideo('anchor-2', 'watch-later'))
  const ids = await page.locator('.channel-shelf .video-card').evaluateAll(cards => cards.map(card => card.dataset.videoId))
  expect(ids.slice(0, 3)).toEqual(['anchor-0', 'anchor-1', 'anchor-2'])
  const favorite = page.locator('.video-card[data-video-id="anchor-0"] .favorite-btn')
  await favorite.focus()
  await favorite.press('Enter')
  await expect(page.locator('.video-card[data-video-id="anchor-1"] .favorite-btn')).toBeFocused()
})

test('retained shelf cards update their accessible labels when language changes', async ({ page }) => {
  await seed(page)
  const button = page.locator('.video-card[data-video-id="anchor-0"] .favorite-btn')
  const before = await button.getAttribute('aria-label')
  await page.evaluate(() => window.saveLocaleFromSettings('fr'))
  await expect(button).not.toHaveAttribute('aria-label', before)
})

test('collection card replacement retains its identity and vertical position', async ({ page }) => {
  await seed(page)
  await page.evaluate(() => {
    const state = window.loadState()
    for (const video of Object.values(state.videos)) Object.assign(video, { status: 'watched', favorite: false, watchedAt: new Date().toISOString() })
    window.saveState(state)
    window.renderAll(state)
  })
  await page.locator('#watchedSectionToggle').click()
  await page.locator('#watchedGrid').scrollIntoViewIfNeeded()
  const card = page.locator('#watchedGrid .video-card[data-video-id="anchor-8"]')
  await card.locator('.favorite-btn').focus()
  const top = await card.evaluate(element => element.getBoundingClientRect().top)
  await page.evaluate(() => window.saveLocaleFromSettings('fr'))
  await expect(card.locator('.favorite-btn')).toBeFocused()
  expect(Math.abs(await card.evaluate(element => element.getBoundingClientRect().top) - top)).toBeLessThan(2)
})

test('player close has a focus destination after its last source card is removed', async ({ page }) => {
  await seed(page)
  await page.evaluate(() => {
    const state = window.loadState()
    for (const id of Object.keys(state.videos)) if (id !== 'anchor-0') delete state.videos[id]
    window.saveState(state)
    window.renderAll(state)
    window.YT = { Player: class {
      constructor(_iframe, config) { queueMicrotask(() => config.events.onReady?.({ target: this })) }
      getCurrentTime() { return 0 }
      getPlayerState() { return 2 }
      getPlaybackRate() { return 1 }
      playVideo() {}
      seekTo() {}
      destroy() {}
    } }
  })
  await page.locator('.video-card[data-video-id="anchor-0"] .thumb-link').focus()
  await page.evaluate(() => window.openVideoPlayer('anchor-0'))
  await expect(page.locator('.video-player-overlay')).toBeVisible()
  await page.evaluate(() => window.removeVideoFromFeed('anchor-0'))
  await page.keyboard.press('Escape')
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  await expect(page.locator('#videoGrid .empty-state')).toBeFocused()
})
