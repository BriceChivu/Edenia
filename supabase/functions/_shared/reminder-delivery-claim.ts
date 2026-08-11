const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const ALLOWED_LOCALES = new Set(['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'])

type RpcError = { message: string }
type RpcResult = PromiseLike<{ data: unknown; error: RpcError | null }>

export type ReminderDeliveryClient = {
  rpc: (name: string, params?: Record<string, unknown>) => RpcResult
}

export type ReminderDeliveryClaim = Readonly<{
  deliveryId: string
  claimToken: string
  userId: string
  scheduledLocalDate: string
  scheduledFor: string
  timezone: string
  locale: 'en' | 'zh-Hant' | 'zh-Hans' | 'es' | 'fr'
  consentVersion: string
  attemptCount: number
}>

export class ReminderDispatchError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ReminderDispatchError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readBoundedString(
  value: unknown,
  field: string,
  maximumLength: number,
) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maximumLength
  ) {
    throw new ReminderDispatchError(
      `Reminder claim has an invalid ${field}`,
      500,
      'invalid_claim',
    )
  }
  return value
}

export function parseReminderDeliveryClaim(
  value: unknown,
): ReminderDeliveryClaim {
  if (!isRecord(value)) {
    throw new ReminderDispatchError(
      'Reminder claim is not an object',
      500,
      'invalid_claim',
    )
  }

  const deliveryId = readBoundedString(value.delivery_id, 'delivery ID', 36)
  const claimToken = readBoundedString(value.claim_token, 'claim token', 36)
  const userId = readBoundedString(value.user_id, 'user ID', 36)
  const scheduledLocalDate = readBoundedString(
    value.scheduled_local_date,
    'local date',
    10,
  )
  const scheduledFor = readBoundedString(
    value.scheduled_for,
    'scheduled instant',
    40,
  )
  const timezone = readBoundedString(value.timezone, 'timezone', 100)
  const locale = readBoundedString(value.locale, 'locale', 12)
  const consentVersion = readBoundedString(
    value.consent_version,
    'consent version',
    80,
  )
  const attemptCount = value.attempt_count

  if (
    !UUID_PATTERN.test(deliveryId)
    || !UUID_PATTERN.test(claimToken)
    || !UUID_PATTERN.test(userId)
    || !LOCAL_DATE_PATTERN.test(scheduledLocalDate)
    || !Number.isFinite(Date.parse(scheduledFor))
    || !ALLOWED_LOCALES.has(locale)
    || !Number.isSafeInteger(attemptCount)
    || Number(attemptCount) < 1
  ) {
    throw new ReminderDispatchError(
      'Reminder claim failed validation',
      500,
      'invalid_claim',
    )
  }

  return Object.freeze({
    deliveryId,
    claimToken,
    userId,
    scheduledLocalDate,
    scheduledFor,
    timezone,
    locale: locale as ReminderDeliveryClaim['locale'],
    consentVersion,
    attemptCount: Number(attemptCount),
  })
}

export async function readReminderRpc(
  client: ReminderDeliveryClient,
  name: string,
  params?: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, params)
  if (error) {
    throw new ReminderDispatchError(
      `Reminder database operation failed: ${name}`,
      503,
      'database_unavailable',
    )
  }
  return data
}

export async function readReminderDeliveryEnabled(
  client: ReminderDeliveryClient,
) {
  const enabled = await readReminderRpc(
    client,
    'reminder_delivery_is_enabled',
  )
  if (typeof enabled !== 'boolean') {
    throw new ReminderDispatchError(
      'Reminder delivery switch returned an invalid result',
      503,
      'database_unavailable',
    )
  }
  return enabled
}
