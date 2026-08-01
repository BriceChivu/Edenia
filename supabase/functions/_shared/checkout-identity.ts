const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'incomplete',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
])

export function normalizeCheckoutEmail(value: unknown) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  return email
}

export function isBlockingSubscriptionStatus(status: string) {
  return BLOCKING_SUBSCRIPTION_STATUSES.has(status)
}

export async function hashCheckoutIdentity(email: string) {
  const bytes = new TextEncoder().encode(email)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function getCustomerIdempotencyKey(emailHash: string) {
  return `edenia-plus-customer-${emailHash}`
}

export function getCheckoutIdempotencyKey(customerId: string, attemptId?: string) {
  const attemptSuffix = attemptId ? `-${attemptId}` : ''
  return `edenia-plus-checkout-${customerId}${attemptSuffix}`
}
