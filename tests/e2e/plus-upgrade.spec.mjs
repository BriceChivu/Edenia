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
