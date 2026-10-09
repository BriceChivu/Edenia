import { createServer } from 'node:http'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, resolve, relative } from 'node:path'
import { test, expect } from '@playwright/test'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')

// Deliberately model GitHub Pages: explicit .br files are opaque bytes, and
// ordinary engine/pack URLs get gzip. No Playwright routes disable HTTP caching.
export async function deliveryHost(mode = 'brotli') {
  const root = resolve(process.env.EDENIA_TEST_SITE_ROOT || '_site')
  const [release] = await readdir(resolve(root, 'tiny-swords-game'))
  const second = 'b'.repeat(64)
  const requests = []
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/probe') {
        const game = url.searchParams.has('next') ? second : release
        res.setHeader('Content-Type', 'text/html')
        res.end(`<!doctype html><style>body{margin:0}iframe{width:1054px;height:454px;border:0}</style><iframe src="/tiny-swords-game/${game}/index.html"></iframe><script>
          window.addEventListener('message',e=>{
            if(e.origin!==location.origin||e.source!==document.querySelector('iframe').contentWindow)return;
            if(e.data.type==='edenia-game-progression')e.source.postMessage({type:'edenia-study-level',session:1,level:1,layout:null},location.origin);
            if(e.data.type==='edenia-tiny-restored')window.restored=e.data.accepted;
            if(e.data.type==='edenia-game-startup-failed')window.failed=true;
            if(e.data.type==='edenia-tiny-layout')e.source.postMessage({type:'edenia-tiny-saved',session:1,id:e.data.id,persisted:true},location.origin);
          });
        </script>`)
        return
      }
      const mapped = url.pathname.replace(`/tiny-swords-game/${second}/`, `/tiny-swords-game/${release}/`)
      const file = resolve(root, '.' + mapped)
      if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return }
      requests.push(url.pathname)
      if (mode === 'missing' && mapped.endsWith('.br')) { res.writeHead(404).end(); return }
      let bytes = await readFile(file)
      if (mode === 'storage-denied' && mapped.endsWith('/worker.js')) {
        bytes = Buffer.concat([Buffer.from(`Object.defineProperty(self,'caches',{value:{open:async()=>({match:async()=>undefined,put:async()=>{throw new DOMException('Synthetic quota failure','QuotaExceededError')}})}});\n`), bytes])
      }
      if (mode.startsWith('cache-stalled-') && mapped.endsWith('/worker.js')) {
        const operation = mode.slice('cache-stalled-'.length)
        bytes = Buffer.concat([Buffer.from(`
          const stall=name=>name===${JSON.stringify(operation)}?new Promise(()=>{}):undefined;
          Object.defineProperty(self,'caches',{value:{open:async()=>{
            await stall('open');
            return {match:async()=>stall('match'),put:async()=>stall('put'),
              keys:async()=>{await stall('keys');return [{url:'old-engine'}]},
              delete:async()=>{await stall('delete');return true}};
          }}});\n`), bytes])
      }
      if (mode === 'worker-silent' && mapped.endsWith('/worker.js')) bytes = Buffer.from('self.onmessage=()=>{}')
      if (mode === 'worker-stalled-stream' && mapped.endsWith('/worker.js')) {
        bytes = Buffer.concat([Buffer.from(`const report=self.postMessage.bind(self);self.postMessage=(message,...args)=>{report(message,...args);if(message.type==='ready')self.onmessage=()=>{}};\n`), bytes])
      }
      if (mode === 'fallback-stalled' && mapped.endsWith('/worker.js')) bytes = Buffer.from('self.onmessage=()=>{}')
      if (mode === 'fallback-stalled' && /\/index\.(wasm|pck)$/.test(mapped)) return
      if (/\/index\.(wasm|pck)$/.test(mapped)) {
        bytes = await readFile(file + '.gz')
        res.setHeader('Content-Encoding', 'gzip')
      }
      if (mode === 'truncated' && mapped.endsWith('index.wasm.br')) bytes = bytes.subarray(0, Math.floor(bytes.length / 2))
      if (mode === 'http-brotli' && mapped.endsWith('.br')) res.setHeader('Content-Encoding', 'br')
      res.setHeader('Cache-Control', /\/tiny-swords-(engine|decoder)\//.test(mapped) ? 'public, max-age=600' : 'no-store')
      res.setHeader('Content-Type', ({ '.js':'text/javascript', '.wasm':'application/wasm', '.html':'text/html', '.png':'image/png' })[extname(file)] || 'application/octet-stream')
      res.setHeader('Content-Length', bytes.length)
      res.end(bytes)
    } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url:`http://127.0.0.1:${server.address().port}/probe`, requests, close:()=>new Promise(resolve=>server.close(resolve)) }
}

test('Brotli works on Pages-style hosting and an updated game reuses its engine cache', async ({ playwright, browserName }, testInfo) => {
  test.setTimeout(60000)
  const host = await deliveryHost()
  // Private contexts impose different large-response cache limits. Exercise a
  // disposable disk-backed profile, as ordinary visits use, with no route mocks.
  const profile = await mkdtemp(resolve(tmpdir(), 'edenia-engine-cache-'))
  const context = await playwright[browserName].launchPersistentContext(profile, {
    headless: true, viewport: testInfo.project.use.viewport
  })
  const page = await context.newPage()
  try {
    await page.goto(host.url)
    await page.waitForFunction(()=>window.restored===true)
    const first = host.requests.filter(p=>/\/tiny-swords-engine\/.+\/index.wasm.br$/.test(p))
    expect(first).toHaveLength(1)
    expect(host.requests.some(p=>/\/index\.(wasm|pck)$/.test(p))).toBe(false)
    const cached = await page.evaluate(async()=> (await (await caches.open('edenia-tiny-swords-engine-v1')).keys()).map(r=>r.url))
    expect(cached).toHaveLength(1)
    expect(cached[0]).toContain('/tiny-swords-engine/')
    await page.goto(host.url + '?next')
    await page.waitForFunction(()=>window.restored===true)
    expect(host.requests.filter(p=>/\/tiny-swords-engine\/.+\/index.wasm.br$/.test(p))).toEqual(first)
    expect(await page.evaluate(async()=> (await (await caches.open('edenia-tiny-swords-engine-v1')).keys()).length)).toBe(1)
  } finally { await context.close(); await host.close(); await rm(profile, { recursive:true, force:true }) }
})

test('missing Brotli artifacts fall back to gzip and restore the island', async ({ page }) => {
  test.setTimeout(60000)
  const host = await deliveryHost('missing')
  try {
    await page.goto(host.url)
    await page.waitForFunction(()=>window.restored===true)
    expect(host.requests.filter(p=>p.endsWith('/index.wasm'))).toHaveLength(1)
    expect(host.requests.filter(p=>p.endsWith('/index.pck'))).toHaveLength(1)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('HTTP-decoded Brotli assets are not decoded twice', async ({ page }) => {
  test.setTimeout(60000)
  const host = await deliveryHost('http-brotli')
  try {
    await page.goto(host.url)
    await page.waitForFunction(()=>window.restored===true)
    expect(host.requests.some(p=>/\/index\.(wasm|pck)$/.test(p))).toBe(false)
    expect(host.requests.some(p=>p.endsWith('/decoder.wasm'))).toBe(false)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('unavailable workers retain gzip startup', async ({ page }) => {
  test.setTimeout(60000)
  const host = await deliveryHost()
  try {
    await page.addInitScript(()=>{window.Worker=undefined})
    await page.goto(host.url)
    await page.waitForFunction(()=>window.restored===true)
    expect(host.requests.some(p=>p.endsWith('.br'))).toBe(false)
    expect(host.requests.filter(p=>p.endsWith('/index.wasm'))).toHaveLength(1)
  } finally { await page.goto('about:blank'); await host.close() }
})

test('asset cache quota failure does not prevent Brotli startup', async ({ page }) => {
  test.setTimeout(60000)
  const host = await deliveryHost('storage-denied')
  try {
    await page.goto(host.url)
    await page.waitForFunction(()=>window.restored===true)
    expect(host.requests.some(p=>/\/index\.(wasm|pck)$/.test(p))).toBe(false)
  } finally { await page.goto('about:blank'); await host.close() }
})

for (const operation of ['open', 'match', 'put', 'keys', 'delete']) {
  test(`stalled engine cache ${operation} still restores the island`, async ({ page }) => {
    const host = await deliveryHost(`cache-stalled-${operation}`)
    try {
      await page.goto(host.url)
      await page.waitForFunction(() => window.restored === true, null, { timeout: 10000 })
      expect(host.requests.some(p => /\/index\.(wasm|pck)$/.test(p))).toBe(false)
      expect(await page.evaluate(() => window.failed)).toBeUndefined()
    } finally { await page.goto('about:blank'); await host.close() }
  })
}

for (const mode of ['worker-silent', 'worker-stalled-stream']) {
  test(`${mode} recovers through ordinary delivery and restores the island`, async ({ page }) => {
    test.setTimeout(60000)
    const host = await deliveryHost(mode)
    try {
      await page.goto(host.url)
      await page.waitForFunction(() => window.restored === true, null, { timeout: 45000 })
      expect(host.requests.filter(p => p.endsWith('/index.wasm'))).toHaveLength(1)
      expect(host.requests.filter(p => p.endsWith('/index.pck'))).toHaveLength(1)
      expect(await page.evaluate(() => window.failed)).toBeUndefined()
    } finally { await page.goto('about:blank'); await host.close() }
  })
}

test('a stalled ordinary fallback reports startup failure instead of waiting forever', async ({ page }) => {
  test.setTimeout(60000)
  const host = await deliveryHost('fallback-stalled')
  try {
    await page.goto(host.url)
    await page.waitForFunction(() => window.failed === true, null, { timeout: 45000 })
    expect(await page.evaluate(() => window.restored)).toBeUndefined()
  } finally { await page.goto('about:blank'); await host.close() }
})

test('a truncated compressed stream reports startup failure instead of hanging', async ({ page }) => {
  test.setTimeout(60000)
  const host = await deliveryHost('truncated')
  try {
    await page.goto(host.url)
    await page.waitForFunction(()=>window.failed===true)
    expect(await page.evaluate(()=>window.restored)).toBeUndefined()
    expect(await page.evaluate(async()=> (await (await caches.open('edenia-tiny-swords-engine-v1')).keys()).length)).toBe(0)
  } finally { await page.goto('about:blank'); await host.close() }
})
