// Supabase normally removes its saved session on sign-out failures. A failed
// refresh of an already expired token can return before that removal; a rejected
// proactive refresh can also retain a still-valid cached token. Capture
// only this route's Auth slots, and never remove a replacement session.
export function prepareLocalAuthSessionRetirement({ storage, storageKey }) {
  const keys = [storageKey, `${storageKey}-user`, `${storageKey}-code-verifier`]
  const captured = keys.map(key => storage.getItem(key))
  return (isCurrent = () => true) => {
    if (!isCurrent() || keys.some((key, index) => storage.getItem(key) !== captured[index])) {
      return false
    }
    for (const key of keys) {
      if (!isCurrent()) return false
      storage.removeItem(key)
    }
    return keys.every(key => storage.getItem(key) === null)
  }
}
