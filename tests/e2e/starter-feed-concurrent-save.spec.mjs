import { expect, test } from '../support/network-fixture.mjs'

test('automatic feed refresh retains a simultaneous study save and both activity entries after reload', async ({ page }) => {
  await page.route('**/config.local.js*', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { youtubeApiKey: "fixture-key", indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }',
    contentType: 'application/javascript'
  }))
  await page.goto('/?internal_test=2')
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  const result = await page.evaluate(async () => {
    const channelId = 'UC0000000000000000000000'
    const initial = loadState()
    initial.config.channels = [{ id: channelId, name: 'Storage fixture', metadataFetchedAt: new Date().toISOString() }]
    initial.config.ankiEnabled = false
    initial.anki['2026-10-11'] = { reviewed: 1, created: 0 }
    if (!await saveState(initial, { backup: false })) throw new Error('Fixture baseline failed')
    const append = appendActivityLog
    let learnerSave
    appendActivityLog = (working, entry, ...args) => {
      if (entry.type === 'youtube-refresh' && !learnerSave) {
        const learner = loadState()
        learner.anki['2026-10-11'].reviewed = 7
        append(learner, { actor: 'user', type: 'fixture-study', status: 'success', title: 'Learner progress' })
        learnerSave = saveState(learner, { backup: false })
      }
      return append(working, entry, ...args)
    }
    let refreshed
    try { refreshed = await refreshFeed({ silent: true, channelIds: [channelId], trigger: 'automatic' }) }
    finally { appendActivityLog = append }
    return { refreshed, learnerSaved: await learnerSave, state: loadState() }
  })
  expect(result.learnerSaved).toBe(true)
  expect(result.refreshed.ok).toBe(true)
  expect(result.state.anki['2026-10-11'].reviewed).toBe(7)
  expect(result.state.activityLog.some(entry => entry.type === 'fixture-study')).toBe(true)
  expect(result.state.activityLog.some(entry => entry.type === 'youtube-refresh')).toBe(true)
  expect(result.state.videos.fixture0001.title).toBe('Fixture Study Video')
  await page.reload()
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  const saved = await page.evaluate(() => loadState())
  expect(saved.anki['2026-10-11'].reviewed).toBe(7)
  expect(saved.activityLog.some(entry => entry.type === 'fixture-study')).toBe(true)
  expect(saved.activityLog.some(entry => entry.type === 'youtube-refresh')).toBe(true)
  expect(saved.videos.fixture0001.title).toBe('Fixture Study Video')
})

for (const withActivity of [false, true]) test(`starter-feed preparation preserves an overlapping learner save (${withActivity ? 'with' : 'without'} activity)`, async ({ page }) => {
  await page.route('**/config.local.js*', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { youtubeApiKey: "fixture-key", indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }',
    contentType: 'application/javascript'
  }))
  await page.goto('/?internal_test=2')
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  const result = await page.evaluate(async withActivity => {
    const catalogId = 'mandarin-espresso-chinese'
    const queuedAt = '2026-10-11T13:30:00.000Z'
    const initial = loadState()
    initial.config.channels = []
    initial.config.ankiEnabled = false
    initial.config.channelShelfOrder = []
    initial.videos = {}
    initial.anki['2026-10-11'] = { reviewed: 1, created: 0 }
    initial.onboarding.setupCompleted = true
    initial.onboarding.walkthroughCompleted = true
    initial.onboarding.starterFeed = createPendingStarterFeed([catalogId], queuedAt)
    if (!await saveState(initial, { backup: false })) throw new Error('Fixture baseline failed')
    const getDetails = getFetchedVideoDetails
    let learnerSave
    getFetchedVideoDetails = async (...args) => {
      const details = await getDetails(...args)
      // Queue a real learner save immediately before the fetched channel is
      // applied. Its transaction commits before the queued starter-feed save.
      const learner = loadState()
      learner.anki['2026-10-11'].reviewed = 7
      if (withActivity) appendActivityLog(learner, { actor: 'user', type: 'fixture-study', status: 'success', title: 'Learner progress' })
      learnerSave = saveState(learner, { backup: false })
      return details
    }
    let error = null
    let prepared
    try { prepared = await prepareStarterFeedChannel(catalogId, queuedAt) }
    catch (failure) { error = failure.message }
    finally { getFetchedVideoDetails = getDetails }
    const learnerSaved = await learnerSave
    return { error, prepared, learnerSaved, state: loadState() }
  }, withActivity)
  expect(result.learnerSaved).toBe(true)
  expect(result.error).toBeNull()
  expect(result.prepared.addedChannelCount).toBe(1)
  expect(result.state.anki['2026-10-11'].reviewed).toBe(7)
  expect(Object.keys(result.state.videos).length).toBeGreaterThan(0)
  if (withActivity) expect(result.state.activityLog.some(entry => entry.type === 'fixture-study')).toBe(true)
  expect(result.state.activityLog.some(entry => entry.type === 'youtube-refresh')).toBe(true)
  await page.reload()
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  expect(await page.evaluate(() => loadState().anki['2026-10-11'].reviewed)).toBe(7)
})
