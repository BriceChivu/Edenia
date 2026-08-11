import { withSupabase } from '@supabase/server'
import {
  handleReminderUnsubscribeRequest,
  reminderUnsubscribeUnavailableResponse,
} from '../_shared/reminder-unsubscribe.ts'
import type { ReminderUnsubscribeClient } from '../_shared/reminder-unsubscribe.ts'

Deno.serve(withSupabase(
  { auth: 'none', cors: false },
  async (request, context) => {
    try {
      return await handleReminderUnsubscribeRequest(
        request,
        context.supabaseAdmin as unknown as ReminderUnsubscribeClient,
      )
    } catch {
      console.error(JSON.stringify({
        event: 'reminder_unsubscribe_failed',
        reason: 'unexpected_error',
      }))
      return reminderUnsubscribeUnavailableResponse(request)
    }
  },
))
