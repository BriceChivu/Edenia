// Pure request-policy mechanics. A browser adapter must intercept every request
// before dispatch (including workers and alternate transports) to enforce this.
// Constructing this object alone does not establish a guarded live browser.
export function createCanaryOperationGuard({ rules, startedAt, timeoutMs, now = Date.now }) {
  if (!Array.isArray(rules) || rules.length === 0 || !Number.isSafeInteger(startedAt)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000
    || !Number.isSafeInteger(startedAt + timeoutMs)) throw new Error('Invalid guard policy')
  const counts = new Map()
  const policies = new Map()
  for (const rule of rules) {
    if (!/^[a-z0-9-]{1,80}$/u.test(rule.id) || counts.has(rule.id)
      || !['GET', 'POST', 'OPTIONS'].includes(rule.method)
      || !Number.isSafeInteger(rule.expected) || rule.expected < 0) throw new Error('Invalid guard rule')
    let url
    try { url = new URL(rule.url) } catch { throw new Error('Invalid guard endpoint') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid guard endpoint')
    const key = `${rule.method} ${url.href}`
    if (policies.has(key)) throw new Error('Duplicate guard endpoint')
    policies.set(key, { id: rule.id, expected: rule.expected })
    counts.set(rule.id, 0)
  }
  let failed = false
  let sealed = false
  let lastTime = startedAt
  function current() {
    const time = now()
    if (!Number.isSafeInteger(time) || time < lastTime || time >= startedAt + timeoutMs) failed = true
    lastTime = time
    return !failed && !sealed
  }
  return {
    allow({ method, url }) {
      if (!current()) return false
      let normalized
      try { normalized = new URL(url).href } catch { failed = true; return false }
      const rule = policies.get(`${method} ${normalized}`)
      if (!rule || counts.get(rule.id) >= rule.expected) { failed = true; return false }
      counts.set(rule.id, counts.get(rule.id) + 1)
      return true
    },
    abort() { failed = true },
    finish() {
      const onTime = current()
      sealed = true
      return {
        complete: onTime && [...policies.values()].every(rule => counts.get(rule.id) === rule.expected),
        // Emit opaque operation IDs and counts only, never URLs or request bodies.
        counts: Object.fromEntries(counts)
      }
    }
  }
}
