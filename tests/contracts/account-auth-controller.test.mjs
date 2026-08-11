import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_AUTH_ERRORS,
  ACCOUNT_SESSION_STATES,
  createAccountAuthController
} from '../../src/integrations/account-auth-controller.js'

function createDeferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

function createClient({
  session = null,
  sessionResponses = [],
  signOutError = null
} = {}) {
  const calls = []
  let authListener = null
  let unsubscribed = false
  const responses = [...sessionResponses]
  return {
    calls,
    client: {
      auth: {
        async getSession() {
          calls.push(['getSession'])
          if (responses.length) return responses.shift()
          return { data: { session }, error: null }
        },
        onAuthStateChange(listener) {
          calls.push(['onAuthStateChange'])
          authListener = listener
          return {
            data: {
              subscription: {
                unsubscribe() {
                  unsubscribed = true
                }
              }
            }
          }
        },
        async signOut(options) {
          calls.push(['signOut', options])
          return { error: signOutError }
        }
      }
    },
    emit(event, nextSession) {
      authListener?.(event, nextSession)
    },
    wasUnsubscribed() {
      return unsubscribed
    }
  }
}

function createHarness(clientHarness) {
  const states = []
  const scheduled = []
  const controller = createAccountAuthController({
    client: clientHarness.client,
    onStateChange(state) {
      states.push(state)
    },
    schedule(callback) {
      scheduled.push(callback)
    }
  })
  return {
    controller,
    runScheduled() {
      while (scheduled.length) scheduled.shift()()
    },
    scheduled,
    states
  }
}

test('account auth initializes once and fails closed to signed out', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness)

  const firstInitialization = harness.controller.initialize()
  const secondInitialization = harness.controller.initialize()
  assert.equal(firstInitialization, secondInitialization)
  await firstInitialization

  assert.deepEqual(harness.controller.getState(), {
    sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT,
    userId: null,
    email: '',
    busyAction: null,
    error: null
  })
  assert.deepEqual(clientHarness.calls, [
    ['onAuthStateChange'],
    ['getSession']
  ])
})

test('account auth exposes identity fields without retaining session tokens', async () => {
  const clientHarness = createClient({
    session: {
      access_token: 'private-access-token',
      refresh_token: 'private-refresh-token',
      user: {
        id: 'user-1',
        email: 'learner@example.com',
        user_metadata: { role: 'administrator' }
      }
    }
  })
  const harness = createHarness(clientHarness)

  await harness.controller.initialize()

  assert.deepEqual(harness.controller.getState(), {
    sessionState: ACCOUNT_SESSION_STATES.SIGNED_IN,
    userId: 'user-1',
    email: 'learner@example.com',
    busyAction: null,
    error: null
  })
  assert.equal(JSON.stringify(harness.controller.getState()).includes('token'), false)
  assert.equal(JSON.stringify(harness.controller.getState()).includes('administrator'), false)
})

test('auth events update state only after leaving the Supabase callback', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness)
  await harness.controller.initialize()

  clientHarness.emit('INITIAL_SESSION', {
    user: { id: 'ignored-user', email: 'ignored@example.com' }
  })
  assert.equal(harness.scheduled.length, 0)

  clientHarness.emit('SIGNED_IN', {
    user: { id: 'user-2', email: 'second@example.com' }
  })
  assert.equal(harness.controller.getState().sessionState, 'signed-out')
  assert.equal(harness.scheduled.length, 1)

  harness.runScheduled()
  assert.equal(harness.controller.getState().sessionState, 'signed-in')
  assert.equal(harness.controller.getState().userId, 'user-2')

  clientHarness.emit('TOKEN_REFRESHED', {
    user: { id: 'user-2', email: 'updated@example.com' }
  })
  harness.runScheduled()
  assert.equal(harness.controller.getState().email, 'updated@example.com')
})

test('session failures become unavailable and a later refresh can recover', async () => {
  const clientHarness = createClient({
    sessionResponses: [
      { data: { session: null }, error: new Error('offline') },
      {
        data: {
          session: {
            user: { id: 'user-3', email: 'recovered@example.com' }
          }
        },
        error: null
      }
    ]
  })
  const harness = createHarness(clientHarness)

  await harness.controller.initialize()
  assert.equal(harness.controller.getState().sessionState, 'unavailable')
  assert.equal(
    harness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.SESSION_UNAVAILABLE
  )

  await harness.controller.refresh()
  assert.equal(harness.controller.getState().sessionState, 'signed-in')
  assert.equal(harness.controller.getState().userId, 'user-3')
  assert.equal(harness.controller.getState().error, null)
})

test('local sign out clears only the account identity state', async () => {
  const clientHarness = createClient({
    session: { user: { id: 'user-4', email: 'learner@example.com' } }
  })
  const harness = createHarness(clientHarness)
  await harness.controller.initialize()

  assert.equal(await harness.controller.signOut(), true)
  assert.deepEqual(
    clientHarness.calls.find(call => call[0] === 'signOut'),
    ['signOut', { scope: 'local' }]
  )
  assert.deepEqual(harness.controller.getState(), {
    sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT,
    userId: null,
    email: '',
    busyAction: null,
    error: null
  })
})

test('sign out failures preserve the current identity and report an error', async () => {
  const clientHarness = createClient({
    session: { user: { id: 'user-5', email: 'learner@example.com' } },
    signOutError: new Error('network failure')
  })
  const harness = createHarness(clientHarness)
  await harness.controller.initialize()

  assert.equal(await harness.controller.signOut(), false)
  assert.equal(harness.controller.getState().sessionState, 'signed-in')
  assert.equal(harness.controller.getState().userId, 'user-5')
  assert.equal(
    harness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.SIGN_OUT_FAILED
  )
})

test('a stale refresh cannot restore a session after a newer auth event', async () => {
  const deferred = createDeferred()
  const clientHarness = createClient({
    sessionResponses: [
      {
        data: {
          session: { user: { id: 'user-6', email: 'first@example.com' } }
        },
        error: null
      },
      deferred.promise
    ]
  })
  const harness = createHarness(clientHarness)
  await harness.controller.initialize()

  const refresh = harness.controller.refresh()
  clientHarness.emit('SIGNED_OUT', null)
  harness.runScheduled()
  deferred.resolve({
    data: {
      session: { user: { id: 'user-6', email: 'stale@example.com' } }
    },
    error: null
  })
  await refresh

  assert.equal(harness.controller.getState().sessionState, 'signed-out')
  assert.equal(harness.controller.getState().userId, null)
})

test('destroy unsubscribes and ignores already scheduled auth work', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness)
  await harness.controller.initialize()

  clientHarness.emit('SIGNED_IN', {
    user: { id: 'user-7', email: 'late@example.com' }
  })
  harness.controller.destroy()
  harness.runScheduled()

  assert.equal(clientHarness.wasUnsubscribed(), true)
  assert.equal(harness.controller.getState().sessionState, 'signed-out')
})

test('account auth rejects incomplete integration boundaries', () => {
  assert.throws(
    () => createAccountAuthController({ client: {}, onStateChange() {} }),
    /Supabase auth client/
  )
  assert.throws(
    () => createAccountAuthController({
      client: createClient().client,
      onStateChange: null
    }),
    /state callbacks/
  )
})
