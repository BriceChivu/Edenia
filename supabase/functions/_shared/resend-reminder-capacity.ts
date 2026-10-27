// Read-only account-wide usage. This endpoint cannot prove billing settings:
// an independent operator attestation of Free/no-overage is still required.
const USAGE_URL = 'https://api.resend.com/usage'
const MAX_BYTES = 16 * 1024

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
export type ResendReminderCapacity = Readonly<{
  dailyUsed: number
  monthlyUsed: number
  dailyResetsAt: string
  monthlyResetsAt: string
  observedAt: string
}>

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function boundedJson(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('capacity_unavailable')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BYTES) {
        await reader.cancel()
        throw new Error('capacity_unavailable')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
}

function period(value: unknown, limit: number, observed: number, maxAge: number) {
  if (!record(value) || value.limit !== limit
    || !Number.isSafeInteger(value.used) || Number(value.used) < 0
    || !Number.isSafeInteger(value.sent) || Number(value.sent) < 0
    || !Number.isSafeInteger(value.received) || Number(value.received) < 0
    || Number(value.used) !== Number(value.sent) + Number(value.received)
    || typeof value.resets_at !== 'string') throw new Error('capacity_unavailable')
  const reset = Date.parse(value.resets_at)
  if (!Number.isFinite(reset) || reset <= observed || reset - observed > maxAge) {
    throw new Error('capacity_unavailable')
  }
  return { used: Number(value.used), resetsAt: new Date(reset).toISOString() }
}

export async function readResendReminderCapacity(apiKey: string, {
  fetcher = fetch,
  now = () => Date.now(),
  timeoutMs = 5_000,
}: { fetcher?: Fetcher; now?: () => number; timeoutMs?: number } = {}): Promise<ResendReminderCapacity | null> {
  if (!/^re_[A-Za-z0-9_-]{8,253}$/u.test(apiKey)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) return null
  const observed = now()
  if (!Number.isFinite(observed)) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(USAGE_URL, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const body = await boundedJson(response)
    if (!record(body) || body.object !== 'usage' || !record(body.emails)) return null
    const daily = period(body.emails.daily, 100, observed, 24 * 60 * 60 * 1000)
    const monthly = period(body.emails.monthly, 3000, observed, 31 * 24 * 60 * 60 * 1000)
    // UTC-day rollover during a slow response must be refreshed, never reused.
    if (now() >= Date.parse(daily.resetsAt)) return null
    return Object.freeze({ dailyUsed: daily.used, monthlyUsed: monthly.used,
      dailyResetsAt: daily.resetsAt, monthlyResetsAt: monthly.resetsAt,
      observedAt: new Date(observed).toISOString() })
  } catch { return null } finally { clearTimeout(timeout) }
}
