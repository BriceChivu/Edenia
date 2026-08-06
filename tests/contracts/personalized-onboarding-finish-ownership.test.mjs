import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'
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

function createFinishControl() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      personalizedOnboardingAction: 'finish'
    },
    listeners
  }
}

const otherSource = getRenderSource(
  'renderOnboardingOtherStep',
  'renderOnboardingLevelStep'
)
const channelsSource = getRenderSource(
  'renderOnboardingChannelsStep',
  'selectOnboardingLanguage'
)

test('Other and Channel Build controls retain exact module-owned markup', () => {
  const finishControls = [
    ...getElements(otherSource, 'button'),
    ...getElements(channelsSource, 'button')
  ].filter(element => (
    getAttribute(
      element.tag,
      'data-personalized-onboarding-action'
    ) === 'finish'
  ))
  assert.equal(finishControls.length, 2)

  for (const control of finishControls) {
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), 'btn-primary')
    assert.equal(
      getAttribute(
        control.tag,
        'data-personalized-onboarding-action'
      ),
      'finish'
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'finishPersonalizedOnboarding'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.ok(
      control.tag.includes(
        "${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}"
      )
    )
    assert.equal(
      control.content.trim(),
      "${escHtml(t(personalizedOnboardingState.isApplyingChannels ? 'onboarding.building' : 'onboarding.build'))}"
    )
  }
})

test('finish ownership calls zero arguments and immediately ignores its Promise', () => {
  const control = createFinishControl()
  const calls = []
  const pendingPromise = new Promise(() => {})
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-personalized-onboarding-action]')
      return [control]
    }
  }
  assert.equal(
    bindPersonalizedOnboardingActions(root, {
      selectLanguage() {
        assert.fail('Finish must not select language')
      },
      continueFromLanguage() {
        assert.fail('Finish must not continue language')
      },
      selectLevel() {
        assert.fail('Finish must not select level')
      },
      setStep() {
        assert.fail('Finish must not navigate a step')
      },
      toggleChannel() {
        assert.fail('Finish must not toggle a channel')
      },
      finish(...args) {
        calls.push(args)
        return pendingPromise
      }
    }),
    1
  )

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
  assert.deepEqual(calls, [[]])
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('central renderer binds finish after every replacement branch', () => {
  const start = appSource.indexOf(
    'function renderPersonalizedOnboarding() {'
  )
  const end = appSource.indexOf(
    '\nfunction renderOnboardingHeading(',
    start
  )
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

test('enabled original button reaches generic analytics before immediate completion', () => {
  const start = appSource.indexOf(
    'async function finishPersonalizedOnboarding() {'
  )
  const end = appSource.indexOf(
    '\nfunction getPostOnboardingAppUrl(',
    start
  )
  const source = appSource.slice(start, end)
  const busyIndex = source.indexOf(
    'personalizedOnboardingState.isApplyingChannels = true'
  )
  const replacementIndex = source.indexOf(
    'renderPersonalizedOnboarding()',
    busyIndex
  )
  assert.notEqual(busyIndex, -1)
  assert.ok(replacementIndex > busyIndex)
  assert.doesNotMatch(source, /\bawait\b/)
  assert.doesNotMatch(source, /\bbutton\.disabled/)

  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.finish\(\)\s*\}\)/
  )
  assert.match(
    analyticsSource,
    /const visibleLabel = String\(\s*control\.dataset\.analyticsLabel\s*\|\| control\.getAttribute\('aria-label'\)\s*\|\| control\.getAttribute\('title'\)\s*\|\| control\.textContent/
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
})

test('busy replacement is disabled and displays Building before async work', () => {
  for (const source of [otherSource, channelsSource]) {
    assert.match(
      source,
      /data-personalized-onboarding-action="finish"[\s\S]*?\$\{personalizedOnboardingState\.isApplyingChannels \? 'disabled' : ''\}>\$\{escHtml\(t\(personalizedOnboardingState\.isApplyingChannels \? 'onboarding\.building' : 'onboarding\.build'\)\)\}/
    )
  }
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(|queueMicrotask|setTimeout/
  )
})

test('finish queues starter work, persists completion, and redirects without awaiting it', () => {
  const start = appSource.indexOf(
    'async function finishPersonalizedOnboarding() {'
  )
  const end = appSource.indexOf(
    '\nfunction getPostOnboardingAppUrl(',
    start
  )
  const source = appSource.slice(start, end)

  const orderedMarkers = [
    'if (personalizedOnboardingState.isApplyingChannels) return',
    'personalizedOnboardingState.isApplyingChannels = true',
    'renderPersonalizedOnboarding()',
    'const state = loadState() || defaultState(4, DEFAULT_CHANNELS)',
    'state.learnerProfile = {',
    'state.onboarding.version = ONBOARDING_VERSION',
    'state.onboarding.setupCompleted = true',
    'state.onboarding.starterFeed = createPendingStarterFeed(',
    "appendActivityLog(state, {",
    'if (!saveState(state)) {',
    "trackEdeniaEvent('onboarding_completed', {",
    'stopIntroMusic({ fadeDuration: 7.5 })',
    'window.location.assign(getPostOnboardingAppUrl())'
  ]
  let previousIndex = -1
  for (const marker of orderedMarkers) {
    const index = source.indexOf(marker, previousIndex + 1)
    assert.ok(index > previousIndex, `Expected ordered marker: ${marker}`)
    previousIndex = index
  }
  assert.doesNotMatch(source, /resolveStarterChannelSelections|refreshFeed\(|\bawait\b/)
})

test('finish preserves storage recovery and queued analytics metadata', () => {
  const start = appSource.indexOf(
    'async function finishPersonalizedOnboarding() {'
  )
  const end = appSource.indexOf(
    '\nfunction getPostOnboardingAppUrl(',
    start
  )
  const source = appSource.slice(start, end)

  assert.equal(
    [...source.matchAll(
      /showOnboardingRecovery\('storage', \{ state, resume: 'complete' \}\)/g
    )].length,
    1
  )
  assert.match(
    source,
    /trackEdeniaEvent\('onboarding_completed', \{\s*learning_languages: state\.learnerProfile\.languages,\s*learner_level: state\.learnerProfile\.level \|\| null,\s*selected_channel_count: state\.learnerProfile\.selectedChannelCatalogIds\.length,\s*added_channel_count: 0,\s*resolved_channel_count: 0,\s*failed_channel_count: 0,\s*refresh_result: selectedChannelCatalogIds\.length \? 'queued' : 'not_requested'/
  )
})

test('all six personalized-onboarding aliases are absent', () => {
  const aliases = [
    'selectOnboardingLanguage',
    'continuePersonalizedOnboardingFromLanguage',
    'selectOnboardingLevel',
    'setPersonalizedOnboardingStep',
    'toggleOnboardingChannel',
    'finishPersonalizedOnboarding'
  ]
  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit)
  for (const alias of aliases) {
    assert.equal(GLOBAL_ACTION_NAMES.includes(alias), false)
    assert.doesNotMatch(
      globalActionAudit,
      new RegExp(`(?:^|[\\s,])${alias}(?:[\\s,]|$)`)
    )
  }
  assert.doesNotMatch(
    appSource,
    /\bonclick=(["'])[^"']*\b(?:selectOnboardingLanguage|continuePersonalizedOnboardingFromLanguage|selectOnboardingLevel|setPersonalizedOnboardingStep|toggleOnboardingChannel|finishPersonalizedOnboarding)\s*\([\s\S]*?\1/
  )
})
