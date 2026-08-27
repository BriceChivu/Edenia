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

function createStarterFeedPreparationHarness({ events, run }) {
  const source = getFunctionSource(
    'startPendingStarterFeedPreparation',
    'finishPersonalizedOnboarding'
  )
  return new Function('dependencies', `
    const {
      events,
      runPendingStarterFeedPreparation
    } = dependencies
    const IS_SANDBOX = false
    const applyAnkiRefreshPreference = () => events.push('anki-started')
    const getActiveStarterFeed = () => ({ status: 'pending' })
    const loadState = () => ({})
    const showToast = () => {}
    const startYoutubeAutoRefresh = () => events.push('youtube-started')
    const t = key => key
    let starterFeedPreparationPromise = null

    ${source}

    return {
      getRequest: () => starterFeedPreparationPromise,
      start: startPendingStarterFeedPreparation
    }
  `)({
    events,
    runPendingStarterFeedPreparation: run
  })
}

test('starter preparation latches single-flight before synchronous startup effects', async () => {
  const events = []
  let releaseRun
  const runBarrier = new Promise(resolve => {
    releaseRun = resolve
  })
  let startAgain
  let reentrantRequest
  const harness = createStarterFeedPreparationHarness({
    events,
    run: async state => {
      events.push('starter-running')
      reentrantRequest = startAgain(state)
      events.push('starter-persisted')
      await runBarrier
      events.push('starter-completed')
      return { status: 'complete' }
    }
  })
  startAgain = harness.start

  const request = harness.start({ onboarding: { starterFeed: { status: 'pending' } } })
  events.push('integrations-started')

  assert.equal(harness.getRequest(), request)
  assert.equal(reentrantRequest, request)
  assert.deepEqual(events, [
    'starter-running',
    'starter-persisted',
    'integrations-started'
  ])

  releaseRun()
  assert.deepEqual(await request, { status: 'complete' })
  assert.equal(harness.getRequest(), null)
  assert.deepEqual(events, [
    'starter-running',
    'starter-persisted',
    'integrations-started',
    'starter-completed',
    'anki-started',
    'youtube-started'
  ])
})

test('only signed-in profile activation defers starter preparation', async () => {
  const events = []
  let releaseRun
  const runBarrier = new Promise(resolve => {
    releaseRun = resolve
  })
  const harness = createStarterFeedPreparationHarness({
    events,
    run: async () => {
      events.push('starter-running')
      await runBarrier
      return { status: 'complete' }
    }
  })

  const request = harness.start(
    { onboarding: { starterFeed: { status: 'pending' } } },
    { deferUntilProfileActivation: true }
  )
  events.push('profile-activation-completed')

  assert.deepEqual(events, ['profile-activation-completed'])
  assert.equal(harness.getRequest(), request)
  await Promise.resolve()
  assert.deepEqual(events, [
    'profile-activation-completed',
    'starter-running'
  ])

  releaseRun()
  await request
})

test('initialization resumes persisted starter work and defers competing integrations', () => {
  const source = getFunctionSource(
    'startApplicationWithState',
    'renderActivatedLearnerProfile'
  )
  const starterIndex = source.indexOf('const starterFeedRequest = startPendingStarterFeedPreparation(state, {')
  const integrationsIndex = source.indexOf('startLiveIntegrations(state, {')
  assert.ok(starterIndex > source.indexOf('renderAll(state)'))
  assert.ok(integrationsIndex > starterIndex)
  assert.match(source, /deferAnki: noAnkiPromptScheduled \|\| Boolean\(starterFeedRequest\)/)
  assert.match(source, /deferYoutube: Boolean\(starterFeedRequest\)/)
  assert.match(
    source,
    /startPendingStarterFeedPreparation\(state, \{\s*deferAnki: noAnkiPromptScheduled,\s*deferUntilProfileActivation: deferStarterFeedUntilProfileActivation\s*\}\)/
  )
})

test('first-study walkthrough waits for a starter video target while work is active', () => {
  const onboardingSource = getFunctionSource('maybeStartOnboarding', 'scheduleFirstStudyWalkthrough')
  const scheduleSource = getFunctionSource('scheduleFirstStudyWalkthrough', 'maybeStartNoAnkiFrequentUserPrompt')
  assert.match(onboardingSource, /scheduleFirstStudyWalkthrough\(state\)/)
  assert.match(scheduleSource, /steps\.find\(step => step\.id === 'first-study-video'\)/)
  assert.match(
    scheduleSource,
    /getActiveStarterFeed\(state\) && firstVideoStep && !getWalkthroughTarget\(firstVideoStep\)/
  )
  assert.match(scheduleSource, /firstStudyWalkthroughTimer = window\.setTimeout/)
  assert.match(scheduleSource, /startWalkthrough\(latestSteps\)/)
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

test('resolved starter channels receive a stable idempotent shelf order', () => {
  const source = getFunctionSource('addResolvedStarterChannel', 'prepareStarterFeedChannel')
  assert.match(
    source,
    /const channelShelfOrder = normalizeChannelShelfOrder\(state\.config\.channelShelfOrder\)/
  )
  assert.match(
    source,
    /if \(!channelShelfOrder\.includes\(channel\.id\)\) channelShelfOrder\.push\(channel\.id\)/
  )
  assert.match(source, /state\.config\.channelShelfOrder = channelShelfOrder/)
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
