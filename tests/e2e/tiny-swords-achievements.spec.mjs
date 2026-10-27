import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

const legacyIsland = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json', import.meta.url), 'utf8'))
test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')

async function openIsland(page, query, key, indexedDb = false) {
  await page.route('**/config.local.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ tinySwordsEnabled: true, tinySwordsPublicEnabled: true,
      accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
      indexedDbProfileEnabled: indexedDb, indexedDbBackupsEnabled: indexedDb })}`
  }))
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Seeding disposable learner</title>' }))
  await page.goto(`./${query}`)
  await page.waitForFunction(() => typeof defaultState === 'function')
  await page.evaluate(({ island, key }) => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at,
      walkthroughCompleted: true, walkthroughCompletedAt: at, islandAnnouncementSeenAt: at, levelUpGuidanceShownAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 6, pendingLevelIndex: null, experienceVersion: 1 }
    state.videos.lesson = { id: 'lesson', title: 'Achievement persistence fixture', duration: 36000, status: 'partial',
      watchProgress: [{ watchedAt: at, seconds: 18900, experienceSeconds: 18900 }] }
    state.tinySwordsIsland = island
    localStorage.setItem(key, JSON.stringify(state))
  }, { island: legacyIsland, key })
  await page.unroute('**/tiny-swords-game/*/index.html*')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('.tiny-swords-frame')
  await expect(frame.locator('#canvas')).toBeVisible({ timeout: 60000 })
  await expect(frame.locator('#status')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(() => loadState()?.tinySwordsIsland?.version), { timeout: 30000 }).toBe(39)
  return frame
}

for (const [query, key] of [['?internal_test=2', 'edenia_v1_internal_test_2']]) {
  test(`achievement rollout stays off for ${query || 'the public game'}`, async ({ page }) => {
    test.setTimeout(120000)
    await openIsland(page, query, key)
    const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
    expect(new URL(game.url()).searchParams.has('internal_test')).toBe(false)
    expect(await page.evaluate(() => loadState().tinySwordsIsland.achievements)).toEqual({})
  })
}
