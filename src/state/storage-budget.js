// localStorage implementations commonly account UTF-16 code units. Use the
// conservative size, including keys; storage.estimate() measures a different pool.
export function storageBytes(value) {
  return JSON.stringify(value).length * 2
}

export function budgetRecentEntries(entries, {
  maxBytes, targetBytes = Math.floor(maxBytes * 0.75), newestLast = false,
  preserveNewest = false
}) {
  const recent = newestLast ? entries.toReversed() : [...entries]
  const retained = []
  let bytes = 4
  for (const entry of recent) {
    const entryBytes = storageBytes(entry) + 2
    if (bytes + entryBytes > targetBytes && retained.length) break
    if (bytes + entryBytes > maxBytes) {
      if (!retained.length && preserveNewest) {
        throw new DOMException('The latest Undo action exceeds its byte budget', 'QuotaExceededError')
      }
      break
    }
    retained.push(entry)
    bytes += entryBytes
  }
  return newestLast ? retained.reverse() : retained
}

export function budgetObjectCache(cache, maxBytes = 64 * 1024) {
  const entries = Object.entries(cache)
    .sort(([, a], [, b]) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0))
  return Object.fromEntries(budgetRecentEntries(entries, { maxBytes }))
}
