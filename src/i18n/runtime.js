import {
  DEFAULT_LOCALE,
  I18N,
  LOCALE_LABELS,
  SUPPORTED_LOCALES
} from './index.js'

let currentLocale = DEFAULT_LOCALE

export { DEFAULT_LOCALE, SUPPORTED_LOCALES }

export function getCurrentLocale() {
  return currentLocale
}

export function normalizeLocale(locale) {
  const value = String(locale || '').trim()
  if (SUPPORTED_LOCALES.includes(value)) return value
  const lower = value.toLowerCase()
  if (
    lower === 'zh-tw'
    || lower === 'zh-hk'
    || lower === 'zh-mo'
    || lower === 'zh-hant'
  ) {
    return 'zh-Hant'
  }
  if (
    lower === 'zh'
    || lower === 'zh-cn'
    || lower === 'zh-sg'
    || lower === 'zh-hans'
  ) {
    return 'zh-Hans'
  }
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('fr')) return 'fr'
  if (lower.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

export function getBrowserDefaultLocale(browserNavigator = navigator) {
  const primaryLocale = browserNavigator.language
    || (
      Array.isArray(browserNavigator.languages)
        ? browserNavigator.languages.find(Boolean)
        : ''
    )
  return normalizeLocale(primaryLocale || DEFAULT_LOCALE)
}

export function getLocaleLabel(locale = currentLocale) {
  const normalized = normalizeLocale(locale)
  return LOCALE_LABELS[normalized] || LOCALE_LABELS[DEFAULT_LOCALE]
}

export function t(key, params = {}) {
  const dictionary = I18N[currentLocale] || I18N[DEFAULT_LOCALE]
  const template = dictionary?.[key] ?? I18N[DEFAULT_LOCALE]?.[key] ?? key
  return String(template).replace(/\{(\w+)\}/g, (_, name) => {
    return Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : `{${name}}`
  })
}

/**
 * Composition boundary: the app entry point owns DOM synchronization via
 * applyLocale and is the only production caller that should mutate this value.
 */
export function setCurrentLocale(locale) {
  currentLocale = normalizeLocale(locale)
  return currentLocale
}

export function getMissingI18nKeys() {
  const sourceKeys = Object.keys(I18N[DEFAULT_LOCALE] || {})
  return SUPPORTED_LOCALES.flatMap(locale => {
    const dictionary = I18N[locale] || {}
    return sourceKeys
      .filter(key => !Object.prototype.hasOwnProperty.call(dictionary, key))
      .map(key => `${locale}:${key}`)
  })
}

export function formatLocaleDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(currentLocale, options)
}

export function formatLocaleDateTime(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(currentLocale, options)
}
