// Preserve synchronous adapters while allowing durable IndexedDB transactions.
export function mapPersistenceResult(result, complete) {
  return result && typeof result.then === 'function'
    ? result.then(complete)
    : complete(result)
}
