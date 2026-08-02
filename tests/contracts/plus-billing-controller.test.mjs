import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlusBillingController,
  PLUS_BILLING_FEEDBACK,
  PLUS_BILLING_OFFER_STATES
} from '../../src/integrations/plus-billing-controller.js'

function harness({ checkoutEnabled = true, responses = {} } = {}) {
  const calls = []
  const navigations = []
  const states = []
  const controller = createPlusBillingController({
    checkoutEnabled,
    client: {
      functions: {
        async invoke(name, options) {
          calls.push([name, options])
          return responses[name] || { data: null, error: new Error('missing') }
        }
      }
    },
    location: { assign(url) { navigations.push(url) } },
    onStateChange(state) { states.push(state) }
  })
  return { calls, controller, navigations, states }
}

test('billing controller loads authoritative prices and validates Stripe navigation', async () => {
  const test = harness({ responses: {
    'get-plus-offer': { data: { plans: [
      { id: 'monthly', currency: 'usd', unit_amount: 500, interval: 'month', interval_count: 1 },
      { id: 'annual', currency: 'usd', unit_amount: 4800, interval: 'year', interval_count: 1 }
    ] }, error: null },
    'create-checkout-session': {
      data: { url: 'https://checkout.stripe.com/c/pay/test' }, error: null
    },
    'create-billing-portal': {
      data: { url: 'https://billing.stripe.com/p/session/test' }, error: null
    }
  } })
  assert.equal((await test.controller.loadOffer()).length, 2)
  assert.equal(test.controller.getState().offerState, PLUS_BILLING_OFFER_STATES.READY)
  await test.controller.startCheckout('monthly')
  await test.controller.openBillingPortal()
  assert.deepEqual(test.navigations, [
    'https://checkout.stripe.com/c/pay/test',
    'https://billing.stripe.com/p/session/test'
  ])
  assert.deepEqual(test.calls[1], [
    'create-checkout-session', { body: { plan: 'monthly' } }
  ])
})

test('billing controller keeps checkout dormant and rejects untrusted redirects', async () => {
  const disabled = harness({ checkoutEnabled: false })
  assert.equal(await disabled.controller.startCheckout(), false)
  assert.equal(disabled.calls.length, 0)
  assert.equal(
    disabled.controller.getState().feedback,
    PLUS_BILLING_FEEDBACK.CHECKOUT_DISABLED
  )

  const unsafe = harness({ responses: {
    'create-checkout-session': {
      data: { url: 'https://example.com/not-stripe' }, error: null
    }
  } })
  assert.equal(await unsafe.controller.startCheckout(), false)
  assert.equal(unsafe.navigations.length, 0)
  assert.equal(unsafe.controller.getState().feedback, PLUS_BILLING_FEEDBACK.CHECKOUT_ERROR)
})
