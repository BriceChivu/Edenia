import { onCLS, onINP, onLCP } from 'web-vitals'
import { createHealthMonitor, healthMonitoringAllowed } from '../src/integrations/health-monitor.js'

// Match the established production analytics gate; internal trials are excluded.
const enabled = healthMonitoringAllowed(location.href, window.EDENIA_ANALYTICS_ENABLED)
const release = new URL(document.currentScript.src).searchParams.get('v') || 'development'
const monitor = createHealthMonitor({ enabled, release, hidden: () => document.hidden,
  capture: (event, properties) => window.posthog?.capture(event, properties) })
window.edeniaHealth = monitor
if (enabled) {
  monitor.start()
  document.addEventListener('visibilitychange', monitor.visibilityChanged)
  window.setTimeout(monitor.checkStartup, 30000)
  window.addEventListener('error', event => {
    if (event.error || event.filename) monitor.exception(event.error, event.filename, event.lineno, event.colno)
    else if (event.target?.tagName === 'SCRIPT') {
      try {
        if (new URL(event.target.src).origin === location.origin) monitor.report('app', 'failure', { reason: 'resource-failed' })
      } catch {}
    }
  }, true)
  window.addEventListener('unhandledrejection', event => monitor.exception(event.reason))
  const recordVital = metric => monitor.report('web_vital', 'observed', { metric: metric.name, value: metric.value, rating: metric.rating })
  // Standard build: no DOM attribution, selectors, URLs or element text.
  try { onLCP(recordVital); onINP(recordVital); onCLS(recordVital) } catch {}
}
