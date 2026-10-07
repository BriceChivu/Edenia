import { expect, test } from '../support/network-fixture.mjs'

const runtimeConfig = `window.EDENIA_CONFIG = {
  youtubeApiKey: 'fixture-key',
  freePlusEnabled: false,
  plusCheckoutEnabled: false,
  accountFeaturesRollout: 'public',
  studyGuidanceEnabled: false,
  indexedDbBackupsEnabled: false,
  indexedDbBackupCleanupEnabled: false,
  supabaseUrl: '',
  supabasePublishableKey: ''
}`
const videoId = 'fixture0001'
const channelId = 'UC0000000000000000000000'

async function seedReadyState(page) {
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'application/javascript',
    status: 200
  }))
  await page.goto('/')
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-08-13T00:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
}

test('a discovery link opens its frozen video without following the channel', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedReadyState(page)

  await page.goto(
    `/?reminder=discovery&video=${videoId}&channel=${channelId}`
  )

  await expect(page).toHaveURL(/\/$/)
  const player = page.locator('.video-player-overlay')
  await expect(player).toBeVisible()
  await expect(player.locator('iframe')).toHaveAttribute(
    'src',
    new RegExp(`/embed/${videoId}`)
  )
  const saved = await page.evaluate(id => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    return {
      channels: state.config.channels,
      video: state.videos[id],
      manualAction: state.undoStack.find(action => (
        action.type === 'manual-video-add' && action.videoId === id
      ))
    }
  }, videoId)
  expect(saved.channels).toEqual([])
  expect(saved.video).toMatchObject({
    id: videoId,
    channelId,
    title: 'Fixture Study Video',
    source: 'manual',
    manuallyAdded: true,
    status: 'partial'
  })
  expect(saved.manualAction).toMatchObject({
    type: 'manual-video-add',
    videoId,
    channelWasAdded: false,
    channelTrackingMode: 'manual-video-only'
  })
})

test('rollout off and malformed reminders do not load video metadata', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let youtubeApiCalls = 0
  page.on('request', request => {
    if (request.url().includes('googleapis.com/youtube/v3/')) {
      youtubeApiCalls += 1
    }
  })
  await seedReadyState(page)
  await page.route('**/config.local.js*', route => route.fulfill({
    body: runtimeConfig.replace("accountFeaturesRollout: 'public'", "accountFeaturesRollout: 'off'"),
    contentType: 'text/javascript'
  }))

  await page.goto(`/?reminder=discovery&video=${videoId}&channel=${channelId}`)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  expect(youtubeApiCalls).toBe(0)

  await page.route('**/config.local.js*', route => route.fulfill({
    body: runtimeConfig, contentType: 'text/javascript'
  }))
  await page.goto('/?reminder=discovery&video=too-short')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  expect(youtubeApiCalls).toBe(0)
})
