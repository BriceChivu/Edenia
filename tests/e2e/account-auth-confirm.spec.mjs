import { expect, test } from '../support/network-fixture.mjs'

const TOKEN_HASH = 'abcdefghijklmnopqrstuvwxyz012345'
const SUPABASE_ORIGIN = 'https://account-ui-test.supabase.co'
const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

const runtimeConfig = `window.EDENIA_CONFIG = ${JSON.stringify({
  supabasePublishableKey: 'test-publishable-key',
  supabaseUrl: SUPABASE_ORIGIN
})}`

function fakeAccessToken(userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: 1893456000,
    role: 'authenticated',
    sub: userId
  })}.test-signature`
}

function authenticatedSession() {
  return {
    access_token: fakeAccessToken(AUTHENTICATED_USER_ID),
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'email', providers: ['email'] },
      aud: 'authenticated',
      created_at: '2026-08-01T00:00:00.000Z',
      email: 'learner@example.com',
      id: AUTHENTICATED_USER_ID,
      identities: [],
      role: 'authenticated',
      user_metadata: {}
    }
  }
}

async function installSupabaseFetchMock(page, requests) {
  await page.exposeFunction('__recordEdeniaConfirmRequest', request => {
    requests.push(request)
  })
  await page.addInitScript(({ origin, session }) => {
    const tracker = {
      mode: 'success',
      requests: []
    }
    window.__edeniaConfirmE2e = tracker
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init = {}) => {
      const url = String(typeof input === 'string' ? input : input?.url || input)
      if (!url.startsWith(origin)) return originalFetch(input, init)
      let body = null
      try { body = JSON.parse(String(init.body || 'null')) } catch {}
      tracker.requests.push({ body, url })
      window.__recordEdeniaConfirmRequest({ body, url })
      const headers = { 'Content-Type': 'application/json' }
      if (tracker.mode === 'retryable') {
        return new Response(JSON.stringify({ message: 'temporarily unavailable' }), {
          headers,
          status: 503
        })
      }
      if (tracker.mode === 'invalid') {
        return new Response(JSON.stringify({ message: 'invalid token' }), {
          headers,
          status: 403
        })
      }
      return new Response(JSON.stringify(session), { headers, status: 200 })
    }
  }, {
    origin: SUPABASE_ORIGIN,
    session: authenticatedSession()
  })
}

async function configureConfirmationPage(page, requests) {
  await installSupabaseFetchMock(page, requests)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig,
    contentType: 'text/javascript',
    status: 200
  }))
}

test('confirmation scrubs the fragment and verifies only after a deliberate action', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const requests = []
  await configureConfirmationPage(page, requests)

  await page.goto(`/auth/confirm/#token_hash=${TOKEN_HASH}&type=email`)
  await expect(page).toHaveURL('http://localhost:8000/auth/confirm/')
  await expect(page.getByRole('heading', {
    name: 'Confirm your Edenia sign-in'
  })).toBeVisible()
  await expect(page.getByText(
    'Select Continue to Edenia to finish signing in on this browser.'
  )).toBeVisible()
  const action = page.getByRole('button', { name: 'Continue to Edenia' })
  await expect(action).toBeEnabled()
  expect(await page.evaluate(() => (
    window.__edeniaConfirmE2e.requests.length
  ))).toBe(0)

  const geometry = await page.locator('[data-auth-confirm-root]').evaluate(element => ({
    contentWidth: element.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))
  expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)

  await action.click()
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1)
  const request = requests[0]
  expect(request.body).toMatchObject({
    token_hash: TOKEN_HASH,
    type: 'email'
  })
  await expect(page).toHaveURL(
    'http://localhost:8000/?internal_test=1&account=1'
  )
})

test('confirmation retains only an in-memory retry after transient failure', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const requests = []
  await configureConfirmationPage(page, requests)
  await page.goto(`/auth/confirm/#token_hash=${TOKEN_HASH}&type=email`)
  await page.evaluate(() => { window.__edeniaConfirmE2e.mode = 'retryable' })

  const action = page.getByRole('button', { name: 'Continue to Edenia' })
  await action.click()
  await expect(page.getByText(
    'Edenia could not verify the link. Try again.'
  )).toBeVisible()
  await expect(action).toBeEnabled()
  await expect(page).toHaveURL('http://localhost:8000/auth/confirm/')

  await page.evaluate(() => { window.__edeniaConfirmE2e.mode = 'success' })
  await action.click()
  await expect(page).toHaveURL(
    'http://localhost:8000/?internal_test=1&account=1'
  )
})

test('a definitive invalid confirmation cannot reuse the token', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const requests = []
  await configureConfirmationPage(page, requests)
  await page.goto(`/auth/confirm/#token_hash=${TOKEN_HASH}&type=email`)
  await page.evaluate(() => { window.__edeniaConfirmE2e.mode = 'invalid' })

  const action = page.getByRole('button', { name: 'Continue to Edenia' })
  await action.click()
  await expect(page.getByText(
    'This sign-in link is invalid, expired, or has already been used. Request a new link from Edenia.'
  )).toBeVisible()
  await expect(action).toBeDisabled()
  expect(requests.length).toBe(1)
})
