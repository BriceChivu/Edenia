import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const toastStyles = await readFile(new URL('../../src/styles/90-toast.css', import.meta.url), 'utf8')

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const nextFunction = appSource.indexOf(`\nfunction ${nextName}(`, start)
  const nextAsyncFunction = appSource.indexOf(`\nasync function ${nextName}(`, start)
  const end = [nextFunction, nextAsyncFunction]
    .filter(index => index !== -1)
    .sort((left, right) => left - right)[0] ?? -1
  assert.notEqual(start, -1, `Missing function ${name}`)
  assert.notEqual(end, -1, `Missing function after ${name}`)
  return appSource.slice(start, end)
}

test('initialization resumes persisted starter work and defers competing integrations', () => {
  const source = getFunctionSource('init', 'startLiveIntegrations')
  const starterIndex = source.indexOf('const starterFeedRequest = startPendingStarterFeedPreparation(state, {')
  const integrationsIndex = source.indexOf('startLiveIntegrations(state, {')
  assert.ok(starterIndex > source.indexOf('renderAll(state)'))
  assert.ok(integrationsIndex > starterIndex)
  assert.match(source, /deferAnki: noAnkiPromptScheduled \|\| Boolean\(starterFeedRequest\)/)
  assert.match(source, /deferYoutube: Boolean\(starterFeedRequest\)/)
  assert.match(source, /startPendingStarterFeedPreparation\(state, \{\s*deferAnki: noAnkiPromptScheduled\s*\}\)/)
})

test('starter channels are fetched sequentially and persisted after every result', () => {
  const source = getFunctionSource(
    'runPendingStarterFeedPreparation',
    'startPendingStarterFeedPreparation'
  )
  assert.match(
    source,
    /for \(const catalogId of runningTask\.catalogIds\) \{[\s\S]*?if \(beforeChannelTask\.processedCatalogIds\.includes\(catalogId\)\) continue[\s\S]*?result = await prepareStarterFeedChannel\(catalogId, queuedAt\)/
  )
  assert.match(source, /progressTask\.processedCatalogIds\.push\(catalogId\)/)
  assert.match(source, /progressTask\.failedCatalogIds\.push\(catalogId\)/)
  assert.match(source, /if \(!saveState\(progressState, \{ backup: false \}\)\)/)
  assert.match(source, /showStarterFeedProgress\(progressTask\)/)
  assert.doesNotMatch(source, /Promise\.all|Promise\.allSettled/)
})

test('each completed channel merges into the latest state before rendering', () => {
  const source = getFunctionSource('prepareStarterFeedChannel', 'runPendingStarterFeedPreparation')
  const fetchIndex = source.indexOf('await fetchChannelVideos(')
  const latestStateIndex = source.indexOf('const latestState = loadState()', fetchIndex)
  const mergeIndex = source.indexOf('mergeFetchedVideos(latestState, videos, detailsById, includeShorts)')
  const saveIndex = source.indexOf('saveState(latestState)', mergeIndex)
  const renderIndex = source.indexOf('renderAll(latestState)', saveIndex)
  assert.notEqual(fetchIndex, -1)
  assert.ok(latestStateIndex > fetchIndex)
  assert.ok(mergeIndex > latestStateIndex)
  assert.ok(saveIndex > mergeIndex)
  assert.ok(renderIndex > saveIndex)
  assert.match(source, /if \(!getActiveStarterFeed\(latestState, queuedAt\)\) return \{ cancelled: true \}/)
})

test('completion records outcome analytics and uses success or partial messaging', () => {
  const source = getFunctionSource(
    'runPendingStarterFeedPreparation',
    'startPendingStarterFeedPreparation'
  )
  assert.match(source, /completedTask\.status = failedCount === 0 \? 'complete' : \(successfulCount > 0 \? 'partial' : 'failed'\)/)
  assert.match(source, /completedState\.onboarding\.recommendationsAppliedAt = completedTask\.completedAt/)
  assert.match(source, /trackRefreshCompleted\(refreshStartedAtMs, \{/)
  assert.match(source, /trackEdeniaEvent\('onboarding_starter_feed_completed', \{/)
  assert.match(source, /showToast\(t\('onboarding\.starterFeed\.ready'\)\)/)
  assert.match(source, /showToast\(t\('onboarding\.starterFeed\.partial'/)
  assert.match(source, /showToast\(t\('onboarding\.starterFeed\.failed'\), 'error'\)/)
})

test('progress toasts remain visible and sit above the first-run walkthrough', () => {
  const progressSource = getFunctionSource('showStarterFeedProgress', 'addResolvedStarterChannel')
  const toastSource = getFunctionSource('showToast', 'show')
  assert.match(progressSource, /'onboarding\.starterFeed\.progress'/)
  assert.match(progressSource, /\{ durationMs: 0 \}/)
  assert.match(toastSource, /options\.durationMs === undefined \? 3500 : Number\(options\.durationMs\)/)
  assert.match(toastSource, /if \(durationMs > 0\)/)
  assert.match(toastStyles, /body\.walkthrough-active \.toast \{ z-index: 280; \}/)
})

test('YouTube requests have a bounded timeout and refresh cannot race starter work', () => {
  const ytSource = getFunctionSource('ytFetch', 'fetchYoutubeChannelByFilter')
  const refreshSource = getFunctionSource('refreshFeed', 'refreshAddedChannel')
  assert.match(ytSource, /new AbortController\(\)/)
  assert.match(ytSource, /window\.setTimeout\(\(\) => controller\.abort\(\), YOUTUBE_REQUEST_TIMEOUT_MS\)/)
  assert.match(ytSource, /fetch\(url, \{ signal: controller\.signal \}\)/)
  assert.match(ytSource, /if \(error\?\.name === 'AbortError'\) throw new Error\(t\('toast\.youtubeRequestTimeout'\)\)/)
  assert.match(refreshSource, /^function refreshFeed[\s\S]*?if \(starterFeedPreparationPromise\)/)
  assert.match(refreshSource, /reason: 'starter-feed-running'/)
})
