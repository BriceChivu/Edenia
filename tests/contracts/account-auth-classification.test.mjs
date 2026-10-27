import assert from 'node:assert/strict'
import test from 'node:test'
import { createAccountAuthController } from '../../src/integrations/account-auth-controller.js'
import { createLearnerProfileAuthenticationAdapter } from '../../src/integrations/learner-profile-authentication-adapter.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_OWNER_ID = '223e4567-e89b-42d3-a456-426614174001'
const settle = () => new Promise(resolve => setImmediate(resolve))

function deferred() {
  let resolve, reject
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

function session(ownerId = OWNER_ID, token = 'token-1') {
  return {
    access_token: token,
    user: {
      id: ownerId,
      email: 'fixture@example.invalid',
      app_metadata: { provider: 'google', providers: ['google'] }
    }
  }
}

function claims(ownerId = OWNER_ID, method = 'magiclink') {
  return { data: { claims: { sub: ownerId, amr: [{ method }] } }, error: null }
}

function harness(initialSession = session(), onPublication = () => {}) {
  const states = [], observations = [], classifiers = [], scheduled = [], sessionReads = [], calls = []
  let authListener, nextSession = initialSession, controller
  const adapter = createLearnerProfileAuthenticationAdapter()
  adapter.subscribe(value => {
    observations.push(value)
    if (value.status === 'signed-in') calls.push('open_my_learner_profile')
  })
  const client = { auth: {
    async getSession() {
      calls.push('getSession')
      const current = sessionReads.length ? await sessionReads.shift() : nextSession
      return { data: { session: current }, error: null }
    },
    async refreshSession() {
      calls.push('refreshSession')
      return { data: { session: nextSession }, error: null }
    },
    getClaims(token) {
      calls.push('getClaims')
      const result = deferred()
      classifiers.push({ ...result, token })
      return result.promise
    },
    onAuthStateChange(listener) {
      authListener = listener
      return { data: { subscription: { unsubscribe() {} } } }
    },
    async signInWithOtp() { return {} },
    async verifyOtp() { return {} },
    async signOut() { return { error: null } }
  } }
  controller = createAccountAuthController({
    client,
    history: { replaceState() {} },
    location: { href: 'https://www.edenia.study/?account=1' },
    onStateChange(state) {
      states.push(state)
      adapter.observeAccountState(state)
      onPublication(state, controller)
    },
    schedule: callback => scheduled.push(callback)
  })
  return {
    controller, states, observations, classifiers, calls, sessionReads,
    setSession: value => { nextSession = value },
    event(type) {
      authListener(type)
      scheduled.splice(0).forEach(callback => callback())
    }
  }
}

test('identity publication and one opening request do not wait for method classification', async () => {
  const h = harness()
  const initialization = h.controller.initialize()
  assert.equal(initialization, h.controller.initialize())
  await settle()
  try {
    assert.equal(h.controller.getState().sessionState, 'signed-in')
    assert.equal(h.controller.getState().userId, OWNER_ID)
  } finally {
    // The original blocking implementation must fail without leaving its
    // intentionally held lookup or initialization unresolved.
    if (h.controller.getState().sessionState !== 'signed-in') h.classifiers[0].resolve(claims())
  }
  await initialization
  assert.equal(h.classifiers.length, 1)
  assert.equal(h.calls.filter(name => name === 'open_my_learner_profile').length, 1)
  assert.equal(h.controller.getState().authMethod, 'google')

  h.classifiers[0].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
  assert.equal(h.states.length, 2)
  assert.equal(h.observations.length, 1)
  assert.equal(h.calls.filter(name => name === 'open_my_learner_profile').length, 1)
})

for (const failure of ['returned-error', 'throw', 'wrong-sub']) {
  test(`optional claims ${failure} never blocks or replaces the session owner`, async () => {
    const h = harness()
    await h.controller.initialize()
    assert.equal(h.controller.getState().userId, OWNER_ID)
    if (failure === 'throw') h.classifiers[0].reject(Error('Synthetic failure'))
    else h.classifiers[0].resolve(failure === 'wrong-sub'
      ? claims(OTHER_OWNER_ID) : { data: null, error: { message: 'Synthetic failure' } })
    await settle()
    assert.equal(h.controller.getState().userId, OWNER_ID)
    assert.equal(h.controller.getState().authMethod, 'google')
    assert.equal(h.observations.length, 1)
  })
}

for (const boundary of ['signout', 'signed-out-event', 'destroy']) {
  test(`late classification is fenced after ${boundary}`, async () => {
    const h = harness()
    await h.controller.initialize()
    if (boundary === 'signout') await h.controller.signOut()
    else if (boundary === 'destroy') h.controller.destroy()
    else h.event('SIGNED_OUT')
    const before = h.states.length
    h.classifiers[0].resolve(claims())
    await settle()
    assert.equal(h.states.length, before)
    if (boundary !== 'destroy') assert.equal(h.controller.getState().sessionState, 'signed-out')
  })
}

test('a later owner cannot receive the earlier owner classification', async () => {
  const h = harness()
  await h.controller.initialize()
  h.setSession(session(OTHER_OWNER_ID, 'token-2'))
  await h.controller.refresh()
  assert.equal(h.controller.getState().userId, OTHER_OWNER_ID)
  h.classifiers[0].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().authMethod, 'google')
  h.classifiers[1].resolve(claims(OTHER_OWNER_ID))
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
  assert.deepEqual(h.observations.map(value => value.userId), [OWNER_ID, OTHER_OWNER_ID])
})

test('same-owner token replacement keeps only the newer method result', async () => {
  const h = harness()
  await h.controller.initialize()
  h.setSession(session(OWNER_ID, 'token-2'))
  await h.controller.refresh()
  assert.deepEqual(h.classifiers.map(value => value.token), ['token-1', 'token-2'])
  h.classifiers[1].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
  h.classifiers[0].resolve(claims(OWNER_ID, 'oauth'))
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
  assert.equal(h.observations.length, 1)
  assert.equal(h.calls.filter(name => name === 'open_my_learner_profile').length, 1)
})

test('a newer session request retires classification before that request finishes', async () => {
  const h = harness()
  await h.controller.initialize()
  const next = deferred()
  h.sessionReads.push(next.promise)
  const refreshing = h.controller.refresh()
  h.classifiers[0].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().authMethod, 'google')
  next.resolve(session(OWNER_ID, 'token-2'))
  await refreshing
  h.classifiers[1].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
})

test('online reverification still waits for SDK refresh, with classification optional', async () => {
  const h = harness()
  await h.controller.initialize()
  h.setSession(session(OWNER_ID, 'token-2'))
  const state = await h.controller.reverify()
  assert.equal(h.calls.includes('refreshSession'), true)
  assert.equal(state.userId, OWNER_ID)
  assert.equal(h.classifiers.length, 2)
  h.classifiers[1].resolve(claims())
  h.classifiers[0].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().userId, OWNER_ID)
})

test('email-only sessions keep the existing zero-claims path', async () => {
  const value = session()
  value.user.app_metadata = { provider: 'email', providers: ['email'] }
  const h = harness(value)
  await h.controller.initialize()
  assert.equal(h.classifiers.length, 0)
  assert.equal(h.controller.getState().authMethod, 'email')
  assert.equal(h.calls.filter(name => name === 'open_my_learner_profile').length, 1)
})

test('same-token observations share pending claims and retain the verified method without flicker', async () => {
  const h = harness()
  await h.controller.initialize()
  await h.controller.refresh()
  assert.equal(h.classifiers.length, 1)
  h.classifiers[0].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
  const before = h.states.length
  await h.controller.refresh()
  await settle()
  assert.equal(h.classifiers.length, 1)
  assert.equal(h.controller.getState().authMethod, 'email')
  assert.equal(h.states.slice(before).every(value => value.authMethod === 'email'), true)
  assert.equal(h.observations.length, 1)
  assert.equal(h.calls.filter(name => name === 'open_my_learner_profile').length, 1)
})

for (const failure of ['returned-error', 'throw', 'wrong-sub']) {
  test(`same-token classification can retry after ${failure}`, async () => {
    const h = harness()
    await h.controller.initialize()
    if (failure === 'throw') h.classifiers[0].reject(Error('Synthetic failure'))
    else h.classifiers[0].resolve(failure === 'wrong-sub'
      ? claims(OTHER_OWNER_ID) : { data: null, error: { message: 'Synthetic failure' } })
    await settle()
    await h.controller.refresh()
    assert.equal(h.classifiers.length, 2)
    h.classifiers[1].resolve(claims())
    await settle()
    assert.equal(h.controller.getState().authMethod, 'email')
  })
}

test('a changed owner never shares classification even when a token string is repeated', async () => {
  const h = harness()
  await h.controller.initialize()
  h.setSession(session(OTHER_OWNER_ID, 'token-1'))
  await h.controller.refresh()
  assert.equal(h.classifiers.length, 2)
  h.classifiers[0].resolve(claims())
  await settle()
  assert.equal(h.controller.getState().userId, OTHER_OWNER_ID)
  assert.equal(h.controller.getState().authMethod, 'google')
  h.classifiers[1].resolve(claims(OTHER_OWNER_ID))
  await settle()
  assert.equal(h.controller.getState().authMethod, 'email')
})

test('synchronous publication retirement prevents even starting optional classification', async () => {
  const h = harness(session(), (state, controller) => {
    if (state.sessionState === 'signed-in') controller.destroy()
  })
  await h.controller.initialize()
  await settle()
  assert.equal(h.classifiers.length, 0)
  assert.equal(h.states.length, 1)
})

test('missing access tokens do not start a classification request against another SDK session', async () => {
  const value = session()
  delete value.access_token
  const h = harness(value)
  await h.controller.initialize()
  assert.equal(h.controller.getState().userId, OWNER_ID)
  assert.equal(h.controller.getState().authMethod, 'google')
  assert.equal(h.classifiers.length, 0)
})
