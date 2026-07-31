import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ONBOARDING_CHOICE_LAYOUT_STATES,
  ONBOARDING_CHOICE_SCROLL_LAYOUT,
  selectOnboardingChoiceLayout
} from '../../src/features/onboarding/choice-layout.js'

test('choice layouts preserve the required least-compact-first order', () => {
  assert.deepEqual(ONBOARDING_CHOICE_LAYOUT_STATES, [
    'single-stacked',
    'single-inline',
    'double-stacked',
    'double-inline'
  ])
  assert.equal(ONBOARDING_CHOICE_SCROLL_LAYOUT, 'double-inline-scroll')
})

test('choice layout stops at the first state that fits', () => {
  const applied = []
  const selected = selectOnboardingChoiceLayout({
    applyLayout(layout) {
      applied.push(layout)
    },
    isContained() {
      return applied.at(-1) === 'double-stacked'
    }
  })

  assert.equal(selected, 'double-stacked')
  assert.deepEqual(applied, [
    'single-stacked',
    'single-inline',
    'double-stacked'
  ])
})

test('choice layout enables scrolling only after every fixed state fails', () => {
  const applied = []
  const selected = selectOnboardingChoiceLayout({
    applyLayout(layout) {
      applied.push(layout)
    },
    isContained() {
      return false
    }
  })

  assert.equal(selected, 'double-inline-scroll')
  assert.deepEqual(applied, [
    ...ONBOARDING_CHOICE_LAYOUT_STATES,
    ONBOARDING_CHOICE_SCROLL_LAYOUT
  ])
})

test('choice layout rejects incomplete measurement contracts', () => {
  assert.throws(
    () => selectOnboardingChoiceLayout({
      applyLayout() {}
    }),
    /requires applyLayout and isContained callbacks/
  )
})
