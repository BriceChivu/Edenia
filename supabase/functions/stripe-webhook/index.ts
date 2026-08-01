// supabase/functions/stripe-webhook/index.ts
import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import { findAuthUserByEmail } from '../_shared/auth-user-lookup.ts'
import {
  getStripeReferenceId,
  isPaidEdeniaPlusCheckoutSession,
} from '../_shared/checkout-payment.ts'
import { isBlockingSubscriptionStatus } from '../_shared/checkout-identity.ts'
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

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

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

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    // This verifies the request genuinely came from Stripe — never skip this
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        await releaseFoundingReservation(event.data.object as Stripe.Checkout.Session)
        break
      }

      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        const email = session.customer_details?.email
        const plan = session.metadata?.plan

        if (!isPaidEdeniaPlusCheckoutSession(session)) {
          console.warn('Ignoring Checkout Session that is not a paid Edenia Plus subscription', {
            eventType: event.type,
            sessionId: session.id,
            mode: session.mode,
            status: session.status,
            paymentStatus: session.payment_status,
            plan,
          })
          break
        }

        if (!email) {
          throw new Error(`Paid Checkout Session ${session.id} has no customer email`)
        }

        const stripeCustomerId = getStripeReferenceId(session.customer)!
        const stripeSubscriptionId = getStripeReferenceId(session.subscription)!

        // Find or create the Supabase user for this email
        let userId: string
        const match = await findAuthUserByEmail(
          email,
          async pagination => requireDependencySuccess(
            await supabase.auth.admin.listUsers(pagination),
            'List Supabase users',
          ),
        )

        if (match) {
          userId = match.id
        } else {
          const created = requireDependencySuccess(
            await supabase.auth.admin.createUser({
              email,
              email_confirm: true,
            }),
            'Create Supabase user',
          )
          if (!created.user) throw new Error('Supabase user creation returned no user')
          userId = created.user.id
        }

        const currentRecord = requireDependencySuccess(
          await supabase.from('subscriptions')
            .select('stripe_subscription_id')
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
            // Backward compatibility for founding Sessions opened before atomic
            // reservations were deployed. The database trigger still caps these.
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
                ...getSubscriptionUpdate(currentSubscription),
                plan,
              }, { onConflict: 'user_id' }),
              'Upsert subscription',
            )
          },
        )
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const eventSubscription = event.data.object as Stripe.Subscription

        await reconcileCurrentSubscription(
          () => retrieveCurrentSubscription(eventSubscription.id),
          async currentSubscription => {
            requireAffectedRows(
              await supabase.from('subscriptions')
                .update(getSubscriptionUpdate(currentSubscription))
                .eq('stripe_subscription_id', currentSubscription.id)
                .select('user_id'),
              'Update subscription lifecycle',
            )
          },
        )
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeSubscriptionId = getStripeReferenceId(invoice.subscription)
        if (!stripeSubscriptionId) {
          console.warn('Ignoring failed invoice without a subscription', { invoiceId: invoice.id })
          break
        }

        const failedAt = new Date(event.created * 1000).toISOString()

        await reconcileCurrentSubscription(
          () => retrieveCurrentSubscription(stripeSubscriptionId),
          async currentSubscription => {
            requireAffectedRows(
              await supabase.from('subscriptions')
                .update(getSubscriptionUpdate(currentSubscription, failedAt))
                .eq('stripe_subscription_id', currentSubscription.id)
                .select('user_id'),
              'Update failed-payment subscription',
            )
          },
        )
        break
      }
    }
  } catch (err) {
    console.error('Stripe webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      operation: err instanceof WebhookDependencyError ? err.operation : undefined,
      error: err instanceof Error ? err.message : String(err),
    })
    return new Response(JSON.stringify({
      received: false,
      error: 'Webhook processing failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
