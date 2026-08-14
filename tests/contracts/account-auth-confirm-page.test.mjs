import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ACCOUNT_AUTH_CONFIRM_STATES,
  createAccountAuthConfirmPage,
  getAccountAuthConfirmationReturnUrl,
  parseAccountAuthConfirmationFragment
} from '../../src/integrations/account-auth-confirm-page.js'

const TOKEN_HASH = 'a'.repeat(64)

function createDeferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

function createHarness({
  fragment = `#token_hash=${TOKEN_HASH}&type=email`,
  href = 'https://www.edenia.study/auth/confirm/',
  online = true,
  responses = [{ data: { session: {} }, error: null }]
} = {}) {
  const calls = []
  const navigations = []
  const states = []
  const pendingResponses = [...responses]
  const controller = createAccountAuthConfirmPage({
    client: {
      auth: {
        async verifyOtp(input) {
          calls.push(input)
          return pendingResponses.shift()
        }
      }
    },
    fragment,
    isOnline: () => online,
    location: { href },
    navigate(url) { navigations.push(url) },
    onStateChange(state) { states.push(state) }
  })
  return { calls, controller, navigations, states }
}

test('confirmation parser accepts only one bounded email TokenHash fragment', () => {
  assert.deepEqual(
    parseAccountAuthConfirmationFragment(
      `#token_hash=${TOKEN_HASH}&type=email`
    ),
    { tokenHash: TOKEN_HASH, type: 'email' }
  )
  for (const fragment of [
    '',
    '#',
    '#type=email',
    '#token_hash=short&type=email',
    `#token_hash=${TOKEN_HASH}&type=signup`,
    `#token_hash=${TOKEN_HASH}&type=email&extra=1`,
    `#token_hash=${TOKEN_HASH}&token_hash=${TOKEN_HASH}&type=email`,
    `#token_hash=${'x'.repeat(1025)}&type=email`,
    `?token_hash=${TOKEN_HASH}&type=email`
  ]) {
    assert.equal(parseAccountAuthConfirmationFragment(fragment), null, fragment)
  }
})

test('confirmation return destinations are an exact origin and path allowlist', () => {
  assert.equal(
    getAccountAuthConfirmationReturnUrl({
      href: 'https://www.edenia.study/auth/confirm/'
    }),
    'https://www.edenia.study/?internal_test=1&account=1'
  )
  assert.equal(
    getAccountAuthConfirmationReturnUrl({
      href: 'http://localhost:8000/auth/confirm/'
    }),
    'http://localhost:8000/?internal_test=1&account=1'
  )
  for (const href of [
    'https://edenia.study/auth/confirm/',
    'http://www.edenia.study/auth/confirm/',
    'https://www.edenia.study/auth/confirm',
    'https://www.edenia.study/auth/confirm/?next=https://attacker.example',
    'https://attacker.example/auth/confirm/'
  ]) {
    assert.equal(getAccountAuthConfirmationReturnUrl({ href }), null, href)
  }
})

test('scanner-style initialization never verifies until deliberate confirmation', async () => {
  const harness = createHarness()
  assert.deepEqual(harness.controller.initialize(), {
    status: ACCOUNT_AUTH_CONFIRM_STATES.READY
  })
  assert.deepEqual(harness.calls, [])

  assert.equal(await harness.controller.confirm(), true)
  assert.deepEqual(harness.calls, [{
    token_hash: TOKEN_HASH,
    type: 'email'
  }])
  assert.deepEqual(harness.navigations, [
    'https://www.edenia.study/?internal_test=1&account=1'
  ])
  assert.equal(
    harness.controller.getState().status,
    ACCOUNT_AUTH_CONFIRM_STATES.SUCCESS
  )
  assert.equal(await harness.controller.confirm(), false)
  assert.equal(harness.calls.length, 1)
})

test('concurrent confirmation clicks exchange the one-time capability once', async () => {
  const response = createDeferred()
  const harness = createHarness({ responses: [response.promise] })
  harness.controller.initialize()
  const first = harness.controller.confirm()
  const second = harness.controller.confirm()
  assert.equal(first, second)
  assert.equal(harness.calls.length, 1)
  response.resolve({ data: { session: {} }, error: null })
  assert.equal(await first, true)
})

test('offline and transient failures keep only an in-memory retry capability', async () => {
  const offline = createHarness({ online: false })
  offline.controller.initialize()
  assert.equal(await offline.controller.confirm(), false)
  assert.equal(
    offline.controller.getState().status,
    ACCOUNT_AUTH_CONFIRM_STATES.OFFLINE
  )
  assert.equal(offline.calls.length, 0)

  const retryable = createHarness({
    responses: [
      { data: null, error: { status: 503 } },
      { data: { session: {} }, error: null }
    ]
  })
  retryable.controller.initialize()
  assert.equal(await retryable.controller.confirm(), false)
  assert.equal(
    retryable.controller.getState().status,
    ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE
  )
  assert.equal(await retryable.controller.confirm(), true)
  assert.equal(retryable.calls.length, 2)

  const networkFailure = createHarness({
    responses: [
      {
        data: { session: null, user: null },
        error: { name: 'AuthRetryableFetchError', status: 0 }
      },
      { data: { session: {} }, error: null }
    ]
  })
  networkFailure.controller.initialize()
  assert.equal(await networkFailure.controller.confirm(), false)
  assert.equal(
    networkFailure.controller.getState().status,
    ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE
  )
  assert.equal(await networkFailure.controller.confirm(), true)
  assert.equal(networkFailure.calls.length, 2)
})

test('definitive invalid or used links discard the capability and cannot retry', async () => {
  const harness = createHarness({
    responses: [{ data: null, error: { status: 403 } }]
  })
  harness.controller.initialize()
  assert.equal(await harness.controller.confirm(), false)
  assert.equal(
    harness.controller.getState().status,
    ACCOUNT_AUTH_CONFIRM_STATES.INVALID
  )
  assert.equal(await harness.controller.confirm(), false)
  assert.equal(harness.calls.length, 1)
})

test('invalid links and integration boundaries fail closed without provider work', () => {
  const harness = createHarness({ fragment: '#token_hash=bad&type=email' })
  assert.equal(
    harness.controller.initialize().status,
    ACCOUNT_AUTH_CONFIRM_STATES.INVALID
  )
  assert.deepEqual(harness.calls, [])
  assert.throws(
    () => createAccountAuthConfirmPage({
      client: {},
      fragment: '',
      location: {},
      navigate() {},
      onStateChange() {}
    }),
    /requires browser callbacks/
  )
})

test('standalone entry consumes the scrubbed fragment without storage or analytics', async () => {
  const [entrySource, integrationSource, scrubberSource, html] =
    await Promise.all([
      readFile(new URL('../../src/account-auth-confirm-page.js', import.meta.url), 'utf8'),
      readFile(new URL('../../src/integrations/account-auth-confirm-page.js', import.meta.url), 'utf8'),
      readFile(new URL('../../auth/confirm/fragment-scrubber.js', import.meta.url), 'utf8'),
      readFile(new URL('../../auth/confirm/index.html', import.meta.url), 'utf8')
    ])
  assert.match(scrubberSource, /window\.location\.hash[\s\S]*history\.replaceState/)
  assert.match(entrySource, /delete window\.EDENIA_AUTH_CONFIRM_FRAGMENT/)
  assert.match(entrySource, /DOMContentLoaded', initializeConfirmation/)
  assert.match(entrySource, /window\.top === window\.self/)
  assert.doesNotMatch(
    `${entrySource}\n${integrationSource}\n${scrubberSource}`,
    /localStorage|sessionStorage|console\.|posthog|analytics\.js|trackEdenia/
  )
  assert.doesNotMatch(html, /app\.js|analytics\.js|posthog/i)
  assert.match(html, /name="referrer" content="no-referrer"/)
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/)
})
