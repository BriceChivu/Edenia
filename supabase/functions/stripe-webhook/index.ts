// supabase/functions/stripe-webhook/index.ts
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import {
  isStripeEventModeAllowed,
  readStripeWebhookConfig,
} from '../_shared/billing-config.ts'
import { findAuthUserByEmail } from '../_shared/auth-user-lookup.ts'
import {
  getStripeReferenceId,
  isPaidEdeniaPlusCheckoutSession,
} from '../_shared/checkout-payment.ts'
import {
  isBlockingSubscriptionStatus,
  normalizeCheckoutEmail,
} from '../_shared/checkout-identity.ts'
import {
  isUniqueViolation,
  requireAffectedRows,
  requireDependencySuccess,
  WebhookDependencyError,
} from '../_shared/webhook-results.ts'
import {
  getSubscriptionUpdate,
  reconcileCurrentSubscription,
} from '../_shared/subscription-lifecycle.ts'
import {
  getStripeBillingEventAction,
  STRIPE_BILLING_EVENT_ACTIONS,
} from '../_shared/stripe-event-policy.ts'

const readEnvironment = (name: string) => Deno.env.get(name)
const billingConfig = readStripeWebhookConfig(readEnvironment)

const stripe = new Stripe(billingConfig.secretKey, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const WEBHOOK_MAX_BODY_BYTES = 1_048_576
const WEBHOOK_CLAIM_TIMEOUT_MS = 5 * 60_000

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

async function retrieveCurrentSubscription(subscriptionId: string) {
  return await stripe.subscriptions.retrieve(subscriptionId)
}

function getFoundingReservationId(session: Stripe.Checkout.Session) {
  return session.metadata?.plan === 'founding'
    ? session.metadata?.founding_reservation_id || null
    : null
}

async function releaseFoundingReservation(session: Stripe.Checkout.Session) {
  const reservationId = getFoundingReservationId(session)
  if (!reservationId) return

  requireDependencySuccess(
    await supabase.rpc('release_founding_checkout_reservation', {
      p_reservation_id: reservationId,
      p_session_id: session.id,
    }),
    'Release founding Checkout reservation',
  )
}

async function resolveCheckoutUser(session: Stripe.Checkout.Session) {
  const metadataUserId = session.metadata?.supabase_user_id
  const sessionEmail = normalizeCheckoutEmail(session.customer_details?.email)

  if (metadataUserId) {
    const userResult = requireDependencySuccess(
      await supabase.auth.admin.getUserById(metadataUserId),
      'Get authenticated Checkout user',
    )
    const userEmail = normalizeCheckoutEmail(userResult.user?.email)
    if (!userResult.user || !userEmail) {
      throw new Error(
        `Authenticated Checkout user ${metadataUserId} no longer exists`,
      )
    }
    if (sessionEmail && sessionEmail !== userEmail) {
      throw new Error(
        `Checkout Session ${session.id} email does not match its authenticated user`,
      )
    }
    return userResult.user.id
  }

  // Compatibility path for paid Checkout Sessions created before authenticated
  // checkout ownership was deployed.
  if (!sessionEmail) {
    throw new Error(`Paid Checkout Session ${session.id} has no customer email`)
  }

  const match = await findAuthUserByEmail(
    sessionEmail,
    async pagination => requireDependencySuccess(
      await supabase.auth.admin.listUsers(pagination),
      'List Supabase users',
    ),
  )
  if (match) return match.id

  const created = requireDependencySuccess(
    await supabase.auth.admin.createUser({
      email: sessionEmail,
      email_confirm: true,
    }),
    'Create legacy Checkout user',
  )
  if (!created.user) throw new Error('Supabase user creation returned no user')
  return created.user.id
}

async function persistTrackedSubscription(
  currentSubscription: Stripe.Subscription,
  operation: string,
  failureDetectedAt?: string,
) {
  const existing = requireDependencySuccess(
    await supabase
      .from('subscriptions')
      .select('past_due_since')
      .eq('stripe_subscription_id', currentSubscription.id)
      .maybeSingle(),
    `Read subscription before ${operation.toLowerCase()}`,
  )

  requireAffectedRows(
    await supabase
      .from('subscriptions')
      .update(getSubscriptionUpdate(
        currentSubscription,
        existing?.past_due_since || failureDetectedAt,
      ))
      .eq('stripe_subscription_id', currentSubscription.id)
      .select('user_id'),
    operation,
  )
}

async function reconcileTrackedSubscription(
  subscriptionId: string,
  operation: string,
  failureDetectedAt?: string,
) {
  return await reconcileCurrentSubscription(
    () => retrieveCurrentSubscription(subscriptionId),
    currentSubscription => persistTrackedSubscription(
      currentSubscription,
      operation,
      failureDetectedAt,
    ),
  )
}

async function claimWebhookEvent(event: Stripe.Event, claimId: string) {
  const claimedAt = Date.now()
  const claim = requireDependencySuccess(
    await supabase.rpc('claim_stripe_webhook_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: event.livemode,
      p_claim_id: claimId,
      p_stale_before: new Date(
        claimedAt - WEBHOOK_CLAIM_TIMEOUT_MS,
      ).toISOString(),
      p_claimed_at: new Date(claimedAt).toISOString(),
    }),
    'Claim Stripe webhook event',
  )
  if (!['claimed', 'processed', 'in_progress'].includes(claim)) {
    throw new Error('Stripe webhook claim returned an invalid state')
  }
  return claim as 'claimed' | 'processed' | 'in_progress'
}

async function completeWebhookEvent(eventId: string, claimId: string) {
  const completed = requireDependencySuccess(
    await supabase.rpc('complete_stripe_webhook_event', {
      p_event_id: eventId,
      p_claim_id: claimId,
    }),
    'Complete Stripe webhook event',
  )
  if (completed !== true) {
    throw new Error(`Stripe webhook event ${eventId} lost its processing claim`)
  }
}

async function releaseWebhookEvent(eventId: string, claimId: string) {
  const { error } = await supabase.rpc('release_stripe_webhook_event', {
    p_event_id: eventId,
    p_claim_id: claimId,
  })
  if (error) {
    console.error('Failed to release Stripe webhook claim', {
      eventId,
      error: error.message,
    })
  }
}

async function processPaidCheckout(session: Stripe.Checkout.Session, eventType: string) {
  const plan = session.metadata?.plan
  if (!isPaidEdeniaPlusCheckoutSession(session)) {
    console.warn(
      'Ignoring Checkout Session that is not a paid Edenia Plus subscription',
      {
        eventType,
        sessionId: session.id,
        mode: session.mode,
        status: session.status,
        paymentStatus: session.payment_status,
        plan,
      },
    )
    return
  }

  const stripeCustomerId = getStripeReferenceId(session.customer)!
  const stripeSubscriptionId = getStripeReferenceId(session.subscription)!
  const userId = await resolveCheckoutUser(session)

  const currentRecord = requireDependencySuccess(
    await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, past_due_since')
      .eq('user_id', userId)
      .maybeSingle(),
    'Check existing subscription',
  )

  if (
    currentRecord?.stripe_subscription_id
    && currentRecord.stripe_subscription_id !== stripeSubscriptionId
  ) {
    const trackedSubscription = await retrieveCurrentSubscription(
      currentRecord.stripe_subscription_id,
    )
    if (isBlockingSubscriptionStatus(trackedSubscription.status)) {
      throw new Error(
        `Refusing to replace active subscription ${trackedSubscription.id} with ${stripeSubscriptionId}`,
      )
    }
  }

  if (plan === 'founding') {
    const reservationId = getFoundingReservationId(session)
    if (reservationId) {
      requireDependencySuccess(
        await supabase.rpc('complete_founding_checkout_reservation', {
          p_reservation_id: reservationId,
          p_session_id: session.id,
          p_user_id: userId,
        }),
        'Complete founding Checkout reservation',
      )
    } else {
      // Compatibility for founding Sessions opened before atomic reservations.
      const foundingResult = await supabase
        .from('founding_members')
        .insert({ user_id: userId })
      if (foundingResult.error && !isUniqueViolation(foundingResult.error)) {
        requireDependencySuccess(foundingResult, 'Insert legacy founding member')
      }
    }
  }

  await reconcileCurrentSubscription(
    () => retrieveCurrentSubscription(stripeSubscriptionId),
    async currentSubscription => {
      requireDependencySuccess(
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          ...getSubscriptionUpdate(
            currentSubscription,
            currentRecord?.stripe_subscription_id === stripeSubscriptionId
              ? currentRecord.past_due_since
              : undefined,
          ),
          plan,
        }, { onConflict: 'user_id' }),
        'Upsert subscription',
      )
    },
  )
}

async function processWebhookEvent(event: Stripe.Event) {
  switch (getStripeBillingEventAction(event.type)) {
    case STRIPE_BILLING_EVENT_ACTIONS.RELEASE_FOUNDING_RESERVATION:
      await releaseFoundingReservation(
        event.data.object as Stripe.Checkout.Session,
      )
      break

    case STRIPE_BILLING_EVENT_ACTIONS.COMPLETE_CHECKOUT:
      await processPaidCheckout(
        event.data.object as Stripe.Checkout.Session,
        event.type,
      )
      break

    case STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_SUBSCRIPTION: {
      const eventSubscription = event.data.object as Stripe.Subscription
      await reconcileTrackedSubscription(
        eventSubscription.id,
        'Update subscription lifecycle',
      )
      break
    }

    case STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_PAID_INVOICE: {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = getStripeReferenceId(invoice.subscription)
      if (!subscriptionId) {
        console.warn('Ignoring paid invoice without a subscription', {
          invoiceId: invoice.id,
        })
        break
      }
      await reconcileTrackedSubscription(
        subscriptionId,
        'Recover or renew subscription',
      )
      break
    }

    case STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_FAILED_INVOICE: {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = getStripeReferenceId(invoice.subscription)
      if (!subscriptionId) {
        console.warn('Ignoring failed invoice without a subscription', {
          invoiceId: invoice.id,
        })
        break
      }
      await reconcileTrackedSubscription(
        subscriptionId,
        'Update failed-payment subscription',
        new Date(event.created * 1000).toISOString(),
      )
      break
    }
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return jsonResponse({
      received: false,
      error: 'Method not allowed',
    }, 405, { Allow: 'POST' })
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > WEBHOOK_MAX_BODY_BYTES) {
    return jsonResponse({ received: false, error: 'Request body is too large' }, 413)
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return jsonResponse({
      received: false,
      error: 'Missing Stripe signature',
    }, 400)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > WEBHOOK_MAX_BODY_BYTES) {
    return jsonResponse({ received: false, error: 'Request body is too large' }, 413)
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      billingConfig.webhookSecret,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      `Webhook signature verification failed: ${message}`,
      { status: 400 },
    )
  }

  if (!isStripeEventModeAllowed(billingConfig.mode, event.livemode)) {
    return jsonResponse({
      received: false,
      error: 'Stripe event belongs to the wrong billing environment',
    }, 400)
  }

  if (
    getStripeBillingEventAction(event.type)
    === STRIPE_BILLING_EVENT_ACTIONS.IGNORE
  ) {
    return jsonResponse({ received: true, ignored: true })
  }

  const claimId = crypto.randomUUID()
  let ownsClaim = false

  try {
    const claim = await claimWebhookEvent(event, claimId)
    if (claim === 'processed') {
      return jsonResponse({ received: true, duplicate: true })
    }
    if (claim === 'in_progress') {
      return jsonResponse({
        received: false,
        retry: true,
        error: 'Stripe event is already being processed',
      }, 409, { 'Retry-After': '5' })
    }
    ownsClaim = true

    await processWebhookEvent(event)
    await completeWebhookEvent(event.id, claimId)
    ownsClaim = false
  } catch (error) {
    if (ownsClaim) await releaseWebhookEvent(event.id, claimId)
    console.error('Stripe webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      operation: error instanceof WebhookDependencyError
        ? error.operation
        : undefined,
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({
      received: false,
      error: 'Webhook processing failed',
    }, 500)
  }

  return jsonResponse({ received: true })
})
