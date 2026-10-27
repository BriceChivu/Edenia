import { withSupabase } from '@supabase/server'
import { handleReminderDispatcherRequest } from '../_shared/reminder-dispatcher-handler.ts'
import type { ReminderLiveClient } from '../_shared/reminder-live.ts'

Deno.serve(withSupabase(
  { auth: 'secret:reminder_dispatcher' },
  (request, context) => handleReminderDispatcherRequest(
    request,
    context.supabaseAdmin as unknown as ReminderLiveClient,
    name => Deno.env.get(name),
    entry => {
      if (entry.event === 'reminder_dispatch_failed') console.error(JSON.stringify(entry))
      else console.info(JSON.stringify(entry))
    },
  ),
))
