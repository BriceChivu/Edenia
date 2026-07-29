import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
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

function getRenderSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(content) {`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return appSource.slice(start, end)
}

function createStepControl(step) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      personalizedOnboardingAction: 'set-step',
      personalizedOnboardingStep: step
    },
    listeners
  }
}

const otherSource = getRenderSource(
  'renderOnboardingOtherStep',
  'renderOnboardingLevelStep'
)
const levelSource = getRenderSource(
  'renderOnboardingLevelStep',
  'renderOnboardingChannelsStep'
)
const channelsSource = getRenderSource(
  'renderOnboardingChannelsStep',
  'selectOnboardingLanguage'
)

test('all four step controls retain exact variant order and hooks', () => {
  const stepControls = [
    ...getElements(otherSource, 'button').filter(element => (
      getAttribute(
        element.tag,
        'data-personalized-onboarding-action'
      ) === 'set-step'
    )),
    ...getElements(levelSource, 'button').filter(element => (
      getAttribute(
        element.tag,
        'data-personalized-onboarding-action'
      ) === 'set-step'
    )),
    ...getElements(channelsSource, 'button').filter(element => (
      getAttribute(
        element.tag,
        'data-personalized-onboarding-action'
      ) === 'set-step'
    ))
  ]
  const expected = [
    {
      className: 'btn-ghost',
      content: "${escHtml(t('onboarding.back'))}",
      disabled: "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}",
      step: 'language'
    },
    {
      className: 'btn-ghost',
      content: "${escHtml(t('onboarding.back'))}",
      disabled: null,
      step: 'language'
    },
    {
      className: 'btn-primary',
      content: "${escHtml(t('onboarding.continue'))}",
      disabled: "${selectedLevelId ? '' : 'disabled'}",
      step: 'channels'
    },
    {
      className: 'btn-ghost',
      content: "${escHtml(t('onboarding.back'))}",
      disabled: "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}",
      step: 'level'
    }
  ]
  assert.equal(stepControls.length, expected.length)

  expected.forEach((variant, index) => {
    const control = stepControls[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), variant.className)
    assert.equal(
      getAttribute(
        control.tag,
        'data-personalized-onboarding-action'
      ),
      'set-step'
    )
    assert.equal(
      getAttribute(
        control.tag,
        'data-personalized-onboarding-step'
      ),
      variant.step
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'setPersonalizedOnboardingStep'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(control.content.trim(), variant.content)
    if (variant.disabled) {
      assert.ok(control.tag.includes(variant.disabled))
    } else {
      assert.equal(getAttribute(control.tag, 'disabled'), null)
    }
  })
})

test('step ownership forwards only the live target step', () => {
  const control = createStepControl('language')
  const calls = []
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-personalized-onboarding-action]')
      return [control]
    }
  }
  assert.equal(
    bindPersonalizedOnboardingActions(root, {
      selectLanguage() {
        assert.fail('Step control must not select language')
      },
      continueFromLanguage() {
        assert.fail('Step control must not continue language')
      },
      selectLevel() {
        assert.fail('Step control must not select level')
      },
      setStep(...args) {
        calls.push(args)
      },
      toggleChannel() {
        assert.fail('Step controls must not toggle a channel')
      },
      finish() {
        assert.fail('Step controls must not finish onboarding')
      }
    }),
    1
  )
  control.dataset.personalizedOnboardingStep = 'channels'

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
  assert.equal(control.listeners.get('click')[0](event), undefined)
  assert.deepEqual(calls, [['channels']])
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('central replacement binding includes setStep after every branch', () => {
  const start = appSource.indexOf(
    'function renderPersonalizedOnboarding() {'
  )
  const end = appSource.indexOf(
    '\nfunction renderOnboardingHeading(',
    start
  )
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const source = appSource.slice(start, end)
  const bindingIndex = source.indexOf(
    'bindPersonalizedOnboardingActions(content, {'
  )
  assert.notEqual(bindingIndex, -1)
  for (const renderCall of [
    'renderOnboardingLanguageStep(content)',
    'renderOnboardingLevelStep(content)',
    'renderOnboardingChannelsStep(content)',
    'renderOnboardingOtherStep(content)'
  ]) {
    assert.ok(bindingIndex > source.indexOf(renderCall))
  }
  assert.match(
    source,
    /bindPersonalizedOnboardingActions\(content,\s*\{\s*selectLanguage:\s*selectOnboardingLanguage,\s*continueFromLanguage:\s*continuePersonalizedOnboardingFromLanguage,\s*selectLevel:\s*selectOnboardingLevel,\s*setStep:\s*setPersonalizedOnboardingStep,\s*toggleChannel:\s*toggleOnboardingChannel,\s*finish:\s*finishPersonalizedOnboarding\s*\}\)/
  )
})

test('step callback retains every validation and directional transition', () => {
  const start = appSource.indexOf(
    'function setPersonalizedOnboardingStep(step) {'
  )
  const end = appSource.indexOf(
    '\nfunction prepareOnboardingChannelSelections(',
    start
  )
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const source = appSource.slice(start, end)

  const guards = [
    /if \(!\['language', 'level', 'channels', 'other'\]\.includes\(step\)\) return/,
    /if \(step !== 'language' && !personalizedOnboardingState\.languageId\) return/,
    /if \(step === 'other' && personalizedOnboardingState\.languageId !== 'other'\) return/,
    /if \(\(step === 'level' \|\| step === 'channels'\) && personalizedOnboardingState\.languageId === 'other'\) return/,
    /if \(step === 'channels' && !personalizedOnboardingState\.levelId\) return/
  ]
  for (const guard of guards) assert.match(source, guard)

  assert.match(
    source,
    /trackEdeniaEvent\(\s*nextIndex >= previousIndex \? 'onboarding_step_advanced' : 'onboarding_step_backed',/
  )
  assert.match(
    source,
    /previous_step: previousStep,\s*next_step: step,\s*learning_language: personalizedOnboardingState\.languageId \|\| null,\s*learner_level: personalizedOnboardingState\.levelId \|\| null,\s*selected_channel_count: personalizedOnboardingState\.selectedChannelCatalogIds\.length/
  )
  assert.match(source, /renderPersonalizedOnboarding\(\)/)
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
})

test('Language Continue retains its lexical other-or-level step call', () => {
  assert.match(
    appSource,
    /function continuePersonalizedOnboardingFromLanguage\(\) \{\s*setPersonalizedOnboardingStep\(personalizedOnboardingState\.languageId === 'other' \? 'other' : 'level'\)\s*\}/
  )
})

test('step analytics remain advanced-or-backed then viewed then generic', () => {
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.setStep\(control\.dataset\.personalizedOnboardingStep\)\s*\}\)/
  )
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(|queueMicrotask|setTimeout/
  )

  const renderStart = appSource.indexOf(
    'function renderPersonalizedOnboarding() {'
  )
  const renderEnd = appSource.indexOf(
    '\nfunction renderOnboardingHeading(',
    renderStart
  )
  const renderSource = appSource.slice(renderStart, renderEnd)
  assert.match(
    renderSource,
    /trackEdeniaEvent\('onboarding_step_viewed', \{/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.match(
    analyticsSource,
    /capture\(`\$\{eventName\}_clicked`, \{/
  )
})

test('step ownership has no remaining personalized-onboarding alias', () => {
  assert.equal(
    LEGACY_ACTION_NAMES.includes('setPersonalizedOnboardingStep'),
    false
  )
  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])setPersonalizedOnboardingStep(?:[\s,]|$)/
  )
  assert.equal(LEGACY_ACTION_NAMES.includes('toggleOnboardingChannel'), false)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])toggleOnboardingChannel(?:[\s,]|$)/
  )
  assert.equal(
    LEGACY_ACTION_NAMES.includes('finishPersonalizedOnboarding'),
    false
  )
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])finishPersonalizedOnboarding(?:[\s,]|$)/
  )
})
