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

function createDirectControl(action, languageId = '') {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      languageId,
      personalizedOnboardingAction: action
    },
    listeners
  }
}

const languageStart = appSource.indexOf(
  'function renderOnboardingLanguageStep(content) {'
)
const languageEnd = appSource.indexOf(
  '\nfunction renderOnboardingOtherStep(',
  languageStart
)
assert.notEqual(languageStart, -1)
assert.notEqual(languageEnd, -1)
const languageSource = appSource.slice(languageStart, languageEnd)

test('language controls retain exact hooks and metadata without inline ownership', () => {
  const controls = getElements(languageSource, 'button')
  assert.equal(controls.length, 2)

  const languageChoice = controls[0]
  assert.equal(getAttribute(languageChoice.tag, 'type'), 'button')
  assert.equal(getAttribute(languageChoice.tag, 'class'), 'onboarding-choice')
  assert.equal(
    getAttribute(languageChoice.tag, 'data-language-id'),
    '${escHtml(option.id)}'
  )
  assert.equal(
    getAttribute(
      languageChoice.tag,
      'data-personalized-onboarding-action'
    ),
    'select-language'
  )
  assert.equal(
    getAttribute(languageChoice.tag, 'data-analytics-action'),
    'selectOnboardingLanguage'
  )
  assert.equal(
    getAttribute(languageChoice.tag, 'aria-pressed'),
    '${option.id === selectedLanguageId}'
  )
  assert.equal(getAttribute(languageChoice.tag, 'onclick'), null)

  const continueControl = controls[1]
  assert.equal(getAttribute(continueControl.tag, 'type'), 'button')
  assert.equal(getAttribute(continueControl.tag, 'class'), 'btn-primary')
  assert.equal(
    getAttribute(
      continueControl.tag,
      'data-personalized-onboarding-action'
    ),
    'continue-language'
  )
  assert.equal(
    getAttribute(continueControl.tag, 'data-analytics-action'),
    'continuePersonalizedOnboardingFromLanguage'
  )
  assert.equal(getAttribute(continueControl.tag, 'onclick'), null)
  assert.ok(
    continueControl.tag.includes(
      "${selectedLanguageId ? '' : 'disabled'}"
    )
  )
  assert.equal(
    continueControl.content.trim(),
    "${escHtml(t('onboarding.continue'))}"
  )
})

test('direct listeners forward the live language ID and zero Continue arguments', () => {
  const languageControl = createDirectControl(
    'select-language',
    'english'
  )
  const continueControl = createDirectControl('continue-language')
  const controls = [languageControl, continueControl]
  const calls = []
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-personalized-onboarding-action]')
      return controls
    }
  }

  assert.equal(
    bindPersonalizedOnboardingActions(root, {
      selectLanguage(...args) {
        calls.push(['language', args])
      },
      continueFromLanguage(...args) {
        calls.push(['continue', args])
      },
      selectLevel() {
        assert.fail('Language controls must not select a level')
      },
      setStep() {
        assert.fail('Language controls must not navigate a step directly')
      },
      toggleChannel() {
        assert.fail('Language controls must not toggle a channel')
      },
      finish() {
        assert.fail('Language controls must not finish onboarding')
      }
    }),
    2
  )
  languageControl.dataset.languageId = 'other'

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
  assert.equal(languageControl.listeners.get('click')[0](event), undefined)
  assert.deepEqual(calls, [['language', ['other']]])
  assert.equal(continueControl.listeners.get('click')[0](event), undefined)
  assert.deepEqual(calls, [
    ['language', ['other']],
    ['continue', []]
  ])
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('central renderer binds replacement content after every step branch', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindPersonalizedOnboardingActions\s*\}\s*from '\.\/features\/onboarding\/personalized-onboarding-actions\.js'/
  )
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
  const branchCalls = [
    'renderOnboardingLanguageStep(content)',
    'renderOnboardingLevelStep(content)',
    'renderOnboardingChannelsStep(content)',
    'renderOnboardingOtherStep(content)'
  ]
  const bindingIndex = renderSource.indexOf(
    'bindPersonalizedOnboardingActions(content, {'
  )
  assert.notEqual(bindingIndex, -1)
  for (const call of branchCalls) {
    const callIndex = renderSource.indexOf(call)
    assert.notEqual(callIndex, -1)
    assert.ok(bindingIndex > callIndex)
  }
  assert.match(
    renderSource,
    /bindPersonalizedOnboardingActions\(content,\s*\{\s*selectLanguage:\s*selectOnboardingLanguage,\s*continueFromLanguage:\s*continuePersonalizedOnboardingFromLanguage,\s*selectLevel:\s*selectOnboardingLevel,\s*setStep:\s*setPersonalizedOnboardingStep,\s*toggleChannel:\s*toggleOnboardingChannel,\s*finish:\s*finishPersonalizedOnboarding\s*\}\)/
  )
})

test('newly replaced language controls receive fresh direct listeners', () => {
  const actions = {
    selectLanguage() {},
    continueFromLanguage() {},
    selectLevel() {},
    setStep() {},
    toggleChannel() {},
    finish() {}
  }
  const oldControl = createDirectControl('select-language', 'en')
  const replacementControl = createDirectControl('select-language', 'fr')

  assert.equal(
    bindPersonalizedOnboardingActions(
      { querySelectorAll: () => [oldControl] },
      actions
    ),
    1
  )
  assert.equal(
    bindPersonalizedOnboardingActions(
      { querySelectorAll: () => [replacementControl] },
      actions
    ),
    1
  )
  assert.equal(oldControl.listeners.get('click').length, 1)
  assert.equal(replacementControl.listeners.get('click').length, 1)
})

test('local language callbacks retain state transitions and replacement', () => {
  const selectionStart = appSource.indexOf(
    'function selectOnboardingLanguage(languageId) {'
  )
  const selectionEnd = appSource.indexOf(
    '\nfunction continuePersonalizedOnboardingFromLanguage(',
    selectionStart
  )
  assert.notEqual(selectionStart, -1)
  assert.notEqual(selectionEnd, -1)
  const selectionSource = appSource.slice(selectionStart, selectionEnd)
  assert.match(
    selectionSource,
    /if \(!getLearnerLanguageOption\(languageId\)\) return/
  )
  assert.match(
    selectionSource,
    /personalizedOnboardingState\.languageId = languageId/
  )
  assert.match(
    selectionSource,
    /personalizedOnboardingState\.selectedChannelCatalogIds = \[\]\s*personalizedOnboardingState\.channelSelectionsInitialized = false\s*renderPersonalizedOnboarding\(\)/
  )

  const continueStart = selectionEnd + 1
  const continueEnd = appSource.indexOf(
    '\nfunction selectOnboardingLevel(',
    continueStart
  )
  const continueSource = appSource.slice(continueStart, continueEnd)
  assert.match(
    continueSource,
    /setPersonalizedOnboardingStep\(personalizedOnboardingState\.languageId === 'other' \? 'other' : 'level'\)/
  )
  assert.doesNotMatch(
    `${selectionSource}\n${continueSource}`,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('generic analytics run after synchronous replacement unless Continue is disabled', () => {
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.selectLanguage\(control\.dataset\.languageId\)\s*\}\)/
  )
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.continueFromLanguage\(\)\s*\}\)/
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

test('language ownership has no remaining personalized-onboarding alias', () => {
  const migratedAliases = [
    'selectOnboardingLanguage',
    'continuePersonalizedOnboardingFromLanguage',
    'selectOnboardingLevel',
    'setPersonalizedOnboardingStep',
    'toggleOnboardingChannel',
    'finishPersonalizedOnboarding'
  ]
  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)

  for (const alias of migratedAliases) {
    assert.equal(LEGACY_ACTION_NAMES.includes(alias), false)
    assert.doesNotMatch(
      installMap,
      new RegExp(`(?:^|[\\s,])${alias}(?:[\\s,]|$)`)
    )
  }
})
