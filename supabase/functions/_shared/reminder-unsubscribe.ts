import {
  digestReminderUnsubscribeToken,
  normalizeReminderLocale,
} from './reminder-email.ts'
import type { ReminderLocale } from './reminder-email.ts'

const MAXIMUM_BODY_BYTES = 512
const REMINDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

type RpcError = { message: string }
type RpcResult = PromiseLike<{ data: unknown; error: RpcError | null }>

export type ReminderUnsubscribeClient = {
  rpc: (name: string, params?: Record<string, unknown>) => RpcResult
}

type PageCopy = {
  confirmTitle: string
  confirmBody: string
  confirmButton: string
  successTitle: string
  successBody: string
  alreadyTitle: string
  alreadyBody: string
  invalidTitle: string
  invalidBody: string
  unavailableTitle: string
  unavailableBody: string
}

const COPY: Readonly<Record<ReminderLocale, PageCopy>> = Object.freeze({
  en: Object.freeze({
    confirmTitle: 'Stop study reminders?',
    confirmBody: 'Edenia will stop sending reminder emails to this account. Your local study progress will stay on this device.',
    confirmButton: 'Stop reminders',
    successTitle: 'Study reminders stopped',
    successBody: 'You will no longer receive Edenia study reminder emails. Your local study progress was not changed.',
    alreadyTitle: 'Reminders are already stopped',
    alreadyBody: 'This unsubscribe link has already been used. Your local study progress was not changed.',
    invalidTitle: 'This link is not available',
    invalidBody: 'The unsubscribe link is invalid or incomplete. You can also turn reminders off in Edenia Settings.',
    unavailableTitle: 'Please try again later',
    unavailableBody: 'Edenia could not update your reminder preference right now. No study progress was changed.',
  }),
  'zh-Hant': Object.freeze({
    confirmTitle: '停止學習提醒嗎？',
    confirmBody: 'Edenia 將停止向此帳號傳送提醒電子郵件。這台裝置上的本機學習進度會保持不變。',
    confirmButton: '停止提醒',
    successTitle: '學習提醒已停止',
    successBody: '你將不再收到 Edenia 的學習提醒電子郵件。本機學習進度沒有變更。',
    alreadyTitle: '提醒已經停止',
    alreadyBody: '此取消訂閱連結已使用過。本機學習進度沒有變更。',
    invalidTitle: '此連結無法使用',
    invalidBody: '取消訂閱連結無效或不完整。你也可以在 Edenia 設定中關閉提醒。',
    unavailableTitle: '請稍後再試',
    unavailableBody: 'Edenia 目前無法更新你的提醒偏好。學習進度沒有變更。',
  }),
  'zh-Hans': Object.freeze({
    confirmTitle: '停止学习提醒吗？',
    confirmBody: 'Edenia 将停止向此账号发送提醒邮件。这台设备上的本地学习进度会保持不变。',
    confirmButton: '停止提醒',
    successTitle: '学习提醒已停止',
    successBody: '你将不再收到 Edenia 的学习提醒邮件。本地学习进度没有更改。',
    alreadyTitle: '提醒已经停止',
    alreadyBody: '此取消订阅链接已使用过。本地学习进度没有更改。',
    invalidTitle: '此链接无法使用',
    invalidBody: '取消订阅链接无效或不完整。你也可以在 Edenia 设置中关闭提醒。',
    unavailableTitle: '请稍后再试',
    unavailableBody: 'Edenia 目前无法更新你的提醒偏好。学习进度没有更改。',
  }),
  es: Object.freeze({
    confirmTitle: '¿Dejar de recibir recordatorios?',
    confirmBody: 'Edenia dejará de enviar correos de recordatorio a esta cuenta. Tu progreso de estudio local permanecerá en este dispositivo.',
    confirmButton: 'Detener los recordatorios',
    successTitle: 'Recordatorios detenidos',
    successBody: 'Ya no recibirás correos de recordatorio de Edenia. Tu progreso de estudio local no ha cambiado.',
    alreadyTitle: 'Los recordatorios ya estaban detenidos',
    alreadyBody: 'Este enlace para cancelar la suscripción ya se utilizó. Tu progreso de estudio local no ha cambiado.',
    invalidTitle: 'Este enlace no está disponible',
    invalidBody: 'El enlace es inválido o está incompleto. También puedes desactivar los recordatorios en los ajustes de Edenia.',
    unavailableTitle: 'Inténtalo de nuevo más tarde',
    unavailableBody: 'Edenia no pudo actualizar tu preferencia ahora. No se modificó tu progreso de estudio.',
  }),
  fr: Object.freeze({
    confirmTitle: 'Arrêter les rappels d’étude ?',
    confirmBody: 'Edenia cessera d’envoyer des e-mails de rappel à ce compte. Votre progression locale restera sur cet appareil.',
    confirmButton: 'Arrêter les rappels',
    successTitle: 'Rappels d’étude arrêtés',
    successBody: 'Vous ne recevrez plus d’e-mails de rappel Edenia. Votre progression locale n’a pas été modifiée.',
    alreadyTitle: 'Les rappels sont déjà arrêtés',
    alreadyBody: 'Ce lien de désabonnement a déjà été utilisé. Votre progression locale n’a pas été modifiée.',
    invalidTitle: 'Ce lien n’est pas disponible',
    invalidBody: 'Le lien est invalide ou incomplet. Vous pouvez aussi désactiver les rappels dans les réglages Edenia.',
    unavailableTitle: 'Veuillez réessayer plus tard',
    unavailableBody: 'Edenia ne peut pas modifier vos préférences pour le moment. Votre progression n’a pas été modifiée.',
  }),
})

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
})

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function pageResponse({
  locale,
  title,
  body,
  status = 200,
  form,
  allow,
}: {
  locale: ReminderLocale
  title: string
  body: string
  status?: number
  form?: { token: string; label: string }
  allow?: string
}) {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Content-Language': locale,
    'Content-Type': 'text/html; charset=utf-8',
  })
  if (allow) headers.set('Allow', allow)
  const formMarkup = form
    ? `<form method="post" action="unsubscribe-study-reminders">
          <input type="hidden" name="token" value="${escapeHtml(form.token)}">
          <input type="hidden" name="lang" value="${escapeHtml(locale)}">
          <button type="submit">${escapeHtml(form.label)}</button>
        </form>`
    : ''

  return new Response(`<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} · Edenia</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #f5f2e9; color: #24332b; }
      main { width: min(100%, 560px); padding: clamp(28px, 6vw, 48px); border: 1px solid #d9e3da; border-radius: 22px; background: #fff; box-shadow: 0 18px 55px rgba(36, 51, 43, .1); }
      .brand { margin: 0 0 12px; color: #54705f; font-size: .82rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
      h1 { margin: 0 0 16px; font-size: clamp(1.75rem, 6vw, 2.35rem); line-height: 1.15; }
      p { margin: 0; color: #526158; font-size: 1rem; line-height: 1.65; }
      form { margin-top: 28px; }
      button { width: 100%; min-height: 48px; border: 0; border-radius: 999px; padding: 12px 20px; background: #326b4b; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
      button:hover { background: #27573d; }
      button:focus-visible { outline: 3px solid #e2a847; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <p class="brand">Edenia</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      ${formMarkup}
    </main>
  </body>
</html>`, { status, headers })
}

function invalidResponse(locale: ReminderLocale, status = 400, allow?: string) {
  const copy = COPY[locale]
  return pageResponse({
    locale,
    title: copy.invalidTitle,
    body: copy.invalidBody,
    status,
    allow,
  })
}

function readToken(value: string | null) {
  return value && REMINDER_TOKEN_PATTERN.test(value) ? value : null
}

function hasExactParameters(
  params: URLSearchParams,
  names: readonly string[],
) {
  const keys = [...params.keys()]
  return keys.length === names.length
    && names.every(name => params.getAll(name).length === 1)
    && keys.every(name => names.includes(name))
}

function digestToPostgresBytea(digest: Uint8Array) {
  return `\\x${[...digest]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

async function readBoundedForm(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
    return { form: null, status: 415 }
  }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_BODY_BYTES) {
    return { form: null, status: 413 }
  }
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAXIMUM_BODY_BYTES) {
    return { form: null, status: 413 }
  }
  return { form: new URLSearchParams(rawBody), status: 200 }
}

async function consumeToken(
  token: string,
  locale: ReminderLocale,
  client: ReminderUnsubscribeClient,
) {
  const digest = await digestReminderUnsubscribeToken(token)
  const { data, error } = await client.rpc(
    'consume_reminder_unsubscribe_token',
    { p_token_digest: digestToPostgresBytea(digest) },
  )
  const copy = COPY[locale]

  if (error || !['unsubscribed', 'already_unsubscribed', 'invalid'].includes(String(data))) {
    return pageResponse({
      locale,
      title: copy.unavailableTitle,
      body: copy.unavailableBody,
      status: 503,
    })
  }
  if (data === 'unsubscribed') {
    return pageResponse({
      locale,
      title: copy.successTitle,
      body: copy.successBody,
    })
  }
  if (data === 'already_unsubscribed') {
    return pageResponse({
      locale,
      title: copy.alreadyTitle,
      body: copy.alreadyBody,
    })
  }
  return invalidResponse(locale)
}

export async function handleReminderUnsubscribeRequest(
  request: Request,
  client: ReminderUnsubscribeClient,
) {
  const url = new URL(request.url)
  const queryLocale = normalizeReminderLocale(url.searchParams.get('lang'))

  if (request.method === 'GET') {
    if (!hasExactParameters(url.searchParams, ['token', 'lang'])) {
      return invalidResponse(queryLocale)
    }
    const token = readToken(url.searchParams.get('token'))
    if (!token || url.searchParams.get('lang') !== queryLocale) {
      return invalidResponse(queryLocale)
    }
    const copy = COPY[queryLocale]
    return pageResponse({
      locale: queryLocale,
      title: copy.confirmTitle,
      body: copy.confirmBody,
      form: {
        token,
        label: copy.confirmButton,
      },
    })
  }

  if (request.method !== 'POST') {
    return invalidResponse(queryLocale, 405, 'GET, POST')
  }

  const formResult = await readBoundedForm(request)
  if (!formResult.form) {
    return invalidResponse(queryLocale, formResult.status)
  }
  const form = formResult.form

  const isOneClick = hasExactParameters(form, ['List-Unsubscribe'])
    && form.get('List-Unsubscribe') === 'One-Click'
  if (isOneClick) {
    if (
      !hasExactParameters(url.searchParams, ['token', 'lang'])
      || url.searchParams.get('lang') !== queryLocale
    ) {
      return invalidResponse(queryLocale)
    }
    const token = readToken(url.searchParams.get('token'))
    return token
      ? consumeToken(token, queryLocale, client)
      : invalidResponse(queryLocale)
  }

  if (url.search || !hasExactParameters(form, ['token', 'lang'])) {
    return invalidResponse(queryLocale)
  }
  const formLocale = normalizeReminderLocale(form.get('lang'))
  const token = readToken(form.get('token'))
  if (!token || form.get('lang') !== formLocale) {
    return invalidResponse(formLocale)
  }
  return consumeToken(token, formLocale, client)
}

export function reminderUnsubscribeUnavailableResponse() {
  const copy = COPY.en
  return pageResponse({
    locale: 'en',
    title: copy.unavailableTitle,
    body: copy.unavailableBody,
    status: 503,
  })
}
