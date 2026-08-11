export const REMINDER_PROVIDER_NAME = 'resend'
export const RESEND_REMINDER_SOURCE_TAG = 'edenia-study-reminder'

export const REMINDER_PROVIDER_EVENT_TYPES = Object.freeze([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.failed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
] as const)

export type ReminderProviderEventType =
  (typeof REMINDER_PROVIDER_EVENT_TYPES)[number]

const REMINDER_PROVIDER_EVENT_TYPE_SET = new Set<string>(
  REMINDER_PROVIDER_EVENT_TYPES,
)

export function isReminderProviderEventType(
  value: unknown,
): value is ReminderProviderEventType {
  return typeof value === 'string'
    && REMINDER_PROVIDER_EVENT_TYPE_SET.has(value)
}
