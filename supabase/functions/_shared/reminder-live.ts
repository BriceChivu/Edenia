import { normalizeCheckoutEmail } from './checkout-identity.ts'
import {
  parseReminderDeliveryClaim,
  readReminderDeliveryEnabled,
  readReminderRpc,
  ReminderDispatchError,
} from './reminder-delivery-claim.ts'
import type {
  ReminderDeliveryClaim,
  ReminderDeliveryClient,
} from './reminder-delivery-claim.ts'
import {
  createReminderUnsubscribeApiUrl,
  createReminderUnsubscribePageUrl,
  createReminderUnsubscribeToken,
  digestReminderUnsubscribeToken,
  encodeReminderDigestForPostgres,
  renderReminderEmail,
} from './reminder-email.ts'
import type { ReminderLiveConfig } from './reminder-live-config.ts'
import {
  sendReminderWithResend,
} from './resend-reminder-adapter.ts'
import type {
  ResendReminderSendInput,
  ResendReminderSendResult,
} from './resend-reminder-adapter.ts'

const CLAIM_BATCH_SIZE = 5
const DUE_WINDOW_SECONDS = 15 * 60
const LEASE_SECONDS = 5 * 60
const PROVIDER_NAME = 'resend'

type AuthError = { message: string; code?: string }
type AuthUserResult = PromiseLike<{
  data: unknown
  error: AuthError | null
}>

export type ReminderLiveClient = ReminderDeliveryClient & {
  auth: {
    admin: {
      getUserById: (userId: string) => AuthUserResult
    }
  }
}

export type ReminderLiveLog = Record<
  string,
  string | number | boolean
>

export type ReminderLiveResult = Readonly<{
  mode: 'live'
  status: 'completed' | 'blocked' | 'deferred'
  liveDeliveryEnabled: true
  claimed: number
  accepted: number
  recipientUnavailable: number
  fenced: number
  providerDeferred: number
  providerBlocked: number
  completionFailed: number
}>

type ReminderSender = (
  input: ResendReminderSendInput,
) => Promise<ResendReminderSendResult>

type ReminderLiveDependencies = Readonly<{
  send?: ReminderSender
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isConfirmedTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

async function readConfirmedRecipient(
  client: ReminderLiveClient,
  userId: string,
) {
  const { data, error } = await client.auth.admin.getUserById(userId)
  if (error) {
    if (error.code === 'user_not_found') return null
    throw new ReminderDispatchError(
      'Reminder recipient service is unavailable',
      503,
      'recipient_service_unavailable',
    )
  }
  if (!isRecord(data) || !Object.hasOwn(data, 'user')) {
    throw new ReminderDispatchError(
      'Reminder recipient service returned an invalid result',
      503,
      'recipient_service_unavailable',
    )
  }

  const user = data.user
  if (user === null) return null
  if (!isRecord(user) || user.id !== userId) {
    throw new ReminderDispatchError(
      'Reminder recipient service returned an invalid user',
      503,
      'recipient_service_unavailable',
    )
  }
  if (typeof user.deleted_at === 'string' && user.deleted_at.length > 0) {
    return null
  }
  const email = normalizeCheckoutEmail(user.email)
  if (!email || !isConfirmedTimestamp(user.email_confirmed_at)) return null
  return email
}

function createResult(
  status: ReminderLiveResult['status'],
  claimed: number,
  counts: Omit<
    ReminderLiveResult,
    'mode' | 'status' | 'liveDeliveryEnabled' | 'claimed'
  >,
): ReminderLiveResult {
  return Object.freeze({
    mode: 'live',
    status,
    liveDeliveryEnabled: true,
    claimed,
    ...counts,
  })
}

function createCounts() {
  return {
    accepted: 0,
    recipientUnavailable: 0,
    fenced: 0,
    providerDeferred: 0,
    providerBlocked: 0,
    completionFailed: 0,
  }
}

function logSummary(
  log: (entry: ReminderLiveLog) => void,
  status: ReminderLiveResult['status'],
  claimed: number,
  counts: ReturnType<typeof createCounts>,
) {
  log({
    event: 'reminder_live_summary',
    status,
    claimed,
    accepted: counts.accepted,
    recipient_unavailable: counts.recipientUnavailable,
    fenced: counts.fenced,
    provider_deferred: counts.providerDeferred,
    provider_blocked: counts.providerBlocked,
    completion_failed: counts.completionFailed,
  })
  return createResult(status, claimed, counts)
}

async function completeWithoutSend(
  client: ReminderLiveClient,
  claim: ReminderDeliveryClaim,
  log: (entry: ReminderLiveLog) => void,
  counts: ReturnType<typeof createCounts>,
) {
  const completion = await client.rpc('complete_reminder_without_send', {
    p_claim_token: claim.claimToken,
    p_failure_code: 'recipient_unavailable',
  })
  if (completion.error || completion.data !== true) {
    counts.fenced += 1
    log({
      event: 'reminder_live_fenced',
      delivery_id: claim.deliveryId,
      attempt_count: claim.attemptCount,
      stage: 'recipient_completion',
      reason: completion.error ? 'database_error' : 'claim_fenced',
    })
    return false
  }
  counts.recipientUnavailable += 1
  log({
    event: 'reminder_live_recipient_unavailable',
    delivery_id: claim.deliveryId,
    attempt_count: claim.attemptCount,
  })
  return true
}

export async function runReminderLive(
  client: ReminderLiveClient,
  config: ReminderLiveConfig,
  log: (entry: ReminderLiveLog) => void,
  dependencies: ReminderLiveDependencies = {},
): Promise<ReminderLiveResult> {
  if (!await readReminderDeliveryEnabled(client)) {
    log({
      event: 'reminder_live_blocked',
      reason: 'live_delivery_disabled',
    })
    return createResult('blocked', 0, createCounts())
  }

  const rawClaims = await readReminderRpc(
    client,
    'claim_due_reminder_deliveries',
    {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_due_window_seconds: DUE_WINDOW_SECONDS,
      p_lease_seconds: LEASE_SECONDS,
      p_delivery_mode: 'live',
    },
  )
  if (!Array.isArray(rawClaims)) {
    throw new ReminderDispatchError(
      'Reminder claims returned an invalid result',
      503,
      'database_unavailable',
    )
  }
  const claims = rawClaims.map(parseReminderDeliveryClaim)
  const counts = createCounts()
  const send = dependencies.send ?? sendReminderWithResend

  for (const claim of claims) {
    const recipient = await readConfirmedRecipient(client, claim.userId)
    if (!recipient) {
      if (!await completeWithoutSend(client, claim, log, counts)) {
        return logSummary(log, 'blocked', claims.length, counts)
      }
      continue
    }

    let token: string
    let tokenDigest: Uint8Array
    let unsubscribeApiUrl: string
    let content: ReturnType<typeof renderReminderEmail>
    try {
      token = await createReminderUnsubscribeToken(
        claim.deliveryId,
        config.unsubscribeSecret,
      )
      tokenDigest = await digestReminderUnsubscribeToken(token)
      unsubscribeApiUrl = createReminderUnsubscribeApiUrl(
        config.unsubscribeEndpointUrl,
        token,
        claim.locale,
      )
      const unsubscribePageUrl = createReminderUnsubscribePageUrl(
        config.unsubscribePageUrl,
        token,
        claim.locale,
      )
      content = renderReminderEmail({
        locale: claim.locale,
        appUrl: config.appUrl,
        unsubscribePageUrl,
      })
    } catch {
      throw new ReminderDispatchError(
        'Reminder delivery content is unavailable',
        503,
        'live_content_unavailable',
      )
    }

    const tokenBinding = await client.rpc('store_reminder_unsubscribe_token', {
      p_delivery_id: claim.deliveryId,
      p_claim_token: claim.claimToken,
      p_token_digest: encodeReminderDigestForPostgres(tokenDigest),
    })
    if (tokenBinding.error || tokenBinding.data !== true) {
      counts.fenced += 1
      log({
        event: 'reminder_live_fenced',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        stage: 'unsubscribe_binding',
        reason: tokenBinding.error ? 'database_error' : 'claim_fenced',
      })
      return logSummary(log, 'blocked', claims.length, counts)
    }

    const attempt = await client.rpc('begin_reminder_provider_attempt', {
      p_claim_token: claim.claimToken,
      p_provider_name: PROVIDER_NAME,
    })
    if (attempt.error || attempt.data !== true) {
      counts.fenced += 1
      log({
        event: 'reminder_live_fenced',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        stage: 'provider_begin',
        reason: attempt.error ? 'database_error' : 'claim_fenced',
      })
      return logSummary(log, 'blocked', claims.length, counts)
    }

    let providerResult: ResendReminderSendResult
    try {
      providerResult = await send({
        apiKey: config.resendApiKey,
        from: config.fromAddress,
        to: recipient,
        deliveryId: claim.deliveryId,
        subject: content.subject,
        text: content.text,
        html: content.html,
        unsubscribeApiUrl,
      })
    } catch {
      counts.providerDeferred += 1
      log({
        event: 'reminder_live_provider_deferred',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        reason: 'adapter_exception',
      })
      return logSummary(log, 'deferred', claims.length, counts)
    }

    if (providerResult.status === 'deferred') {
      counts.providerDeferred += 1
      log({
        event: 'reminder_live_provider_deferred',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        reason: providerResult.reason,
        ...(providerResult.retryAfterSeconds
          ? { retry_after_seconds: providerResult.retryAfterSeconds }
          : {}),
      })
      return logSummary(log, 'deferred', claims.length, counts)
    }
    if (providerResult.status === 'blocked') {
      counts.providerBlocked += 1
      log({
        event: 'reminder_live_provider_blocked',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        reason: providerResult.reason,
      })
      return logSummary(log, 'blocked', claims.length, counts)
    }

    const completion = await client.rpc(
      'complete_reminder_provider_acceptance',
      {
        p_claim_token: claim.claimToken,
        p_provider_name: PROVIDER_NAME,
        p_provider_message_id: providerResult.providerMessageId,
      },
    )
    if (completion.error || completion.data !== true) {
      counts.completionFailed += 1
      log({
        event: 'reminder_live_completion_failed',
        delivery_id: claim.deliveryId,
        attempt_count: claim.attemptCount,
        reason: completion.error ? 'database_error' : 'claim_fenced',
      })
      return logSummary(log, 'deferred', claims.length, counts)
    }
    counts.accepted += 1
    log({
      event: 'reminder_live_provider_accepted',
      delivery_id: claim.deliveryId,
      attempt_count: claim.attemptCount,
      provider: PROVIDER_NAME,
    })
  }

  return logSummary(log, 'completed', claims.length, counts)
}
