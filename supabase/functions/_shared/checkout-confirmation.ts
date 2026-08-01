export const PLUS_ENTITLED_SUBSCRIPTION_STATUSES = ['active', 'past_due'] as const

export type CheckoutSubscriptionConfirmation = {
  user_id?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  status?: string | null
  plan?: string | null
}

export type ExpectedCheckoutSubscription = {
  customerId: string
  subscriptionId: string
  plan: string
}

export type CheckoutConfirmationResult =
  | { state: 'pending' }
  | { state: 'confirmed'; userId: string }
  | {
    state: 'invalid'
    code: 'checkout_confirmation_mismatch' | 'checkout_subscription_not_entitled'
    message: string
  }

export function evaluateCheckoutConfirmation(
  subscription: CheckoutSubscriptionConfirmation | null,
  expected: ExpectedCheckoutSubscription,
): CheckoutConfirmationResult {
  if (!subscription) return { state: 'pending' }

  if (
    !subscription.user_id
    || subscription.stripe_customer_id !== expected.customerId
    || subscription.stripe_subscription_id !== expected.subscriptionId
    || subscription.plan !== expected.plan
  ) {
    return {
      state: 'invalid',
      code: 'checkout_confirmation_mismatch',
      message: 'Confirmed subscription does not match the Checkout Session',
    }
  }

  if (!(PLUS_ENTITLED_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscription.status || '')) {
    return {
      state: 'invalid',
      code: 'checkout_subscription_not_entitled',
      message: 'Confirmed subscription does not currently grant Plus access',
    }
  }

  return { state: 'confirmed', userId: subscription.user_id }
}
