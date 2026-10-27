import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'
import { AuthClient } from '@supabase/supabase-js'
import { createAccountAuthController } from '../../src/integrations/account-auth-controller.js'
import { prepareLocalAuthSessionRetirement } from '../../src/integrations/local-auth-session-retirement.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_OWNER_ID = '223e4567-e89b-42d3-a456-426614174001'
let fixtureNumber = 0
const settle = () => new Promise(resolve => setImmediate(resolve))

function deferred() {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}

function jwt(ownerId, expiresAt) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: ownerId, exp: expiresAt })}`
  return `${payload}.${createHmac('sha256', 'synthetic-key').update(payload).digest('base64url')}`
}

async function fixture(t, { initializeController = true, outcome = 'success' } = {}) {
  const at = Date.now()
  t.mock.timers.enable({ apis: ['Date'], now: at })
  const key = `prewarm-fixture-${++fixtureNumber}`
  const user = ownerId => ({ id: ownerId, email: 'fixture@example.invalid', app_metadata: { provider: 'email' } })
  const saved = {
    access_token: jwt(OWNER_ID, Math.floor(at / 1000) + 3600),
    refresh_token: 'synthetic-refresh-original',
    expires_at: Math.floor(at / 1000) + 3600, token_type: 'bearer', user: user(OWNER_ID)
  }
  const values = new Map([[key, JSON.stringify(saved)], ['trial-profile', 'synthetic-durable-profile']])
  const storage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: name => values.delete(name)
  }
  const started = deferred(), release = deferred(), calls = [], states = [], scheduled = []
  let refreshOutcome = outcome
  const auth = new AuthClient({
    url: 'https://prewarm-fixture.invalid/auth/v1', storageKey: key, storage,
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async url => {
      const path = new URL(String(url)).pathname
      calls.push(path)
      if (path === '/auth/v1/token') {
        started.resolve()
        await release.promise
        if (refreshOutcome === 'transient') {
          // Exercise the actual SDK retry boundary without sleeping through
          // exponential backoff. No real clock or network is involved.
          t.mock.timers.setTime(Date.now() + 40_000)
          return Response.json({ msg: 'Synthetic temporary outage' }, { status: 503 })
        }
        if (refreshOutcome === 'permanent') {
          return Response.json({ code: 'refresh_token_not_found', msg: 'Synthetic revoked refresh' }, { status: 400 })
        }
        return Response.json({
          access_token: jwt(OWNER_ID, Math.floor(Date.now() / 1000) + 3600),
          refresh_token: 'synthetic-refresh-rotated', expires_in: 3600,
          token_type: 'bearer', user: user(OWNER_ID)
        })
      }
      if (path === '/auth/v1/user') return Response.json(user(OTHER_OWNER_ID))
      if (path === '/auth/v1/logout') return Response.json({})
      throw Error(`Unexpected synthetic request ${path}`)
    }
  })
  t.after(() => auth.dispose())
  await auth.initialize()
  const controller = createAccountAuthController({
    client: { auth }, location: { href: 'https://www.edenia.study/?internal_test=1' },
    history: { replaceState() {} }, onStateChange: state => states.push(state),
    prepareLocalSignOut: () => prepareLocalAuthSessionRetirement({ storage, storageKey: key }),
    schedule: callback => scheduled.push(callback)
  })
  t.after(() => controller.destroy())
  if (initializeController) await controller.initialize()
  return {
    auth, controller, calls, states, storage, values, key, started,
    release: release.resolve,
    expire: () => values.set(key, JSON.stringify({ ...saved, expires_at: Math.floor(at / 1000) - 1 })),
    setOutcome: value => { refreshOutcome = value },
    runScheduled: () => scheduled.splice(0).forEach(callback => callback()),
    tokenCalls: () => calls.filter(path => path === '/auth/v1/token').length,
    currentSession: () => JSON.parse(values.get(key) || 'null'),
    assertProfilePreserved: () => assert.equal(values.get('trial-profile'), 'synthetic-durable-profile')
  }
}

test('session prewarm and an ordinary SDK read share one delayed refresh without publishing a profile owner', async t => {
  const f = await fixture(t, { initializeController: false })
  f.expire()
  const prewarm = f.auth.getSession()
  await f.started.promise
  const ordinary = f.auth.getSession()
  await settle()
  assert.equal(f.tokenCalls(), 1)
  assert.equal(f.controller.getState().sessionState, 'loading')
  assert.equal(f.states.length, 0)
  f.release()
  const results = await Promise.all([prewarm, ordinary])
  assert.equal(results.every(result => !result.error && result.data.session.user.id === OWNER_ID), true)
  assert.equal(f.tokenCalls(), 1)
  assert.equal(f.controller.getState().sessionState, 'loading', 'prewarming does not publish identity or activate progress')
  await f.controller.initialize()
  assert.equal(f.controller.getState().userId, OWNER_ID)
  assert.equal(f.tokenCalls(), 1, 'ordinary initialization reads the current refreshed SDK session')
  f.assertProfilePreserved()
})

test('sign-out during a shared refresh cannot be reversed by prewarm or ordinary-read completion', async t => {
  const f = await fixture(t)
  f.expire()
  const prewarm = f.auth.getSession()
  await f.started.promise
  const ordinary = f.controller.refresh()
  await settle()
  const boundary = f.states.length
  const signout = f.controller.signOut()
  assert.equal(f.controller.getState().sessionState, 'signed-out')
  f.release()
  await Promise.all([prewarm, ordinary, signout])
  f.runScheduled()
  await settle()
  assert.equal(f.controller.getState().sessionState, 'signed-out')
  assert.equal(f.states.slice(boundary).some(state => state.sessionState === 'signed-in'), false)
  assert.equal(f.currentSession(), null)
  assert.equal((await f.auth.getSession()).data.session, null)
  assert.equal(f.tokenCalls(), 1)
  f.assertProfilePreserved()
})

test('SDK owner replacement wins over an earlier prewarm and pending ordinary read', async t => {
  const f = await fixture(t)
  f.expire()
  const prewarm = f.auth.getSession()
  await f.started.promise
  const ordinary = f.controller.refresh()
  await settle()
  const replacement = await f.auth.setSession({
    access_token: jwt(OTHER_OWNER_ID, Math.floor(Date.now() / 1000) + 3600),
    refresh_token: 'synthetic-refresh-replacement'
  })
  assert.equal(replacement.error, null)
  f.runScheduled()
  await settle()
  assert.equal(f.controller.getState().userId, OTHER_OWNER_ID)
  const boundary = f.states.length
  f.release()
  const [oldResult] = await Promise.all([prewarm, ordinary])
  assert.equal(oldResult.data.session, null, 'the SDK discards the stale rotated tokens')
  assert.equal(f.currentSession().user.id, OTHER_OWNER_ID)
  assert.equal(f.controller.getState().userId, OTHER_OWNER_ID)
  assert.equal(f.states.slice(boundary).some(state => state.userId === OWNER_ID), false)
  assert.equal((await f.auth.getSession()).data.session.user.id, OTHER_OWNER_ID)
  assert.equal(f.tokenCalls(), 1)
  f.assertProfilePreserved()
})

test('permanent refresh rejection clears the expired session without retrying or touching progress', async t => {
  const f = await fixture(t, { outcome: 'permanent' })
  f.expire()
  const prewarm = f.auth.getSession()
  await f.started.promise
  const ordinary = f.controller.refresh()
  await settle()
  f.release()
  const [result] = await Promise.all([prewarm, ordinary])
  f.runScheduled()
  await settle()
  assert.equal(result.error.status, 400)
  assert.equal(f.controller.getState().sessionState, 'signed-out')
  assert.equal(f.currentSession(), null)
  await f.controller.refresh()
  assert.equal(f.controller.getState().sessionState, 'signed-out')
  assert.equal(f.tokenCalls(), 1)
  f.assertProfilePreserved()
})

test('transient refresh failure preserves the session and shares backoff before a later successful read', async t => {
  const f = await fixture(t, { outcome: 'transient' })
  f.expire()
  const prewarm = f.auth.getSession()
  await f.started.promise
  const ordinary = f.controller.refresh()
  await settle()
  f.release()
  const [result] = await Promise.all([prewarm, ordinary])
  assert.equal(result.error.status, 503)
  assert.equal(f.controller.getState().sessionState, 'unavailable')
  assert.equal(f.currentSession().user.id, OWNER_ID)
  await f.controller.refresh()
  assert.equal(f.controller.getState().sessionState, 'unavailable')
  assert.equal(f.tokenCalls(), 1, 'a later observation shares the SDK failure cooldown')
  f.setOutcome('success')
  t.mock.timers.setTime(Date.now() + 61_000)
  await f.controller.refresh()
  assert.equal(f.controller.getState().sessionState, 'signed-in')
  assert.equal(f.controller.getState().userId, OWNER_ID)
  assert.equal(f.tokenCalls(), 2, 'only the legitimate retry after cooldown requests another token')
  f.assertProfilePreserved()
})
