import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_AUTH_ERRORS,
  ACCOUNT_AUTH_NOTICES,
  ACCOUNT_AUTH_RETURN_DESTINATIONS,
  ACCOUNT_SESSION_STATES,
  createAccountAuthController,
  getAccountAuthReturnUrl
} from '../../src/integrations/account-auth-controller.js'

function createDeferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

function createClient({
  session = null,
  sessionResponses = [],
  googleSignInError = null,
  magicLinkError = null,
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
        async signInWithOAuth(options) {
          calls.push(['signInWithOAuth', options])
          return { data: {}, error: googleSignInError }
        },
        async signInWithOtp(options) {
          calls.push(['signInWithOtp', options])
          return { data: {}, error: magicLinkError }
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

function createHarness(clientHarness, {
  href = ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION
} = {}) {
  const states = []
  const scheduled = []
  const replacedUrls = []
  const controller = createAccountAuthController({
    client: clientHarness.client,
    history: {
      state: { preserved: true },
      replaceState(state, title, url) {
        replacedUrls.push({ state, title, url })
      }
    },
    location: { href },
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
    replacedUrls,
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
    error: null,
    notice: null
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
    error: null,
    notice: null
  })
  assert.equal(JSON.stringify(harness.controller.getState()).includes('token'), false)
  assert.equal(JSON.stringify(harness.controller.getState()).includes('administrator'), false)
})

test('auth events confirm the client session after leaving the Supabase callback', async () => {
  const signedInSession = createDeferred()
  const clientHarness = createClient({
    sessionResponses: [
      { data: { session: null }, error: null },
      signedInSession.promise,
      {
        data: {
          session: {
            user: { id: 'user-2', email: 'updated@example.com' }
          }
        },
        error: null
      }
    ]
  })
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
  assert.equal(harness.controller.getState().sessionState, 'signed-out')
  signedInSession.resolve({
    data: {
      session: {
        user: { id: 'user-2', email: 'confirmed@example.com' }
      }
    },
    error: null
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.controller.getState().sessionState, 'signed-in')
  assert.equal(harness.controller.getState().userId, 'user-2')
  assert.equal(harness.controller.getState().email, 'confirmed@example.com')

  clientHarness.emit('TOKEN_REFRESHED', {
    user: { id: 'user-2', email: 'updated@example.com' }
  })
  harness.runScheduled()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.controller.getState().email, 'updated@example.com')
  assert.equal(
    clientHarness.calls.filter(call => call[0] === 'getSession').length,
    3
  )
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
    error: null,
    notice: null
  })
})

test('sign-in redirects are selected from an exact application allowlist', () => {
  assert.equal(
    getAccountAuthReturnUrl({
      href: 'https://www.edenia.study/?anything=user-controlled'
    }),
    ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION
  )
  assert.equal(
    getAccountAuthReturnUrl({ href: 'http://localhost:8000/?other=1' }),
    ACCOUNT_AUTH_RETURN_DESTINATIONS.LOCAL
  )
  for (const href of [
    'http://www.edenia.study/',
    'https://edenia.study/',
    'https://www.edenia.study/other/',
    'https://bricechivu.github.io/Edenia/',
    'http://localhost:8001/',
    'http://127.0.0.1:8000/',
    'https://attacker.example/?return=https://www.edenia.study/'
  ]) {
    assert.equal(getAccountAuthReturnUrl({ href }), null, href)
  }
})

test('Google sign-in uses the allowlisted production return destination', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'https://www.edenia.study/?internal_test=1&untrusted=1'
  })

  assert.equal(await harness.controller.signInWithGoogle(), true)
  assert.deepEqual(clientHarness.calls, [[
    'signInWithOAuth',
    {
      provider: 'google',
      options: { redirectTo: ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION }
    }
  ]])
  assert.equal(harness.controller.getState().busyAction, 'google-sign-in')
})

test('email sign-in normalizes addresses and retains a magic-link fallback', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'http://localhost:8000/?internal_test=1'
  })

  assert.equal(
    await harness.controller.sendMagicLink('  Learner@Example.COM  '),
    true
  )
  assert.deepEqual(clientHarness.calls, [[
    'signInWithOtp',
    {
      email: 'learner@example.com',
      options: {
        emailRedirectTo: ACCOUNT_AUTH_RETURN_DESTINATIONS.LOCAL,
        shouldCreateUser: true
      }
    }
  ]])
  assert.equal(
    harness.controller.getState().notice,
    ACCOUNT_AUTH_NOTICES.MAGIC_LINK_SENT
  )
})

test('sign-in validation and provider failures publish safe controller errors', async () => {
  const invalidEmailClient = createClient()
  const invalidEmailHarness = createHarness(invalidEmailClient)
  assert.equal(await invalidEmailHarness.controller.sendMagicLink('invalid'), false)
  assert.deepEqual(invalidEmailClient.calls, [])
  assert.equal(
    invalidEmailHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.INVALID_EMAIL
  )

  const googleClient = createClient({ googleSignInError: new Error('secret') })
  const googleHarness = createHarness(googleClient)
  assert.equal(await googleHarness.controller.signInWithGoogle(), false)
  assert.equal(
    googleHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.GOOGLE_SIGN_IN_FAILED
  )

  const emailClient = createClient({ magicLinkError: new Error('secret') })
  const emailHarness = createHarness(emailClient)
  assert.equal(
    await emailHarness.controller.sendMagicLink('learner@example.com'),
    false
  )
  assert.equal(
    emailHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.MAGIC_LINK_FAILED
  )
})

test('sign-in fails closed before calling Supabase from an unknown location', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'https://preview.example/Edenia/?internal_test=1'
  })

  assert.equal(await harness.controller.signInWithGoogle(), false)
  assert.equal(
    await harness.controller.sendMagicLink('learner@example.com'),
    false
  )
  assert.deepEqual(clientHarness.calls, [])
  assert.equal(
    harness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.RETURN_DESTINATION_NOT_ALLOWED
  )
})

test('OAuth cancellations are surfaced and removed from browser history', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'https://www.edenia.study/?internal_test=1&account=1#error=access_denied&error_description=User+denied+access&preserved=yes'
  })

  await harness.controller.initialize()

  assert.equal(
    harness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.OAUTH_CANCELLED
  )
  assert.deepEqual(harness.replacedUrls, [{
    state: { preserved: true },
    title: '',
    url: '/?internal_test=1&account=1#preserved=yes'
  }])
})

test('non-cancellation OAuth failures are surfaced without provider details', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'http://localhost:8000/?internal_test=1&account=1&error=server_error&error_description=private+provider+details'
  })

  await harness.controller.initialize()

  assert.equal(harness.controller.getState().error, ACCOUNT_AUTH_ERRORS.OAUTH_FAILED)
  assert.deepEqual(harness.replacedUrls.map(entry => entry.url), [
    '/?internal_test=1&account=1'
  ])
  assert.equal(
    JSON.stringify(harness.controller.getState()).includes('private'),
    false
  )
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
      history: { replaceState() {} },
      location: { href: ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION },
      onStateChange: null
    }),
    /state callbacks/
  )
})
