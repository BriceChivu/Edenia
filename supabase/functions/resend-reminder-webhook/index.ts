import { createClient } from '@supabase/supabase-js'

import {
  handleReminderProviderWebhook,
  reminderProviderWebhookUnavailableResponse,
} from '../_shared/reminder-provider-webhook.ts'
import type {
  ReminderProviderEventInput,
  ReminderProviderEventResult,
} from '../_shared/reminder-provider-webhook.ts'

const RESULT_VALUES = new Set<ReminderProviderEventResult>([
  'recorded',
  'suppressed',
  'duplicate',
  'unmatched',
  'invalid',
  'event_conflict',
])

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

async function recordEvent(
  input: ReminderProviderEventInput,
): Promise<ReminderProviderEventResult> {
  const { data, error } = await supabase.rpc(
    'record_reminder_provider_event',
    {
      p_provider_name: input.providerName,
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_delivery_id: input.deliveryId,
      p_provider_message_id: input.providerMessageId,
      p_event_created_at: input.eventCreatedAt,
    },
  )
  if (error || typeof data !== 'string' || !RESULT_VALUES.has(data as ReminderProviderEventResult)) {
    throw new Error('Reminder provider event persistence failed')
  }
  return data as ReminderProviderEventResult
}

Deno.serve(async request => {
  try {
    return await handleReminderProviderWebhook(request, {
      webhookSecret: Deno.env.get('RESEND_WEBHOOK_SECRET'),
      recordEvent,
      log: entry => console.info(JSON.stringify(entry)),
    })
  } catch {
    console.info(JSON.stringify({
      component: 'resend_reminder_webhook',
      outcome: 'unexpected_failure',
    }))
    return reminderProviderWebhookUnavailableResponse()
  }
})
