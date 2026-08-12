import { withSupabase } from '@supabase/server'
import {
  readReminderDispatchRequest,
} from '../_shared/reminder-dry-run.ts'
import { ReminderDispatchError } from '../_shared/reminder-delivery-claim.ts'
import { runReminderDispatcher } from '../_shared/reminder-dispatcher.ts'
import type { ReminderLiveClient } from '../_shared/reminder-live.ts'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(withSupabase(
  { auth: 'secret:default' },
  async (request, context) => {
    try {
      await readReminderDispatchRequest(request)
      const result = await runReminderDispatcher(
        context.supabaseAdmin as unknown as ReminderLiveClient,
        name => Deno.env.get(name),
        entry => console.info(JSON.stringify(entry)),
      )
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
      const status = result.status === 'completed'
        ? 200
        : result.mode === 'dry_run' ? 409 : 503
      return jsonResponse(body, status)
    } catch (error) {
      const code = error instanceof ReminderDispatchError
        ? error.code
        : 'internal_error'
      const status = error instanceof ReminderDispatchError
        ? error.status
        : 500
      const message = error instanceof ReminderDispatchError && status < 500
        ? error.message
        : 'Reminder dispatcher unavailable'
      console.error(JSON.stringify({
        event: 'reminder_dispatch_failed',
        code,
      }))
      return jsonResponse({
        error: message,
        code,
      }, status)
    }
  },
))
