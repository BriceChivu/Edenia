import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isValidStateShape,
  sanitizeConfigForStorage
} from '../../src/state/persistence-contract.js'

test('config-cookie sanitization removes only the four legacy private fields', () => {
  const channels = [{ id: 'one' }]
  const source = {
    apiKey: 'legacy-key',
    ankiDisabledAt: '2026-07-28T00:00:00.000Z',
    ankiResumeBaselines: { today: {} },
    ankiPendingResumeBaseline: { dateKey: '2026-07-28' },
    weeklyGoalHours: 4,
    includeShorts: false,
    channels,
    trackedChannelPolicy: {
      version: 1,
      freeAllowance: 7,
      grandfatheredAt: '2026-08-02T00:00:00.000Z',
      lastConfirmedTier: 'free',
      downgradePending: false
    },
    customFutureField: null
  }

  const sanitized = sanitizeConfigForStorage(source)
  assert.deepEqual(sanitized, {
    weeklyGoalHours: 4,
    includeShorts: false,
    channels,
    trackedChannelPolicy: source.trackedChannelPolicy,
    customFutureField: null
  })
  assert.notEqual(sanitized, source)
  assert.equal(sanitized.channels, channels)
  assert.deepEqual(sanitizeConfigForStorage(), {})
  assert.throws(() => sanitizeConfigForStorage(null), TypeError)
})

test('state-shape validation preserves the intentionally narrow legacy gate', () => {
  const valid = {
    config: {},
    videos: {},
    anki: {}
  }
  assert.equal(isValidStateShape(valid), true)
  assert.equal(isValidStateShape({
    ...valid,
    config: []
  }), true)
  assert.equal(isValidStateShape({
    ...valid,
    videos: Object.create(null),
    anki: Object.create(null)
  }), true)

  for (const invalid of [
    null,
    undefined,
    {},
    { config: {}, videos: {}, anki: null },
    { config: {}, videos: [], anki: {} },
    { config: {}, videos: {}, anki: [] },
    { config: 'config', videos: {}, anki: {} }
  ]) {
    assert.equal(isValidStateShape(invalid), false)
  }
})

test('persistence contracts preserve property access and propagated errors', () => {
  const throwingConfig = {}
  Object.defineProperty(throwingConfig, 'apiKey', {
    enumerable: true,
    get() {
      throw new Error('config getter failed')
    }
  })
  assert.throws(
    () => sanitizeConfigForStorage(throwingConfig),
    /config getter failed/
  )

  const throwingState = {}
  Object.defineProperty(throwingState, 'config', {
    get() {
      throw new Error('state getter failed')
    }
  })
  assert.throws(
    () => isValidStateShape(throwingState),
    /state getter failed/
  )
})
