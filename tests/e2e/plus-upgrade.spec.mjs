import { expect, test } from '../support/network-fixture.mjs'

test('Plus page presents the approved offer and keeps purchasing disabled', async ({ page }) => {
  await page.goto('/plus/')

  await expect(page).toHaveTitle('Edenia Plus')
  await expect(page.locator('[data-plus-benefits] .plus-benefit')).toHaveCount(3)
  await expect(page.getByText('Complete Study History and heatmap')).toBeVisible()
  await expect(page.getByText('Every Study Insight', { exact: true })).toBeVisible()
  await expect(page.getByText('Unlimited tracked channels')).toBeVisible()

  const plans = page.locator('[data-plus-plans] .plus-plan')
  await expect(plans).toHaveCount(2)
  await expect(plans.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await plans.nth(0).click()
  await expect(plans.nth(0)).toHaveAttribute('aria-pressed', 'true')

  const checkout = page.locator('[data-plus-checkout]')
  await expect(checkout).toBeDisabled()
  await expect(checkout).toHaveText('Plus purchasing is not open yet')

  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }))
  expect(width.document).toBeLessThanOrEqual(width.viewport)
})

test('contextual Plus modal traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/?plus=1&feature=complete-study-history')

  const modal = page.locator('#plusUpgradeModal')
  const dialog = modal.getByRole('dialog')
  const close = dialog.locator('[data-plus-action="close"]')
  await expect(modal).toBeVisible()
  await expect(dialog.getByRole('heading', {
    name: 'Your earlier study history is still here.'
  })).toBeVisible()
  await expect(close).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(dialog.locator('a[href="plus/"]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
})

test('Free transition keeps the first five shelves and preserves saved video state', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  const completedAt = '2026-07-20T04:00:00.000Z'
  await page.goto('/')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await page.evaluate(seedCompletedAt => {
    const channelIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const state = window.defaultState(
      4,
      channelIds.map(id => ({ id, name: `Channel ${id}` })),
      'light',
      [],
      'en'
    )
    const completedAt = seedCompletedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.config.channelShelfOrder = ['g', 'b', 'a', 'e', 'd', 'c', 'f']
    state.config.trackedChannelPolicy = {
      version: 1,
      freeAllowance: 7,
      grandfatheredAt: completedAt,
      lastConfirmedTier: 'plus',
      downgradePending: false
    }
    const video = (id, channelId, overrides = {}) => ({
      id,
      channelId,
      channelTitle: `Channel ${channelId}`,
      title: `Video ${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: '2026-07-27T04:00:00.000Z',
      duration: 600,
      status: 'unwatched',
      ...overrides
    })
    state.videos = {
      'manual-c': video('manual-c', 'c', {
        source: 'manual',
        manuallyAdded: true
      }),
      'feed-c': video('feed-c', 'c'),
      'watched-f': video('watched-f', 'f', {
        status: 'watched',
        watchedAt: '2026-07-28T04:00:00.000Z'
      }),
      'later-f': video('later-f', 'f', {
        status: 'watch-later',
        watchLater: true
      })
    }
    localStorage.setItem('edenia_v1_internal_test', JSON.stringify(state))
  }, completedAt)

  await page.goto('/?internal_test=1&plus_access=free')
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return {
      channelIds: state.config.channels.map(channel => channel.id),
      removedChannelIds: state.config.removedChannelIds,
      policy: state.config.trackedChannelPolicy,
      videoVisibility: Object.fromEntries(
        Object.entries(state.videos).map(([id, video]) => [id, video.hiddenFromGrid === true])
      )
    }
  })).toEqual({
    channelIds: ['a', 'b', 'd', 'e', 'g'],
    removedChannelIds: ['c', 'f'],
    policy: {
      version: 1,
      freeAllowance: 5,
      grandfatheredAt: completedAt,
      lastConfirmedTier: 'free',
      downgradePending: false
    },
    videoVisibility: {
      'manual-c': false,
      'feed-c': true,
      'watched-f': false,
      'later-f': false
    }
  })

  await expect(page.locator('.video-card[data-video-id="manual-c"]')).toBeVisible()
  await expect(page.locator('.video-card[data-video-id="later-f"]')).toBeVisible()
  await expect(page.locator('.video-card[data-video-id="feed-c"]')).toHaveCount(0)
})
