import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ONBOARDING_CHOICE_LAYOUT_STATES,
  ONBOARDING_CHOICE_SCROLL_LAYOUT,
  selectOnboardingChoiceLayout
} from '../../src/features/onboarding/choice-layout.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

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

test('choice layout accepts a restricted step-specific state policy', () => {
  const applied = []
  const selected = selectOnboardingChoiceLayout({
    applyLayout(layout) {
      applied.push(layout)
    },
    candidateLayouts: ['double-inline'],
    fallbackLayout: 'double-inline-scroll',
    isContained() {
      return false
    }
  })

  assert.equal(selected, 'double-inline-scroll')
  assert.deepEqual(applied, [
    'double-inline',
    'double-inline-scroll'
  ])
})

test('language onboarding measures only a double-column fixed state', () => {
  assert.match(
    appSource,
    /const ONBOARDING_LANGUAGE_CHOICE_LAYOUT_STATES = Object\.freeze\(\[\s*'double-inline'\s*\]\)/
  )
  assert.match(
    appSource,
    /panel\?\.classList\.toggle\('is-language-step', personalizedOnboardingState\.step === 'language'\)/
  )
  assert.match(
    appSource,
    /\['language', 'level', 'channels'\]\.includes\(personalizedOnboardingState\.step\)/
  )
  assert.match(
    appSource,
    /candidateLayouts: personalizedOnboardingState\.step === 'language'\s*\? ONBOARDING_LANGUAGE_CHOICE_LAYOUT_STATES\s*: undefined/
  )
  assert.match(
    appSource,
    /panel\.querySelector\('\.onboarding-language-grid, \.onboarding-level-grid, \.onboarding-channel-list'\)/
  )
  assert.match(
    appSource,
    /\.onboarding-language-grid \.onboarding-choice, \.onboarding-level-choice, \.onboarding-channel/
  )
})

test('choice layout rejects incomplete measurement contracts', () => {
  assert.throws(
    () => selectOnboardingChoiceLayout({
      applyLayout() {}
    }),
    /requires applyLayout and isContained callbacks/
  )
  assert.throws(
    () => selectOnboardingChoiceLayout({
      applyLayout() {},
      candidateLayouts: [],
      isContained() {}
    }),
    /requires candidate layouts and a fallback layout/
  )
})
