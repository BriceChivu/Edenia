import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindIntroNavigationActions
} from '../../src/features/onboarding/intro-navigation-actions.js'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
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
    '../../src/features/onboarding/intro-navigation-actions.js',
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

function findNavigationControl(id) {
  const controls = getElements(indexSource, 'button').filter(element => (
    getAttribute(element.tag, 'id') === id
  ))
  assert.equal(controls.length, 1, `Expected one #${id}`)
  return controls[0]
}

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

function createDirectControl(direction) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      introNavigationDirection: direction
    },
    listeners
  }
}

test('Previous and Next retain exact markup under direct navigation ownership', () => {
  const expectedControls = [
    {
      analyticsAction: 'onboarding.back',
      ariaLabelKey: 'onboarding.back',
      className: 'intro-nav-btn intro-nav-previous',
      content: '←',
      direction: '-1',
      eventName: 'onboarding_back_clicked',
      id: 'introPreviousBtn',
      titleKey: 'onboarding.back'
    },
    {
      analyticsAction: 'onboarding.continue',
      ariaLabelKey: 'onboarding.continue',
      className: 'intro-nav-btn intro-nav-next',
      content: '→',
      direction: '1',
      eventName: 'onboarding_continue_clicked',
      id: 'introNextBtn',
      titleKey: 'onboarding.continue'
    }
  ]

  for (const expected of expectedControls) {
    const control = findNavigationControl(expected.id)
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(getAttribute(control.tag, 'id'), expected.id)
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'data-intro-navigation-direction'),
      expected.direction
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      normalizeClickEventName(
        getAttribute(control.tag, 'data-analytics-action')
      ),
      expected.eventName
    )
    assert.equal(
      getAttribute(control.tag, 'data-i18n-title'),
      expected.titleKey
    )
    assert.equal(
      getAttribute(control.tag, 'data-i18n-aria-label'),
      expected.ariaLabelKey
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(getAttribute(control.tag, 'disabled'), null)
    assert.match(
      control.content,
      new RegExp(
        `<span aria-hidden="true">${expected.content}</span>`
      )
    )
  }
})

test('navigation actions bind targets directly with numeric arguments and no cancellation', () => {
  const controls = [
    createDirectControl('-1'),
    createDirectControl('1')
  ]
  const queriedSelectors = []
  const calls = []
  const root = {
    querySelectorAll(selector) {
      queriedSelectors.push(selector)
      return controls
    }
  }

  assert.equal(
    bindIntroNavigationActions(root, {
      navigate(...args) {
        calls.push(args)
        return 'ignored-navigation-result'
      }
    }),
    2
  )
  assert.equal(
    bindIntroNavigationActions(root, {
      navigate() {
        assert.fail('A repeated binding must not replace the first callback')
      }
    }),
    0
  )
  assert.deepEqual(queriedSelectors, [
    '[data-intro-navigation-direction]',
    '[data-intro-navigation-direction]'
  ])

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

  for (const control of controls) {
    const listeners = control.listeners.get('click') || []
    assert.equal(listeners.length, 1)
    assert.equal(listeners[0](event), undefined)
  }

  assert.deepEqual(calls, [[-1], [1]])
  assert.equal(typeof calls[0][0], 'number')
  assert.equal(typeof calls[1][0], 'number')
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('app composes navigation ownership before installing remaining legacy actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindIntroNavigationActions\s*\}\s*from '\.\/features\/onboarding\/intro-navigation-actions\.js'/
  )
  assert.match(
    appSource,
    /bindIntroNavigationActions\(document,\s*\{\s*navigate:\s*navigateIntroTrailer\s*\}\)/
  )

  const bindingIndex = appSource.indexOf(
    'bindIntroNavigationActions(document, {'
  )
  const installIndex = appSource.indexOf('installLegacyActions(window, {')
  assert.notEqual(bindingIndex, -1)
  assert.notEqual(installIndex, -1)
  assert.ok(bindingIndex < installIndex)

  assert.match(
    appSource,
    /function navigateIntroTrailer\(direction\) \{/
  )
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('keyboard and swipe navigation retain their lexical calls', () => {
  const keydownStart = appSource.indexOf(
    'function handleIntroTrailerKeydown(event) {'
  )
  const keydownEnd = appSource.indexOf(
    '\nfunction toggleIntroLocaleMenu(',
    keydownStart
  )
  assert.notEqual(keydownStart, -1)
  assert.notEqual(keydownEnd, -1)
  const keydownSource = appSource.slice(keydownStart, keydownEnd)

  assert.match(
    keydownSource,
    /if \(event\.key === 'ArrowLeft'\) \{\s*event\.preventDefault\(\)\s*navigateIntroTrailer\(-1\)/
  )
  assert.match(
    keydownSource,
    /else if \(event\.key === 'ArrowRight'\) \{\s*event\.preventDefault\(\)\s*navigateIntroTrailer\(1\)/
  )

  const touchStart = appSource.indexOf(
    'function initIntroTrailerTouchNavigation() {'
  )
  const touchEnd = appSource.indexOf(
    '\nfunction changeIntroLocale(',
    touchStart
  )
  assert.notEqual(touchStart, -1)
  assert.notEqual(touchEnd, -1)
  const touchSource = appSource.slice(touchStart, touchEnd)
  assert.match(
    touchSource,
    /if \(isHorizontalSwipe\) navigateIntroTrailer\(deltaX < 0 \? 1 : -1\)/
  )
})

test('navigation ownership leaves the four locale aliases and handlers intact', () => {
  assert.equal(LEGACY_ACTION_NAMES.includes('navigateIntroTrailer'), false)

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])navigateIntroTrailer(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    indexSource,
    /\bonclick=(["'])[^"']*\bnavigateIntroTrailer\s*\([\s\S]*?\1/
  )

  const retainedAliases = [
    'changeIntroLocale',
    'changeOnboardingLocale',
    'toggleIntroLocaleMenu',
    'toggleOnboardingLocaleMenu'
  ]
  for (const alias of retainedAliases) {
    assert.equal(
      LEGACY_ACTION_NAMES.includes(alias),
      true,
      `Expected retained ${alias} manifest entry`
    )
    assert.match(
      installMap,
      new RegExp(`(?:^|[\\s,])${alias}(?:[\\s,]|$)`),
      `Expected retained ${alias} install entry`
    )
  }

  assert.match(indexSource, /onclick="toggleIntroLocaleMenu\(event\)"/)
  assert.match(indexSource, /onclick="toggleOnboardingLocaleMenu\(event\)"/)
  assert.match(
    appSource,
    /name="introLocale"[^>]*onchange="changeIntroLocale\(this\.value\)"/
  )
  assert.match(
    appSource,
    /name="onboardingLocale"[^>]*onchange="changeOnboardingLocale\(this\.value\)"/
  )
})

test('target navigation runs before disabled-boundary generic analytics checks', () => {
  const navigationStart = appSource.indexOf(
    'function navigateIntroTrailer(direction) {'
  )
  const navigationEnd = appSource.indexOf(
    '\nfunction resetIntroTrailerTouchNavigation(',
    navigationStart
  )
  assert.notEqual(navigationStart, -1)
  assert.notEqual(navigationEnd, -1)
  const navigationSource = appSource.slice(
    navigationStart,
    navigationEnd
  )
  assert.match(
    navigationSource,
    /const nextScene = introTrailerState\.sceneIndex \+ Math\.sign\(Number\(direction\) \|\| 0\)/
  )
  assert.match(navigationSource, /setIntroTrailerScene\(nextScene\)/)

  const sceneStart = appSource.indexOf(
    'function setIntroTrailerScene(sceneIndex,'
  )
  const sceneEnd = appSource.indexOf(
    '\nfunction navigateIntroTrailer(',
    sceneStart
  )
  assert.notEqual(sceneStart, -1)
  assert.notEqual(sceneEnd, -1)
  const sceneSource = appSource.slice(sceneStart, sceneEnd)
  assert.match(
    sceneSource,
    /if \(previousButton\) previousButton\.disabled = introTrailerState\.sceneIndex === 0/
  )
  assert.match(
    sceneSource,
    /if \(nextButton\) nextButton\.disabled = introTrailerState\.sceneIndex === INTRO_TRAILER_SCENE_DURATIONS\.length - 1/
  )

  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.navigate\(direction\)\s*\}\)/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.equal(
    normalizeClickEventName('onboarding.back'),
    'onboarding_back_clicked'
  )
  assert.equal(
    normalizeClickEventName('onboarding.continue'),
    'onboarding_continue_clicked'
  )
})
