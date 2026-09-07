import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpeningPolicy, installOpeningGuard } from '../../scripts/hosted-profile-opening-smoke.mjs'

const origin = 'https://synthetic.supabase.co'
const resolveUrl = origin + '/rest/v1/rpc/resolve_my_learner_profile'
const request = (body = '{"p_onboarding_profile":null}') => ({ method: 'POST', url: resolveUrl, body })

test('opening permits exactly one null-onboarding resolver per declared phase', () => {
  const policy = createOpeningPolicy({ providerOrigin: origin })
  policy.beginPhase('activation')
  assert.equal(policy.classify(request()), 'resolve')
  assert.equal(policy.finishPhase().complete, true)
  policy.beginPhase('reload')
  assert.equal(policy.classify(request()), 'resolve')
  assert.equal(policy.finishPhase().complete, true)
})

for (const invalid of [request('{}'), request('{"p_onboarding_profile":{}}'),
  request('{"p_onboarding_profile":null,"extra":1}'), request('null'),
  { ...request(), method: 'GET' }, { ...request(), url: resolveUrl + '?extra=1' },
  { ...request(), url: origin + '/rest/v1/rpc/commit_my_learner_profile' },
  { ...request(), url: origin + '/rest/v1/learner_profile_heads' }]) {
  test(`unclassified profile request is rejected: ${JSON.stringify(invalid)}`, () => {
    const policy = createOpeningPolicy({ providerOrigin: origin })
    policy.beginPhase('activation')
    assert.equal(policy.classify(invalid), 'deny')
    assert.equal(policy.classify(request()), 'deny')
    assert.equal(policy.finishPhase().complete, false)
  })
}

test('extra resolver, timeout, and incomplete phase fail closed', () => {
  let now = 100
  const policy = createOpeningPolicy({ providerOrigin: origin, now: () => now })
  policy.beginPhase('activation')
  assert.equal(policy.classify(request()), 'resolve')
  assert.equal(policy.classify(request()), 'deny')
  assert.equal(policy.finishPhase().complete, false)
  assert.throws(() => policy.beginPhase('reload'))
  const timed = createOpeningPolicy({ providerOrigin: origin, now: () => now })
  timed.beginPhase('activation')
  now += 300001
  assert.equal(timed.classify(request()), 'deny')
  assert.equal(timed.finishPhase().complete, false)
})

test('adapter requires service-worker blocking and seals dispatch on cleanup', async () => {
  const context = { route: async () => {}, routeWebSocket: async () => {} }
  await assert.rejects(installOpeningGuard(context, { serviceWorkers: 'allow', providerOrigin: origin }))
  const guard = await installOpeningGuard(context, { serviceWorkers: 'block', providerOrigin: origin })
  guard.policy.beginPhase('activation')
  guard.stop()
  assert.equal(guard.policy.classify(request()), 'deny')
})

test('ancillary blocked writes are reported separately, bounded, and reset each phase', () => {
  const policy = createOpeningPolicy({ providerOrigin: origin })
  const ancillary = { method: 'POST', url: origin + '/rest/v1/rpc/sync_my_reminder_eligibility_snapshot', body: '{}' }
  policy.beginPhase('activation')
  assert.equal(policy.classify(ancillary), 'ancillary-block')
  policy.classify(request())
  assert.equal(policy.finishPhase().ancillaryBlocked, 1)
  policy.beginPhase('reload')
  policy.classify(request())
  assert.equal(policy.finishPhase().ancillaryBlocked, 0)
  policy.beginPhase('retry')
  for (let n = 0; n < 6; n += 1) assert.equal(policy.classify(ancillary), 'ancillary-block')
  assert.equal(policy.classify(ancillary), 'deny')
  assert.equal(policy.finishPhase().complete, false)
})

test('unknown cross-origin backend calls and sockets stop the adapter', async () => {
  let intercept
  let socketHandler
  const context = { route: async (_pattern, handler) => { intercept = handler },
    routeWebSocket: async (_pattern, handler) => { socketHandler = handler } }
  const guard = await installOpeningGuard(context, { serviceWorkers: 'block', providerOrigin: origin })
  guard.policy.beginPhase('activation')
  let aborted = false
  await intercept({ request: () => ({ url: () => 'https://unexpected.invalid/rest/v1/rpc/commit_my_learner_profile', method: () => 'POST' }),
    abort: async () => { aborted = true } })
  assert.equal(aborted, true)
  assert.equal(guard.policy.finishPhase().complete, false)
  let closed = false
  socketHandler({ close: () => { closed = true } })
  assert.equal(closed, true)
})

test('synthetic resolver never dispatches and live default has zero provider authority', async () => {
  for (const synthetic of [null, { resolution: { status: 'profile_ready' } }]) {
    let intercept
    const context = { route: async (_pattern, handler) => { intercept = handler }, routeWebSocket: async () => {} }
    const guard = await installOpeningGuard(context, { serviceWorkers: 'block', providerOrigin: origin, synthetic })
    guard.policy.beginPhase('activation')
    let fulfilled = false
    let aborted = false
    await intercept({ request: () => ({ url: () => resolveUrl, method: () => 'POST', postData: () => '{"p_onboarding_profile":null}' }),
      fetch: async () => { assert.fail('Must not reach provider') },
      fulfill: async () => { fulfilled = true }, abort: async () => { aborted = true } })
    assert.equal(fulfilled, Boolean(synthetic))
    assert.equal(aborted, !synthetic)
    assert.equal(guard.policy.finishPhase().complete, Boolean(synthetic))
  }
})

test('versioned synthetic profile fixture has a valid portable integrity envelope', async () => {
  const { readFile } = await import('node:fs/promises')
  const { verifyPortableLearnerProfileEnvelope } = await import('../../src/state/portable-learner-profile.js')
  const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-smoke.json', import.meta.url), 'utf8'))
  assert.ok(await verifyPortableLearnerProfileEnvelope(fixture.resolution.envelope))
  assert.equal(fixture.resolution.status, 'profile_ready')
  assert.equal(fixture.session.user.email, 'synthetic@example.invalid')
})

test('private authentication blocks public documents and provider redirects', async () => {
  const { prepareOpeningAuthentication, OPENING_URL } = await import('../../scripts/hosted-profile-opening-smoke.mjs')
  const owner = '11111111-1111-1111-1111-111111111111'
  let intercept, closed = false, publicBlocked = false, redirectBlocked = false
  const page = { goto: async url => assert.equal(url, OPENING_URL), evaluate: async () => ({ user: { id: owner } }) }
  const context = { routeWebSocket: async () => {}, route: async (_, handler) => { intercept = handler },
    newPage: async () => page, close: async () => { closed = true } }
  await prepareOpeningAuthentication({ browser: { newContext: async options => { assert.equal(options.serviceWorkers, 'block'); return context } },
    providerOrigin: origin, expectedOwner: owner, verifyGateOff: async () => {},
    onReady: async () => {} })
  assert.equal(closed, true)
  // Exercise the interception while authentication is still open.
  closed = false
  const pending = prepareOpeningAuthentication({ browser: { newContext: async () => context }, providerOrigin: origin,
    expectedOwner: owner, verifyGateOff: async () => {}, onReady: async () => {
      await intercept({ request: () => ({ url: () => 'https://www.edenia.study/', method: () => 'GET', resourceType: () => 'document' }), abort: async () => { publicBlocked = true }, continue: () => assert.fail('Public root forwarded') })
      await intercept({ request: () => ({ url: () => origin + '/auth/v1/token?grant_type=id_token', method: () => 'POST' }),
        fetch: async options => { assert.equal(options.maxRedirects, 0); return { status: () => 302 } }, abort: async () => { redirectBlocked = true }, continue: () => assert.fail('Provider redirect forwarded') })
    } })
  // Callback completion is awaited by the adapter before session acceptance.
  await assert.rejects(pending, /Private authentication interaction is required/)
  assert.equal(publicBlocked, true)
  assert.equal(redirectBlocked, true)
  assert.equal(closed, true)
})

test('blocked ancillary reads return a local denial without triggering SDK network retries', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js')
  let intercept, attempts = 0
  const context = { routeWebSocket: async () => {}, route: async (_, handler) => { intercept = handler } }
  const guard = await installOpeningGuard(context, { serviceWorkers: 'block', providerOrigin: origin })
  guard.policy.beginPhase('activation')
  const client = new PostgrestClient(origin + '/rest/v1', { fetch: async (url, options) => {
    attempts++
    return new Promise((resolve, reject) => {
      void intercept({ request: () => ({ url: () => url.toString(), method: () => options.method, postData: () => options.body }),
        abort: async () => reject(new TypeError('Synthetic network rejection')),
        fulfill: async ({ status, json }) => resolve(new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })),
        continue: () => assert.fail('Ancillary call reached network') })
    })
  } })
  const results = await Promise.all(['subscriptions', 'reminder_preferences'].map(table => client.from(table).select('*')))
  assert.equal(attempts, 2)
  assert.ok(results.every(result => result.error?.code === 'CANARY_ANCILLARY_BLOCKED'))
  assert.equal(guard.policy.classify(request()), 'resolve')
  assert.equal(guard.policy.finishPhase().complete, true)
})
