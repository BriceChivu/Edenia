import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
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

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

function getFunctionSource(name, nextName) {
  const declarationPattern = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`
  )
  const declaration = declarationPattern.exec(appSource)
  assert.ok(declaration, `Expected ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, declaration.index)
  assert.notEqual(end, -1, `Expected boundary after ${name}`)
  return appSource.slice(declaration.index, end)
}

test('generated recovery controls retain exact markup and explicit identities', () => {
  const expectedControls = [
    {
      analyticsAction: 'copyOnboardingRecoveryLink',
      className: 'btn-secondary',
      content: "${escHtml(t('onboarding.recovery.copyLink'))}",
      eventName: 'copy_onboarding_recovery_link_clicked',
      recoveryAction: 'copy-link'
    },
    {
      analyticsAction: 'retryOnboardingRecovery',
      className: 'btn-primary',
      content: "${escHtml(t('onboarding.recovery.tryAgain'))}",
      eventName: 'retry_onboarding_recovery_clicked',
      recoveryAction: 'retry'
    }
  ]
  const controls = getElements(recoverySource, 'button')
  assert.equal(controls.length, 2)

  expectedControls.forEach((expected, index) => {
    const control = controls[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(getAttribute(control.tag, 'id'), null)
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(
      getAttribute(control.tag, 'data-onboarding-recovery-action'),
      expected.recoveryAction
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      normalizeClickEventName(expected.analyticsAction),
      expected.eventName
    )
    assert.equal(getAttribute(control.tag, 'data-i18n'), null)
    assert.equal(control.content.trim(), expected.content)

  })
})

test('recovery rendering replaces content and restores the exact shell state', () => {
  assert.match(
    recoverySource,
    /const normalizedReason = reason === 'storage' \? 'storage' : 'setup'/
  )
  assert.match(
    recoverySource,
    /personalizedOnboardingState\.active = false\s*onboardingRecoveryState\.active = true/
  )
  assert.match(
    recoverySource,
    /onboardingRecoveryState\.reason = normalizedReason/
  )
  assert.match(
    recoverySource,
    /onboardingRecoveryState\.resume = \['intro', 'complete'\]\.includes\(resume\) \? resume : 'personalized'/
  )
  assert.match(
    recoverySource,
    /onboardingRecoveryState\.state = state/
  )
  assert.match(recoverySource, /localePicker\?\.classList\.add\('hidden'\)/)
  assert.match(recoverySource, /progress\?\.classList\.add\('hidden'\)/)
  assert.match(
    recoverySource,
    /content\.innerHTML = `[\s\S]*?<div class="onboarding-actions onboarding-recovery-actions">[\s\S]*?<p class="onboarding-recovery-status" id="onboardingRecoveryStatus" role="status" aria-live="polite"><\/p>[\s\S]*?`/
  )
  assert.match(
    recoverySource,
    /panel\.classList\.add\('is-recovery'\)\s*panel\.classList\.remove\('hidden'\)/
  )
  assert.match(
    recoverySource,
    /trackEdeniaEvent\('onboarding_recovery_shown', \{\s*reason: normalizedReason,\s*resume_target: onboardingRecoveryState\.resume,\s*navigator_language: navigator\.language \|\| null\s*\}\)/
  )
})

test('Copy link keeps live-button asynchronous and fallback behavior', () => {
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
    /const status = document\.getElementById\('onboardingRecoveryStatus'\)\s*let copied = false/
  )
  assert.match(
    source,
    /if \(!navigator\.clipboard\?\.writeText\) throw new Error\('Clipboard API unavailable'\)\s*await navigator\.clipboard\.writeText\(window\.location\.href\)\s*copied = true/
  )
  assert.match(
    source,
    /const input = document\.createElement\('textarea'\)[\s\S]*?input\.value = window\.location\.href[\s\S]*?document\.body\.appendChild\(input\)[\s\S]*?input\.focus\(\)[\s\S]*?input\.select\(\)[\s\S]*?try \{ copied = document\.execCommand\('copy'\) \} catch \{\}[\s\S]*?input\.remove\(\)/
  )
  assert.match(
    source,
    /if \(status\) status\.textContent = t\(copied \? 'onboarding\.recovery\.copied' : 'onboarding\.recovery\.copyFailed'\)/
  )
  assert.match(
    source,
    /if \(button && copied\) \{\s*const originalLabel = t\('onboarding\.recovery\.copyLink'\)\s*button\.textContent = t\('onboarding\.recovery\.copied'\)\s*window\.setTimeout\(\(\) => \{\s*if \(button\.isConnected\) button\.textContent = originalLabel\s*\}, 2200\)\s*\}/
  )
  assert.match(
    source,
    /trackEdeniaEvent\('onboarding_recovery_link_copy', \{ success: copied \}\)/
  )
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
  assert.doesNotMatch(source, /button\.disabled/)
})

test('Copy link bubbles with stable identity and live async label timing', () => {
  const source = getFunctionSource(
    'copyOnboardingRecoveryLink',
    'retryOnboardingRecovery'
  )
  const awaitIndex = source.indexOf(
    'await navigator.clipboard.writeText(window.location.href)'
  )
  const labelIndex = source.indexOf(
    "button.textContent = t('onboarding.recovery.copied')"
  )
  assert.notEqual(awaitIndex, -1)
  assert.ok(labelIndex > awaitIndex)

  assert.match(
    analyticsSource,
    /const visibleLabel = String\(\s*control\.dataset\.analyticsLabel\s*\|\| control\.getAttribute\('aria-label'\)\s*\|\| control\.getAttribute\('title'\)\s*\|\| control\.textContent/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.equal(
    normalizeClickEventName('copyOnboardingRecoveryLink'),
    'copy_onboarding_recovery_link_clicked'
  )
})

test('Retry retains inactive, storage-failure, and disabled state gates', () => {
  const source = getFunctionSource(
    'retryOnboardingRecovery',
    'renderPersonalizedOnboarding'
  )

  assert.match(
    source,
    /^function retryOnboardingRecovery\(button\) \{\s*if \(!onboardingRecoveryState\.active\) return/
  )
  assert.match(
    source,
    /const status = document\.getElementById\('onboardingRecoveryStatus'\)\s*if \(button\) button\.disabled = true/
  )
  assert.match(
    source,
    /if \(!canPersistLocalState\(\)\) \{\s*if \(status\) status\.textContent = t\('onboarding\.recovery\.storageStillUnavailable'\)\s*if \(button\) button\.disabled = false\s*trackEdeniaEvent\('onboarding_recovery_retry', \{ success: false, reason: 'storage' \}\)\s*return\s*\}/
  )
  assert.match(
    source,
    /const state = onboardingRecoveryState\.state \|\| loadState\(\) \|\| defaultState\(4, DEFAULT_CHANNELS\)\s*normalizeOnboardingState\(state\)/
  )
  assert.match(
    source,
    /if \(!saveState\(state, \{ backup: false \}\)\) \{\s*if \(status\) status\.textContent = t\('onboarding\.recovery\.storageStillUnavailable'\)\s*if \(button\) button\.disabled = false\s*trackEdeniaEvent\('onboarding_recovery_retry', \{ success: false, reason: 'storage' \}\)\s*return\s*\}/
  )
  assert.doesNotMatch(source, /\.preventDefault\(|\.stopPropagation\(/)
})

test('Retry retains close, redirect, restart, and replacement outcomes', () => {
  const source = getFunctionSource(
    'retryOnboardingRecovery',
    'renderPersonalizedOnboarding'
  )

  assert.match(
    source,
    /const resume = onboardingRecoveryState\.resume\s*const recoveryReason = onboardingRecoveryState\.reason\s*closeOnboardingRecovery\(\)/
  )
  assert.match(
    source,
    /if \(resume === 'complete'\) \{\s*trackEdeniaEvent\('onboarding_recovery_retry', \{ success: true, reason: recoveryReason \}\)\s*window\.location\.assign\(getPostOnboardingAppUrl\(\)\)\s*return\s*\}/
  )
  assert.match(
    source,
    /const started = resume === 'intro'\s*\? startIntroTrailer\(\{ state \}\)\s*: startPersonalizedOnboarding\(state\)/
  )
  assert.match(
    source,
    /if \(!started\) \{\s*showOnboardingRecovery\('setup', \{ state, resume \}\)\s*const nextStatus = document\.getElementById\('onboardingRecoveryStatus'\)\s*if \(nextStatus\) nextStatus\.textContent = t\('onboarding\.recovery\.setupStillUnavailable'\)\s*trackEdeniaEvent\('onboarding_recovery_retry', \{ success: false, reason: 'setup' \}\)\s*return\s*\}/
  )
  assert.match(
    source,
    /trackEdeniaEvent\('onboarding_recovery_retry', \{ success: true, reason: recoveryReason \}\)/
  )
})

test('Retry generic analytics fire only when the live button is enabled at bubble time', () => {
  const source = getFunctionSource(
    'retryOnboardingRecovery',
    'renderPersonalizedOnboarding'
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
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
  assert.equal(
    source.indexOf('button.disabled = false', closeIndex),
    -1,
    'Success/restart paths intentionally remain disabled before document bubbling'
  )
  assert.equal(
    normalizeClickEventName('retryOnboardingRecovery'),
    'retry_onboarding_recovery_clicked'
  )
})

test('both recovery callbacks no longer require global bridge ownership', () => {
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
})
