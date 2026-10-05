import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { chromium } from '@playwright/test'

test('local Tiny Swords page hides legacy artwork before app or integration scripts run', async () => {
  const html = await readFile('index.html', 'utf8')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/*', route => route.request().resourceType() === 'document'
      ? route.fulfill({ contentType: 'text/html', body: html })
      : route.abort())
    for (const host of ['localhost', '127.0.0.1']) {
      await page.goto(`http://${host}:8037/`)
      assert.equal(await page.locator('#cityMilestoneImage').isVisible(), false, 'legacy town must stay hidden without the integration export')
      for (const image of await page.locator('[data-intro-city-frame]').all()) {
        assert.equal(await image.evaluate(el => getComputedStyle(el).visibility), 'hidden')
      }
      assert.equal(await page.locator('.city-image-canvas').evaluate(el => getComputedStyle(el).visibility), 'hidden')
      await page.evaluate(() => {
        const frame = document.createElement('iframe')
        frame.className = 'tiny-swords-frame'
        document.querySelector('.city-image-wrap').append(frame)
      })
      assert.equal(await page.locator('#cityMilestoneImage').isVisible(), false)
    }
    await page.goto('http://localhost:8000/')
    assert.equal(await page.locator('#cityMilestoneImage').evaluate(el => getComputedStyle(el).visibility), 'visible')
  } finally {
    await browser.close()
  }
})
