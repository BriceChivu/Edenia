const REMINDER_LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'] as const
const REMINDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,}$/
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

type TypedReminderCopy = {
  streakSubject: string
  streakPreheader: string
  streakHeading: string
  streakBody: string
  streakVideo: (channel: string, video: string) => string
  streakCta: string
  discoverySubject: (channel: string) => string
  discoveryPreheader: (channel: string) => string
  discoveryHeading: string
  discoveryBody: (channel: string, summary: string) => string
  discoveryVideo: (video: string) => string
  discoveryCta: string
  consent: string
  unsubscribe: string
}

function defineTypedReminderCopy(copy: TypedReminderCopy) {
  return Object.freeze(copy)
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

const TYPED_COPY: Readonly<Record<ReminderLocale, TypedReminderCopy>> = Object.freeze({
  en: defineTypedReminderCopy({
    streakSubject: 'Keep your Edenia streak alive',
    streakPreheader: 'You still need a few points for today’s streak.',
    streakHeading: 'Your streak is waiting',
    streakBody: 'You still need a few points to keep today’s streak alive.',
    streakVideo: (channel, video) => `Try this new video from ${channel}: ${video}`,
    streakCta: 'Study with Edenia',
    discoverySubject: channel => `Discover ${channel} on Edenia`,
    discoveryPreheader: channel => `A channel you might enjoy: ${channel}.`,
    discoveryHeading: 'A channel you might enjoy',
    discoveryBody: (channel, summary) => `Another learner of your language follows ${channel}. ${summary}`,
    discoveryVideo: video => `Latest video: ${video}`,
    discoveryCta: 'Watch in Edenia',
    consent: 'You can change these email choices in your Edenia Account settings.',
    unsubscribe: 'Turn off Edenia emails',
  }),
  'zh-Hant': defineTypedReminderCopy({
    streakSubject: '繼續保持你的 Edenia 連續學習紀錄',
    streakPreheader: '你今天還差一些點數就能延續連續學習紀錄。',
    streakHeading: '你的連續學習紀錄等著你',
    streakBody: '你今天還需要一些點數，才能延續連續學習紀錄。',
    streakVideo: (channel, video) => `試試 ${channel} 的新影片：${video}`,
    streakCta: '前往 Edenia 學習',
    discoverySubject: channel => `在 Edenia 探索 ${channel}`,
    discoveryPreheader: channel => `你可能會喜歡這個頻道：${channel}。`,
    discoveryHeading: '你可能會喜歡的頻道',
    discoveryBody: (channel, summary) => `另一位學習相同語言的使用者正在追蹤 ${channel}。${summary}`,
    discoveryVideo: video => `最新影片：${video}`,
    discoveryCta: '在 Edenia 觀看',
    consent: '你可以在 Edenia 的「帳號」設定中更改電子郵件選項。',
    unsubscribe: '關閉 Edenia 電子郵件',
  }),
  'zh-Hans': defineTypedReminderCopy({
    streakSubject: '继续保持你的 Edenia 连续学习记录',
    streakPreheader: '你今天还差一些点数就能延续连续学习记录。',
    streakHeading: '你的连续学习记录等着你',
    streakBody: '你今天还需要一些点数，才能延续连续学习记录。',
    streakVideo: (channel, video) => `试试 ${channel} 的新视频：${video}`,
    streakCta: '前往 Edenia 学习',
    discoverySubject: channel => `在 Edenia 探索 ${channel}`,
    discoveryPreheader: channel => `你可能会喜欢这个频道：${channel}。`,
    discoveryHeading: '你可能会喜欢的频道',
    discoveryBody: (channel, summary) => `另一位学习相同语言的用户正在关注 ${channel}。${summary}`,
    discoveryVideo: video => `最新视频：${video}`,
    discoveryCta: '在 Edenia 观看',
    consent: '你可以在 Edenia 的“账号”设置中更改电子邮件选项。',
    unsubscribe: '关闭 Edenia 电子邮件',
  }),
  es: defineTypedReminderCopy({
    streakSubject: 'Mantén viva tu racha de Edenia',
    streakPreheader: 'Aún necesitas algunos puntos para la racha de hoy.',
    streakHeading: 'Tu racha te espera',
    streakBody: 'Aún necesitas algunos puntos para mantener viva la racha de hoy.',
    streakVideo: (channel, video) => `Prueba este vídeo nuevo de ${channel}: ${video}`,
    streakCta: 'Estudiar con Edenia',
    discoverySubject: channel => `Descubre ${channel} en Edenia`,
    discoveryPreheader: channel => `Un canal que podría gustarte: ${channel}.`,
    discoveryHeading: 'Un canal que podría gustarte',
    discoveryBody: (channel, summary) => `Otra persona que aprende tu idioma sigue a ${channel}. ${summary}`,
    discoveryVideo: video => `Último vídeo: ${video}`,
    discoveryCta: 'Ver en Edenia',
    consent: 'Puedes cambiar estas opciones de correo en los ajustes de tu cuenta de Edenia.',
    unsubscribe: 'Desactivar los correos de Edenia',
  }),
  fr: defineTypedReminderCopy({
    streakSubject: 'Gardez votre série Edenia en vie',
    streakPreheader: 'Il vous manque encore quelques points pour la série du jour.',
    streakHeading: 'Votre série vous attend',
    streakBody: 'Il vous manque encore quelques points pour maintenir votre série aujourd’hui.',
    streakVideo: (channel, video) => `Essayez cette nouvelle vidéo de ${channel} : ${video}`,
    streakCta: 'Étudier avec Edenia',
    discoverySubject: channel => `Découvrez ${channel} sur Edenia`,
    discoveryPreheader: channel => `Une chaîne qui pourrait vous plaire : ${channel}.`,
    discoveryHeading: 'Une chaîne qui pourrait vous plaire',
    discoveryBody: (channel, summary) => `Une autre personne qui apprend votre langue suit ${channel}. ${summary}`,
    discoveryVideo: video => `Dernière vidéo : ${video}`,
    discoveryCta: 'Regarder sur Edenia',
    consent: 'Vous pouvez modifier ces choix dans les réglages de votre compte Edenia.',
    unsubscribe: 'Désactiver les e-mails Edenia',
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

export function encodeReminderDigestForPostgres(digest: Uint8Array) {
  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
    throw new TypeError('Reminder token digest is invalid')
  }
  return `\\x${[...digest]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')}`
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

function requireTypedEmailText(
  value: unknown,
  label: string,
  maximumLength: number,
) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maximumLength
    || value.trim() !== value
    || /[\r\n]/u.test(value)
  ) {
    throw new TypeError(`Typed reminder ${label} is invalid`)
  }
  return value
}

export function createTypedReminderDestinationUrl({
  appUrl: requestedAppUrl,
  emailType,
  videoId,
  channelId,
}: {
  appUrl: string
  emailType: 'streak' | 'discovery'
  videoId: string | null
  channelId: string | null
}) {
  const appUrl = validateReminderAppUrl(requestedAppUrl)
  if (emailType !== 'streak' && emailType !== 'discovery') {
    throw new TypeError('Typed reminder email type is invalid')
  }
  if (videoId !== null && !VIDEO_ID_PATTERN.test(videoId)) {
    throw new TypeError('Typed reminder video ID is invalid')
  }
  if (channelId !== null && !CHANNEL_ID_PATTERN.test(channelId)) {
    throw new TypeError('Typed reminder channel ID is invalid')
  }
  if (
    emailType === 'discovery'
    && (videoId === null || channelId === null)
  ) {
    throw new TypeError('Discovery reminder destination is incomplete')
  }
  if (emailType === 'streak' && channelId !== null && videoId === null) {
    throw new TypeError('Streak reminder destination is incomplete')
  }

  const url = new URL(appUrl)
  url.searchParams.set('reminder', emailType)
  if (videoId !== null) url.searchParams.set('video', videoId)
  if (channelId !== null) url.searchParams.set('channel', channelId)
  return url.href
}

export function renderTypedReminderEmail({
  locale: requestedLocale,
  appUrl: requestedAppUrl,
  unsubscribePageUrl: requestedUnsubscribePageUrl,
  emailType,
  channelId = null,
  channelName = null,
  channelSummary = null,
  videoId = null,
  videoTitle = null,
}: {
  locale: ReminderLocale
  appUrl: string
  unsubscribePageUrl: string
  emailType: 'streak' | 'discovery'
  channelId?: string | null
  channelName?: string | null
  channelSummary?: string | null
  videoId?: string | null
  videoTitle?: string | null
}) {
  const locale = normalizeReminderLocale(requestedLocale)
  const copy = TYPED_COPY[locale]
  const hasVideo = videoId !== null
    || videoTitle !== null
    || channelId !== null
    || channelName !== null
  const completeVideo = videoId !== null
    && videoTitle !== null
    && channelId !== null
    && channelName !== null

  if (
    (emailType === 'streak' && hasVideo && !completeVideo)
    || (
      emailType === 'discovery'
      && (!completeVideo || channelSummary === null)
    )
    || (emailType !== 'streak' && emailType !== 'discovery')
  ) {
    throw new TypeError('Typed reminder payload is incomplete')
  }

  const safeChannelName = channelName === null
    ? null
    : requireTypedEmailText(channelName, 'channel name', 200)
  const safeChannelSummary = channelSummary === null
    ? null
    : requireTypedEmailText(channelSummary, 'channel summary', 300)
  const safeVideoTitle = videoTitle === null
    ? null
    : requireTypedEmailText(videoTitle, 'video title', 300)
  const destinationUrl = createTypedReminderDestinationUrl({
    appUrl: requestedAppUrl,
    emailType,
    videoId,
    channelId,
  })
  const unsubscribePageUrl = requireUnsubscribePageUrl(
    requestedUnsubscribePageUrl,
  )

  const subject = emailType === 'streak'
    ? copy.streakSubject
    : copy.discoverySubject(safeChannelName!)
  const preheader = emailType === 'streak'
    ? copy.streakPreheader
    : copy.discoveryPreheader(safeChannelName!)
  const heading = emailType === 'streak'
    ? copy.streakHeading
    : copy.discoveryHeading
  const body = emailType === 'streak'
    ? copy.streakBody
    : copy.discoveryBody(safeChannelName!, safeChannelSummary!)
  const videoLine = emailType === 'streak' && completeVideo
    ? copy.streakVideo(safeChannelName!, safeVideoTitle!)
    : emailType === 'discovery'
      ? copy.discoveryVideo(safeVideoTitle!)
      : null
  const cta = emailType === 'streak'
    ? copy.streakCta
    : copy.discoveryCta
  const escapedDestinationUrl = escapeHtml(destinationUrl)
  const escapedUnsubscribeUrl = escapeHtml(unsubscribePageUrl)

  return Object.freeze({
    locale,
    emailType,
    destinationUrl,
    subject,
    text: [
      heading,
      '',
      body,
      ...(videoLine ? ['', videoLine] : []),
      '',
      `${cta}: ${destinationUrl}`,
      '',
      copy.consent,
      `${copy.unsubscribe}: ${unsubscribePageUrl}`,
    ].join('\n'),
    html: `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f5f2e9;color:#24332b;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2e9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe7df;border-radius:16px;">
            <tr>
              <td style="padding:32px 28px;">
                <p style="margin:0 0 12px;color:#54705f;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Edenia</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;">${escapeHtml(heading)}</h1>
                <p style="margin:0 0 16px;font-size:17px;line-height:1.6;">${escapeHtml(body)}</p>
                ${videoLine ? `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;font-weight:700;">${escapeHtml(videoLine)}</p>` : ''}
                <p style="margin:0 0 28px;">
                  <a href="${escapedDestinationUrl}" style="display:inline-block;border-radius:999px;background:#326b4b;color:#ffffff;padding:13px 22px;font-weight:700;text-decoration:none;">${escapeHtml(cta)}</a>
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
