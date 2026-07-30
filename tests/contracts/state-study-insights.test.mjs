import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isStudyInsightsEnabled,
  normalizeStudyInsightConfig,
  STUDY_INSIGHT_LOOKBACK_DAYS,
  STUDY_INSIGHT_TIME_WINDOWS,
  STUDY_INSIGHT_VARIANT_COUNT
} from '../../src/state/study-insights-state.js'

function insight(overrides = {}) {
  return {
    key: 'insight-key',
    insightId: 'insight-id',
    type: 'weekly-summary',
    recordedAt: '2026-07-28T01:02:03.000Z',
    ...overrides
  }
}

test('study-insight public constants and enablement remain exact', () => {
  assert.equal(STUDY_INSIGHT_LOOKBACK_DAYS, 42)
  assert.equal(STUDY_INSIGHT_VARIANT_COUNT, 2)
  assert.deepEqual(STUDY_INSIGHT_TIME_WINDOWS, [
    { id: 'morning', startHour: 5, endHour: 12 },
    { id: 'afternoon', startHour: 12, endHour: 17 },
    { id: 'evening', startHour: 17, endHour: 22 },
    { id: 'night', startHour: 22, endHour: 5 }
  ])
  assert.equal(isStudyInsightsEnabled(null), true)
  assert.equal(isStudyInsightsEnabled({ config: {} }), true)
  assert.equal(isStudyInsightsEnabled({
    config: { studyInsights: { enabled: false } }
  }), false)
  assert.equal(isStudyInsightsEnabled({
    config: { studyInsights: { enabled: 0 } }
  }), true)
})

test('study-insight config defaults and serialized change detection remain exact', () => {
  const state = { config: {} }
  assert.equal(normalizeStudyInsightConfig(state), true)
  assert.deepEqual(state.config.studyInsights, {
    enabled: true,
    collapsed: false,
    history: []
  })
  assert.equal(normalizeStudyInsightConfig(state), false)
  assert.equal(normalizeStudyInsightConfig(null), false)
  assert.equal(normalizeStudyInsightConfig({}), false)
})

test('study-insight entries retain legacy coercion, clipping, and truncation', () => {
  const state = {
    config: {
      studyInsights: {
        enabled: false,
        collapsed: true,
        history: [
          insight({
            key: 'k'.repeat(150),
            insightId: 'i'.repeat(90),
            variant: 99,
            windowId: 'morning',
            weekdayIndex: 8,
            percent: 140.4,
            comparisonPercent: -3,
            recentMinutes: '4.6',
            previousMinutes: -2,
            suggestedMinutes: 0,
            gapDays: 2.6,
            activeDays: -1,
            ankiDays: 2.4,
            reviewedCards: '8.7',
            ankiCreated: -3,
            totalSeconds: 12.6,
            videoCount: 3.7,
            topVideoTitle: 't'.repeat(200),
            topVideoSeconds: 9.5,
            observationDays: 99,
            channelBreakdown: [
              { name: 'n'.repeat(120), seconds: 8.6 },
              { name: 'zero', seconds: 0 },
              null,
              { name: '', seconds: 5 }
            ]
          })
        ]
      }
    }
  }
  normalizeStudyInsightConfig(state)
  const [entry] = state.config.studyInsights.history
  assert.equal(state.config.studyInsights.enabled, false)
  assert.equal(state.config.studyInsights.collapsed, true)
  assert.equal(entry.key.length, 140)
  assert.equal(entry.insightId.length, 80)
  assert.equal(entry.variant, 1)
  assert.equal(entry.windowId, 'morning')
  assert.equal(entry.weekdayIndex, null)
  assert.equal(entry.percent, 100)
  assert.equal(entry.comparisonPercent, 0)
  assert.equal(entry.recentMinutes, 5)
  assert.equal(entry.previousMinutes, 0)
  assert.equal(entry.suggestedMinutes, 1)
  assert.equal(entry.gapDays, 3)
  assert.equal(entry.activeDays, 0)
  assert.equal(entry.ankiDays, 2)
  assert.equal(entry.reviewedCards, 9)
  assert.equal(entry.ankiCreated, 0)
  assert.equal(entry.totalSeconds, 13)
  assert.equal(entry.videoCount, 4)
  assert.equal(entry.topVideoTitle.length, 180)
  assert.equal(entry.topVideoSeconds, 10)
  assert.equal(entry.observationDays, 42)
  assert.deepEqual(entry.channelBreakdown, [{
    name: 'n'.repeat(100),
    seconds: 9
  }])
})

test('history sorting, normalized-key dedupe, legacy variants, and limit remain exact', () => {
  const entries = Array.from({ length: 14 }, (_, index) => insight({
    key: `key-${index}`,
    insightId: index >= 11 ? 'shared' : `id-${index}`,
    variant: undefined,
    recordedAt: new Date(Date.UTC(2026, 6, 1 + index)).toISOString()
  }))
  entries.push(insight({
    key: `${'x'.repeat(140)}-first`,
    insightId: 'dedupe',
    recordedAt: '2026-08-01T00:00:00.000Z'
  }))
  entries.push(insight({
    key: `${'x'.repeat(140)}-second`,
    insightId: 'dedupe',
    recordedAt: '2026-07-31T00:00:00.000Z'
  }))
  entries.push(insight({ key: '', recordedAt: '2026-09-01T00:00:00.000Z' }))
  entries.push(insight({ key: 'bad-type', type: 'unknown' }))
  entries.push(insight({ key: 'bad-date', recordedAt: 'invalid' }))

  const state = {
    config: {
      studyInsights: {
        history: entries
      }
    }
  }
  normalizeStudyInsightConfig(state)
  const history = state.config.studyInsights.history
  assert.equal(history.length, 12)
  assert.equal(history[0].key, 'x'.repeat(140))
  assert.equal(history.filter(entry => entry.key === 'x'.repeat(140)).length, 1)
  assert.deepEqual(
    history.filter(entry => entry.insightId === 'shared').map(entry => entry.variant),
    [0, 1, 0]
  )
  assert.ok(
    history.every((entry, index) => (
      index === 0
      || new Date(history[index - 1].recordedAt) >= new Date(entry.recordedAt)
    ))
  )
})

test('study-insight normalization preserves mutation failures', () => {
  assert.throws(
    () => normalizeStudyInsightConfig(Object.freeze({
      config: Object.freeze({})
    })),
    TypeError
  )
})
