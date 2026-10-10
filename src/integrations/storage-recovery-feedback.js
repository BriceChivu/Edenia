import { createStorageRecoveryReport } from '../state/profile-storage-recovery.js'

// Existing public ingestion token. The active feedback_submitted destination
// sends the diagnostic to Discord, independently of product analytics consent.
export const FEEDBACK_CAPTURE_URL = 'https://us.i.posthog.com/capture/'
export const FEEDBACK_PROJECT_TOKEN = 'phc_soeip95Z57vX8tK5rCMEjh7nDsmyR7gmJtSFRk59FyWg'
const OUTBOX_KEY = 'edenia_storage_feedback_outbox_v1'

export function createStorageRecoveryFeedback({
  fetch: send = globalThis.fetch, location, now = () => new Date().toISOString(),
  createId = () => globalThis.crypto.randomUUID(),
  getStores = () => [() => globalThis.localStorage, () => globalThis.sessionStorage]
}) {
  const enabled = ['https://edenia.study', 'https://www.edenia.study'].includes(location.origin)
  const reports = new Map()
  function persist() {
    if (!enabled) return
    const entries = [...reports.values()].filter(entry => entry.status !== 'sent').slice(-20)
      .map(({ id, diagnostic, locale, width, height, submittedAt }) => ({ id, diagnostic, locale, width, height, submittedAt }))
    for (const getStore of getStores()) {
      try {
        const store = getStore()
        if (!store) continue
        if (entries.length) store.setItem(OUTBOX_KEY, JSON.stringify(entries))
        else store.removeItem(OUTBOX_KEY)
      } catch {}
    }
  }
  if (enabled) {
    for (const getStore of getStores()) {
      try {
        const entries = JSON.parse(getStore()?.getItem(OUTBOX_KEY) || '[]')
        for (const entry of Array.isArray(entries) ? entries.slice(-20) : []) {
          if (!/^[a-zA-Z0-9-]{1,80}$/.test(entry.id || '')) continue
          const parsed = JSON.parse(entry.diagnostic)
          // Rebuild the safe schema; never replay arbitrary saved event data.
          const diagnostic = createStorageRecoveryReport({ ...parsed, failure: { code: parsed.code, errorName: parsed.error?.name, errorMessage: parsed.error?.message }, checked: parsed.storageCheckedAgain, capabilities: { ...parsed.capabilities, browser: [parsed.capabilities?.browser, parsed.capabilities?.platform].filter(Boolean).join(' ') } })
          reports.set(diagnostic, { ...entry, diagnostic, status: 'failed', pending: null })
        }
      } catch {}
    }
  }
  async function deliver(entry) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await send(FEEDBACK_CAPTURE_URL, {
        method: 'POST', credentials: 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: FEEDBACK_PROJECT_TOKEN, event: 'feedback_submitted',
          uuid: entry.id, distinct_id: `storage-report-${entry.id}`,
          properties: {
            $process_person_profile: false,
            feedback_id: entry.id, feedback_category: 'bug',
            feedback_source: 'automatic_storage_recovery',
            feedback_name: null, feedback_email: null,
            feedback_message: `Automatic storage recovery report\n${entry.diagnostic}`,
            app_version: JSON.parse(entry.diagnostic).release,
            page_url: `${location.origin}/`, session_replay_url: null,
            locale: /^[a-zA-Z-]{2,12}$/.test(entry.locale || '') ? entry.locale : 'en',
            viewport_width: Number(entry.width) || 0,
            viewport_height: Number(entry.height) || 0, submitted_at: entry.submittedAt
          }
        })
      })
      return response.ok ? 'sent' : 'failed'
    } catch { return 'failed' }
    finally { clearTimeout(timeout) }
  }
  async function sendEntry(entry) {
    if (entry.pending) return entry.pending
    entry.status = 'sending'
    entry.pending = deliver(entry)
    persist()
    entry.status = await entry.pending
    entry.pending = null
    persist()
    return entry.status
  }
  async function report(details, { retry = false } = {}) {
    if (!enabled) return 'unavailable'
    const diagnostic = createStorageRecoveryReport(details)
    let entry = reports.get(diagnostic)
    if (entry && (!retry || entry.status !== 'failed')) return entry.pending || entry.status
    if (!entry) {
      entry = { id: createId(), diagnostic, locale: details.locale,
        width: details.width, height: details.height, submittedAt: now(), status: 'failed' }
      reports.set(diagnostic, entry)
    }
    return sendEntry(entry)
  }
  report.retryPending = async () => {
    if (!enabled) return []
    return Promise.all([...reports.values()].filter(entry => entry.status === 'failed').map(sendEntry))
  }
  return report
}
