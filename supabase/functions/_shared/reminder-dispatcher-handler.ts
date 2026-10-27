import { checkReminderCapacity } from './reminder-capacity-check.ts'
import { ReminderDispatchError } from './reminder-delivery-claim.ts'
import { runReminderDispatcher } from './reminder-dispatcher.ts'
import { readReminderDispatchRequest } from './reminder-dry-run.ts'
import type { ReminderDryRunLog } from './reminder-dry-run.ts'
import type { ReminderEnvironmentReader } from './reminder-live-config.ts'
import type { ReminderLiveClient, ReminderLiveDependencies } from './reminder-live.ts'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  })
}

// Authentication stays in the Edge entrypoint's existing named-secret wrapper.
export async function handleReminderDispatcherRequest(
  request: Request,
  client: ReminderLiveClient,
  readEnvironment: ReminderEnvironmentReader,
  log: (entry: ReminderDryRunLog) => void,
  dependencies: ReminderLiveDependencies = {},
) {
  try {
    const action = await readReminderDispatchRequest(request)
    if (action === 'capacity-check') {
      return jsonResponse(await checkReminderCapacity(readEnvironment, dependencies.readCapacity))
    }
    const result = await runReminderDispatcher(client, readEnvironment, log, dependencies)
    const body = result.mode === 'dry_run'
      ? {
        mode: result.mode,
        status: result.status,
        live_delivery_enabled: result.liveDeliveryEnabled,
        claimed: result.claimed,
        observed: result.observed,
        completion_failed: result.completionFailed,
      }
      : {
        mode: result.mode,
        status: result.status,
        live_delivery_enabled: result.liveDeliveryEnabled,
        claimed: result.claimed,
        accepted: result.accepted,
        recipient_unavailable: result.recipientUnavailable,
        recipient_not_allowlisted: result.recipientNotAllowlisted,
        fenced: result.fenced,
        provider_deferred: result.providerDeferred,
        provider_blocked: result.providerBlocked,
        completion_failed: result.completionFailed,
      }
    const status = result.status === 'completed' ? 200 : result.mode === 'dry_run' ? 409 : 503
    return jsonResponse(body, status)
  } catch (error) {
    const code = error instanceof ReminderDispatchError ? error.code : 'internal_error'
    const status = error instanceof ReminderDispatchError ? error.status : 500
    const message = error instanceof ReminderDispatchError && status < 500
      ? error.message : 'Reminder dispatcher unavailable'
    log({ event: 'reminder_dispatch_failed', code })
    return jsonResponse({ error: message, code }, status)
  }
}
