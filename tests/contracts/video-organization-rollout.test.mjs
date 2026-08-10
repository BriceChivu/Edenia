import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const analyticsSource = fs.readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8')
const indexSource = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const runtimeEnvironmentSource = fs.readFileSync(
  new URL('../../src/core/runtime-environment.js', import.meta.url),
  'utf8'
)
const runtimeConfigSource = fs.readFileSync(
  new URL('../../src/integrations/runtime-config.js', import.meta.url),
  'utf8'
)
const actionHistorySource = fs.readFileSync(
  new URL('../../src/state/action-history.js', import.meta.url),
  'utf8'
)

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1, `Missing function ${name}`)
  assert.notEqual(end, -1, `Missing function ${nextName}`)
  return appSource.slice(start, end)
}

test('video organization no longer has a runtime decision boundary', () => {
  for (const source of [appSource, analyticsSource]) {
    assert.doesNotMatch(source, /VIDEO_ORGANIZATION_ENABLED/)
  }
  assert.doesNotMatch(runtimeEnvironmentSource, /deriveVideoOrganizationEnabled/)
  assert.doesNotMatch(runtimeConfigSource, /getVideoOrganizationEnabled/)
  assert.match(analyticsSource, /const ANALYTICS_SCHEMA_VERSION = 3;/)
  assert.match(appSource, /schemaVersion: 3/)
})

test('legacy state migration runs on every load and save', () => {
  assert.match(
    functionSource('normalizeLoadedState', 'normalizeStateBeforeSave'),
    /if \(normalizeVideoOrganizationState\(state\)\) shouldSave = true/
  )
  assert.match(
    functionSource('normalizeStateBeforeSave', 'createDefaultStateFromConfig'),
    /normalizeVideoOrganizationState\(state\)/
  )
  const normalizationSource = functionSource(
    'normalizeVideoOrganizationState',
    'normalizeWatchedConfirmationState'
  )
  assert.match(normalizationSource, /removedFromFeedAt/)
  assert.match(normalizationSource, /\['setAside', 'setAsideAt', 'setAsideResumeAtSeconds'\]/)
  assert.match(normalizationSource, /delete state\.config\.setAsidePromptSeen/)
})

test('only the organization experience remains in the rendered application', () => {
  assert.match(indexSource, /id="removedSection"/)
  assert.match(indexSource, /id="videoActionsPopover"/)
  assert.doesNotMatch(indexSource, /data-video-organization-(?:legacy|preview)/)
  assert.doesNotMatch(indexSource, /id="setAsidePrompt"/)
  assert.doesNotMatch(appSource, /data-video-set-aside-action/)
  assert.doesNotMatch(appSource, /bindVideoSetAsideActions/)
  assert.doesNotMatch(appSource, /applyVideoOrganizationVisibility/)

  const renderCardSource = functionSource('renderCard', 'renderRemovedVideoCard')
  assert.match(renderCardSource, /data-video-organization-action="menu"/)
  assert.doesNotMatch(renderCardSource, /legacyShelfPriorityBadge/)
})

test('organization history stays visible and executable', () => {
  const applySource = functionSource('applyHistoryAction', 'applyChannelRemoveActionSnapshot')
  assert.match(actionHistorySource, /'video-organization'/)
  assert.match(applySource, /applyVideoStatusActionSnapshot/)
  assert.doesNotMatch(applySource, /VIDEO_ORGANIZATION_ENABLED/)

  const tooltipSource = functionSource(
    'renderHistoryActionTooltip',
    'formatHistoryActionTimestamp'
  )
  assert.match(tooltipSource, /indexedActions\.map\(entry => renderHistoryActionTooltipItem/)
  assert.match(tooltipSource, /action\.type === 'video-organization'/)
  assert.doesNotMatch(tooltipSource, /VIDEO_ORGANIZATION_ENABLED/)
})
