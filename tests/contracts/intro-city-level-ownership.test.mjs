import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindIntroCityLevelActions
} from '../../src/features/onboarding/intro-city-level-actions.js'

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
    '../../src/features/onboarding/intro-city-level-actions.js',
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

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

function createDirectControl(level) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      introCityLevel: level
    },
    listeners
  }
}

test('all city levels retain exact markup under direct ownership', () => {
  const controls = getElements(indexSource, 'button').filter(element => (
    getAttribute(element.tag, 'data-intro-city-level') !== null
  ))
  assert.equal(controls.length, 4)

  const expectedLevels = ['1', '4', '8', '12']
  assert.deepEqual(
    controls.map(control => (
      getAttribute(control.tag, 'data-intro-city-level')
    )),
    expectedLevels
  )

  for (const [index, control] of controls.entries()) {
    const level = expectedLevels[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'data-intro-city-level'),
      level
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'selectIntroCityLevel'
    )
    assert.equal(
      normalizeClickEventName(
        getAttribute(control.tag, 'data-analytics-action')
      ),
      'select_intro_city_level_clicked'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(getAttribute(control.tag, 'aria-pressed'), null)
    assert.equal(getAttribute(control.tag, 'aria-label'), null)
    assert.equal(control.content.trim(), level)
  }
})

test('city-level actions bind targets directly with exact numeric arguments', () => {
  const controls = ['1', '4', '8', '12'].map(createDirectControl)
  const queriedSelectors = []
  const calls = []
  const root = {
    querySelectorAll(selector) {
      queriedSelectors.push(selector)
      return controls
    }
  }

  assert.equal(
    bindIntroCityLevelActions(root, {
      selectLevel(...args) {
        calls.push(args)
        return 'ignored-level-result'
      }
    }),
    4
  )
  assert.equal(
    bindIntroCityLevelActions(root, {
      selectLevel() {
        assert.fail('A repeated binding must not replace the first callback')
      }
    }),
    0
  )
  assert.deepEqual(queriedSelectors, [
    '[data-intro-city-level]',
    '[data-intro-city-level]'
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

  assert.deepEqual(calls, [[1], [4], [8], [12]])
  assert.equal(calls.flat().every(level => typeof level === 'number'), true)
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('app composes city-level ownership before remaining legacy actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindIntroCityLevelActions\s*\}\s*from '\.\/features\/onboarding\/intro-city-level-actions\.js'/
  )
  assert.match(
    appSource,
    /bindIntroCityLevelActions\(document,\s*\{\s*selectLevel:\s*selectIntroCityLevel\s*\}\)/
  )

  const bindingIndex = appSource.indexOf(
    'bindIntroCityLevelActions(document, {'
  )
  const installIndex = appSource.indexOf('installLegacyActions(window, {')
  assert.notEqual(bindingIndex, -1)
  assert.notEqual(installIndex, -1)
  assert.ok(bindingIndex < installIndex)

  assert.match(appSource, /function selectIntroCityLevel\(level\) \{/)
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('manual and automatic city timers retain their current lifecycle', () => {
  const automaticStart = appSource.indexOf(
    'function animateIntroCityLevel() {'
  )
  const automaticEnd = appSource.indexOf(
    '\nfunction updateIntroCityLevelControls(',
    automaticStart
  )
  assert.notEqual(automaticStart, -1)
  assert.notEqual(automaticEnd, -1)
  const automaticSource = appSource.slice(automaticStart, automaticEnd)
  assert.match(automaticSource, /updateIntroCityLevelControls\(1\)/)
  assert.match(
    automaticSource,
    /;\[\[2500, '4'\], \[5100, '8'\], \[7700, '12'\]\]\.forEach\(\(\[delay, value\]\) => \{/
  )
  assert.match(
    automaticSource,
    /introTrailerState\.cityLevelTimers\.push\(window\.setTimeout\(\(\) => \{\s*updateIntroCityLevelControls\(value\)\s*\}, delay\)\)/
  )

  const manualStart = appSource.indexOf(
    'function selectIntroCityLevel(level) {'
  )
  const manualEnd = appSource.indexOf(
    '\nfunction updateIntroSoundButton(',
    manualStart
  )
  assert.notEqual(manualStart, -1)
  assert.notEqual(manualEnd, -1)
  const manualSource = appSource.slice(manualStart, manualEnd)
  assert.match(
    manualSource,
    /if \(!introTrailerState\.active \|\| introTrailerState\.sceneIndex !== 2\) return/
  )
  assert.match(
    manualSource,
    /if \(!\['1', '4', '8', '12'\]\.includes\(normalizedLevel\)\) return/
  )
  assert.match(
    manualSource,
    /window\.clearTimeout\(introTrailerState\.sceneTimer\)/
  )
  assert.match(
    manualSource,
    /introTrailerState\.cityLevelTimers\.forEach\(timer => window\.clearTimeout\(timer\)\)/
  )
  assert.match(
    manualSource,
    /levels\.slice\(selectedIndex \+ 1\)\.forEach\(\(nextLevel, index\) => \{[\s\S]*?levelPause \* \(index \+ 1\)/
  )
  assert.match(
    manualSource,
    /introTrailerState\.sceneTimer = window\.setTimeout\(\(\) => setIntroTrailerScene\(3\), levelPause \* \(remainingLevelCount \+ 1\)\)/
  )
})

test('city-level ARIA state remains synchronized after selection', () => {
  const updateStart = appSource.indexOf(
    'function updateIntroCityLevelControls(level) {'
  )
  const updateEnd = appSource.indexOf(
    '\nfunction selectIntroCityLevel(',
    updateStart
  )
  assert.notEqual(updateStart, -1)
  assert.notEqual(updateEnd, -1)
  const updateSource = appSource.slice(updateStart, updateEnd)

  assert.match(
    updateSource,
    /const isSelected = button\.dataset\.introCityLevel === normalizedLevel/
  )
  assert.match(
    updateSource,
    /button\.setAttribute\('aria-pressed', String\(isSelected\)\)/
  )
  assert.match(
    updateSource,
    /button\.setAttribute\('aria-label', `\$\{t\('intro\.city\.level'\)\} \$\{button\.dataset\.introCityLevel\}`\)/
  )
})

test('city ownership leaves the four locale aliases and handlers intact', () => {
  assert.equal(LEGACY_ACTION_NAMES.includes('selectIntroCityLevel'), false)

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])selectIntroCityLevel(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    indexSource,
    /\bonclick=(["'])[^"']*\bselectIntroCityLevel\s*\([\s\S]*?\1/
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

test('all city levels keep one bubbling generic analytics identity', () => {
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.selectLevel\(level\)\s*\}\)/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.equal(
    normalizeClickEventName('selectIntroCityLevel'),
    'select_intro_city_level_clicked'
  )
})
