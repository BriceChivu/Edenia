import assert from 'node:assert/strict'
import test from 'node:test'
import { createIslandStartupController } from '../../scripts/tiny-swords-startup.js'

function harness() {
  let now = 0, next = 0, visible = true, eligible = true, valid = true
  const timers = new Map(), starts = [], retired = [], states = [], records = []
  const controller = createIslandStartupController({ now: () => now, random: () => 0,
    setTimer(fn, delay) { timers.set(++next, { fn, at: now + delay }); return next },
    clearTimer: id => timers.delete(id), visible: () => visible, eligible: () => eligible && visible,
    valid: () => valid, begin: attempt => starts.push(attempt), retire: () => retired.push(now),
    state: value => states.push(value), record: row => records.push(row)
  })
  function advance(ms) {
    const target = now + ms
    for (let guard = 0; guard < 1000; guard++) {
      const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) { now = target; return }
      now = due[1].at; timers.delete(due[0]); due[1].fn()
    }
    throw new Error('Timer loop')
  }
  return { controller, timers, starts, retired, states, records, advance,
    visible(value) { visible = value; controller.reconcile() },
    eligible(value) { eligible = value; controller.reconcile() },
    valid(value) { valid = value; controller.reconcile() },
    sleep(ms) { now += ms; const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(t => t.fn()) }
  }
}

test('a failed attempt retires and retries invisibly without resetting its budget', () => {
  const h = harness(); h.controller.start(); const old = h.starts[0]
  h.controller.fail(old, { reason: 'script' }); h.controller.fail(old, { reason: 'script' })
  assert.equal(h.retired.length, 1); h.advance(500); assert.equal(h.starts.length, 2)
  h.controller.fail(h.starts[1], { reason: 'network' }); h.advance(2000)
  h.controller.fail(h.starts[2], { reason: 'network' })
  assert.equal(h.controller.state, 'dormant'); h.advance(29999); assert.equal(h.starts.length, 3)
  h.advance(1); assert.equal(h.starts.length, 4)
  h.controller.fail(h.starts[3], { reason: 'network' }); h.advance(119999); assert.equal(h.starts.length, 4)
  h.advance(1); assert.equal(h.starts.length, 5)
  assert.ok(h.states.every(x => x !== 'failed' && x !== 'slow'))
})

test('bad compressed delivery selects ordinary delivery for the next complete attempt', () => {
  const h = harness(); h.controller.start(); h.controller.fail(h.starts[0], { reason: 'integrity' })
  h.advance(500); assert.equal(h.starts[1].delivery, 'ordinary')
})

test('readiness cancels all deadlines and makes startup failures and wakeups harmless', () => {
  const h = harness(); h.controller.start(); const attempt = h.starts[0]
  assert.equal(h.controller.ready(attempt), true); assert.equal(h.timers.size, 0)
  h.controller.fail(attempt, { reason: 'script' }); h.controller.advance(attempt, 'scene')
  h.visible(false); h.visible(true); h.eligible(false); h.eligible(true); h.advance(1000000)
  assert.equal(h.starts.length, 1); assert.equal(h.controller.state, 'ready'); assert.equal(h.timers.size, 0)
})

test('retired attempts cannot fail or complete their replacement', () => {
  const h = harness(); h.controller.start(); const old = h.starts[0]
  h.controller.fail(old, { reason: 'network' }); h.advance(500); const current = h.starts[1]
  assert.equal(h.controller.ready(old), false); h.controller.fail(old, { reason: 'integrity' })
  assert.equal(h.controller.attempt, current); assert.equal(h.controller.state, 'loading')
})

test('restore rejection preserves input and does not run a fresh-world retry', () => {
  const h = harness(); h.controller.start(); h.controller.fail(h.starts[0], { reason: 'restore' })
  h.advance(1000000); h.visible(false); h.visible(true)
  assert.equal(h.controller.state, 'restore-blocked'); assert.equal(h.starts.length, 1); assert.equal(h.timers.size, 0)
})

test('offline and offscreen wakeups never reset the budget or overlap attempts', () => {
  const h = harness(); h.eligible(false); h.controller.start(); assert.equal(h.starts.length, 0)
  h.eligible(true); assert.equal(h.starts.length, 1)
  h.controller.fail(h.starts[0], { reason: 'network' }); h.eligible(false); h.advance(10000)
  assert.equal(h.starts.length, 1); h.eligible(true); assert.equal(h.starts.length, 2)
  for (let i = 0; i < 10; i++) h.controller.reconcile()
  assert.equal(h.starts.length, 2)
})

test('hidden and suspended time cannot exhaust a healthy startup deadline', () => {
  const h = harness(); h.controller.start(); h.advance(10000); h.visible(false); h.advance(300000)
  assert.equal(h.starts.length, 1); h.visible(true); h.advance(9999); assert.equal(h.starts.length, 1)
  h.advance(1); assert.equal(h.controller.state, 'retry-wait')
})

test('a late timer after device sleep gets a reconciliation grace period', () => {
  const h = harness(); h.controller.start(); h.sleep(300000)
  assert.equal(h.controller.state, 'loading'); h.advance(1999); assert.equal(h.starts.length, 1)
  h.advance(1); assert.equal(h.controller.state, 'retry-wait')
})

test('advancing bytes keep slow downloads alive without an interval or a new timer per chunk', () => {
  const h = harness(); h.controller.start(); const attempt = h.starts[0]
  for (let i = 1; i < 20; i++) { h.advance(14000); h.controller.activity(attempt, i) }
  assert.equal(h.starts.length, 1); assert.equal(h.timers.size, 1)
  h.controller.advance(attempt, 'engine'); h.advance(44000); assert.equal(h.controller.state, 'loading')
  h.advance(1000); assert.equal(h.controller.state, 'retry-wait')
})

test('identical progress does not keep a dead attempt alive', () => {
  const h = harness(); h.controller.start(); const attempt = h.starts[0]
  h.controller.activity(attempt, 10); h.advance(19000); h.controller.activity(attempt, 10); h.advance(1000)
  assert.equal(h.controller.state, 'retry-wait')
})

test('profile invalidation cancels retry, including a queued callback already captured by the browser', () => {
  const h = harness(); h.controller.start(); h.controller.fail(h.starts[0], { reason: 'network' })
  const late = [...h.timers.values()][0].fn; h.valid(false); late(); h.advance(1000000)
  assert.equal(h.starts.length, 1); assert.equal(h.controller.state, 'waiting-profile'); assert.equal(h.timers.size, 0)
})

test('a new activation starts a distinct lifecycle and cancels pending old work', () => {
  const h = harness(); h.controller.start(); h.controller.fail(h.starts[0], { reason: 'integrity' })
  const late = [...h.timers.values()][0].fn; h.controller.start(); late()
  assert.equal(h.starts.length, 2); assert.equal(h.starts[1].delivery, 'streaming'); assert.equal(h.starts[1].number, 1)
})

test('slow initialization is observed once without exposing a slow or failure screen', () => {
  const h = harness(); h.controller.start(); h.controller.advance(h.starts[0], 'engine')
  h.advance(21000)
  assert.equal(h.controller.state, 'loading'); assert.equal(h.records.filter(x => x.outcome === 'slow').length, 1)
  h.controller.ready(h.starts[0]); h.advance(100000)
  assert.equal(h.records.filter(x => x.outcome === 'slow').length, 1); assert.equal(h.timers.size, 0)
})

test('unsupported capabilities do not compile in a loop or schedule an infinite timer', () => {
  const h = harness(); h.controller.start(); h.controller.fail(h.starts[0], { reason: 'unsupported' })
  h.visible(false); h.visible(true); h.advance(1000000)
  assert.equal(h.starts.length, 1); assert.equal(h.timers.size, 0); assert.equal(h.controller.state, 'dormant')
})
