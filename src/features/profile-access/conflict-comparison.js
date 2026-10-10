import { getTownBalance, FIRST_FLOWER_ID } from '../../state/town-economy.js'
import { canonicalizeJson } from '../../state/portable-state.js'
import { normalizeVideoWatchProgress } from '../../domain/video-watch-progress.js'
import { historyExperience } from '../../domain/experience.js'

const COMPARISON_GROUPS = Object.freeze([
  ['update-study-time', summarizeUpdateAndStudyTime],
  ['language-level', summarizeLanguageAndLevel],
  ['town-study-progress', summarizeTownAndStudyProgress],
  ['island', profile => profile?.tinySwordsIsland ?? null],
  ['town-economy', profile => profile?.townEconomy ? { coins: getTownBalance(profile.townEconomy), flowers: Object.hasOwn(profile.townEconomy.purchases, FIRST_FLOWER_ID) } : null],
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
  let experienceSeconds = 0
  let experienceReviews = 0
  for (const video of videoEntries(profile)) {
    const progress = Array.isArray(video?.watchProgress)
      ? video.watchProgress
      : []
    studyFacts += progress.length
    experienceSeconds += normalizeVideoWatchProgress(progress, video.duration)
      .reduce((sum, entry) => sum + (entry.experienceSeconds || 0), 0)
    if (video?.status === 'watched') watchedVideos += 1
  }
  studyFacts += ankiEntries(profile).filter(([, entry]) => (
    positiveInteger(entry?.reviewed) || positiveInteger(entry?.created)
  )).length
  for (const [, entry] of ankiEntries(profile)) {
    if (positiveInteger(entry?.reviewed) || positiveInteger(entry?.created)) {
      experienceReviews += positiveInteger(entry?.experienceReviews)
    }
  }
  return {
    cityLevel: positiveInteger(profile?.cityProgress?.maxLevelIndex) + 1,
    studyFacts,
    totalXp: historyExperience({ experienceSeconds, experienceReviews }),
    watchedVideos
  }
}

function latestStudyActivity(profile) {
  const dates = []
  for (const video of videoEntries(profile)) {
    for (const entry of normalizeVideoWatchProgress(video.watchProgress, video.duration)) {
      dates.push(Date.parse(entry.watchedAt))
    }
  }
  for (const [, entry] of ankiEntries(profile)) {
    if ((positiveInteger(entry?.reviewed) || positiveInteger(entry?.created))
      && Number.isFinite(Date.parse(entry.observedAt))) dates.push(Date.parse(entry.observedAt))
  }
  return dates.length ? dates.reduce((latest,date) => Math.max(latest,date),0) : null
}

// Presentation cue only; counts never establish that one profile contains every
// unique fact or island edit on the other side. Choice remains explicit.
export function getLearnerProfileConflictPreference(deviceProfile, cloudProfile) {
  const evidence = profile => {
    const time = summarizeUpdateAndStudyTime(profile)
    const study = summarizeTownAndStudyProgress(profile)
    const anki = summarizeAnkiTotals(profile)
    return {
      values: [time.studySeconds, time.studyDays, study.studyFacts,
        study.watchedVideos, study.totalXp, anki.reviewed, anki.created],
      activity: latestStudyActivity(profile)
    }
  }
  const device = evidence(deviceProfile)
  const cloud = evidence(cloudProfile)
  const dominates = (left,right) => left.values.every((value,index) => value >= right.values[index]) && left.values.some((value,index) => value > right.values[index])
  const bothDates = device.activity !== null && cloud.activity !== null
  if (dominates(device,cloud)) return bothDates && cloud.activity > device.activity ? null : 'device'
  if (dominates(cloud,device)) return bothDates && device.activity > cloud.activity ? null : 'cloud'
  if (bothDates && device.values.every((value,index) => value === cloud.values[index]) && device.activity !== cloud.activity) return device.activity > cloud.activity ? 'device' : 'cloud'
  return null
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
    if (key === 'island') {
      if (canonicalizeJson(device) === canonicalizeJson(cloud)) continue
      rows.push(Object.freeze({
        cloud: { present: cloud !== null },
        device: { present: device !== null },
        key
      }))
      continue
    }
    if (JSON.stringify(device) === JSON.stringify(cloud)) continue
    rows.push(Object.freeze({ cloud, device, key }))
  }
  return Object.freeze(rows)
}
