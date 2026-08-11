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

    return Object.freeze({
      resendApiKey: provider.apiKey,
      fromAddress: provider.from,
      unsubscribeSecret,
      appUrl,
      unsubscribeEndpointUrl,
      unsubscribePageUrl,
    })
  } catch {
    throw new ReminderDispatchError(
      'Live reminder configuration is unavailable',
      503,
      'live_configuration_unavailable',
    )
  }
}
