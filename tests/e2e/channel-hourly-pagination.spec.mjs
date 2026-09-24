import { expect, test } from '../support/network-fixture.mjs'

const channelId = 'UC0000000000000000000000'
const now = new Date('2026-09-24T04:00:00.000Z')
const oldIds = Array.from({ length: 180 }, (_, index) => `old${String(index).padStart(8, '0')}`)
const newIds = ['new00000001', 'new00000002', 'new00000003']

test('hourly refresh adds newest uploads then older history up to 50, and continues after reload', async ({ page }) => {
  const listRequests = []
  const detailRequests = []
  await page.clock.install({ time: now })
  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = { youtubeApiKey: 'fixture-key', supabaseUrl: '', supabasePublishableKey: '' }`,
    contentType: 'application/javascript'
  }))
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?*', route => {
    const url = new URL(route.request().url())
    listRequests.push(url.toString())
    const offset = Number(url.searchParams.get('pageToken') || 0)
    const size = Number(url.searchParams.get('maxResults'))
    const allIds = [...newIds, ...oldIds]
    return route.fulfill({ json: {
      items: allIds.slice(offset, offset + size).map(id => ({ snippet: {
        resourceId: { videoId: id }, title: id, channelTitle: 'Hourly channel',
        publishedAt: now.toISOString(), thumbnails: {}
      } })),
      nextPageToken: offset + size < allIds.length ? String(offset + size) : null
    } })
  })
  await page.route('https://www.googleapis.com/youtube/v3/videos?*', route => {
    const ids = new URL(route.request().url()).searchParams.get('id').split(',')
    detailRequests.push(ids)
    return route.fulfill({ json: { items: ids.map(id => ({
      id, contentDetails: { duration: 'PT10M' },
      player: { embedWidth: '1920', embedHeight: '1080' }
    })) } })
  })
  await page.goto('/')
  await page.evaluate(({ channelId, oldIds, timestamp }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    state.config.ankiEnabled = false
    state.config.channels = [{ id: channelId, name: 'Hourly channel', imageUrl: '/images/brands/youtube.svg' }]
    state.onboarding.introSeenAt = timestamp
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = timestamp
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = timestamp
    state.channelRefreshes = { [channelId]: { lastFetchedAt: timestamp, lastError: null, lastFailedAt: null } }
    state.videos = Object.fromEntries(oldIds.slice(0, 50).map(id => [id, {
      id, channelId, channelTitle: 'Hourly channel', title: id,
      duration: 600, aspectRatio: 16 / 9, status: 'unwatched', publishedAt: timestamp
    }]))
    state.videos[oldIds[0]].favorite = true
    state.videos[oldIds[0]].status = 'partial'
    state.videos[oldIds[0]].resumeAtSeconds = 20
    state.videos[oldIds[0]].pausedAt = timestamp
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, { channelId, oldIds, timestamp: now.toISOString() })
  const savedIds = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1')).videos).sort())
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  expect(listRequests).toHaveLength(0)
  await page.clock.fastForward(59 * 60_000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect(listRequests).toHaveLength(0)

  await page.clock.fastForward(60_000)
  await expect.poll(savedIds).toEqual([...newIds, ...oldIds.slice(0, 97)].sort())
  expect(listRequests).toHaveLength(2)
  expect(detailRequests).toEqual([[...newIds, ...oldIds.slice(50, 97)]])

  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  expect(listRequests).toHaveLength(2)
  await page.clock.fastForward(60 * 60_000)
  await expect.poll(savedIds).toEqual([...newIds, ...oldIds.slice(0, 147)].sort())
  expect(detailRequests[1]).toEqual(oldIds.slice(97, 147))
  const retained = await page.evaluate(id => JSON.parse(localStorage.getItem('edenia_v1')).videos[id], oldIds[0])
  expect(retained).toMatchObject({ favorite: true, status: 'partial', resumeAtSeconds: 20 })
})
