import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const analyticsSource = fs.readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8')
const indexSource = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1, `Missing function ${name}`)
  assert.notEqual(end, -1, `Missing function ${nextName}`)
  return appSource.slice(start, end)
}

test('one central decision enables the preview for internal tests or an explicit release', () => {
  assert.match(
    appSource,
    /const VIDEO_ORGANIZATION_ENABLED = deriveVideoOrganizationEnabled\(\s*RUNTIME_ENVIRONMENT,\s*getVideoOrganizationEnabled\(\)\s*\)/
  )
  assert.match(
    analyticsSource,
    /const VIDEO_ORGANIZATION_ENABLED = window\.EDENIA_INTERNAL_TEST === true\s*\|\| window\.EDENIA_CONFIG\?\.videoOrganizationEnabled === true;/
  )
  assert.match(
    analyticsSource,
    /const ANALYTICS_SCHEMA_VERSION = VIDEO_ORGANIZATION_ENABLED \? 3 : 2;/
  )
})

test('normal state is not migrated and organization actions fail closed', () => {
  assert.match(
    functionSource('normalizeLoadedState', 'normalizeStateBeforeSave'),
    /VIDEO_ORGANIZATION_ENABLED\s*&& normalizeVideoOrganizationState\(state\)/
  )
  assert.match(
    functionSource('normalizeStateBeforeSave', 'createDefaultStateFromConfig'),
    /if \(VIDEO_ORGANIZATION_ENABLED\) normalizeVideoOrganizationState\(state\)/
  )
  for (const [name, nextName] of [
    ['requestVideoSetAside', 'closeVideoSetAsidePrompt'],
    ['setVideoAside', 'clearVideoPausedState'],
    ['openVideoOrganizationMenu', 'closeVideoOrganizationMenu'],
    ['removeVideoFromContinueWatching', 'removeVideoFromFeed'],
    ['removeVideoFromFeed', 'restoreVideoToFeed'],
    ['restoreVideoToFeed', 'markVideoInProgressOnOpen']
  ]) {
    const source = functionSource(name, nextName)
    const legacyAction = name === 'requestVideoSetAside' || name === 'setVideoAside'
    assert.match(
      source,
      legacyAction
        ? /if \(VIDEO_ORGANIZATION_ENABLED\) return false/
        : /if \(!VIDEO_ORGANIZATION_ENABLED\) return false/
    )
  }
})

test('the DOM keeps both experiences but exposes only the selected one', () => {
  assert.match(indexSource, /data-video-organization-legacy/)
  assert.match(indexSource, /data-video-organization-preview hidden/)
  const visibilitySource = functionSource(
    'applyVideoOrganizationVisibility',
    'applyTranslations'
  )
  assert.match(visibilitySource, /toggleAttribute\('hidden', VIDEO_ORGANIZATION_ENABLED\)/)
  assert.match(visibilitySource, /toggleAttribute\('hidden', !VIDEO_ORGANIZATION_ENABLED\)/)

  const renderCardSource = functionSource('renderCard', 'renderRemovedVideoCard')
  assert.match(renderCardSource, /!VIDEO_ORGANIZATION_ENABLED && isPartial/)
  assert.match(renderCardSource, /!VIDEO_ORGANIZATION_ENABLED \|\| options\.hideOrganizationActions/)
  assert.match(renderCardSource, /const shelfPriorityBadge = VIDEO_ORGANIZATION_ENABLED/)
})

test('the public kill switch hides stale organization history without deleting it', () => {
  const applySource = functionSource('applyHistoryAction', 'applyChannelRemoveActionSnapshot')
  assert.match(
    applySource,
    /!VIDEO_ORGANIZATION_ENABLED && action\?\.type === 'video-organization'/
  )
  const tooltipSource = functionSource('renderHistoryActionTooltip', 'renderHistoryActionTooltipItem')
  assert.match(
    tooltipSource,
    /VIDEO_ORGANIZATION_ENABLED \|\| entry\.action\?\.type !== 'video-organization'/
  )
})
