import assert from 'node:assert/strict'
import test from 'node:test'
import { createCanaryOperationGuard } from '../../scripts/canary-operation-guard.mjs'

const request = { method: 'POST', url: 'http://localhost:8000/rest/v1/rpc/resolve_my_learner_profile' }
const rules = [{ ...request, id: 'resolve', expected: 1 }]
const create = (options = {}) => createCanaryOperationGuard({ rules, startedAt: 1000, timeoutMs: 1000, now: () => 1001, ...options })

test('exact operation count succeeds and a sealed guard refuses further dispatch', () => {
  const guard = create()
  assert.equal(guard.allow(request), true)
  assert.deepEqual(guard.finish(), { complete: true, counts: { resolve: 1 } })
  assert.equal(guard.allow(request), false)
})

test('unexpected mutation, endpoint, method, query, or duplicate poisons the guard', () => {
  for (const unexpected of [
    { ...request, method: 'GET' },
    { ...request, url: request.url + '?unexpected=1' },
    { ...request, url: 'https://example.com/rest/v1/rpc/resolve_my_learner_profile' },
    { ...request, url: 'http://localhost:8000/rest/v1/rpc/start_over_learner_profile' }
  ]) {
    const guard = create()
    assert.equal(guard.allow(unexpected), false)
    assert.equal(guard.allow(request), false)
    assert.equal(guard.finish().complete, false)
  }
  const guard = create()
  assert.equal(guard.allow(request), true)
  assert.equal(guard.allow(request), false)
  assert.equal(guard.finish().complete, false)
})

test('timeout, clock reversal, cancellation, and missing operation cannot pass', () => {
  for (const time of [999, 2000, NaN, Infinity]) {
    const guard = create({ now: () => time })
    assert.equal(guard.allow(request), false)
    assert.equal(guard.finish().complete, false)
  }
  const interrupted = create()
  interrupted.abort()
  assert.equal(interrupted.allow(request), false)
  assert.equal(interrupted.finish().complete, false)
  assert.equal(create().finish().complete, false)
})

test('zero-count rules deny dispatch and results exclude private request details', () => {
  const guard = create({ rules: [{ ...request, id: 'forbidden', expected: 0 }] })
  assert.equal(guard.allow(request), false)
  const result = JSON.stringify(guard.finish())
  assert.equal(result.includes('localhost'), false)
  assert.equal(result.includes('resolve_my_learner_profile'), false)
})
