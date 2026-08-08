import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildStudyGuidance,
  STUDY_GUIDANCE_LOOKBACK_DAYS,
  STUDY_GUIDANCE_VERSION
} from '../../src/domain/study-guidance.js'

function day(dateKey, videoMinutes = 0, overrides = {}) {
  return {
    dateKey,
    videoSeconds: videoMinutes * 60,
    ...overrides
  }
}

function representativeHistory() {
  return [
    day('2026-07-07', 5),
    day('2026-07-13', 50),
    day('2026-07-14', 45),
    day('2026-07-15', 20),
    day('2026-07-17', 70),
    day('2026-07-19', 15),
    day('2026-07-20', 55),
    day('2026-07-21', 45),
    day('2026-07-23', 40),
    day('2026-07-24', 80),
    day('2026-07-26', 20),
    day('2026-07-27', 45),
    day('2026-07-29', 15),
    day('2026-07-30', 35),
    day('2026-07-31', 90),
    day('2026-08-03', 40),
    day('2026-08-04', 50)
  ]
}

test('study guidance public constants remain explicit', () => {
  assert.equal(STUDY_GUIDANCE_VERSION, 1)
  assert.equal(STUDY_GUIDANCE_LOOKBACK_DAYS, 42)
})

test('builds an upcoming extra-day recommendation from successful history', () => {
  const guidance = buildStudyGuidance({
    studyDays: representativeHistory(),
    referenceDateKey: '2026-08-04'
  })

  assert.equal(guidance.type, 'extra-day')
  assert.equal(guidance.completeWeeks, 3)
  assert.equal(guidance.confidence, 'emerging')
  assert.equal(guidance.weekdayIndex, 3)
  assert.equal(guidance.successfulWeekdayCount, 2)
  assert.equal(guidance.observedWeekdayCount, 3)
  assert.equal(guidance.suggestedMinutes, 20)
  assert.equal(guidance.usualWeekSeconds, 200 * 60)
  assert.equal(guidance.usualWeekActiveDays, 5)
  assert.equal(guidance.currentWeekSeconds, 90 * 60)
})

test('ignores legacy weekly-goal values completely', () => {
  const input = {
    studyDays: representativeHistory(),
    referenceDateKey: '2026-08-04'
  }
  const withoutGoal = buildStudyGuidance(input)
  const withSmallGoal = buildStudyGuidance({ ...input, weeklyGoalHours: 1 })
  const withLargeGoal = buildStudyGuidance({ ...input, weeklyGoalHours: 99 })

  assert.deepEqual(withSmallGoal, withoutGoal)
  assert.deepEqual(withLargeGoal, withoutGoal)
})

test('excludes the first partial calendar week', () => {
  const guidance = buildStudyGuidance({
    studyDays: representativeHistory(),
    referenceDateKey: '2026-08-04'
  })

  assert.equal(guidance.completeWeeks, 3)
  assert.equal(guidance.usualWeekSeconds, 200 * 60)
})

test('returns no guidance before two complete weeks exist', () => {
  assert.equal(buildStudyGuidance({
    studyDays: [
      day('2026-07-28', 30),
      day('2026-08-03', 25)
    ],
    referenceDateKey: '2026-08-04'
  }), null)
})

test('uses a week check-in when every recurring day is already established', () => {
  const studyDays = []
  for (const weekStartDay of [6, 13, 20, 27]) {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(2026, 6, weekStartDay + offset)
      const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-')
      studyDays.push(day(dateKey, 30))
    }
  }
  studyDays.push(day('2026-08-03', 10))
  studyDays.push(day('2026-08-04', 5))

  const guidance = buildStudyGuidance({
    studyDays,
    referenceDateKey: '2026-08-04'
  })

  assert.equal(guidance.type, 'weekly-check-in')
  assert.equal(guidance.completeWeeks, 4)
  assert.equal(guidance.confidence, 'strong')
  assert.equal(guidance.comparisonDirection, 'below')
  assert.equal(guidance.usualThroughTodaySeconds, 60 * 60)
  assert.equal(guidance.currentWeekSeconds, 15 * 60)
})

test('rejects invalid dates and future activity', () => {
  assert.equal(buildStudyGuidance({
    studyDays: representativeHistory(),
    referenceDateKey: 'invalid'
  }), null)

  const guidance = buildStudyGuidance({
    studyDays: [
      ...representativeHistory(),
      day('2026-08-05', 600)
    ],
    referenceDateKey: '2026-08-04'
  })
  assert.equal(guidance.currentWeekSeconds, 90 * 60)
})
