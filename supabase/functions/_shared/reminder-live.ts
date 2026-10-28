import { normalizeCheckoutEmail } from './checkout-identity.ts'
import { readResendReminderCapacity } from './resend-reminder-capacity.ts'
import {
  parseTypedReminderDryRunClaim as parseTypedReminderClaim,
  readReminderDeliveryEnabled,
  readReminderRpc,
  ReminderDispatchError,
} from './reminder-delivery-claim.ts'
import type {
  ReminderDeliveryClient,
  TypedReminderDryRunClaim as TypedReminderClaim,
} from './reminder-delivery-claim.ts'
import {
  createReminderUnsubscribeApiUrl,
  createReminderUnsubscribePageUrl,
  createReminderUnsubscribeToken,
  digestReminderUnsubscribeToken,
  encodeReminderDigestForPostgres,
  renderTypedReminderEmail,
} from './reminder-email.ts'
import type { ReminderLiveConfig } from './reminder-live-config.ts'
import {
  sendReminderWithResend,
  createResendReminderPayload,
} from './resend-reminder-adapter.ts'
import type {
  ResendReminderSendInput,
  ResendReminderSendResult,
} from './resend-reminder-adapter.ts'

const CLAIM_BATCH_SIZE = 10
const DUE_WINDOW_SECONDS = 60 * 60
const WORKER_BUDGET_MS = 25_000
const TEMPLATE_VERSION = 'edenia-reminder-v4'
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
  recipientNotAllowlisted: number
  fenced: number
  providerDeferred: number
  providerBlocked: number
  completionFailed: number
}>

export type ReminderSender = (
  input: ResendReminderSendInput,
) => Promise<ResendReminderSendResult>

export type ReminderLiveDependencies = Readonly<{
  send?: ReminderSender
  readCapacity?: typeof readResendReminderCapacity
  now?: () => number
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
    recipientNotAllowlisted: 0,
    fenced: 0,
    providerDeferred: 0,
    providerBlocked: 0,
    completionFailed: 0,
  }
}

function classifyProviderFailure(
  reason: Extract<ResendReminderSendResult, { status: 'blocked' }>['reason'],
) {
  if (reason === 'request_invalid') return 'template_invalid'
  if (
    reason === 'authentication_or_domain'
    || reason === 'configuration'
    || reason === 'idempotency_conflict'
  ) {
    return 'configuration_invalid'
  }
  return 'provider_rejected'
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
    recipient_not_allowlisted: counts.recipientNotAllowlisted,
    fenced: counts.fenced,
    provider_deferred: counts.providerDeferred,
    provider_blocked: counts.providerBlocked,
    completion_failed: counts.completionFailed,
  })
  return createResult(status, claimed, counts)
}

async function completeWithoutSend(
  client: ReminderLiveClient,
  claim: TypedReminderClaim,
  failureCode: 'recipient_unavailable' | 'recipient_not_allowlisted',
  log: (entry: ReminderLiveLog) => void,
  counts: ReturnType<typeof createCounts>,
) {
  const completion = await client.rpc('complete_typed_reminder_without_send', {
    p_claim_token: claim.claimToken,
    p_failure_code: failureCode,
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
  if (failureCode === 'recipient_unavailable') {
    counts.recipientUnavailable += 1
  } else {
    counts.recipientNotAllowlisted += 1
  }
  log({
    event: failureCode === 'recipient_unavailable'
      ? 'reminder_live_recipient_unavailable'
      : 'reminder_live_recipient_not_allowlisted',
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

  const now = dependencies.now ?? Date.now
  const workerDeadline = now() + WORKER_BUDGET_MS
  const digest = async (value: string) => encodeReminderDigestForPostgres(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  )
  const apiKeyDigest = await digest(config.resendApiKey)
  const senderDigest = await digest(config.fromAddress)
  const attested = await readReminderRpc(client, 'reminder_provider_attestation_is_current', {
    p_api_key_digest: apiKeyDigest, p_sender_digest: senderDigest, p_admission_mode: config.admissionMode,
  })
  if (attested !== true) {
    log({
      event: 'reminder_live_blocked', reason: 'free_account_attestation_unavailable'
    })
    return createResult('blocked', 0, createCounts())
  }
  const capacity = await (dependencies.readCapacity ?? readResendReminderCapacity)(config.resendApiKey)
  if (!capacity || now() >= workerDeadline) {
    log({
      event: 'reminder_live_blocked', reason: 'provider_capacity_unknown'
    })
    return createResult('blocked', 0, createCounts())
  }
  const refreshed = await readReminderRpc(client, 'refresh_reminder_provider_usage', {
    p_api_key_digest: apiKeyDigest, p_sender_digest: senderDigest,
    p_daily_used: capacity.dailyUsed, p_monthly_used: capacity.monthlyUsed,
    p_observed_at: capacity.observedAt,
  })
  if (refreshed !== true) {
    log({
      event: 'reminder_live_blocked', reason: 'provider_capacity_fenced'
    })
    return createResult('blocked', 0, createCounts())
  }
  await readReminderRpc(client, 'refresh_reminder_eligibility_snapshots', { p_limit: 10 })
  const rawClaims = await readReminderRpc(
    client,
    'claim_due_typed_reminder_design',
    {
      p_batch_size: CLAIM_BATCH_SIZE,
      p_due_window_seconds: DUE_WINDOW_SECONDS,
      p_lease_seconds: LEASE_SECONDS,
    },
  )
  if (!Array.isArray(rawClaims)) {
    throw new ReminderDispatchError(
      'Reminder claims returned an invalid result',
      503,
      'database_unavailable',
    )
  }
  const claims = rawClaims.map(parseTypedReminderClaim)
  const counts = createCounts()
  let sendDeadline = workerDeadline
  const send: ReminderSender = dependencies.send ?? (input => sendReminderWithResend(input, {
    timeoutMs: Math.max(100, Math.min(10_000, sendDeadline - now())),
    deadlineMs: sendDeadline, now,
  }))

  for (const claim of claims) {
    if (now() >= workerDeadline - 1000) {
      log({
      event: 'reminder_live_blocked', reason: 'worker_deadline'
    })
      return logSummary(log, 'deferred', claims.length, counts)
    }
    const recipient = await readConfirmedRecipient(client, claim.userId)
    if (!recipient) {
      if (!await completeWithoutSend(
        client,
        claim,
        'recipient_unavailable',
        log,
        counts,
      )) {
        return logSummary(log, 'blocked', claims.length, counts)
      }
      continue
    }
    if (config.admissionMode === 'canary' && recipient !== config.allowedRecipientEmail) {
      if (!await completeWithoutSend(
        client,
        claim,
        'recipient_not_allowlisted',
        log,
        counts,
      )) {
        return logSummary(log, 'blocked', claims.length, counts)
      }
      continue
    }

    let token: string
    let tokenDigest: Uint8Array
    let unsubscribeApiUrl: string
    let content: ReturnType<typeof renderTypedReminderEmail>
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
      content = renderTypedReminderEmail({
        locale: claim.locale,
        appUrl: config.appUrl,
        unsubscribePageUrl,
        emailType: claim.emailType,
        channelId: claim.channelId,
        channelName: claim.channelName,
        channelSummary: claim.channelSummary,
        videoId: claim.videoId,
        videoTitle: claim.videoTitle,
        recommendations: claim.recommendations,
        currentStreakDays: claim.currentStreakDays,
        remainingMinutes: claim.remainingMinutes,
        videoMode: claim.videoMode,
      })
    } catch {
      throw new ReminderDispatchError(
        'Reminder delivery content is unavailable',
        503,
        'live_content_unavailable',
      )
    }

    const tokenBinding = await client.rpc(
      'store_typed_reminder_unsubscribe_token',
      {
        p_delivery_id: claim.deliveryId,
        p_claim_token: claim.claimToken,
        p_token_digest: encodeReminderDigestForPostgres(tokenDigest),
      },
    )
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

    const sendInput: ResendReminderSendInput = {
      apiKey: config.resendApiKey, from: config.fromAddress, to: recipient,
      deliveryId: claim.deliveryId, subject: content.subject,
      text: content.text, html: content.html, unsubscribeApiUrl,
    }
    const bound = await client.rpc('bind_reminder_payload', {
      p_claim_token: claim.claimToken,
      p_recipient_digest: await digest(recipient), p_sender_digest: senderDigest,
      p_payload_digest: await digest(createResendReminderPayload(sendInput)),
      p_template_version: TEMPLATE_VERSION,
      p_unsubscribe_key_version: config.unsubscribeKeyVersion,
      p_api_key_digest: apiKeyDigest, p_admission_mode: config.admissionMode,
    })
    if (bound.error || bound.data !== true) {
      counts.fenced += 1
      log({
      event: 'reminder_live_fenced', stage: 'payload_binding', reason: 'payload_changed'
    })
      return logSummary(log, 'blocked', claims.length, counts)
    }
    if (now() >= workerDeadline - 1000) return logSummary(log, 'deferred', claims.length, counts)

    const attempt = await client.rpc('begin_typed_reminder_provider_attempt', {
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

    // The database authorizes begin inside its transaction. Its response can
    // arrive after the occurrence cutoff; check again at the network boundary.
    sendDeadline = Math.min(workerDeadline, Date.parse(claim.scheduledFor) + DUE_WINDOW_SECONDS * 1000)
    if (now() >= sendDeadline - 100) {
      counts.providerDeferred += 1
      log({
        event: 'reminder_live_provider_deferred', reason: 'send_cutoff'
      })
      return logSummary(log, 'deferred', claims.length, counts)
    }

    let providerResult: ResendReminderSendResult
    try {
      providerResult = await send(sendInput)
    } catch {
      await client.rpc('defer_typed_reminder', { p_claim_token: claim.claimToken,
        p_retry_after_seconds: 300, p_definitive_no_send: false, p_stop_capacity: false })
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
      const noSend = providerResult.reason === 'rate_limited' || providerResult.reason === 'quota_exhausted'
      const deferred = await client.rpc('defer_typed_reminder', {
        p_claim_token: claim.claimToken,
        p_retry_after_seconds: providerResult.retryAfterSeconds ?? 300,
        p_definitive_no_send: noSend,
        p_stop_capacity: providerResult.reason === 'quota_exhausted',
      })
      if (deferred.error || deferred.data !== true) counts.completionFailed += 1
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
      const failure = await client.rpc(
        'complete_typed_reminder_rejection',
        {
          p_claim_token: claim.claimToken,
          p_failure_code: classifyProviderFailure(providerResult.reason),
          p_definitive_no_send: providerResult.definitiveNoSend === true,
        },
      )
      if (failure.error || failure.data !== true) {
        counts.completionFailed += 1
        log({
          event: 'reminder_live_completion_failed',
          delivery_id: claim.deliveryId,
          attempt_count: claim.attemptCount,
          reason: failure.error ? 'database_error' : 'claim_fenced',
        })
        return logSummary(log, 'deferred', claims.length, counts)
      }
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
