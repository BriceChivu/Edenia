import assert from 'node:assert/strict'
import test from 'node:test'

import { corsHeaders, getCorsPreflightResponse } from './cors.ts'

test('returns a complete browser preflight response for OPTIONS', () => {
  const response = getCorsPreflightResponse(new Request('https://example.test', {
    method: 'OPTIONS',
  }))

  assert.equal(response?.status, 204)
  assert.equal(response?.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal(response?.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
  assert.equal(
    response?.headers.get('Access-Control-Allow-Headers'),
    corsHeaders['Access-Control-Allow-Headers'],
  )
})

test('does not intercept non-preflight requests', () => {
  assert.equal(
    getCorsPreflightResponse(new Request('https://example.test', { method: 'POST' })),
    null,
  )
})
