import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Selected by the Tiny Swords integration suite')
const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))

async function seed(page) {
  await page.goto('./')
  await page.evaluate(island => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 9, experienceVersion: 1 }
    state.tinySwordsIsland = island
    state.videos.lesson = { id: 'lesson', title: 'Retained study', duration: 3600, status: 'partial', watchProgress: [{ watchedAt: at, seconds: 900, experienceSeconds: 900 }] }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, island)
  await page.reload()
}
const durable = page => page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('edenia_v1'))
  return { island: state.tinySwordsIsland, videos: state.videos }
})

// A deterministic transport peer exercises Edenia's focus boundary separately
// from Godot's existing real camera and progression smoke.
const peer = `<!doctype html><button id="gameInput">Game input</button><script>
window.commands=[];window.pointers=0;window.keys=0;
document.addEventListener('pointerdown',()=>window.pointers++);
document.addEventListener('keydown',()=>window.keys++);
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==parent)return;
 if(e.data.type==='edenia-camera')commands.push(e.data.command);
 if(e.data.type==='edenia-host-visibility')window.hostVisible=e.data.visible;
 if(e.data.type==='edenia-study-level')window.session=e.data.session;
});
window.ready=()=>{
 parent.postMessage({type:'edenia-game-progression',thresholds:[0,15,45,90,150,225,315,420,540,675]},location.origin);
};
</script>`

async function accept(game) {
  await game.evaluate(() => window.ready())
  await expect.poll(() => game.evaluate(() => window.session)).toBeGreaterThan(0)
  await game.evaluate(() => parent.postMessage({ type: 'edenia-tiny-restored', session: window.session, accepted: true }, location.origin))
}

test('slow startup retains study and saved work; dialogs and walkthroughs block game input', async ({ page }) => {
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: peer }))
  await page.clock.install()
  await seed(page)
  const retained = await durable(page)
  const frame = page.locator('.tiny-swords-frame')
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await expect(page.locator('#cityMilestoneImage, #cityTimeWaveform')).toHaveCount(0)
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'loading')
  await expect(frame).toHaveAttribute('inert', '')
  await page.clock.fastForward(21000)
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'slow')
  await expect(page.locator('#tinySwordsRetry')).toBeVisible()
  await expect(page.locator('#cityFollowingLevel')).toHaveText('Level 10 reached')
  await expect(page.locator('#cityNextLevel')).toHaveText('Level 10 reached')
  await expect(page.locator('#cityLevelProgress')).toHaveAttribute('aria-valuenow', '675')
  await expect(page.locator('#historySummaryView')).toContainText('15')
  expect(await durable(page)).toEqual(retained)
  // Late readiness still succeeds after the slow notice.
  await accept(game)
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready')
  await expect(frame).not.toHaveAttribute('inert', '')
  await expect.poll(() => game.evaluate(() => window.hostVisible)).toBe(true)
  await page.locator('[data-city-zoom-action="in"]').press('Enter')
  await expect.poll(() => game.evaluate(() => window.commands)).toEqual(['in'])
  await game.locator('#gameInput').focus()
  await page.evaluate(() => openSettings())
  await expect(frame).toHaveAttribute('inert', '')
  await expect.poll(() => game.evaluate(() => window.hostVisible)).toBe(false)
  expect(await page.evaluate(() => document.activeElement?.className)).not.toContain('tiny-swords-frame')
  const keys = await game.evaluate(() => window.keys)
  await page.keyboard.press('ArrowLeft')
  expect(await game.evaluate(() => window.keys)).toBe(keys)
  await page.evaluate(() => document.querySelector('[data-city-zoom-action="out"]').click())
  expect(await game.evaluate(() => window.commands)).toEqual(['in'])
  await page.locator('#settingsCloseBtn').click()
  await expect(frame).not.toHaveAttribute('inert', '')
  await page.evaluate(() => startWalkthrough())
  await expect(frame).toHaveAttribute('inert', '')
  await expect.poll(() => game.evaluate(() => window.hostVisible)).toBe(false)
  const bounds = await frame.boundingBox()
  const pointers = await game.evaluate(() => window.pointers)
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  expect(await game.evaluate(() => window.pointers)).toBe(pointers)
  await page.evaluate(() => endWalkthrough({ markCompleted: false }))
  await expect(frame).not.toHaveAttribute('inert', '')
  await expect.poll(() => game.evaluate(() => window.hostVisible)).toBe(true)
  expect(await durable(page)).toEqual(retained)
  await page.screenshot({ path: test.info().outputPath('dashboard-overlay-boundary.png'), fullPage: true })
})

test('engine download failure retains island and history; retry can restore the game', async ({ page, pageDiagnostics }) => {
  test.setTimeout(120000)
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: peer }))
  await seed(page)
  const retained = await durable(page)
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.route('**/tiny-swords-game/*/index.wasm', route => route.abort())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'failed', { timeout: 60000 })
  await expect(page.locator('#tinySwordsLoadStatus')).toContainText('saved island is retained')
  await expect(page.locator('#historySummaryView')).toContainText('15')
  expect(await durable(page)).toEqual(retained)
  // Only the deliberately aborted download's browser errors are expected.
  expect(pageDiagnostics.some(error => /net::ERR_FAILED|Failed to fetch/.test(error))).toBe(true)
  for (let index = pageDiagnostics.length - 1; index >= 0; index--) {
    if (/^(console: Failed to load resource: net::ERR_FAILED|page: Failed to fetch)$/.test(pageDiagnostics[index])) pageDiagnostics.splice(index, 1)
  }
  await page.unroute('**/tiny-swords-game/*/index.wasm')
  await page.locator('#tinySwordsRetry').click()
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const saved = await durable(page)
  expect(saved.island.tiles).toEqual(retained.island.tiles)
  expect(saved.videos).toEqual(retained.videos)
})
