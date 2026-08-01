type SupabaseRateLimitClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => {
    single: () => PromiseLike<{
      data: { allowed: boolean; retry_after_seconds: number } | null
      error: { message: string } | null
    }>
  }
}

export type BillingRateLimit = {
  scope: string
  subject: string
  windowSeconds: number
  maximumRequests: number
}

export async function hashRateLimitSubject(subject: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(subject),
  )
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function consumeBillingRateLimit(
  client: SupabaseRateLimitClient,
  rateLimit: BillingRateLimit,
) {
  const subjectHash = await hashRateLimitSubject(rateLimit.subject)
  const { data, error } = await client.rpc('consume_billing_rate_limit', {
    p_scope: rateLimit.scope,
    p_subject_hash: subjectHash,
    p_window_seconds: rateLimit.windowSeconds,
    p_max_requests: rateLimit.maximumRequests,
  }).single()

  if (error) throw new Error(`Billing rate limit check failed: ${error.message}`)
  if (!data || typeof data.allowed !== 'boolean') {
    throw new Error('Billing rate limit check returned an invalid result')
  }

  return {
    allowed: data.allowed,
    retryAfterSeconds: Math.max(1, Number(data.retry_after_seconds) || 1),
  }
}
