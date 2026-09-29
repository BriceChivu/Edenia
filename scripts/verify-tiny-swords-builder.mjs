// Run against the local preview started by preview-tiny-swords.mjs.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { PNG } = require(resolve(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'))
const artifacts = resolve('test-results/tiny-swords-preview')
await mkdir(artifacts, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()) } })
  await page.goto('http://localhost:4183/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  // This is a disposable test browser profile; no live learner data is read.
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const now = new Date().toISOString()
    Object.assign(state.onboarding, {
      introSeenAt: now, setupCompleted: true, setupCompletedAt: now,
      walkthroughCompleted: true, walkthroughCompletedAt: now,
      levelUpGuidanceShownAt: now
    })
    state.config.ankiEnabled = false
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  assert.equal(new URL(page.url()).search, '')
  await page.locator('.tiny-swords-frame').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.city-image-wrap > iframe').count(), 1)
  assert.equal(await page.locator('#cityMilestoneImage').isVisible(), false)
  assert.equal(await page.getByRole('heading', { name: 'Videos to watch' }).isVisible(), true)
  const frame = page.frameLocator('.tiny-swords-frame')
  await frame.locator('#canvas').waitFor({ state: 'visible' })
  await frame.locator('#status').waitFor({ state: 'hidden', timeout: 90000 })
  await page.setViewportSize({ width: 1280, height: 900 })
  const canvas = frame.locator('#canvas')
  async function clickGame(x, y) {
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + x * box.width / 1152, box.y + y * box.width / 1152)
    await page.waitForTimeout(750)
  }
  const saved = () => page.frames().find(f => f.url().includes('/tiny-swords/')).evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_builder_preview_v1')))
  await clickGame(1068, 460)
  await page.waitForTimeout(1000)
  assert.equal((await saved()).unlocked, true)
  await page.screenshot({ path: resolve(artifacts, 'level-two-celebration.png'), fullPage: false })
  await clickGame(576, 355)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(artifacts, 'level-two-inventory.png'), fullPage: false })
  await clickGame(672, 208)
  assert.equal((await saved()).tiles.length, 6)
  assert.equal((await saved()).stock.meadow, 1)
  await clickGame(740, 385)
  await clickGame(736, 336)
  assert.equal((await saved()).tiles.length, 5, 'Pickup reaches the island behind the folded inventory')
  assert.equal((await saved()).stock.meadow, 2)
  const cursorBox = await canvas.boundingBox()
  await page.mouse.move(cursorBox.x + 608 * cursorBox.width / 1152, cursorBox.y + 272 * cursorBox.width / 1152)
  await page.waitForTimeout(200)
  const cursorStyle = await canvas.evaluate(element => getComputedStyle(element).cursor)
  assert.equal(cursorStyle, 'none', 'Godot draws the freely moving pointer without native fallback')
  await page.screenshot({ path: resolve(artifacts, 'level-two-grid-cursor.png'), fullPage: false })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await frame.locator('#status').waitFor({ state: 'hidden', timeout: 90000 })
  assert.equal((await saved()).tiles.length, 5)
  assert.equal((await saved()).stock.meadow, 2)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const phoneCanvas = await canvas.boundingBox()
  await page.mouse.click(phoneCanvas.x + phoneCanvas.width - 84, phoneCanvas.y + phoneCanvas.height - 36)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: resolve(artifacts, 'level-two-phone.png'), fullPage: false })
  // A disposable saved arrangement exercises the new stair/cliff composition.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.frames().find(f => f.url().includes('/tiny-swords/')).evaluate(() => {
    localStorage.setItem('edenia_tiny_swords_builder_preview_v1', JSON.stringify({
      version: 2, unlocked: true,
      tiles: [[0,0,'meadow',false],[1,0,'meadow',false],[0,1,'meadow',false],[1,1,'meadow',false],[3,2,'meadow',false],[2,0,'meadow',false],[3,0,'stairs',false],[4,0,'high_gold',false],[5,0,'high_meadow',false],[5,1,'high_gold',false]],
      stock: { meadow:0, gold:1, violet:1, high_meadow:0, high_gold:0, stairs:1, tree:1 }
    }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await frame.locator('#status').waitFor({ state: 'hidden', timeout: 90000 })
  await clickGame(800, 144)
  await page.waitForTimeout(6000)
  await page.screenshot({ path: resolve(artifacts, 'level-two-stairs.png'), fullPage: false })
  assert.deepEqual(errors, [])
  console.log('PASS: reward ribbon, build mode, terrain placement and stock, refresh persistence without duplicate reward, phone rendering, no page errors.')
} finally {
  await browser.close()
}
