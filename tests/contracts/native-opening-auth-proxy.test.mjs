import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { X509Certificate, createHash } from 'node:crypto'
import https from 'node:https'
import http from 'node:http'
import tls from 'node:tls'
import { createNativeOpeningAuthenticationProxy } from '../../scripts/native-opening-auth-proxy.mjs'
const applicationOrigin = 'https://app.example.invalid', providerOrigin = 'https://provider.example.invalid', challengeOrigin = 'https://challenges.cloudflare.com'
const owner = '11111111-1111-1111-1111-111111111111', email = 'approved@example.invalid'
const otp = JSON.stringify({ email, data: { edenia_auth_locale: 'en' }, create_user: true, gotrue_meta_security: { captcha_token: 'synthetic' }, code_challenge: 'a'.repeat(43), code_challenge_method: 's256' })
const verify = JSON.stringify({ email, token: '123456', type: 'email', gotrue_meta_security: {} })
let material
async function fixture(t, options = {}) {
  if (!material) {
    const dir = await mkdtemp(join(tmpdir(), 'native-auth-proxy-'))
    try {
      material = {}
      for (const origin of [applicationOrigin, providerOrigin, challengeOrigin, 'https://localhost']) {
        const hostname = new URL(origin).hostname, keyFile = join(dir, hostname + '.key'), certFile = join(dir, hostname + '.crt')
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1',
          '-subj', '/CN=' + hostname, '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'subjectAltName=DNS:' + hostname, '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment', '-addext', 'extendedKeyUsage=serverAuth'], { stdio: 'ignore' })
        const cert = await readFile(certFile), key = await readFile(keyFile)
        material[origin] = { cert, key, sha256: createHash('sha256').update(new X509Certificate(cert).raw).digest('hex') }
      }
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
  const observed = [], sessions = []
  let allowed = true
  const upstream = https.createServer(material['https://localhost'], async (req, res) => {
    let body = ''; for await (const part of req) body += part
    observed.push({ path: req.url, body, host: req.headers.host })
    if (options.onRequest) { await options.onRequest(req, res); if (res.destroyed) return }
    if (options.redirect) { res.writeHead(302, { location: providerOrigin + '/rest/v1/rpc/forbidden' }); res.end(); return }
    if (req.url === '/auth/v1/verify') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, user: { id: owner } })); return
    }
    if (req.url === '/auth/v1/user') { res.end(JSON.stringify({ id: options.wrongVerifiedOwner ? '22222222-2222-2222-2222-222222222222' : owner })); return }
    res.end('{}')
  })
  t.after(async () => { await new Promise(resolve => { upstream.close(resolve); upstream.closeAllConnections() }) })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const localTestUpstreams = Object.fromEntries([applicationOrigin, providerOrigin, challengeOrigin].map(origin => [origin,
    { hostname: '127.0.0.1', port: upstream.address().port, servername: 'localhost', ca: material['https://localhost'].cert }]))
  const proxy = await createNativeOpeningAuthenticationProxy({ applicationOrigin, providerOrigin, expectedEmail: email, expectedOwner: owner,
    certificates: material, localTestUpstreams, authorize: async kind => { if (options.beforeAuthorize) await options.beforeAuthorize(kind); return allowed }, onSession: async session => sessions.push(session), deadlineMs: options.deadlineMs ?? 5000 })
  t.after(async () => { await proxy.close() })
  const send = ({ origin = providerOrigin, path = '/auth/v1/otp', body = otp, method = 'POST', destination = 'empty', headers = {}, connectHost, sni, trust = true, raw }) => new Promise(resolve => {
    let done = false
    const finish = value => { if (!done) { done = true; resolve(value) } }
    const hostname = new URL(origin).hostname, authority = connectHost || hostname + ':443'
    const request = http.request({ hostname: '127.0.0.1', port: proxy.port, method: 'CONNECT', path: authority, headers: { host: authority } })
    request.on('connect', (_res, socket) => {
      const stream = tls.connect({ socket, servername: sni || hostname, ...(trust ? { ca: material[origin].cert } : {}) }, () => {
        stream.write(raw || `${method} ${path} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\nSec-Fetch-Dest: ${destination}\r\nApikey: synthetic-key\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n${body}`)
      })
      let out = ''; stream.on('data', chunk => { out += chunk }); stream.on('close', () => finish(out || 'closed')); stream.on('error', () => finish('closed'))
      stream.setTimeout(3000, () => { stream.destroy(); finish('timeout') })
    })
    request.on('error', () => finish('closed')); request.end()
  })
  return { proxy, observed, sessions, send, revoke() { allowed = false } }
}
test('native proxy forwards constrained OTP and independently verifies the accepted owner', async t => {
  const f = await fixture(t)
  assert.match(await f.send({}), /200 OK/)
  assert.equal(JSON.parse(f.observed[0].body).create_user, false)
  assert.match(await f.send({ path: '/auth/v1/verify', body: verify }), /200 OK/)
  assert.deepEqual(f.observed.map(r => r.path), ['/auth/v1/otp', '/auth/v1/verify', '/auth/v1/user'])
  assert.equal(f.proxy.stats.ownerVerified, true); assert.equal(f.sessions.length, 1); assert.equal(f.sessions[0].user.id, owner)
  assert.equal(JSON.stringify(f.proxy.stats).includes('synthetic-access'), false)
})
test('server owner mismatch seals before accepting the session', async t => {
  const f = await fixture(t, { wrongVerifiedOwner: true }); await f.send({})
  assert.equal(await f.send({ path: '/auth/v1/verify', body: verify }), 'closed')
  assert.equal(f.proxy.stats.sealed, true); assert.equal(f.sessions.length, 0)
})
test('cross-origin preflight is local, profile preflight remains denied', async t => {
  const f = await fixture(t)
  const headers = { Origin: applicationOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,content-type' }
  assert.match(await f.send({ method: 'OPTIONS', body: '', headers }), /204 No Content/)
  assert.match(await f.send({ path: '/rest/v1/rpc/resolve_my_learner_profile', method: 'OPTIONS', body: '', headers }), /403 Forbidden/)
  assert.equal(f.observed.length, 0)
})
test('native proxy denies public document, profile mutations, service workers and foreign CONNECT hosts', async t => {
  const f = await fixture(t)
  assert.match(await f.send({ origin: applicationOrigin, path: '/', method: 'GET', destination: 'document', body: '' }), /403 Forbidden/)
  assert.match(await f.send({ path: '/rest/v1/rpc/resolve_my_learner_profile' }), /403 Forbidden/)
  assert.match(await f.send({ origin: applicationOrigin, path: '/sw.js', method: 'GET', destination: 'serviceworker', body: '' }), /403 Forbidden/)
  assert.equal(await f.send({ connectHost: 'evil.invalid:443' }), 'closed'); assert.equal(f.observed.length, 0)
})
test('concurrent requests cannot exceed the email delivery budget', async t => {
  const f = await fixture(t); await Promise.all([f.send({}), f.send({}), f.send({})]); assert.equal(f.observed.length, 1)
})
test('untrusted leaf and SNI mismatch fail before upstream', async t => {
  const f = await fixture(t); assert.equal(await f.send({ trust: false }), 'closed')
  assert.equal(await f.send({ sni: 'evil.invalid' }), 'closed'); assert.equal(f.observed.length, 0)
})
test('revoked authorization and deadline both prevent upstream requests', async t => {
  const f = await fixture(t); f.revoke(); assert.equal(await f.send({}), 'closed'); assert.equal(f.observed.length, 0)
  const expired = await fixture(t, { deadlineMs: 1 }); await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(await expired.send({}), 'closed'); assert.equal(expired.observed.length, 0)
})
test('provider redirects are never followed', async t => {
  const f = await fixture(t, { redirect: true }); await f.send({}); assert.equal(f.observed.length, 1); assert.equal(f.proxy.stats.sealed, true)
})
test('conflicting Content-Length headers fail parser validation', async t => {
  const f = await fixture(t)
  assert.equal(await f.send({ raw: 'POST /auth/v1/otp HTTP/1.1\r\nHost: provider.example.invalid\r\nContent-Length: 0\r\nContent-Length: 1\r\n\r\nx' }), 'closed')
  assert.equal(f.observed.length, 0)
})

test('live proxy cannot select fixture hostname or listen-port controls', async () => {
  const config = { applicationOrigin, providerOrigin, expectedEmail: email, expectedOwner: owner, certificates: {},
    expectedRuntimeHash: 'a'.repeat(64), assetIdentity: { version: 'b'.repeat(12), sha256: 'c'.repeat(64) } }
  await assert.rejects(createNativeOpeningAuthenticationProxy({ ...config, localChallengeOrigin: 'https://challenge.example.invalid' }), /Local fixture controls unavailable/)
  await assert.rejects(createNativeOpeningAuthenticationProxy({ ...config, listenPort: 443 }), /Local fixture controls unavailable/)
})


test('revocation cancels an in-flight response and prevents queued dispatch', async t => {
  const arrived = Promise.withResolvers(), release = Promise.withResolvers()
  const f = await fixture(t, { onRequest: async () => { arrived.resolve(); await release.promise } })
  const first = f.send({ origin: applicationOrigin, path: '/first.js', method: 'GET', body: '' })
  await arrived.promise
  const queued = f.send({ origin: applicationOrigin, path: '/second.js', method: 'GET', body: '' })
  f.revoke(); f.proxy.seal(); release.resolve()
  await Promise.all([first, queued])
  assert.deepEqual(f.observed.map(row => row.path), ['/first.js'])
  assert.equal(f.sessions.length, 0)
  assert.equal(f.proxy.stats.sealed, true)
})

test('revocation while authorization is pending prevents its upstream dispatch', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const f = await fixture(t, { beforeAuthorize: async () => { entered.resolve(); await release.promise } })
  const request = f.send({})
  await entered.promise
  f.revoke(); release.resolve()
  assert.equal(await request, 'closed')
  assert.equal(f.observed.length, 0)
  assert.equal(f.sessions.length, 0)
})
