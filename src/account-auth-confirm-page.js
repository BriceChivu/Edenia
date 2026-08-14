import {
  ACCOUNT_AUTH_CONFIRM_STATES,
  createAccountAuthConfirmPage
} from './integrations/account-auth-confirm-page.js'
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseRuntimeConfig
} from './integrations/runtime-config.js'
import { createEdeniaSupabaseClient } from './integrations/supabase-client.js'

const COPY = Object.freeze({
  en: {
    action: 'Continue to Edenia',
    invalid: 'This sign-in link is invalid, expired, or has already been used. Request a new link from Edenia.',
    offline: 'You appear to be offline. Reconnect, then try again.',
    ready: 'Select Continue to Edenia to finish signing in on this browser.',
    retryable: 'Edenia could not verify the link. Try again.',
    success: 'Signed in. Returning to Edenia…',
    title: 'Confirm your Edenia sign-in',
    verifying: 'Confirming your sign-in…'
  },
  es: {
    action: 'Continuar a Edenia',
    invalid: 'Este enlace de acceso no es válido, caducó o ya se usó. Solicita un enlace nuevo en Edenia.',
    offline: 'Parece que no tienes conexión. Vuelve a conectarte e inténtalo de nuevo.',
    ready: 'Selecciona Continuar a Edenia para terminar de iniciar sesión en este navegador.',
    retryable: 'Edenia no pudo verificar el enlace. Inténtalo de nuevo.',
    success: 'Sesión iniciada. Volviendo a Edenia…',
    title: 'Confirma tu acceso a Edenia',
    verifying: 'Confirmando tu acceso…'
  },
  fr: {
    action: 'Continuer vers Edenia',
    invalid: 'Ce lien de connexion est invalide, a expiré ou a déjà été utilisé. Demandez un nouveau lien dans Edenia.',
    offline: 'Vous semblez hors ligne. Reconnectez-vous, puis réessayez.',
    ready: 'Sélectionnez Continuer vers Edenia pour terminer la connexion dans ce navigateur.',
    retryable: 'Edenia n’a pas pu vérifier le lien. Réessayez.',
    success: 'Connexion réussie. Retour à Edenia…',
    title: 'Confirmez votre connexion à Edenia',
    verifying: 'Confirmation de votre connexion…'
  },
  'zh-Hans': {
    action: '继续前往 Edenia',
    invalid: '此登录链接无效、已过期或已使用。请在 Edenia 中申请新链接。',
    offline: '你似乎处于离线状态。重新联网后再试。',
    ready: '选择“继续前往 Edenia”，在此浏览器中完成登录。',
    retryable: 'Edenia 无法验证此链接，请重试。',
    success: '登录成功，正在返回 Edenia…',
    title: '确认登录 Edenia',
    verifying: '正在确认登录…'
  },
  'zh-Hant': {
    action: '繼續前往 Edenia',
    invalid: '此登入連結無效、已過期或已使用。請在 Edenia 中要求新連結。',
    offline: '你似乎處於離線狀態。重新連線後再試。',
    ready: '選擇「繼續前往 Edenia」，在此瀏覽器中完成登入。',
    retryable: 'Edenia 無法驗證此連結，請再試一次。',
    success: '登入成功，正在返回 Edenia…',
    title: '確認登入 Edenia',
    verifying: '正在確認登入…'
  }
})

function getLocale() {
  const languages = navigator.languages || [navigator.language]
  for (const language of languages) {
    const normalized = String(language || '').toLowerCase()
    if (normalized.startsWith('fr')) return 'fr'
    if (normalized.startsWith('es')) return 'es'
    if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) {
      return 'zh-Hant'
    }
    if (normalized.startsWith('zh')) return 'zh-Hans'
  }
  return 'en'
}

const locale = getLocale()
const copy = COPY[locale]
document.documentElement.lang = locale
const title = document.querySelector('[data-auth-confirm-title]')
const statusElement = document.querySelector('[data-auth-confirm-status]')
const action = document.querySelector('[data-auth-confirm-action]')
if (title) title.textContent = copy.title
if (action) action.textContent = copy.action

const isTopLevel = window.top === window.self
const capturedFragment = isTopLevel
  ? window.EDENIA_AUTH_CONFIRM_FRAGMENT || ''
  : ''
delete window.EDENIA_AUTH_CONFIRM_FRAGMENT

let controller = null
function render(state) {
  const current = state?.status || ACCOUNT_AUTH_CONFIRM_STATES.INVALID
  if (statusElement) {
    statusElement.textContent = copy[current] || copy.invalid
    statusElement.dataset.authConfirmTone = [
      ACCOUNT_AUTH_CONFIRM_STATES.INVALID,
      ACCOUNT_AUTH_CONFIRM_STATES.OFFLINE,
      ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE
    ].includes(current) ? 'error' : 'neutral'
  }
  if (action) {
    action.disabled = ![
      ACCOUNT_AUTH_CONFIRM_STATES.READY,
      ACCOUNT_AUTH_CONFIRM_STATES.OFFLINE,
      ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE
    ].includes(current)
  }
}

function initializeConfirmation() {
  try {
    if (!isTopLevel) throw new Error()
    if (!hasSupabaseRuntimeConfig()) throw new Error()
    const client = createEdeniaSupabaseClient({
      publishableKey: getSupabasePublishableKey(),
      storageKey: 'edenia_v1_internal_test_plus_auth_v1',
      url: getSupabaseUrl()
    })
    controller = createAccountAuthConfirmPage({
      client,
      fragment: capturedFragment,
      isOnline: () => navigator.onLine !== false,
      location: window.location,
      navigate: url => window.location.assign(url),
      onStateChange: render
    })
    controller.initialize()
  } catch {
    render({ status: ACCOUNT_AUTH_CONFIRM_STATES.INVALID })
  }
}

action?.addEventListener('click', () => controller?.confirm())
window.addEventListener('DOMContentLoaded', initializeConfirmation, {
  once: true
})
window.addEventListener('pagehide', () => controller?.destroy(), { once: true })
