import { normalizeCheckoutEmail } from './checkout-identity.ts'
import {
  validateReminderAppUrl,
  validateReminderUnsubscribeEndpointUrl,
  validateReminderUnsubscribePageBaseUrl,
} from './reminder-email.ts'
import { ReminderDispatchError } from './reminder-delivery-claim.ts'
import { validateResendReminderConfiguration } from './resend-reminder-adapter.ts'

const UNSUBSCRIBE_API_PATH = '/functions/v1/unsubscribe-study-reminders'
const MINIMUM_SECRET_BYTES = 32
const MAXIMUM_SECRET_BYTES = 1024

export type ReminderLiveConfig = Readonly<{
  resendApiKey: string
  fromAddress: string
  unsubscribeSecret: string
  appUrl: string
  unsubscribeEndpointUrl: string
  unsubscribePageUrl: string
  allowedRecipientEmails: readonly string[] | null
  admissionMode: 'canary' | 'public'
  unsubscribeKeyVersion: string
}>

export type ReminderEnvironmentReader = (name: string) => string | undefined

function requireEnvironmentValue(
  readEnvironment: ReminderEnvironmentReader,
  name: string,
) {
  const value = readEnvironment(name)
  if (typeof value !== 'string' || value.length < 1 || value.trim() !== value) {
    throw new TypeError('Required reminder environment value is unavailable')
  }
  return value
}

export function readReminderLiveConfig(
  readEnvironment: ReminderEnvironmentReader,
): ReminderLiveConfig {
  try {
    const provider = validateResendReminderConfiguration({
      apiKey: requireEnvironmentValue(readEnvironment, 'RESEND_API_KEY'),
      from: requireEnvironmentValue(readEnvironment, 'REMINDER_FROM_ADDRESS'),
    })
    const unsubscribeSecret = requireEnvironmentValue(
      readEnvironment,
      'REMINDER_UNSUBSCRIBE_SECRET',
    )
    const secretLength = new TextEncoder().encode(unsubscribeSecret).byteLength
    if (
      secretLength < MINIMUM_SECRET_BYTES
      || secretLength > MAXIMUM_SECRET_BYTES
    ) {
      throw new TypeError('Reminder unsubscribe secret length is invalid')
    }

    const appUrl = validateReminderAppUrl(requireEnvironmentValue(
      readEnvironment,
      'REMINDER_APP_URL',
    ))
    const unsubscribePageUrl = validateReminderUnsubscribePageBaseUrl(
      requireEnvironmentValue(
        readEnvironment,
        'REMINDER_UNSUBSCRIBE_PAGE_URL',
      ),
    )
    const supabaseUrl = requireEnvironmentValue(readEnvironment, 'SUPABASE_URL')
    const unsubscribeEndpointUrl = validateReminderUnsubscribeEndpointUrl(
      new URL(UNSUBSCRIBE_API_PATH, supabaseUrl).href,
    )
    const rawMode = readEnvironment('REMINDER_ADMISSION_MODE') ?? 'canary'
    if (rawMode !== 'canary' && rawMode !== 'public') throw new TypeError('Reminder admission mode is invalid')
    const admissionMode = rawMode
    const unsubscribeKeyVersion = requireEnvironmentValue(readEnvironment, 'REMINDER_UNSUBSCRIBE_KEY_VERSION')
    if (!/^[a-zA-Z0-9._-]{1,80}$/u.test(unsubscribeKeyVersion)) throw new TypeError('Reminder key version is invalid')
    // Retain the deployed secret name and single-address compatibility. Bound
    // additional approved recipients without switching to public admission.
    const allowedRecipientEmails = admissionMode === 'canary' ? Object.freeze(
      requireEnvironmentValue(readEnvironment, 'REMINDER_LIVE_RECIPIENT_EMAIL')
        .split(',').map(email => {
          const normalized = normalizeCheckoutEmail(email.trim())
          if (!normalized) throw new TypeError('Canary recipient is invalid')
          return normalized
        }),
    ) : null
    if (allowedRecipientEmails && (allowedRecipientEmails.length > 10
      || new Set(allowedRecipientEmails).size !== allowedRecipientEmails.length)) {
      throw new TypeError('Reminder live recipient is invalid')
    }

    return Object.freeze({
      resendApiKey: provider.apiKey,
      fromAddress: provider.from,
      unsubscribeSecret,
      appUrl,
      unsubscribeEndpointUrl,
      unsubscribePageUrl,
      allowedRecipientEmails,
      admissionMode,
      unsubscribeKeyVersion,
    })
  } catch {
    throw new ReminderDispatchError(
      'Live reminder configuration is unavailable',
      503,
      'live_configuration_unavailable',
    )
  }
}
