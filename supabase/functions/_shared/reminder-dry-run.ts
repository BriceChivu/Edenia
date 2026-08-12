import {
  parseTypedReminderDryRunClaim,
  readReminderDeliveryEnabled,
  readReminderRpc,
  ReminderDispatchError,
} from './reminder-delivery-claim.ts'
import type { ReminderDeliveryClient } from './reminder-delivery-claim.ts'

const CLAIM_BATCH_SIZE = 25
const DUE_WINDOW_SECONDS = 15 * 60
const LEASE_SECONDS = 2 * 60

export { ReminderDispatchError as ReminderDryRunError }
export type ReminderDryRunClient = ReminderDeliveryClient

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function readReminderDispatchRequest(
  request: Request,
  maximumBytes = 64,
) {
  if (request.method !== 'POST') {
    throw new ReminderDispatchError(
      'Method not allowed',
      405,
      'method_not_allowed',
    )
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/json') {
    throw new ReminderDispatchError(
      'Content-Type must be application/json',
      415,
      'unsupported_media_type',
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ReminderDispatchError(
      'Request body is too large',
      413,
      'request_too_large',
    )
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > maximumBytes) {
    throw new ReminderDispatchError(
      'Request body is too large',
      413,
      'request_too_large',
    )
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new ReminderDispatchError(
      'Malformed JSON body',
      400,
      'invalid_json',
    )
  }

  if (!isRecord(body) || Object.keys(body).length !== 0) {
    throw new ReminderDispatchError(
      'JSON body must be an empty object',
      400,
      'invalid_request',
    )
  }
}

export const readReminderDryRunRequest = readReminderDispatchRequest

export async function runReminderDryRun(
  client: ReminderDryRunClient,
  log: (entry: ReminderDryRunLog) => void,
): Promise<ReminderDryRunResult> {
  const liveDeliveryEnabled = await readReminderDeliveryEnabled(client)

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

  const rawClaims = await readReminderRpc(
    client,
    'claim_due_typed_reminder_dry_runs',
    {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_due_window_seconds: DUE_WINDOW_SECONDS,
      p_lease_seconds: LEASE_SECONDS,
    },
  )
  if (!Array.isArray(rawClaims)) {
    throw new ReminderDispatchError(
      'Reminder claims returned an invalid result',
      503,
      'database_unavailable',
    )
  }
  const claims = rawClaims.map(parseTypedReminderDryRunClaim)

  let observed = 0
  let completionFailed = 0
  for (const claim of claims) {
    const completion = await client.rpc('complete_typed_reminder_dry_run', {
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

    const intendedLog: ReminderDryRunLog = {
      event: 'reminder_dry_run_intended',
      delivery_id: claim.deliveryId,
      user_id: claim.userId,
      scheduled_local_date: claim.scheduledLocalDate,
      scheduled_for: claim.scheduledFor,
      timezone: claim.timezone,
      locale: claim.locale,
      consent_version: claim.consentVersion,
      attempt_count: claim.attemptCount,
      email_type: claim.emailType,
    }
    if (claim.learningLanguage !== null) {
      intendedLog.learning_language = claim.learningLanguage
    }
    if (claim.channelId !== null) intendedLog.channel_id = claim.channelId
    if (claim.channelName !== null) intendedLog.channel_name = claim.channelName
    if (claim.channelSummary !== null) {
      intendedLog.channel_summary = claim.channelSummary
    }
    if (claim.videoId !== null) intendedLog.video_id = claim.videoId
    if (claim.videoTitle !== null) intendedLog.video_title = claim.videoTitle
    if (claim.videoPublishedAt !== null) {
      intendedLog.video_published_at = claim.videoPublishedAt
    }
    log(intendedLog)
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
