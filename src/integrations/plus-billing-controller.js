import {
  normalizePlusOffer,
  normalizePlusPlanId
} from '../domain/plus-offer.js'

export const PLUS_BILLING_OFFER_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  UNAVAILABLE: 'unavailable'
})

export const PLUS_BILLING_FEEDBACK = Object.freeze({
  BILLING_ACCOUNT_NOT_FOUND: 'billing-account-not-found',
  CHECKOUT_CANCELLED: 'checkout-cancelled',
  CHECKOUT_DISABLED: 'checkout-disabled',
  CHECKOUT_ERROR: 'checkout-error',
  CHECKOUT_LOGIN_REQUIRED: 'checkout-login-required',
  OFFER_UNAVAILABLE: 'offer-unavailable',
  PORTAL_ERROR: 'portal-error',
  RATE_LIMITED: 'rate-limited',
  SUBSCRIPTION_EXISTS: 'subscription-exists'
})

const CHECKOUT_HOST = 'checkout.stripe.com'
const PORTAL_HOST = 'billing.stripe.com'

async function readFunctionErrorCode(error) {
  try {
    const body = await error?.context?.clone?.().json?.()
      ?? await error?.context?.json?.()
    return typeof body?.code === 'string' ? body.code : ''
  } catch {
    return ''
  }
}

function validateHostedUrl(value, expectedHost) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === expectedHost
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function feedbackForCode(code, fallback) {
  if (code === 'authentication_required') {
    return PLUS_BILLING_FEEDBACK.CHECKOUT_LOGIN_REQUIRED
  }
  if (code === 'subscription_already_exists') {
    return PLUS_BILLING_FEEDBACK.SUBSCRIPTION_EXISTS
  }
  if (code === 'billing_account_not_found') {
    return PLUS_BILLING_FEEDBACK.BILLING_ACCOUNT_NOT_FOUND
  }
  if (code === 'rate_limited') return PLUS_BILLING_FEEDBACK.RATE_LIMITED
  return fallback
}

export function createPlusBillingController({
  client,
  checkoutEnabled = false,
  location: locationLike,
  onStateChange
}) {
  if (!client?.functions?.invoke) {
    throw new TypeError('Plus billing controller requires a Supabase client')
  }
  if (typeof locationLike?.assign !== 'function') {
    throw new TypeError('Plus billing controller requires browser navigation')
  }
  if (typeof onStateChange !== 'function') {
    throw new TypeError('Plus billing controller requires a state callback')
  }

  let currentState = Object.freeze({
    selectedPlan: 'annual',
    offerState: PLUS_BILLING_OFFER_STATES.IDLE,
    plans: Object.freeze([]),
    busyAction: null,
    feedback: null
  })

  function publish(patch) {
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  function selectPlan(plan) {
    return publish({ selectedPlan: normalizePlusPlanId(plan), feedback: null })
  }

  async function loadOffer() {
    publish({ offerState: PLUS_BILLING_OFFER_STATES.LOADING, feedback: null })
    try {
      const { data, error } = await client.functions.invoke('get-plus-offer', {
        body: {}
      })
      if (error) throw error
      const plans = normalizePlusOffer(data)
      if (plans.length !== 2) throw new Error('Incomplete Plus offer')
      publish({ offerState: PLUS_BILLING_OFFER_STATES.READY, plans })
      return plans
    } catch {
      publish({
        offerState: PLUS_BILLING_OFFER_STATES.UNAVAILABLE,
        plans: Object.freeze([]),
        feedback: PLUS_BILLING_FEEDBACK.OFFER_UNAVAILABLE
      })
      return Object.freeze([])
    }
  }

  async function invokeHosted(
    functionName,
    body,
    expectedHost,
    fallbackFeedback,
    requiresCheckout = false
  ) {
    if (requiresCheckout && !checkoutEnabled) {
      publish({ feedback: PLUS_BILLING_FEEDBACK.CHECKOUT_DISABLED })
      return false
    }
    publish({ busyAction: functionName, feedback: null })
    const { data, error } = await client.functions.invoke(functionName, { body })
      .catch(error => ({ data: null, error }))
    if (error) {
      publish({
        busyAction: null,
        feedback: feedbackForCode(
          await readFunctionErrorCode(error),
          fallbackFeedback
        )
      })
      return false
    }
    const hostedUrl = validateHostedUrl(data?.url, expectedHost)
    if (!hostedUrl) {
      publish({ busyAction: null, feedback: fallbackFeedback })
      return false
    }
    locationLike.assign(hostedUrl)
    return true
  }

  function startCheckout(plan = currentState.selectedPlan) {
    const selectedPlan = normalizePlusPlanId(plan)
    publish({ selectedPlan })
    return invokeHosted(
      'create-checkout-session',
      { plan: selectedPlan },
      CHECKOUT_HOST,
      PLUS_BILLING_FEEDBACK.CHECKOUT_ERROR,
      true
    )
  }

  function openBillingPortal() {
    return invokeHosted(
      'create-billing-portal',
      {},
      PORTAL_HOST,
      PLUS_BILLING_FEEDBACK.PORTAL_ERROR
    )
  }

  return Object.freeze({
    getState: () => currentState,
    loadOffer,
    openBillingPortal,
    selectPlan,
    startCheckout
  })
}
