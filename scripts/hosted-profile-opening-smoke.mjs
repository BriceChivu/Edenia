import { createCanaryOperationGuard } from './canary-operation-guard.mjs'

export const OPENING_URL = 'https://www.edenia.study/?internal_test=1'
const PHASES = new Set(['activation', 'reload', 'injected-failure', 'retry'])
// These application reads do not choose, restore, or commit learner state.
const READS = new Set(['read_my_latest_learner_profile_reset'])

export function createOpeningPolicy({ providerOrigin, now = Date.now }) {
  const provider = new URL(providerOrigin)
  if (provider.origin !== providerOrigin || provider.protocol !== 'https:') throw new Error('Invalid opening provider')
  let active = null
  let failed = false
  let phaseName = null
  let reads = 0
  let unauthorized = 0
  let ancillaryBlocked = 0
  let rejectionReason = null
  const deny = (reason = 'unclassified-or-out-of-phase') => { failed = true; rejectionReason ||= reason; unauthorized += 1; active?.abort(); return 'deny' }
  return {
    beginPhase(name) {
      if (failed || active || !PHASES.has(name)) throw new Error('Opening phase is not available')
      phaseName = name
      reads = 0
      ancillaryBlocked = 0
      active = createCanaryOperationGuard({ startedAt: now(), timeoutMs: 300000, now,
        rules: [{ id: 'resolve', method: 'POST', url: providerOrigin + '/rest/v1/rpc/resolve_my_learner_profile', expected: 1 }] })
    },
    classify({ method, url, body }) {
      if (failed || !active) return deny()
      let target
      try { target = new URL(url) } catch { return deny() }
      if (target.origin !== providerOrigin || target.hash || target.username || target.password) return deny()
      const ancillary = (method === 'POST' && !target.search
        && target.pathname === '/rest/v1/rpc/sync_my_reminder_eligibility_snapshot')
        || (method === 'GET' && ['/rest/v1/reminder_preferences', '/rest/v1/subscriptions'].includes(target.pathname)
          && [...target.searchParams.keys()].every(key => ['select', 'user_id'].includes(key)))
      if (ancillary) {
        if (ancillaryBlocked >= 6) return deny('ancillary-budget')
        ancillaryBlocked += 1
        return 'ancillary-block'
      }
      if (method === 'POST' && target.pathname === '/rest/v1/rpc/resolve_my_learner_profile' && !target.search) {
        // Compare parsed shape AND reject duplicate JSON keys by requiring the
        // SDK's canonical single-field body after whitespace normalization.
        let payload
        try { payload = JSON.parse(body) } catch { return deny() }
        if (!payload || Array.isArray(payload) || Object.keys(payload).length !== 1
          || !Object.hasOwn(payload, 'p_onboarding_profile') || payload.p_onboarding_profile !== null
          || typeof body !== 'string' || body.replace(/\s/gu, '') !== '{"p_onboarding_profile":null}') return deny()
        return active.allow({ method, url }) ? 'resolve' : deny()
      }
      if (method === 'POST' && !target.search && target.pathname.startsWith('/rest/v1/rpc/')
        && READS.has(target.pathname.slice('/rest/v1/rpc/'.length))
        && (body === undefined || body === null || body === '' || body === '{}') && reads < 1) {
        reads += 1
        return 'read'
      }
      if (method === 'GET' && target.pathname === '/auth/v1/user' && !target.search) return 'auth-read'
      return deny()
    },
    fail: deny,
    finishPhase() {
      if (!active) throw new Error('No opening phase')
      const result = active.finish()
      active = null
      failed ||= !result.complete
      return { phase: phaseName, complete: !failed, resolve: result.counts.resolve, read: reads, unauthorized, ancillaryBlocked, rejectionReason }
    }
  }
}

// Call only on a newly created disposable context, with this exact options
// object also passed to browser.newContext. Register before creating any page.
// Synthetic provider responses never leave the browser. Live resolver responses
// pass through unchanged; caller must first arm reviewed lease/containment and
// verify the same owner's valid head using canary-profile-verifier.mjs.
export async function installOpeningGuard(context, {
  serviceWorkers, providerOrigin, applicationOrigin = 'https://www.edenia.study',
  synthetic = null, canDispatch = () => false, expectedRuntimeHash = null, assetIdentity = null, onResolutionComplete = () => {}
}) {
  if (serviceWorkers !== 'block') throw new Error('Opening requires blocked service workers')
  const policy = createOpeningPolicy({ providerOrigin })
  let stopped = false
  let injectFailure = false
  await context.routeWebSocket('**/*', socket => { policy.fail(); socket.close() })
  await context.route('**/*', async route => {
    const request = route.request()
    const target = new URL(request.url())
    try {
      if (stopped) return await route.abort('blockedbyclient')
      if (target.origin === providerOrigin) {
        const classification = policy.classify({ method: request.method(), url: request.url(), body: request.postData() })
        if (classification === 'deny') return await route.abort('blockedbyclient')
        // A network abort makes idempotent SDK reads retry. This explicit local
        // denial blocks the same requests without inventing provider success.
        if (classification === 'ancillary-block') return await route.fulfill({ status: 403,
          json: { code: 'CANARY_ANCILLARY_BLOCKED', message: 'Blocked by the local opening guard', details: null, hint: null } })
        if (classification === 'resolve' && injectFailure) {
          injectFailure = false
          return await route.abort('failed')
        }
        if (synthetic) {
          const json = classification === 'resolve' ? [synthetic.resolution]
            : classification === 'auth-read' ? synthetic.session.user : [{ status: 'none' }]
          return await route.fulfill({ status: 200, json })
        }
        if (!await canDispatch(classification)) { policy.fail(); return await route.abort('blockedbyclient') }
        // maxRedirects: 0 avoids forwarding credentials through redirects.
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 })
        if (response.status() >= 300 && response.status() < 400) {
          policy.fail(); return await route.abort('blockedbyclient')
        }
        if (classification === 'resolve' && response.status() === 200) {
          const data = await response.json()
          if (Array.isArray(data) && data.length === 1 && data[0]?.status === 'profile_ready') onResolutionComplete()
        }
        return await route.fulfill({ response })
      }
      if (target.origin === applicationOrigin && target.pathname === '/config.local.js' && expectedRuntimeHash) {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 })
        const body = await response.body()
        const { createHash } = await import('node:crypto')
        if (response.status() !== 200 || createHash('sha256').update(body).digest('hex') !== expectedRuntimeHash) {
          policy.fail(); return await route.abort('blockedbyclient')
        }
        return await route.fulfill({ response, body })
      }
      if (target.origin === applicationOrigin && target.pathname === '/app.js' && assetIdentity) {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 })
        const body = await response.body()
        const { createHash } = await import('node:crypto')
        if (target.search !== '?v=' + assetIdentity.version || response.status() !== 200
          || createHash('sha256').update(body).digest('hex') !== assetIdentity.sha256) {
          policy.fail(); return await route.abort('blockedbyclient')
        }
        return await route.fulfill({ response, body })
      }
      // Only static application reads; no public root document navigation.
      if (request.method() === 'GET' && target.origin === applicationOrigin
        && (request.resourceType() !== 'document' || target.href === applicationOrigin + '/?internal_test=1')) {
        return await route.continue()
      }
      if (target.pathname.startsWith('/rest/v1/') || target.pathname.startsWith('/auth/v1/')) policy.fail()
      // Nonessential analytics, media and integrations are blocked locally.
      // Never forward an unclassified backend request via another origin.
      return await route.abort('blockedbyclient')
    } catch {
      policy.fail()
      try { await route.abort('blockedbyclient') } catch {}
    }
  })
  return { policy, injectTransportFailure() { injectFailure = true }, stop() { stopped = true; policy.fail() } }
}

export async function runOpeningCase({ browser, applicationOrigin, providerOrigin,
  synthetic, session, bookkeeping, canDispatch, verifyBefore, verifyAfter, testRuntime, expectedRuntimeHash, assetIdentity, onResolutionComplete }) {
  if (applicationOrigin === 'https://www.edenia.study' && !/^[a-f0-9]{64}$/u.test(expectedRuntimeHash || '')) throw new Error('Hosted runtime hash is required')
  if (applicationOrigin === 'https://www.edenia.study' && (!/^[a-f0-9]{12}$/u.test(assetIdentity?.version || '') || !/^[a-f0-9]{64}$/u.test(assetIdentity?.sha256 || ''))) throw new Error('Hosted asset identity is required')
  if (!['clean', 'malformed', 'stale', 'retry'].includes(bookkeeping)) throw new Error('Unknown opening case')
  if (!synthetic && (typeof verifyBefore !== 'function' || typeof verifyAfter !== 'function')) throw new Error('Live opening requires private invariant verifiers')
  if (testRuntime && (!synthetic || !['localhost', '127.0.0.1'].includes(new URL(applicationOrigin).hostname))) throw new Error('Runtime fixture is local-only')
  let identity = synthetic?.resolution
  const { expect } = await import('@playwright/test')
  const contextOptions = { serviceWorkers: 'block' }
  const context = await browser.newContext(contextOptions)
  let guard
  const phases = []
  let cleanup = false
  let unchanged = null
  let before
  let phaseBefore
  let failed = false
  try {
    before = synthetic ? null : await verifyBefore()
    if (!synthetic) {
      if (!before?.validHead || before.owner !== session?.user?.id) throw new Error('Live opening owner/head preflight failed')
      identity = { profile_id: before.profileId, generation: Number(before.generation), revision: Number(before.revision) }
    }
    if (bookkeeping === 'stale' && (!Number.isSafeInteger(identity?.revision) || identity.revision < 2)) throw new Error('No older same-generation revision is available for this fixture')
    guard = await installOpeningGuard(context, { ...contextOptions, applicationOrigin,
      providerOrigin, synthetic, canDispatch, expectedRuntimeHash, assetIdentity, onResolutionComplete })
    if (testRuntime) await context.route('**/config.local.js*', route => route.fulfill({
      contentType: 'text/javascript', body: 'window.EDENIA_CONFIG = ' + JSON.stringify(testRuntime)
    }))
    await context.addInitScript(({ session, bookkeeping, identity, applicationOrigin }) => {
      if (location.origin !== applicationOrigin || location.search !== '?internal_test=1') return
      if (sessionStorage.getItem('edenia-opening-smoke-seeded')) return
      sessionStorage.setItem('edenia-opening-smoke-seeded', '1')
      // This new context owns no pre-existing learner data. Never clear a user profile.
      localStorage.setItem('edenia_v1_internal_test_plus_auth_v1', JSON.stringify(session))
      const key = 'edenia_v1_internal_test_learner_profile_sync_v1'
      if (bookkeeping === 'malformed') {
        localStorage.setItem(key, '{synthetic-malformed-sync')
        localStorage.setItem(key + '_import_v1', '{synthetic-malformed-import')
      }
      if (bookkeeping === 'stale') localStorage.setItem(key, JSON.stringify({version:1,
        ownerId:session.user.id,profileId:identity.profile_id,generation:identity.generation,
        acceptedRevision:identity.revision - 1,pending:null,queued:null}))
    }, { session: synthetic?.session || session, bookkeeping, identity, applicationOrigin })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const startPhase = async name => {
      phaseBefore = synthetic ? null : await verifyBefore()
      guard.policy.beginPhase(name)
    }
    const finishPhase = async () => {
      if (!synthetic && await verifyAfter(phaseBefore) !== true) throw new Error('Phase head changed')
      phases.push(guard.policy.finishPhase())
    }
    const assertActive = async () => {
      await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state', 'active')
      await expect(page.locator('#mainApp')).toBeVisible()
      await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
      // Observe delayed startup work before sealing a phase. This is a bounded
      // quiescence observation, not a substitute for interception after sealing.
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (bookkeeping === 'retry') {
      await startPhase('injected-failure')
      guard.injectTransportFailure()
      await page.goto(applicationOrigin + '/?internal_test=1')
      await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state', 'waiting-cloud')
      await finishPhase()
      await startPhase('retry')
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await assertActive()
      await finishPhase()
    } else {
      await startPhase('activation')
      await page.goto(applicationOrigin + '/?internal_test=1')
      await assertActive()
      await finishPhase()
    }
    if (phases.some(phase => !phase.complete)) throw new Error('Opening phase rejected')
    await startPhase('reload')
    await page.reload()
    await assertActive()
    await finishPhase()
    if (phases.some(phase => !phase.complete)) throw new Error('Opening phase rejected')
  } catch {
    failed = true
    try { phases.push(guard.policy.finishPhase()) } catch {}
  } finally {
    guard?.stop()
    try { await context.close(); cleanup = true } catch { failed = true }
    if (!synthetic && before) {
      try { unchanged = await verifyAfter(before); if (unchanged !== true) failed = true } catch { failed = true }
    }
  }
  // No exception text, browser traces, rendered content, auth, URLs or envelopes
  // enter this result. Source evidence is a separate private reviewed artifact.
  return { complete: !failed && cleanup, synthetic: Boolean(synthetic), bookkeeping,
    phases, cleanup, headUnchanged: unchanged }
}

// Hosted synthetic entry point: no live account material is accepted by CLI.
// Real acceptance imports the runner with the reviewed private verifier/lease.
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises')
  const { createHash, randomUUID } = await import('node:crypto')
  const { encodeCanaryEvidence } = await import('./canary-evidence.mjs')
  const { execFileSync } = await import('node:child_process')
  const runnerSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const osVersion = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()
  const procedureSha256 = createHash('sha256').update(await readFile(new URL('./hosted-profile-opening-smoke.mjs', import.meta.url))).digest('hex')
  const { chromium } = await import('@playwright/test')
  const { linkedContainmentOperator, READ_GATE_SQL } = await import('./canary-containment-operator.mjs')
  const [mode, candidate] = process.argv.slice(2)
  if (mode !== '--synthetic' || !/^[a-f0-9]{40}$/u.test(candidate || '') || process.argv.length !== 4) {
    throw new Error('Usage: node scripts/hosted-profile-opening-smoke.mjs --synthetic REVIEWED_DEPLOYED_SHA')
  }
  const workdir = process.env.EDENIA_CANARY_OPERATOR_WORKDIR
  if (!workdir) throw new Error('Approved linked operator workdir is required')
  const projectRef = (await readFile(workdir + '/supabase/.temp/project-ref', 'utf8')).trim()
  const operator = linkedContainmentOperator({ workdir, projectRef })
  const verifyGate = async () => {
    const rows = await operator.query(READ_GATE_SQL)
    if (rows.length !== 1 || rows[0].rollout_state !== 'off' || rows[0].owner !== null
      || !await operator.monitorDisabled()) throw new Error('Synthetic smoke requires verified gate off and monitor disabled')
  }
  const readDeployment = async () => {
    const base = 'https://www.edenia.study'
    const release = await (await fetch(base + '/release.json?opening=' + Date.now())).json()
    const runtime = await (await fetch(base + '/config.local.js?opening=' + Date.now())).text()
    const hash = createHash('sha256').update(runtime).digest('hex')
    const match = runtime.match(/^window\.EDENIA_CONFIG\s*=\s*([\s\S]*?)\s*;?\s*$/u)
    const config = match ? JSON.parse(match[1]) : null
    if (release.deployedCommit !== candidate || release.runtimeConfigSha256 !== hash
      || config?.accountFeaturesRollout !== 'internal' || config?.learnerProfileLifecycleEnabled !== true
      || new URL(config.supabaseUrl).hostname !== projectRef + '.supabase.co') throw new Error('Deployed opening identity mismatch')
    if (release.assetVersion !== candidate.slice(0, 12)) throw new Error('Asset version mismatch')
    const asset = await fetch(base + '/app.js?v=' + release.assetVersion)
    if (!asset.ok) throw new Error('Asset missing')
    const assetIdentity = { version: release.assetVersion, sha256: createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex') }
    return { assetIdentity, hash, providerOrigin: new URL(config.supabaseUrl).origin }
  }
  await verifyGate()
  const deployment = await readDeployment()
  const synthetic = JSON.parse(await readFile(new URL('../tests/fixtures/learner-profile/profile-ready-smoke.json', import.meta.url), 'utf8'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const results = []
  const sources = []
  const browserVersion = browser.version()
  try {
    for (const bookkeeping of ['clean', 'malformed', 'stale', 'retry']) {
      const startedUtc = new Date().toISOString()
      const result = await runOpeningCase({ browser, applicationOrigin: 'https://www.edenia.study',
        providerOrigin: deployment.providerOrigin, synthetic, bookkeeping, expectedRuntimeHash: deployment.hash, assetIdentity: deployment.assetIdentity })
      const finishedUtc = new Date().toISOString()
      results.push(result)
      sources.push({ startedUtc, finishedUtc })
      if (!result.complete) break
    }
  } finally { await browser.close() }
  await verifyGate()
  const postDeployment = await readDeployment()
  const complete = results.length === 4 && results.every(result => result.complete)
    && deployment.hash === postDeployment.hash && deployment.assetIdentity.sha256 === postDeployment.assetIdentity.sha256
  const directory = new URL('../.cache/issue-286/', import.meta.url)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const receipt = { candidate, runtimeConfigSha256: deployment.hash, assetIdentity: deployment.assetIdentity,
    sourceKind: 'synthetic-deployed-client', complete, results }
  await writeFile(new URL('synthetic-' + randomUUID() + '.json', directory), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
  for (const [index, result] of results.entries()) {
    const source = JSON.stringify(result) + '\n'
    const sourceHash = createHash('sha256').update(source).digest('hex')
    await writeFile(new URL(sourceHash + '.json', directory), source, { mode: 0o600 })
    const record = encodeCanaryEvidence({ schemaVersion: 1, runId: randomUUID(),
      scenario: 'packet-1-profile-opening', subcase: index + 1, procedureSha256, runnerSha, candidateSha: candidate,
      gate: 'off', target: 'macos-chrome', browserVersion, osVersion, sourceKind: 'deployed-synthetic',
      ...sources[index], assertions: [{ id: 'ui-correct', passed: result.complete },
        { id: 'counts-match', passed: result.phases.every(phase => phase.complete && phase.unauthorized === 0) }],
      operations: [{ id: 'resolve', expected: index === 3 ? 3 : 2, observed: result.phases.reduce((sum, phase) => sum + phase.resolve, 0) }],
      cleanup: result.cleanup ? 'verified' : 'failed', sourceHashes: [sourceHash] })
    await writeFile(new URL(record.sha256 + '.json', directory), record.json, { mode: 0o600 })
  }
  console.log(JSON.stringify(receipt))
  if (!complete) process.exitCode = 1
}

// Match only the installed SDK's existing email-code flow. Authentication
// setup is constrained to an already verified account; it is not evidence of
// unchanged deployed authentication behavior because creation is suppressed.
export function createOpeningEmailAuthenticationPolicy({ providerOrigin, expectedEmail }) {
  const provider = new URL(providerOrigin)
  if (provider.origin !== providerOrigin || provider.protocol !== 'https:'
    || typeof expectedEmail !== 'string' || expectedEmail.length > 254
    || !/^[^\s@]+@[^\s@]+$/u.test(expectedEmail)) throw new Error('Invalid email authentication target')
  let failed = false, delivery = 0, verification = 0, reads = 0
  const deny = () => { failed = true; return { kind: 'deny' } }
  const keys = (value, allowed) => value && !Array.isArray(value) && typeof value === 'object'
    && Object.keys(value).every(key => allowed.includes(key))
  return {
    classify({ method, url, body }) {
      if (failed) return deny()
      let target, payload
      try { target = new URL(url) } catch { return deny() }
      if (target.origin !== providerOrigin || target.search || target.hash || target.username || target.password) return deny()
      if (method === 'GET' && target.pathname === '/auth/v1/user' && !body && reads < 2) {
        reads++; return { kind: 'user-read' }
      }
      if (method !== 'POST' || typeof body !== 'string' || body.length > 8192) return deny()
      try { payload = JSON.parse(body) } catch { return deny() }
      // The SDK serializes canonical JSON. Equality also rejects duplicate keys.
      if (JSON.stringify(payload) !== body || payload?.email !== expectedEmail) return deny()
      if (target.pathname === '/auth/v1/otp' && delivery === 0
        && keys(payload, ['email', 'data', 'create_user', 'gotrue_meta_security', 'code_challenge', 'code_challenge_method'])
        && typeof payload.create_user === 'boolean'
        && keys(payload.data, ['edenia_auth_locale'])
        && typeof payload.data.edenia_auth_locale === 'string' && /^[a-zA-Z-]{2,16}$/u.test(payload.data.edenia_auth_locale)
        && keys(payload.gotrue_meta_security, ['captcha_token'])
        && (payload.gotrue_meta_security.captcha_token === undefined
          || typeof payload.gotrue_meta_security.captcha_token === 'string' && payload.gotrue_meta_security.captcha_token.length > 0 && payload.gotrue_meta_security.captcha_token.length <= 2048)
        && ((payload.code_challenge === null && payload.code_challenge_method === null)
          || typeof payload.code_challenge === 'string' && /^[a-zA-Z0-9_-]{43}$/u.test(payload.code_challenge) && payload.code_challenge_method === 's256')) {
        delivery++; return { kind: 'email-code-request', body: JSON.stringify({ ...payload, create_user: false }) }
      }
      if (target.pathname === '/auth/v1/verify' && delivery === 1 && verification < 3
        && keys(payload, ['email', 'token', 'type', 'gotrue_meta_security'])
        && typeof payload.token === 'string' && /^\d{6}$/u.test(payload.token) && payload.type === 'email'
        && keys(payload.gotrue_meta_security, []) ) {
        verification++; return { kind: 'email-code-verify', body }
      }
      return deny()
    }
  }
}

// Existing-account authentication setup is separate from profile acceptance.
// The caller drives the visible UI through native controls. Session material
// remains in memory and is used only in fresh contexts at the same app origin.
export async function prepareOpeningAuthentication({ browser, providerOrigin, expectedOwner,
  verifyGateOff, onReady = () => {}, timeoutMs = 300000, method = 'google', expectedEmail }) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(expectedOwner)
    || typeof verifyGateOff !== 'function' || timeoutMs < 1000 || timeoutMs > 300000
    || !['google', 'email-code'].includes(method)) throw new Error('Invalid private authentication preflight')
  const emailPolicy = method === 'email-code' ? createOpeningEmailAuthenticationPolicy({ providerOrigin, expectedEmail }) : null
  await verifyGateOff()
  const context = await browser.newContext({ serviceWorkers: 'block' })
  let stopped = false
  let attempts = 0
  let challenges = 0
  try {
    await context.routeWebSocket('**/*', socket => socket.close())
    await context.route('**/*', async route => {
      const request = route.request()
      const target = new URL(request.url())
      if (stopped) return route.abort()
      // Successful sign-in can schedule profile opening before the session
      // poll runs. Deny that traffic without treating it as an auth failure.
      if (target.pathname.startsWith('/rest/v1/')) return route.abort('blockedbyclient')
      if (target.origin === providerOrigin) {
        let constrainedBody
        if (emailPolicy) {
          const classified = emailPolicy.classify({ method: request.method(), url: request.url(), body: request.postData() })
          if (classified.kind === 'deny') { stopped = true; return route.abort('blockedbyclient') }
          constrainedBody = classified.body
        } else {
          const read = request.method() === 'GET' && target.pathname === '/auth/v1/user' && !target.search
          const exchange = request.method() === 'POST' && target.pathname === '/auth/v1/token'
            && target.search === '?grant_type=id_token'
          if (!read && !exchange) return route.abort('blockedbyclient')
          if (++attempts > 5) { stopped = true; return route.abort('blockedbyclient') }
        }
        await verifyGateOff()
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0,
          ...(constrainedBody === undefined ? {} : { postData: constrainedBody }) })
        if (response.status() >= 300 && response.status() < 400) { stopped = true; return route.abort() }
        return route.fulfill({ response })
      }
      if (target.pathname.startsWith('/rest/v1/') || target.pathname.startsWith('/auth/v1/')) return route.abort()
      if (target.origin === 'https://www.edenia.study' && request.resourceType() === 'document' && target.href !== OPENING_URL) return route.abort('blockedbyclient')
      if (emailPolicy && target.origin === 'https://challenges.cloudflare.com'
        && ['GET', 'POST'].includes(request.method())
        && ['/turnstile/', '/cdn-cgi/challenge-platform/'].some(prefix => target.pathname.startsWith(prefix))) {
        if (++challenges > 128) { stopped = true; return route.abort('blockedbyclient') }
        return route.continue()
      }
      const googleAuth = method === 'google' && ['accounts.google.com', 'accounts.youtube.com'].includes(target.hostname)
      const staticRead = request.method() === 'GET' && (target.origin === 'https://www.edenia.study'
        || target.hostname === 'accounts.google.com' || target.hostname.endsWith('.gstatic.com')
        || target.hostname.endsWith('.googleapis.com'))
      if (googleAuth || staticRead) return route.continue()
      return route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    await page.goto(OPENING_URL)
    await onReady()
    const deadline = Date.now() + timeoutMs
    while (!stopped && Date.now() < deadline) {
      const session = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('edenia_v1_internal_test_plus_auth_v1')) } catch { return null }
      })
      if (session?.user?.id) {
        if (session.user.id !== expectedOwner) throw new Error('Authentication owner mismatch')
        await verifyGateOff()
        return session
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('Private authentication interaction is required')
  } finally { stopped = true; await context.close() }
}
