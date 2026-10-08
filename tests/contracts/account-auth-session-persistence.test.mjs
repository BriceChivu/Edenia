import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthClient } from '@supabase/supabase-js'
import { createAccountAuthController } from '../../src/integrations/account-auth-controller.js'
import { prepareLocalAuthSessionRetirement } from '../../src/integrations/local-auth-session-retirement.js'

for (const scope of ['local', 'global']) {
  test(`failed ${scope} sign-out forgets an expired durable SDK session`, async t => {
    const at = Date.now()
    t.mock.timers.enable({ apis: ['Date'], now: at })
    const key = 'trial-auth-fixture'
    const session = {
      access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
      expires_at: Math.floor(at / 1000) + 3600, token_type: 'bearer',
      user: { id: '123e4567-e89b-42d3-a456-426614174000',
        email: 'learner@example.com', app_metadata: { provider: 'email' } }
    }
    const values = new Map([[key, JSON.stringify(session)]])
    const storage = {
      getItem: name => values.get(name) ?? null,
      setItem: (name, value) => values.set(name, value),
      removeItem: name => values.delete(name)
    }
    const auth = new AuthClient({
      url: 'https://auth-fixture.invalid/auth/v1', storageKey: key,
      storage, persistSession: true, autoRefreshToken: false,
      detectSessionInUrl: false,
      fetch: async () => {
        // Advance the retry clock; exercise the real SDK's failed refresh
        // without spending thirty seconds on its exponential backoff.
        t.mock.timers.setTime(Date.now() + 40_000)
        return new Response(JSON.stringify({ msg: 'temporary outage' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        })
      }
    })
    const controller = createAccountAuthController({
      client: { auth }, location: { href: 'https://www.edenia.study/?internal_test=1' },
      history: { replaceState() {} }, onStateChange() {},
      prepareLocalSignOut: () => prepareLocalAuthSessionRetirement({ storage, storageKey: key }),
      schedule: callback => queueMicrotask(callback)
    })
    t.after(() => controller.destroy())
    t.after(() => auth.dispose())
    await controller.initialize()
    assert.equal(controller.getState().sessionState, 'signed-in')
    values.set(key, JSON.stringify({ ...session, expires_at: Math.floor(at / 1000) - 1 }))
    assert.equal(await (scope === 'global'
      ? controller.signOutEverywhere() : controller.signOut()), false)
    assert.equal(controller.getState().sessionState, 'signed-out')
    assert.equal(values.has(key), false, 'logout must survive reload and reconnection')
    await controller.refresh()
    assert.equal(controller.getState().sessionState, 'signed-out')
  })
}

test('local session retirement preserves a replacement and other trial namespaces', () => {
  const key = 'trial-auth-fixture'
  const values = new Map([[key, 'original'], [`${key}-code-verifier`, 'original-proof'],
    ['normal-auth', 'normal'], ['mode-two-auth', 'mode-two'], ['trial-profile', 'learner data']])
  const storage = { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) }
  const retire = prepareLocalAuthSessionRetirement({ storage, storageKey: key })
  values.set(key, 'replacement')
  assert.equal(retire(), false)
  assert.equal(values.get(key), 'replacement')
  const currentRetire = prepareLocalAuthSessionRetirement({ storage, storageKey: key })
  assert.equal(currentRetire(() => false), false)
  assert.equal(currentRetire(), true)
  assert.deepEqual([...values], [['normal-auth', 'normal'], ['mode-two-auth', 'mode-two'], ['trial-profile', 'learner data']])
})

test('definitive refresh rejection locks a still-valid cached SDK session across reload', async t => {
  const key = 'revoked-trial-auth'
  const values = new Map([[key, JSON.stringify({
    access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
    user: { id: '123e4567-e89b-42d3-a456-426614174000', app_metadata: { provider: 'email' } }
  })]])
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const auth = new AuthClient({
    url: 'https://auth-fixture.invalid/auth/v1', storageKey: key, storage,
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async () => new Response(JSON.stringify({
      code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  })
  const controller = createAccountAuthController({ client: { auth },
    location: { href: 'https://www.edenia.study/?internal_test=1' },
    history: { replaceState() {} }, onStateChange() {}, schedule: callback => queueMicrotask(callback),
    prepareLocalSignOut: () => prepareLocalAuthSessionRetirement({ storage, storageKey: key })
  })
  t.after(() => { controller.destroy(); auth.dispose() })
  await controller.initialize()
  assert.equal(controller.getState().sessionState, 'signed-in')
  await controller.reverify()
  assert.equal(controller.getState().sessionState, 'signed-out')
  assert.equal(values.has(key), false, 'a rejected refresh must not reopen from cached JWT on reload')
  await controller.refresh()
  assert.equal(controller.getState().sessionState, 'signed-out')
})
