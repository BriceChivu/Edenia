import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isUniqueViolation,
  requireAffectedRows,
  requireDependencySuccess,
  WebhookDependencyError,
} from './webhook-results.ts'

test('returns dependency data when the operation succeeds', () => {
  const data = requireDependencySuccess({
    data: { user: { id: 'user_1' } },
    error: null,
  }, 'Create user')

  assert.equal(data.user.id, 'user_1')
})

test('throws a retryable processing error for a dependency failure', () => {
  assert.throws(
    () => requireDependencySuccess({
      data: null,
      error: { code: '08006', message: 'database unavailable' },
    }, 'Upsert subscription'),
    (error: unknown) => {
      assert.ok(error instanceof WebhookDependencyError)
      assert.equal(error.operation, 'Upsert subscription')
      assert.equal(error.code, '08006')
      return true
    },
  )
})

test('treats a zero-row update as a processing failure', () => {
  assert.throws(
    () => requireAffectedRows({
      data: [],
      error: null,
    }, 'Cancel subscription'),
    /no matching subscription row/,
  )
})

test('accepts an update that affected at least one row', () => {
  const rows = requireAffectedRows({
    data: [{ user_id: 'user_1' }],
    error: null,
  }, 'Update subscription')

  assert.equal(rows.length, 1)
})

test('recognizes only Postgres unique violations as safe duplicates', () => {
  assert.equal(isUniqueViolation({ code: '23505', message: 'duplicate key' }), true)
  assert.equal(isUniqueViolation({ code: '42501', message: 'permission denied' }), false)
  assert.equal(isUniqueViolation(null), false)
})
