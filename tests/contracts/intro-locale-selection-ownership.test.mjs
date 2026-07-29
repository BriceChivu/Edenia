import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindIntroLocaleSelectionActions
} from '../../src/features/onboarding/intro-locale-selection-actions.js'

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
    '../../src/features/onboarding/intro-locale-selection-actions.js',
    import.meta.url
  ),
  'utf8'
)

const renderStart = appSource.indexOf('function renderLocaleSelect() {')
const renderEnd = appSource.indexOf(
  '\nfunction reportMissingI18nKeys(',
  renderStart
)
assert.notEqual(renderStart, -1)
assert.notEqual(renderEnd, -1)
const renderSource = appSource.slice(renderStart, renderEnd)

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

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function createDirectControl(action, value) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      introLocaleAction: action
    },
    listeners,
    value
  }
}

function getFunctionSlice(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1, `Expected ${name}`)
  assert.notEqual(end, -1, `Expected boundary after ${name}`)
  return appSource.slice(start, end)
}

test('generated locale radios retain exact labels, semantics, and metadata', () => {
  const expectedOptions = [
    {
      action: 'change-intro',
      analyticsAction: 'changeIntroLocale',
      menuAssignment: 'introMenu.innerHTML',
      name: 'introLocale'
    },
    {
      action: 'change-onboarding',
      analyticsAction: 'changeOnboardingLocale',
      menuAssignment: 'onboardingMenu.innerHTML',
      name: 'onboardingLocale'
    }
  ]
  const inputs = getOpeningTags(renderSource, 'input')
  const labels = getElements(renderSource, 'label')

  for (const expected of expectedOptions) {
    const input = inputs.find(tag => (
      getAttribute(tag, 'name') === expected.name
    ))
    assert.ok(input, `Expected generated ${expected.name} radio`)
    assert.equal(getAttribute(input, 'type'), 'radio')
    assert.equal(getAttribute(input, 'name'), expected.name)
    assert.equal(getAttribute(input, 'value'), '${escHtml(locale)}')
    assert.match(input, /\$\{locale === currentLocale \? 'checked' : ''\}/)
    assert.equal(
      getAttribute(input, 'data-intro-locale-action'),
      expected.action
    )
    assert.equal(
      getAttribute(input, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(getAttribute(input, 'onchange'), null)
    assert.equal(getAttribute(input, 'onclick'), null)

    const label = labels.find(element => (
      element.content.includes(`name="${expected.name}"`)
    ))
    assert.ok(label, `Expected ${expected.name} option label`)
    assert.equal(
      getAttribute(label.tag, 'class'),
      'settings-locale-option'
    )
    assert.match(
      label.content,
      /<span>\$\{escHtml\(getLocaleLabel\(locale\)\)\}<\/span>/
    )
    assert.match(
      renderSource,
      new RegExp(
        `${expected.menuAssignment.replace('.', '\\.')} = SUPPORTED_LOCALES\\.map\\(locale =>`
      )
    )
  }
})

test('each replaced menu binds immediately after its innerHTML assignment', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindIntroLocaleSelectionActions\s*\}\s*from '\.\/features\/onboarding\/intro-locale-selection-actions\.js'/
  )

  const expectedBindings = [
    {
      menu: 'introMenu',
      nextBoundary: 'const onboardingButton'
    },
    {
      menu: 'onboardingMenu',
      nextBoundary: 'const btn'
    }
  ]

  for (const expected of expectedBindings) {
    const assignment = `${expected.menu}.innerHTML = SUPPORTED_LOCALES.map`
    const binding = `bindIntroLocaleSelectionActions(${expected.menu}, {`
    const assignmentIndex = renderSource.indexOf(assignment)
    const bindingIndex = renderSource.indexOf(binding, assignmentIndex)
    const boundaryIndex = renderSource.indexOf(
      expected.nextBoundary,
      assignmentIndex
    )
    assert.notEqual(assignmentIndex, -1)
    assert.notEqual(bindingIndex, -1)
    assert.notEqual(boundaryIndex, -1)
    assert.ok(bindingIndex > assignmentIndex)
    assert.ok(bindingIndex < boundaryIndex)
  }

  assert.equal(
    [...renderSource.matchAll(
      /bindIntroLocaleSelectionActions\((?:introMenu|onboardingMenu), \{\s*changeIntro: changeIntroLocale,\s*changeOnboarding: changeOnboardingLocale\s*\}\)/g
    )].length,
    2
  )
})

test('selection actions read only the live value with no event cancellation', () => {
  const introControl = createDirectControl('change-intro', 'en')
  const onboardingControl = createDirectControl(
    'change-onboarding',
    'zh-Hant'
  )
  const calls = []
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-intro-locale-action]')
      return [introControl, onboardingControl]
    }
  }

  assert.equal(
    bindIntroLocaleSelectionActions(root, {
      changeIntro(...args) {
        calls.push(['intro', args])
      },
      changeOnboarding(...args) {
        calls.push(['onboarding', args])
      }
    }),
    2
  )

  introControl.value = 'fr'
  onboardingControl.value = 'es'
  const events = [introControl, onboardingControl].map(() => ({
    preventDefaultCalls: 0,
    stopPropagationCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1
    },
    stopPropagation() {
      this.stopPropagationCalls += 1
    }
  }))

  assert.equal(
    introControl.listeners.get('change')[0](events[0]),
    undefined
  )
  assert.equal(
    onboardingControl.listeners.get('change')[0](events[1]),
    undefined
  )
  assert.deepEqual(calls, [
    ['intro', ['fr']],
    ['onboarding', ['es']]
  ])
  for (const event of events) {
    assert.equal(event.preventDefaultCalls, 0)
    assert.equal(event.stopPropagationCalls, 0)
  }
})

test('replacement is synchronous, loses old focus, and binds new controls', () => {
  assert.match(
    renderSource,
    /introMenu\.innerHTML = SUPPORTED_LOCALES\.map\(locale => `[\s\S]*?`\)\.join\(''\)\s*bindIntroLocaleSelectionActions\(introMenu, \{/
  )
  assert.match(
    renderSource,
    /onboardingMenu\.innerHTML = SUPPORTED_LOCALES\.map\(locale => `[\s\S]*?`\)\.join\(''\)\s*bindIntroLocaleSelectionActions\(onboardingMenu, \{/
  )
  assert.doesNotMatch(renderSource, /document\.activeElement|\.focus\(/)

  const callbacks = {
    changeIntro() {},
    changeOnboarding() {}
  }
  const oldControl = createDirectControl('change-intro', 'en')
  const replacementControl = createDirectControl('change-intro', 'fr')
  assert.equal(
    bindIntroLocaleSelectionActions(
      { querySelectorAll: () => [oldControl] },
      callbacks
    ),
    1
  )
  assert.equal(
    bindIntroLocaleSelectionActions(
      { querySelectorAll: () => [replacementControl] },
      callbacks
    ),
    1
  )
  assert.equal(oldControl.listeners.get('change').length, 1)
  assert.equal(replacementControl.listeners.get('change').length, 1)
})

test('every direct renderLocaleSelect call path receives replacement binding', () => {
  const directCalls = [...appSource.matchAll(/\brenderLocaleSelect\(\)/g)]
    .filter(match => (
      appSource.slice(Math.max(0, match.index - 9), match.index)
        !== 'function '
    ))
  assert.equal(
    directCalls.length,
    4
  )

  const expectedCallers = [
    getFunctionSlice('applyTranslations', 'renderLocaleSelect'),
    getFunctionSlice(
      'renderOnboardingLanguageStep',
      'renderOnboardingOtherStep'
    ),
    getFunctionSlice('importSyncFileFromInput', 'formatBackupTimestamp'),
    getFunctionSlice('restoreStateBackup', 'getImportedSyncState')
  ]
  for (const source of expectedCallers) {
    assert.match(source, /\brenderLocaleSelect\(\)/)
  }

  assert.equal(
    [...renderSource.matchAll(
      /bindIntroLocaleSelectionActions\(/g
    )].length,
    2,
    'Every render rebuild binds both locale menus inside renderLocaleSelect'
  )
})

test('local locale-change callbacks retain their synchronous state behavior', () => {
  const introSource = getFunctionSlice(
    'changeIntroLocale',
    'handleIntroTrailerKeydown'
  )
  assert.match(introSource, /^function changeIntroLocale\(locale\)/)
  assert.match(introSource, /closeIntroLocaleMenu\(\)/)
  assert.match(introSource, /const nextLocale = normalizeLocale\(locale\)/)
  assert.match(introSource, /saveState\(state, \{ backup: false \}\)/)
  assert.match(introSource, /applyLocale\(nextLocale\)/)

  const onboardingSource = getFunctionSlice(
    'changeOnboardingLocale',
    'animateIntroCityLevel'
  )
  assert.match(
    onboardingSource,
    /^function changeOnboardingLocale\(locale\)/
  )
  assert.match(onboardingSource, /closeOnboardingLocaleMenu\(\)/)
  assert.match(
    onboardingSource,
    /const nextLocale = normalizeLocale\(locale\)/
  )
  assert.match(onboardingSource, /saveState\(state, \{ backup: false \}\)/)
  assert.match(onboardingSource, /applyLocale\(nextLocale\)/)
  assert.match(onboardingSource, /renderPersonalizedOnboarding\(\)/)

  assert.doesNotMatch(introSource, /\.preventDefault\(|\.stopPropagation\(/)
  assert.doesNotMatch(
    onboardingSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('all eight intro shell aliases are absent from the compatibility bridge', () => {
  const introShellAliases = [
    'toggleIntroSound',
    'finishIntroTrailer',
    'navigateIntroTrailer',
    'selectIntroCityLevel',
    'toggleIntroLocaleMenu',
    'changeIntroLocale',
    'toggleOnboardingLocaleMenu',
    'changeOnboardingLocale'
  ]
  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)

  for (const alias of introShellAliases) {
    assert.equal(
      LEGACY_ACTION_NAMES.includes(alias),
      false,
      `Expected removed ${alias} manifest entry`
    )
    assert.doesNotMatch(
      installMap,
      new RegExp(`(?:^|[\\s,])${alias}(?:[\\s,]|$)`),
      `Expected removed ${alias} install entry`
    )
  }
  assert.doesNotMatch(
    indexSource,
    /\bonclick=(["'])[^"']*\b(?:toggleIntroSound|finishIntroTrailer|navigateIntroTrailer|selectIntroCityLevel|toggleIntroLocaleMenu|toggleOnboardingLocaleMenu)\s*\([\s\S]*?\1/
  )
  assert.doesNotMatch(
    appSource,
    /\bonchange=(["'])[^"']*\b(?:changeIntroLocale|changeOnboardingLocale)\s*\([\s\S]*?\1/
  )
})

test('generated radio metadata remains outside the generic click collector', () => {
  assert.match(
    moduleSource,
    /control\.addEventListener\('change', \(\) => \{\s*actions\.changeIntro\(control\.value\)\s*\}\)/
  )
  assert.match(
    moduleSource,
    /control\.addEventListener\('change', \(\) => \{\s*actions\.changeOnboarding\(control\.value\)\s*\}\)/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/
  )
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\('change'/
  )
})
