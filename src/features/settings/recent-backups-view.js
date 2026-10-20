// Recovery entries expose only their display metadata. Payloads stay in their
// existing stores and are read again by the authorized restore/download path.
export function getRecentBackupEntries({ local = [], conflicts = [], reset = null }, now = Date.now()) {
  const entries = local.map(entry => ({
    key: `local:${entry.id}`, id: entry.id, kind: 'local',
    createdAt: entry.createdAt, reason: entry.reason
  })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const protectedEntries = conflicts.filter(entry => (
    entry.status === 'resolved' && entry.id
    && ['device', 'cloud'].includes(entry.selectedSide)
    && Number.isFinite(entry.protectedUntil) && entry.protectedUntil > now
  )).sort((a, b) => b.protectedUntil - a.protectedUntil).map(entry => ({
    key: `conflict:${entry.id}`, id: entry.id, kind: 'conflict',
    side: entry.selectedSide === 'device' ? 'cloud' : 'device',
    protectedUntil: entry.protectedUntil
  }))
  // Cloud recovery metadata contains an expiry, not a creation date. Keep these
  // deliberate recovery choices first rather than inventing save timestamps.
  entries.unshift(...protectedEntries)
  if (reset?.status === 'available' && reset.id
    && Number.isFinite(reset.protectedUntil) && reset.protectedUntil > now) {
    entries.unshift({ key: `reset:${reset.id}`, id: reset.id, kind: 'reset',
      protectedUntil: reset.protectedUntil })
  }
  return entries
}

export function createRecentBackupsView({
  root, translate: t, formatDateTime, formatReason,
  getContext, isContextCurrent, restore, unavailable,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout
}) {
  const list = root.getElementById('backupList')
  const more = root.getElementById('backupShowOlder')
  const dialog = root.getElementById('backupRestoreDialog')
  const summary = root.getElementById('backupRestoreSummary')
  const body = root.getElementById('backupRestoreBody')
  const confirm = root.getElementById('backupRestoreConfirm')
  const cancel = root.getElementById('backupRestoreCancel')
  let source = {}
  let entries = []
  let expanded = false
  let pending = null
  let expiryTimer = null

  function title(entry) {
    if (entry.kind === 'reset') return t('backups.beforeStartOver')
    if (entry.kind === 'conflict') return t('backups.beforeChoice')
    return formatReason(entry.reason)
  }

  function description(entry) {
    if (entry.protectedUntil) {
      const expiry = t('backups.availableUntil', { date: formatDateTime(entry.protectedUntil) })
      return entry.kind === 'conflict'
        ? `${t(entry.side === 'device' ? 'profileConflict.thisDevice' : 'profileConflict.cloud')} · ${expiry}`
        : expiry
    }
    return `${formatDateTime(entry.createdAt)} · ${t('backups.thisBrowser')}`
  }

  function cancelRestore({ returnFocus = true } = {}) {
    const previous = pending
    pending = null
    if (dialog.open) dialog.close()
    if (returnFocus && previous) {
      const control = [...list.querySelectorAll('[data-backup-key]')]
        .find(control => control.dataset.backupKey === previous.entry.key)
      const target = control || root.querySelector('.backup-toggle')
      target?.focus()
    }
  }

  function updateConfirmation() {
    if (!pending) return
    summary.textContent = `${title(pending.entry)} · ${description(pending.entry)}`
    body.textContent = t(pending.entry.kind === 'reset'
      ? 'backups.restoreResetWarning'
      : pending.context.signedIn
        ? 'backups.restoreSyncedWarning' : 'backups.restoreLocalWarning')
  }

  function requestRestore(entry) {
    const context = getContext()
    if (!isContextCurrent(context)) return unavailable()
    pending = { entry, context, busy: false }
    confirm.disabled = false
    cancel.disabled = false
    updateConfirmation()
    dialog.showModal()
    cancel.focus()
  }

  function render(nextSource = source) {
    source = nextSource
    entries = getRecentBackupEntries(source, now())
    if (expiryTimer !== null) clearTimer(expiryTimer)
    const deadlines = entries.map(entry => entry.protectedUntil).filter(Boolean)
    expiryTimer = deadlines.length ? setTimer(() => render(), Math.min(
      Math.max(0, Math.min(...deadlines) - now()), 2_147_000_000
    )) : null
    const focusedKey = root.activeElement?.dataset?.backupKey
    const visible = expanded ? entries : entries.slice(0, 4)
    const items = visible.map(entry => {
      const item = root.createElement('div')
      item.className = 'backup-item'
      item.dataset.backupKind = entry.kind
      const copy = root.createElement('div')
      copy.className = 'backup-item-copy'
      const name = root.createElement('span')
      name.className = 'backup-name'
      name.textContent = title(entry)
      const detail = root.createElement('span')
      detail.className = 'backup-reason'
      detail.textContent = description(entry)
      const button = root.createElement('button')
      button.type = 'button'
      button.className = 'btn-ghost backup-restore-btn'
      button.dataset.backupKey = entry.key
      button.dataset.backupId = entry.id
      if (entry.kind === 'conflict') {
        button.dataset.profileConflictAction = 'export-protected'
        button.dataset.conflictId = entry.id
        button.dataset.conflictSide = entry.side
        button.textContent = t('backups.download')
      } else {
        button.dataset.settingsBackupAction = 'restore'
        button.dataset.analyticsAction = entry.kind === 'reset'
          ? 'settings.startOver.undo' : 'restoreStateBackup'
        button.textContent = t('backups.restore')
        button.addEventListener('click', () => requestRestore(entry))
      }
      button.dataset.analyticsLabel = button.textContent
      button.setAttribute('aria-label', `${button.textContent} ${title(entry)} · ${description(entry)}`)
      copy.append(name, detail)
      item.append(copy, button)
      return item
    })
    if (!items.length) {
      const empty = root.createElement('p')
      empty.className = 'backup-empty'
      empty.textContent = t('backups.empty')
      items.push(empty)
    }
    list.replaceChildren(...items)
    if (pending && (!entries.some(entry => entry.key === pending.entry.key)
      || !isContextCurrent(pending.context))) {
      cancelRestore({ returnFocus: isContextCurrent(pending.context) })
    }
    if (focusedKey) [...list.querySelectorAll('[data-backup-key]')]
      .find(control => control.dataset.backupKey === focusedKey)?.focus()
    more.hidden = expanded || entries.length <= 4
    more.textContent = t('backups.showOlder')
    updateConfirmation()
  }

  more.addEventListener('click', () => {
    expanded = true
    render()
    list.children[4]?.querySelector('button')?.focus()
  })
  cancel.addEventListener('click', () => cancelRestore())
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || pending?.busy) return
    if (event.shiftKey && root.activeElement === cancel) {
      event.preventDefault()
      confirm.focus()
    } else if (!event.shiftKey && root.activeElement === confirm) {
      event.preventDefault()
      cancel.focus()
    }
  })
  dialog.addEventListener('cancel', event => {
    event.preventDefault()
    if (!pending?.busy) cancelRestore()
  })
  confirm.addEventListener('click', async () => {
    const selection = pending
    if (!selection || selection.busy) return
    if (!isContextCurrent(selection.context)
      || !getRecentBackupEntries(source, now()).some(entry => entry.key === selection.entry.key)) {
      cancelRestore()
      unavailable()
      return
    }
    selection.busy = true
    confirm.disabled = true
    cancel.disabled = true
    try {
      await restore(selection.entry)
    } catch {
      unavailable()
    } finally {
      if (pending === selection) cancelRestore()
    }
  })
  return {
    render, cancelRestore,
    collapse() { expanded = false; render() }
  }
}
