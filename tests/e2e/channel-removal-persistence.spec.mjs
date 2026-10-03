import { expect, test } from '../support/network-fixture.mjs'

const channelId = 'UC0000000000000000000000'
const partialId = 'fixture0000'

async function seedChannel(page, count = 12) {
  await page.route('**/config.local.js*', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }',
    contentType: 'application/javascript'
  }))
  await page.goto('/')
  await page.evaluate(({ channelId, count }) => {
    const timestamp = new Date().toISOString()
    const state = window.defaultState(4, [], 'light', [], 'en')
    state.config.ankiEnabled = false
    state.config.channels = [{ id: channelId, name: 'Removal fixture', metadataFetchedAt: timestamp }]
    Object.assign(state.onboarding, {
      introSeenAt: timestamp, setupCompleted: true, setupCompletedAt: timestamp,
      walkthroughCompleted: true, walkthroughCompletedAt: timestamp,
      levelUpGuidanceShownAt: timestamp
    })
    state.videos = Object.fromEntries(Array.from({ length: count }, (_, index) => {
      const id = `fixture${String(index).padStart(4, '0')}`
      return [id, {
        id, title: `Video ${index} ${'metadata '.repeat(180)}`,
        channelId, channelTitle: 'Removal fixture', duration: 600, aspectRatio: 16 / 9,
        metadataFetchedAt: timestamp, publishedAt: timestamp,
        status: index === 0 ? 'partial' : 'unwatched',
        resumeAtSeconds: index === 0 ? 30 : null,
        watchProgress: index === 0 ? [{ seconds: 30, watchedAt: timestamp, studyDay: '2026-10-03' }] : [],
        watchProgressTracked: index === 0
      }]
    }))
    // A watched study fact and an Anki observation remain durable even when
    // their channel is removed; they must survive Undo and quota failures.
    Object.assign(state.videos.fixture0002, {
      status: 'watched', watchedAt: timestamp,
      watchProgress: [{ seconds: 600, watchedAt: timestamp, studyDay: '2026-10-03' }], watchProgressTracked: true
    })
    state.anki['2026-10-01'] = { reviewed: 10, created: 2, loggedAt: timestamp }
    window.saveState(state, { backup: false })
  }, { channelId, count })
  await page.reload()
  await expect(page.locator('.channel-shelf-remove').first()).toBeVisible()
}

async function limitPrimaryWrites(page, { rejectAll = false, growth = 1.25 } = {}) {
  return page.evaluate(({ rejectAll, growth }) => {
    const original = Storage.prototype.setItem
    const raw = localStorage.getItem('edenia_v1')
    const limit = Math.ceil(raw.length * growth)
    window.removalWriteSizes = []
    window.restoreRemovalWrites = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function (key, value) {
      if (key === 'edenia_v1') {
        window.removalWriteSizes.push(value.length)
        if (rejectAll || value.length > limit) {
          throw new DOMException('Fixture quota exhausted', 'QuotaExceededError')
        }
      }
      return original.call(this, key, value)
    }
    return raw
  }, { rejectAll, growth })
}

async function removeFromShelf(page) {
  await page.locator('.channel-shelf-remove').first().evaluate(button => button.click())
}

test('a rejected removal keeps the saved feed, progress and Undo unchanged through redraw', async ({ page }) => {
  await seedChannel(page)
  const protection = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const backups = JSON.stringify([{ id: 'protected', createdAt: new Date().toISOString(), reason: 'before import', state }])
    localStorage.setItem('edenia_v1_backups', backups)
    return { backups, cookie: document.cookie }
  })
  const before = await limitPrimaryWrites(page, { rejectAll: true })
  const cardCount = await page.locator('.channel-shelf-track .video-card').count()
  await removeFromShelf(page)
  // This is the production symptom: the failed operation must never render a
  // temporary successful removal before a subsequent load restores the row.
  await expect(page.locator('.channel-shelf-track .video-card')).toHaveCount(cardCount)
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups'))).toBe(protection.backups)
  expect(await page.evaluate(() => document.cookie)).toBe(protection.cookie)
  await page.evaluate(() => window.renderAll(window.loadState()))
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await expect(page.locator('.channel-shelf-track .video-card')).toHaveCount(cardCount)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('edenia_v1')).videos[id].resumeAtSeconds, partialId)).toBe(30)
})

test('large-channel removal fits without full-library Undo copies and survives Undo, Redo and reload', async ({ page }) => {
  await seedChannel(page, 200)
  const before = JSON.parse(await limitPrimaryWrites(page))
  await removeFromShelf(page)
  const removed = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(removed.config.channels).toEqual([])
  expect(removed.config.removedChannelIds).toContain(channelId)
  expect(Object.keys(removed.videos)).toHaveLength(200)
  expect(removed.videos[partialId].resumeAtSeconds).toBe(30)
  expect(removed.videos[partialId].watchProgress).toEqual(before.videos[partialId].watchProgress)
  expect(removed.videos.fixture0002).toEqual(expect.objectContaining(before.videos.fixture0002))
  expect(removed.anki).toEqual(before.anki)
  expect(removed.videos.fixture0001.hiddenFromGrid).toBe(true)
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
  await page.evaluate(() => { window.restoreRemovalWrites(); window.undoLastVideoAction() })
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(undone.config.removedChannelIds).not.toContain(channelId)
  expect(undone.videos.fixture0001.hiddenFromGrid).not.toBe(true)
  await page.evaluate(() => window.redoLastVideoAction())
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
  const redone = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(redone.config.removedChannelIds).toContain(channelId)
  expect(Object.keys(redone.videos)).toHaveLength(200)
  expect(redone.videos[partialId].watchProgress).toEqual(before.videos[partialId].watchProgress)
  expect(redone.videos.fixture0002.watchedAt).toBe(before.videos.fixture0002.watchedAt)
  expect(redone.anki).toEqual(before.anki)
})

test('quota pressure discards only search results and retries the requested removal without a popup', async ({ page }) => {
  await seedChannel(page, 200)
  const protectedValues = await page.evaluate(() => {
    const cacheKey = 'edenia_v1_youtube_channel_search_cache_v1'
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const protectedValues = {
      edenia_v1_backups: JSON.stringify([{ id: 'recovery', createdAt: new Date().toISOString(), reason: 'before import', state }]),
      edenia_v1_youtube_channel_search_usage_v1: JSON.stringify({ date: '2026-10-03', count: 8 }),
      edenia_unknown_future_key: 'Keep this unrelated value'
    }
    for (const [key, value] of Object.entries(protectedValues)) localStorage.setItem(key, value)
    localStorage.setItem(cacheKey, JSON.stringify({ query: { savedAt: Date.now(), results: [{ id: state.config.channels[0].id, name: 'cached result '.repeat(8000) }] } }))
    const size = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .reduce((total, key) => total + key.length + localStorage.getItem(key).length, 0)
    const limit = size()
    const original = Storage.prototype.setItem
    window.removalQuotaFailures = 0
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'edenia_v1') {
        const nextSize = size() - (localStorage.getItem(key)?.length || 0) + value.length
        if (nextSize > limit) {
          window.removalQuotaFailures++
          throw new DOMException('Fixture quota exhausted', 'QuotaExceededError')
        }
      }
      return original.call(this, key, value)
    }
    return protectedValues
  })
  await removeFromShelf(page)
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
  const result = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('edenia_v1')),
    cache: localStorage.getItem('edenia_v1_youtube_channel_search_cache_v1'),
    failures: window.removalQuotaFailures
  }))
  expect(result.failures).toBe(1)
  expect(result.cache).toBeNull()
  expect(result.state.config.channels).toEqual([])
  expect(result.state.config.removedChannelIds).toContain(channelId)
  expect(Object.keys(result.state.videos)).toHaveLength(200)
  expect(result.state.videos[partialId].resumeAtSeconds).toBe(30)
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/)
  for (const [key, value] of Object.entries(protectedValues)) {
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value)
  }
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
})

test('a failed removal does not spend backups on pending automatic profile cleanup', async ({ page }) => {
  await seedChannel(page)
  const protectedBackup = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    // This version requires normalization on the next read. The removal must
    // defer cleanup writes until its own persistence decision succeeds.
    state.defaultChannelsVersion = -1
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    const backup = JSON.stringify([{ id: 'last-backup', createdAt: new Date().toISOString(), reason: 'before import', state }])
    localStorage.setItem('edenia_v1_backups', backup)
    return backup
  })
  const before = await limitPrimaryWrites(page, { rejectAll: true })
  await removeFromShelf(page)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups'))).toBe(protectedBackup)
  expect(await page.evaluate(() => window.removalWriteSizes.length)).toBe(1)
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
})

test('failed channel Undo and Redo keep the feed and saved history at the last successful operation', async ({ page }) => {
  await seedChannel(page)
  await removeFromShelf(page)
  const removed = await limitPrimaryWrites(page, { rejectAll: true })
  await page.evaluate(() => window.undoLastVideoAction())
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(removed)
  await page.evaluate(() => { window.restoreRemovalWrites(); window.undoLastVideoAction() })
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  const undone = await limitPrimaryWrites(page, { rejectAll: true })
  await page.evaluate(() => window.redoLastVideoAction())
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(undone)
  await page.evaluate(() => window.renderAll(window.loadState()))
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
})

test('failed channel Undo and Redo preserve the last backup when profile cleanup is pending', async ({ page }) => {
  await seedChannel(page)
  await removeFromShelf(page)
  for (const direction of ['undo', 'redo']) {
    const backup = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      state.defaultChannelsVersion = -1
      localStorage.setItem('edenia_v1', JSON.stringify(state))
      const backup = JSON.stringify([{ id: 'last-backup', createdAt: new Date().toISOString(), reason: 'before import', state }])
      localStorage.setItem('edenia_v1_backups', backup)
      return backup
    })
    const before = await limitPrimaryWrites(page, { rejectAll: true })
    await page.evaluate(direction => {
      if (direction === 'undo') window.undoLastVideoAction()
      else window.redoLastVideoAction()
    }, direction)
    expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(before)
    expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups'))).toBe(backup)
    expect(await page.evaluate(() => window.removalWriteSizes.length)).toBe(1)
    await page.evaluate(direction => {
      window.restoreRemovalWrites()
      if (direction === 'undo') window.undoLastVideoAction()
    }, direction)
  }
})

test('channel Undo preserves later study progress, refreshed metadata and other removal markers', async ({ page }) => {
  await seedChannel(page)
  await removeFromShelf(page)
  const laterProgress = await page.evaluate(id => {
    const state = window.loadState()
    Object.assign(state.videos[id], {
      resumeAtSeconds: 90,
      watchProgress: [{ seconds: 90, watchedAt: '2026-10-03T00:00:00.000Z', studyDay: '2026-10-03' }],
      title: 'Refreshed title', favorite: true
    })
    state.config.removedChannelIds.push('other-channel')
    window.saveState(state, { backup: false })
    const progress = structuredClone(state.videos[id].watchProgress)
    window.undoLastVideoAction()
    return progress
  }, partialId)
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(undone.videos[partialId].resumeAtSeconds).toBe(90)
  expect(laterProgress).toEqual([expect.objectContaining({ seconds: 90, watchedAt: '2026-10-03T00:00:00.000Z' })])
  expect(undone.videos[partialId].watchProgress).toEqual(laterProgress)
  expect(undone.videos[partialId].favorite).toBe(true)
  expect(undone.videos[partialId].title).toBe('Refreshed title')
  expect(undone.config.removedChannelIds).toContain('other-channel')
  expect(undone.config.removedChannelIds).not.toContain(channelId)
  await page.evaluate(() => window.redoLastVideoAction())
  await page.reload()
  const redone = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(redone.videos[partialId].resumeAtSeconds).toBe(90)
  expect(redone.videos[partialId].watchProgress).toEqual(undone.videos[partialId].watchProgress)
  expect(redone.config.removedChannelIds).toEqual(expect.arrayContaining([channelId, 'other-channel']))
})

test('failed removal restores a retained active profile in place, as well as leaving disk unchanged', async ({ page }) => {
  await seedChannel(page)
  const before = await limitPrimaryWrites(page, { rejectAll: true })
  const result = await page.evaluate(() => {
    const read = window.loadState
    const active = read()
    const original = structuredClone(active)
    // Retained-profile callers must also be rolled back; rereading disk alone
    // would hide the bug in that mode. Persistence still uses the real store.
    window.loadState = () => active
    document.querySelector('.channel-shelf-remove').click()
    const result = { original, active: structuredClone(active), raw: localStorage.getItem('edenia_v1') }
    window.renderAll(active)
    window.loadState = read
    return result
  })
  expect(result.active).toEqual(result.original)
  expect(result.raw).toBe(before)
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
})

test('legacy full-video channel Undo records compact at the real removal boundary under quota pressure', async ({ page }) => {
  await seedChannel(page, 200)
  const facts = await page.evaluate(channelId => {
    const state = window.loadState()
    const videos = structuredClone(state.videos)
    // An earlier removal followed by re-adding the channel can leave this
    // legacy Undo record alongside the entire retained library.
    state.undoStack = [{
      id: 'legacy-removal', type: 'channel-remove', channelId,
      channelName: 'Removal fixture', createdAt: new Date().toISOString(),
      before: { channel: state.config.channels[0], removedChannelIds: [], removedDefaultChannelIds: [], videos },
      after: { channel: null, removedChannelIds: [channelId], removedDefaultChannelIds: [], videos: structuredClone(videos) }
    }]
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    return { videos, anki: state.anki }
  }, channelId)
  const bloated = await limitPrimaryWrites(page, { growth: 0.6 })
  await removeFromShelf(page)
  const raw = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  expect(raw.length).toBeLessThan(bloated.length * 0.6)
  const removed = JSON.parse(raw)
  expect(removed.config.channels).toEqual([])
  expect(removed.undoStack).toHaveLength(2)
  expect(removed.undoStack[0].id).toBe('legacy-removal')
  expect(removed.undoStack[0].before.videos).toBeUndefined()
  expect(removed.undoStack[0].before.videoVisibility).toBeDefined()
  expect(removed.videos[partialId].watchProgress).toEqual(facts.videos[partialId].watchProgress)
  expect(removed.anki).toEqual(facts.anki)
  await page.evaluate(() => { window.restoreRemovalWrites(); window.undoLastVideoAction(); window.undoLastVideoAction() })
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(restored.videos[partialId].watchProgress).toEqual(facts.videos[partialId].watchProgress)
  expect(restored.videos.fixture0002.watchedAt).toBe(facts.videos.fixture0002.watchedAt)
  expect(restored.anki).toEqual(facts.anki)
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
})
