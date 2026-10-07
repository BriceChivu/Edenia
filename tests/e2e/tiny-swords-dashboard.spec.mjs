import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Selected by the Tiny Swords integration suite')
const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))

async function seed(page) {
  await page.goto('./?internal_test=2')
  await page.evaluate(island => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 9, experienceVersion: 1 }
    state.tinySwordsIsland = island
    state.videos.lesson = { id: 'lesson', title: 'Retained study', duration: 3600, status: 'partial', watchProgress: [{ watchedAt: at, seconds: 900, experienceSeconds: 900 }] }
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, island)
  await page.reload()
  await expect.poll(() => page.frames().some(frame => frame.url().includes('/tiny-swords-game/'))).toBe(true)
}
const durable = page => page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test_2'))
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

test('completed downloads leave visible progress for engine startup and restoration', async ({ page }) => {
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: peer }))
  await seed(page)
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await game.evaluate(() => parent.postMessage({ type: 'edenia-game-loading-progress', current: 100, total: 100 }, location.origin))
  await expect(page.locator('#tinySwordsLoadProgress')).toHaveAttribute('data-phase', 'preparing')
  const value = Number(await page.locator('#tinySwordsLoadBar').getAttribute('aria-valuenow'))
  expect(value).toBeLessThanOrEqual(70)
  await expect(page.locator('.tiny-swords-frame')).toHaveAttribute('inert', '')
  await expect(page.locator('#tinySwordsLoadProgress')).toBeVisible()
})

test('real Godot startup advances milestones and completes with a rendered saved island', async ({ page }) => {
  test.setTimeout(120000)
  await page.addInitScript(() => {
    window.islandStartupEvents = []
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== document.querySelector('.tiny-swords-frame')?.contentWindow) return
      if (!['edenia-game-engine-initialized', 'edenia-game-progression', 'edenia-tiny-restored'].includes(event.data?.type)) return
      // This listener is registered before the host adapter, so record the
      // displayed state immediately before each real milestone is handled.
      window.islandStartupEvents.push({
        type: event.data.type,
        progress: Number(document.getElementById('tinySwordsLoadBar').getAttribute('aria-valuenow')),
        ready: document.getElementById('tinySwordsSurface').dataset.gameState === 'ready'
      })
    })
  })
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: peer }))
  await seed(page)
  // Keep claimed study progress at the saved level so this startup check does
  // not also exercise the separate sequential level-unlock/save handshake.
  await page.evaluate(level => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test_2'))
    state.cityProgress.maxLevelIndex = level - 1
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, island.level)
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.reload()
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 90000 })
  const events = await page.evaluate(() => window.islandStartupEvents)
  expect(events.map(event => event.type)).toEqual(['edenia-game-engine-initialized', 'edenia-game-progression', 'edenia-tiny-restored'])
  expect(events[0].progress).toBeLessThan(80)
  expect(events[1].progress).toBeGreaterThanOrEqual(80)
  expect(events[1].progress).toBeLessThan(90)
  expect(events[2].progress).toBeGreaterThanOrEqual(90)
  expect(events[2].progress).toBeLessThan(97)
  expect(events.every(event => !event.ready)).toBe(true)
  await expect(page.locator('#tinySwordsLoadBar')).toHaveAttribute('aria-valuenow', '100')
  await expect(page.locator('.tiny-swords-frame')).not.toHaveAttribute('inert', '')
  await page.locator('#tinySwordsSurface').screenshot({ path: test.info().outputPath('island-ready.png') })
  await expect.poll(async () => (await durable(page)).island.level).toBe(island.level)
})

test('loading progress follows downloads, preparation, retry and live locale changes', async ({ page }) => {
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: peer }))
  await seed(page)
  const progress = page.locator('#tinySwordsLoadProgress')
  const bar = page.locator('#tinySwordsLoadBar')
  const label = page.locator('#tinySwordsLoadProgressLabel')
  const game = () => page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  const report = (current, total) => game().evaluate(({ current, total }) =>
    parent.postMessage({ type: 'edenia-game-loading-progress', current, total }, location.origin), { current, total })
  await expect(progress).toBeVisible()
  await expect(bar).toHaveAttribute('aria-valuenow', '0')
  // A host-page message and malformed game values cannot change the bar.
  await page.evaluate(() => window.postMessage({ type: 'edenia-game-loading-progress', current: 100, total: 100 }, location.origin))
  await report(-1, 100)
  await report(200, 100)
  await report(1, 0)
  await expect(bar).toHaveAttribute('aria-valuenow', '0')
  await report(50, 100)
  await expect(bar).toHaveAttribute('aria-valuenow', '30')
  await report(20, 100)
  await expect(bar).toHaveAttribute('aria-valuenow', '30')
  for (const locale of SUPPORTED_LOCALES) {
    await page.evaluate(locale => saveLocaleFromSettings(locale), locale)
    await expect(label).toHaveText(I18N[locale]['island.preparing'])
    await expect(page.locator('#tinySwordsLoadMessage')).toHaveText(I18N[locale]['island.preparing'])
    await expect(bar).toHaveAttribute('aria-valuenow', '30')
  }
  await page.evaluate(() => saveLocaleFromSettings('zh-Hant'))
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async theme => { if (document.body.dataset.theme !== theme) await toggleTheme() }, theme)
    await expect(page.locator('body')).toHaveAttribute('data-theme', theme)
    await expect(bar).toHaveCSS('background-color', theme === 'dark' ? 'rgb(19, 39, 46)' : 'rgb(255, 255, 255)')
    const bounds = await bar.boundingBox()
    expect(bounds.width).toBeGreaterThan(100)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
    const fill = await bar.locator('span').boundingBox()
    expect(fill.width / (bounds.width - 2)).toBeCloseTo(0.3, 2)
    await page.locator('#tinySwordsSurface').screenshot({ path: test.info().outputPath(`loading-zh-Hant-${theme}.png`) })
  }
  await report(100, 100)
  await expect(progress).toHaveAttribute('data-phase', 'preparing')
  await expect(label).toHaveText(I18N['zh-Hant']['island.preparing'])
  await expect(bar).toHaveAttribute('aria-valuenow', '60')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await bar.locator('span').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  await game().evaluate(() => parent.postMessage({ type: 'edenia-game-startup-failed' }, location.origin))
  await expect(progress).toBeHidden()
  await page.locator('#tinySwordsRetry').click()
  await expect(progress).toBeVisible()
  await expect(progress).toHaveAttribute('data-phase', 'download')
  await expect(bar).toHaveAttribute('aria-valuenow', '0')
  await expect(label).toHaveText(I18N['zh-Hant']['island.preparing'])
  await expect.poll(() => Boolean(game())).toBe(true)
  await accept(game())
  await expect(progress).toBeHidden()
  await report(50, 100)
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready')
})

test('loading fill advances through startup stages, stays anchored left and has no time text', async ({ page }) => {
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: peer }))
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  await seed(page)
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  const bar = page.locator('#tinySwordsLoadBar')
  const fill = bar.locator('span')
  await expect(page.locator('#tinySwordsLoadEstimate')).toHaveCount(0)
  await expect(page.locator('#tinySwordsLoadMessage')).toHaveText('Preparing your island...')
  for (const current of [0, 25, 50, 75, 100]) {
    await game.evaluate(current => parent.postMessage({ type: 'edenia-game-loading-progress', current, total: 100 }, location.origin), current)
    await expect(bar).toHaveAttribute('aria-valuenow', String(Math.floor(current * 0.6)))
    await expect(fill).toHaveCSS('animation-name', 'none')
    await expect(fill).toHaveCSS('transform', 'none')
    const bounds = await bar.boundingBox()
    const filled = await fill.boundingBox()
    expect(filled.x).toBeCloseTo(bounds.x + 1, 1)
    expect(filled.width / (bounds.width - 2)).toBeCloseTo(current * 0.6 / 100, 2)
  }
  await page.clock.fastForward(9000)
  await expect(bar).toHaveAttribute('aria-valuenow', '75')
  await game.evaluate(() => parent.postMessage({ type: 'edenia-game-engine-initialized' }, location.origin))
  await expect(bar).toHaveAttribute('aria-valuenow', '80')
  await page.clock.fastForward(6000)
  await expect(bar).toHaveAttribute('aria-valuenow', '85')
  await game.evaluate(() => window.ready())
  await expect(bar).toHaveAttribute('aria-valuenow', '90')
  await page.clock.fastForward(9000)
  await expect(bar).toHaveAttribute('aria-valuenow', '95')
  await expect(page.locator('.tiny-swords-frame')).toHaveAttribute('inert', '')
  await page.clock.fastForward(120000)
  await expect(bar).toHaveAttribute('aria-valuenow', '96')
  await page.locator('#tinySwordsSurface').screenshot({ path: test.info().outputPath('loading-bar.png') })
  await accept(game)
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  await expect(page.locator('#tinySwordsLoadProgress')).toBeHidden()
})

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
  await page.route('**/tiny-swords-engine/*/index.wasm{,.br}', route => route.abort())
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
  await page.unroute('**/tiny-swords-engine/*/index.wasm{,.br}')
  await page.locator('#tinySwordsRetry').click()
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const saved = await durable(page)
  expect(saved.island.tiles).toEqual(retained.island.tiles)
  expect(saved.videos).toEqual(retained.videos)
})
