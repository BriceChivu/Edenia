import en from './en.js'
import zhHant from './zh-Hant.js'
import zhHans from './zh-Hans.js'
import es from './es.js'
import fr from './fr.js'

export const DEFAULT_LOCALE = 'en'
export const SUPPORTED_LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr']
export const LOCALE_LABELS = {
  en: 'English',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  es: 'Español',
  fr: 'Français'
}

export const I18N = {
  en,
  'zh-Hant': zhHant,
  'zh-Hans': zhHans,
  es,
  fr
}
