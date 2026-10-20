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
  formatDateTime,
  formatNumber,
  root,
  translate
}) {
  const panel = root.getElementById('learnerProfileConflict')
  const rows = root.getElementById('learnerProfileConflictRows')
  const islands = root.getElementById('learnerProfileConflictIslands')
  let busy = false
  const gate = root.getElementById('learnerProfileAccessGate')
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
  if (
    !panel
    || !rows
    || !empty
    || !confirmation
    || !confirmationText
    || !confirm
    || !feedback
    || typeof root.createElement !== 'function'
    || typeof translate !== 'function'
  ) throw new TypeError('Learner profile conflict view requires its DOM')

  const number = typeof formatNumber === 'function'
    ? formatNumber
    : value => String(value)
  const dateTime = typeof formatDateTime === 'function'
    ? formatDateTime
    : value => String(value || '')
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
          language => {
            const aliases = { 'zh-Hant': 'mandarin', 'zh-Hans': 'mandarin', zh: 'mandarin', ja: 'japanese', ko: 'korean', es: 'spanish', fr: 'french', de: 'german', en: 'english' }
            const key = `onboarding.language.${aliases[language] || language}`
            const label = translate(key)
            return label === key ? language : label
          }
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
            title: entry.channelName ? `${entry.title || entry.type || none()} — ${entry.channelName}`
              : entry.type === 'youtube-refresh' && entry.detail ? entry.detail : entry.title || entry.type || none()
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
    const visibleComparison = comparison.filter(row => row.key !== 'island'
      && (row.key !== 'town-economy' || isTownEconomyEnabled()))
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
    empty.hidden = visibleComparison.length > 0 || comparison.some(row => row.key === 'island')
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
    panel.classList.add('hidden')
    confirmation.hidden = true
    confirmation.classList.add('hidden')
    feedback.textContent = ''
  }

  function requestChoice(side) {
    if (busy || !['device', 'cloud'].includes(side)) return false
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
    if (busy) return
    confirmation.hidden = true
    confirmation.classList.add('hidden')
    delete confirm.dataset.conflictSide
  }

  function setBusy(value) {
    busy = Boolean(value)
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
    for (const control of (gate || panel).querySelectorAll('button')) {
      control.disabled = Boolean(busy)
    }
    feedback.textContent = busy
      ? translate('profileConflict.savingChoice')
      : ''
  }

  function refreshTranslations() {
    for (const {element,key,params} of previewLabels) if (key) element.textContent = translate(key,params)
    for (const { image, sideKey } of previewImages) {
      image.alt = translate('profileConflict.preview.alt', { side: translate(sideKey) })
    }
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
    const layouts = ['device','cloud'].map(side => conflict[side].profile.tinySwordsIsland ?? null)
    if (layouts.every(layout => layout === null)) {
      islands.hidden = true
      return
    }
    islands.hidden = false
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
      label.key = pixels ? null : 'profileConflict.preview.unavailable'
      status.textContent = label.key ? translate(label.key) : ''
      status.hidden = Boolean(pixels)
      image.classList.remove('saved-island-pending')
      if (pixels) {
        image.src = pixels
        image.hidden = false
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
    refreshTranslations,
    renderConflict,
    requestChoice,
    setBusy
  })
}
