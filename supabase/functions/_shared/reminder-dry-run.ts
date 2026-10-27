import {
  readReminderDeliveryEnabled,
  readReminderRpc,
  ReminderDispatchError,
} from './reminder-delivery-claim.ts'
import type { ReminderDeliveryClient } from './reminder-delivery-claim.ts'

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

  const evaluation = await readReminderRpc(client, 'evaluate_reminder_shadow')
  if (!Array.isArray(evaluation)) {
    throw new ReminderDispatchError('Reminder preview returned an invalid result', 503, 'database_unavailable')
  }
  let observed = 0
  for (const row of evaluation) {
    if (!isRecord(row) || !['streak', 'discovery'].includes(String(row.email_type))
      || !Number.isSafeInteger(Number(row.candidate_count)) || Number(row.candidate_count) < 0) {
      throw new ReminderDispatchError('Reminder preview returned an invalid count', 503, 'database_unavailable')
    }
    observed += Number(row.candidate_count)
    log({ event: 'reminder_shadow_candidates', email_type: String(row.email_type), count: Number(row.candidate_count) })
  }
  log({ event: 'reminder_dry_run_summary', claimed: 0, observed,
    completion_failed: 0, live_delivery_enabled: false })
  return { mode: 'dry_run', status: 'completed', liveDeliveryEnabled: false,
    claimed: 0, observed, completionFailed: 0 }
}
