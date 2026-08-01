import assert from 'node:assert/strict'
import test from 'node:test'

import {
  consumeBillingRateLimit,
  hashRateLimitSubject,
} from './billing-rate-limit.ts'

test('hashes rate-limit identities before sending them to the database', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = []
  const result = await consumeBillingRateLimit({
    rpc(name, params) {
      calls.push({ name, params })
      return {
        async single() {
          return {
            data: { allowed: true, retry_after_seconds: 0 },
            error: null,
          }
        },
      }
    },
  }, {
    scope: 'checkout-user',
    subject: 'user-1',
    windowSeconds: 600,
    maximumRequests: 5,
  })

  assert.deepEqual(result, { allowed: true, retryAfterSeconds: 1 })
  assert.equal(calls[0].name, 'consume_billing_rate_limit')
  assert.equal(calls[0].params.p_subject_hash, await hashRateLimitSubject('user-1'))
  assert.notEqual(calls[0].params.p_subject_hash, 'user-1')
})

test('preserves a denied rate-limit retry delay and rejects dependency errors', async () => {
  const denied = await consumeBillingRateLimit({
    rpc() {
      return {
        async single() {
          return {
            data: { allowed: false, retry_after_seconds: 83 },
            error: null,
          }
        },
      }
    },
  }, {
    scope: 'checkout-user',
    subject: 'user-1',
    windowSeconds: 600,
    maximumRequests: 5,
  })
  assert.deepEqual(denied, { allowed: false, retryAfterSeconds: 83 })

  await assert.rejects(
    consumeBillingRateLimit({
      rpc() {
        return {
          async single() {
            return { data: null, error: { message: 'database unavailable' } }
          },
        }
      },
    }, {
      scope: 'checkout-user',
      subject: 'user-1',
      windowSeconds: 600,
      maximumRequests: 5,
    }),
    /database unavailable/,
  )
})
