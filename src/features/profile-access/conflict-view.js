import {
  createLearnerProfileConflictComparison,
  getLearnerProfileConflictPreference
} from './conflict-comparison.js'

function formatList(values, none, formatItem = value => value) {
  const items = (Array.isArray(values) ? values : []).map(formatItem)
  return items.length ? items.join(', ') : none
}

export function createLearnerProfileConflictView({
  createIslandPreviews = () => null,
  isTownEconomyEnabled = () => false,
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
  const islands = root.getElementById('learnerProfileConflictIslands')
  const enlarge = root.getElementById('learnerProfileConflictEnlarge')
  let previewKey = null
  let previewGeneration = 0
  let disposePreviews = null
  let previewLabels = []
  let previewImages = []
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
    if (key === 'island') {
      return translate(value.present
        ? 'profileConflict.value.islandDifferent'
        : 'profileConflict.value.islandAbsent')
    }
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
    if (key === 'town-economy') {
      return value ? `${translate('townEconomy.coins', { count: number(value.coins) })} · ${translate(value.flowers ? 'townEconomy.owned' : 'townEconomy.unowned')}` : translate('townEconomy.notStarted')
    }
    if (key === 'town-study-progress') {
      return translate('profileConflict.value.townStudy', {
        facts: number(value.studyFacts),
        level: number(value.cityLevel),
        xp: number(value.totalXp),
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
    const preference = getLearnerProfileConflictPreference(conflict.device.profile, conflict.cloud.profile)
    for (const side of ['device','cloud']) {
      const button = root.getElementById(side === 'device' ? 'learnerProfileConflictChooseDevice' : 'learnerProfileConflictChooseCloud')
      if (button) {
        button.classList.remove('btn-primary')
        button.classList.remove('btn-secondary')
        button.classList.add(preference === null || preference === side ? 'btn-primary' : 'btn-secondary')
      }
    }
    renderIslands(conflict)
    const visibleComparison = comparison.filter(row => row.key !== 'town-economy' || isTownEconomyEnabled())
    const fragments = visibleComparison.map(row => {
      const tableRow = root.createElement('tr')
      const heading = root.createElement('th')
      heading.scope = 'row'
      heading.textContent = row.key === 'town-economy' ? translate('townEconomy.comparison') : translate(`profileConflict.category.${row.key}`)
      tableRow.append(
        heading,
        createValueCell('device', row),
        createValueCell('cloud', row)
      )
      return tableRow
    })
    rows.replaceChildren(...fragments)
    empty.hidden = visibleComparison.length > 0
    empty.classList.remove('hidden')
    feedback.textContent = ''
    confirmation.hidden = true
    confirmation.classList.add('hidden')
    panel.classList.remove('hidden')
    return true
  }

  function hideConflict() {
    previewGeneration += 1
    disposePreviews?.()
    disposePreviews = null
    previewKey = null
    previewLabels = []
    previewImages = []
    islands?.replaceChildren()
    if (enlarge) enlarge.hidden = true
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
    if (busy) {
      previewGeneration += 1
      disposePreviews?.()
      disposePreviews = null
      for (const label of previewLabels) {
        if (label.key === 'profileConflict.preview.loading') {
          label.key = 'profileConflict.preview.unavailable'
          label.element.textContent = translate(label.key)
        }
      }
    }
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
    for (const {element,key,params} of previewLabels) element.textContent = translate(key,params)
    for (const { image, sideKey } of previewImages) {
      image.alt = translate('profileConflict.preview.alt', { side: translate(sideKey) })
    }
    if (enlarge) enlarge.textContent = translate(islands?.classList.contains('enlarged')
      ? 'profileConflict.preview.reduce' : 'profileConflict.preview.enlarge')
    if (protectedConflicts.length) showProtected(protectedConflicts)
  }

  function renderIslands(conflict) {
    if (!islands) return
    // Full conflict identity includes the verified owner and exact two versions.
    // Keep this key only in memory; never persist or log profile contents.
    const key = JSON.stringify(conflict)
    if (previewKey === key) return
    previewKey = key
    const generation = ++previewGeneration
    disposePreviews?.()
    disposePreviews = null
    previewLabels = []
    previewImages = []
    islands.replaceChildren()
    islands.classList.remove('enlarged')
    if (enlarge) {
      enlarge.hidden = true
      enlarge.textContent = translate('profileConflict.preview.enlarge')
      enlarge.setAttribute('aria-expanded','false')
      enlarge.onclick = () => {
        const expanded = islands.classList.contains('enlarged')
        if (expanded) islands.classList.remove('enlarged')
        else islands.classList.add('enlarged')
        enlarge.textContent = translate(expanded ? 'profileConflict.preview.enlarge' : 'profileConflict.preview.reduce')
        enlarge.setAttribute('aria-expanded',String(!expanded))
      }
    }
    const layouts = ['device','cloud'].map(side => conflict[side].profile.tinySwordsIsland ?? null)
    const images = []
    const statuses = []
    for (const [index,side] of ['device','cloud'].entries()) {
      const figure = root.createElement('figure')
      const caption = root.createElement('figcaption')
      const heading = root.createElement('strong')
      const sideKey = side === 'device' ? 'profileConflict.thisDevice' : 'profileConflict.cloud'
      heading.textContent = translate(sideKey)
      previewLabels.push({element:heading,key:sideKey})
      caption.append(heading)
      const image = root.createElement('img')
      image.hidden = true
      if (layouts[index] !== null) image.classList.add('saved-island-pending')
      image.alt = translate('profileConflict.preview.alt',{side:translate(sideKey)})
      image.width = 800
      image.height = 480
      previewImages.push({ image, sideKey })
      const status = root.createElement('p')
      const statusKey = layouts[index] === null ? 'profileConflict.value.islandAbsent' : 'profileConflict.preview.loading'
      status.textContent = translate(statusKey)
      previewLabels.push({element:status,key:statusKey})
      status.setAttribute('role','status')
      figure.append(caption,image,status)
      islands.append(figure)
      images.push(image)
      statuses.push(status)
    }
    const onImage = (index,pixels) => {
      if (generation !== previewGeneration || layouts[index] === null) return
      const image = images[index]
      const status = statuses[index]
      const label = previewLabels.find(entry => entry.element === status)
      label.key = pixels ? 'profileConflict.preview.saved' : 'profileConflict.preview.unavailable'
      status.textContent = translate(label.key)
      image.classList.remove('saved-island-pending')
      if (pixels) {
        image.src = pixels
        image.hidden = false
        if (enlarge) enlarge.hidden = false
      }
    }
    if (!layouts.some(layout => layout !== null)) return
    if (layouts.some(layout => layout !== null && new TextEncoder().encode(JSON.stringify(layout)).length > 512 * 1024)) {
      onImage(0,null)
      onImage(1,null)
      return
    }
    try {
      disposePreviews = createIslandPreviews({layouts:structuredClone(layouts),onImage})
    } catch {
      // A preview failure must never prevent the explicit conflict choice.
      disposePreviews = null
    }
    if (!disposePreviews) {
      onImage(0,null)
      onImage(1,null)
    }
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
