import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getTrackedAnkiCounts,
  isAnkiEnabled,
  normalizeAnkiDateKeys,
  normalizeAnkiTrackingConfig,
  setAnkiResumeBaselineFromStats,
  setPendingAnkiResumeBaseline
} from '../../src/state/anki-state.js'

test('Anki enablement and tracked counts preserve default-on coercion', () => {
  assert.equal(isAnkiEnabled(null), true)
  assert.equal(isAnkiEnabled({ config: { ankiEnabled: false } }), false)
  assert.equal(isAnkiEnabled({ config: { ankiEnabled: 0 } }), true)
  assert.deepEqual(getTrackedAnkiCounts(null, '2026-07-28'), {
    reviewed: 0,
    created: 0
  })
  assert.deepEqual(getTrackedAnkiCounts({
    anki: {
      '2026-07-28': {
        reviewed: '7.9',
        created: -4
      }
    }
  }, '2026-07-28'), {
    reviewed: 7,
    created: 0
  })
})

test('Anki config normalization preserves mutation and change-reporting quirks', () => {
  const state = {
    config: {
      ankiEnabled: 0,
      ankiDisabledAt: null,
      ankiResumeBaselines: {},
      ankiPendingResumeBaseline: null
    }
  }
  assert.equal(normalizeAnkiTrackingConfig(state), false)
  assert.equal(state.config.ankiEnabled, true)

  const disabled = {
    config: {
      ankiEnabled: false,
      ankiDisabledAt: 'invalid',
      ankiResumeBaselines: [],
      ankiPendingResumeBaseline: { missing: 'dateKey' }
    }
  }
  assert.equal(normalizeAnkiTrackingConfig(disabled), true)
  assert.equal(disabled.config.ankiEnabled, false)
  assert.equal(Number.isNaN(new Date(disabled.config.ankiDisabledAt).getTime()), false)
  assert.deepEqual(disabled.config.ankiResumeBaselines, {})
  assert.equal(disabled.config.ankiPendingResumeBaseline, null)

  const enabled = {
    config: {
      ankiEnabled: true,
      ankiDisabledAt: '2026-07-28T01:02:03.000Z',
      ankiResumeBaselines: {},
      ankiPendingResumeBaseline: { dateKey: '2026-07-28' }
    }
  }
  assert.equal(normalizeAnkiTrackingConfig(enabled), true)
  assert.equal(enabled.config.ankiDisabledAt, null)
  assert.deepEqual(enabled.config.ankiPendingResumeBaseline, { dateKey: '2026-07-28' })
})

test('resume baselines preserve raw and already-tracked counts', () => {
  const state = {
    config: {
      ankiResumeBaselines: [],
      ankiPendingResumeBaseline: { dateKey: '2026-07-28' }
    },
    anki: {
      '2026-07-28': {
        reviewed: 9,
        created: 2
      }
    }
  }
  const baseline = setAnkiResumeBaselineFromStats(state, {
    ankiDateKey: '2026-07-28',
    reviewedToday: '12.8',
    newToday: -1
  }, '2026-07-28T04:00:00.000Z')
  assert.deepEqual(baseline, {
    rawReviewed: 12,
    rawCreated: 0,
    trackedReviewed: 9,
    trackedCreated: 2,
    createdAt: '2026-07-28T04:00:00.000Z'
  })
  assert.equal(state.config.ankiResumeBaselines['2026-07-28'], baseline)
  assert.equal(state.config.ankiPendingResumeBaseline, null)
  assert.equal(setAnkiResumeBaselineFromStats(null, {}), null)
  assert.equal(setAnkiResumeBaselineFromStats(state, null), null)
})

test('pending baselines retain explicit date and timestamp values', () => {
  const state = {
    config: {},
    anki: {
      custom: {
        reviewed: 3,
        created: 4
      }
    }
  }
  const pending = setPendingAnkiResumeBaseline(
    state,
    'custom',
    'created-at-is-not-normalized'
  )
  assert.deepEqual(pending, {
    dateKey: 'custom',
    trackedReviewed: 3,
    trackedCreated: 4,
    createdAt: 'created-at-is-not-normalized'
  })
  assert.equal(state.config.ankiPendingResumeBaseline, pending)
  assert.equal(setPendingAnkiResumeBaseline(null, 'custom', 'now'), null)
})

test('AnkiConnect entries re-key at the 04:00 boundary and merge maxima', () => {
  const state = {
    anki: {
      '2026-07-28': {
        reviewed: 7,
        created: 4,
        loggedAt: '2026-07-29T05:00:00.000Z',
        source: 'manual'
      },
      'legacy-key': {
        reviewed: 9,
        created: 2,
        loggedAt: '2026-07-28T03:30:00',
        source: 'ankiconnect'
      },
      invalid: {
        reviewed: 99,
        created: 99,
        loggedAt: 'not-a-date',
        source: 'ankiconnect'
      }
    }
  }
  assert.equal(normalizeAnkiDateKeys(state), true)
  assert.equal('legacy-key' in state.anki, false)
  assert.deepEqual(state.anki['2026-07-27'], {
    reviewed: 9,
    created: 2,
    loggedAt: '2026-07-28T03:30:00',
    source: 'ankiconnect'
  })
  assert.equal(state.anki.invalid.reviewed, 99)
  assert.equal(normalizeAnkiDateKeys(state), false)
})

test('Anki date normalization preserves merge and malformed-state behavior', () => {
  const loggedAt = '2026-07-28T03:30:00'
  const state = {
    anki: {
      '2026-07-27': {
        reviewed: 10,
        created: 1,
        loggedAt: '2026-07-28T03:45:00',
        source: 'manual'
      },
      old: {
        reviewed: 3,
        created: 8,
        loggedAt,
        source: 'ankiconnect'
      }
    }
  }
  normalizeAnkiDateKeys(state)
  assert.deepEqual(state.anki['2026-07-27'], {
    reviewed: 10,
    created: 8,
    loggedAt: '2026-07-28T03:45:00',
    source: 'manual'
  })

  for (const malformed of [null, {}, { anki: null }, { anki: [] }]) {
    assert.equal(normalizeAnkiDateKeys(malformed), false)
  }
})
