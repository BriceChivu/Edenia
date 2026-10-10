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

test('large libraries keep mounted cards bounded across prolonged browsing and format changes', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await seedLibrary(page)
  const initial = await page.locator('.video-card').count()
  console.log(JSON.stringify({ project: testInfo.project.name, initialMounted: initial }))
  const sampleTimings = await page.locator('.channel-shelf').first().evaluate(async shelf => {
    const samples = []
    for (const format of ['shorts', 'videos', 'shorts', 'videos']) {
      const start = performance.now()
      shelf.querySelector(`[data-channel-video-format-action="select"][data-channel-video-format="${format}"]`).click()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      samples.push(performance.now() - start)
    }
    return samples
  })
  console.log(JSON.stringify({ project: testInfo.project.name, sampleTimings }))
  expect(initial).toBeLessThan(150)
  await expect(page.locator('#watchedGrid .video-card')).toHaveCount(0)
  await expect(page.locator('#removedGrid .video-card')).toHaveCount(0)
  const counts = []
  const timings = []
  for (const shelfIndex of [0, 8, 19, 8, 0]) {
    const shelf = page.locator('.channel-shelf').nth(shelfIndex)
    await shelf.scrollIntoViewIfNeeded()
    await settle(page)
    for (const fraction of [0, .2, .4, .6, .8, 1, .8, .6, .4, .2, 0]) {
      await shelf.locator('.channel-shelf-track').evaluate((track, value) => {
        track.scrollTo({ left: value * (track.scrollWidth - track.clientWidth), behavior: 'instant' })
      }, fraction)
      await settle(page)
      expect(await shelf.locator('.video-card').count()).toBeGreaterThan(0)
      counts.push(await page.locator('.video-card').count())
    }
    for (const format of ['shorts', 'videos', 'shorts', 'videos']) {
      timings.push(await shelf.evaluate(async (element, selected) => {
        const start = performance.now()
        element.querySelector(`[data-channel-video-format-action="select"][data-channel-video-format="${selected}"]`).click()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return performance.now() - start
      }, format))
      await expect(shelf.locator('[data-channel-video-format-count-label]')).toHaveText(format === 'videos' ? '240 videos' : '60 videos')
      expect(await shelf.locator(`.channel-shelf-slot[data-channel-video-format="${format === 'videos' ? 'shorts' : 'videos'}"] .video-card`).count()).toBe(0)
    }
  }
  expect(Math.max(...counts)).toBeLessThan(150)
  await expect(page.locator('#watchedCount')).toHaveText('500')
  await expect(page.locator('#removedCount')).toHaveText('500')
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1')).videos).length)).toBe(7000)
  const measurements = { project: testInfo.project.name, initial, counts, formatTimingsMs: timings }
  console.log(JSON.stringify(measurements))
  await testInfo.attach('library-measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' })
})

async function searchFor(page, index) {
  await page.locator('#videoSearchBtn').click()
  await page.locator('#videoSearchInput').fill(`Synthetic lesson ${index}`)
  await page.locator(`#videoSearchResults [data-video-id="large-${index}"]`).click()
  await expect(page.locator(`.video-card[data-video-id="large-${index}"]`)).toBeVisible()
}

test('full-library search reveals distant active, watched and removed videos with bounded expanded sections', async ({ page }) => {
  await seedLibrary(page)
  for (const index of [5999, 6498, 6998, 0]) {
    await searchFor(page, index)
    await settle(page)
    expect(await page.locator('.video-card').count()).toBeLessThan(180)
  }
})

test('keyboard navigation crosses card windows and preserves the focused card', async ({ page }) => {
  await seedLibrary(page)
  const shelf = page.locator('.channel-shelf').first()
  await shelf.scrollIntoViewIfNeeded()
  await settle(page)
  await shelf.locator('.channel-shelf-track').evaluate(track => track.scrollTo({ left: 8000, behavior: 'instant' }))
  await settle(page)
  const lastCard = shelf.locator('.video-card').last()
  const index = Number((await lastCard.getAttribute('data-video-id')).split('-')[1])
  const nextIndex = index + 1 + ((index + 1) % 5 === 4 ? 1 : 0)
  await lastCard.locator('.more-btn').focus()
  await page.keyboard.press('Tab')
  await expect(shelf.locator(`.video-card[data-video-id="large-${nextIndex}"] .thumb-link`)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(shelf.locator(`.video-card[data-video-id="large-${index}"] .more-btn`)).toBeFocused()
  await shelf.locator('.channel-shelf-track').evaluate(track => track.scrollTo({ left: track.scrollWidth, behavior: 'instant' }))
  await settle(page)
  await expect(shelf.locator(`.video-card[data-video-id="large-${index}"] .more-btn`)).toBeFocused()
  expect(await page.locator('.video-card').count()).toBeLessThan(150)
  await shelf.locator('.channel-shelf-track').focus()
  await page.keyboard.press('Tab')
  await expect(shelf.locator('.video-card[data-video-id="large-0"] .thumb-link')).toBeFocused()
  await page.locator('.channel-shelf').nth(1).locator('.channel-shelf-remove').focus()
  await page.keyboard.press('Shift+Tab')
  await expect(shelf.locator('.video-card[data-video-id="large-298"] .more-btn')).toBeFocused()
})

test('expanded collections release distant rows in both directions', async ({ page }) => {
  await seedLibrary(page)
  const track = page.locator('.channel-shelf').first().locator('.channel-shelf-track')
  await track.scrollIntoViewIfNeeded()
  await settle(page)
  await track.evaluate(element => {
    const slot = element.querySelector('.channel-shelf-slot')
    const pitch = slot.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap)
    element.scrollTo({ left: pitch * 40, behavior: 'instant' })
  })
  await settle(page)
  const shelfPosition = await track.evaluate(element => element.scrollLeft)
  for (const [section, toggle] of [['watchedGrid', 'watchedSectionToggle'], ['removedGrid', 'removedSectionToggle']]) {
    await page.locator(`#${toggle}`).click()
    expect(await track.evaluate(element => element.scrollLeft)).toBe(shelfPosition)
    const grid = page.locator(`#${section}`)
    for (const fraction of [0, .25, .5, .75, 1, .75, .5, .25, 0]) {
      await grid.evaluate((element, value) => {
        window.scrollTo({ top: element.getBoundingClientRect().top + scrollY + value * (element.offsetHeight - innerHeight / 2), behavior: 'instant' })
      }, fraction)
      await settle(page)
      expect(await grid.locator('.video-card').count()).toBeGreaterThan(0)
      expect(await page.locator('.video-card').count()).toBeLessThan(180)
    }
    await page.locator(`#${toggle}`).click()
    await expect(grid.locator('.video-card')).toHaveCount(0)
  }
})

test('status and card interactions preserve the library and report unthrottled timings', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await seedLibrary(page)
  const timings = []
  for (const status of ['unwatched', 'all', 'unwatched', 'all']) {
    timings.push(await page.evaluate(async value => {
      const start = performance.now()
      document.querySelector(`[data-status-tab="${value}"]`).click()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { action: value, ms: performance.now() - start }
    }, status))
  }
  const shelf = page.locator('.channel-shelf').first()
  await shelf.scrollIntoViewIfNeeded()
  await settle(page)
  for (let i = 0; i < 4; i++) {
    timings.push(await shelf.evaluate(async element => {
      const start = performance.now()
      element.querySelector('.favorite-btn').click()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { action: 'favorite', ms: performance.now() - start }
    }))
  }
  console.log(JSON.stringify({ project: testInfo.project.name, interactionTimings: timings }))
  await testInfo.attach('interaction-measurements', { body: JSON.stringify(timings, null, 2), contentType: 'application/json' })
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1')).videos).length)).toBe(7000)
})

test('card eviction keeps the active player and persists its progress', async ({ page }, testInfo) => {
  await seedLibrary(page)
  await page.evaluate(() => {
    window.__playerCreations = 0
    window.__playerDestructions = 0
    window.YT = {
      Player: class {
        constructor(_iframe, config) {
          window.__playerCreations++
          window.__libraryPlayer = this
          this.events = config.events
          this.currentTime = 0
          this.state = 5
          queueMicrotask(() => this.events.onReady?.({ target: this }))
        }
        destroy() { window.__playerDestructions++ }
        getCurrentTime() { return this.currentTime }
        getPlaybackRate() { return 1 }
        getPlayerState() { return this.state }
        playVideo() { this.state = 1; this.events.onStateChange?.({ data: 1 }) }
        seekTo(seconds) { this.currentTime = Number(seconds) || 0 }
      }
    }
  })
  await searchFor(page, 0)
  const playerCard = page.locator('.video-card[data-video-id="large-0"]')
  await expect(playerCard).toBeInViewport({ ratio: .98 })
  if (!testInfo.project.name.startsWith('phone')) {
    if (testInfo.project.use.hasTouch) await playerCard.click()
    else await playerCard.hover()
    await expect(playerCard).toHaveClass(/is-previewing/)
  }
  await playerCard.locator('.thumb-link').click()
  await expect(page.locator('.video-player-overlay')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__playerCreations)).toBe(1)
  const track = page.locator('.channel-shelf').first().locator('.channel-shelf-track')
  await page.evaluate(() => window.toggleVideoFavorite('large-300'))
  // The overlay owns the player; underlying shelf eviction must not touch it.
  await page.evaluate(() => document.activeElement?.blur())
  await track.evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }))
  await expect(page.locator('.video-card[data-video-id="large-0"]')).toHaveCount(0)
  expect(await page.evaluate(() => [window.__playerCreations, window.__playerDestructions])).toEqual([1, 0])
  await page.evaluate(() => {
    const player = window.__libraryPlayer
    player.currentTime = 45
    player.state = 2
    player.events.onStateChange?.({ data: 2 })
  })
  await page.keyboard.press('Escape')
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).videos['large-0'].resumeAtSeconds)).toBe(45)
  await expect(playerCard.locator('.thumb-link')).toBeFocused()
  await expect(playerCard.locator('..')).toBeInViewport({ ratio: .98 })
})

test('native horizontal wheel and touch gestures browse the window', async ({ page }, testInfo) => {
  await seedLibrary(page)
  const track = page.locator('.channel-shelf').first().locator('.channel-shelf-track')
  await track.scrollIntoViewIfNeeded()
  await settle(page)
  const box = await track.boundingBox()
  if (testInfo.project.use.hasTouch) {
    const session = await page.context().newCDPSession(page)
    const startX = box.x + box.width * .75
    const y = box.y + box.height / 2
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: startX, y }]
    })
    for (let distance = 25; distance <= 200; distance += 25) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: startX - distance, y }]
      })
      await settle(page)
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8)
    await page.mouse.wheel(700, 0)
  }
  await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(100)
  expect(await page.locator('.video-card').count()).toBeLessThan(150)
})

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
    // The expanded preview can extend past the shelf; its source slot is the scroll destination.
    await expect(page.locator('.channel-shelf-slot').filter({ has: page.locator('.video-card[data-video-id="large-5999"]') })).toBeInViewport({ ratio: .98 })
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
  await historyItem.focus()
  await historyItem.press('Enter')
  await expect(page.locator('#watchedGrid .video-card[data-video-id="large-6498"]')).toBeInViewport({ ratio: .98 })
  expect(await page.locator('.video-card').count()).toBeLessThan(180)
})

test('adding a video reveals it in a large saved library', async ({ page }) => {
  await page.route('**/config.local.js', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { youtubeApiKey: "fixture-key" }',
    contentType: 'application/javascript'
  }))
  await seedLibrary(page)
  await page.locator('#manualVideoBtn').click()
  await page.locator('#manualVideoUrlInput').fill('https://www.youtube.com/watch?v=fixture0001')
  await page.locator('#manualVideoUrlInput').press('Enter')
  await expect(page.locator('.video-card[data-video-id="fixture0001"]')).toBeInViewport({ ratio: .98 })
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1')).videos).length)).toBeGreaterThanOrEqual(7001)
  expect(await page.locator('.video-card').count()).toBeLessThan(180)
})

test('reverse Tab passes a shelf with an empty format', async ({ page }) => {
  await seedLibrary(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    for (const video of Object.values(state.videos)) {
      if (video.channelId === 'large-0') video.aspectRatio = 16 / 9
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  const shelf = page.locator('.channel-shelf').first()
  await shelf.locator('[data-channel-video-format-action="select"][data-channel-video-format="shorts"]').click()
  await expect(shelf.locator('.channel-shelf-format-empty')).toBeVisible()
  await page.locator('.channel-shelf').nth(1).locator('.channel-shelf-remove').focus()
  await page.keyboard.press('Shift+Tab')
  await expect(shelf.locator('.channel-shelf-track')).toBeFocused()
})

test('preview actions remain current after a card is evicted and remounted', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.hasTouch)
  await seedLibrary(page)
  const shelf = page.locator('.channel-shelf').first()
  await shelf.scrollIntoViewIfNeeded()
  const card = shelf.locator('.video-card[data-video-id="large-0"]')
  await card.hover()
  await expect(card).toHaveClass(/is-previewing/)
  await card.locator('.favorite-btn').click()
  await expect(card.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(0, 0)
  await page.keyboard.press('Escape')
  const track = shelf.locator('.channel-shelf-track')
  await track.focus()
  await track.evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }))
  await expect(card).toHaveCount(0)
  await track.evaluate(element => element.scrollTo({ left: 0, behavior: 'instant' }))
  await expect(card.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'true')
})

test('deep shelf actions retain position, focus and unrelated shelves', async ({ page }, testInfo) => {
  await seedLibrary(page)
  const shelf = page.locator('.channel-shelf').nth(8)
  const track = shelf.locator('.channel-shelf-track')
  await shelf.scrollIntoViewIfNeeded()
  await track.evaluate(element => element.scrollTo({ left: 8000, behavior: 'instant' }))
  await settle(page)
  const result = await track.evaluate(async element => {
    const slots = [...element.querySelectorAll('.channel-shelf-slot')]
    const slot = slots.find(node => node.getBoundingClientRect().left >= element.getBoundingClientRect().left)
    const button = slot.querySelector('.favorite-btn')
    button.focus({ preventScroll: true })
    await new Promise(resolve => setTimeout(resolve, 300))
    const id = slot.querySelector('.video-card').dataset.videoId
    const x = slot.getBoundingClientRect().left
    const shelves = [...document.querySelectorAll('.channel-shelf')]
    const tracks = shelves.map(shelf => shelf.querySelector('.channel-shelf-track'))
    const siblingCard = [...element.querySelectorAll('.video-card')].find(card => card.dataset.videoId !== id)
    const start = performance.now()
    button.click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const next = document.querySelector(`.video-card[data-video-id="${id}"]`)
    return {
      ms: performance.now() - start,
      retained: shelves.every(node => node.isConnected) && tracks.every(node => node.isConnected),
      siblingRetained: siblingCard?.isConnected,
      delta: next ? next.closest('.channel-shelf-slot').getBoundingClientRect().left - x : null,
      focused: next?.contains(document.activeElement),
      favorite: next?.querySelector('.favorite-btn').getAttribute('aria-pressed')
    }
  })
  console.log(JSON.stringify({ project: testInfo.project.name, anchorInteraction: result }))
  expect(result.retained).toBe(true)
  expect(result.siblingRetained).toBe(true)
  expect(result.delta).not.toBeNull()
  expect(Math.abs(result.delta)).toBeLessThan(2)
  expect(result.focused).toBe(true)
  expect(result.favorite).toBe('true')
})

test('Watch later applies priority ordering while retaining the acted-on card and removal uses its neighbor', async ({ page }) => {
  await seedLibrary(page)
  const shelf = page.locator('.channel-shelf').nth(8)
  const track = shelf.locator('.channel-shelf-track')
  await shelf.scrollIntoViewIfNeeded()
  await track.evaluate(element => { element.style.scrollSnapType = 'none'; element.scrollTo({ left: 8000, behavior: 'instant' }) })
  await settle(page)
  const result = await track.evaluate(async element => {
    const slot = [...element.querySelectorAll('.channel-shelf-slot')].find(node => node.getBoundingClientRect().left >= element.getBoundingClientRect().left)
    const button = slot.querySelector('.watch-later-btn')
    button.focus({ preventScroll: true })
    await new Promise(resolve => setTimeout(resolve, 300))
    const id = slot.querySelector('.video-card').dataset.videoId
    const expectedLeft = Math.max(0, element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft) - slot.getBoundingClientRect().left)
    button.click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const card = element.querySelector(`.video-card[data-video-id="${id}"]`)
    return { id, expectedLeft, left: element.scrollLeft, focused: card?.contains(document.activeElement), first: element.querySelector('.video-card')?.dataset.videoId }
  })
  expect(result.first).toBe(result.id)
  expect(Math.abs(result.left - result.expectedLeft)).toBeLessThan(2)
  expect(result.focused).toBe(true)
  await page.keyboard.press('Escape')
  await track.evaluate(element => element.scrollTo({ left: 8000, behavior: 'instant' }))
  await settle(page)
  const removed = await track.evaluate(async element => {
    const slot = [...element.querySelectorAll('.channel-shelf-slot')].find(node => node.getBoundingClientRect().left >= element.getBoundingClientRect().left)
    slot.querySelector('.more-btn').focus({ preventScroll: true })
    await new Promise(resolve => setTimeout(resolve, 300))
    const id = slot.querySelector('.video-card').dataset.videoId
    const neighbor = slot.nextElementSibling.querySelector('.video-card').dataset.videoId
    const left = slot.getBoundingClientRect().left
    window.removeVideoFromFeed(id)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const next = element.querySelector(`.video-card[data-video-id="${neighbor}"]`)
    return { delta: next?.closest('.channel-shelf-slot').getBoundingClientRect().left - left, focused: next?.contains(document.activeElement) }
  })
  expect(Math.abs(removed.delta)).toBeLessThan(2)
  expect(removed.focused).toBe(true)
})

test('expanded collection keeps mounted cards through unrelated updates', async ({ page }) => {
  await seedLibrary(page)
  await page.locator('#removedSectionToggle').click()
  await page.locator('#removedGrid').evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY + 3000, behavior: 'instant' }))
  await settle(page)
  const retained = await page.locator('#removedGrid').evaluate(async grid => {
    const cards = [...grid.querySelectorAll('.video-card')]
    window.toggleVideoFavorite('large-0')
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return cards.length > 0 && cards.every(card => card.isConnected)
  })
  expect(retained).toBe(true)
})

test('failed favorite persistence leaves the card and focus ready for retry', async ({ page }) => {
  await seedLibrary(page)
  const track = page.locator('.channel-shelf').nth(8).locator('.channel-shelf-track')
  await track.scrollIntoViewIfNeeded()
  await track.evaluate(element => element.scrollTo({ left: 8000, behavior: 'instant' }))
  await settle(page)
  const result = await track.evaluate(async element => {
    const slot = [...element.querySelectorAll('.channel-shelf-slot')].find(node => node.getBoundingClientRect().left >= element.getBoundingClientRect().left)
    const button = slot.querySelector('.favorite-btn')
    button.focus({ preventScroll: true })
    await new Promise(resolve => setTimeout(resolve, 300))
    const id = slot.querySelector('.video-card').dataset.videoId
    const left = element.scrollLeft
    const setItem = profileBrowserStorage.setItem
    profileBrowserStorage.setItem = function(key, value) {
      if (key === 'edenia_v1') throw new DOMException('Full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
    button.click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const failed = element.querySelector(`.video-card[data-video-id="${id}"] .favorite-btn`).getAttribute('aria-pressed')
    profileBrowserStorage.setItem = setItem
    element.querySelector(`.video-card[data-video-id="${id}"] .favorite-btn`).click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const retried = element.querySelector(`.video-card[data-video-id="${id}"]`)
    return { failed, retried: retried.querySelector('.favorite-btn').getAttribute('aria-pressed'), delta: element.scrollLeft - left, focused: retried.contains(document.activeElement) }
  })
  expect(result.failed).toBe('false')
  expect(result.retried).toBe('true')
  expect(Math.abs(result.delta)).toBeLessThan(2)
  expect(result.focused).toBe(true)
})

test('incoming uploads preserve a deep viewport while applying channel and publication ordering', async ({ page }) => {
  await seedLibrary(page)
  const track = page.locator('.channel-shelf').nth(8).locator('.channel-shelf-track')
  await track.scrollIntoViewIfNeeded()
  await track.evaluate(element => { element.style.scrollSnapType = 'none'; element.scrollTo({ left: 8000, behavior: 'instant' }) })
  await settle(page)
  const result = await track.evaluate(async element => {
    const slot = [...element.querySelectorAll('.channel-shelf-slot')].find(node => node.getBoundingClientRect().left >= element.getBoundingClientRect().left)
    const id = slot.querySelector('.video-card').dataset.videoId
    element.focus({ preventScroll: true })
    const rect = slot.getBoundingClientRect()
    const state = window.loadState()
    const channelId = state.videos[id].channelId
    state.videos['new-upload'] = { ...state.videos[id], id: 'new-upload', publishedAt: '2026-09-27T12:00:00Z' }
    window.saveState(state)
    window.renderAll(state)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const next = document.querySelector(`.video-card[data-video-id="${id}"]`)?.closest('.channel-shelf-slot').getBoundingClientRect()
    return { x: next?.left - rect.left, y: next?.top - rect.top, retained: element.isConnected, channelId, firstChannel: document.querySelector('.channel-shelf').dataset.channelKey }
  })
  expect(result.retained).toBe(true)
  expect(result.firstChannel).toBe(result.channelId)
  expect(Math.abs(result.x)).toBeLessThan(2)
  expect(Math.abs(result.y)).toBeLessThan(2)
})

test('watched, undo and redo retain the neighbor in both formats through failed writes', async ({ page }) => {
  await seedLibrary(page)
  const shelf = page.locator('.channel-shelf').nth(8)
  await shelf.scrollIntoViewIfNeeded()
  for (const format of ['videos', 'shorts']) {
    await shelf.locator(`[data-channel-video-format="${format}"][data-channel-video-format-action="select"]`).click()
    const track = shelf.locator('.channel-shelf-track')
    await track.evaluate(element => { element.style.scrollSnapType = 'none'; element.scrollTo({ left: Math.min(8000, (element.scrollWidth - element.clientWidth) / 2), behavior: 'instant' }) })
    await settle(page)
    const result = await track.evaluate(async element => {
      const slot = [...element.querySelectorAll('.channel-shelf-slot')].find(node => node.getBoundingClientRect().left >= element.getBoundingClientRect().left)
      const id = slot.querySelector('.video-card').dataset.videoId
      const neighbor = slot.nextElementSibling.querySelector('.video-card').dataset.videoId
      const state = window.loadState()
      state.videos[id].watchedConfirmationUnlockedAt = new Date().toISOString()
      await window.saveState(state)
      slot.querySelector('.favorite-btn').focus({ preventScroll: true })
      await new Promise(resolve => setTimeout(resolve, 300))
      const left = slot.getBoundingClientRect().left
      const setItem = profileBrowserStorage.setItem
      const fail = () => { profileBrowserStorage.setItem = function(key, value) {
        if (key === 'edenia_v1') throw new DOMException('Full', 'QuotaExceededError')
        return setItem.call(this, key, value)
      } }
      fail()
      const failed = await window.markVideo(id, 'watched')
      profileBrowserStorage.setItem = setItem
      const marked = await window.markVideo(id, 'watched')
      const next = element.querySelector(`.video-card[data-video-id="${neighbor}"]`)
      const delta = next?.closest('.channel-shelf-slot').getBoundingClientRect().left - left
      fail()
      await window.undoLastVideoAction()
      const failedUndoRetained = !element.querySelector(`.video-card[data-video-id="${id}"]`)
      profileBrowserStorage.setItem = setItem
      await window.undoLastVideoAction()
      const undone = Boolean(element.querySelector(`.video-card[data-video-id="${id}"]`))
      await window.redoLastVideoAction()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { failed, marked, delta, failedUndoRetained, undone, redone: !element.querySelector(`.video-card[data-video-id="${id}"]`), focused: element.contains(document.activeElement) }
    })
    expect(result.failed).toBe(false)
    expect(result.marked).toBe(true)
    expect(Math.abs(result.delta)).toBeLessThan(2)
    expect(result.failedUndoRetained).toBe(true)
    expect(result.undone).toBe(true)
    expect(result.redone).toBe(true)
    expect(result.focused).toBe(true)
  }
})
