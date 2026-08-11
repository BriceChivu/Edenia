const REMINDER_LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr']
const REMINDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UNSUBSCRIBE_API_PATH = '/functions/v1/unsubscribe-study-reminders'

const COPY = Object.freeze({
  en: Object.freeze({
    confirmTitle: 'Stop study reminders?',
    confirmBody: 'Edenia will stop sending reminder emails to this account. Your local study progress will stay on this device.',
    confirmButton: 'Stop reminders',
    submitting: 'Stopping reminders…',
    successTitle: 'Study reminders stopped',
    successBody: 'You will no longer receive Edenia study reminder emails. Your local study progress was not changed.',
    alreadyTitle: 'Reminders are already stopped',
    alreadyBody: 'This unsubscribe link has already been used. Your local study progress was not changed.',
    invalidTitle: 'This link is not available',
    invalidBody: 'The unsubscribe link is invalid or incomplete. You can also turn reminders off in Edenia Settings.',
    unavailable: 'Edenia could not update your reminder preference. Check your connection and try again.',
    retryButton: 'Try again',
    back: 'Back to Edenia',
  }),
  'zh-Hant': Object.freeze({
    confirmTitle: '停止學習提醒嗎？',
    confirmBody: 'Edenia 將停止向此帳號傳送提醒電子郵件。這台裝置上的本機學習進度會保持不變。',
    confirmButton: '停止提醒',
    submitting: '正在停止提醒…',
    successTitle: '學習提醒已停止',
    successBody: '你將不再收到 Edenia 的學習提醒電子郵件。本機學習進度沒有變更。',
    alreadyTitle: '提醒已經停止',
    alreadyBody: '此取消訂閱連結已使用過。本機學習進度沒有變更。',
    invalidTitle: '此連結無法使用',
    invalidBody: '取消訂閱連結無效或不完整。你也可以在 Edenia 設定中關閉提醒。',
    unavailable: 'Edenia 目前無法更新你的提醒偏好。請檢查網路連線後再試一次。',
    retryButton: '再試一次',
    back: '返回 Edenia',
  }),
  'zh-Hans': Object.freeze({
    confirmTitle: '停止学习提醒吗？',
    confirmBody: 'Edenia 将停止向此账号发送提醒邮件。这台设备上的本地学习进度会保持不变。',
    confirmButton: '停止提醒',
    submitting: '正在停止提醒…',
    successTitle: '学习提醒已停止',
    successBody: '你将不再收到 Edenia 的学习提醒邮件。本地学习进度没有更改。',
    alreadyTitle: '提醒已经停止',
    alreadyBody: '此取消订阅链接已使用过。本地学习进度没有更改。',
    invalidTitle: '此链接无法使用',
    invalidBody: '取消订阅链接无效或不完整。你也可以在 Edenia 设置中关闭提醒。',
    unavailable: 'Edenia 目前无法更新你的提醒偏好。请检查网络连接后再试一次。',
    retryButton: '再试一次',
    back: '返回 Edenia',
  }),
  es: Object.freeze({
    confirmTitle: '¿Dejar de recibir recordatorios?',
    confirmBody: 'Edenia dejará de enviar correos de recordatorio a esta cuenta. Tu progreso de estudio local permanecerá en este dispositivo.',
    confirmButton: 'Detener los recordatorios',
    submitting: 'Deteniendo los recordatorios…',
    successTitle: 'Recordatorios detenidos',
    successBody: 'Ya no recibirás correos de recordatorio de Edenia. Tu progreso de estudio local no ha cambiado.',
    alreadyTitle: 'Los recordatorios ya estaban detenidos',
    alreadyBody: 'Este enlace para cancelar la suscripción ya se utilizó. Tu progreso de estudio local no ha cambiado.',
    invalidTitle: 'Este enlace no está disponible',
    invalidBody: 'El enlace es inválido o está incompleto. También puedes desactivar los recordatorios en los ajustes de Edenia.',
    unavailable: 'Edenia no pudo actualizar tu preferencia. Comprueba tu conexión e inténtalo de nuevo.',
    retryButton: 'Intentar de nuevo',
    back: 'Volver a Edenia',
  }),
  fr: Object.freeze({
    confirmTitle: 'Arrêter les rappels d’étude ?',
    confirmBody: 'Edenia cessera d’envoyer des e-mails de rappel à ce compte. Votre progression locale restera sur cet appareil.',
    confirmButton: 'Arrêter les rappels',
    submitting: 'Arrêt des rappels…',
    successTitle: 'Rappels d’étude arrêtés',
    successBody: 'Vous ne recevrez plus d’e-mails de rappel Edenia. Votre progression locale n’a pas été modifiée.',
    alreadyTitle: 'Les rappels sont déjà arrêtés',
    alreadyBody: 'Ce lien de désabonnement a déjà été utilisé. Votre progression locale n’a pas été modifiée.',
    invalidTitle: 'Ce lien n’est pas disponible',
    invalidBody: 'Le lien est invalide ou incomplet. Vous pouvez aussi désactiver les rappels dans les réglages Edenia.',
    unavailable: 'Edenia n’a pas pu modifier vos préférences. Vérifiez votre connexion et réessayez.',
    retryButton: 'Réessayer',
    back: 'Retour à Edenia',
  }),
})

export function normalizeReminderUnsubscribeLocale(value) {
  return REMINDER_LOCALES.includes(value) ? value : 'en'
}

export function getReminderUnsubscribeCopy(locale) {
  return COPY[normalizeReminderUnsubscribeLocale(locale)]
}

export function parseReminderUnsubscribeLocation(locationLike) {
  const url = new URL(locationLike.href)
  const locale = normalizeReminderUnsubscribeLocale(url.searchParams.get('lang'))
  const keys = [...url.searchParams.keys()]
  const token = url.searchParams.get('token')
  const valid = keys.length === 2
    && keys.every(key => key === 'token' || key === 'lang')
    && url.searchParams.getAll('token').length === 1
    && url.searchParams.getAll('lang').length === 1
    && url.searchParams.get('lang') === locale
    && REMINDER_TOKEN_PATTERN.test(token || '')
    && !url.hash

  return Object.freeze({
    locale,
    token: valid ? token : null,
    valid,
  })
}

export function getReminderUnsubscribeApiUrl(target) {
  const configuredUrl = String(
    target?.EDENIA_CONFIG?.supabaseUrl || '',
  ).trim()
  let url
  try {
    url = new URL(configuredUrl)
  } catch {
    return ''
  }
  const isHosted = url.protocol === 'https:'
    && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  const isLocal = url.protocol === 'http:'
    && ['localhost', '127.0.0.1'].includes(url.hostname)
    && url.port === '54321'
  if (
    (!isHosted && !isLocal)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    return ''
  }
  return new URL(UNSUBSCRIBE_API_PATH, url.origin).href
}

export async function submitReminderUnsubscribe({
  fetchImpl,
  endpointUrl,
  token,
  locale,
}) {
  if (
    typeof fetchImpl !== 'function'
    || !endpointUrl
    || !REMINDER_TOKEN_PATTERN.test(token || '')
    || normalizeReminderUnsubscribeLocale(locale) !== locale
  ) {
    return 'unavailable'
  }

  try {
    const response = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, lang: locale }).toString(),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      return 'unavailable'
    }
    const payload = await response.json()
    if (
      response.ok
      && ['unsubscribed', 'already_unsubscribed'].includes(payload?.status)
    ) {
      return payload.status
    }
    return response.status === 400 && payload?.status === 'invalid'
      ? 'invalid'
      : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
