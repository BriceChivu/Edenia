import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindIntroLocaleMenuActions
} from '../../src/features/onboarding/intro-locale-menu-actions.js'

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
    '../../src/features/onboarding/intro-locale-menu-actions.js',
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

function findLocaleTrigger(id) {
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

function createDirectControl(action) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      introLocaleMenuAction: action
    },
    listeners
  }
}

test('both locale triggers retain exact markup under direct ownership', () => {
  const expectedControls = [
    {
      action: 'toggle-intro',
      analyticsAction: 'introLocaleBtn',
      eventName: 'intro_locale_btn_clicked',
      id: 'introLocaleBtn',
      labelId: 'introLocaleLabel'
    },
    {
      action: 'toggle-onboarding',
      analyticsAction: 'onboardingLocaleBtn',
      eventName: 'onboarding_locale_btn_clicked',
      id: 'onboardingLocaleBtn',
      labelId: 'onboardingLocaleLabel'
    }
  ]

  for (const expected of expectedControls) {
    const control = findLocaleTrigger(expected.id)
    assert.equal(
      getAttribute(control.tag, 'class'),
      'btn-secondary settings-locale-btn intro-locale-btn'
    )
    assert.equal(getAttribute(control.tag, 'id'), expected.id)
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'data-intro-locale-menu-action'),
      expected.action
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
    assert.equal(getAttribute(control.tag, 'aria-haspopup'), 'true')
    assert.equal(getAttribute(control.tag, 'aria-expanded'), 'false')
    assert.match(
      control.content,
      new RegExp(
        `<span class="settings-locale-label" id="${expected.labelId}">English</span>`
      )
    )
    assert.match(
      control.content,
      /<span class="settings-locale-caret" aria-hidden="true"><\/span>/
    )
  }
})

test('locale-menu actions forward the exact event to the matching callback', () => {
  const controls = [
    createDirectControl('toggle-intro'),
    createDirectControl('toggle-onboarding')
  ]
  const queriedSelectors = []
  const calls = []
  const root = {
    querySelectorAll(selector) {
      queriedSelectors.push(selector)
      return controls
    }
  }
  const actions = {
    toggleIntro(event) {
      calls.push(['intro', event])
      event.stopPropagation()
    },
    toggleOnboarding(event) {
      calls.push(['onboarding', event])
      event.stopPropagation()
    }
  }

  assert.equal(bindIntroLocaleMenuActions(root, actions), 2)
  assert.equal(
    bindIntroLocaleMenuActions(root, {
      toggleIntro() {
        assert.fail('A repeated binding must not replace the first callback')
      },
      toggleOnboarding() {
        assert.fail('A repeated binding must not replace the first callback')
      }
    }),
    0
  )
  assert.deepEqual(queriedSelectors, [
    '[data-intro-locale-menu-action]',
    '[data-intro-locale-menu-action]'
  ])

  const events = controls.map((control, index) => ({
    marker: index,
    preventDefaultCalls: 0,
    stopPropagationCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1
    },
    stopPropagation() {
      this.stopPropagationCalls += 1
    }
  }))

  controls.forEach((control, index) => {
    const listeners = control.listeners.get('click') || []
    assert.equal(listeners.length, 1)
    assert.equal(listeners[0](events[index]), undefined)
  })

  assert.deepEqual(calls, [
    ['intro', events[0]],
    ['onboarding', events[1]]
  ])
  for (const event of events) {
    assert.equal(event.stopPropagationCalls, 1)
    assert.equal(event.preventDefaultCalls, 0)
  }
})

test('app composes locale-menu ownership before remaining legacy actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindIntroLocaleMenuActions\s*\}\s*from '\.\/features\/onboarding\/intro-locale-menu-actions\.js'/
  )
  assert.match(
    appSource,
    /bindIntroLocaleMenuActions\(document,\s*\{\s*toggleIntro:\s*toggleIntroLocaleMenu,\s*toggleOnboarding:\s*toggleOnboardingLocaleMenu\s*\}\)/
  )

  const bindingIndex = appSource.indexOf(
    'bindIntroLocaleMenuActions(document, {'
  )
  const installIndex = appSource.indexOf('installLegacyActions(window, {')
  assert.notEqual(bindingIndex, -1)
  assert.notEqual(installIndex, -1)
  assert.ok(bindingIndex < installIndex)

  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('local menu callbacks retain stopPropagation without preventDefault', () => {
  const expectedCallbacks = [
    {
      buttonId: 'introLocaleBtn',
      menuId: 'introLocaleMenu',
      name: 'toggleIntroLocaleMenu'
    },
    {
      buttonId: 'onboardingLocaleBtn',
      menuId: 'onboardingLocaleMenu',
      name: 'toggleOnboardingLocaleMenu'
    }
  ]

  for (const expected of expectedCallbacks) {
    const start = appSource.indexOf(`function ${expected.name}(event) {`)
    const end = appSource.indexOf('\nfunction ', start + 1)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const source = appSource.slice(start, end)

    assert.match(
      source,
      new RegExp(
        `function ${expected.name}\\(event\\) \\{\\s*event\\.stopPropagation\\(\\)`
      )
    )
    assert.doesNotMatch(source, /\.preventDefault\(/)
    assert.match(
      source,
      new RegExp(
        `const button = document\\.getElementById\\('${expected.buttonId}'\\)`
      )
    )
    assert.match(
      source,
      new RegExp(
        `const menu = document\\.getElementById\\('${expected.menuId}'\\)`
      )
    )
    assert.match(
      source,
      /const isOpen = menu\.classList\.toggle\('hidden'\) === false/
    )
    assert.match(
      source,
      /button\.setAttribute\('aria-expanded', String\(isOpen\)\)/
    )
  }
})

test('outside-click closing remains scoped to each locale picker', () => {
  assert.match(
    appSource,
    /function closeIntroLocaleMenuOnOutsideClick\(event\) \{\s*if \(event\.target\.closest\('\.intro-language-picker'\)\) return\s*closeIntroLocaleMenu\(\)\s*\}/
  )
  assert.match(
    appSource,
    /function closeOnboardingLocaleMenuOnOutsideClick\(event\) \{\s*if \(event\.target\.closest\('\.onboarding-language-picker'\)\) return\s*closeOnboardingLocaleMenu\(\)\s*\}/
  )
  assert.match(
    appSource,
    /document\.addEventListener\('click', closeIntroLocaleMenuOnOutsideClick\)/
  )
  assert.match(
    appSource,
    /document\.addEventListener\('click', closeOnboardingLocaleMenuOnOutsideClick\)/
  )
})

test('toggle aliases are removed while generated locale-change aliases remain', () => {
  const migratedAliases = [
    'toggleIntroLocaleMenu',
    'toggleOnboardingLocaleMenu'
  ]
  const retainedAliases = [
    'changeIntroLocale',
    'changeOnboardingLocale'
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
    assert.doesNotMatch(
      indexSource,
      new RegExp(
        `\\bonclick=(["'])[^"']*\\b${alias}\\s*\\([\\s\\S]*?\\1`
      )
    )
  }

  for (const alias of retainedAliases) {
    assert.equal(LEGACY_ACTION_NAMES.includes(alias), true)
    assert.match(
      installMap,
      new RegExp(`(?:^|[\\s,])${alias}(?:[\\s,]|$)`)
    )
  }
  assert.match(
    appSource,
    /name="introLocale"[^>]*onchange="changeIntroLocale\(this\.value\)"/
  )
  assert.match(
    appSource,
    /name="onboardingLocale"[^>]*onchange="changeOnboardingLocale\(this\.value\)"/
  )
})

test('locale trigger identities remain latent because callbacks stop bubbling', () => {
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', event => \{\s*actions\.toggleIntro\(event\)\s*\}\)/
  )
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', event => \{\s*actions\.toggleOnboarding\(event\)\s*\}\)/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/
  )
  assert.equal(
    normalizeClickEventName('introLocaleBtn'),
    'intro_locale_btn_clicked'
  )
  assert.equal(
    normalizeClickEventName('onboardingLocaleBtn'),
    'onboarding_locale_btn_clicked'
  )
})
