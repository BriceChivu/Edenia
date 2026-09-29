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
    await page.waitForTimeout(250)
  }
  const saved = () => page.frames().find(f => f.url().includes('/tiny-swords/')).evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_builder_preview_v1')))
  await clickGame(1068, 460)
  await page.waitForTimeout(1000)
  assert.equal((await saved()).unlocked, true)
  await page.screenshot({ path: resolve(artifacts, 'level-two-celebration.png'), fullPage: true })
  await clickGame(576, 355)
  await page.screenshot({ path: resolve(artifacts, 'level-two-inventory.png'), fullPage: true })
  await clickGame(672, 208)
  assert.equal((await saved()).tiles.length, 6)
  assert.equal((await saved()).stock.meadow, 0)
  await clickGame(740, 410)
  await clickGame(736, 336)
  assert.equal((await saved()).tiles.length, 5, 'Pickup reaches the island behind the folded inventory')
  assert.equal((await saved()).stock.meadow, 1)
  const cursorBox = await canvas.boundingBox()
  await page.mouse.move(cursorBox.x + 608 * cursorBox.width / 1152, cursorBox.y + 272 * cursorBox.width / 1152)
  await page.waitForTimeout(200)
  await page.screenshot({ path: resolve(artifacts, 'level-two-grid-cursor.png'), fullPage: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await frame.locator('#status').waitFor({ state: 'hidden', timeout: 90000 })
  assert.equal((await saved()).tiles.length, 5)
  assert.equal((await saved()).stock.meadow, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const phoneCanvas = await canvas.boundingBox()
  await page.mouse.click(phoneCanvas.x + phoneCanvas.width - 84, phoneCanvas.y + phoneCanvas.height - 36)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: resolve(artifacts, 'level-two-phone.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: reward ribbon, build mode, terrain placement and stock, refresh persistence without duplicate reward, phone rendering, no page errors.')
} finally {
  await browser.close()
}
