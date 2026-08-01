import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertOnlyKeys,
  BillingRequestError,
  getBearerToken,
  getClientAddress,
  isCheckoutSessionId,
  readJsonObject,
} from './billing-request.ts'

test('accepts a small JSON POST body and rejects unexpected fields', async () => {
  const body = await readJsonObject(new Request('https://example.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ plan: 'monthly' }),
  }))
  assert.deepEqual(body, { plan: 'monthly' })
  assert.doesNotThrow(() => assertOnlyKeys(body, ['plan']))
  assert.throws(
    () => assertOnlyKeys({ ...body, email: 'untrusted@example.com' }, ['plan']),
    (error: unknown) => error instanceof BillingRequestError
      && error.code === 'invalid_request',
  )
})

test('rejects non-POST, non-JSON, malformed, and oversized bodies', async () => {
  await assert.rejects(
    readJsonObject(new Request('https://example.test')),
    (error: unknown) => error instanceof BillingRequestError
      && error.status === 405,
  )
  await assert.rejects(
    readJsonObject(new Request('https://example.test', {
      method: 'POST',
      body: '{}',
    })),
    (error: unknown) => error instanceof BillingRequestError
      && error.status === 415,
  )
  await assert.rejects(
    readJsonObject(new Request('https://example.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })),
    (error: unknown) => error instanceof BillingRequestError
      && error.code === 'invalid_json',
  )
  await assert.rejects(
    readJsonObject(new Request('https://example.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'too large' }),
    }), 8),
    (error: unknown) => error instanceof BillingRequestError
      && error.status === 413,
  )
})

test('extracts authenticated and network request identity defensively', () => {
  assert.equal(getBearerToken('Bearer token-value'), 'token-value')
  assert.equal(getBearerToken('basic token-value'), null)
  assert.equal(getBearerToken(null), null)

  assert.equal(getClientAddress(new Headers({
    'cf-connecting-ip': '203.0.113.8',
    'x-forwarded-for': '198.51.100.4, 198.51.100.5',
  })), '203.0.113.8')
  assert.equal(getClientAddress(new Headers({
    'x-forwarded-for': '198.51.100.4, 198.51.100.5',
  })), '198.51.100.4')
})

test('accepts only bounded Stripe Checkout Session IDs', () => {
  assert.equal(isCheckoutSessionId('cs_test_abc123'), true)
  assert.equal(isCheckoutSessionId('cs_live_ABC123'), true)
  assert.equal(isCheckoutSessionId('sub_abc123'), false)
  assert.equal(isCheckoutSessionId('cs_test_bad-value'), false)
})
