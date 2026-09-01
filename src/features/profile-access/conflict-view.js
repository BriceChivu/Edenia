import {
  createLearnerProfileConflictComparison
} from './conflict-comparison.js'

function formatList(values, none, formatItem = value => value) {
  const items = (Array.isArray(values) ? values : []).map(formatItem)
  return items.length ? items.join(', ') : none
}

export function createLearnerProfileConflictView({
  clearTimer,
  formatDateTime,
  formatNumber,
  now,
  root,
  setTimer,
  translate
}) {
  const panel = root.getElementById('learnerProfileConflict')
  const rows = root.getElementById('learnerProfileConflictRows')
  const empty = root.getElementById('learnerProfileConflictEmpty')
  const confirmation = root.getElementById(
    'learnerProfileConflictConfirmation'
  )
  const confirmationText = root.getElementById(
    'learnerProfileConflictConfirmationText'
  )
  const confirm = root.getElementById('learnerProfileConflictConfirm')
  const feedback = root.getElementById('learnerProfileConflictFeedback')
  const recovery = root.getElementById('learnerProfileConflictRecovery')
  const recoveryList = root.getElementById(
    'learnerProfileConflictRecoveryList'
  )
  if (
    !panel
    || !rows
    || !empty
    || !confirmation
    || !confirmationText
    || !confirm
    || !feedback
    || !recovery
    || !recoveryList
    || typeof root.createElement !== 'function'
    || typeof translate !== 'function'
  ) throw new TypeError('Learner profile conflict view requires its DOM')

  const number = typeof formatNumber === 'function'
    ? formatNumber
    : value => String(value)
  const dateTime = typeof formatDateTime === 'function'
    ? formatDateTime
    : value => String(value || '')
  const currentTime = typeof now === 'function' ? now : Date.now
  const scheduleTimer = typeof setTimer === 'function' ? setTimer : null
  const cancelTimer = typeof clearTimer === 'function' ? clearTimer : () => {}
  let protectedConflicts = []
  let protectedExpiryTimer = null

  function clearProtectedExpiryTimer() {
    if (protectedExpiryTimer === null) return
    cancelTimer(protectedExpiryTimer)
    protectedExpiryTimer = null
  }

  function scheduleProtectedExpiry() {
    clearProtectedExpiryTimer()
    if (!scheduleTimer || !protectedConflicts.length) return
    const delay = Math.min(
      Math.max(0, protectedConflicts[0].protectedUntil - currentTime()),
      2_147_000_000
    )
    protectedExpiryTimer = scheduleTimer(() => {
      protectedExpiryTimer = null
      showProtected(protectedConflicts)
    }, delay)
  }

  function none() {
    return translate('profileConflict.value.none')
  }

  function formatValue(key, value) {
    if (key === 'update-study-time') {
      return translate('profileConflict.value.updateStudy', {
        days: number(value.studyDays),
        minutes: number(Math.round(value.studySeconds / 60)),
        updated: value.updatedAt ? dateTime(value.updatedAt) : none()
      })
    }
    if (key === 'language-level') {
      return translate('profileConflict.value.languageLevel', {
        languages: formatList(
          value.languages,
          none(),
          language => translate(`onboarding.language.${language}`)
        ),
        level: value.level
          ? translate(`onboarding.level.${value.level}.label`)
          : none()
      })
    }
    if (key === 'town-study-progress') {
      return translate('profileConflict.value.townStudy', {
        facts: number(value.studyFacts),
        level: number(value.cityLevel),
        watched: number(value.watchedVideos)
      })
    }
    if (key === 'recent-activity') {
      return value.length
        ? value.map(entry => translate('profileConflict.value.activityItem', {
            time: entry.createdAt ? dateTime(entry.createdAt) : none(),
            title: entry.title || entry.type || none()
          })).join(' · ')
        : none()
    }
    if (key === 'video-organization') {
      return translate('profileConflict.value.videos', {
        favorite: number(value.favorite),
        partial: number(value.partial),
        removed: number(value.removed),
        retained: number(value.retained),
        watchLater: number(value.watchLater),
        watched: number(value.watched)
      })
    }
    if (key === 'anki-totals') {
      return translate('profileConflict.value.anki', {
        created: number(value.created),
        days: number(value.days),
        reviewed: number(value.reviewed)
      })
    }
    if (key === 'channels') {
      return translate('profileConflict.value.channels', {
        channels: formatList(
          value.channels,
          none(),
          channel => channel.name || channel.id
        ),
        selected: number(value.selectedCatalogIds.length)
      })
    }
    return none()
  }

  function createValueCell(side, row) {
    const cell = root.createElement('td')
    const label = root.createElement('span')
    label.className = 'learner-profile-conflict-cell-label'
    label.textContent = translate(
      side === 'device'
        ? 'profileConflict.thisDevice'
        : 'profileConflict.cloud'
    )
    const value = root.createElement('span')
    value.textContent = formatValue(row.key, row[side])
    cell.append(label, value)
    return cell
  }

  function renderConflict(conflict) {
    if (
      conflict?.status !== 'open'
      || !conflict.device?.profile
      || !conflict.cloud?.profile
    ) {
      hideConflict()
      return false
    }
    const comparison = createLearnerProfileConflictComparison(
      conflict.device.profile,
      conflict.cloud.profile
    )
    const fragments = comparison.map(row => {
      const tableRow = root.createElement('tr')
      const heading = root.createElement('th')
      heading.scope = 'row'
      heading.textContent = translate(`profileConflict.category.${row.key}`)
      tableRow.append(
        heading,
        createValueCell('device', row),
        createValueCell('cloud', row)
      )
      return tableRow
    })
    rows.replaceChildren(...fragments)
    empty.hidden = comparison.length > 0
    feedback.textContent = ''
    confirmation.hidden = true
    confirmation.classList.add('hidden')
    panel.classList.remove('hidden')
    return true
  }

  function hideConflict() {
    panel.classList.add('hidden')
    confirmation.hidden = true
    confirmation.classList.add('hidden')
    feedback.textContent = ''
  }

  function requestChoice(side) {
    if (!['device', 'cloud'].includes(side)) return false
    confirmationText.textContent = translate(
      side === 'device'
        ? 'profileConflict.confirmDevice'
        : 'profileConflict.confirmCloud'
    )
    confirm.dataset.conflictSide = side
    confirmation.hidden = false
    confirmation.classList.remove('hidden')
    confirm.focus()
    return true
  }

  function cancelChoice() {
    confirmation.hidden = true
    confirmation.classList.add('hidden')
    delete confirm.dataset.conflictSide
  }

  function setBusy(busy) {
    panel.setAttribute('aria-busy', String(busy))
    for (const control of panel.querySelectorAll('button')) {
      control.disabled = Boolean(busy)
    }
    feedback.textContent = busy
      ? translate('profileConflict.savingChoice')
      : ''
  }

  function showProtected(conflicts) {
    if (
      !Array.isArray(conflicts)
      || !conflicts.length
      || conflicts.some(conflict => (
        conflict?.status !== 'resolved'
        || typeof conflict.id !== 'string'
        || !conflict.id
        || !['device', 'cloud'].includes(conflict.selectedSide)
        || !Number.isFinite(conflict.protectedUntil)
      ))
    ) {
      hideProtected()
      return false
    }
    protectedConflicts = conflicts
      .filter(conflict => conflict.protectedUntil > currentTime())
      .sort((left, right) => left.protectedUntil - right.protectedUntil)
    if (!protectedConflicts.length) {
      hideProtected()
      return false
    }
    const items = protectedConflicts.map((conflict, index) => {
      const unchosen = conflict.selectedSide === 'device' ? 'cloud' : 'device'
      const item = root.createElement('li')
      const body = root.createElement('p')
      const download = root.createElement('button')
      item.className = 'learner-profile-conflict-recovery-item'
      body.id = `learnerProfileConflictProtectedBody${index}`
      body.textContent = translate('profileConflict.protectedBody', {
        date: dateTime(conflict.protectedUntil)
      })
      download.className = 'btn-secondary'
      download.type = 'button'
      download.dataset.conflictId = conflict.id
      download.dataset.conflictSide = unchosen
      download.dataset.profileConflictAction = 'export-protected'
      download.setAttribute('aria-describedby', body.id)
      download.textContent = translate(
        unchosen === 'device'
          ? 'profileConflict.downloadProtectedDevice'
          : 'profileConflict.downloadProtectedCloud'
      )
      item.append(body, download)
      return item
    })
    recoveryList.replaceChildren(...items)
    recovery.classList.remove('hidden')
    scheduleProtectedExpiry()
    return true
  }

  function hideProtected() {
    clearProtectedExpiryTimer()
    protectedConflicts = []
    recoveryList.replaceChildren()
    recovery.classList.add('hidden')
  }

  function refreshTranslations() {
    if (protectedConflicts.length) showProtected(protectedConflicts)
  }

  return Object.freeze({
    cancelChoice,
    hideConflict,
    hideProtected,
    refreshTranslations,
    renderConflict,
    requestChoice,
    setBusy,
    showProtected
  })
}
