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
  for (const [name, width, height] of [['desktop', 1280, 900], ['phone', 390, 844]]) {
    await page.setViewportSize({ width, height })
    // Allow the exported engine's resize event to reach the next rendered frame.
    await page.waitForTimeout(250)
    const canvas = frame.locator('#canvas')
    const pixels = PNG.sync.read(await canvas.screenshot())
    // Mid-height strips avoid the parent's rounded corners and detect the old
    // vertical black bars even when the canvas itself fills its iframe.
    for (const x of [2, pixels.width - 3]) {
      const offset = (Math.floor(pixels.height / 2) * pixels.width + x) * 4
      assert.ok(pixels.data[offset + 1] > 90 && pixels.data[offset + 2] > 90,
        `${name}: water reaches the ${x === 2 ? 'left' : 'right'} canvas edge`)
    }
    await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true })
  }
  const wasm = await page.request.get('http://localhost:4183/tiny-swords/index.wasm')
  assert.equal(wasm.status(), 200)
  assert.equal(wasm.headers()['content-type'], 'application/wasm')
  assert.deepEqual(errors, [])
  console.log('PASS: root URL and refresh keep Godot in the town area; video UI remains; Web export loads without page errors; water reaches both canvas edges on desktop and phone.')
} finally {
  await browser.close()
}
