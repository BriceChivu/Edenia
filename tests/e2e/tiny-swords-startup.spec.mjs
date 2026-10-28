import { test, expect } from '@playwright/test'
import { startupHost } from '../support/tiny-swords-startup-host.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the source-owned Godot export')
test.setTimeout(90000)
const ready = page => expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
const diagnostics = page => page.evaluate(() => window.edeniaIslandStartupDiagnostics())
async function preserved(page, host) {
  await expect.poll(() => page.evaluate(() => saves.length)).toBeGreaterThan(0)
  const saved = await page.evaluate(() => durable.tinySwordsIsland)
  expect(saved.tiles).toEqual(host.island.tiles)
  expect(saved.resources).toEqual(host.island.resources)
  expect(await page.evaluate(() => exposure)).toEqual({ failureFrames: 0, retryFrames: 0 })
}

for (const mode of ['script-once', 'corrupt-engine', 'ordinary-once']) {
  test(`${mode} automatically restores the saved island with no failure or retry UI`, async ({ page }, testInfo) => {
    const host = await startupHost({ mode })
    try {
      if (mode === 'ordinary-once') await page.addInitScript(() => { window.Worker = undefined })
      await page.goto(host.url); await ready(page); await preserved(page, host)
      const records = await diagnostics(page)
      await testInfo.attach('startup', { body: JSON.stringify({ records, starts: host.starts, requests: host.requests }, null, 2), contentType: 'application/json' })
      expect(host.starts).toBe(2)
      expect(records.at(-1).outcome).toBe('recovered')
      if (mode === 'corrupt-engine') {
        expect(records.at(-1).delivery).toBe('ordinary')
        expect(host.requests.some(x => x.path.endsWith('/index.wasm'))).toBe(true)
      }
      const frame = page.frames().find(x => x.url().includes('/tiny-swords-game/'))
      await frame.evaluate(() => parent.postMessage({ type: 'edenia-game-startup-failed', reason: 'script' }, location.origin))
      await ready(page); expect(host.starts).toBe(2)
      await page.getByRole('button', { name: 'Study stays usable' }).click()
    } finally { await page.goto('about:blank'); await host.close() }
  })
}

test('silent document recovers on a stage deadline without a retry click', async ({ page }) => {
  const host = await startupHost({ mode: 'silent-once' })
  try {
    await page.clock.install(); await page.goto(host.url)
    await expect(page.locator('iframe')).toHaveCount(1)
    await page.clock.fastForward(20700); await ready(page); await preserved(page, host)
    expect(host.starts).toBe(2)
    expect((await diagnostics(page)).some(x => x.reason === 'timeout' && x.stage === 'document')).toBe(true)
  } finally { await page.goto('about:blank'); await host.close() }
})

for (const [mode, stage] of [['silent-scene-once', 'scene'], ['silent-restore-once', 'restore']]) {
  test(`${stage} that never acknowledges startup recovers without writing a fallback layout`, async ({ page }) => {
    const host = await startupHost({ mode })
    try {
      await page.clock.install(); await page.goto(host.url)
      await expect(page.locator('iframe')).toHaveCount(1)
      await expect.poll(async () => (await diagnostics(page)).some(x => x.outcome === 'started')).toBe(true)
      await expect(page.locator('#tinySwordsLoadBar')).toHaveAttribute('aria-valuenow', stage === 'scene' ? '80' : '90')
      await page.clock.fastForward(20700); await ready(page); await preserved(page, host)
      expect(host.starts).toBe(2)
      expect((await diagnostics(page)).some(x => x.reason === 'timeout' && x.stage === stage)).toBe(true)
    } finally { await page.goto('about:blank'); await host.close() }
  })
}

test('unrelated optional promise rejection before the first save cannot fail startup', async ({ page }) => {
  const host = await startupHost()
  try {
    await page.addInitScript(() => {
      if (window !== parent) addEventListener('DOMContentLoaded', () => {
        parent.rejectedBeforeFirstSave = window.edeniaSaveId === 0
        Promise.reject(new Error('Synthetic optional rejection'))
      }, { once: true })
    })
    await page.goto(host.url); await ready(page); await preserved(page, host)
    expect(await page.evaluate(() => rejectedBeforeFirstSave)).toBe(true)
    expect(host.starts).toBe(1)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('a removed release refreshes to a compatible complete release without reloading the study page', async ({ page }) => {
  const host = await startupHost({ stale: true })
  try {
    await page.clock.install(); await page.goto(host.url)
    await expect(page.locator('iframe')).toHaveCount(1); await page.clock.fastForward(20700)
    await ready(page); await preserved(page, host)
    expect(host.starts).toBe(2)
    expect(page.url()).toBe(host.url)
    expect(host.requests.filter(x => x.path === '/tiny-swords-current.json')).toHaveLength(1)
    await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(host.release))
  } finally { await page.goto('about:blank'); await host.close() }
})

test('a newer incompatible release cannot become a writer in the old host', async ({ page }) => {
  const host = await startupHost({ stale: true, incompatible: true })
  try {
    await page.clock.install(); await page.goto(host.url)
    await expect(page.locator('iframe')).toHaveCount(1); await page.clock.fastForward(20700)
    await expect.poll(() => host.starts).toBe(2)
    await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp('a'.repeat(64)))
    expect(await page.evaluate(() => saves.length)).toBe(0)
    expect(await page.evaluate(() => durable.tinySwordsIsland)).toEqual(host.island)
    expect(host.requests.filter(x => x.path === '/tiny-swords-current.json')).toHaveLength(1)
    await page.evaluate(() => lockProfile())
  } finally { await page.goto('about:blank'); await host.close() }
})

test('a ready island has zero startup timers and cannot remount on online or visibility wakeups', async ({ page }) => {
  const host = await startupHost()
  try {
    await page.addInitScript(() => {
      if (window !== parent) return
      const timeouts = new Set(), intervals = new Set()
      const originalTimeout = setTimeout, originalInterval = setInterval
      const originalClearTimeout = clearTimeout, originalClearInterval = clearInterval
      window.setTimeout = (fn, delay, ...args) => {
        let id = originalTimeout(() => { timeouts.delete(id); fn(...args) }, delay)
        timeouts.add(id); return id
      }
      window.clearTimeout = id => { timeouts.delete(id); originalClearTimeout(id) }
      window.setInterval = (...args) => { const id = originalInterval(...args); intervals.add(id); return id }
      window.clearInterval = id => { intervals.delete(id); originalClearInterval(id) }
      window.startupTimerCount = () => timeouts.size + intervals.size
    })
    await page.goto(host.url); await ready(page); await preserved(page, host)
    expect(await page.evaluate(() => startupTimerCount())).toBe(0)
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) { dispatchEvent(new Event('online')); dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')) }
    })
    expect(await page.evaluate(() => startupTimerCount())).toBe(0); expect(host.starts).toBe(1)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('a suspended startup excludes the time asleep and resumes the same attempt before its deadline', async ({ page }) => {
  const host = await startupHost({ mode: 'silent-once' })
  try {
    await page.clock.install(); await page.goto(host.url)
    await expect(page.locator('iframe')).toHaveCount(1)
    await page.clock.fastForward(5000); await page.evaluate(() => document.dispatchEvent(new Event('freeze')))
    await page.clock.fastForward(300000)
    expect(host.starts).toBe(1); expect((await diagnostics(page)).filter(x => x.outcome === 'failure')).toHaveLength(0)
    await page.evaluate(() => document.dispatchEvent(new Event('resume')))
    await page.clock.fastForward(14000); expect(host.starts).toBe(1)
    await page.clock.fastForward(1700); await ready(page); await preserved(page, host)
    expect(host.starts).toBe(2)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('an offscreen island waits to start an engine until it enters view', async ({ page }) => {
  const host = await startupHost()
  try {
    await page.goto(host.url + '?inactive')
    await page.evaluate(() => {
      document.getElementById('tinySwordsSurface').style.marginTop = '2000px'
    })
    // Synchronize the real observer rather than assuming a scroll callback has
    // already reached the parent when the profile activation is dispatched.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => activateProfile()); await expect(page.locator('iframe')).toHaveCount(0)
    await page.locator('#tinySwordsSurface').scrollIntoViewIfNeeded()
    await ready(page); await preserved(page, host); expect(host.starts).toBe(1)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('repeated failures enter a quiet cooldown, preserve data, then recover automatically', async ({ page }) => {
  const host = await startupHost({ mode: 'scripts-fail' })
  try {
    await page.clock.install(); await page.goto(host.url)
    for (let count = 1; count <= 3; count++) {
      await expect.poll(async () => (await diagnostics(page)).filter(x => x.outcome === 'failure').length).toBe(count)
      if (count < 3) await page.clock.fastForward(count === 1 ? 700 : 2200)
    }
    await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'dormant')
    await expect(page.locator('#tinySwordsLoadStatus')).toBeHidden(); await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate(() => saves.length)).toBe(0)
    expect(await page.evaluate(() => durable.tinySwordsIsland)).toEqual(host.island)
    expect(await page.evaluate(() => exposure)).toEqual({ failureFrames: 0, retryFrames: 0 })
    host.mode = 'normal'; await page.clock.fastForward(30000); await ready(page); await preserved(page, host)
    expect(host.starts).toBe(4)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('offline profile opening waits without an engine and resumes when online', async ({ page, context }) => {
  const host = await startupHost()
  try {
    await page.goto(host.url + '?inactive'); await expect(page.locator('iframe')).toHaveCount(0)
    await context.setOffline(true); await page.evaluate(() => activateProfile())
    await expect(page.locator('iframe')).toHaveCount(0); expect(await page.evaluate(() => saves.length)).toBe(0)
    await context.setOffline(false); await ready(page); await preserved(page, host)
    expect(host.starts).toBe(1)
  } finally { await context.setOffline(false); await page.goto('about:blank'); await host.close() }
})

test('sign-out during recovery cancels all attempts and preserves the saved input', async ({ page }) => {
  const host = await startupHost({ mode: 'scripts-fail' })
  try {
    await page.clock.install(); await page.goto(host.url)
    await expect.poll(async () => (await diagnostics(page)).some(x => x.outcome === 'failure')).toBe(true)
    await page.evaluate(() => lockProfile()); await page.clock.fastForward(1000000)
    expect(host.starts).toBe(1); expect(await page.evaluate(() => saves.length)).toBe(0)
    expect(await page.evaluate(() => durable.tinySwordsIsland)).toEqual(host.island)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('rejected restore is quiet and cannot replace the saved island with an empty world', async ({ page }) => {
  const host = await startupHost()
  try {
    await page.goto(host.url + '?inactive')
    await page.evaluate(() => replaceIsland({ ...fixture, version: 999 }))
    await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'restore-blocked', { timeout: 60000 })
    expect(await page.evaluate(() => durable.tinySwordsIsland)).toEqual({ ...host.island, version: 999 })
    expect(await page.evaluate(() => saves.length)).toBe(0); expect(host.starts).toBe(1)
    await expect(page.locator('#tinySwordsLoadStatus')).toBeHidden()
    expect(await page.evaluate(() => exposure)).toEqual({ failureFrames: 0, retryFrames: 0 })
  } finally { await page.goto('about:blank'); await host.close() }
})
