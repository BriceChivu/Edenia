import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `Missing ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(end, -1, `Missing ${nextName}`)
  return appSource.slice(start, end)
}

test('summary access is decided before historical totals are rendered', () => {
  const source = getFunctionSource(
    'renderStudyHistoryPanel',
    'getHistoryHeatLevel'
  )
  const decisionIndex = source.indexOf('getHistoryPeriodAccessDecision(')
  const historyIndex = source.indexOf('getStudyHistory(historyState)')
  assert.ok(decisionIndex > -1)
  assert.ok(historyIndex > decisionIndex)
  assert.match(
    source,
    /isHistoryRestricted \? null : getStudyHistory\(historyState\)/
  )
  assert.match(source, /historyAccess\.state[\s\S]*?renderRestrictedStudyHistory/)
  assert.match(
    source,
    /!plusAccessPolicy\.featureAccess\[PLUS_FEATURE_IDS\.COMPLETE_STUDY_HISTORY\][\s\S]*?clearHeatmapTooltip\(\)[\s\S]*?heatmapView\.replaceChildren\(\)/
  )
})

test('locked heatmap cells omit every exact value and tooltip hook', () => {
  const source = getFunctionSource(
    'renderRestrictedHistoryHeatmapDay',
    'renderHistoryHeatmap'
  )
  assert.match(source, /data-history-access-action="request"/)
  assert.match(source, /aria-label=/)
  for (const forbidden of [
    'data-history-heatmap-action',
    'data-date=',
    'data-points=',
    'data-streak-days=',
    'data-time=',
    'data-videos=',
    'data-reviewed=',
    'data-created=',
    'level-${'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})

test('period options stay interactive and request Plus before changing selection', () => {
  const renderSource = getFunctionSource(
    'renderHistoryPeriodOption',
    'renderHistoryPeriodPopover'
  )
  assert.match(renderSource, /is-history-restricted/)
  assert.match(renderSource, /data-history-access-state=/)
  assert.doesNotMatch(renderSource, /\sdisabled(?:=|>)/)

  const selectionSource = getFunctionSource(
    'setHistoryPeriodForRange',
    'setHistoryView'
  )
  const decisionIndex = selectionSource.indexOf(
    'getHistoryPeriodAccessDecision(state, option.start)'
  )
  const mutationIndex = selectionSource.indexOf('selectedHistoryRange = nextRange')
  assert.ok(decisionIndex > -1)
  assert.ok(mutationIndex > decisionIndex)
  assert.match(
    selectionSource,
    /requestStudyHistoryAccess\(access\.state\)[\s\S]*?return false/
  )
})

test('entitlement changes rerender history without reloading or rewriting it', () => {
  const source = getFunctionSource(
    'updatePlusEntitlementState',
    'reconcileTrackedChannelPolicyState'
  )
  assert.match(source, /else if \(state\) \{\s*renderStudyHistoryPanel\(state\)/)
  assert.doesNotMatch(source, /location\.reload|window\.location/)
})

test('history lock and recovery copy exists in every supported locale', () => {
  const keys = [
    'plus.history.period.locked',
    'plus.history.period.loading',
    'plus.history.period.unavailable',
    'plus.history.locked.title',
    'plus.history.locked.body',
    'plus.history.action',
    'plus.history.loading.title',
    'plus.history.loading.body',
    'plus.history.unavailable.title',
    'plus.history.unavailable.body',
    'plus.history.heatmap.lockedAria',
    'plus.history.heatmap.loadingAria',
    'plus.history.heatmap.unavailableAria',
    'plus.history.feedback.loading',
    'plus.history.feedback.unavailable'
  ]
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.equal(typeof I18N[locale][key], 'string', `${locale}:${key}`)
      assert.ok(I18N[locale][key].trim(), `${locale}:${key} is blank`)
    }
  }
})
