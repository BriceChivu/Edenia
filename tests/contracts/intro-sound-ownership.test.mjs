import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindIntroSoundActions
} from '../../src/features/onboarding/intro-sound-actions.js'

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
    '../../src/features/onboarding/intro-sound-actions.js',
    import.meta.url
  ),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function hasAttribute(tag, name) {
  return new RegExp(`\\s${name}(?:\\s|=|>)`).test(tag)
}

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function findSoundControl(id) {
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

test('both sound controls retain exact markup under direct module ownership', () => {
  const expectedControls = [
    {
      className: 'intro-sound',
      eventName: 'intro_sound_btn_clicked',
      id: 'introSoundBtn'
    },
    {
      className: 'intro-sound onboarding-sound',
      eventName: 'onboarding_sound_btn_clicked',
      id: 'onboardingSoundBtn'
    }
  ]

  for (const expected of expectedControls) {
    const control = findSoundControl(expected.id)
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(getAttribute(control.tag, 'id'), expected.id)
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      hasAttribute(control.tag, 'data-intro-sound-toggle'),
      true
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.id
    )
    assert.equal(
      normalizeClickEventName(
        getAttribute(control.tag, 'data-analytics-action')
      ),
      expected.eventName
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(getAttribute(control.tag, 'aria-pressed'), 'false')
    assert.equal(getAttribute(control.tag, 'aria-label'), null)
    assert.equal(getAttribute(control.tag, 'title'), null)

    assert.match(
      control.content,
      /<span class="intro-sound-icon" aria-hidden="true">/
    )
    assert.match(
      control.content,
      /<svg viewBox="0 0 24 24" focusable="false">/
    )
    assert.match(control.content, /class="intro-sound-speaker"/)
    assert.match(control.content, /class="intro-sound-wave"/)
    assert.match(control.content, /class="intro-sound-cross"/)
  }
})

test('sound actions bind each target directly, once, with zero arguments', () => {
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
    bindIntroSoundActions(root, {
      toggle(...args) {
        calls.push(args)
        return 'ignored-toggle-result'
      }
    }),
    2
  )
  assert.equal(
    bindIntroSoundActions(root, {
      toggle() {
        assert.fail('A repeated binding must not replace the first callback')
      }
    }),
    0
  )
  assert.deepEqual(queriedSelectors, [
    '[data-intro-sound-toggle]',
    '[data-intro-sound-toggle]'
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

test('app composes sound ownership before installing remaining legacy actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindIntroSoundActions\s*\}\s*from '\.\/features\/onboarding\/intro-sound-actions\.js'/
  )
  assert.match(
    appSource,
    /bindIntroSoundActions\(document,\s*\{\s*toggle:\s*toggleIntroSound\s*\}\)/
  )

  const bindingIndex = appSource.indexOf('bindIntroSoundActions(document, {')
  const installIndex = appSource.indexOf('installLegacyActions(window, {')
  assert.notEqual(bindingIndex, -1)
  assert.notEqual(installIndex, -1)
  assert.ok(bindingIndex < installIndex)

  assert.match(appSource, /async function toggleIntroSound\(\) \{/)
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('sound ownership leaves the two locale-change aliases intact', () => {
  assert.equal(LEGACY_ACTION_NAMES.includes('toggleIntroSound'), false)

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])toggleIntroSound(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    indexSource,
    /\bonclick=(["'])[^"']*\btoggleIntroSound\s*\([\s\S]*?\1/
  )

  const retainedAliases = [
    'changeIntroLocale',
    'changeOnboardingLocale'
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

  assert.match(
    appSource,
    /name="introLocale"[^>]*onchange="changeIntroLocale\(this\.value\)"/
  )
  assert.match(
    appSource,
    /name="onboardingLocale"[^>]*onchange="changeOnboardingLocale\(this\.value\)"/
  )
})

test('generic sound analytics keep identity while reading the post-toggle label', () => {
  assert.match(
    appSource,
    /document\.querySelectorAll\('\[data-intro-sound-toggle\]'\)\.forEach\(button => \{[\s\S]*?button\.setAttribute\('aria-pressed', String\(introTrailerState\.soundEnabled\)\)[\s\S]*?button\.setAttribute\('aria-label', labelText\)[\s\S]*?button\.title = labelText[\s\S]*?\}\)/
  )
  assert.match(
    analyticsSource,
    /const visibleLabel = String\(\s*control\.dataset\.analyticsLabel\s*\|\| control\.getAttribute\('aria-label'\)\s*\|\| control\.getAttribute\('title'\)/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{[\s\S]*?capture\(`\$\{eventName\}_clicked`, \{[\s\S]*?button_name: visibleLabel \|\| action/
  )

  assert.equal(
    normalizeClickEventName('introSoundBtn'),
    'intro_sound_btn_clicked'
  )
  assert.equal(
    normalizeClickEventName('onboardingSoundBtn'),
    'onboarding_sound_btn_clicked'
  )
})
