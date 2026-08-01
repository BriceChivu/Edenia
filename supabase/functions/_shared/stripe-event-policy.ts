export const STRIPE_BILLING_EVENT_ACTIONS = Object.freeze({
  RELEASE_FOUNDING_RESERVATION: 'release-founding-reservation',
  COMPLETE_CHECKOUT: 'complete-checkout',
  RECONCILE_SUBSCRIPTION: 'reconcile-subscription',
  RECONCILE_PAID_INVOICE: 'reconcile-paid-invoice',
  RECONCILE_FAILED_INVOICE: 'reconcile-failed-invoice',
  IGNORE: 'ignore',
} as const)

const STRIPE_BILLING_EVENT_ACTION_BY_TYPE = new Map<string, string>([
  ['checkout.session.expired', STRIPE_BILLING_EVENT_ACTIONS.RELEASE_FOUNDING_RESERVATION],
  ['checkout.session.async_payment_failed', STRIPE_BILLING_EVENT_ACTIONS.RELEASE_FOUNDING_RESERVATION],
  ['checkout.session.completed', STRIPE_BILLING_EVENT_ACTIONS.COMPLETE_CHECKOUT],
  ['checkout.session.async_payment_succeeded', STRIPE_BILLING_EVENT_ACTIONS.COMPLETE_CHECKOUT],
  ['customer.subscription.updated', STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_SUBSCRIPTION],
  ['customer.subscription.deleted', STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_SUBSCRIPTION],
  ['customer.subscription.paused', STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_SUBSCRIPTION],
  ['customer.subscription.resumed', STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_SUBSCRIPTION],
  ['invoice.paid', STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_PAID_INVOICE],
  ['invoice.payment_failed', STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_FAILED_INVOICE],
])

export function getStripeBillingEventAction(eventType: string) {
  return STRIPE_BILLING_EVENT_ACTION_BY_TYPE.get(eventType)
    || STRIPE_BILLING_EVENT_ACTIONS.IGNORE
}
