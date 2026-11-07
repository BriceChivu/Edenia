import { expect, test } from '../support/network-fixture.mjs'

test('language and sound controls stay aligned between onboarding steps', async ({ page }) => {
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Island frame unused by onboarding check</title>'
  }))
  await page.goto('./?internal_test=2')
  await expect(page.locator('#introTrailer')).toBeVisible()

  async function controlPositions(localeId, soundId) {
    const locale = page.locator(localeId)
    const sound = page.locator(soundId)
    await expect(locale).toBeVisible()
    await expect(sound).toBeVisible()
    await locale.click()
    await expect(locale).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.move(0, 0)
    return { locale: await locale.boundingBox(), sound: await sound.boundingBox() }
  }

  const intro = await controlPositions('#introLocaleBtn', '#introSoundBtn')
  await page.locator('#introLocaleBtn').click()
  await page.locator('#introStartBtn').click()
  await expect(page.locator('#onboardingPanel')).toBeVisible()
  const onboarding = await controlPositions('#onboardingLocaleBtn', '#onboardingSoundBtn')

  for (const control of ['locale', 'sound']) {
    for (const dimension of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(intro[control][dimension] - onboarding[control][dimension])).toBeLessThan(1)
    }
  }
  if (page.viewportSize().width <= 480) {
    expect(Math.abs(intro.locale.y - intro.sound.y)).toBeLessThan(1)
  }
})
