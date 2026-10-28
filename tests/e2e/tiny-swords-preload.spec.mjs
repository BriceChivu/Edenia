import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, relative, resolve } from 'node:path'
import { test, expect } from '@playwright/test'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the source-owned integrated Godot export')

async function hostGame({ missingCompressed = false } = {}) {
  const root = resolve('_site')
  const [release] = await readdir(resolve(root, 'tiny-swords-game'))
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))
  const requests = []
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname
      requests.push(path)
      if (path === '/probe') {
        res.setHeader('Content-Type', 'text/html')
        res.end(`<!doctype html><style>#tinySwordsSurface,iframe{width:1054px;height:454px;border:0}body{margin:0}</style>
          <div id="tinySwordsSurface"><div class="tiny-swords-camera-controls"></div></div>
          <div id="tinySwordsLoadStatus"><span id="tinySwordsLoadMessage"></span>
            <div id="tinySwordsLoadProgress"><div id="tinySwordsLoadBar"></div><span id="tinySwordsLoadProgressLabel"></span></div></div>
          <button id="tinySwordsRetry">Retry</button><script>
          window.edeniaTinySwordsEnabled=true;window.saves=[];window.current=null;
          window.edeniaTinySwordsPersistence={readIsland:()=>current,readClaimedLevel:()=>${island.level},readAccessIdentity:()=>current?'verified-owner-activation':null,
            save:layout=>{saves.push(layout);current={tinySwordsIsland:layout};return true}};
          window.activateProfile=()=>{current={tinySwordsIsland:${JSON.stringify(island).replaceAll('<', '\\u003c')}};dispatchEvent(new Event('edenia-profile-access'))};
          window.revokeProfile=()=>{current=null;dispatchEvent(new Event('edenia-profile-access'))};
          </script><script src="/tiny-swords-game/${release}/parent.js"></script>`)
        return
      }
      if (missingCompressed && /index\.(wasm|pck)\.br$/.test(path)) { res.writeHead(404).end(); return }
      const file = resolve(root, '.' + path)
      if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return }
      res.setHeader('Cache-Control', 'public,max-age=600')
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm' })[extname(file)] || 'application/octet-stream')
      const gzip = /index\.(wasm|pck)$/.test(path)
      if (gzip) res.setHeader('Content-Encoding', 'gzip')
      const body = await readFile(file + (gzip ? '.gz' : ''))
      res.setHeader('Content-Length', body.length)
      res.end(body)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(accept => server.listen(0, '127.0.0.1', accept))
  return { requests, island, url: `http://127.0.0.1:${server.address().port}/probe`,
    close: () => new Promise(accept => server.close(accept)) }
}

for (const missingCompressed of [false, true]) test(`assets preload before profile activation without opening or saving an island (fallback ${missingCompressed})`, async ({ page }) => {
  test.setTimeout(60000)
  const host = await hostGame({ missingCompressed })
  try {
    await page.goto(host.url)
    await expect.poll(() => host.requests.filter(path => /index\.(wasm|pck)\.br$/.test(path)).length).toBe(2)
    expect(await page.locator('iframe').count()).toBe(0)
    expect(await page.evaluate(() => window.saves)).toEqual([])
    await page.evaluate(() => window.activateProfile())
    await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 30000 })
    await expect.poll(() => page.evaluate(() => window.saves.length)).toBeGreaterThan(0)
    const saved = await page.evaluate(() => window.saves[0])
    expect(saved.tiles).toEqual(host.island.tiles)
    expect(saved.resources).toEqual(host.island.resources)
    if (!missingCompressed) {
      expect(host.requests.filter(path => /index\.wasm\.br$/.test(path))).toHaveLength(1)
      expect(host.requests.filter(path => /index\.pck\.br$/.test(path))).toHaveLength(1)
    }
    await page.evaluate(() => window.revokeProfile())
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate(() => window.current)).toBe(null)
  } finally { await page.goto('about:blank'); await host.close() }
})

// WebKit's nonpersistent test context can discard even a simple Cache API entry
// on navigation. Model regular visits with a disposable disk-backed profile,
// as the existing engine-delivery cache suite does. Private cold visits above
// still prove that each prefetched response is consumed exactly once.
test('regular repeat visits reuse the validated engine cache', async ({ playwright, browserName }, testInfo) => {
  test.setTimeout(60000)
  const host = await hostGame()
  const directory = await mkdtemp(resolve(tmpdir(), 'edenia-preload-cache-'))
  const context = await playwright[browserName].launchPersistentContext(directory, {
    headless: true, viewport: testInfo.project.use.viewport, serviceWorkers: 'block'
  })
  const page = await context.newPage()
  try {
    for (let visit = 0; visit < 2; visit++) {
      await page.goto(host.url)
      await page.evaluate(() => window.activateProfile())
      await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 30000 })
      expect(host.requests.filter(path => /index\.wasm\.br$/.test(path))).toHaveLength(1)
    }
  } finally {
    await context.close()
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
})


test('an inaccessible game frame retains progress and camera cursor recovery without page errors', async ({ page }, testInfo) => {
  test.skip(Boolean(testInfo.project.use.hasTouch), 'Desktop host camera cursor boundary')
  const host = await hostGame()
  const foreign = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><title>Inert cross-origin frame</title>')
  })
  await new Promise(accept => foreign.listen(0, '127.0.0.1', accept))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    // No engine handshake or restoration is fabricated by either inert peer.
    await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Inert game frame</title>'
    }))
    await page.goto(host.url)
    await page.evaluate(() => window.activateProfile())
    const frame = page.locator('.tiny-swords-frame')
    await expect(frame).toHaveCount(1)
    await expect.poll(() => frame.evaluate(node => node.contentWindow.location.href)).toContain('/tiny-swords-game/')
    const retained = await page.evaluate(() => structuredClone(window.current))
    await frame.evaluate((node, url) => new Promise(resolve => {
      node.addEventListener('load', resolve, { once: true })
      node.src = url
    }), 'http://127.0.0.1:' + foreign.address().port + '/')
    // Exercise the browser's actual same-origin boundary, not a mocked getter.
    expect(await frame.evaluate(node => {
      try { void node.contentWindow.edeniaCamera; return null }
      catch (error) { return error.name }
    })).toBe('SecurityError')
    await frame.evaluate(node => { node.style.width = '1053px' })
    await page.locator('.tiny-swords-camera-controls').dispatchEvent('pointerenter')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(errors).toEqual([])
    expect(await page.evaluate(() => window.current)).toEqual(retained)
    expect(await page.evaluate(() => window.saves)).toEqual([])
    await expect(page.locator('#tinySwordsSurface')).not.toHaveAttribute('data-game-state', 'ready')
    const recovered = new URL('/camera-peer', host.url).href
    await page.route(recovered, route => route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><script>window.edeniaCamera={width:1054}</script>' }))
    await frame.evaluate((node, url) => new Promise(resolve => {
      node.addEventListener('load', resolve, { once: true })
      node.src = url
    }), recovered)
    await page.locator('.tiny-swords-camera-controls').dispatchEvent('pointerenter')
    await expect.poll(() => page.locator('.tiny-swords-camera-controls').evaluate(node => node.style.getPropertyValue('--tiny-swords-camera-cursor'))).toContain('url(')
    expect(errors).toEqual([])
    expect(await page.evaluate(() => window.current)).toEqual(retained)
    expect(await page.evaluate(() => window.saves)).toEqual([])
    await expect(page.locator('#tinySwordsSurface')).not.toHaveAttribute('data-game-state', 'ready')
  } finally {
    try { await page.goto('about:blank') }
    finally { await Promise.all([host.close(), new Promise(accept => foreign.close(accept))]) }
  }
})
