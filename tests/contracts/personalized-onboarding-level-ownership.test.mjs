import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'
import {
  LEARNER_LEVEL_OPTIONS
} from '../../src/features/onboarding/options.js'
import {
  bindPersonalizedOnboardingActions
} from '../../src/features/onboarding/personalized-onboarding-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)
const moduleSource = await readFile(
  new URL(
    '../../src/features/onboarding/personalized-onboarding-actions.js',
    import.meta.url
  ),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function createLevelControl(levelId) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      levelId,
      personalizedOnboardingAction: 'select-level'
    },
    listeners
  }
}

const levelStart = appSource.indexOf(
  'function renderOnboardingLevelStep(content) {'
)
const levelEnd = appSource.indexOf(
  '\nfunction renderOnboardingChannelsStep(',
  levelStart
)
assert.notEqual(levelStart, -1)
assert.notEqual(levelEnd, -1)
const levelRenderSource = appSource.slice(levelStart, levelEnd)

test('level choices retain exact hook, metadata, and copy without inline ownership', () => {
  const controls = getElements(levelRenderSource, 'button')
  assert.equal(controls.length, 3)
  const levelChoice = controls[0]

  assert.equal(getAttribute(levelChoice.tag, 'type'), 'button')
  assert.equal(
    getAttribute(levelChoice.tag, 'class'),
    'onboarding-choice onboarding-level-choice'
  )
  assert.equal(
    getAttribute(levelChoice.tag, 'data-level-id'),
    '${escHtml(option.id)}'
  )
  assert.equal(
    getAttribute(
      levelChoice.tag,
      'data-personalized-onboarding-action'
    ),
    'select-level'
  )
  assert.equal(
    getAttribute(levelChoice.tag, 'data-analytics-action'),
    'selectOnboardingLevel'
  )
  assert.equal(
    getAttribute(levelChoice.tag, 'aria-pressed'),
    '${option.id === selectedLevelId}'
  )
  assert.equal(getAttribute(levelChoice.tag, 'onclick'), null)
  assert.match(
    levelChoice.content,
    /<span class="onboarding-choice-label">\$\{escHtml\(t\(`onboarding\.level\.\$\{option\.id\}\.label`\)\)\}<\/span>/
  )
  assert.match(
    levelChoice.content,
    /<span class="onboarding-choice-detail">\$\{escHtml\(t\(`onboarding\.level\.\$\{option\.id\}\.detail`\)\)\}<\/span>/
  )
})

test('default and English level catalogs retain five-versus-four ordering', () => {
  const defaultIds = LEARNER_LEVEL_OPTIONS.map(option => option.id)
  const englishIds = LEARNER_LEVEL_OPTIONS
    .filter(option => option.id !== 'starting')
    .map(option => option.id)

  assert.deepEqual(defaultIds, [
    'starting',
    'beginner',
    'intermediate',
    'advanced',
    'not-sure'
  ])
  assert.deepEqual(englishIds, [
    'beginner',
    'intermediate',
    'advanced',
    'not-sure'
  ])
  assert.match(
    appSource,
    /function getLearnerLevelOptionsForLanguage\(languageId\) \{\s*return languageId === 'english'\s*\? LEARNER_LEVEL_OPTIONS\.filter\(option => option\.id !== 'starting'\)\s*: LEARNER_LEVEL_OPTIONS\s*\}/
  )
  assert.match(
    levelRenderSource,
    /const levelOptions = getLearnerLevelOptionsForLanguage\(personalizedOnboardingState\.languageId\)/
  )
  assert.match(
    levelRenderSource,
    /\$\{levelOptions\.map\(option => `[\s\S]*?`\)\.join\(''\)\}/
  )
})

test('direct level ownership forwards only the live level ID', () => {
  const levelControl = createLevelControl('beginner')
  const calls = []
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-personalized-onboarding-action]')
      return [levelControl]
    }
  }
  assert.equal(
    bindPersonalizedOnboardingActions(root, {
      selectLanguage() {
        assert.fail('Level controls must not select a language')
      },
      continueFromLanguage() {
        assert.fail('Level controls must not continue from language')
      },
      selectLevel(...args) {
        calls.push(args)
      },
      setStep() {
        assert.fail('Level choices must not navigate a step directly')
      },
      toggleChannel() {
        assert.fail('Level choices must not toggle a channel')
      },
      finish() {
        assert.fail('Level choices must not finish onboarding')
      }
    }),
    1
  )

  levelControl.dataset.levelId = 'advanced'
  let preventDefaultCalls = 0
  let stopPropagationCalls = 0
  const event = {
    preventDefault() {
      preventDefaultCalls += 1
    },
    stopPropagation() {
      stopPropagationCalls += 1
    }
  }
  assert.equal(levelControl.listeners.get('click')[0](event), undefined)
  assert.deepEqual(calls, [['advanced']])
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('central replacement binding includes the level callback', () => {
  const renderStart = appSource.indexOf(
    'function renderPersonalizedOnboarding() {'
  )
  const renderEnd = appSource.indexOf(
    '\nfunction renderOnboardingHeading(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)
  const levelRenderIndex = renderSource.indexOf(
    'renderOnboardingLevelStep(content)'
  )
  const bindIndex = renderSource.indexOf(
    'bindPersonalizedOnboardingActions(content, {'
  )
  assert.notEqual(levelRenderIndex, -1)
  assert.ok(bindIndex > levelRenderIndex)
  assert.match(
    renderSource,
    /bindPersonalizedOnboardingActions\(content,\s*\{\s*selectLanguage:\s*selectOnboardingLanguage,\s*continueFromLanguage:\s*continuePersonalizedOnboardingFromLanguage,\s*selectLevel:\s*selectOnboardingLevel,\s*setStep:\s*setPersonalizedOnboardingStep,\s*toggleChannel:\s*toggleOnboardingChannel,\s*finish:\s*finishPersonalizedOnboarding\s*\}\)/
  )
})

test('level selection retains validation, reset, and synchronous rerender', () => {
  const start = appSource.indexOf(
    'function selectOnboardingLevel(levelId) {'
  )
  const end = appSource.indexOf(
    '\nfunction setPersonalizedOnboardingStep(',
    start
  )
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const source = appSource.slice(start, end)

  assert.match(source, /if \(!getLearnerLevelOption\(levelId\)\) return/)
  assert.match(
    source,
    /personalizedOnboardingState\.levelId = levelId/
  )
  assert.match(
    source,
    /personalizedOnboardingState\.selectedChannelCatalogIds = \[\]\s*personalizedOnboardingState\.channelSelectionsInitialized = false\s*if \(\s*LEARNER_PROFILE_LIFECYCLE_ENABLED\s*&& !persistPersonalizedOnboardingDraft\(\)\s*\) return\s*renderPersonalizedOnboarding\(\)/
  )
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
})

test('level generic analytics follow synchronous target replacement', () => {
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.selectLevel\(control\.dataset\.levelId\)\s*\}\)/
  )
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(|queueMicrotask|setTimeout/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
})

test('level ownership has no remaining personalized-onboarding alias', () => {
  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit)
  for (const alias of [
    'selectOnboardingLevel',
    'setPersonalizedOnboardingStep',
    'toggleOnboardingChannel',
    'finishPersonalizedOnboarding'
  ]) {
    assert.equal(GLOBAL_ACTION_NAMES.includes(alias), false)
    assert.doesNotMatch(
      globalActionAudit,
      new RegExp(`(?:^|[\\s,])${alias}(?:[\\s,]|$)`)
    )
  }

})
