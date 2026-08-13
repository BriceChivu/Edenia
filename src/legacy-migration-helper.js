import {
  createLegacyProgressReturnUrl,
  deriveLegacyProgressHelperRuntime
} from './integrations/legacy-progress-helper-config.js'
import {
  isValidStateBackupEntry
} from './state/backups.js'
import {
  parseLegacyStateBackupEntries,
  readIndexedDbBackupEntries
} from './state/indexed-db-backups.js'
import {
  createEncryptedProgressTransfer
} from './state/legacy-progress-crypto.js'
import {
  serializeLegacyProgressRecoveryEvidence
} from './state/legacy-progress-recovery-evidence.js'
import {
  createPortableProgressEnvelope,
  sanitizePortableProgressState,
  selectPortableProgressCandidate
} from './state/portable-state.js'
import { isValidStateShape } from './state/persistence-contract.js'

const PRIMARY_KEY = 'edenia_v1'
const BACKUP_KEY = 'edenia_v1_backups'

function canonicalIsoDate(value) {
  if (typeof value !== 'string' || !value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function primaryIsPortable(raw) {
  if (typeof raw !== 'string' || !raw) return false
  try {
    return Boolean(sanitizePortableProgressState(JSON.parse(raw)))
  } catch {
    return false
  }
}

export async function submitEncryptedTransfer({
  AbortControllerImpl = globalThis.AbortController,
  clearTimeoutImpl = globalThis.clearTimeout,
  encrypted,
  fetchImpl,
  now = () => Date.now(),
  runtime,
  setTimeoutImpl = globalThis.setTimeout,
  timeoutMs = 12_000
}) {
  const requestBody = {
    capability_digest: encrypted.capabilityDigest,
    ciphertext: encrypted.ciphertext,
    ciphertext_bytes: encrypted.ciphertextBytes,
    ciphertext_digest: encrypted.ciphertextDigest,
    iv: encrypted.iv
  }
  const controller = new AbortControllerImpl()
  const timeoutId = setTimeoutImpl(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(runtime.createTransferUrl, {
      method: 'POST',
      headers: {
        apikey: runtime.supabasePublishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    })
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      return false
    }
    const result = await response.json()
    const expiresAt = new Date(result?.expires_at).getTime()
    const currentTime = now()
    return Boolean(
      response.ok
      && hasExactKeys(result, ['expires_at', 'status'])
      && result.status === 'created'
      && canonicalIsoDate(result.expires_at)
      && expiresAt > currentTime
      && expiresAt <= currentTime + 20 * 60_000
    )
  } catch {
    return false
  } finally {
    clearTimeoutImpl(timeoutId)
  }
}

function createHelperView(documentLike) {
  const elements = {
    body: documentLike.getElementById('helperBody'),
    cancel: documentLike.getElementById('helperCancel'),
    download: documentLike.getElementById('helperDownloadEvidence'),
    retry: documentLike.getElementById('helperRetry'),
    returnButton: documentLike.getElementById('helperReturn'),
    status: documentLike.getElementById('helperStatus'),
    title: documentLike.getElementById('helperTitle')
  }
  if (Object.values(elements).some(element => !element)) {
    throw new Error('Migration helper markup is incomplete')
  }

  function show({
    body,
    cancel = false,
    download = false,
    focus = null,
    retry = false,
    returnButton = false,
    status = '',
    title
  }) {
    elements.title.textContent = title
    elements.body.textContent = body
    elements.status.textContent = status
    elements.cancel.hidden = !cancel
    elements.download.hidden = !download
    elements.retry.hidden = !retry
    elements.returnButton.hidden = !returnButton
    if (focus && !elements[focus].hidden) elements[focus].focus()
  }

  return { elements, show }
}

export function startLegacyMigrationHelper(target = globalThis) {
  const view = createHelperView(target.document)
  const runtime = deriveLegacyProgressHelperRuntime(target)
  let activeRun = 0
  let evidenceInput = null
  let disclosureTimer = null

  function navigate(outcome, capability = null) {
    const url = createLegacyProgressReturnUrl(runtime, outcome, capability)
    if (url) target.location.replace(url)
  }

  function showUnavailable({ recovery = false } = {}) {
    view.show({
      title: recovery
        ? 'Your old progress was not changed'
        : 'The progress check is temporarily unavailable',
      body: recovery
        ? 'Edenia could not safely prepare this browser’s progress. You can download a local recovery file or try again.'
        : 'Edenia could not complete the secure transfer. Check your connection and try again.',
      download: recovery && Boolean(evidenceInput),
      focus: 'retry',
      retry: true,
      returnButton: true,
      status: 'No progress was removed or changed.'
    })
  }

  async function readLegacySources() {
    const primaryRaw = target.localStorage.getItem(PRIMARY_KEY)
    const localBackupRaw = target.localStorage.getItem(BACKUP_KEY)
    const local = parseLegacyStateBackupEntries(
      localBackupRaw,
      entry => isValidStateBackupEntry(entry, isValidStateShape)
        && entry.sandbox === false
    )
    let indexed
    try {
      indexed = await readIndexedDbBackupEntries({
        indexedDb: target.indexedDB,
        isValidEntry: entry => isValidStateBackupEntry(
          entry,
          isValidStateShape
        ) && entry.sandbox === false
      })
    } catch (error) {
      indexed = { entries: [], error, exists: false }
    }
    return { indexed, local, localBackupRaw, primaryRaw }
  }

  function setEvidence(sources, candidate) {
    const primaryIssue = candidate.status === 'too_large'
      && candidate.source?.kind === 'primary'
      ? 'too_large'
      : sources.primaryRaw !== null
        && !primaryIsPortable(sources.primaryRaw)
        ? 'corrupt'
        : null
    const oversizedBackupId = candidate.status === 'too_large'
      && candidate.source?.kind === 'backup'
      ? candidate.source.backupId
      : null
    const oversizedLocal = oversizedBackupId
      && sources.local.entries.some(entry => entry.id === oversizedBackupId)
    evidenceInput = {
      indexedDbIssue: sources.indexed.error
        ? 'unreadable'
        : oversizedBackupId && !oversizedLocal
          ? 'too_large'
          : null,
      localBackupRaw: sources.localBackupRaw,
      localBackupsIssue: !sources.local.valid
        ? 'corrupt'
        : oversizedLocal
          ? 'too_large'
          : null,
      primaryIssue,
      primaryRaw: sources.primaryRaw
    }
    try {
      serializeLegacyProgressRecoveryEvidence(evidenceInput)
    } catch {
      evidenceInput = null
    }
  }

  async function run() {
    const runId = activeRun + 1
    activeRun = runId
    evidenceInput = null
    view.show({
      title: 'Checking this browser for your progress',
      body: 'Edenia is reading only the normal study progress stored at this address.',
      status: 'Checking local progress…'
    })

    let sources
    try {
      sources = await readLegacySources()
    } catch {
      if (runId === activeRun) showUnavailable({ recovery: true })
      return
    }
    if (runId !== activeRun) return
    let candidate = selectPortableProgressCandidate({
      indexedDbEntries: sources.indexed.entries,
      localBackupRaw: sources.localBackupRaw,
      primaryRaw: sources.primaryRaw
    })
    if (candidate.status === 'none' && sources.indexed.error) {
      candidate = {
        corruptEvidence: { backups: true, primary: false },
        status: 'corrupt'
      }
    }

    if (candidate.status === 'none') {
      navigate('none')
      return
    }
    if (candidate.status === 'corrupt' || candidate.status === 'too_large') {
      setEvidence(sources, candidate)
      showUnavailable({ recovery: true })
      return
    }

    view.show({
      title: 'Preparing your progress securely',
      body: 'Your progress is encrypted in this browser before a short-lived copy is sent.',
      status: 'Encrypting and transferring…'
    })
    try {
      const { envelope } = await createPortableProgressEnvelope({
        source: candidate.source,
        state: candidate.state
      })
      const encrypted = await createEncryptedProgressTransfer(
        envelope,
        target.crypto
      )
      const created = await submitEncryptedTransfer({
        AbortControllerImpl: target.AbortController,
        clearTimeoutImpl: target.clearTimeout.bind(target),
        encrypted,
        fetchImpl: target.fetch.bind(target),
        runtime,
        setTimeoutImpl: target.setTimeout.bind(target)
      })
      if (runId !== activeRun) return
      if (!created) {
        showUnavailable()
        return
      }
      navigate('transfer', encrypted.capability)
    } catch {
      if (runId === activeRun) showUnavailable()
    }
  }

  view.elements.cancel.addEventListener('click', () => {
    if (disclosureTimer !== null) target.clearTimeout(disclosureTimer)
    activeRun += 1
    navigate('deferred')
  })
  view.elements.returnButton.addEventListener('click', () => {
    activeRun += 1
    navigate('deferred')
  })
  view.elements.retry.addEventListener('click', () => {
    void run()
  })
  view.elements.download.addEventListener('click', () => {
    if (!evidenceInput) return
    const contents = serializeLegacyProgressRecoveryEvidence(evidenceInput)
    const url = target.URL.createObjectURL(new target.Blob(
      [contents],
      { type: 'application/json' }
    ))
    const link = target.document.createElement('a')
    link.href = url
    link.download = 'edenia-legacy-progress-recovery.json'
    link.click()
    target.setTimeout(() => target.URL.revokeObjectURL(url), 0)
  })

  if (!runtime.valid || target.top !== target.self) {
    view.show({
      title: 'The progress check is unavailable',
      body: 'Open the official Edenia migration page directly in this browser.',
      status: 'No progress was read or changed.'
    })
    return Object.freeze({ started: false })
  }

  view.show({
    title: 'Move your Edenia progress to edenia.study',
    body: 'This page will check only this browser’s normal Edenia progress, encrypt it, and return you to the new address. Your old copy will not be changed.',
    cancel: true,
    focus: 'cancel',
    status: 'The check will begin shortly.'
  })
  disclosureTimer = target.setTimeout(() => {
    disclosureTimer = null
    void run()
  }, runtime.disclosureDelayMs)
  return Object.freeze({ started: true })
}

if (typeof window !== 'undefined') startLegacyMigrationHelper(window)
