import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-03T04:00:00.000Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedNow)
})

async function waitForApplication(page) {
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
  })
}

async function seedVideoOrganizationState(page) {
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.channels = [{
      id: 'organization-channel',
      name: 'Organization channel'
    }]
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.videos['removed-preview-video'] = {
      id: 'removed-preview-video',
      title: 'Removed preview video',
      channelId: 'organization-channel',
      channelTitle: 'Organization channel',
      duration: 600,
      publishedAt: '2026-08-01T04:00:00.000Z',
      pausedAt: '2026-08-02T04:00:00.000Z',
      removedFromFeedAt: '2026-08-03T03:00:00.000Z',
      resumeAtSeconds: 42,
      status: 'partial',
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-08-02T04:00:00.000Z',
        seconds: 42
      }],
      watchProgressTracked: true
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)
}

async function installFakeYoutubePlayer(page) {
  await page.evaluate(() => {
    window.__edeniaFakeYoutubePlayer = null
    window.YT = {
      Player: class FakeYoutubePlayer {
        constructor(_iframe, config) {
          this.currentTime = 0
          this.events = config.events
          this.state = 5
          window.__edeniaFakeYoutubePlayer = this
          queueMicrotask(() => this.events.onReady?.({ target: this }))
        }

        destroy() {}
        getCurrentTime() { return this.currentTime }
        getPlaybackRate() { return 1 }
        getPlayerState() { return this.state }
        playVideo() {
          this.state = 1
          this.events.onStateChange?.({ data: 1 })
        }
        seekTo(seconds) { this.currentTime = Number(seconds) || 0 }
      }
    }
  })
}

test('Removed preview playback never mutates study state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedVideoOrganizationState(page)
  await installFakeYoutubePlayer(page)

  await page.locator('#removedSectionToggle').click()
  const previewButton = page.locator(
    '#removedGrid [data-video-preview-action="removed-thumbnail"]'
  )
  await expect(previewButton).toHaveCount(1)
  const stateBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))

  await previewButton.click()
  await expect(page.locator('.video-player-overlay')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window.__edeniaFakeYoutubePlayer?.getPlayerState?.()
  ))).toBe(1)

  await page.waitForTimeout(1100)
  await page.evaluate(() => {
    const player = window.__edeniaFakeYoutubePlayer
    player.currentTime += 1
    player.state = 2
    player.events.onStateChange?.({ data: 2 })
    player.state = 0
    player.events.onStateChange?.({ data: 0 })
  })
  await expect(page.locator('.video-watch-reminder-popover.is-player')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('.video-player-overlay')).toHaveCount(0)
  await expect(page.locator(
    '#removedGrid .removed-card[data-video-id="removed-preview-video"]'
  )).toHaveCount(1)
  const stateAfter = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  expect(stateAfter).toBe(stateBefore)
})
