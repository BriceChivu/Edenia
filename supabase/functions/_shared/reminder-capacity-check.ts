import { ReminderDispatchError } from './reminder-delivery-claim.ts'
import { readReminderLiveConfig } from './reminder-live-config.ts'
import type { ReminderEnvironmentReader } from './reminder-live-config.ts'
import { readResendReminderCapacity } from './resend-reminder-capacity.ts'

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

// This operator preflight intentionally has no database client, send adapter or
// attestation call. A valid usage response is not evidence of billing settings.
export async function checkReminderCapacity(
  readEnvironment: ReminderEnvironmentReader,
  readCapacity = readResendReminderCapacity,
) {
  const config = readReminderLiveConfig(readEnvironment)
  const capacity = await readCapacity(config.resendApiKey)
  if (!capacity) {
    throw new ReminderDispatchError(
      'Reminder provider capacity is unavailable',
      503,
      'provider_capacity_unknown',
    )
  }
  const senderAddress = config.fromAddress.match(/<([^<>]+)>$/u)?.[1] ?? config.fromAddress
  return {
    mode: 'capacity_check',
    status: 'completed',
    provider: 'resend',
    admission_mode: config.admissionMode,
    api_key_sha256: await sha256(config.resendApiKey),
    sender_sha256: await sha256(config.fromAddress),
    sender_domain: senderAddress.slice(senderAddress.lastIndexOf('@') + 1).toLowerCase(),
    daily: { used: capacity.dailyUsed, limit: 100, resets_at: capacity.dailyResetsAt },
    monthly: { used: capacity.monthlyUsed, limit: 3000, resets_at: capacity.monthlyResetsAt },
    observed_at: capacity.observedAt,
  }
}
