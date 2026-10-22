import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
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
    if (!missingCompressed) {
      await page.goto(host.url)
      await page.evaluate(() => window.activateProfile())
      await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 30000 })
      expect(host.requests.filter(path => /index\.wasm\.br$/.test(path))).toHaveLength(1)
    }
  } finally { await page.goto('about:blank'); await host.close() }
})
