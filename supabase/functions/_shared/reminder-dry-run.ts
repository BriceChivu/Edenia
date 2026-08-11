const CLAIM_BATCH_SIZE = 25
const DUE_WINDOW_SECONDS = 15 * 60
const LEASE_SECONDS = 2 * 60
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ALLOWED_LOCALES = new Set(['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'])

type RpcError = { message: string }
type RpcResult = PromiseLike<{ data: unknown; error: RpcError | null }>

export type ReminderDryRunClient = {
  rpc: (name: string, params?: Record<string, unknown>) => RpcResult
}

export type ReminderDryRunLog = Record<
  string,
  string | number | boolean
>

export type ReminderDryRunResult = {
  mode: 'dry_run'
  status: 'completed' | 'blocked'
  liveDeliveryEnabled: boolean
  claimed: number
  observed: number
  completionFailed: number
}

type ReminderClaim = {
  deliveryId: string
  claimToken: string
  userId: string
  scheduledLocalDate: string
  scheduledFor: string
  timezone: string
  locale: string
  consentVersion: string
  attemptCount: number
}

export class ReminderDryRunError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ReminderDryRunError'
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
    throw new ReminderDryRunError(
      `Reminder claim has an invalid ${field}`,
      500,
      'invalid_claim',
    )
  }
  return value
}

function parseReminderClaim(value: unknown): ReminderClaim {
  if (!isRecord(value)) {
    throw new ReminderDryRunError(
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
    throw new ReminderDryRunError(
      'Reminder claim failed validation',
      500,
      'invalid_claim',
    )
  }

  return {
    deliveryId,
    claimToken,
    userId,
    scheduledLocalDate,
    scheduledFor,
    timezone,
    locale,
    consentVersion,
    attemptCount: Number(attemptCount),
  }
}

async function readRpc(
  client: ReminderDryRunClient,
  name: string,
  params?: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, params)
  if (error) {
    throw new ReminderDryRunError(
      `Reminder database operation failed: ${name}`,
      503,
      'database_unavailable',
    )
  }
  return data
}

export async function readReminderDryRunRequest(
  request: Request,
  maximumBytes = 64,
) {
  if (request.method !== 'POST') {
    throw new ReminderDryRunError(
      'Method not allowed',
      405,
      'method_not_allowed',
    )
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/json') {
    throw new ReminderDryRunError(
      'Content-Type must be application/json',
      415,
      'unsupported_media_type',
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ReminderDryRunError(
      'Request body is too large',
      413,
      'request_too_large',
    )
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > maximumBytes) {
    throw new ReminderDryRunError(
      'Request body is too large',
      413,
      'request_too_large',
    )
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new ReminderDryRunError(
      'Malformed JSON body',
      400,
      'invalid_json',
    )
  }

  if (!isRecord(body) || Object.keys(body).length !== 0) {
    throw new ReminderDryRunError(
      'JSON body must be an empty object',
      400,
      'invalid_request',
    )
  }
}

export async function runReminderDryRun(
  client: ReminderDryRunClient,
  log: (entry: ReminderDryRunLog) => void,
): Promise<ReminderDryRunResult> {
  const liveDeliveryEnabled = await readRpc(
    client,
    'reminder_delivery_is_enabled',
  )
  if (typeof liveDeliveryEnabled !== 'boolean') {
    throw new ReminderDryRunError(
      'Reminder delivery switch returned an invalid result',
      503,
      'database_unavailable',
    )
  }

  if (liveDeliveryEnabled) {
    log({
      event: 'reminder_dry_run_blocked',
      reason: 'live_delivery_enabled',
    })
    return {
      mode: 'dry_run',
      status: 'blocked',
      liveDeliveryEnabled: true,
      claimed: 0,
      observed: 0,
      completionFailed: 0,
    }
  }

  const rawClaims = await readRpc(client, 'claim_due_reminder_deliveries', {
    p_batch_size: CLAIM_BATCH_SIZE,
    p_due_window_seconds: DUE_WINDOW_SECONDS,
    p_lease_seconds: LEASE_SECONDS,
  })
  if (!Array.isArray(rawClaims)) {
    throw new ReminderDryRunError(
      'Reminder claims returned an invalid result',
      503,
      'database_unavailable',
    )
  }
  const claims = rawClaims.map(parseReminderClaim)

  let observed = 0
  let completionFailed = 0
  for (const claim of claims) {
    log({
      event: 'reminder_dry_run_intended',
      delivery_id: claim.deliveryId,
      user_id: claim.userId,
      scheduled_local_date: claim.scheduledLocalDate,
      scheduled_for: claim.scheduledFor,
      timezone: claim.timezone,
      locale: claim.locale,
      consent_version: claim.consentVersion,
      attempt_count: claim.attemptCount,
    })

    const completion = await client.rpc('complete_reminder_dry_run', {
      p_claim_token: claim.claimToken,
    })
    if (completion.error || completion.data !== true) {
      completionFailed += 1
      log({
        event: 'reminder_dry_run_completion_failed',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        reason: completion.error ? 'database_error' : 'lease_not_completed',
      })
      continue
    }
    observed += 1
  }

  log({
    event: 'reminder_dry_run_summary',
    claimed: claims.length,
    observed,
    completion_failed: completionFailed,
    live_delivery_enabled: false,
  })
  return {
    mode: 'dry_run',
    status: 'completed',
    liveDeliveryEnabled: false,
    claimed: claims.length,
    observed,
    completionFailed,
  }
}
