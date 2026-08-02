import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `Missing ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(end, -1, `Missing ${nextName}`)
  return appSource.slice(start, end)
}

test('Study Insights are recorded before access is projected into the UI', () => {
  const source = getFunctionSource('renderStudyInsight', 'setStudyInsightsCollapsed')
  const recordIndex = source.indexOf('recordStudyInsight(state, insight)')
  const accessIndex = source.indexOf('getStudyInsightArchiveAccess({')

  assert.ok(recordIndex > -1)
  assert.ok(accessIndex > recordIndex)
  assert.match(source, /history: state\.config\.studyInsights\.history/)
  assert.match(source, /archiveAccess\.accessibleEntries\.filter/)
  assert.match(source, /archiveAccess\.restrictedEntries\.filter/)
  assert.doesNotMatch(source, /\.splice\(|\.pop\(|\.shift\(|delete state/)
})

test('locked current and archive views never render exact insight content', () => {
  const currentSource = getFunctionSource(
    'renderRestrictedCurrentStudyInsight',
    'renderRestrictedStudyInsightArchive'
  )
  const archiveSource = getFunctionSource(
    'renderRestrictedStudyInsightArchive',
    'setStudyInsightView'
  )
  const renderSource = getFunctionSource(
    'renderStudyInsight',
    'setStudyInsightsCollapsed'
  )

  for (const source of [currentSource, archiveSource]) {
    for (const forbidden of [
      'viewModel.title',
      'viewModel.body',
      'viewModel.evidence',
      'entry.recordedAt',
      'entry.insightId',
      'entry.key'
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden)
    }
  }
  assert.match(renderSource, /container\.removeAttribute\('data-insight-id'\)/)
  assert.match(renderSource, /title\.textContent = currentIsRestricted \? ''/)
  assert.match(renderSource, /body\.textContent = currentIsRestricted \? ''/)
  assert.match(renderSource, /evidence\.textContent = currentIsRestricted \? ''/)
  assert.match(archiveSource, /data-insight-access-action="request"/)
  assert.match(indexSource, /id="studyInsightCurrentLock"/)
})

test('updated insights preserve their first-recorded lifetime position', () => {
  const source = getFunctionSource('recordStudyInsight', 'getPreviousStudyInsights')

  assert.match(source, /firstRecordedAt: recordedAt/)
  assert.match(
    source,
    /historyEntry\.firstRecordedAt = state\.config\.studyInsights\.history\[existingIndex\]\.firstRecordedAt/
  )
  assert.match(source, /normalizeStudyInsightConfig\(state\)/)
  assert.match(source, /saveState\(state, \{ backup: false \}\)/)
})

test('entitlement changes reveal insights immediately without reloading', () => {
  const source = getFunctionSource(
    'updatePlusEntitlementState',
    'reconcileTrackedChannelPolicyState'
  )

  assert.match(source, /else if \(state\) \{[\s\S]*renderStudyInsight\(state\)/)
  assert.doesNotMatch(source, /location\.reload|window\.location/)
})

test('analytics keeps the complete stored archive instead of the visible subset', () => {
  const source = getFunctionSource(
    'getEdeniaAnalyticsSnapshot',
    'syncPersistedStateToAnalytics'
  )

  assert.match(source, /state\?\.config\?\.studyInsights\?\.history/)
  assert.doesNotMatch(
    source,
    /getStudyInsightArchiveAccess|getStudyInsightAccessDecision/
  )
})

test('Study Insight lock and recovery copy exists in every supported locale', () => {
  const keys = [
    'plus.insights.current.locked.title',
    'plus.insights.current.locked.body',
    'plus.insights.action',
    'plus.insights.current.loading.title',
    'plus.insights.current.loading.body',
    'plus.insights.current.unavailable.title',
    'plus.insights.current.unavailable.body',
    'plus.insights.archive.locked.one',
    'plus.insights.archive.locked.many',
    'plus.insights.archive.loading',
    'plus.insights.archive.unavailable',
    'plus.insights.feedback.loading',
    'plus.insights.feedback.unavailable'
  ]

  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.equal(typeof I18N[locale][key], 'string', `${locale}:${key}`)
      assert.ok(I18N[locale][key].trim(), `${locale}:${key} is blank`)
    }
  }
})
