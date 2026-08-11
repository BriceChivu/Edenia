import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  getReminderUnsubscribeApiUrl,
  getReminderUnsubscribeCopy,
  normalizeReminderUnsubscribeLocale,
  parseReminderUnsubscribeLocation,
  submitReminderUnsubscribe,
} from '../../src/integrations/reminder-unsubscribe-page.js'

const TOKEN = 'A'.repeat(43)
const ENDPOINT = 'https://page-test.supabase.co/functions/v1/unsubscribe-study-reminders'
const LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr']

test('parses only an exact opaque token and supported locale', () => {
  assert.deepEqual(
    parseReminderUnsubscribeLocation({
      href: `https://bricechivu.github.io/Edenia/unsubscribe/?token=${TOKEN}&lang=fr`,
    }),
    { locale: 'fr', token: TOKEN, valid: true },
  )

  for (const href of [
    'https://bricechivu.github.io/Edenia/unsubscribe/',
    `https://bricechivu.github.io/Edenia/unsubscribe/?token=short&lang=en`,
    `https://bricechivu.github.io/Edenia/unsubscribe/?token=${TOKEN}&lang=de`,
    `https://bricechivu.github.io/Edenia/unsubscribe/?token=${TOKEN}&lang=en&next=evil`,
    `https://bricechivu.github.io/Edenia/unsubscribe/?token=${TOKEN}&lang=en#token`,
  ]) {
    assert.equal(parseReminderUnsubscribeLocation({ href }).valid, false)
  }
})

test('provides complete confirmation and result copy in all five locales', () => {
  for (const locale of LOCALES) {
    assert.equal(normalizeReminderUnsubscribeLocale(locale), locale)
    const copy = getReminderUnsubscribeCopy(locale)
    for (const key of [
      'confirmTitle',
      'confirmBody',
      'confirmButton',
      'submitting',
      'successTitle',
      'successBody',
      'alreadyTitle',
      'alreadyBody',
      'invalidTitle',
      'invalidBody',
      'unavailable',
      'retryButton',
      'back',
    ]) {
      assert.ok(copy[key].length > 2, `${locale}.${key} must have copy`)
    }
  }
  assert.equal(normalizeReminderUnsubscribeLocale('de'), 'en')
})

test('constructs the API only from hosted Supabase or exact local runtime URLs', () => {
  assert.equal(
    getReminderUnsubscribeApiUrl({
      EDENIA_CONFIG: { supabaseUrl: 'https://page-test.supabase.co' },
    }),
    ENDPOINT,
  )
  assert.equal(
    getReminderUnsubscribeApiUrl({
      EDENIA_CONFIG: { supabaseUrl: 'http://127.0.0.1:54321' },
    }),
    'http://127.0.0.1:54321/functions/v1/unsubscribe-study-reminders',
  )

  for (const supabaseUrl of [
    '',
    'https://evil.example',
    'http://page-test.supabase.co',
    'https://page-test.supabase.co/extra',
    'http://localhost:8000',
  ]) {
    assert.equal(
      getReminderUnsubscribeApiUrl({
        EDENIA_CONFIG: { supabaseUrl },
      }),
      '',
    )
  }
})

test('submits a credential-free, no-referrer form request and normalizes results', async () => {
  const calls = []
  const result = await submitReminderUnsubscribe({
    fetchImpl(url, options) {
      calls.push({ url, options })
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ status: 'unsubscribed' }),
      })
    },
    endpointUrl: ENDPOINT,
    token: TOKEN,
    locale: 'zh-Hant',
  })

  assert.equal(result, 'unsubscribed')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, ENDPOINT)
  assert.deepEqual(calls[0].options.headers, {
    'Content-Type': 'application/x-www-form-urlencoded',
  })
  assert.equal(calls[0].options.credentials, 'omit')
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer')
  assert.equal(calls[0].options.redirect, 'error')
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(calls[0].options.body)),
    { token: TOKEN, lang: 'zh-Hant' },
  )
})

test('fails closed for invalid input, response types, statuses, and network errors', async () => {
  let calls = 0
  assert.equal(await submitReminderUnsubscribe({
    fetchImpl: () => { calls += 1 },
    endpointUrl: ENDPOINT,
    token: 'short',
    locale: 'en',
  }), 'unavailable')
  assert.equal(calls, 0)

  const cases = [
    {
      response: {
        ok: false,
        status: 400,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ status: 'invalid' }),
      },
      expected: 'invalid',
    },
    {
      response: {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/plain' }),
        json: () => Promise.resolve({ status: 'unsubscribed' }),
      },
      expected: 'unavailable',
    },
    {
      response: {
        ok: false,
        status: 503,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.resolve({ status: 'unavailable' }),
      },
      expected: 'unavailable',
    },
  ]
  for (const { response, expected } of cases) {
    assert.equal(await submitReminderUnsubscribe({
      fetchImpl: () => Promise.resolve(response),
      endpointUrl: ENDPOINT,
      token: TOKEN,
      locale: 'en',
    }), expected)
  }
  assert.equal(await submitReminderUnsubscribe({
    fetchImpl: () => Promise.reject(new Error('network details')),
    endpointUrl: ENDPOINT,
    token: TOKEN,
    locale: 'en',
  }), 'unavailable')
})

test('the static page redacts the capability and excludes app state and analytics', async () => {
  const [html, entrySource] = await Promise.all([
    readFile(new URL('../../unsubscribe/index.html', import.meta.url), 'utf8'),
    readFile(
      new URL('../../src/reminder-unsubscribe-page.js', import.meta.url),
      'utf8',
    ),
  ])

  assert.match(html, /meta name="referrer" content="no-referrer"/)
  assert.match(html, /meta name="robots" content="noindex, nofollow"/)
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /form-action 'none'/)
  assert.doesNotMatch(html, /analytics\.js|app\.js|posthog/i)
  assert.match(entrySource, /history\.replaceState/)
  assert.doesNotMatch(
    entrySource,
    /localStorage|indexedDB|EDENIA_STATE|posthog|analytics/i,
  )
})
