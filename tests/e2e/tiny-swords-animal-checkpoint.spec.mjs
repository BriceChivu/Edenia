import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the real integrated Godot build')

test('animal positions survive a clean game reopen and study save without rewriting the accepted island', async ({ page }) => {
  test.setTimeout(120000)
  const initial = JSON.parse(await readFile('tests/fixtures/tiny-swords-animal-v37-initial.json', 'utf8'))
  let enabled = false
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ tinySwordsEnabled: enabled,
      accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
      indexedDbProfileEnabled: enabled, indexedDbBackupsEnabled: enabled })}` }))
  await page.goto('./?internal_test=2')
  await page.waitForFunction(() => typeof defaultState === 'function')
  await page.evaluate(island => {
    const at = new Date().toISOString()
    const state = defaultState(4, [], 'light', [], 'en')
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true,
      setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at,
      levelUpGuidanceShownAt: at, islandAnnouncementSeenAt: at })
    state.tinySwordsIsland = island
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, initial)
  await page.addInitScript(() => {
    window.animalProbeLayouts = []
    addEventListener('message', event => {
      if (event.origin === location.origin && event.data?.type === 'edenia-tiny-layout') {
        window.animalProbeLayouts.push(event.data)
      }
    })
  })
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  let game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await expect.poll(() => game.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  const baseline = await page.evaluate(() => ({
    canonical: JSON.stringify(loadState().tinySwordsIsland),
    effective: window.edeniaTinySwordsPersistence.readIsland().tinySwordsIsland
  }))
  expect(baseline.effective.version).toBe(39)
  const moved = structuredClone(baseline.effective)
  moved.sheep[0] = [560, 208] // Validated by the native contact/restore tests.
  await game.evaluate(layout => window.edeniaQueueLayout(layout, true), moved)
  await expect.poll(() => page.evaluate(() =>
    window.edeniaTinySwordsPersistence.readIsland().tinySwordsIsland.sheep[0])).toEqual([560, 208])
  expect(await page.evaluate(() => JSON.stringify(loadState().tinySwordsIsland))).toBe(baseline.canonical)
  await page.evaluate(async () => {
    const state = loadState()
    state.config.animalCheckpointStudyFixture = true
    if (!await saveState(state)) throw new Error('Study save failed')
  })
  expect(await page.evaluate(() => window.edeniaTinySwordsPersistence.readIsland().tinySwordsIsland.sheep[0])).toEqual([560, 208])
  expect(await page.evaluate(() => JSON.stringify(loadState().tinySwordsIsland))).toBe(baseline.canonical)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await expect.poll(() => game.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  expect(await game.evaluate(() => window.edeniaStudyLayout.sheep[0])).toEqual([560, 208])
  expect(await page.evaluate(() => JSON.stringify(loadState().tinySwordsIsland))).toBe(baseline.canonical)
  expect(await page.evaluate(() => loadState().config.animalCheckpointStudyFixture)).toBe(true)
  expect(await page.evaluate(() => window.edeniaFlushTinySwordsCheckpoint())).toBe(true)
  const download = page.waitForEvent('download')
  await page.evaluate(() => exportSyncFile())
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'))
  expect(exported.profile.tinySwordsIsland).toEqual(await page.evaluate(() =>
    window.edeniaTinySwordsPersistence.readIsland().tinySwordsIsland))
  const unexpectedDownloads = []
  page.on('download', download => unexpectedDownloads.push(download.suggestedFilename()))
  await page.evaluate(async () => {
    window.edeniaFlushTinySwordsCheckpoint = async () => false
    await exportSyncFile()
  })
  expect(unexpectedDownloads).toEqual([])
  await expect(page.locator('#toast')).toContainText(/save/i)
})
