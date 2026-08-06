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
      videoOrganizationEnabled: false,
      channelVideoFormatToggleEnabled: false,
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
  let youtubeRequestCount = 0
  let channelRequestCount = 0
  await page.route('https://www.googleapis.com/youtube/v3/**', async route => {
    youtubeRequestCount += 1
    if (youtubeRequestCount === 1) await firstYoutubeRequestGate
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'channels') {
      channelRequestCount += 1
      if (channelRequestCount === 2) await secondChannelRequestGate
    }
    await route.fulfill({
      body: JSON.stringify(youtubeFixtures[endpoint]),
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
    await expect(page.getByText('Fixture Study Video', { exact: true })).toBeVisible()
    await expect.poll(() => channelRequestCount).toBe(2)
  } finally {
    releaseFirstYoutubeRequest()
    releaseSecondChannelRequest()
  }

  await expect(page.locator('#toast')).toHaveText('Your starter feed is ready.', {
    timeout: 10_000
  })
  await expect(page.getByText('Fixture Study Video', { exact: true })).toBeVisible()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(stored.onboarding.starterFeed.status).toBe('complete')
  expect(stored.onboarding.starterFeed.processedCatalogIds).toHaveLength(5)
  expect(stored.config.channels).toHaveLength(1)
  expect(stored.videos.fixture0001.title).toBe('Fixture Study Video')
})
