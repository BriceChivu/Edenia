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
    window.__setItem = profileBrowserStorage.setItem
    profileBrowserStorage.setItem = function(key, value) {
      if (key === 'edenia_v1') throw new DOMException('Full', 'QuotaExceededError')
      return window.__setItem.call(this, key, value)
    }
  })
  await remove.press('Enter')
  await expect(card.locator('.more-btn')).toBeFocused()
  await page.evaluate(() => { profileBrowserStorage.setItem = window.__setItem })
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

async function prependUploads(page, batch) {
  await page.evaluate(batch => {
    const state = window.loadState()
    for (let i = 0; i < 3; i++) state.videos[`${batch}-${i}`] = {
      ...state.videos['anchor-0'], id: `${batch}-${i}`, title: `New ${batch} ${i}`,
      publishedAt: new Date(Date.UTC(2026, 9, batch === 'first' ? 1 : 2, 3 - i)).toISOString()
    }
    window.saveState(state)
    window.renderAll(state)
  }, batch)
}

test('new uploads keep untouched channel timelines at the newest end, including offscreen rows', async ({ page }) => {
  await seed(page)
  const track = page.locator('.channel-shelf-track')
  await expect.poll(() => track.evaluate(node => node.scrollLeft)).toBeLessThanOrEqual(2)
  await prependUploads(page, 'first')
  await expect.poll(() => track.evaluate(node => node.scrollLeft)).toBeLessThanOrEqual(2)
  await expect(page.locator('.video-card').first()).toHaveAttribute('data-video-id', 'first-0')
  await page.evaluate(() => window.scrollTo(0, 0))
  await prependUploads(page, 'second')
  await track.scrollIntoViewIfNeeded()
  await expect.poll(() => track.evaluate(node => node.scrollLeft)).toBeLessThanOrEqual(2)
  await expect(page.locator('.video-card').first()).toHaveAttribute('data-video-id', 'second-0')
})

test('new uploads preserve older browsing positions until the learner returns to the newest end', async ({ page }) => {
  await seed(page)
  const track = page.locator('.channel-shelf-track')
  await page.locator('.channel-shelf-scroll-next').click()
  await expect.poll(() => track.evaluate(node => node.scrollLeft)).toBeGreaterThan(100)
  // Wait for the arrow's smooth scroll to finish before capturing its anchor.
  await expect.poll(() => track.evaluate(node => {
    const pitch = node.querySelector('.channel-shelf-slot').getBoundingClientRect().width
      + parseFloat(getComputedStyle(node).columnGap)
    return Math.abs(node.scrollLeft - Math.round(node.scrollLeft / pitch) * pitch)
  })).toBeLessThan(2)
  const anchor = await track.evaluate(node => {
    const rect = node.getBoundingClientRect()
    const slot = [...node.querySelectorAll('.channel-shelf-slot')].find(slot => slot.getBoundingClientRect().left >= rect.left)
    return { id: slot.querySelector('.video-card').dataset.videoId, left: slot.getBoundingClientRect().left }
  })
  await prependUploads(page, 'first')
  const anchoredCard = page.locator(`.video-card[data-video-id="${anchor.id}"]`)
  await expect.poll(() => anchoredCard.evaluate((node, left) => Math.abs(node.closest('.channel-shelf-slot').getBoundingClientRect().left - left), anchor.left)).toBeLessThan(2)
  for (let i = 0; i < 5 && await page.locator('.channel-shelf-scroll-prev').isEnabled(); i++) {
    await page.locator('.channel-shelf-scroll-prev').click()
    await page.waitForTimeout(400)
  }
  await expect.poll(() => track.evaluate(node => node.scrollLeft)).toBeLessThanOrEqual(2)
  await prependUploads(page, 'second')
  await expect.poll(() => track.evaluate(node => node.scrollLeft)).toBeLessThanOrEqual(2)
})
