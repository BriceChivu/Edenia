import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1152, height: 496 } })
  await page.goto('http://localhost:4183/tiny-swords/index.html', { waitUntil: 'domcontentloaded' })
  await page.locator('#status').waitFor({ state: 'hidden', timeout: 90000 })
  await page.mouse.move(1068, 460)
  await page.waitForTimeout(200)
  const cursor = await page.locator('#canvas').evaluate(el => getComputedStyle(el).cursor)
  console.log('Build button native cursor:', cursor)
  assert.equal(cursor, 'none', 'System pointer must stay hidden over build controls; Godot draws Cursor 01')
  console.log('PASS: custom cursor over the build button')
} finally { await browser.close() }
