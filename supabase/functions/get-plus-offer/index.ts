import Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { createClient } from '@supabase/supabase-js'
import {
  getStripePriceId,
  readStripeOfferConfig,
} from '../_shared/billing-config.ts'
import {
  assertOnlyKeys,
  BillingRequestError,
  getClientAddress,
  readJsonObject,
} from '../_shared/billing-request.ts'
import { consumeBillingRateLimit } from '../_shared/billing-rate-limit.ts'
import { corsHeaders, getCorsPreflightResponse } from '../_shared/cors.ts'
import { normalizePublicPlusPlan } from '../_shared/plus-offer.ts'

const billingConfig = readStripeOfferConfig(name => Deno.env.get(name))
const stripe = new Stripe(billingConfig.secretKey, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const OFFER_CACHE_MS = 5 * 60_000
let cachedOffer: { expiresAt: number; plans: unknown[] } | null = null

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      'Content-Type': 'application/json',
    },
  })
}

async function readOffer() {
  if (cachedOffer && cachedOffer.expiresAt > Date.now()) return cachedOffer.plans
  const [monthlyPrice, annualPrice] = await Promise.all([
    stripe.prices.retrieve(getStripePriceId(billingConfig, 'monthly')),
    stripe.prices.retrieve(getStripePriceId(billingConfig, 'annual')),
  ])
  const plans = [
    normalizePublicPlusPlan('monthly', monthlyPrice),
    normalizePublicPlusPlan('annual', annualPrice),
  ]
  cachedOffer = { expiresAt: Date.now() + OFFER_CACHE_MS, plans }
  return plans
}

Deno.serve(async request => {
  const preflightResponse = getCorsPreflightResponse(request)
  if (preflightResponse) return preflightResponse

  try {
    const body = await readJsonObject(request)
    assertOnlyKeys(body, [])
    const rateLimit = await consumeBillingRateLimit(supabase, {
      scope: 'read-plus-offer-network',
      subject: getClientAddress(request.headers),
      windowSeconds: 60,
      maximumRequests: 30,
    })
    if (!rateLimit.allowed) {
      return jsonResponse({
        error: 'Too many offer requests. Please try again shortly.',
        code: 'rate_limited',
      }, 429)
    }
    return jsonResponse({ plans: await readOffer() })
  } catch (error) {
    if (error instanceof BillingRequestError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status)
    }
    console.error('get-plus-offer error:', error)
    return jsonResponse({
      error: 'Unable to load the Edenia Plus offer',
      code: 'offer_unavailable',
    }, 500)
  }
})
