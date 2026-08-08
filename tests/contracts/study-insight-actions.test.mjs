import assert from 'node:assert/strict'
import test from 'node:test'
import { bindStudyInsightActions } from '../../src/features/study-insights/actions.js'

function createHarness(selectors = [
  '#studyInsightCurrentTab',
  '#studyInsightPreviousTab',
  '.study-insight-collapse',
  '#studyInsightReopen'
]) {
  const controls = new Map(selectors.map(selector => [selector, new EventTarget()]))
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, root }
}

test('Study Insight action binding preserves exact arguments and one call per click', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindStudyInsightActions(root, {
    setView(view) {
      calls.push(['view', view])
    },
    setCollapsed(collapsed) {
      calls.push(['collapsed', collapsed])
    }
  }), 4)

  controls.get('#studyInsightCurrentTab').dispatchEvent(new Event('click'))
  controls.get('#studyInsightPreviousTab').dispatchEvent(new Event('click'))
  controls.get('.study-insight-collapse').dispatchEvent(new Event('click'))
  controls.get('#studyInsightReopen').dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['view', 'current'],
    ['view', 'previous'],
    ['collapsed', true],
    ['collapsed', false]
  ])
})

test('Study Insight action binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness(['#studyInsightCurrentTab'])
  const calls = []
  const actions = {
    setView(view) {
      calls.push(view)
    },
    setCollapsed() {
      calls.push('collapsed')
    }
  }
  assert.equal(bindStudyInsightActions(root, actions), 1)
  assert.equal(bindStudyInsightActions(root, actions), 0)
  controls.get('#studyInsightCurrentTab').dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['current'])
})

test('Study Insight action binding exposes optional live guidance action', () => {
  const { controls, root } = createHarness([
    '#studyGuidanceNextAction'
  ])
  let calls = 0
  assert.equal(bindStudyInsightActions(root, {
    setView() {},
    setCollapsed() {},
    showNextStudy() {
      calls += 1
    }
  }), 1)

  controls.get('#studyGuidanceNextAction').dispatchEvent(new Event('click'))
  assert.equal(calls, 1)
})

test('Study Insight action binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindStudyInsightActions(null, {
      setView() {},
      setCollapsed() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindStudyInsightActions(root, {
      setView() {}
    }),
    /view and collapse callbacks/
  )
})
