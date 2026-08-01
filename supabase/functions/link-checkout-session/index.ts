// supabase/functions/link-checkout-session/index.ts
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import {
  isStripeEventModeAllowed,
  readStripeRuntimeConfig,
} from '../_shared/billing-config.ts'
import {
  assertOnlyKeys,
  BillingRequestError,
  getClientAddress,
  isCheckoutSessionId,
  readJsonObject,
} from '../_shared/billing-request.ts'
import { consumeBillingRateLimit } from '../_shared/billing-rate-limit.ts'
import { corsHeaders, getCorsPreflightResponse } from '../_shared/cors.ts'
import {
  evaluateCheckoutConfirmation,
  type CheckoutSubscriptionConfirmation,
} from '../_shared/checkout-confirmation.ts'
import {
  getStripeReferenceId,
  isPaidEdeniaPlusCheckoutSession,
} from '../_shared/checkout-payment.ts'

const readEnvironment = (name: string) => Deno.env.get(name)
const billingConfig = readStripeRuntimeConfig(readEnvironment)

const stripe = new Stripe(billingConfig.secretKey, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const REDEMPTION_TABLE = 'checkout_session_redemptions'
const REDEMPTION_SETTINGS_TABLE = 'checkout_redemption_settings'
const REDEMPTION_CLAIM_TIMEOUT_MS = 5 * 60_000
const REDEMPTION_MAX_SESSION_AGE_MS = 24 * 60 * 60_000
const WEBHOOK_CONFIRMATION_TIMEOUT_MS = 8_000
const WEBHOOK_CONFIRMATION_POLL_MS = 500
const LINK_IP_RATE_LIMIT = Object.freeze({
  windowSeconds: 10 * 60,
  maximumRequests: 30,
})
const LINK_SESSION_RATE_LIMIT = Object.freeze({
  windowSeconds: 10 * 60,
  maximumRequests: 10,
})

class CheckoutRedemptionError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'CheckoutRedemptionError'
    this.status = status
    this.code = code
  }
}

type RedemptionClaim = {
  sessionIdHash: string
  claimId: string
}

async function hashCheckoutSessionId(sessionId: string) {
  const bytes = new TextEncoder().encode(sessionId)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function assertCheckoutSessionIsRedeemable(sessionCreatedAt: number) {
  const { data: settings, error } = await supabase
    .from(REDEMPTION_SETTINGS_TABLE)
    .select('accept_sessions_created_after')
    .eq('singleton', true)
    .single()

  if (error) throw error

  const sessionCreatedAtMs = sessionCreatedAt * 1000
  const deploymentCutoffMs = Date.parse(settings.accept_sessions_created_after)
  if (!Number.isFinite(deploymentCutoffMs) || sessionCreatedAtMs < deploymentCutoffMs) {
    throw new CheckoutRedemptionError(
      'Checkout session was created before secure account linking was enabled',
      409,
      'checkout_session_not_redeemable',
    )
  }

  if ((Date.now() - sessionCreatedAtMs) > REDEMPTION_MAX_SESSION_AGE_MS) {
    throw new CheckoutRedemptionError(
      'Checkout session is too old to link',
      410,
      'checkout_session_link_expired',
    )
  }
}

async function claimCheckoutSession(sessionId: string): Promise<RedemptionClaim> {
  const sessionIdHash = await hashCheckoutSessionId(sessionId)
  const claimId = crypto.randomUUID()
  const claimedAt = new Date().toISOString()

  const { error: insertError } = await supabase.from(REDEMPTION_TABLE).insert({
    session_id_hash: sessionIdHash,
    claim_id: claimId,
    claimed_at: claimedAt,
  })

  if (!insertError) return { sessionIdHash, claimId }
  if (insertError.code !== '23505') throw insertError

  const { data: existing, error: existingError } = await supabase
    .from(REDEMPTION_TABLE)
    .select('claim_id, claimed_at, redeemed_at')
    .eq('session_id_hash', sessionIdHash)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing?.redeemed_at) {
    throw new CheckoutRedemptionError(
      'Checkout session has already been linked',
      409,
      'checkout_session_redeemed',
    )
  }

  const staleBefore = new Date(Date.now() - REDEMPTION_CLAIM_TIMEOUT_MS).toISOString()
  if (!existing || Date.parse(existing.claimed_at) >= Date.parse(staleBefore)) {
    throw new CheckoutRedemptionError(
      'Checkout session linking is already in progress',
      409,
      'checkout_session_redemption_in_progress',
    )
  }

  const { data: reclaimed, error: reclaimError } = await supabase
    .from(REDEMPTION_TABLE)
    .update({ claim_id: claimId, claimed_at: claimedAt })
    .eq('session_id_hash', sessionIdHash)
    .eq('claim_id', existing.claim_id)
    .is('redeemed_at', null)
    .lt('claimed_at', staleBefore)
    .select('session_id_hash')
    .maybeSingle()

  if (reclaimError) throw reclaimError
  if (!reclaimed) {
    throw new CheckoutRedemptionError(
      'Checkout session linking is already in progress',
      409,
      'checkout_session_redemption_in_progress',
    )
  }

  return { sessionIdHash, claimId }
}

async function completeCheckoutSessionClaim(claim: RedemptionClaim) {
  const { data, error } = await supabase
    .from(REDEMPTION_TABLE)
    .update({ redeemed_at: new Date().toISOString() })
    .eq('session_id_hash', claim.sessionIdHash)
    .eq('claim_id', claim.claimId)
    .is('redeemed_at', null)
    .select('session_id_hash')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Checkout session redemption claim was lost')
}

async function releaseCheckoutSessionClaim(claim: RedemptionClaim) {
  const { error } = await supabase
    .from(REDEMPTION_TABLE)
    .delete()
    .eq('session_id_hash', claim.sessionIdHash)
    .eq('claim_id', claim.claimId)
    .is('redeemed_at', null)

  if (error) console.error('Failed to release checkout redemption claim:', error.message)
}

async function waitForWebhookConfirmation(
  customerId: string,
  subscriptionId: string,
  plan: string,
) {
  const deadline = Date.now() + WEBHOOK_CONFIRMATION_TIMEOUT_MS

  while (true) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('user_id, stripe_customer_id, stripe_subscription_id, status, plan')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()

    if (error) throw error

    const confirmation = evaluateCheckoutConfirmation(
      data as CheckoutSubscriptionConfirmation | null,
      { customerId, subscriptionId, plan },
    )

    if (confirmation.state === 'confirmed') return confirmation
    if (confirmation.state === 'invalid') {
      throw new CheckoutRedemptionError(
        confirmation.message,
        409,
        confirmation.code,
      )
    }
    if (Date.now() >= deadline) return null

    await new Promise(resolve => setTimeout(resolve, WEBHOOK_CONFIRMATION_POLL_MS))
  }
}

Deno.serve(async (req) => {
  const preflightResponse = getCorsPreflightResponse(req)
  if (preflightResponse) return preflightResponse

  let redemptionClaim: RedemptionClaim | null = null

  try {
    const body = await readJsonObject(req)
    assertOnlyKeys(body, ['session_id'])
    const session_id = body.session_id
    if (!isCheckoutSessionId(session_id)) {
      throw new BillingRequestError(
        'A valid Checkout Session ID is required',
        400,
        'invalid_checkout_session_id',
      )
    }

    const ipRateLimit = await consumeBillingRateLimit(supabase, {
      scope: 'link-checkout-ip',
      subject: getClientAddress(req.headers),
      ...LINK_IP_RATE_LIMIT,
    })
    if (!ipRateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Too many account-linking requests. Please try again shortly.',
        code: 'rate_limited',
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(ipRateLimit.retryAfterSeconds),
        },
      })
    }

    // Confirm this is a real, paid Edenia Plus subscription — never trust the client's word alone
    const session = await stripe.checkout.sessions.retrieve(session_id)
    if (!isStripeEventModeAllowed(billingConfig.mode, session.livemode)) {
      throw new CheckoutRedemptionError(
        'Checkout Session belongs to the wrong billing environment',
        400,
        'checkout_session_environment_mismatch',
      )
    }
    if (!isPaidEdeniaPlusCheckoutSession(session)) {
      return new Response(JSON.stringify({
        error: 'Checkout payment is not complete',
        code: 'checkout_session_not_paid',
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sessionRateLimit = await consumeBillingRateLimit(supabase, {
      scope: 'link-checkout-session',
      subject: session_id,
      ...LINK_SESSION_RATE_LIMIT,
    })
    if (!sessionRateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Too many account-linking requests. Please try again shortly.',
        code: 'rate_limited',
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(sessionRateLimit.retryAfterSeconds),
        },
      })
    }

    const email = session.customer_details?.email
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email on session' }), {
        status: 400, headers: corsHeaders,
      })
    }

    await assertCheckoutSessionIsRedeemable(session.created)
    const customerId = getStripeReferenceId(session.customer)!
    const subscriptionId = getStripeReferenceId(session.subscription)!
    const plan = session.metadata!.plan!
    const confirmation = await waitForWebhookConfirmation(customerId, subscriptionId, plan)

    if (!confirmation) {
      return new Response(JSON.stringify({
        pending: true,
        code: 'checkout_confirmation_pending',
        message: 'Payment is complete and Plus activation is still being confirmed',
      }), {
        status: 202,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '2',
        },
      })
    }

    const activeClaim = await claimCheckoutSession(session_id)
    redemptionClaim = activeClaim

    // The webhook owns user creation and entitlement. Link only that exact confirmed user.
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      confirmation.userId,
    )
    if (userError) throw userError
    const confirmedUser = userData.user
    if (
      !confirmedUser?.email
      || confirmedUser.email.trim().toLowerCase() !== email.trim().toLowerCase()
    ) {
      throw new CheckoutRedemptionError(
        'Confirmed subscription user does not match the Checkout Session',
        409,
        'checkout_confirmation_mismatch',
      )
    }

    // Generate a sign-in link server-side, then hand the token to the browser
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: confirmedUser.email,
    })
    if (linkError) throw linkError
    const tokenHash = linkData.properties.hashed_token
    if (!tokenHash) throw new Error('Supabase did not return a sign-in token')

    await completeCheckoutSessionClaim(activeClaim)
    redemptionClaim = null

    return new Response(JSON.stringify({
      token_hash: tokenHash,
      user_id: confirmedUser.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    if (redemptionClaim) await releaseCheckoutSessionClaim(redemptionClaim)
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('link-checkout-session error:', message, stack)
    const knownError = err instanceof CheckoutRedemptionError
      || err instanceof BillingRequestError
    const status = knownError ? err.status : 500
    const code = knownError ? err.code : 'checkout_session_link_failed'
    return new Response(JSON.stringify({
      error: knownError ? message : 'Unable to link Checkout Session',
      code,
    }), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        ...(status === 405 ? { Allow: 'POST' } : {}),
      },
    })
  }
})
