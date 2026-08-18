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
  claimsResponse,
  session = null,
  sessionResponses = [],
  googleIdTokenError = null,
  emailRequestError = null,
  emailVerificationError = null,
  emailVerificationSession = null,
  signOutError = null
} = {}) {
  const calls = []
  let authListener = null
  let unsubscribed = false
  const responses = [...sessionResponses]
  const auth = {
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
    async signInWithIdToken(options) {
      calls.push(['signInWithIdToken', options])
      return { data: {}, error: googleIdTokenError }
    },
    async signInWithOtp(options) {
      calls.push(['signInWithOtp', options])
      return { data: {}, error: emailRequestError }
    },
    async verifyOtp(options) {
      calls.push(['verifyOtp', options])
      return {
        data: { session: emailVerificationSession },
        error: emailVerificationError
      }
    },
    async signOut(options) {
      calls.push(['signOut', options])
      return { error: signOutError }
    }
  }
  if (claimsResponse !== undefined) {
    auth.getClaims = async token => {
      calls.push(['getClaims', token])
      return claimsResponse
    }
  }
  return {
    calls,
    client: { auth },
    emit(event, nextSession) {
      authListener?.(event, nextSession)
    },
    wasUnsubscribed() {
      return unsubscribed
    }
  }
}

function createHarness(clientHarness, {
  href = ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION,
  isOnline = () => true,
  now = () => Date.now()
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
    isOnline,
    now,
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
    authMethod: null,
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
        app_metadata: { provider: 'google' },
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
    authMethod: 'google',
    busyAction: null,
    error: null,
    notice: null
  })
  assert.equal(JSON.stringify(harness.controller.getState()).includes('token'), false)
  assert.equal(JSON.stringify(harness.controller.getState()).includes('administrator'), false)
})

test('verified authentication claims report the current linked sign-in method', async () => {
  const googleSession = {
    access_token: 'private-access-token',
    user: {
      id: 'user-linked',
      email: 'learner@example.com',
      app_metadata: { provider: 'email', providers: ['email', 'google'] }
    }
  }
  const googleHarness = createClient({
    claimsResponse: {
      data: {
        claims: {
          sub: 'user-linked',
          amr: [{ method: 'oauth' }]
        }
      },
      error: null
    },
    session: googleSession
  })
  const googleController = createHarness(googleHarness)
  await googleController.controller.initialize()
  assert.equal(googleController.controller.getState().authMethod, 'google')
  assert.deepEqual(googleHarness.calls.at(-1), [
    'getClaims',
    'private-access-token'
  ])

  const emailHarness = createClient({
    claimsResponse: {
      data: {
        claims: {
          sub: 'user-linked',
          amr: [{ method: 'magiclink' }]
        }
      },
      error: null
    },
    session: {
      ...googleSession,
      user: {
        ...googleSession.user,
        app_metadata: { provider: 'google', providers: ['google', 'email'] }
      }
    }
  })
  const emailController = createHarness(emailHarness)
  await emailController.controller.initialize()
  assert.equal(emailController.controller.getState().authMethod, 'email')
})

test('verified claims distinguish an email OTP on a Google-owned user', async () => {
  const googleOwnedEmailHarness = createClient({
    claimsResponse: {
      data: {
        claims: {
          sub: 'user-google-owned',
          amr: [{ method: 'magiclink' }]
        }
      },
      error: null
    },
    session: {
      access_token: 'private-access-token',
      user: {
        id: 'user-google-owned',
        email: 'learner@example.com',
        app_metadata: { provider: 'google', providers: ['google'] }
      }
    }
  })
  const googleOwnedEmailController = createHarness(googleOwnedEmailHarness)

  await googleOwnedEmailController.controller.initialize()

  assert.equal(
    googleOwnedEmailController.controller.getState().authMethod,
    'email'
  )
  assert.deepEqual(googleOwnedEmailHarness.calls.at(-1), [
    'getClaims',
    'private-access-token'
  ])

  const emailOnlyHarness = createClient({
    claimsResponse: {
      data: {
        claims: {
          sub: 'user-email-only',
          amr: [{ method: 'magiclink' }]
        }
      },
      error: null
    },
    session: {
      access_token: 'private-email-access-token',
      user: {
        id: 'user-email-only',
        email: 'email-only@example.com',
        app_metadata: { provider: 'email', providers: ['email'] }
      }
    }
  })
  const emailOnlyController = createHarness(emailOnlyHarness)

  await emailOnlyController.controller.initialize()

  assert.equal(emailOnlyController.controller.getState().authMethod, 'email')
  assert.equal(
    emailOnlyHarness.calls.some(call => call[0] === 'getClaims'),
    false
  )
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
    authMethod: null,
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

test('Google ID-token sign-in exchanges one ephemeral credential without redirecting', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'https://www.edenia.study/?internal_test=1'
  })

  assert.equal(await harness.controller.signInWithGoogleIdToken({
    token: 'private-google-id-token',
    nonce: 'private-raw-nonce'
  }), true)
  assert.deepEqual(clientHarness.calls, [[
    'signInWithIdToken',
    {
      provider: 'google',
      token: 'private-google-id-token',
      nonce: 'private-raw-nonce'
    }
  ]])
  assert.equal(harness.controller.getState().busyAction, 'google-sign-in')
  assert.equal(
    JSON.stringify(harness.controller.getState()).includes('private'),
    false
  )
})

test('Google ID-token failures expose one safe error and no credential details', async () => {
  const missingHarness = createHarness(createClient())
  assert.equal(
    await missingHarness.controller.signInWithGoogleIdToken({
      token: '', nonce: 'nonce'
    }),
    false
  )
  assert.equal(
    missingHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.GOOGLE_SIGN_IN_FAILED
  )

  const failedClient = createClient({
    googleIdTokenError: new Error('provider secret')
  })
  const failedHarness = createHarness(failedClient)
  assert.equal(await failedHarness.controller.signInWithGoogleIdToken({
    token: 'private-token',
    nonce: 'private-nonce'
  }), false)
  assert.equal(
    failedHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.GOOGLE_SIGN_IN_FAILED
  )
  assert.equal(
    JSON.stringify(failedHarness.controller.getState()).includes('private'),
    false
  )
})

test('email sign-in requests a localized same-device code without a redirect', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'http://localhost:8000/?internal_test=1'
  })

  assert.equal(
    await harness.controller.requestEmailCode(
      '  Learner@Example.COM  ',
      { locale: 'fr' }
    ),
    true
  )
  assert.deepEqual(clientHarness.calls, [[
    'signInWithOtp',
    {
      email: 'learner@example.com',
      options: {
        data: { edenia_auth_locale: 'fr' },
        shouldCreateUser: true
      }
    }
  ]])
  assert.equal(
    harness.controller.getState().notice,
    ACCOUNT_AUTH_NOTICES.EMAIL_CODE_SENT
  )
})

test('email-code requests forward one bounded CAPTCHA token and enforce cooldown', async () => {
  let now = 10_000
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    now: () => now
  })

  assert.equal(await harness.controller.requestEmailCode(
    'learner@example.com',
    { captchaToken: 'turnstile-token' }
  ), true)
  assert.deepEqual(clientHarness.calls[0], [
    'signInWithOtp',
    {
      email: 'learner@example.com',
      options: {
        captchaToken: 'turnstile-token',
        data: { edenia_auth_locale: 'en' },
        shouldCreateUser: true
      }
    }
  ])
  assert.equal(
    await harness.controller.requestEmailCode('learner@example.com'),
    false
  )
  assert.equal(
    harness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.EMAIL_CODE_COOLDOWN
  )
  assert.equal(clientHarness.calls.length, 1)

  now += 60_000
  assert.equal(
    await harness.controller.requestEmailCode('learner@example.com'),
    true
  )
  assert.equal(clientHarness.calls.length, 2)
})

test('six-digit email verification signs in without exposing the code or session', async () => {
  const clientHarness = createClient({
    emailVerificationSession: {
      access_token: 'private-access-token',
      refresh_token: 'private-refresh-token',
      user: {
        id: 'email-user-id',
        email: 'learner@example.com',
        app_metadata: { provider: 'email' }
      }
    }
  })
  const harness = createHarness(clientHarness)

  await harness.controller.requestEmailCode('learner@example.com')
  assert.equal(await harness.controller.verifyEmailCode(' 123456 '), true)
  assert.deepEqual(clientHarness.calls, [
    ['signInWithOtp', {
      email: 'learner@example.com',
      options: {
        data: { edenia_auth_locale: 'en' },
        shouldCreateUser: true
      }
    }],
    ['verifyOtp', {
      email: 'learner@example.com',
      token: '123456',
      type: 'email'
    }]
  ])
  assert.equal(harness.controller.getState().sessionState, 'signed-in')
  assert.equal(harness.controller.getState().userId, 'email-user-id')
  const publicState = JSON.stringify(harness.controller.getState())
  assert.doesNotMatch(publicState, /123456|access-token|refresh-token/u)
})

test('email verification keeps invalid and expired codes safely retryable', async () => {
  const invalidHarness = createHarness(createClient())
  await invalidHarness.controller.requestEmailCode('learner@example.com')
  assert.equal(await invalidHarness.controller.verifyEmailCode('12a45'), false)
  assert.equal(
    invalidHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.INVALID_EMAIL_CODE
  )
  assert.equal(
    invalidHarness.controller.getState().notice,
    ACCOUNT_AUTH_NOTICES.EMAIL_CODE_SENT
  )

  const expiredHarness = createHarness(createClient({
    emailVerificationError: { code: 'otp_expired', status: 403 }
  }))
  await expiredHarness.controller.requestEmailCode('learner@example.com')
  assert.equal(await expiredHarness.controller.verifyEmailCode('654321'), false)
  assert.equal(
    expiredHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.EMAIL_CODE_EXPIRED
  )
  assert.equal(
    expiredHarness.controller.getState().notice,
    ACCOUNT_AUTH_NOTICES.EMAIL_CODE_SENT
  )

  const rejectedHarness = createHarness(createClient({
    emailVerificationError: { code: 'invalid_otp', status: 403 }
  }))
  await rejectedHarness.controller.requestEmailCode('learner@example.com')
  assert.equal(await rejectedHarness.controller.verifyEmailCode('123456'), false)
  assert.equal(
    rejectedHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.INVALID_EMAIL_CODE
  )
})

test('email transport maps rate limits and offline failures to safe feedback', async () => {
  const rateLimitedHarness = createHarness(createClient({
    emailRequestError: {
      code: 'over_email_send_rate_limit',
      message: 'private provider limit details',
      status: 429
    }
  }))
  assert.equal(
    await rateLimitedHarness.controller.requestEmailCode('learner@example.com'),
    false
  )
  assert.equal(
    rateLimitedHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.EMAIL_RATE_LIMITED
  )

  const offlineHarness = createHarness(createClient({
    emailRequestError: new TypeError('private network details')
  }), { isOnline: () => false })
  assert.equal(
    await offlineHarness.controller.requestEmailCode('learner@example.com'),
    false
  )
  assert.equal(
    offlineHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.OFFLINE
  )
  assert.doesNotMatch(
    JSON.stringify(offlineHarness.controller.getState()),
    /private|provider|network/u
  )
})

test('sign-in validation and provider failures publish safe controller errors', async () => {
  const invalidEmailClient = createClient()
  const invalidEmailHarness = createHarness(invalidEmailClient)
  assert.equal(await invalidEmailHarness.controller.requestEmailCode('invalid'), false)
  assert.deepEqual(invalidEmailClient.calls, [])
  assert.equal(
    invalidEmailHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.INVALID_EMAIL
  )

  const googleClient = createClient({ googleIdTokenError: new Error('secret') })
  const googleHarness = createHarness(googleClient)
  assert.equal(await googleHarness.controller.signInWithGoogleIdToken({
    nonce: 'private-nonce',
    token: 'private-token'
  }), false)
  assert.equal(
    googleHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.GOOGLE_SIGN_IN_FAILED
  )

  const emailClient = createClient({ emailRequestError: new Error('secret') })
  const emailHarness = createHarness(emailClient)
  assert.equal(
    await emailHarness.controller.requestEmailCode('learner@example.com'),
    false
  )
  assert.equal(
    emailHarness.controller.getState().error,
    ACCOUNT_AUTH_ERRORS.EMAIL_CODE_REQUEST_FAILED
  )
})

test('sign-in fails closed before calling Supabase from an unknown location', async () => {
  const clientHarness = createClient()
  const harness = createHarness(clientHarness, {
    href: 'https://preview.example/Edenia/?internal_test=1'
  })

  assert.equal(await harness.controller.signInWithGoogleIdToken({
    nonce: 'private-nonce',
    token: 'private-token'
  }), false)
  assert.equal(
    await harness.controller.requestEmailCode('learner@example.com'),
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
