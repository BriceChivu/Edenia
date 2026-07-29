import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindIntroFinishActions
} from '../../src/features/onboarding/intro-finish-actions.js'

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
    '../../src/features/onboarding/intro-finish-actions.js',
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

function findFinishControl(predicate, description) {
  const controls = getElements(indexSource, 'button').filter(predicate)
  assert.equal(controls.length, 1, `Expected one ${description}`)
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

function createDirectControl() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    listeners
  }
}

test('Skip and Start retain exact markup under direct finish ownership', () => {
  const expectedControls = [
    {
      analyticsAction: 'intro.skip',
      className: 'intro-skip',
      content: 'Skip intro',
      eventName: 'intro_skip_clicked',
      id: null,
      translationKey: 'intro.skip'
    },
    {
      analyticsAction: 'intro.finale.cta',
      className: 'btn-primary intro-start',
      content: 'Start my journey',
      eventName: 'intro_finale_cta_clicked',
      id: 'introStartBtn',
      translationKey: 'intro.finale.cta'
    }
  ]

  for (const expected of expectedControls) {
    const control = findFinishControl(
      element => (
        getAttribute(element.tag, 'class') === expected.className
      ),
      expected.className
    )
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(getAttribute(control.tag, 'id'), expected.id)
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'data-intro-finish-action'),
      'finish'
    )
    assert.equal(
      getAttribute(control.tag, 'data-i18n'),
      expected.translationKey
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
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(control.content.trim(), expected.content)
  }
})

test('finish actions bind each target directly, once, with zero arguments', () => {
  const controls = [createDirectControl(), createDirectControl()]
  const queriedSelectors = []
  const calls = []
  const root = {
    querySelectorAll(selector) {
      queriedSelectors.push(selector)
      return controls
    }
  }

  assert.equal(
    bindIntroFinishActions(root, {
      finish(...args) {
        calls.push(args)
        return 'ignored-finish-result'
      }
    }),
    2
  )
  assert.equal(
    bindIntroFinishActions(root, {
      finish() {
        assert.fail('A repeated binding must not replace the first callback')
      }
    }),
    0
  )
  assert.deepEqual(queriedSelectors, [
    '[data-intro-finish-action]',
    '[data-intro-finish-action]'
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

  assert.deepEqual(calls, [[], []])
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('app composes finish ownership before installing remaining legacy actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindIntroFinishActions\s*\}\s*from '\.\/features\/onboarding\/intro-finish-actions\.js'/
  )
  assert.match(
    appSource,
    /bindIntroFinishActions\(document,\s*\{\s*finish:\s*finishIntroTrailer\s*\}\)/
  )

  const bindingIndex = appSource.indexOf('bindIntroFinishActions(document, {')
  const installIndex = appSource.indexOf('installLegacyActions(window, {')
  assert.notEqual(bindingIndex, -1)
  assert.notEqual(installIndex, -1)
  assert.ok(bindingIndex < installIndex)

  assert.match(appSource, /function finishIntroTrailer\(\) \{/)
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('Escape retains its lexical finish call after closing an open locale menu', () => {
  const handlerStart = appSource.indexOf(
    'function handleIntroTrailerKeydown(event) {'
  )
  const handlerEnd = appSource.indexOf(
    '\nfunction toggleIntroLocaleMenu(',
    handlerStart
  )
  assert.notEqual(handlerStart, -1)
  assert.notEqual(handlerEnd, -1)
  const handlerSource = appSource.slice(handlerStart, handlerEnd)

  assert.match(
    handlerSource,
    /else if \(event\.key === 'Escape'\) \{\s*event\.preventDefault\(\)\s*const localeMenu = document\.getElementById\('introLocaleMenu'\)\s*if \(localeMenu && !localeMenu\.classList\.contains\('hidden'\)\) \{\s*closeIntroLocaleMenu\(\)\s*return\s*\}\s*finishIntroTrailer\(\)/
  )
})

test('finish ownership leaves the other six intro aliases and handlers intact', () => {
  assert.equal(LEGACY_ACTION_NAMES.includes('finishIntroTrailer'), false)

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])finishIntroTrailer(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    indexSource,
    /\bonclick=(["'])[^"']*\bfinishIntroTrailer\s*\([\s\S]*?\1/
  )

  const retainedAliases = [
    'changeIntroLocale',
    'changeOnboardingLocale',
    'navigateIntroTrailer',
    'selectIntroCityLevel',
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

  assert.equal(
    [...indexSource.matchAll(
      /onclick="navigateIntroTrailer\((?:-1|1)\)"/g
    )].length,
    2
  )
  assert.equal(
    [...indexSource.matchAll(
      /onclick="selectIntroCityLevel\((?:1|4|8|12)\)"/g
    )].length,
    4
  )
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

test('CTA and Return generic identities remain dynamic after finish callback', () => {
  const trailerStart = appSource.indexOf('function startIntroTrailer(')
  const trailerEnd = appSource.indexOf(
    '\nfunction setIntroTrailerScene(',
    trailerStart
  )
  assert.notEqual(trailerStart, -1)
  assert.notEqual(trailerEnd, -1)
  const trailerSource = appSource.slice(trailerStart, trailerEnd)

  assert.match(
    trailerSource,
    /const labelKey = replay \? 'intro\.finale\.return' : 'intro\.finale\.cta'/
  )
  assert.match(trailerSource, /startButton\.dataset\.i18n = labelKey/)
  assert.match(
    trailerSource,
    /startButton\.dataset\.analyticsAction = labelKey/
  )
  assert.match(trailerSource, /startButton\.textContent = t\(labelKey\)/)
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{[\s\S]*?capture\(`\$\{eventName\}_clicked`, \{/
  )

  assert.equal(
    normalizeClickEventName('intro.finale.cta'),
    'intro_finale_cta_clicked'
  )
  assert.equal(
    normalizeClickEventName('intro.finale.return'),
    'intro_finale_return_clicked'
  )
})
