import { expect, test } from '../support/network-fixture.mjs'

const TOKEN = 'A'.repeat(43)
const runtimeConfig = `window.EDENIA_CONFIG = {
  supabaseUrl: 'https://unsubscribe-page-test.supabase.co'
}`
const localeExpectations = {
  en: ['Stop study reminders?', 'Study reminders stopped'],
  'zh-Hant': ['停止學習提醒嗎？', '學習提醒已停止'],
  'zh-Hans': ['停止学习提醒吗？', '学习提醒已停止'],
  es: ['¿Dejar de recibir recordatorios?', 'Recordatorios detenidos'],
  fr: ['Arrêter les rappels d’étude ?', 'Rappels d’étude arrêtés'],
}

async function routeRuntimeConfig(page) {
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200,
  }))
}

test('localized confirmation redacts its capability and submits without app state', async ({
  page,
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const requests = []
  await routeRuntimeConfig(page)
  await page.route(
    'https://unsubscribe-page-test.supabase.co/functions/v1/unsubscribe-study-reminders',
    async route => {
      const headers = await route.request().allHeaders()
      requests.push({
        body: route.request().postData(),
        headers,
        method: route.request().method(),
      })
      await route.fulfill({
        body: JSON.stringify({ status: 'unsubscribed' }),
        headers: {
          'Access-Control-Allow-Origin': headers.origin,
          'Content-Type': 'application/json',
        },
        status: 200,
      })
    },
  )

  for (const [locale, [confirmTitle, successTitle]] of Object.entries(
    localeExpectations,
  )) {
    await page.goto(`/unsubscribe/?token=${TOKEN}&lang=${locale}`)

    await expect(page).toHaveURL(`/unsubscribe/?lang=${locale}`)
    await expect(page.getByRole('heading', { name: confirmTitle })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('script[src*="analytics"]')).toHaveCount(0)
    await expect(page.locator('script[src$="app.js"]')).toHaveCount(0)
    await page.getByRole('button').click()
    await expect(page.getByRole('heading', { name: successTitle })).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)

    const geometry = await page.locator('[data-reminder-unsubscribe-root]').evaluate(
      element => ({
        cardWidth: element.scrollWidth,
        cardClientWidth: element.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }),
    )
    expect(geometry.cardWidth).toBeLessThanOrEqual(geometry.cardClientWidth)
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  }

  expect(requests).toHaveLength(5)
  const expectedOrigin = new URL(page.url()).origin
  for (const [index, locale] of Object.keys(localeExpectations).entries()) {
    expect(requests[index].method).toBe('POST')
    expect(requests[index].headers.origin).toBe(expectedOrigin)
    expect(Object.fromEntries(new URLSearchParams(requests[index].body))).toEqual({
      token: TOKEN,
      lang: locale,
    })
    expect(requests[index].headers.authorization).toBeUndefined()
    expect(requests[index].headers.apikey).toBeUndefined()
  }
})

test('invalid links fail closed without calling the mutation API', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let apiCalls = 0
  await routeRuntimeConfig(page)
  await page.route('https://unsubscribe-page-test.supabase.co/**', route => {
    apiCalls += 1
    return route.abort()
  })

  await page.goto(`/unsubscribe/?token=short&lang=en&next=evil`)

  await expect(page).toHaveURL('/unsubscribe/?lang=en')
  await expect(page.getByRole('heading', {
    name: 'This link is not available',
  })).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)
  expect(apiCalls).toBe(0)
})

test('temporary API failures keep a bounded retry path', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let apiCalls = 0
  await routeRuntimeConfig(page)
  await page.route(
    'https://unsubscribe-page-test.supabase.co/functions/v1/unsubscribe-study-reminders',
    async route => {
      apiCalls += 1
      const headers = await route.request().allHeaders()
      return route.fulfill({
        body: JSON.stringify({
          status: apiCalls === 1 ? 'unavailable' : 'already_unsubscribed',
        }),
        headers: {
          'Access-Control-Allow-Origin': headers.origin,
          'Content-Type': 'application/json',
        },
        status: 200,
      })
    },
  )

  await page.goto(`/unsubscribe/?token=${TOKEN}&lang=en`)
  await page.getByRole('button', { name: 'Stop reminders' }).click()
  await expect(page.getByText(/could not update your reminder preference/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', {
    name: 'Reminders are already stopped',
  })).toBeVisible()
  expect(apiCalls).toBe(2)
})
