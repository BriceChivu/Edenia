import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import { readStripePortalConfig } from '../_shared/billing-config.ts'
import {
  assertOnlyKeys,
  BillingRequestError,
  getBearerToken,
  readJsonObject,
} from '../_shared/billing-request.ts'
import { consumeBillingRateLimit } from '../_shared/billing-rate-limit.ts'
import { corsHeaders, getCorsPreflightResponse } from '../_shared/cors.ts'

const billingConfig = readStripePortalConfig(name => Deno.env.get(name))
const stripe = new Stripe(billingConfig.secretKey, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getAuthenticatedUser(request: Request) {
  const token = getBearerToken(request.headers.get('authorization'))
  if (!token) {
    throw new BillingRequestError('Authentication is required', 401, 'authentication_required')
  }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) {
    throw new BillingRequestError('Authentication is required', 401, 'authentication_required')
  }
  return data.user
}

Deno.serve(async request => {
  const preflightResponse = getCorsPreflightResponse(request)
  if (preflightResponse) return preflightResponse

  try {
    const body = await readJsonObject(request)
    assertOnlyKeys(body, [])
    const user = await getAuthenticatedUser(request)
    const rateLimit = await consumeBillingRateLimit(supabase, {
      scope: 'create-billing-portal-user',
      subject: user.id,
      windowSeconds: 10 * 60,
      maximumRequests: 10,
    })
    if (!rateLimit.allowed) {
      return jsonResponse({
        error: 'Too many billing portal requests. Please try again shortly.',
        code: 'rate_limited',
      }, 429)
    }

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!subscription?.stripe_customer_id) {
      throw new BillingRequestError(
        'No billing account is available for this user',
        404,
        'billing_account_not_found',
      )
    }

    const customer = await stripe.customers.retrieve(
      subscription.stripe_customer_id,
    )
    if (customer.deleted) {
      throw new BillingRequestError(
        'No billing account is available for this user',
        404,
        'billing_account_not_found',
      )
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${billingConfig.appUrl}/plus/?billing_return=1`,
    })
    return jsonResponse({ url: portal.url })
  } catch (error) {
    if (error instanceof BillingRequestError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status)
    }
    console.error('create-billing-portal error:', error)
    return jsonResponse({
      error: 'Unable to open billing management',
      code: 'billing_portal_failed',
    }, 500)
  }
})
