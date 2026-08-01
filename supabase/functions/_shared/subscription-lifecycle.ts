export type SubscriptionLifecycleSnapshot = {
  id: string
  status: string
  current_period_end?: number | null
  items?: {
    data?: Array<{
      current_period_end?: number | null
    }>
  } | null
}

export function getSubscriptionPeriodEnd(
  subscription: SubscriptionLifecycleSnapshot,
) {
  return subscription.current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end
    ?? null
}

export function getSubscriptionUpdate(
  subscription: SubscriptionLifecycleSnapshot,
  pastDueSince?: string,
  updatedAt = new Date().toISOString(),
) {
  const periodEnd = getSubscriptionPeriodEnd(subscription)
  return {
    status: subscription.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    past_due_since: subscription.status === 'active' ? null : pastDueSince,
    updated_at: updatedAt,
  }
}

function getPersistedLifecycleFingerprint(
  subscription: SubscriptionLifecycleSnapshot,
) {
  return JSON.stringify([
    subscription.id,
    subscription.status,
    getSubscriptionPeriodEnd(subscription),
  ])
}

export async function reconcileCurrentSubscription<
  T extends SubscriptionLifecycleSnapshot,
>(
  retrieve: () => Promise<T>,
  persist: (subscription: T) => Promise<void>,
  maxWrites = 2,
) {
  let lastWrittenFingerprint: string | null = null

  for (let writeCount = 0; writeCount < maxWrites; writeCount += 1) {
    const currentSubscription = await retrieve()
    const currentFingerprint = getPersistedLifecycleFingerprint(currentSubscription)

    if (currentFingerprint === lastWrittenFingerprint) return currentSubscription

    await persist(currentSubscription)
    lastWrittenFingerprint = currentFingerprint
  }

  const confirmedSubscription = await retrieve()
  if (
    getPersistedLifecycleFingerprint(confirmedSubscription)
    !== lastWrittenFingerprint
  ) {
    throw new Error('Stripe subscription changed while its current state was being saved')
  }

  return confirmedSubscription
}
