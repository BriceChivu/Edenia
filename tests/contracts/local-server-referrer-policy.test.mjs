import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

async function withServer(host, run) {
  const root = await mkdtemp(join(tmpdir(), 'edenia-referrer-'))
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, host, resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Local GIS fixture</title>')
  const child = spawn(process.execPath, [
    'scripts/serve-static.mjs', '--host', host, '--port', String(port), '--root', root
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local server did not start')), 5000)
      child.once('error', error => { clearTimeout(timeout); reject(error) })
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('Local server exited')) })
      child.stdout.once('data', () => { clearTimeout(timeout); resolve() })
    })
    await run(`http://${host}:${port}`)
  } finally {
    child.kill()
    await exited
    await rm(root, { recursive: true, force: true })
  }
}

test('HTTP localhost pages send the referrer policy required by GIS', async () => {
  await withServer('localhost', async origin => {
    for (const route of ['/', '/?internal_test=1']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(origin + route, { method })
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer-when-downgrade')
        assert.equal(response.headers.get('cross-origin-opener-policy'), null)
        assert.equal(response.headers.get('content-security-policy'), null)
        await response.text()
      }
    }
  })
})

test('the localhost GIS policy is not added for another server host', async () => {
  await withServer('127.0.0.1', async origin => {
    const response = await fetch(origin)
    assert.equal(response.headers.get('referrer-policy'), null)
    await response.text()
  })
})
