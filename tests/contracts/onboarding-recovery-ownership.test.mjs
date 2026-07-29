import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindOnboardingRecoveryActions
} from '../../src/features/onboarding/onboarding-recovery-actions.js'

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
    '../../src/features/onboarding/onboarding-recovery-actions.js',
    import.meta.url
  ),
  'utf8'
)

const recoveryStart = appSource.indexOf(
  "function showOnboardingRecovery(reason = 'setup',"
)
const recoveryEnd = appSource.indexOf(
  '\nfunction closeOnboardingRecovery(',
  recoveryStart
)
assert.notEqual(recoveryStart, -1)
assert.notEqual(recoveryEnd, -1)
const recoverySource = appSource.slice(recoveryStart, recoveryEnd)

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

function createDirectControl(action) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      onboardingRecoveryAction: action
    },
    listeners
  }
}

function getFunctionSource(name, nextName) {
  const declaration = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`
  ).exec(appSource)
  assert.ok(declaration, `Expected ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, declaration.index)
  assert.notEqual(end, -1, `Expected boundary after ${name}`)
  return appSource.slice(declaration.index, end)
}

test('generated recovery controls retain exact order under module ownership', () => {
  const expectedControls = [
    {
      action: 'copy-link',
      analyticsAction: 'copyOnboardingRecoveryLink',
      className: 'btn-secondary',
      content: "${escHtml(t('onboarding.recovery.copyLink'))}"
    },
    {
      action: 'retry',
      analyticsAction: 'retryOnboardingRecovery',
      className: 'btn-primary',
      content: "${escHtml(t('onboarding.recovery.tryAgain'))}"
    }
  ]
  const controls = getElements(recoverySource, 'button')
  assert.equal(controls.length, expectedControls.length)

  expectedControls.forEach((expected, index) => {
    const control = controls[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(
      getAttribute(control.tag, 'data-onboarding-recovery-action'),
      expected.action
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(control.content.trim(), expected.content)
  })
})

test('recovery actions synchronously forward only each live control', () => {
  const copyControl = createDirectControl('copy-link')
  const retryControl = createDirectControl('retry')
  const controls = [copyControl, retryControl]
  const calls = []
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-onboarding-recovery-action]')
      return controls
    }
  }

  assert.equal(
    bindOnboardingRecoveryActions(root, {
      copyLink(...args) {
        calls.push(['copy-link', args])
      },
      retry(...args) {
        calls.push(['retry', args])
      }
    }),
    2
  )

  copyControl.liveMarker = 'copy-live'
  retryControl.liveMarker = 'retry-live'
  const events = controls.map(() => ({
    preventDefaultCalls: 0,
    stopPropagationCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1
    },
    stopPropagation() {
      this.stopPropagationCalls += 1
    }
  }))

  assert.equal(copyControl.listeners.get('click')[0](events[0]), undefined)
  assert.deepEqual(calls, [['copy-link', [copyControl]]])
  assert.equal(retryControl.listeners.get('click')[0](events[1]), undefined)
  assert.deepEqual(calls, [
    ['copy-link', [copyControl]],
    ['retry', [retryControl]]
  ])
  assert.equal(calls[0][1][0].liveMarker, 'copy-live')
  assert.equal(calls[1][1][0].liveMarker, 'retry-live')
  for (const event of events) {
    assert.equal(event.preventDefaultCalls, 0)
    assert.equal(event.stopPropagationCalls, 0)
  }
})

test('each content replacement binds immediately and accepts new nodes', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindOnboardingRecoveryActions\s*\}\s*from '\.\/features\/onboarding\/onboarding-recovery-actions\.js'/
  )
  const assignmentIndex = recoverySource.indexOf('content.innerHTML = `')
  const bindingIndex = recoverySource.indexOf(
    'bindOnboardingRecoveryActions(content, {'
  )
  const panelIndex = recoverySource.indexOf(
    "panel.classList.add('is-recovery')"
  )
  assert.notEqual(assignmentIndex, -1)
  assert.notEqual(bindingIndex, -1)
  assert.notEqual(panelIndex, -1)
  assert.ok(bindingIndex > assignmentIndex)
  assert.ok(bindingIndex < panelIndex)
  assert.match(
    recoverySource,
    /bindOnboardingRecoveryActions\(content,\s*\{\s*copyLink:\s*copyOnboardingRecoveryLink,\s*retry:\s*retryOnboardingRecovery\s*\}\)/
  )

  const actions = {
    copyLink() {},
    retry() {}
  }
  const oldControl = createDirectControl('copy-link')
  const replacementControl = createDirectControl('copy-link')
  assert.equal(
    bindOnboardingRecoveryActions(
      { querySelectorAll: () => [oldControl] },
      actions
    ),
    1
  )
  assert.equal(
    bindOnboardingRecoveryActions(
      { querySelectorAll: () => [replacementControl] },
      actions
    ),
    1
  )
  assert.equal(oldControl.listeners.get('click').length, 1)
  assert.equal(replacementControl.listeners.get('click').length, 1)
})

test('Copy link retains async label reset and disconnected-node behavior', () => {
  const source = getFunctionSource(
    'copyOnboardingRecoveryLink',
    'retryOnboardingRecovery'
  )

  assert.match(
    source,
    /^async function copyOnboardingRecoveryLink\(button\) \{/
  )
  assert.match(
    source,
    /await navigator\.clipboard\.writeText\(window\.location\.href\)/
  )
  assert.match(
    source,
    /if \(button && copied\) \{\s*const originalLabel = t\('onboarding\.recovery\.copyLink'\)\s*button\.textContent = t\('onboarding\.recovery\.copied'\)/
  )
  assert.match(
    source,
    /window\.setTimeout\(\(\) => \{\s*if \(button\.isConnected\) button\.textContent = originalLabel\s*\}, 2200\)/
  )
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
  assert.doesNotMatch(moduleSource, /queueMicrotask|setTimeout|Promise\./)
})

test('Retry keeps disabled state visible to document analytics by branch', () => {
  const source = getFunctionSource(
    'retryOnboardingRecovery',
    'renderPersonalizedOnboarding'
  )
  const disableIndex = source.indexOf('if (button) button.disabled = true')
  const firstEnableIndex = source.indexOf(
    'if (button) button.disabled = false',
    disableIndex
  )
  const closeIndex = source.indexOf('closeOnboardingRecovery()')
  assert.notEqual(disableIndex, -1)
  assert.ok(firstEnableIndex > disableIndex)
  assert.ok(closeIndex > firstEnableIndex)
  assert.equal(source.indexOf('button.disabled = false', closeIndex), -1)
  assert.match(
    source,
    /if \(!started\) \{\s*showOnboardingRecovery\('setup', \{ state, resume \}\)/
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
})

test('recovery callbacks retain lexical ownership without global aliases', () => {
  assert.match(
    appSource,
    /async function copyOnboardingRecoveryLink\(button\) \{/
  )
  assert.match(
    appSource,
    /function retryOnboardingRecovery\(button\) \{/
  )

  const migratedAliases = [
    'copyOnboardingRecoveryLink',
    'retryOnboardingRecovery'
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
  assert.doesNotMatch(
    recoverySource,
    /\bonclick=(["'])[^"']*\b(?:copyOnboardingRecoveryLink|retryOnboardingRecovery)\s*\([\s\S]*?\1/
  )
})
