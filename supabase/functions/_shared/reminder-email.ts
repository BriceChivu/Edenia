const REMINDER_LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'] as const
const REMINDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UNSUBSCRIBE_API_PATH = '/functions/v1/unsubscribe-study-reminders'

const ALLOWED_APP_URLS = new Set([
  'https://bricechivu.github.io/Edenia/?internal_test=1',
  'http://localhost:8000/?internal_test=1',
])
const ALLOWED_UNSUBSCRIBE_PAGE_URLS = new Set([
  'https://bricechivu.github.io/Edenia/unsubscribe/',
  'http://localhost:8000/unsubscribe/',
])

export type ReminderLocale = typeof REMINDER_LOCALES[number]

type ReminderCopy = {
  subject: string
  preheader: string
  heading: string
  body: string
  cta: string
  consent: string
  unsubscribe: string
}

const COPY: Readonly<Record<ReminderLocale, ReminderCopy>> = Object.freeze({
  en: Object.freeze({
    subject: 'Your Edenia study reminder',
    preheader: 'A small reminder to continue your language-learning session.',
    heading: 'Ready for a study session?',
    body: 'Your Edenia reminder is here. A few focused minutes can keep your momentum going.',
    cta: 'Study with Edenia',
    consent: 'You asked Edenia to send you study reminders.',
    unsubscribe: 'Unsubscribe from study reminders',
  }),
  'zh-Hant': Object.freeze({
    subject: '你的 Edenia 學習提醒',
    preheader: '提醒你繼續今天的語言學習。',
    heading: '準備好開始學習了嗎？',
    body: '你的 Edenia 學習提醒到了。專心學習幾分鐘，也能讓進度持續累積。',
    cta: '前往 Edenia 學習',
    consent: '你曾同意讓 Edenia 傳送學習提醒。',
    unsubscribe: '取消訂閱學習提醒',
  }),
  'zh-Hans': Object.freeze({
    subject: '你的 Edenia 学习提醒',
    preheader: '提醒你继续今天的语言学习。',
    heading: '准备好开始学习了吗？',
    body: '你的 Edenia 学习提醒到了。专心学习几分钟，也能让进度持续积累。',
    cta: '前往 Edenia 学习',
    consent: '你曾同意让 Edenia 发送学习提醒。',
    unsubscribe: '取消订阅学习提醒',
  }),
  es: Object.freeze({
    subject: 'Tu recordatorio de estudio de Edenia',
    preheader: 'Un pequeño recordatorio para continuar tu sesión de idiomas.',
    heading: '¿Listo para estudiar?',
    body: 'Aquí tienes tu recordatorio de Edenia. Unos minutos de concentración pueden ayudarte a mantener el ritmo.',
    cta: 'Estudiar con Edenia',
    consent: 'Pediste a Edenia que te enviara recordatorios de estudio.',
    unsubscribe: 'Cancelar los recordatorios de estudio',
  }),
  fr: Object.freeze({
    subject: 'Votre rappel d’étude Edenia',
    preheader: 'Un petit rappel pour poursuivre votre session de langue.',
    heading: 'Prêt à étudier ?',
    body: 'Voici votre rappel Edenia. Quelques minutes de concentration peuvent vous aider à garder le rythme.',
    cta: 'Étudier avec Edenia',
    consent: 'Vous avez demandé à Edenia de vous envoyer des rappels d’étude.',
    unsubscribe: 'Se désabonner des rappels d’étude',
  }),
})

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function encodeBase64Url(bytes: Uint8Array) {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
}

function assertUnsubscribeEndpoint(url: URL) {
  const isHostedEndpoint = url.protocol === 'https:'
    && /^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)
  const isLocalEndpoint = url.protocol === 'http:'
    && isLoopbackHostname(url.hostname)

  if (
    (!isHostedEndpoint && !isLocalEndpoint)
    || url.username
    || url.password
    || url.pathname !== UNSUBSCRIBE_API_PATH
    || url.hash
  ) {
    throw new TypeError('Reminder unsubscribe endpoint is not allowlisted')
  }
}

function requireReminderToken(value: unknown) {
  if (typeof value !== 'string' || !REMINDER_TOKEN_PATTERN.test(value)) {
    throw new TypeError('Reminder unsubscribe token is invalid')
  }
  return value
}

export function normalizeReminderLocale(value: unknown): ReminderLocale {
  return REMINDER_LOCALES.includes(value as ReminderLocale)
    ? value as ReminderLocale
    : 'en'
}

export async function createReminderUnsubscribeToken(
  deliveryId: string,
  secretMaterial: string | Uint8Array,
) {
  if (!UUID_PATTERN.test(deliveryId)) {
    throw new TypeError('Reminder delivery ID is invalid')
  }
  const secretBytes = typeof secretMaterial === 'string'
    ? new TextEncoder().encode(secretMaterial)
    : secretMaterial
  if (!(secretBytes instanceof Uint8Array) || secretBytes.byteLength < 32) {
    throw new TypeError('Reminder unsubscribe secret must contain at least 32 bytes')
  }
  const keyMaterial = new Uint8Array(secretBytes.byteLength)
  keyMaterial.set(secretBytes)

  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const message = new TextEncoder().encode(
    `edenia-reminder-unsubscribe-v1:${deliveryId.toLowerCase()}`,
  )
  const signature = await crypto.subtle.sign('HMAC', key, message)
  return encodeBase64Url(new Uint8Array(signature))
}

export async function digestReminderUnsubscribeToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(requireReminderToken(token)),
  )
  return new Uint8Array(digest)
}

export function createReminderUnsubscribeApiUrl(
  endpointUrl: string,
  token: string,
  locale: ReminderLocale,
) {
  const url = new URL(validateReminderUnsubscribeEndpointUrl(endpointUrl))
  url.searchParams.set('token', requireReminderToken(token))
  url.searchParams.set('lang', normalizeReminderLocale(locale))
  return validateReminderUnsubscribeApiUrl(url.href)
}

export function validateReminderUnsubscribeEndpointUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Reminder unsubscribe endpoint is invalid')
  }
  assertUnsubscribeEndpoint(url)
  if (url.search) {
    throw new TypeError('Reminder unsubscribe endpoint must not include a query')
  }
  return url.href
}

export function validateReminderUnsubscribeApiUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Reminder unsubscribe API URL is invalid')
  }
  assertUnsubscribeEndpoint(url)
  const keys = [...url.searchParams.keys()]
  if (
    keys.length !== 2
    || url.searchParams.getAll('token').length !== 1
    || url.searchParams.getAll('lang').length !== 1
    || !keys.every(key => key === 'token' || key === 'lang')
  ) {
    throw new TypeError('Reminder unsubscribe API URL has invalid parameters')
  }
  requireReminderToken(url.searchParams.get('token'))
  const locale = url.searchParams.get('lang')
  if (normalizeReminderLocale(locale) !== locale) {
    throw new TypeError('Reminder unsubscribe API URL has an invalid locale')
  }
  return url.href
}

export function createReminderUnsubscribePageUrl(
  pageUrl: string,
  token: string,
  locale: ReminderLocale,
) {
  const url = new URL(validateReminderUnsubscribePageBaseUrl(pageUrl))
  url.searchParams.set('token', requireReminderToken(token))
  url.searchParams.set('lang', normalizeReminderLocale(locale))
  return url.href
}

export function validateReminderUnsubscribePageBaseUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Reminder unsubscribe page URL is invalid')
  }
  if (
    !ALLOWED_UNSUBSCRIBE_PAGE_URLS.has(url.href)
    || url.username
    || url.password
    || url.hash
    || url.search
  ) {
    throw new TypeError('Reminder unsubscribe page is not allowlisted')
  }
  return url.href
}

export function validateReminderAppUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Reminder app URL is invalid')
  }
  if (!ALLOWED_APP_URLS.has(url.href)) {
    throw new TypeError('Reminder app URL is not allowlisted')
  }
  return url.href
}

function requireUnsubscribePageUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Reminder unsubscribe page URL is invalid')
  }
  const keys = [...url.searchParams.keys()]
  if (
    !ALLOWED_UNSUBSCRIBE_PAGE_URLS.has(`${url.origin}${url.pathname}`)
    || url.username
    || url.password
    || url.hash
    || keys.length !== 2
    || url.searchParams.getAll('token').length !== 1
    || url.searchParams.getAll('lang').length !== 1
    || !keys.every(key => key === 'token' || key === 'lang')
  ) {
    throw new TypeError('Reminder unsubscribe page URL has invalid parameters')
  }
  requireReminderToken(url.searchParams.get('token'))
  if (normalizeReminderLocale(url.searchParams.get('lang')) !== url.searchParams.get('lang')) {
    throw new TypeError('Reminder unsubscribe page URL has an invalid locale')
  }
  return url.href
}

export function renderReminderEmail({
  locale: requestedLocale,
  appUrl: requestedAppUrl,
  unsubscribePageUrl: requestedUnsubscribePageUrl,
}: {
  locale: ReminderLocale
  appUrl: string
  unsubscribePageUrl: string
}) {
  const locale = normalizeReminderLocale(requestedLocale)
  const copy = COPY[locale]
  const appUrl = validateReminderAppUrl(requestedAppUrl)
  const unsubscribePageUrl = requireUnsubscribePageUrl(
    requestedUnsubscribePageUrl,
  )
  const escapedAppUrl = escapeHtml(appUrl)
  const escapedUnsubscribeUrl = escapeHtml(unsubscribePageUrl)

  return Object.freeze({
    locale,
    subject: copy.subject,
    text: [
      copy.heading,
      '',
      copy.body,
      '',
      `${copy.cta}: ${appUrl}`,
      '',
      copy.consent,
      `${copy.unsubscribe}: ${unsubscribePageUrl}`,
    ].join('\n'),
    html: `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0;background:#f5f2e9;color:#24332b;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2e9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe7df;border-radius:16px;">
            <tr>
              <td style="padding:32px 28px;">
                <p style="margin:0 0 12px;color:#54705f;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Edenia</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;">${escapeHtml(copy.heading)}</h1>
                <p style="margin:0 0 24px;font-size:17px;line-height:1.6;">${escapeHtml(copy.body)}</p>
                <p style="margin:0 0 28px;">
                  <a href="${escapedAppUrl}" style="display:inline-block;border-radius:999px;background:#326b4b;color:#ffffff;padding:13px 22px;font-weight:700;text-decoration:none;">${escapeHtml(copy.cta)}</a>
                </p>
                <p style="margin:0 0 6px;color:#66736c;font-size:13px;line-height:1.5;">${escapeHtml(copy.consent)}</p>
                <p style="margin:0;color:#66736c;font-size:13px;line-height:1.5;">
                  <a href="${escapedUnsubscribeUrl}" style="color:#496855;">${escapeHtml(copy.unsubscribe)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  })
}
