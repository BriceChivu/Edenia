// supabase/functions/create-checkout-session/index.ts
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import {
  type BillingPlan,
  getStripePriceId,
  readStripeCheckoutConfig,
} from '../_shared/billing-config.ts'
import {
  assertOnlyKeys,
  BillingRequestError,
  getBearerToken,
  readJsonObject,
} from '../_shared/billing-request.ts'
import { consumeBillingRateLimit } from '../_shared/billing-rate-limit.ts'
import { corsHeaders, getCorsPreflightResponse } from '../_shared/cors.ts'
import {
  getCheckoutIdempotencyKey,
  getCustomerIdempotencyKey,
  hashCheckoutIdentity,
  isBlockingSubscriptionStatus,
  normalizeCheckoutEmail,
} from '../_shared/checkout-identity.ts'

const readEnvironment = (name: string) => Deno.env.get(name)
const billingConfig = readStripeCheckoutConfig(readEnvironment)

const stripe = new Stripe(billingConfig.secretKey, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CHECKOUT_PLANS = new Set<BillingPlan>(['monthly', 'annual', 'founding'])
const FOUNDING_CHECKOUT_DURATION_MS = 31 * 60_000
const CHECKOUT_RATE_LIMIT = Object.freeze({
  windowSeconds: 10 * 60,
  maximumRequests: 5,
})

function readFoundingCheckoutReservation(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('reservation_id' in value) ||
    typeof value.reservation_id !== 'string' ||
    !value.reservation_id ||
    !('reservation_expires_at' in value) ||
    typeof value.reservation_expires_at !== 'string' ||
    Number.isNaN(Date.parse(value.reservation_expires_at))
  ) {
    throw new Error('Founding Checkout reservation is incomplete')
  }

  return {
    id: value.reservation_id,
    expiresAt: value.reservation_expires_at,
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

async function getAuthenticatedUser(request: Request) {
  const token = getBearerToken(request.headers.get('authorization'))
  if (!token) {
    throw new BillingRequestError(
      'Authentication is required',
      401,
      'authentication_required',
    )
  }

  const { data, error } = await supabase.auth.getUser(token)
  const email = normalizeCheckoutEmail(data.user?.email)
  if (error || !data.user || !email) {
    throw new BillingRequestError(
      'A verified account email is required',
      401,
      'authentication_required',
    )
  }

  return { id: data.user.id, email }
}

async function findCustomersByEmail(email: string) {
  const customers: Stripe.Customer[] = []
  for await (const customer of stripe.customers.list({ email, limit: 100 })) {
    customers.push(customer)
  }
  return customers
}

async function getTrackedCustomer(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error

  if (data?.stripe_subscription_id) {
    const subscription = await stripe.subscriptions.retrieve(
      data.stripe_subscription_id,
    )
    if (isBlockingSubscriptionStatus(subscription.status)) {
      throw new BillingRequestError(
        'An existing subscription must be managed instead of purchased again',
        409,
        'subscription_already_exists',
      )
    }
  }

  if (!data?.stripe_customer_id) return null
  const customer = await stripe.customers.retrieve(data.stripe_customer_id)
  return customer.deleted ? null : customer
}

async function customerHasBlockingSubscription(customerId: string) {
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })) {
    if (isBlockingSubscriptionStatus(subscription.status)) return true
  }
  return false
}

async function findOpenCheckout(customerId: string) {
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    status: 'open',
    limit: 1,
  })
  return sessions.data[0] ?? null
}

async function attachFoundingCheckoutSession(
  reservationId: string,
  sessionId: string,
) {
  const { data: attached, error } = await supabase.rpc(
    'attach_founding_checkout_session',
    {
      p_reservation_id: reservationId,
      p_session_id: sessionId,
    },
  )
  if (error) throw error
  if (attached !== true) {
    throw new Error('Founding Checkout reservation could not be attached')
  }
}

Deno.serve(async request => {
  const preflightResponse = getCorsPreflightResponse(request)
  if (preflightResponse) return preflightResponse

  try {
    const body = await readJsonObject(request)
    assertOnlyKeys(body, ['plan'])

    const plan = body.plan
    if (typeof plan !== 'string' || !CHECKOUT_PLANS.has(plan as BillingPlan)) {
      throw new BillingRequestError('Invalid plan', 400, 'invalid_plan')
    }

    const user = await getAuthenticatedUser(request)
    const rateLimit = await consumeBillingRateLimit(supabase, {
      scope: 'create-checkout-user',
      subject: user.id,
      ...CHECKOUT_RATE_LIMIT,
    })
    if (!rateLimit.allowed) {
      return jsonResponse({
        error: 'Too many checkout requests. Please try again shortly.',
        code: 'rate_limited',
      }, 429, { 'Retry-After': String(rateLimit.retryAfterSeconds) })
    }

    const billingPlan = plan as BillingPlan
    const trackedCustomer = await getTrackedCustomer(user.id)
    const emailCustomers = await findCustomersByEmail(user.email)
    const existingCustomers = Array.from(new Map(
      [trackedCustomer, ...emailCustomers]
        .filter((customer): customer is Stripe.Customer => Boolean(customer))
        .map(customer => [customer.id, customer]),
    ).values())
    let openCheckout: Stripe.Checkout.Session | null = null

    for (const customer of existingCustomers) {
      if (await customerHasBlockingSubscription(customer.id)) {
        throw new BillingRequestError(
          'An existing subscription must be managed instead of purchased again',
          409,
          'subscription_already_exists',
        )
      }
      openCheckout ??= await findOpenCheckout(customer.id)
    }

    if (openCheckout) {
      const checkoutUserId = openCheckout.metadata?.supabase_user_id
      if (
        openCheckout.metadata?.plan !== billingPlan
        || (checkoutUserId && checkoutUserId !== user.id)
        || !openCheckout.url
      ) {
        throw new BillingRequestError(
          'A checkout is already in progress for this account',
          409,
          'checkout_already_started',
        )
      }

      const existingReservationId =
        openCheckout.metadata?.founding_reservation_id
      if (billingPlan === 'founding' && existingReservationId) {
        await attachFoundingCheckoutSession(
          existingReservationId,
          openCheckout.id,
        )
      }

      return jsonResponse({ url: openCheckout.url, resumed: true })
    }

    const userHash = await hashCheckoutIdentity(user.id)
    const customer = existingCustomers[0] ?? await stripe.customers.create({
      email: user.email,
      metadata: {
        product: 'edenia_plus',
        supabase_user_id: user.id,
      },
    }, {
      idempotencyKey: getCustomerIdempotencyKey(userHash),
    })

    if (existingCustomers[0]) {
      await stripe.customers.update(customer.id, {
        email: user.email,
        metadata: {
          product: 'edenia_plus',
          supabase_user_id: user.id,
        },
      })
    }

    let foundingReservationId: string | null = null
    let foundingReservationExpiresAt: string | null = null

    if (billingPlan === 'founding') {
      const requestedExpiry = new Date(
        Date.now() + FOUNDING_CHECKOUT_DURATION_MS,
      ).toISOString()
      const { data: reservation, error: reservationError } = await supabase
        .rpc('reserve_founding_checkout_slot', {
          p_email_hash: await hashCheckoutIdentity(user.email),
          p_expires_at: requestedExpiry,
        })
        .single()

      if (reservationError) {
        if (reservationError.message?.includes('founding_slots_full')) {
          throw new BillingRequestError(
            'Founding slots are full',
            409,
            'founding_slots_full',
          )
        }
        throw reservationError
      }

      const validatedReservation = readFoundingCheckoutReservation(reservation)
      foundingReservationId = validatedReservation.id
      foundingReservationExpiresAt = validatedReservation.expiresAt
    }

    const checkoutMetadata: Record<string, string> = {
      plan: billingPlan,
      supabase_user_id: user.id,
    }
    if (foundingReservationId) {
      checkoutMetadata.founding_reservation_id = foundingReservationId
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      client_reference_id: user.id,
      line_items: [{
        price: getStripePriceId(billingConfig, billingPlan),
        quantity: 1,
      }],
      discounts: billingPlan === 'founding'
        ? [{ coupon: billingConfig.foundingCouponId }]
        : undefined,
      expires_at: foundingReservationExpiresAt
        ? Math.floor(Date.parse(foundingReservationExpiresAt) / 1000)
        : undefined,
      success_url:
        `${billingConfig.appUrl}/?upgrade_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${billingConfig.appUrl}/pricing`,
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: { product: 'edenia_plus', ...checkoutMetadata },
      },
    }, {
      idempotencyKey: getCheckoutIdempotencyKey(
        customer.id,
        foundingReservationId
          ?? `${billingPlan}-${Math.floor(
            Date.now() / (CHECKOUT_RATE_LIMIT.windowSeconds * 1000),
          )}`,
      ),
    })

    if (foundingReservationId) {
      await attachFoundingCheckoutSession(foundingReservationId, session.id)
    }

    return jsonResponse({ url: session.url })
  } catch (error) {
    if (error instanceof BillingRequestError) {
      return jsonResponse(
        { error: error.message, code: error.code },
        error.status,
        error.status === 405 ? { Allow: 'POST' } : {},
      )
    }

    const stripeType = typeof error === 'object'
      && error
      && 'rawType' in error
      ? String(error.rawType)
      : ''
    if (stripeType === 'idempotency_error') {
      return jsonResponse({
        error: 'A checkout is already being created for this account',
        code: 'checkout_already_started',
      }, 409)
    }

    console.error('create-checkout-session error:', error)
    return jsonResponse({
      error: 'Unable to create checkout session',
      code: 'checkout_creation_failed',
    }, 500)
  }
})
