import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const analyticsSource = fs.readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8')

test('video organization analytics use the current snapshot schema', () => {
  assert.match(appSource, /schemaVersion: 3/)
  assert.match(analyticsSource, /const ANALYTICS_SCHEMA_VERSION = 3;/)
  assert.match(
    appSource,
    /removedFromFeedCount: videoEntries\.filter\(isVideoRemovedFromFeed\)\.length/
  )
  assert.match(
    analyticsSource,
    /current_removed_video_count: videoState\.removedFromFeedCount \|\| 0/
  )
  assert.match(
    analyticsSource,
    /removed_video_count: snapshot\.videoState\?\.removedFromFeedCount \|\| 0/
  )
})

test('live analytics emit organization events without Set aside metadata', () => {
  for (const eventName of [
    'video_removed_from_continue_watching',
    'video_removed_from_feed',
    'video_restored_to_feed',
    'video_returned_to_feed'
  ]) {
    assert.match(appSource, new RegExp(`'${eventName}'`))
  }
  const snapshotStart = appSource.indexOf('function getEdeniaAnalyticsSnapshot(')
  const snapshotEnd = appSource.indexOf('\nfunction syncPersistedStateToAnalytics(', snapshotStart)
  const snapshotSource = appSource.slice(snapshotStart, snapshotEnd)
  assert.doesNotMatch(snapshotSource, /setAside:/)
})
