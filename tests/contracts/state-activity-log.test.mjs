import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTIVITY_LOG_DEDUPE_WINDOW_MS,
  ACTIVITY_LOG_LIMIT,
  appendActivityLog,
  makeActivityLogId,
  normalizeActivityLogState
} from '../../src/state/activity-log.js'
import { setCurrentLocale } from '../../src/i18n/runtime.js'

setCurrentLocale('en')

test('activity-log limits and generated IDs preserve the legacy contract', () => {
  assert.equal(ACTIVITY_LOG_LIMIT, 500)
  assert.equal(ACTIVITY_LOG_DEDUPE_WINDOW_MS, 1_800_000)
  assert.match(makeActivityLogId(), /^[a-z0-9]+-[a-z0-9]{0,6}$/)
})

test('activity-log normalization preserves defaults, ordering, and metadata identity', () => {
  const meta = { nested: true }
  const state = {
    activityLog: [
      null,
      'invalid',
      {
        id: 'older',
        createdAt: '2026-07-27T00:00:00.000Z',
        actor: 'auto',
        type: 'refresh',
        status: 'success',
        title: 'Older',
        detail: 'done',
        meta
      },
      {
        id: 'newer',
        createdAt: '2026-07-28T00:00:00.000Z',
        actor: 'other',
        type: '',
        status: 'unknown',
        title: '',
        detail: 42,
        meta: []
      }
    ]
  }
  assert.equal(normalizeActivityLogState(state), true)
  assert.deepEqual(state.activityLog[0], {
    id: 'newer',
    createdAt: '2026-07-28T00:00:00.000Z',
    actor: 'user',
    type: 'general',
    status: 'info',
    title: 'Activity log',
    detail: ''
  })
  assert.equal(state.activityLog[1].meta, meta)
  assert.equal(normalizeActivityLogState(state), false)
})

test('activity-log normalization retains only the newest 500 entries', () => {
  const state = {
    activityLog: Array.from({ length: 505 }, (_, index) => ({
      id: `entry-${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      actor: 'user',
      type: 'general',
      status: 'info',
      title: 'Entry',
      detail: String(index)
    }))
  }
  normalizeActivityLogState(state)
  assert.equal(state.activityLog.length, 500)
  assert.equal(state.activityLog[0].id, 'entry-504')
  assert.equal(state.activityLog.at(-1).id, 'entry-5')
})

test('activity-log appends dedupe by type, status, and detail only', () => {
  const state = {
    activityLog: [{
      id: 'previous',
      createdAt: '2026-07-28T00:00:00.000Z',
      actor: 'user',
      type: 'refresh',
      status: 'success',
      title: 'First title',
      detail: 'done'
    }]
  }
  assert.equal(appendActivityLog(state, {
    createdAt: '2026-07-28T00:29:59.999Z',
    type: 'refresh',
    status: 'success',
    title: 'Different title',
    detail: 'done'
  }), null)
  assert.equal(state.activityLog.length, 1)

  const atBoundary = appendActivityLog(state, {
    createdAt: '2026-07-28T00:30:00.000Z',
    type: 'refresh',
    status: 'success',
    detail: 'done'
  })
  assert.ok(atBoundary)
  assert.equal(state.activityLog[0], atBoundary)

  assert.equal(appendActivityLog(state, {
    createdAt: '2026-07-27T00:00:00.000Z',
    type: 'refresh',
    status: 'success',
    detail: 'done'
  }), null)
})

test('activity-log helpers preserve missing-state and mutation failures', () => {
  assert.equal(normalizeActivityLogState(null), false)
  assert.equal(appendActivityLog(null, {}), null)
  assert.throws(
    () => normalizeActivityLogState(Object.freeze({})),
    TypeError
  )
})
