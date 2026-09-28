import { expect, test } from '../support/network-fixture.mjs'

test.afterEach(async ({ pageDiagnostics }) => {
  for (let i = pageDiagnostics.length - 1; i >= 0; i--) {
    if (/^console: Failed to load resource: the server responded with a status of (403|503) /.test(pageDiagnostics[i])) pageDiagnostics.splice(i, 1)
  }
})

const channelId = 'UC0000000000000000000000'
const now = '2026-09-27T06:55:00.000Z'
const quota = { error: { message: 'Quota exhausted', errors: [{ reason: 'quotaExceeded' }] } }

async function seed(page) {
  await page.clock.setFixedTime(new Date(now))
  await page.route('**/config.local.js', route => route.fulfill({
    contentType: 'application/javascript', body: 'window.EDENIA_CONFIG = { youtubeApiKey: "fixture-key", accountFeaturesRollout: "internal" }'
  }))
  await page.goto('/')
  await page.evaluate(({ channelId, now }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    state.config.ankiEnabled = false
    state.config.channels = [{ id: channelId, name: 'Saved channel', imageUrl: 'https://i.ytimg.com/test.jpg', metadataFetchedAt: now }]
    Object.assign(state.onboarding, { introSeenAt: now, setupCompleted: true, setupCompletedAt: now, walkthroughCompleted: true, walkthroughCompletedAt: now })
    state.channelRefreshes = { [channelId]: { lastFetchedAt: now } }
    state.videos = { fixture0001: {
      id: 'fixture0001', title: 'Saved lesson', channelId, channelTitle: 'Saved channel', duration: 600,
      publishedAt: now, metadataFetchedAt: now, channelMetadataFetchedAt: now, favorite: true,
      status: 'partial', resumeAtSeconds: 42, watchProgress: [{ seconds: 42, watchedAt: now }], watchProgressTracked: true
    } }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, { channelId, now })
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/hidden/)
}

async function add(page, value) {
  await page.evaluate(() => window.toggleManualVideoPopover({ stopPropagation() {} }))
  await page.locator('#manualVideoUrlInput').fill(value)
  await page.evaluate(() => window.addYoutubeInput({ preventDefault() {} }))
}

async function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
}

for (const withQuota of [false, true]) {
  test(`unavailable saved cards recover after a daily retry${withQuota ? ' and quota cooldown' : ''}`, async ({ page }) => {
    await seed(page)
    const before = (await saved(page)).videos.fixture0001
    let requests = 0
    let unavailable = true
    let exhausted = false
    let uploadRequests = 0
    await page.route('**/youtube/v3/playlistItems?**', route => { uploadRequests++; return route.fallback() })
    await page.route('**/youtube/v3/videos?**', route => {
      requests++
      if (exhausted) return route.fulfill({ status: 403, json: quota })
      return route.fulfill({ json: { items: unavailable ? [] : [{ id: 'fixture0001',
        snippet: { title: 'Recovered saved lesson', channelId, channelTitle: 'Saved channel', publishedAt: now,
          thumbnails: { high: { url: 'https://i.ytimg.com/test.jpg' } } },
        contentDetails: { duration: 'PT10M' }, player: { embedWidth: '1280', embedHeight: '720' }
      }] } })
    })
    await page.evaluate(() => {
      const s = window.loadState()
      s.config.channels = [] // Recovery must not depend on new-upload discovery.
      s.videos.fixture0001.metadataFetchedAt = null
      window.saveState(s)
    })
    await page.reload()
    await expect.poll(async () => (await saved(page)).videos.fixture0001.metadataUnavailable).toBe(true)
    expect(requests).toBe(1)
    await page.reload()
    await page.evaluate(() => window.maybeRefreshFeed())
    expect(requests).toBe(1)
    await page.clock.setFixedTime(new Date(Date.parse(now) + 86_400_000 - 1))
    await page.evaluate(() => window.maybeRefreshFeed())
    expect(requests).toBe(1)
    await page.clock.setFixedTime(new Date(Date.parse(now) + 86_400_000))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(async () => (await saved(page)).videos.fixture0001.metadataFetchedAt).toBe('2026-09-28T06:55:00.000Z')
    expect(requests).toBe(2)
    unavailable = false
    exhausted = withQuota
    await page.clock.setFixedTime(new Date(Date.parse(now) + 2 * 86_400_000))
    await page.evaluate(() => window.maybeRefreshFeed())
    if (withQuota) {
      expect(requests).toBe(3)
      expect((await saved(page)).videos.fixture0001.metadataUnavailable).toBe(true)
      await page.reload()
      await page.evaluate(() => window.maybeRefreshFeed())
      expect(requests).toBe(3)
      exhausted = false
      await page.clock.setFixedTime(new Date('2026-09-29T07:00:01Z'))
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    }
    await expect(page.getByRole('button', { name: 'Continue at 00:00:42: Recovered saved lesson', exact: true })).toBeVisible()
    expect((await saved(page)).videos.fixture0001).toMatchObject({
      id: before.id, channelId: before.channelId, favorite: before.favorite, status: before.status,
      resumeAtSeconds: before.resumeAtSeconds, watchProgress: before.watchProgress,
      title: 'Recovered saved lesson', thumbnail: 'https://i.ytimg.com/test.jpg', publishedAt: now,
      duration: 600, metadataUnavailable: false
    })
    await page.clock.setFixedTime(new Date('2026-09-30T07:00:01Z'))
    await page.reload()
    await page.evaluate(() => window.maybeRefreshFeed())
    expect(requests).toBe(withQuota ? 4 : 3)
    expect(uploadRequests).toBe(0)
  })
}

test('refresh quota preserves saved playback and progress, survives reload, and recovers at Pacific midnight', async ({ page }) => {
  await seed(page)
  let requests = 0
  let exhausted = true
  await page.route('**/youtube/v3/**', async route => {
    requests++
    if (exhausted) await route.fulfill({ status: 403, json: quota })
    else await route.fallback()
  })
  const before = (await saved(page)).videos.fixture0001
  await page.evaluate(id => window.refreshFeed({ channelIds: [id] }), channelId)
  expect(requests).toBe(1)
  expect((await saved(page)).videos.fixture0001).toEqual(before)
  expect((await saved(page)).activityLog.some(entry => entry.detail.includes('Pacific'))).toBe(true)
  await expect(page.locator('#toast')).not.toContainText(/quota|exhausted|failed/i)
  await page.evaluate(() => window.openVideoPlayer('fixture0001'))
  await expect(page.locator('iframe[src*="fixture0001"]')).toBeVisible()
  await page.evaluate(() => window.closeVideoShelfPlayer())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#mainApp')).not.toHaveClass(/hidden/)
  await page.evaluate(id => window.refreshFeed({ channelIds: [id] }), channelId)
  expect(requests).toBe(1)
  exhausted = false
  await page.clock.setFixedTime(new Date('2026-09-27T07:00:01Z'))
  await page.evaluate(id => window.refreshFeed({ channelIds: [id] }), channelId)
  expect(requests).toBeGreaterThan(1)
  expect((await saved(page)).videos.fixture0001.favorite).toBe(true)
})

test('failed explicit video and channel additions retain input and create no success records', async ({ page }) => {
  await seed(page)
  let requests = 0
  await page.route('**/youtube/v3/**', route => { requests++; return route.fulfill({ status: 403, json: quota }) })
  const value = 'https://www.youtube.com/watch?v=fixture0002'
  await add(page, value)
  await expect(page.locator('#manualVideoUrlInput')).toHaveValue(value)
  expect((await saved(page)).videos.fixture0002).toBeUndefined()
  await page.evaluate(() => window.addYoutubeInput({ preventDefault() {} }))
  await page.locator('#manualVideoUrlInput').fill('https://www.youtube.com/@newchannel')
  await page.evaluate(() => window.addYoutubeInput({ preventDefault() {} }))
  await expect(page.locator('#manualVideoUrlInput')).toHaveValue('https://www.youtube.com/@newchannel')
  expect(requests).toBe(1)
  expect((await saved(page)).config.channels).toHaveLength(1)
  await expect(page.locator('#toast')).not.toContainText(/quota|exhausted|added/i)
})

test('concurrent callers and a second tab share the gate while search remains usable', async ({ page, context }) => {
  await seed(page)
  let requests = 0
  await context.route('**/youtube/v3/**', route => {
    requests++
    return route.fulfill({ status: 403, json: quota })
  })
  const other = await context.newPage()
  await other.clock.setFixedTime(new Date(now))
  await other.goto('/')
  const call = target => target.evaluate(async () => Promise.allSettled([
    window.fetchVideoMetadata('fixture0002'), window.fetchVideoMetadata('fixture0003')
  ]))
  await Promise.all([call(page), call(other)])
  expect(requests).toBe(1)
  // A separate quota bucket still reaches the provider.
  await page.evaluate(() => window.fetchYoutubeChannelSearchResults('language').catch(() => {}))
  expect(requests).toBe(2)
  await other.close()
})

test('transient failures allow retry and partial channel success remains saved', async ({ page }) => {
  await seed(page)
  let failed = false
  await page.route('**/youtube/v3/playlistItems?**', route => {
    if (!failed) { failed = true; return route.fulfill({ status: 503, json: { error: { message: 'Temporary failure' } } }) }
    return route.fallback()
  })
  await page.evaluate(id => window.refreshFeed({ channelIds: [id] }), channelId)
  await page.evaluate(id => window.refreshFeed({ channelIds: [id] }), channelId)
  expect((await saved(page)).channelRefreshes[channelId].lastError).toBeNull()
  await page.evaluate(({ channelId, now }) => {
    const state = window.loadState()
    state.config.channels.push({ id: 'UC1111111111111111111111', name: 'Second channel', metadataFetchedAt: now, imageUrl: 'https://i.ytimg.com/test.jpg' })
    window.saveState(state)
  }, { channelId, now })
  await page.route('**/youtube/v3/playlistItems?**', route => {
    if (new URL(route.request().url()).searchParams.get('playlistId').includes('1111')) return route.fulfill({ status: 403, json: quota })
    return route.fulfill({ json: { items: [{ snippet: { resourceId: { videoId: 'fixture0002' }, channelId, channelTitle: 'Saved channel', title: 'New lesson', publishedAt: now } }] } })
  })
  await page.route('**/youtube/v3/videos?**', route => route.fulfill({ json: { items: [{ id: 'fixture0002', snippet: { title: 'New lesson', channelId, channelTitle: 'Saved channel', publishedAt: now }, contentDetails: { duration: 'PT10M' }, player: { embedWidth: '1280', embedHeight: '720' } }] } }))
  const result = await page.evaluate(id => window.refreshFeed({ channelIds: [id, 'UC1111111111111111111111'] }), channelId)
  expect(result.successfulChannels).toBe(1)
  expect(result.errors).toHaveLength(1)
  expect(result.mergedCount).toBe(1)
  expect((await saved(page)).videos.fixture0002.title).toBe('New lesson')
  expect((await saved(page)).videos.fixture0001).toMatchObject({ favorite: true, resumeAtSeconds: 42, title: 'Saved lesson' })
})

test('saved cards recover incrementally, explain partial metadata failure, and retry only unfinished work', async ({ page }) => {
  await seed(page)
  const requests = []
  let fail = true
  let firstBatchPersisted = false
  await page.route('**/youtube/v3/videos?**', async route => {
    const ids = new URL(route.request().url()).searchParams.get('id').split(',')
    requests.push(ids)
    if (ids.includes('recover0050') && fail) {
      firstBatchPersisted = (await saved(page)).videos.fixture0001.title === 'Recovered lesson fixture0001'
      return route.fulfill({ status: 503, json: { error: { message: 'Private provider text with fixture-key', errors: [{ reason: 'backendError' }] } } })
    }
    return route.fulfill({ json: { items: ids.map(id => ({ id,
      snippet: { title: `Recovered lesson ${id}`, channelId, channelTitle: 'Saved channel', publishedAt: now, thumbnails: { high: { url: 'https://i.ytimg.com/test.jpg' } } },
      contentDetails: { duration: 'PT10M' }, player: { embedWidth: '1280', embedHeight: '720' }
    })) } })
  })
  await page.evaluate(({ now, channelId }) => {
    const s = window.loadState()
    const original = s.videos.fixture0001
    s.videos = Object.fromEntries(Array.from({ length: 51 }, (_, i) => {
      const id = i === 0 ? 'fixture0001' : `recover${String(i).padStart(4, '0')}`
      return [id, { ...original, id, title: '', thumbnail: '', metadataFetchedAt: null }]
    }))
    window.saveState(s)
  }, { now, channelId })
  await page.reload()
  await expect.poll(async () => (await saved(page)).activityLog.find(e => e.type === 'youtube-metadata')?.status).toBe('warn')
  expect(firstBatchPersisted).toBe(true)
  await expect(page.getByRole('button', { name: 'Continue at 00:00:42: Recovered lesson fixture0001', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.evaluate(() => window.setSettingsActivityLogOpen(true))
  await expect(page.locator('#activityLogList')).toContainText('Saved video metadata partially recovered')
  await expect(page.locator('#activityLogList')).toContainText('YouTube service error')
  const partial = await saved(page)
  expect(JSON.stringify(partial.activityLog)).not.toContain('fixture-key')
  expect(partial.videos.fixture0001).toMatchObject({ favorite: true, status: 'partial', resumeAtSeconds: 42, duration: 600 })
  await page.reload()
  expect(requests).toHaveLength(2)
  fail = false
  await page.clock.setFixedTime(new Date(Date.parse(now) + 30 * 60_000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(async () => (await saved(page)).videos.recover0050.title).toBe('Recovered lesson recover0050')
  expect(requests).toHaveLength(3)
  expect(requests[2]).toEqual(['recover0050'])
  expect((await saved(page)).activityLog.find(e => e.type === 'youtube-metadata').status).toBe('success')
})
