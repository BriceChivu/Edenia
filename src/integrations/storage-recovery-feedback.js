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
  const reportPrefix = `${OUTBOX_KEY}_report_`
  function decode(entry) {
    try {
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(entry?.id || '')) return null
      const parsed = JSON.parse(entry.diagnostic)
      // Rebuild every field before replay; saved outbox data is untrusted.
      const diagnostic = createStorageRecoveryReport({ ...parsed,
        failure: { code: parsed.code, errorName: parsed.error?.name, errorMessage: parsed.error?.message },
        checked: parsed.storageCheckedAgain, capabilities: { ...parsed.capabilities,
          browser: [parsed.capabilities?.browser, parsed.capabilities?.platform].filter(Boolean).join(' ') } })
      const dimension = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(10000, Number(value))) : 0
      return { id: entry.id, diagnostic,
        locale: /^[a-zA-Z-]{2,12}$/.test(entry.locale || '') ? entry.locale : 'en',
        width: dimension(entry.width), height: dimension(entry.height),
        submittedAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.submittedAt || '')
          && Number.isFinite(Date.parse(entry.submittedAt)) ? entry.submittedAt : now(),
        status: 'failed', pending: null }
    } catch { return null }
  }
  const serialized = ({ id, diagnostic, locale, width, height, submittedAt }) => ({ id, diagnostic, locale, width, height, submittedAt })
  function legacyEntries(store) {
    try {
      const value = JSON.parse(store.getItem(OUTBOX_KEY) || '[]')
      return Array.isArray(value) ? value.slice(-20).map(decode).filter(Boolean) : []
    } catch { return [] }
  }
  function readEntries(store) {
    const entries = new Map(legacyEntries(store).map(entry => [entry.id, entry]))
    const keys = []
    try { for (let index = 0; index < store.length; index++) keys.push(store.key(index)) } catch {}
    for (const key of keys) {
      if (!key?.startsWith(reportPrefix)) continue
      try {
        const entry = decode(JSON.parse(store.getItem(key)))
        if (entry && key === reportPrefix + entry.id) entries.set(entry.id, entry)
      } catch {}
    }
    return [...entries.values()].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
  }
  function persist() {
    if (!enabled) return
    for (const getStore of getStores()) {
      try {
        const store = getStore()
        if (!store) continue
        // Independent keys prevent one tab from overwriting or acknowledging
        // another tab's reports. Only this instance's acknowledged IDs retire.
        for (const entry of reports.values()) {
          try {
            if (entry.status === 'sent') store.removeItem(reportPrefix + entry.id)
            else store.setItem(reportPrefix + entry.id, JSON.stringify(serialized(entry)))
          } catch {}
        }
        const retainedLegacy = []
        for (const entry of legacyEntries(store)) {
          if (reports.get(entry.id)?.status === 'sent') continue
          try {
            const raw = JSON.stringify(serialized(entry))
            store.setItem(reportPrefix + entry.id, raw)
            if (store.getItem(reportPrefix + entry.id) === raw) continue
          } catch {}
          retainedLegacy.push(serialized(entry))
        }
        if (retainedLegacy.length) store.setItem(OUTBOX_KEY, JSON.stringify(retainedLegacy))
        else store.removeItem(OUTBOX_KEY)
        const entries = readEntries(store)
        for (const entry of entries.slice(0, Math.max(0, entries.length - 20))) {
          store.removeItem(reportPrefix + entry.id)
        }
      } catch {}
    }
  }
  if (enabled) {
    for (const getStore of getStores()) {
      try {
        const store = getStore()
        if (!store) continue
        for (const entry of readEntries(store).slice(-20)) reports.set(entry.id, entry)
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
    let entry = [...reports.values()].find(value => value.diagnostic === diagnostic)
    if (entry && (!retry || entry.status !== 'failed')) return entry.pending || entry.status
    if (!entry) {
      entry = { id: createId(), diagnostic, locale: details.locale,
        width: details.width, height: details.height, submittedAt: now(), status: 'failed' }
      reports.set(entry.id, entry)
    }
    return sendEntry(entry)
  }
  report.retryPending = async () => {
    if (!enabled) return []
    return Promise.all([...reports.values()].filter(entry => entry.status === 'failed').map(sendEntry))
  }
  return report
}
