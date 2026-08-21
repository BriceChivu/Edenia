const COMPARISON_GROUPS = Object.freeze([
  ['update-study-time', summarizeUpdateAndStudyTime],
  ['language-level', summarizeLanguageAndLevel],
  ['town-study-progress', summarizeTownAndStudyProgress],
  ['recent-activity', summarizeRecentActivity],
  ['video-organization', summarizeVideoOrganization],
  ['anki-totals', summarizeAnkiTotals],
  ['channels', summarizeChannels]
])

function records(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.values(value)
    : []
}

function positiveInteger(value) {
  const number = Math.floor(Number(value) || 0)
  return Math.max(0, number)
}

function sortedStrings(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'en'))
}

function videoEntries(profile) {
  return records(profile?.videos)
}

function ankiEntries(profile) {
  const anki = profile?.anki
  if (Array.isArray(anki)) {
    return anki.map(entry => [String(entry?.studyDay || ''), entry])
  }
  return anki && typeof anki === 'object'
    ? Object.entries(anki)
    : []
}

function summarizeUpdateAndStudyTime(profile) {
  const studyDays = new Set()
  let studySeconds = 0
  for (const video of videoEntries(profile)) {
    for (const progress of Array.isArray(video?.watchProgress)
      ? video.watchProgress
      : []) {
      studySeconds += positiveInteger(progress?.seconds)
      if (progress?.studyDay) studyDays.add(String(progress.studyDay))
    }
  }
  for (const [studyDay, entry] of ankiEntries(profile)) {
    if (
      studyDay
      && (positiveInteger(entry?.reviewed) || positiveInteger(entry?.created))
    ) studyDays.add(studyDay)
  }
  return {
    studyDays: studyDays.size,
    studySeconds,
    updatedAt: profile?.learnerProfile?.updatedAt || null
  }
}

function summarizeLanguageAndLevel(profile) {
  return {
    languages: sortedStrings(profile?.learnerProfile?.languages),
    level: profile?.learnerProfile?.level || null
  }
}

function summarizeTownAndStudyProgress(profile) {
  let studyFacts = 0
  let watchedVideos = 0
  for (const video of videoEntries(profile)) {
    const progress = Array.isArray(video?.watchProgress)
      ? video.watchProgress
      : []
    studyFacts += progress.length
    if (video?.status === 'watched') watchedVideos += 1
  }
  studyFacts += ankiEntries(profile).filter(([, entry]) => (
    positiveInteger(entry?.reviewed) || positiveInteger(entry?.created)
  )).length
  return {
    cityLevel: positiveInteger(profile?.cityProgress?.maxLevelIndex) + 1,
    studyFacts,
    watchedVideos
  }
}

function summarizeRecentActivity(profile) {
  return (Array.isArray(profile?.activityLog) ? profile.activityLog : [])
    .map(entry => ({
      createdAt: entry?.createdAt || null,
      title: String(entry?.title || ''),
      type: String(entry?.type || '')
    }))
    .sort((left, right) => String(right.createdAt || '')
      .localeCompare(String(left.createdAt || ''), 'en'))
    .slice(0, 3)
}

function summarizeVideoOrganization(profile) {
  const summary = {
    favorite: 0,
    partial: 0,
    removed: 0,
    retained: 0,
    watchLater: 0,
    watched: 0
  }
  for (const video of videoEntries(profile)) {
    summary.retained += 1
    if (video?.favorite === true) summary.favorite += 1
    if (video?.watchLater === true) summary.watchLater += 1
    if (video?.removedFromFeedAt) summary.removed += 1
    if (video?.status === 'partial') summary.partial += 1
    if (video?.status === 'watched') summary.watched += 1
  }
  return summary
}

function summarizeAnkiTotals(profile) {
  return ankiEntries(profile).reduce((summary, [, entry]) => {
    const created = positiveInteger(entry?.created)
    const reviewed = positiveInteger(entry?.reviewed)
    summary.created += created
    summary.reviewed += reviewed
    if (created || reviewed) summary.days += 1
    return summary
  }, { created: 0, days: 0, reviewed: 0 })
}

function summarizeChannels(profile) {
  const channels = (Array.isArray(profile?.config?.channels)
    ? profile.config.channels
    : [])
    .map(channel => ({
      id: String(channel?.id || ''),
      name: String(channel?.name || channel?.id || '')
    }))
    .filter(channel => channel.id)
    .sort((left, right) => left.id.localeCompare(right.id, 'en'))
  return {
    channels,
    selectedCatalogIds: sortedStrings(
      profile?.learnerProfile?.selectedChannelCatalogIds
    )
  }
}

export function createLearnerProfileConflictComparison(
  deviceProfile,
  cloudProfile
) {
  const rows = []
  for (const [key, summarize] of COMPARISON_GROUPS) {
    const device = summarize(deviceProfile)
    const cloud = summarize(cloudProfile)
    if (JSON.stringify(device) === JSON.stringify(cloud)) continue
    rows.push(Object.freeze({ cloud, device, key }))
  }
  return Object.freeze(rows)
}
