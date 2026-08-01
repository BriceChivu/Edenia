import {
  PLUS_ENTITLEMENT_STATES
} from './plus-access-policy.js'

export const PLUS_SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE: 'active',
  PAST_DUE: 'past_due'
})

export function getPlusEntitlementState(subscription) {
  if (subscription?.status === PLUS_SUBSCRIPTION_STATUSES.ACTIVE) {
    return PLUS_ENTITLEMENT_STATES.PLUS
  }
  if (subscription?.status === PLUS_SUBSCRIPTION_STATUSES.PAST_DUE) {
    return PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
  }
  return PLUS_ENTITLEMENT_STATES.FREE
}

export async function readPlusEntitlement(client, userId) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('Plus entitlement requires a Supabase client')
  }
  if (!userId) {
    throw new TypeError('Plus entitlement requires an authenticated user')
  }

  const { data, error } = await client
    .from('subscriptions')
    .select('status, plan, current_period_end, past_due_since, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  return Object.freeze({
    entitlementState: getPlusEntitlementState(data),
    subscriptionStatus: data?.status || null,
    plan: data?.plan || null,
    currentPeriodEnd: data?.current_period_end || null,
    pastDueSince: data?.past_due_since || null,
    updatedAt: data?.updated_at || null
  })
}
