// Only this fixed vocabulary may cross IPC or enter a durable receipt. Never
// serialize Error objects, URL/header/body values, or paths from this transport.
const failures = new Set([
  'authorization-denied', 'deadline', 'upstream-reset', 'upstream-timeout',
  'upstream-tls', 'upstream-network', 'response-bound', 'response-redirect',
  'response-encoding', 'deployment-mismatch', 'owner-verification',
  'request-processing', 'document-response', 'document-not-delivered',
  'worker-initialization', 'browser-start', 'browser-exit', 'browser-lock',
  'lease-invalid', 'cleanup-failed', 'worker-exit', 'worker-error',
  'wrapper-timeout', 'progress-callback', 'unknown'
])
const connections = new Set(['client-tls', 'client-http', 'connect-rejected'])
export function sanitizeNativeAuthenticationDiagnostic(value) {
  return {
    browserStarted: value?.browserStarted === true,
    documentDelivered: value?.documentDelivered === true,
    failure: value?.failure == null ? null : failures.has(value.failure) ? value.failure : 'unknown',
    connectionFailure: connections.has(value?.connectionFailure) ? value.connectionFailure : null
  }
}
export function nativeUpstreamFailure(error) {
  if (error?.code === 'ECONNRESET') return 'upstream-reset'
  if (error?.code === 'ETIMEDOUT') return 'upstream-timeout'
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error?.code)) return 'upstream-tls'
  return 'upstream-network'
}
