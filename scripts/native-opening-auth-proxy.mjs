import { sanitizeNativeAuthenticationDiagnostic, nativeUpstreamFailure } from './native-opening-auth-diagnostics.mjs'
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { createHash } from 'node:crypto'
import { validateNativeAuthLeaf } from './native-auth-leaf-certificate.mjs'
import { createNativeOpeningAuthenticationPolicy } from './native-opening-auth-policy.mjs'

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

// A loopback listener is not containment by itself. The owning process must
// independently watch the same execution lease and call seal() on revocation.
// Local tests may substitute only TLS-verified loopback upstreams. They never
// prove native-browser egress, production challenge acceptance or ownership.
export async function createNativeOpeningAuthenticationProxy({ applicationOrigin, providerOrigin, expectedEmail,
  expectedOwner, certificates, onProgress = () => {}, authorize = async () => false, onSession = async () => {},
  deadlineMs = 300000, expectedRuntimeHash, assetIdentity, localTestUpstreams = null, localChallengeOrigin, listenPort = 0 }) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(expectedOwner || '')
    || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 300000
    || typeof authorize !== 'function' || typeof onSession !== 'function') throw new Error('Invalid native authentication guard')
  if ((!localTestUpstreams && (localChallengeOrigin || listenPort !== 0))
    || !Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) throw new Error('Local fixture controls unavailable for live transport')
  const policy = createNativeOpeningAuthenticationPolicy({ applicationOrigin, providerOrigin, expectedEmail, localChallengeOrigin })
  if (!localTestUpstreams && (!/^[a-f0-9]{64}$/u.test(expectedRuntimeHash || '')
    || !/^[a-f0-9]{12}$/u.test(assetIdentity?.version || '') || !/^[a-f0-9]{64}$/u.test(assetIdentity?.sha256 || '')))
    throw new Error('Native authentication requires deployment identity')
  const authorities = new Map(), sockets = new Set(), upstreams = new Set()
  const stats = { forwarded: 0, denied: 0, ownerVerified: false, sealed: false, localOnly: Boolean(localTestUpstreams), diagnostic: sanitizeNativeAuthenticationDiagnostic() }
  let pending = Promise.resolve(), stopped = false, sessionDelivered = false
  const started = performance.now()
  const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) }
  const report = update => {
    stats.diagnostic = sanitizeNativeAuthenticationDiagnostic({ ...stats.diagnostic, ...update })
    try { onProgress({ ...stats.diagnostic }) } catch { seal('progress-callback') }
  }
  const seal = (failure = null) => {
    if (stopped) return
    stopped = true; stats.sealed = true; policy.seal()
    if (failure && !stats.diagnostic.failure) stats.diagnostic.failure = failure
    for (const request of upstreams) request.destroy()
    for (const socket of sockets) socket.destroy()
    report({})
  }
  const permitted = async kind => {
    if (stopped || performance.now() - started >= deadlineMs) { seal('deadline'); return false }
    try { if (await authorize(kind) !== true || stopped || performance.now() - started >= deadlineMs) { seal('authorization-denied'); return false } }
    catch { seal('authorization-denied'); return false }
    return true
  }
  const deny = res => {
    stats.denied++
    if (!res.destroyed && !res.headersSent) {
      res.writeHead(403, { 'content-type': 'text/plain', 'connection': 'close', 'cache-control': 'no-store' })
      res.end('Denied by the local authentication guard')
    }
  }
  const fetchUpstream = async ({ origin, path, method, headers, body, kind }) => {
    if (!await permitted(kind)) throw new Error('Native dispatch denied')
    const test = localTestUpstreams?.[origin]
    const target = new URL(origin)
    const options = { hostname: target.hostname, port: 443, servername: target.hostname }
    if (localTestUpstreams) {
      if (!test || test.hostname !== '127.0.0.1' || !Number.isInteger(test.port) || test.port < 1 || test.port > 65535
        || test.servername !== 'localhost' || !test.ca) throw new Error('Local upstream must be verified loopback TLS')
      Object.assign(options, { hostname: '127.0.0.1', port: test.port, servername: test.servername, ca: test.ca })
    }
    const forwardedHeaders = {}
    for (const [name, value] of Object.entries(headers))
      if (!HOP_HEADERS.has(name) && !['host', 'content-length', 'accept-encoding'].includes(name)) forwardedHeaders[name] = value
    forwardedHeaders.host = target.hostname
    forwardedHeaders['accept-encoding'] = 'identity'
    if (body) forwardedHeaders['content-length'] = Buffer.byteLength(body)
    return await new Promise((resolve, reject) => {
      // No async gap between the final authorization and dispatch. Every new
      // request reserves its policy budget before arriving here.
      if (stopped) { reject(new Error('Native dispatch sealed')); return }
      const request = https.request({ ...options, method, path, headers: forwardedHeaders, agent: false,
        maxHeaderSize: 16384 }, response => {
        const chunks = []; let bytes = 0
        response.on('data', chunk => {
          bytes += chunk.length
          if (bytes > 12 * 1024 * 1024) { seal('response-bound'); response.destroy(); request.destroy(); reject(new Error('Native response bound')); return }
          chunks.push(chunk)
        })
        response.on('error', error => { seal(nativeUpstreamFailure(error)); reject(error) })
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }))
      })
      upstreams.add(request); request.once('close', () => upstreams.delete(request))
      request.on('error', error => { seal(nativeUpstreamFailure(error)); reject(error) }); request.setTimeout(10000, () => { seal('upstream-timeout'); request.destroy(new Error('Native upstream timeout')) })
      stats.forwarded++; request.end(body)
    })
  }
  for (const origin of policy.origins) {
    const hostname = new URL(origin).hostname
    const material = certificates?.[origin]
    if (!material?.cert || !material.key) throw new Error('Missing native leaf certificate')
    validateNativeAuthLeaf(material, hostname)
    const context = tls.createSecureContext({ cert: material.cert, key: material.key })
    const secure = https.createServer({ cert: material.cert, key: material.key, maxHeaderSize: 16384,
      ALPNProtocols: ['http/1.1'], SNICallback: (name, callback) => name === hostname ? callback(null, context) : callback(new Error('Native SNI rejected')) }, (req, res) => {
      // Serialize policy classification and dispatch, including OTP budgets.
      // Bound idle/body time so an incomplete request cannot occupy the queue.
      req.setTimeout(5000, () => req.destroy())
      pending = pending.then(async () => {
        if (stopped) return deny(res)
        if (req.socket.servername !== hostname || ![hostname, hostname + ':443'].includes(req.headers.host)
          || req.headers.upgrade || req.headers['transfer-encoding'] || req.headers.expect
          || req.headers.connection?.toLowerCase().split(',').some(h => !['close', 'keep-alive'].includes(h.trim()))) return deny(res)
        const bodyParts = []; let bytes = 0
        for await (const part of req) {
          bytes += part.length
          if (bytes > 8192) { deny(res); return }
          bodyParts.push(part)
        }
        const body = Buffer.concat(bodyParts).toString('utf8')
        const decision = policy.classify({ origin, path: req.url, method: req.method,
          destination: req.headers['sec-fetch-dest'], body, corsOrigin: req.headers.origin,
          corsMethod: req.headers['access-control-request-method'], corsHeaders: req.headers['access-control-request-headers'] })
        if (decision.kind === 'deny') return deny(res)
        if (decision.kind === 'preflight') {
          if (!await permitted('preflight')) return
          res.writeHead(204, { 'access-control-allow-origin': applicationOrigin, 'access-control-allow-methods': decision.method,
            'access-control-allow-headers': decision.headers, 'access-control-max-age': '0', 'cache-control': 'no-store', 'vary': 'Origin' })
          res.end(); return
        }
        const response = await fetchUpstream({ origin, path: req.url, method: req.method, headers: req.headers,
          body: decision.body ?? body, kind: decision.kind })
        if (stopped) return
        if (response.status >= 300 && response.status < 400) { deny(res); seal('response-redirect'); return }
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { seal('response-encoding'); return }
        if (origin === applicationOrigin && expectedRuntimeHash && req.url.split('?')[0] === '/config.local.js'
          && (response.status !== 200 || hash(response.body) !== expectedRuntimeHash)) { seal('deployment-mismatch'); return }
        if (origin === applicationOrigin && assetIdentity && req.url.split('?')[0] === '/app.js'
          && (req.url !== '/app.js?v=' + assetIdentity.version || response.status !== 200 || hash(response.body) !== assetIdentity.sha256)) { seal('deployment-mismatch'); return }
        const document = origin === applicationOrigin && req.url === '/?internal_test=1' && req.headers['sec-fetch-dest'] === 'document'
        if (document && (response.status !== 200 || response.body.length === 0
          || !/^text\/html(?:;|$)/iu.test(response.headers['content-type'] || ''))) {
          seal('document-response'); return
        }
        let session = null
        if (decision.kind === 'email-code-verify' && response.status === 200) {
          const parsed = JSON.parse(response.body.toString('utf8'))
          if (typeof parsed.access_token !== 'string' || typeof parsed.refresh_token !== 'string'
            || parsed.user?.id !== expectedOwner || sessionDelivered) { seal('owner-verification'); return }
          const read = policy.classify({ origin: providerOrigin, path: '/auth/v1/user', method: 'GET', destination: 'empty' })
          if (read.kind !== 'user-read') { seal('owner-verification'); return }
          const verified = await fetchUpstream({ origin: providerOrigin, path: '/auth/v1/user', method: 'GET', kind: 'user-read',
            headers: { apikey: req.headers.apikey, authorization: 'Bearer ' + parsed.access_token }, body: '' })
          if (verified.status !== 200 || JSON.parse(verified.body.toString('utf8')).id !== expectedOwner) { seal('owner-verification'); return }
          if (!await permitted('session-acceptance')) return
          stats.ownerVerified = true; sessionDelivered = true
          session = { ...parsed, expires_at: parsed.expires_at ?? Math.floor(Date.now() / 1000) + parsed.expires_in }
        }
        const headers = {}
        for (const [name, value] of Object.entries(response.headers)) if (!HOP_HEADERS.has(name) && name !== 'content-length') headers[name] = value
        headers['cache-control'] = 'no-store'
        // Independent CSP composes with the server's existing policy. A fresh
        // profile has no cached worker; neither registration nor worker code
        // may gain a transport outside this guard.
        headers['content-security-policy'] = [...[response.headers['content-security-policy']].flat().filter(Boolean), "worker-src 'none'; object-src 'none'"]
        if (document) res.once('finish', () => {
          if (!stopped) report({ documentDelivered: true })
        })
        res.writeHead(response.status, headers); res.end(response.body)
        if (session) await onSession(session)
      }).catch(() => seal('request-processing'))
    })
    secure.requestTimeout = 5000; secure.headersTimeout = 5000
    secure.on('secureConnection', track); secure.on('tlsClientError', () => report({ connectionFailure: 'client-tls' }))
    secure.on('clientError', (_error, socket) => { report({ connectionFailure: 'client-http' }); socket.destroy() })
    secure.on('upgrade', (_req, socket) => { stats.denied++; socket.destroy() })
    secure.on('checkContinue', (_req, res) => deny(res))
    authorities.set(hostname + ':443', secure)
  }
  const server = http.createServer({ maxHeaderSize: 8192 }, (_req, res) => deny(res))
  server.on('connection', socket => { track(socket); socket.setTimeout(15000, () => socket.destroy()); if (stopped || sockets.size > 32) socket.destroy() })
  server.on('clientError', (_error, socket) => { report({ connectionFailure: 'client-http' }); socket.destroy() })
  server.on('upgrade', (_req, socket) => { stats.denied++; socket.destroy() })
  server.on('connect', (req, socket, head) => {
    const secure = authorities.get(req.url)
    if (stopped || !secure || req.headers.host !== req.url || head.length || req.headers['transfer-encoding']
      || req.headers['content-length'] || req.headers.upgrade) { stats.denied++; report({ connectionFailure: 'connect-rejected' }); socket.destroy(); return }
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); secure.emit('connection', socket)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, '127.0.0.1', resolve) })
  const timer = setTimeout(() => seal('deadline'), deadlineMs)
  return { port: server.address().port, stats, seal, async close() {
    clearTimeout(timer); seal(); await new Promise(resolve => server.close(resolve)); await pending.catch(() => {})
  } }
}
