import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DEFAULT_LOCALE,
  I18N,
  LOCALE_LABELS,
  SUPPORTED_LOCALES
} from '../../src/i18n/index.js'
import { ES_LOCALIZED } from '../../src/i18n/es.js'
import { FR_LOCALIZED } from '../../src/i18n/fr.js'
import { ZH_HANS_LOCALIZED } from '../../src/i18n/zh-Hans.js'
import { ZH_HANT_LOCALIZED } from '../../src/i18n/zh-Hant.js'
import {
  formatLocaleDate,
  formatLocaleDateTime,
  getBrowserDefaultLocale,
  getCurrentLocale,
  getLocaleLabel,
  getMissingI18nKeys,
  normalizeLocale,
  setCurrentLocale,
  t
} from '../../src/i18n/runtime.js'

const EXPECTED_DICTIONARY_HASHES = {
  en: '28e2976e56df7c1415a297fbaa555b00386bf73c776024153fa6cf10bbcf4f22',
  'zh-Hant': '72fd4fbb5e3228076b23a02f951c71bd03cb8e463010ce8480ff196c36ababd2',
  'zh-Hans': '6e7a2104afb0175ca3d463d02e1e55f24cea4a9ccaa4ae74f502eb9fc4dd34f9',
  es: '30aa50c06bd6d4df452263491ec737ccbcd44cbc45039c3303db649b71b6d033',
  fr: 'eb4da2053351491252a02768c8ce067ffbcefa4a5871687ed3783efd8edbda38'
}

const EXPECTED_KEY_ORDER_HASHES = {
  en: 'e4bc498445f8028dbb77d7db171956b0b56d8d060144a1ee301fdc2ca35da2d2',
  'zh-Hant': '1373ae5b9a909002477b9c09c88ae0f366f2961d138f5f0012c6771b9e4a39d2',
  'zh-Hans': '1373ae5b9a909002477b9c09c88ae0f366f2961d138f5f0012c6771b9e4a39d2',
  es: '1373ae5b9a909002477b9c09c88ae0f366f2961d138f5f0012c6771b9e4a39d2',
  fr: '1373ae5b9a909002477b9c09c88ae0f366f2961d138f5f0012c6771b9e4a39d2'
}

const EXPECTED_COUNTS = {
  en: 1060,
  'zh-Hant': 1064,
  'zh-Hans': 1064,
  es: 1064,
  fr: 1064
}

const LEGACY_NON_ENGLISH_EXTRA_KEYS = [
  'settings.anki.note',
  'settings.scoring.exampleAnki',
  'settings.scoring.exampleVideo',
  'settings.scoring.examples'
]

const INTENTIONAL_ENGLISH_FALLBACK_KEYS = [
  'sandbox.channel.culture',
  'sandbox.channel.design',
  'sandbox.channel.history',
  'sandbox.channel.language',
  'sandbox.channel.music',
  'sandbox.channel.science',
  'sandbox.channel.travel'
]

const OPTIONAL_PLURAL_KEYS = new Set([
  'onboarding.channelIssue',
  'onboarding.starterFeed.partial',
  'toast.refreshFailedChannels',
  'toast.refreshLoaded',
  'toast.refreshLoadedWithErrors',
  'toast.skippedShorts',
  'toast.skippedShortsSettingsHint'
])

const LOCALIZED_OVERRIDES = {
  'zh-Hant': ZH_HANT_LOCALIZED,
  'zh-Hans': ZH_HANS_LOCALIZED,
  es: ES_LOCALIZED,
  fr: FR_LOCALIZED
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function placeholders(value) {
  return [...new Set(
    [...String(value).matchAll(/\{(\w+)\}/g)].map(match => match[1])
  )].sort()
}

test('locale registry preserves exact values, key order, and public constants', () => {
  assert.equal(DEFAULT_LOCALE, 'en')
  assert.deepEqual(SUPPORTED_LOCALES, ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'])
  assert.deepEqual(Object.keys(LOCALE_LABELS), SUPPORTED_LOCALES)
  assert.deepEqual(Object.keys(I18N), SUPPORTED_LOCALES)

  for (const locale of SUPPORTED_LOCALES) {
    const dictionary = I18N[locale]
    assert.equal(Object.keys(dictionary).length, EXPECTED_COUNTS[locale])
    assert.equal(
      sha256(JSON.stringify(Object.keys(dictionary))),
      EXPECTED_KEY_ORDER_HASHES[locale]
    )
    assert.equal(
      sha256(JSON.stringify(dictionary)),
      EXPECTED_DICTIONARY_HASHES[locale]
    )
  }
})

test('non-English extra keys and intentional English fallbacks remain exact', () => {
  const englishKeys = Object.keys(I18N.en)

  for (const locale of SUPPORTED_LOCALES.slice(1)) {
    const extraKeys = Object.keys(I18N[locale])
      .filter(key => !Object.hasOwn(I18N.en, key))
      .sort()
    assert.deepEqual(extraKeys, LEGACY_NON_ENGLISH_EXTRA_KEYS)

    const inheritedKeys = englishKeys
      .filter(key => !Object.hasOwn(LOCALIZED_OVERRIDES[locale], key))
      .sort()
    assert.deepEqual(inheritedKeys, INTENTIONAL_ENGLISH_FALLBACK_KEYS)
  }
})

test('translation placeholders remain compatible with documented plural exceptions', () => {
  for (const locale of SUPPORTED_LOCALES.slice(1)) {
    for (const [key, englishValue] of Object.entries(I18N.en)) {
      const englishPlaceholders = placeholders(englishValue)
      const localePlaceholders = placeholders(I18N[locale][key])
      const missing = englishPlaceholders.filter(
        placeholder => !localePlaceholders.includes(placeholder)
      )
      const extra = localePlaceholders.filter(
        placeholder => !englishPlaceholders.includes(placeholder)
      )

      assert.deepEqual(extra, [], `${locale}:${key} adds placeholders`)
      if (missing.length) {
        assert.deepEqual(missing, ['plural'], `${locale}:${key} omits placeholders`)
        assert.equal(OPTIONAL_PLURAL_KEYS.has(key), true, `${locale}:${key} exception`)
      }
    }
  }
})

test('compact relative-time copy stays explicit across every locale', () => {
  const expected = {
    en: ['1w ago', '{count}w ago', '{count}mo ago'],
    es: ['hace 1 sem', 'hace {count} sem', 'hace {count} m'],
    fr: ['il y a 1 sem', 'il y a {count} sem', 'il y a {count} m'],
    'zh-Hans': ['1 周前', '{count} 周前', '{count} 个月前'],
    'zh-Hant': ['1 週前', '{count} 週前', '{count} 個月前']
  }
  const keys = [
    'time.weekAgoCompact',
    'time.weeksAgoCompact',
    'time.monthsAgoCompact'
  ]

  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(keys.map(key => I18N[locale][key]), expected[locale])
  }
})

test('channel discovery email copy stays explicit across every locale', () => {
  const expected = {
    en: 'Discover new channels',
    es: 'Descubrir nuevos canales',
    fr: 'Découvrir de nouvelles chaînes',
    'zh-Hans': '发现新频道',
    'zh-Hant': '探索新頻道'
  }

  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(I18N[locale]['settings.account.discoveryEmails'], expected[locale])
  }
})

test('every static translation attribute resolves against English', async () => {
  const htmlSources = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../plus/index.html', import.meta.url), 'utf8')
  ])
  const attributeNames = [
    'data-i18n',
    'data-i18n-alt',
    'data-i18n-aria-label',
    'data-i18n-placeholder',
    'data-i18n-title'
  ]

  for (const html of htmlSources) {
    for (const attributeName of attributeNames) {
      const pattern = new RegExp(`${attributeName}="([^"]+)"`, 'g')
      for (const match of html.matchAll(pattern)) {
        assert.equal(
          Object.hasOwn(I18N.en, match[1]),
          true,
          `${attributeName}="${match[1]}" must resolve`
        )
      }
    }
  }
})

test('locale normalization and browser defaults preserve current mappings', () => {
  const cases = new Map([
    ['en-US', 'en'],
    ['fr-CA', 'fr'],
    ['es-419', 'es'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-Hant-TW', 'en'],
    ['unknown', 'en'],
    ['', 'en'],
    ['  fr-CA  ', 'fr'],
    [null, 'en']
  ])

  for (const [input, expected] of cases) {
    assert.equal(normalizeLocale(input), expected)
  }
  assert.equal(getBrowserDefaultLocale({
    language: 'fr-CA',
    languages: ['es-ES']
  }), 'fr')
  assert.equal(getBrowserDefaultLocale({
    language: '',
    languages: ['', 'zh-TW']
  }), 'zh-Hant')
})

test('translation runtime preserves selection, fallback, labels, and interpolation', () => {
  setCurrentLocale('fr')
  assert.equal(getCurrentLocale(), 'fr')
  assert.equal(getLocaleLabel(), 'Français')
  assert.equal(getLocaleLabel('unknown'), 'English')
  assert.equal(t('settings.title'), I18N.fr['settings.title'])
  assert.equal(t('sandbox.channel.language'), I18N.en['sandbox.channel.language'])
  const fallbackKey = 'settings.title'
  const localizedValue = I18N.fr[fallbackKey]
  try {
    I18N.fr[fallbackKey] = undefined
    assert.equal(t(fallbackKey), I18N.en[fallbackKey])
  } finally {
    I18N.fr[fallbackKey] = localizedValue
  }
  assert.equal(t('missing.translation.key'), 'missing.translation.key')
  assert.equal(
    t('time.weekLabel', { week: 0, start: false, end: undefined }),
    I18N.fr['time.weekLabel']
      .replace('{week}', '0')
      .replace('{start}', 'false')
      .replace('{end}', 'undefined')
  )
  assert.equal(t('time.weekLabel', { week: 1 }), I18N.fr['time.weekLabel']
    .replace('{week}', '1'))
  assert.equal(
    t('repeat {value}/{value}', { value: 'kept' }),
    'repeat kept/kept'
  )
  assert.equal(
    t('inherited {value}', Object.create({ value: 'ignored' })),
    'inherited {value}'
  )
  assert.deepEqual(getMissingI18nKeys(), [])
  setCurrentLocale(DEFAULT_LOCALE)
})

test('locale date formatting preserves invalid and Intl behavior', () => {
  const date = new Date(2026, 6, 28, 13, 45)
  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' }
  const dateTimeOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }

  setCurrentLocale('zh-Hant')
  assert.equal(
    formatLocaleDate(date, dateOptions),
    date.toLocaleDateString('zh-Hant', dateOptions)
  )
  assert.equal(
    formatLocaleDateTime(date, dateTimeOptions),
    date.toLocaleString('zh-Hant', dateTimeOptions)
  )
  assert.equal(formatLocaleDate('invalid'), '')
  assert.equal(formatLocaleDateTime('invalid'), '')
  setCurrentLocale(DEFAULT_LOCALE)
})
