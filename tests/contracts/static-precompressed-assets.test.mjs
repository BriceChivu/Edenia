import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { brotliCompressSync, brotliDecompressSync, gzipSync, gunzipSync } from 'node:zlib'
import test from 'node:test'

test('static assets negotiate precompression while retaining content type and bytes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edenia-compressed-assets-'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const body = Buffer.from('const example = "compressed delivery";\n'.repeat(80))
  await writeFile(resolve(root, 'example.js'), body)
  await writeFile(resolve(root, 'example.js.br'), brotliCompressSync(body))
  await writeFile(resolve(root, 'example.js.gz'), gzipSync(body))
  const enginePath = `/tiny-swords-engine/${'a'.repeat(64)}/index.wasm`
  await mkdir(resolve(root, '.' + enginePath, '..'), { recursive: true })
  await writeFile(resolve(root, '.' + enginePath), body)
  const child = spawn(process.execPath, ['scripts/serve-static.mjs', '--host', '127.0.0.1', '--port', String(port), '--root', root])
  try {
    await once(child.stdout, 'data')
    const get = (encoding, method = 'GET', path = '/example.js') => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method, headers: { 'Accept-Encoding': encoding } }, response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }))
      })
      req.on('error', reject)
      req.end()
    })
    for (const [accepted, expected] of [['gzip, br', 'br'], ['br;q=0.2, gzip;q=1', 'gzip'], ['br;q=0, gzip;q=0', undefined]]) {
      const result = await get(accepted)
      assert.equal(result.headers['content-encoding'], expected)
      assert.match(result.headers['content-type'], /^text\/javascript/)
      assert.equal(result.headers.vary, 'Accept-Encoding')
      assert.equal(result.headers['cache-control'], 'no-store')
      const decoded = expected === 'br' ? brotliDecompressSync(result.body) : expected === 'gzip' ? gunzipSync(result.body) : result.body
      assert.deepEqual(decoded, body)
    }
    const head = await get('br', 'HEAD')
    assert.equal(head.headers['content-encoding'], 'br')
    assert.equal(Number(head.headers['content-length']), brotliCompressSync(body).length)
    assert.equal(head.body.length, 0)
    const engine = await get('', 'HEAD', enginePath)
    assert.equal(engine.headers['cache-control'], 'public, max-age=31536000, immutable')
    // Artifact extraction can restore compressed variants before their source.
    // Immutable content-addressed assets must not depend on extraction order.
    const old = new Date('2000-01-01T00:00:00Z')
    for (const [encoding, suffix, compress, decompress] of [
      ['br', '.br', brotliCompressSync, brotliDecompressSync],
      ['gzip', '.gz', gzipSync, gunzipSync]
    ]) {
      const variant = resolve(root, '.' + enginePath + suffix)
      await writeFile(variant, compress(body))
      await utimes(variant, old, old)
      const encoded = await get(encoding, 'GET', enginePath)
      assert.equal(encoded.headers['content-encoding'], encoding)
      assert.deepEqual(decompress(encoded.body), body)
      assert.equal((await get(encoding, 'HEAD', enginePath)).headers['content-encoding'], encoding)
    }
    // Mutable development assets still reject stale compressed sidecars.
    await utimes(resolve(root, 'example.js.br'), old, old)
    const stale = await get('br')
    assert.equal(stale.headers['content-encoding'], undefined)
    assert.deepEqual(stale.body, body)
  } finally {
    const stopped = once(child, 'exit')
    child.kill('SIGTERM')
    await stopped
    await rm(root, { recursive: true, force: true })
  }
})
