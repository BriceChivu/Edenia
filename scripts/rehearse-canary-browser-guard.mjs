import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { createCanaryOperationGuard } from './canary-operation-guard.mjs'

// Disposable installed-Chrome contexts and loopback requests only. No user
// browser profiles, auth sessions, provider URLs or hosted targets are accepted.
if (process.argv.length !== 2) throw new Error('Local browser rehearsal accepts no target arguments')
const counts = { resolve: 0, forbidden: 0 }
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Local request guard rehearsal</title>
<button id="resolve">Resolve synthetic fixture</button><button id="forbidden">Attempt forbidden operation</button><output id="result">ready</output>
<script>
for (const id of ['resolve', 'forbidden']) document.getElementById(id).onclick = async () => {
  const output = document.getElementById('result'); output.textContent = 'pending';
  try { await fetch('/' + id, { method: 'POST' }); output.textContent = 'completed'; }
  catch { output.textContent = 'blocked'; }
};
</script></html>`
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
    response.end(html)
  } else if (request.method === 'POST' && ['/resolve', '/forbidden'].includes(request.url)) {
    counts[request.url.slice(1)] += 1
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('{}')
  } else { response.writeHead(404); response.end() }
})
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
const base = `http://127.0.0.1:${server.address().port}`
let browser
const observations = []
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const exerciseViolation of [false, true]) {
    const guard = createCanaryOperationGuard({
      startedAt: Date.now(), timeoutMs: 30000,
      rules: [
        { id: 'document', method: 'GET', url: base + '/', expected: 1 },
        { id: 'resolve', method: 'POST', url: base + '/resolve', expected: exerciseViolation ? 2 : 1 }
      ]
    })
    const context = await browser.newContext({ serviceWorkers: 'block' })
    try {
      await context.route('**/*', async route => {
        const request = route.request()
        if (guard.allow({ method: request.method(), url: request.url() })) await route.continue()
        else await route.abort('blockedbyclient')
      })
      await context.routeWebSocket('**/*', socket => { guard.abort(); socket.close() })
      const page = await context.newPage()
      page.setDefaultTimeout(5000)
      await page.goto(base + '/')
      await page.getByRole('button', { name: 'Resolve synthetic fixture' }).click()
      await page.getByText('completed', { exact: true }).waitFor()
      if (exerciseViolation) {
        await page.getByRole('button', { name: 'Attempt forbidden operation' }).click()
        await page.getByText('blocked', { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Resolve synthetic fixture' }).click()
        await page.getByText('blocked', { exact: true }).waitFor()
      }
      const result = guard.finish()
      assert.equal(result.complete, !exerciseViolation)
      assert.equal(result.counts.resolve, 1)
      assert.equal(counts.forbidden, 0)
      observations.push({ scenario: exerciseViolation ? 'unexpected-operation-stops-dispatch' : 'exact-budget', assertionsPassed: true, counts: result.counts })
    } finally { await context.close() }
  }
  assert.equal(counts.resolve, 2)
  console.log(JSON.stringify({ evidenceKind: 'local-synthetic-installed-chrome', browserVersion: browser.version(), observations, forbiddenServerRequests: counts.forbidden, hostedOperations: 0 }))
} finally {
  try { await browser?.close() } finally { await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())) }
}
