import { expect, test } from '../support/network-fixture.mjs'
test.afterEach(async ({ pageDiagnostics }) => {
  for (let i = pageDiagnostics.length - 1; i >= 0; i--) {
    if (/^console: Failed to load resource: the server responded with a status of (403|503) /.test(pageDiagnostics[i])) pageDiagnostics.splice(i, 1)
  }
})

const channelId = 'UC0000000000000000000000'
const ids = Array.from({ length: 260 }, (_, i) => `old${String(i).padStart(8, '0')}`)
const timestamp = new Date().toISOString()

async function setup(page, { shorts = false } = {}) {
  const requests = [], details = []
  let uploads = ids
  await page.route('**/config.local.js*', route => route.fulfill({ body: `window.EDENIA_CONFIG = { youtubeApiKey: 'fixture-key' }`, contentType: 'application/javascript' }))
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?*', route => {
    const token = new URL(route.request().url()).searchParams.get('pageToken') || ''
    requests.push(token)
    const offset = Number(token)
    return route.fulfill({ json: {
      items: uploads.slice(offset, offset + 50).map(id => ({ snippet: { resourceId: { videoId: id }, title: id, channelTitle: 'History channel', publishedAt: new Date(Date.parse(timestamp) - ids.indexOf(id) * 60000).toISOString(), thumbnails: {} } })),
      nextPageToken: offset + 50 < uploads.length ? String(offset + 50) : null
    } })
  })
  await page.route('https://www.googleapis.com/youtube/v3/videos?*', route => {
    const requested = new URL(route.request().url()).searchParams.get('id').split(',')
    details.push(...requested)
    return route.fulfill({ json: { items: requested.map(id => ({ id, contentDetails: { duration: shorts ? 'PT1M' : 'PT10M' }, player: { embedWidth: shorts ? '1080' : '1920', embedHeight: shorts ? '1920' : '1080' } })) } })
  })
  await page.goto('/')
  await page.evaluate(({ channelId, ids, timestamp }) => {
    const s = window.defaultState(4, [], 'light', [], 'en')
    s.config.ankiEnabled = false
    s.config.channels = [{ id: channelId, name: 'History channel', imageUrl: '/images/brands/youtube.svg', metadataFetchedAt: timestamp }]
    Object.assign(s.onboarding, { introSeenAt: timestamp, setupCompleted: true, setupCompletedAt: timestamp, walkthroughCompleted: true, walkthroughCompletedAt: timestamp, levelUpGuidanceShownAt: timestamp })
    s.channelRefreshes = { [channelId]: { lastFetchedAt: timestamp, coverage: { headIds: ids.slice(0, 50), history: { pageToken: '', anchorIds: ids.slice(0, 50), nextPageToken: '50' } } } }
    s.videos = Object.fromEntries(ids.slice(0, 50).map((id, i) => [id, { id, title: id, channelId, channelTitle: 'History channel', duration: 600, aspectRatio: 16 / 9, metadataFetchedAt: timestamp, publishedAt: new Date(Date.parse(timestamp) - i * 60000).toISOString(), status: 'unwatched' }]))
    localStorage.setItem('edenia_v1', JSON.stringify(s))
  }, { channelId, ids, timestamp })
  await page.reload()
  await expect(page.locator('.channel-shelf').first()).toBeVisible()
  return { requests, details, setUploads: next => { uploads = next } }
}
async function reachEnd(page) {
  const track = page.locator('.channel-shelf-track').first()
  await track.scrollIntoViewIfNeeded()
  await track.evaluate(track => track.scrollTo({ left: track.scrollWidth, behavior: 'instant' }))
}

test('browsing saved cards crosses into older uploads without moving the shelf or mounting the library', async ({ page }) => {
  const { requests, details } = await setup(page)
  expect(requests).toEqual([])
  await reachEnd(page)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  expect(requests).toEqual(['', '50', '100'])
  expect(details).toEqual(ids.slice(50, 150))
  await expect(page.locator(`.video-card[data-video-id="${ids[49]}"]`)).toBeVisible()
  expect(await page.locator('.video-card').count()).toBeLessThan(25)
  await page.reload()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  await reachEnd(page)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('250 videos')
  expect(requests.slice(3)).toEqual(['100', '150', '200'])
  await reachEnd(page)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('260 videos')
  await expect(page.locator('[data-upload-history-status]')).toHaveText('All available uploads loaded.')
})

test('a nonmatching format batch pauses until explicit continuation and keeps both formats', async ({ page }, testInfo) => {
  const { requests } = await setup(page, { shorts: true })
  await reachEnd(page)
  await expect(page.locator('[data-upload-history-status]')).toContainText('No more matching uploads in this batch.')
  expect(requests).toHaveLength(3)
  if (['desktop-standard', 'phone-standard'].includes(testInfo.project.name)) {
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme
        document.body.dataset.theme = theme
      }, theme)
      await page.locator('.channel-shelf').screenshot({ path: testInfo.outputPath(`history-${theme}.png`) })
    }
  }
  await reachEnd(page)
  expect(requests).toHaveLength(3)
  await page.getByRole('button', { name: 'Continue browsing' }).click()
  await expect.poll(() => requests.length).toBe(6)
  await expect(page.locator('[data-upload-history-status]')).toContainText('No more matching uploads in this batch.')
  await page.locator('[data-channel-video-format-action="select"][data-channel-video-format="shorts"]').click()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('200 videos')
})

test('learner organization views never request unknown uploads', async ({ page }) => {
  const { requests } = await setup(page)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    Object.values(s.videos).forEach(v => { v.favorite = true; v.watchLater = true; v.status = 'partial' })
    localStorage.setItem('edenia_v1', JSON.stringify(s))
  })
  await page.reload()
  for (const filter of ['partial', 'watch-later', 'favorite']) {
    // The status controls are hidden on phone; exercise the same bound action.
    await page.locator(`[data-status-tab="${filter}"]`).evaluate(button => button.click())
    await reachEnd(page)
    expect(requests).toEqual([])
  }
})

for (const quota of [false, true]) {
  test(`${quota ? 'daily quota' : 'temporary failure'} preserves cards, bounds retries and survives reload`, async ({ page }) => {
    const { requests } = await setup(page)
    let failures = 0
    await page.route('https://www.googleapis.com/youtube/v3/playlistItems?*', route => {
      failures++
      return route.fulfill({ status: quota ? 403 : 503, json: { error: { message: 'Unavailable', errors: [{ reason: quota ? 'quotaExceeded' : 'backendError' }] } } })
    })
    await reachEnd(page)
    await expect(page.locator('[data-upload-history-status]')).toContainText('Older uploads could not be loaded.')
    await expect(page.getByRole('button', { name: 'Continue browsing' })).toBeDisabled()
    expect(failures).toBe(1)
    await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('50 videos')
    await page.reload()
    await reachEnd(page)
    await expect(page.getByRole('button', { name: 'Continue browsing' })).toBeDisabled()
    expect(failures).toBe(1)
    expect(requests).toEqual([])
  })
}

test('temporary failure can be retried after its cooldown', async ({ page }) => {
  await page.clock.install()
  const { requests } = await setup(page)
  let fail = true
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?*', route => fail
    ? route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } })
    : route.fallback())
  await reachEnd(page)
  await expect(page.getByRole('button', { name: 'Continue browsing' })).toBeDisabled()
  fail = false
  await page.clock.fastForward(31_000)
  await page.getByRole('button', { name: 'Continue browsing' }).click()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  expect(requests).toEqual(['', '50', '100'])
})

test('leaving the active profile during retrieval discards the result', async ({ page }) => {
  await setup(page)
  let release
  const pending = new Promise(resolve => { release = resolve })
  let started = false
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?*', async route => {
    started = true
    await pending
    return route.fallback()
  })
  await reachEnd(page)
  await expect.poll(() => started).toBe(true)
  await page.evaluate(() => window.resetApp())
  release()
  await expect(page.locator('#mainApp')).toHaveClass(/hidden/)
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1'))?.videos || {}).length)).toBe(0)
})

test('hourly new uploads and history retrieval preserve each other and learner organization', async ({ page }) => {
  const { setUploads } = await setup(page)
  await page.evaluate(({ channelId, timestamp, id }) => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    s.channelRefreshes[channelId].lastFetchedAt = new Date(Date.now() - 2 * 3600_000).toISOString()
    Object.assign(s.videos[id], { favorite: true, watchLater: true, status: 'partial', resumeAtSeconds: 20, pausedAt: timestamp, watchProgress: [{ watchedAt: timestamp, seconds: 20 }], watchProgressTracked: true })
    localStorage.setItem('edenia_v1', JSON.stringify(s))
  }, { channelId, timestamp, id: ids[49] })
  setUploads(['new00000000', ...ids])
  let release
  const pending = new Promise(resolve => { release = resolve })
  let started = false
  await page.route('https://www.googleapis.com/youtube/v3/videos?*', async route => {
    if (new URL(route.request().url()).searchParams.get('id') === 'new00000000') {
      started = true
      await pending
    }
    return route.fallback()
  })
  await page.evaluate(() => { window.historyRefreshTest = window.refreshFeed({ silent: true }) })
  await expect.poll(() => started).toBe(true)
  await reachEnd(page)
  await expect(page.locator('[data-upload-history-status]')).toContainText('Loading older uploads…')
  // The shared provider gate waits for the in-flight refresh metadata request.
  release()
  await page.evaluate(() => window.historyRefreshTest)
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1')).videos).length)).toBeGreaterThan(100)
  const retained = await page.evaluate(({ id, channelId }) => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    return { video: s.videos[id], fresh: s.videos.new00000000, history: s.channelRefreshes[channelId].coverage.history }
  }, { id: ids[49], channelId })
  expect(retained.video).toMatchObject({ favorite: true, watchLater: true, status: 'partial', resumeAtSeconds: 20, watchProgressTracked: true })
  expect(retained.video.watchProgress).toHaveLength(1)
  expect(retained.fresh).toBeTruthy()
  expect(retained.history.pageToken).not.toBe('')
})

test('two tabs do not perform the same in-flight history attempt', async ({ page, context }) => {
  const first = await setup(page)
  const other = await context.newPage()
  const second = await setup(other)
  let release
  const pending = new Promise(resolve => { release = resolve })
  let started = false
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?*', async route => {
    started = true
    await pending
    return route.fallback()
  })
  await reachEnd(page)
  await expect.poll(() => started).toBe(true)
  await reachEnd(other)
  expect(second.requests).toEqual([])
  release()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  expect(first.requests).toHaveLength(3)
  await other.reload()
  await expect(other.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  await other.close()
})

test('an hourly check finishing after history retrieval cannot overwrite the saved older batch', async ({ page }) => {
  const { setUploads } = await setup(page)
  let release
  const pending = new Promise(resolve => { release = resolve })
  let started = false
  await page.route('https://www.googleapis.com/youtube/v3/videos?*', async route => {
    if (new URL(route.request().url()).searchParams.get('id').split(',').includes(ids[50])) {
      started = true
      await pending
    }
    return route.fallback()
  })
  await reachEnd(page)
  await expect.poll(() => started).toBe(true)
  setUploads(['new00000000', ...ids])
  await page.evaluate(channelId => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    s.channelRefreshes[channelId].lastFetchedAt = new Date(Date.now() - 2 * 3600_000).toISOString()
    localStorage.setItem('edenia_v1', JSON.stringify(s))
    window.historyRefreshTest = window.refreshFeed({ silent: true })
  }, channelId)
  release()
  await page.evaluate(() => window.historyRefreshTest)
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('edenia_v1')).videos).length)).toBe(151)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('151 videos')
})

test('trackpad scrolling and keyboard focus can cross the saved boundary', async ({ page }) => {
  await setup(page)
  const track = page.locator('.channel-shelf-track')
  await track.scrollIntoViewIfNeeded()
  await track.hover()
  await page.mouse.wheel(30000, 0)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  const lastSaved = page.locator(`.video-card[data-video-id="${ids[49]}"]`)
  await lastSaved.locator('.more-btn').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator(`.video-card[data-video-id="${ids[50]}"]`)).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement.closest('.video-card')?.dataset.videoId)).toBe(ids[50])
})

test('duplicate playlist entries reuse metadata and keep a complete navigable saved library', async ({ page }) => {
  const { setUploads, details, requests } = await setup(page)
  setUploads([...ids.slice(0, 50), ...ids.slice(0, 50), ...ids.slice(50)])
  await reachEnd(page)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('100 videos')
  expect(details).toEqual(ids.slice(50, 100))
  expect(requests).toHaveLength(3)
  await reachEnd(page)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('200 videos')
  await page.reload()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('200 videos')
})

test('a channel whose saved videos are all watched still has a history browsing boundary', async ({ page }, testInfo) => {
  const { requests } = await setup(page)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    Object.values(s.videos).forEach(video => { video.status = 'watched'; video.watchedAt = new Date().toISOString() })
    localStorage.setItem('edenia_v1', JSON.stringify(s))
  })
  await page.reload()
  await expect(page.locator('.channel-shelf-track')).toBeVisible()
  expect(requests).toEqual([])
  if (testInfo.project.use.hasTouch) await page.locator('.channel-shelf-track').tap()
  else await page.locator('.channel-shelf [data-shelf-direction="1"]').click()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('100 videos')
  await expect(page.locator('#watchedCount')).toHaveText('50')
})

test('history browsing from a legacy library does not turn hourly checks back into history downloads', async ({ page }) => {
  const { requests } = await setup(page)
  await page.evaluate(channelId => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    delete s.channelRefreshes[channelId].coverage
    localStorage.setItem('edenia_v1', JSON.stringify(s))
  }, channelId)
  await page.reload()
  await reachEnd(page)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  await page.evaluate(channelId => {
    const s = JSON.parse(localStorage.getItem('edenia_v1'))
    s.channelRefreshes[channelId].lastFetchedAt = new Date(Date.now() - 2 * 3600_000).toISOString()
    localStorage.setItem('edenia_v1', JSON.stringify(s))
    return window.refreshFeed({ silent: true })
  }, channelId)
  expect(requests).toHaveLength(4)
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
})

test('organizing a saved card while metadata is in flight is retained by the history merge', async ({ page }) => {
  await setup(page)
  let release
  const pending = new Promise(resolve => { release = resolve })
  let started = false
  await page.route('https://www.googleapis.com/youtube/v3/videos?*', async route => {
    started = true
    await pending
    return route.fallback()
  })
  await reachEnd(page)
  await expect.poll(() => started).toBe(true)
  const savedCard = page.locator(`.video-card[data-video-id="${ids[49]}"]`)
  await savedCard.locator('.favorite-btn').evaluate(button => button.click())
  await expect(savedCard.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'true')
  release()
  await expect(page.locator('[data-channel-video-format-count-label]')).toHaveText('150 videos')
  await expect(savedCard.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await page.locator('[data-status-tab="favorite"]').evaluate(button => button.click())
  await expect(page.locator(`.video-card[data-video-id="${ids[49]}"]`)).toBeVisible()
})
