import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

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

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function hasAttribute(tag, name) {
  return new RegExp(`\\s${name}(?:\\s|=|>)`).test(tag)
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function findSingleTag(tagName, predicate, description) {
  const matches = getOpeningTags(indexSource, tagName).filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

function findButtonById(id) {
  return findSingleTag(
    'button',
    tag => getAttribute(tag, 'id') === id,
    `#${id} button`
  )
}

function findButtonByClass(className) {
  return findSingleTag(
    'button',
    tag => String(getAttribute(tag, 'class'))
      .split(/\s+/)
      .includes(className),
    `.${className} button`
  )
}

function normalizeClickEventName(action) {
  return String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
}

function getFunctionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`)
    .exec(appSource)
  assert.ok(match, `Expected ${name} function`)

  const parameterStart = appSource.indexOf('(', match.index)
  let parameterDepth = 0
  let parameterEnd = -1
  for (let index = parameterStart; index < appSource.length; index += 1) {
    if (appSource[index] === '(') parameterDepth += 1
    if (appSource[index] === ')') {
      parameterDepth -= 1
      if (parameterDepth === 0) {
        parameterEnd = index
        break
      }
    }
  }
  assert.notEqual(parameterEnd, -1, `Expected ${name} parameter boundary`)

  const bodyStart = appSource.indexOf('{', parameterEnd)
  let bodyDepth = 0
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') bodyDepth += 1
    if (appSource[index] === '}') {
      bodyDepth -= 1
      if (bodyDepth === 0) return appSource.slice(match.index, index + 1)
    }
  }

  assert.fail(`Expected ${name} body boundary`)
}

const staticControls = [
  {
    label: 'intro sound',
    tag: () => findButtonById('introSoundBtn'),
    className: 'intro-sound',
    id: 'introSoundBtn',
    handler: null,
    analyticsAction: 'introSoundBtn',
    eventName: 'intro_sound_btn_clicked',
    dataI18n: null,
    ariaPressed: 'false',
    stopsPropagation: false
  },
  {
    label: 'Skip intro',
    tag: () => findButtonByClass('intro-skip'),
    className: 'intro-skip',
    id: null,
    handler: null,
    introFinishAction: 'finish',
    analyticsAction: 'intro.skip',
    eventName: 'intro_skip_clicked',
    dataI18n: 'intro.skip',
    ariaPressed: null,
    stopsPropagation: false
  },
  {
    label: 'Previous trailer scene',
    tag: () => findButtonById('introPreviousBtn'),
    className: 'intro-nav-btn intro-nav-previous',
    id: 'introPreviousBtn',
    handler: null,
    navigationDirection: '-1',
    analyticsAction: 'onboarding.back',
    eventName: 'onboarding_back_clicked',
    dataI18n: null,
    i18nTitle: 'onboarding.back',
    i18nAriaLabel: 'onboarding.back',
    ariaPressed: null,
    stopsPropagation: false
  },
  {
    label: 'Next trailer scene',
    tag: () => findButtonById('introNextBtn'),
    className: 'intro-nav-btn intro-nav-next',
    id: 'introNextBtn',
    handler: null,
    navigationDirection: '1',
    analyticsAction: 'onboarding.continue',
    eventName: 'onboarding_continue_clicked',
    dataI18n: null,
    i18nTitle: 'onboarding.continue',
    i18nAriaLabel: 'onboarding.continue',
    ariaPressed: null,
    stopsPropagation: false
  },
  {
    label: 'Start or return from trailer',
    tag: () => findButtonById('introStartBtn'),
    className: 'btn-primary intro-start',
    id: 'introStartBtn',
    handler: null,
    introFinishAction: 'finish',
    analyticsAction: 'intro.finale.cta',
    eventName: 'intro_finale_cta_clicked',
    dataI18n: 'intro.finale.cta',
    ariaPressed: null,
    stopsPropagation: false
  },
  {
    label: 'onboarding sound',
    tag: () => findButtonById('onboardingSoundBtn'),
    className: 'intro-sound onboarding-sound',
    id: 'onboardingSoundBtn',
    handler: null,
    analyticsAction: 'onboardingSoundBtn',
    eventName: 'onboarding_sound_btn_clicked',
    dataI18n: null,
    ariaPressed: 'false',
    stopsPropagation: false
  },
  {
    label: 'intro locale menu',
    tag: () => findButtonById('introLocaleBtn'),
    className: 'btn-secondary settings-locale-btn intro-locale-btn',
    id: 'introLocaleBtn',
    handler: 'toggleIntroLocaleMenu(event)',
    analyticsAction: 'introLocaleBtn',
    eventName: 'intro_locale_btn_clicked',
    dataI18n: null,
    ariaPressed: null,
    ariaHaspopup: 'true',
    ariaExpanded: 'false',
    stopsPropagation: true
  },
  {
    label: 'onboarding locale menu',
    tag: () => findButtonById('onboardingLocaleBtn'),
    className: 'btn-secondary settings-locale-btn intro-locale-btn',
    id: 'onboardingLocaleBtn',
    handler: 'toggleOnboardingLocaleMenu(event)',
    analyticsAction: 'onboardingLocaleBtn',
    eventName: 'onboarding_locale_btn_clicked',
    dataI18n: null,
    ariaPressed: null,
    ariaHaspopup: 'true',
    ariaExpanded: 'false',
    stopsPropagation: true
  }
]

test('static intro and onboarding controls retain exact metadata and ownership hooks', () => {
  for (const expected of staticControls) {
    const tag = expected.tag()

    assert.equal(getAttribute(tag, 'type'), 'button', expected.label)
    assert.equal(getAttribute(tag, 'class'), expected.className, expected.label)
    assert.equal(getAttribute(tag, 'id'), expected.id, expected.label)
    assert.equal(getAttribute(tag, 'onclick'), expected.handler, expected.label)
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      expected.analyticsAction,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'data-intro-finish-action'),
      expected.introFinishAction ?? null,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'data-intro-navigation-direction'),
      expected.navigationDirection ?? null,
      expected.label
    )
    assert.equal(
      `${normalizeClickEventName(expected.analyticsAction)}_clicked`,
      expected.eventName,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'data-i18n'),
      expected.dataI18n,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'data-i18n-title'),
      expected.i18nTitle ?? null,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'data-i18n-aria-label'),
      expected.i18nAriaLabel ?? null,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'aria-pressed'),
      expected.ariaPressed,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'aria-haspopup'),
      expected.ariaHaspopup ?? null,
      expected.label
    )
    assert.equal(
      getAttribute(tag, 'aria-expanded'),
      expected.ariaExpanded ?? null,
      expected.label
    )
    if (expected.handler !== null) {
      assert.equal(
        expected.handler.startsWith('return '),
        false,
        `${expected.label} must retain non-returning inline ownership`
      )
    }
  }
})

test('all four city-level controls retain numeric calls and one analytics identity', () => {
  const buttons = getOpeningTags(indexSource, 'button')
    .filter(tag => getAttribute(tag, 'data-intro-city-level') !== null)

  assert.equal(buttons.length, 4)
  assert.deepEqual(
    buttons.map(tag => getAttribute(tag, 'data-intro-city-level')),
    ['1', '4', '8', '12']
  )

  for (const tag of buttons) {
    const level = getAttribute(tag, 'data-intro-city-level')
    assert.equal(getAttribute(tag, 'type'), 'button')
    assert.equal(getAttribute(tag, 'onclick'), `selectIntroCityLevel(${level})`)
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      'selectIntroCityLevel'
    )
    assert.equal(
      `${normalizeClickEventName(getAttribute(tag, 'data-analytics-action'))}_clicked`,
      'select_intro_city_level_clicked'
    )
    assert.equal(getAttribute(tag, 'aria-pressed'), null)
    assert.equal(getAttribute(tag, 'aria-label'), null)
  }
})

test('Start and return states keep their translated analytics identities in sync', () => {
  const source = getFunctionSource('startIntroTrailer')

  assert.match(
    source,
    /const labelKey = replay \? 'intro\.finale\.return' : 'intro\.finale\.cta'/
  )
  assert.match(source, /startButton\.dataset\.i18n = labelKey/)
  assert.match(source, /startButton\.dataset\.analyticsAction = labelKey/)
  assert.match(source, /startButton\.textContent = t\(labelKey\)/)
  assert.equal(
    `${normalizeClickEventName('intro.finale.cta')}_clicked`,
    'intro_finale_cta_clicked'
  )
  assert.equal(
    `${normalizeClickEventName('intro.finale.return')}_clicked`,
    'intro_finale_return_clicked'
  )
})

test('sound and city controls retain their live accessibility metadata updates', () => {
  const soundSource = getFunctionSource('updateIntroSoundButton')
  assert.match(
    soundSource,
    /document\.querySelectorAll\('\[data-intro-sound-toggle\]'\)\.forEach\(button => \{/
  )
  assert.match(
    soundSource,
    /button\.setAttribute\('aria-pressed', String\(introTrailerState\.soundEnabled\)\)/
  )
  assert.match(soundSource, /button\.setAttribute\('aria-label', labelText\)/)
  assert.match(soundSource, /button\.title = labelText/)

  for (const id of ['introSoundBtn', 'onboardingSoundBtn']) {
    assert.equal(hasAttribute(findButtonById(id), 'data-intro-sound-toggle'), true)
  }

  const citySource = getFunctionSource('updateIntroCityLevelControls')
  assert.match(
    citySource,
    /document\.querySelectorAll\('\[data-intro-city-level\]'\)\.forEach\(button => \{/
  )
  assert.match(
    citySource,
    /button\.setAttribute\('aria-pressed', String\(isSelected\)\)/
  )
  assert.match(
    citySource,
    /button\.setAttribute\('aria-label', `\$\{t\('intro\.city\.level'\)\} \$\{button\.dataset\.introCityLevel\}`\)/
  )
})

test('locale menus retain trigger, radiogroup, and generated radio semantics', () => {
  const expectedMenus = [
    {
      menuId: 'introLocaleMenu',
      assignment: 'introMenu.innerHTML',
      radioName: 'introLocale',
      handler: 'changeIntroLocale(this.value)',
      analyticsAction: 'changeIntroLocale'
    },
    {
      menuId: 'onboardingLocaleMenu',
      assignment: 'onboardingMenu.innerHTML',
      radioName: 'onboardingLocale',
      handler: 'changeOnboardingLocale(this.value)',
      analyticsAction: 'changeOnboardingLocale'
    }
  ]

  const renderSource = getFunctionSource('renderLocaleSelect')
  const generatedInputs = getOpeningTags(renderSource, 'input')

  for (const expected of expectedMenus) {
    const menu = findSingleTag(
      'div',
      tag => getAttribute(tag, 'id') === expected.menuId,
      `#${expected.menuId}`
    )
    assert.equal(
      getAttribute(menu, 'class'),
      'settings-locale-menu intro-locale-menu hidden'
    )
    assert.equal(getAttribute(menu, 'role'), 'radiogroup')
    assert.equal(getAttribute(menu, 'aria-label'), 'Language')
    assert.equal(
      getAttribute(menu, 'data-i18n-aria-label'),
      'settings.language.label'
    )

    assert.match(
      renderSource,
      new RegExp(
        `${expected.assignment.replace('.', '\\.')} = SUPPORTED_LOCALES\\.map\\(locale =>`
      )
    )

    const input = generatedInputs.find(
      tag => getAttribute(tag, 'name') === expected.radioName
    )
    assert.ok(input, `Expected generated ${expected.radioName} radio`)
    assert.equal(getAttribute(input, 'type'), 'radio')
    assert.equal(getAttribute(input, 'value'), '${escHtml(locale)}')
    assert.equal(getAttribute(input, 'onchange'), expected.handler)
    assert.equal(getAttribute(input, 'onclick'), null)
    assert.equal(
      getAttribute(input, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.match(input, /\$\{locale === currentLocale \? 'checked' : ''\}/)
  }

  assert.equal(
    [...renderSource.matchAll(/<label class="settings-locale-option">/g)].length,
    3,
    'Intro, onboarding, and Settings locale radios share the current option class'
  )
})

test('current propagation determines which generic click identities are emitted', () => {
  const bubblingHandlers = [
    'toggleIntroSound',
    'selectIntroCityLevel'
  ]
  for (const handlerName of bubblingHandlers) {
    const source = getFunctionSource(handlerName)
    assert.doesNotMatch(source, /\.stopPropagation\(/, handlerName)
    assert.doesNotMatch(source, /\.preventDefault\(/, handlerName)
  }

  for (const handlerName of [
    'toggleIntroLocaleMenu',
    'toggleOnboardingLocaleMenu'
  ]) {
    const source = getFunctionSource(handlerName)
    assert.match(
      source,
      new RegExp(
        `function ${handlerName}\\(event\\) \\{\\s*event\\.stopPropagation\\(\\)`
      )
    )
    assert.doesNotMatch(source, /\.preventDefault\(/, handlerName)
  }

  for (const expected of staticControls) {
    assert.equal(
      expected.stopsPropagation,
      ['introLocaleBtn', 'onboardingLocaleBtn'].includes(expected.id),
      expected.label
    )
  }

  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.match(
    analyticsSource,
    /capture\(`\$\{eventName\}_clicked`, \{/
  )

  assert.equal(
    staticControls
      .filter(control => control.stopsPropagation)
      .map(control => control.eventName)
      .join(','),
    'intro_locale_btn_clicked,onboarding_locale_btn_clicked',
    'Locale trigger identities stay latent because their handlers stop bubbling'
  )
})

test('navigation remains bubbling except when a boundary click disables its control', () => {
  const navigationSource = getFunctionSource('navigateIntroTrailer')
  const sceneSource = getFunctionSource('setIntroTrailerScene')

  assert.match(
    navigationSource,
    /const nextScene = introTrailerState\.sceneIndex \+ Math\.sign\(Number\(direction\) \|\| 0\)/
  )
  assert.doesNotMatch(navigationSource, /\.stopPropagation\(/)
  assert.doesNotMatch(navigationSource, /\.preventDefault\(/)
  assert.match(
    sceneSource,
    /if \(previousButton\) previousButton\.disabled = introTrailerState\.sceneIndex === 0/
  )
  assert.match(
    sceneSource,
    /if \(nextButton\) nextButton\.disabled = introTrailerState\.sceneIndex === INTRO_TRAILER_SCENE_DURATIONS\.length - 1/
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
})

test('locale radio changes have no generic click event while trigger clicks are suppressed', () => {
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/
  )
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\('change'/
  )

  const introChangeSource = getFunctionSource('changeIntroLocale')
  const onboardingChangeSource = getFunctionSource('changeOnboardingLocale')
  assert.match(introChangeSource, /^function changeIntroLocale\(locale\)/)
  assert.match(onboardingChangeSource, /^function changeOnboardingLocale\(locale\)/)
  assert.doesNotMatch(introChangeSource, /\.stopPropagation\(/)
  assert.doesNotMatch(onboardingChangeSource, /\.stopPropagation\(/)
})

test('remaining metadata-locked controls retain their temporary global aliases', () => {
  const installStart = appSource.indexOf('installLegacyActions(window, {')
  assert.notEqual(installStart, -1, 'Expected legacy action installation')
  const installSource = appSource.slice(
    installStart,
    appSource.indexOf('\n})', installStart) + 3
  )
  const expectedAliases = [
    'changeIntroLocale',
    'changeOnboardingLocale',
    'selectIntroCityLevel',
    'toggleIntroLocaleMenu',
    'toggleOnboardingLocaleMenu'
  ]

  for (const alias of expectedAliases) {
    assert.match(
      installSource,
      new RegExp(`\\n  ${alias},?(?:\\n|$)`),
      `Expected ${alias} compatibility alias`
    )
  }
})
