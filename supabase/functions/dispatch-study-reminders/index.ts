import { withSupabase } from '@supabase/server'
import {
  readReminderDryRunRequest,
  ReminderDryRunError,
  runReminderDryRun,
} from '../_shared/reminder-dry-run.ts'
import type { ReminderDryRunClient } from '../_shared/reminder-dry-run.ts'

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
      await readReminderDryRunRequest(request)
      const result = await runReminderDryRun(
        context.supabaseAdmin as unknown as ReminderDryRunClient,
        entry => console.info(JSON.stringify(entry)),
      )
      return jsonResponse({
        mode: result.mode,
        status: result.status,
        live_delivery_enabled: result.liveDeliveryEnabled,
        claimed: result.claimed,
        observed: result.observed,
        completion_failed: result.completionFailed,
      }, result.status === 'blocked' ? 409 : 200)
    } catch (error) {
      const code = error instanceof ReminderDryRunError
        ? error.code
        : 'internal_error'
      const status = error instanceof ReminderDryRunError
        ? error.status
        : 500
      const message = error instanceof ReminderDryRunError && status < 500
        ? error.message
        : 'Reminder dry run unavailable'
      console.error(JSON.stringify({
        event: 'reminder_dry_run_failed',
        code,
      }))
      return jsonResponse({
        error: message,
        code,
      }, status)
    }
  },
))
