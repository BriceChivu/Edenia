import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createReminderUnsubscribeApiUrl,
  createReminderUnsubscribePageUrl,
  createReminderUnsubscribeToken,
  digestReminderUnsubscribeToken,
  renderReminderEmail,
} from './reminder-email.ts'

const DELIVERY_ID = '61111111-1111-4111-8111-111111111111'
const OTHER_DELIVERY_ID = '62222222-2222-4222-8222-222222222222'
const SECRET = 'a-test-secret-with-at-least-32-bytes-of-entropy'
const APP_URL = 'https://bricechivu.github.io/Edenia/?internal_test=1'
const ENDPOINT = 'https://example-project.supabase.co/functions/v1/unsubscribe-study-reminders'
const PAGE = 'https://bricechivu.github.io/Edenia/unsubscribe/'
const LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'] as const

test('creates deterministic opaque per-delivery capabilities and 32-byte digests', async () => {
  const first = await createReminderUnsubscribeToken(DELIVERY_ID, SECRET)
  const retry = await createReminderUnsubscribeToken(DELIVERY_ID, SECRET)
  const another = await createReminderUnsubscribeToken(OTHER_DELIVERY_ID, SECRET)

  assert.equal(first, retry)
  assert.notEqual(first, another)
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.doesNotMatch(first, /61111111|@|edenia/i)
  assert.equal((await digestReminderUnsubscribeToken(first)).byteLength, 32)
})

test('rejects weak secrets, malformed delivery IDs, and malformed tokens', async () => {
  await assert.rejects(
    createReminderUnsubscribeToken('not-a-uuid', SECRET),
    /delivery ID/i,
  )
  await assert.rejects(
    createReminderUnsubscribeToken(DELIVERY_ID, 'too-short'),
    /at least 32 bytes/i,
  )
  await assert.rejects(
    digestReminderUnsubscribeToken('not-a-token'),
    /token is invalid/i,
  )
})

test('constructs only hosted Supabase or loopback unsubscribe destinations', async () => {
  const token = await createReminderUnsubscribeToken(DELIVERY_ID, SECRET)
  assert.equal(
    createReminderUnsubscribeApiUrl(ENDPOINT, token, 'fr'),
    `${ENDPOINT}?token=${token}&lang=fr`,
  )
  assert.equal(
    createReminderUnsubscribeApiUrl(
      'http://127.0.0.1:54321/functions/v1/unsubscribe-study-reminders',
      token,
      'en',
    ),
    `http://127.0.0.1:54321/functions/v1/unsubscribe-study-reminders?token=${token}&lang=en`,
  )

  for (const endpoint of [
    'https://example.test/functions/v1/unsubscribe-study-reminders',
    'http://example-project.supabase.co/functions/v1/unsubscribe-study-reminders',
    'https://example-project.supabase.co/functions/v1/another-function',
    `${ENDPOINT}?unexpected=1`,
  ]) {
    assert.throws(
      () => createReminderUnsubscribeApiUrl(endpoint, token, 'en'),
      /endpoint|query/i,
    )
  }
})

test('constructs only exact Edenia unsubscribe page destinations', async () => {
  const token = await createReminderUnsubscribeToken(DELIVERY_ID, SECRET)
  assert.equal(
    createReminderUnsubscribePageUrl(PAGE, token, 'zh-Hans'),
    `${PAGE}?token=${token}&lang=zh-Hans`,
  )
  assert.equal(
    createReminderUnsubscribePageUrl(
      'http://localhost:8000/unsubscribe/',
      token,
      'en',
    ),
    `http://localhost:8000/unsubscribe/?token=${token}&lang=en`,
  )

  for (const pageUrl of [
    'https://bricechivu.github.io/Edenia/',
    'https://bricechivu.github.io/Edenia/unsubscribe',
    'https://evil.example/Edenia/unsubscribe/',
    `${PAGE}?unexpected=1`,
  ]) {
    assert.throws(
      () => createReminderUnsubscribePageUrl(pageUrl, token, 'en'),
      /page is not allowlisted/i,
    )
  }
})

test('renders text and escaped HTML content in all five locales', async () => {
  const token = await createReminderUnsubscribeToken(DELIVERY_ID, SECRET)

  for (const locale of LOCALES) {
    const unsubscribePageUrl = createReminderUnsubscribePageUrl(
      PAGE,
      token,
      locale,
    )
    const content = renderReminderEmail({
      locale,
      appUrl: APP_URL,
      unsubscribePageUrl,
    })

    assert.equal(content.locale, locale)
    assert.ok(content.subject.length > 5)
    assert.match(content.text, new RegExp(APP_URL.replaceAll('?', '\\?')))
    assert.match(content.text, new RegExp(token))
    assert.match(content.html, new RegExp(`<html lang="${locale}">`))
    assert.match(content.html, /role="presentation"/)
    assert.match(content.html, /internal_test=1/)
    assert.match(content.html, /&amp;lang=/)
    assert.doesNotMatch(content.html, /<script|javascript:/i)
  }
})

test('rejects non-internal app links and tampered unsubscribe links', async () => {
  const token = await createReminderUnsubscribeToken(DELIVERY_ID, SECRET)
  const unsubscribePageUrl = createReminderUnsubscribePageUrl(PAGE, token, 'en')

  assert.throws(
    () => renderReminderEmail({
      locale: 'en',
      appUrl: 'https://bricechivu.github.io/Edenia/',
      unsubscribePageUrl,
    }),
    /app URL is not allowlisted/i,
  )
  assert.throws(
    () => renderReminderEmail({
      locale: 'en',
      appUrl: APP_URL,
      unsubscribePageUrl: `${unsubscribePageUrl}&next=https://evil.example`,
    }),
    /invalid parameters/i,
  )
})
