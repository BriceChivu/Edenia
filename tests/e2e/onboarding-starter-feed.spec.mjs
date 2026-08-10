import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

const youtubeFixtures = {
  channels: JSON.parse(await readFile(new URL('../fixtures/youtube/channels.json', import.meta.url), 'utf8')),
  playlistItems: JSON.parse(await readFile(new URL('../fixtures/youtube/playlist-items.json', import.meta.url), 'utf8')),
  videos: JSON.parse(await readFile(new URL('../fixtures/youtube/videos.json', import.meta.url), 'utf8'))
}

test('onboarding enters Edenia before preparing and incrementally revealing the starter feed', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(testInfo.project.name))

  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = {
      youtubeApiKey: 'fixture-key',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      videoOrganizationEnabled: true,
      channelVideoFormatToggleEnabled: true,
      supabaseUrl: '',
      supabasePublishableKey: ''
    }`,
    contentType: 'application/javascript',
    status: 200
  }))

  let releaseFirstYoutubeRequest
  const firstYoutubeRequestGate = new Promise(resolve => {
    releaseFirstYoutubeRequest = resolve
  })
  let releaseSecondChannelRequest
  const secondChannelRequestGate = new Promise(resolve => {
    releaseSecondChannelRequest = resolve
  })
  let releaseRemainingChannelRequests
  const remainingChannelRequestGate = new Promise(resolve => {
    releaseRemainingChannelRequests = resolve
  })
  let youtubeRequestCount = 0
  let channelRequestCount = 0
  const channelIndexesById = new Map()
  const videoIndexesById = new Map()
  const getChannelId = index => `UC${String(index).padStart(22, '0')}`
  const getVideoId = index => `starter${String(index).padStart(4, '0')}`
  await page.route('https://www.googleapis.com/youtube/v3/**', async route => {
    youtubeRequestCount += 1
    if (youtubeRequestCount === 1) await firstYoutubeRequestGate
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    let fixture = youtubeFixtures[endpoint]
    if (endpoint === 'channels') {
      channelRequestCount += 1
      if (channelRequestCount === 2) await secondChannelRequestGate
      if (channelRequestCount === 3) await remainingChannelRequestGate
      const channelId = getChannelId(channelRequestCount)
      channelIndexesById.set(channelId, channelRequestCount)
      fixture = {
        items: [{
          id: channelId,
          snippet: {
            title: `Fixture Language Channel ${channelRequestCount}`,
            thumbnails: youtubeFixtures.channels.items[0].snippet.thumbnails
          }
        }]
      }
    } else if (endpoint === 'playlistItems') {
      const playlistId = url.searchParams.get('playlistId') || ''
      const channelId = `UC${playlistId.slice(2)}`
      const channelIndex = channelIndexesById.get(channelId)
      const videoId = getVideoId(channelIndex)
      videoIndexesById.set(videoId, channelIndex)
      fixture = {
        items: [{
          snippet: {
            channelId,
            channelTitle: `Fixture Language Channel ${channelIndex}`,
            publishedAt: `2026-07-${String(20 + channelIndex).padStart(2, '0')}T04:00:00.000Z`,
            resourceId: { videoId },
            thumbnails: youtubeFixtures.playlistItems.items[0].snippet.thumbnails,
            title: `Fixture Study Video ${channelIndex}`
          }
        }]
      }
    } else if (endpoint === 'videos') {
      const videoId = url.searchParams.get('id') || ''
      const channelIndex = videoIndexesById.get(videoId)
      const channelId = getChannelId(channelIndex)
      fixture = {
        items: [{
          ...youtubeFixtures.videos.items[0],
          id: videoId,
          snippet: {
            ...youtubeFixtures.videos.items[0].snippet,
            channelId,
            channelTitle: `Fixture Language Channel ${channelIndex}`,
            publishedAt: `2026-07-${String(20 + channelIndex).padStart(2, '0')}T04:00:00.000Z`,
            title: `Fixture Study Video ${channelIndex}`
          }
        }]
      }
    }
    await route.fulfill({
      body: JSON.stringify(fixture),
      contentType: 'application/json',
      status: 200
    })
  })

  await page.goto('/')
  await expect(page.locator('#introTrailer')).not.toHaveClass(/\bhidden\b/)
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await expect(page.locator('#onboardingPanel')).not.toHaveClass(/\bhidden\b/)
  await page.locator('[data-language-id="mandarin"]').click()
  await page.locator('[data-personalized-onboarding-action="continue-language"]').click()
  await page.locator('[data-level-id="starting"]').click()
  await page.locator('[data-personalized-onboarding-step="channels"]').click()
  await expect(page.locator('.onboarding-channel[aria-pressed="true"]')).toHaveCount(5)

  try {
    await page.locator('[data-personalized-onboarding-action="finish"]').click()
    await expect(page.locator('#onboardingPanel')).toHaveClass(/\bhidden\b/)
    await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
    await expect(page.locator('#toast')).toHaveText(
      'Preparing your starter feed… 0 of 5 channels'
    )
    await expect.poll(() => youtubeRequestCount).toBe(1)
    releaseFirstYoutubeRequest()

    await expect(page.locator('#toast')).toHaveText(
      'Preparing your starter feed… 1 of 5 channels'
    )
    await expect(page.getByText('Fixture Study Video 1', { exact: true })).toBeVisible()
    await expect(page.locator('.walkthrough-progress')).toHaveText('1 / 3')
    await expect(page.locator('.channel-shelf-title-row strong')).toHaveText([
      'Fixture Language Channel 1'
    ])
    await expect.poll(() => channelRequestCount).toBe(2)
    releaseSecondChannelRequest()
    await expect(page.locator('.channel-shelf-title-row strong')).toHaveText([
      'Fixture Language Channel 1',
      'Fixture Language Channel 2'
    ])
    await expect.poll(() => channelRequestCount).toBe(3)
    releaseRemainingChannelRequests()
  } finally {
    releaseFirstYoutubeRequest()
    releaseSecondChannelRequest()
    releaseRemainingChannelRequests()
  }

  await expect(page.locator('#toast')).toHaveText('Your starter feed is ready.', {
    timeout: 10_000
  })
  await expect(page.locator('.channel-shelf-title-row strong')).toHaveText([
    'Fixture Language Channel 1',
    'Fixture Language Channel 2',
    'Fixture Language Channel 3',
    'Fixture Language Channel 4',
    'Fixture Language Channel 5'
  ])
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(stored.onboarding.starterFeed.status).toBe('complete')
  expect(stored.onboarding.starterFeed.processedCatalogIds).toHaveLength(5)
  expect(stored.config.channels).toHaveLength(5)
  expect(stored.config.channelShelfOrder).toEqual([
    getChannelId(1),
    getChannelId(2),
    getChannelId(3),
    getChannelId(4),
    getChannelId(5)
  ])
  expect(stored.videos[getVideoId(1)].title).toBe('Fixture Study Video 1')
})
