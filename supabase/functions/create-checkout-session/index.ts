// supabase/functions/create-checkout-session/index.ts
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import { corsHeaders, getCorsPreflightResponse } from '../_shared/cors.ts'
import {
  getCheckoutIdempotencyKey,
  getCustomerIdempotencyKey,
  hashCheckoutIdentity,
  isBlockingSubscriptionStatus,
  normalizeCheckoutEmail,
} from '../_shared/checkout-identity.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const PRICE_IDS = {
  monthly: 'price_1TwWsIF7C1CEqvuxK5q0NvuT',
  annual: 'price_1TwWsIF7C1CEqvux1TSBLVsn',
}

const FOUNDING_COUPON_ID = 'founding-member-first-year'
const FOUNDING_CHECKOUT_DURATION_MS = 31 * 60_000

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function findCustomersByEmail(email: string) {
  const customers: Stripe.Customer[] = []
  for await (const customer of stripe.customers.list({ email, limit: 100 })) {
    customers.push(customer)
  }
  return customers
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

async function attachFoundingCheckoutSession(reservationId: string, sessionId: string) {
  const { data: attached, error } = await supabase.rpc('attach_founding_checkout_session', {
    p_reservation_id: reservationId,
    p_session_id: sessionId,
  })
  if (error) throw error
  if (attached !== true) throw new Error('Founding Checkout reservation could not be attached')
}

Deno.serve(async (req) => {
  const preflightResponse = getCorsPreflightResponse(req)
  if (preflightResponse) return preflightResponse

  try {
    const { plan, email: requestedEmail } = await req.json()
    const email = normalizeCheckoutEmail(requestedEmail)

    if (!['monthly', 'annual', 'founding'].includes(plan)) {
      return jsonResponse({ error: 'Invalid plan', code: 'invalid_plan' }, 400)
    }

    if (!email) {
      return jsonResponse({
        error: 'A valid email is required',
        code: 'checkout_email_required',
      }, 400)
    }

    const emailHash = await hashCheckoutIdentity(email)
    const existingCustomers = await findCustomersByEmail(email)
    let openCheckout: Stripe.Checkout.Session | null = null

    for (const customer of existingCustomers) {
      if (await customerHasBlockingSubscription(customer.id)) {
        return jsonResponse({
          error: 'An existing subscription must be managed instead of purchased again',
          code: 'subscription_already_exists',
        }, 409)
      }
      openCheckout ??= await findOpenCheckout(customer.id)
    }

    if (openCheckout) {
      if (openCheckout.metadata?.plan !== plan || !openCheckout.url) {
        return jsonResponse({
          error: 'A checkout is already in progress for this email',
          code: 'checkout_already_started',
        }, 409)
      }

      const existingReservationId = openCheckout.metadata?.founding_reservation_id
      if (plan === 'founding' && existingReservationId) {
        await attachFoundingCheckoutSession(existingReservationId, openCheckout.id)
      }

      return jsonResponse({ url: openCheckout.url, resumed: true })
    }

    const customer = existingCustomers[0] ?? await stripe.customers.create({
      email,
      metadata: { product: 'edenia_plus' },
    }, {
      idempotencyKey: getCustomerIdempotencyKey(emailHash),
    })

    let foundingReservationId: string | null = null
    let foundingReservationExpiresAt: string | null = null

    if (plan === 'founding') {
      const requestedExpiry = new Date(Date.now() + FOUNDING_CHECKOUT_DURATION_MS).toISOString()
      const { data: reservation, error: reservationError } = await supabase
        .rpc('reserve_founding_checkout_slot', {
          p_email_hash: emailHash,
          p_expires_at: requestedExpiry,
        })
        .single()

      if (reservationError) {
        if (reservationError.message?.includes('founding_slots_full')) {
          return jsonResponse({
            error: 'Founding slots are full',
            code: 'founding_slots_full',
          }, 409)
        }
        throw reservationError
      }

      foundingReservationId = reservation.reservation_id
      foundingReservationExpiresAt = reservation.reservation_expires_at
      if (!foundingReservationId || !foundingReservationExpiresAt) {
        throw new Error('Founding Checkout reservation is incomplete')
      }
    }

    const checkoutMetadata: Record<string, string> = { plan }
    if (foundingReservationId) {
      checkoutMetadata.founding_reservation_id = foundingReservationId
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      client_reference_id: customer.id,
      line_items: [{ price: PRICE_IDS[plan === 'founding' ? 'annual' : plan], quantity: 1 }],
      discounts: plan === 'founding' ? [{ coupon: FOUNDING_COUPON_ID }] : undefined,
      expires_at: foundingReservationExpiresAt
        ? Math.floor(Date.parse(foundingReservationExpiresAt) / 1000)
        : undefined,
      success_url: `${Deno.env.get('APP_URL')}/?upgrade_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${Deno.env.get('APP_URL')}/pricing`,
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: { product: 'edenia_plus', ...checkoutMetadata },
      },
    }, {
      idempotencyKey: getCheckoutIdempotencyKey(
        customer.id,
        foundingReservationId ?? undefined,
      ),
    })

    if (foundingReservationId) {
      await attachFoundingCheckoutSession(foundingReservationId, session.id)
    }

    return jsonResponse({ url: session.url })
  } catch (err) {
    const stripeType = typeof err === 'object' && err && 'rawType' in err
      ? String(err.rawType)
      : ''
    if (stripeType === 'idempotency_error') {
      return jsonResponse({
        error: 'A checkout is already being created for this email',
        code: 'checkout_already_started',
      }, 409)
    }

    console.error('create-checkout-session error:', err)
    return jsonResponse({
      error: 'Unable to create checkout session',
      code: 'checkout_creation_failed',
    }, 500)
  }
})
