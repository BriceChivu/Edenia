/* ═══════════════════════════════════════════════════════════
   STUDY BUILD — app.js
   All logic: state, YouTube API, streak, Anki, city, rendering
═══════════════════════════════════════════════════════════ */

// Pre-loaded channels (update names via Settings after first refresh)
const DEFAULT_CHANNELS = [
  { id: 'UCfsNycNoClXZA1FuUJSGT0w', name: 'Channel 1' },
  { id: 'UCIhaNRLn4OQDWZJiVvdhl5A', name: 'Channel 2' },
  { id: 'UCVBf2Zflj4WabkdCvEAFWew', name: 'Channel 3' },
  { id: 'UCsZo8ByA7boMHhNszNI9L4A', name: 'Channel 4' },
  { id: 'UC5p8WSPGtnSWpeQzXv9F7XQ', name: 'Channel 5' },
]
const DEFAULT_CHANNELS_VERSION = 2

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

const IS_SANDBOX = new URLSearchParams(window.location.search).get('sandbox') === '1'
const STORAGE_KEY = IS_SANDBOX ? 'studybuild_v1_sandbox' : 'studybuild_v1'
const CONFIG_COOKIE_KEY = IS_SANDBOX ? 'studybuild_config_sandbox' : 'studybuild_config'
const DEFAULT_API_KEY = 'AIzaSyAVmsqp-5o1ufYCuMak38jigQRHFhf0g1Y'
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const ACTIVE_VIDEOS_PER_CHANNEL = 5
const FETCH_PAGE_SIZE = 50
const MAX_FETCH_PAGES_PER_CHANNEL = 10
const DEFAULT_THEME = 'light'
const THEMES = ['light', 'dark']
const TIME_OF_DAY_MODES = {
  dawn:      { start: 5,  sky: '#11556d', activeSky: '#176b82', horizon: '#c9ef68', wash: 0.46, sun: [150, 88, 0.54], moon: 0.18, stars: 0.28, tint: '#82d2ef', tintOpacity: 0.08, shadows: 0.52, shadowShift: '34 0', cityFilter: 'brightness(1.06) saturate(1.16)' },
  morning:   { start: 7,  sky: '#12bcea', activeSky: '#45cdec', horizon: '#c9ef68', wash: 0.30, sun: [705, 70, 0.88], moon: 0.04, stars: 0,    tint: '#ffffff', tintOpacity: 0.03, shadows: 0.34, shadowShift: '22 0', cityFilter: 'brightness(1.14) saturate(1.08)' },
  noon:      { start: 11, sky: '#82d2ef', activeSky: '#a2e5f7', horizon: '#ffffff', wash: 0.10, sun: [450, 34, 1],    moon: 0,    stars: 0,    tint: '#ffffff', tintOpacity: 0.02, shadows: 0.18, shadowShift: '0 0',  cityFilter: 'brightness(1.22) saturate(1.02)' },
  afternoon: { start: 14, sky: '#0fb5e3', activeSky: '#45cdec', horizon: '#c9ef68', wash: 0.26, sun: [680, 68, 0.9],  moon: 0,    stars: 0,    tint: '#c9ef68', tintOpacity: 0.06, shadows: 0.38, shadowShift: '-18 0', cityFilter: 'brightness(1.12) saturate(1.12)' },
  sunset:    { start: 17, sky: '#0a3a4f', activeSky: '#0d526b', horizon: '#12bcea', wash: 0.58, sun: [770, 125, 0.68], moon: 0.28, stars: 0.18, tint: '#c9ef68', tintOpacity: 0.10, shadows: 0.62, shadowShift: '-32 0', cityFilter: 'brightness(0.98) saturate(1.2)' },
  night:     { start: 19, sky: '#031018', activeSky: '#062638', horizon: '#12bcea', wash: 0.16, sun: [760, 72, 0],    moon: 0.85, stars: 1,    tint: '#02080b', tintOpacity: 0.20, shadows: 0.70, shadowShift: '0 0',  cityFilter: 'brightness(0.78) saturate(0.96)' }
}
const NIGHT_START_HOUR = 19
const NIGHT_END_HOUR = 5
const NIGHT_VISUAL_END_HOUR = 1
const NIGHT_VISUAL_DURATION_MINUTES = 30
const NIGHT_VISUAL_TOTAL_MINUTES = (24 - NIGHT_START_HOUR + NIGHT_VISUAL_END_HOUR) * 60
const NIGHT_VISUAL_TYPES = ['aurora', 'ufo', 'meteors']
const ANKI_AUTO_REFRESH_MS = 5 * 60_000
const MIN_DAILY_STREAK_POINTS = 3
const UNDO_STACK_LIMIT = 50
const CITY_LEVELS = [
  { threshold: 0, label: '🏠 Lonely house' },
  { threshold: 5, label: '⛵ We got a boat and a fishing line!' },
  { threshold: 12, label: '🌳 A nice park for the kids' },
  { threshold: 20, label: '👋 Welcome to our neighbors!' },
  { threshold: 28, label: '🏊 That pool looks nice' },
  { threshold: 35, label: '🏝️ A tiny island...' }
]
const CITY_IMAGE_PATHS = [
  'images/upscaled/level%201.png',
  'images/upscaled/level%202.png',
  'images/level%203.png',
  'images/level%204.png',
  'images/level%205.png',
  'images/level%206.png'
]
const PEASANT_POSITIONS = [
  [118, 222], [176, 220], [254, 224], [340, 222], [430, 222], [518, 222],
  [606, 222], [694, 222], [782, 223], [738, 216], [650, 216], [560, 218],
  [470, 219], [382, 218], [294, 217], [204, 218], [138, 226], [244, 226],
  [348, 226], [452, 226], [556, 226], [660, 226], [760, 226], [820, 224]
]
const PEASANT_SCALE = 0.5
const PEASANT_GROUND_Y = 248
const PEASANT_FOOT_Y = 23
let ankiStatsCache = null
let selectedStatusFilter = 'all'
let selectedChannelFilters = null
let knownChannelFilterIds = new Set()
let selectedHistoryRange = 'week'
let selectedHistoryView = 'summary'
let selectedCityDayOffset = 0
const CITY_IMAGE_MIN_ZOOM = 1
const CITY_IMAGE_MAX_ZOOM = 3
const CITY_IMAGE_ZOOM_STEP = 0.25
const CITY_IMAGE_WHEEL_ZOOM_STEP = 0.06
const cityImageView = {
  scale: 1,
  x: 0,
  y: 0,
  dragging: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
}
const cityWaveformScroll = {
  frame: null,
  speed: 0,
  pointerX: 0,
  pointerY: 0
}
const STATUS_FILTERS = [
  ['all', 'All'],
  ['watch-later', 'Watch later'],
  ['unwatched', 'Unwatched'],
  ['partial', 'In progress'],
  ['watched', 'Watched']
]
const HISTORY_RANGES = ['week', 'month']

function getCookie(key) {
  return document.cookie.split('; ').reduce((value, part) => {
    const [name, val] = part.split('=')
    return name === key ? decodeURIComponent(val) : value
  }, null)
}

function loadConfigCookie() {
  try {
    const raw = getCookie(CONFIG_COOKIE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveConfigCookie(config) {
  try {
    const value = encodeURIComponent(JSON.stringify(config))
    document.cookie = `${CONFIG_COOKIE_KEY}=${value}; max-age=31536000; path=/`
  } catch {}
}

function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : DEFAULT_THEME
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme)
  document.documentElement.dataset.theme = normalizedTheme
  document.body.dataset.theme = normalizedTheme
  const toggle = document.getElementById('themeToggle')
  if (toggle) {
    const isDark = normalizedTheme === 'dark'
    toggle.dataset.theme = normalizedTheme
    toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode'
    toggle.setAttribute('aria-label', toggle.title)
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw)
      if (state?.config && !state.config.apiKey) state.config.apiKey = DEFAULT_API_KEY
      if (state?.config) state.config.theme = normalizeTheme(state.config.theme)
      if (state?.config && !Array.isArray(state.config.channels)) state.config.channels = []
      if (state?.config && (state.defaultChannelsVersion || 1) < DEFAULT_CHANNELS_VERSION) {
        addMissingDefaultChannels(state.config.channels)
        state.defaultChannelsVersion = DEFAULT_CHANNELS_VERSION
        saveState(state)
      }
      normalizeUndoState(state)
      normalizeSandboxState(state)
      normalizeCityProgress(state)
      return state
    }
  } catch {}

  const fallback = loadConfigCookie()
  if (fallback?.apiKey) {
    return defaultState(fallback.apiKey, fallback.weeklyGoalHours || 4, fallback.channels, fallback.theme)
  }

  return null
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  saveConfigCookie(s.config)
}

function defaultState(apiKey, goalHours, channels, theme) {
  return {
    config: {
      apiKey: apiKey || DEFAULT_API_KEY,
      weeklyGoalHours: goalHours || 4,
      theme: normalizeTheme(theme),
      channels: channels?.length ? channels.map(c => ({ ...c })) : DEFAULT_CHANNELS.map(c => ({ ...c }))
    },
    videos:  {},   // { [videoId]: VideoRecord }
    streak:  { current: 0, longest: 0, lastActivityDate: null },
    anki:    {},   // { 'YYYY-MM-DD': { reviewed, created } }
    cityProgress: { maxLevelIndex: 0 },
    nightVisuals: null,
    undoStack: [],
    lastFetched: null,
    defaultChannelsVersion: DEFAULT_CHANNELS_VERSION
  }
}

function createSandboxDemoState() {
  const state = defaultState('', 4, [
    { id: 'sandbox-focus', name: 'Sandbox Focus' },
    { id: 'sandbox-memory', name: 'Sandbox Memory' },
    { id: 'sandbox-projects', name: 'Sandbox Projects' }
  ], DEFAULT_THEME)
  const today = new Date()
  state.sandboxStartDate = toDateKey(addDays(today, -120))
  state.sandboxLastDate = toDateKey(addDays(today, 90))

  state.videos = {}
  state.anki = {}
  state.streak = { current: 42, longest: 64, lastActivityDate: toDateKey(today) }
  state.lastFetched = today.toISOString()

  for (let offset = -120; offset <= 90; offset += 1) {
    const date = addDays(today, offset)
    const dateKey = toDateKey(date)
    const rhythm = Math.abs(offset) % 9
    const activeDay = offset >= -20 || rhythm < 5

    if (activeDay) {
      state.anki[dateKey] = {
        reviewed: 20 + (Math.abs(offset) * 7) % 170,
        created: Math.abs(offset) % 4 === 0 ? 12 + (Math.abs(offset) % 18) : Math.abs(offset) % 7,
        loggedAt: setLocalTime(date, 21, 0).toISOString(),
        source: 'sandbox'
      }
    }

    if (activeDay && Math.abs(offset) % 3 !== 1) {
      const videosForDay = offset >= -5 && offset <= 7 ? 2 : 1
      for (let i = 0; i < videosForDay; i += 1) {
        const id = `sandbox-${offset + 120}-${i}`
        const channel = state.config.channels[(Math.abs(offset) + i) % state.config.channels.length]
        state.videos[id] = {
          id,
          title: `Sandbox study session ${dateKey}${videosForDay > 1 ? `.${i + 1}` : ''}`,
          channelId: channel.id,
          channelTitle: channel.name,
          thumbnail: makeSandboxThumbnail(channel.name, i),
          publishedAt: setLocalTime(addDays(date, -14 - i), 9, 0).toISOString(),
          duration: (28 + ((Math.abs(offset) + i * 11) % 42)) * 60,
          status: 'watched',
          watchedAt: setLocalTime(date, 18 + i, 10).toISOString()
        }
      }
    }
  }

  for (let i = 0; i < 8; i += 1) {
    const channel = state.config.channels[i % state.config.channels.length]
    state.videos[`sandbox-active-${i}`] = {
      id: `sandbox-active-${i}`,
      title: `Sandbox upcoming lesson ${i + 1}`,
      channelId: channel.id,
      channelTitle: channel.name,
      thumbnail: makeSandboxThumbnail(channel.name, i),
      publishedAt: addDays(today, -i).toISOString(),
      duration: (22 + i * 6) * 60,
      status: i % 3 === 0 ? 'partial' : i % 3 === 1 ? 'watch-later' : 'unwatched',
      watchedAt: null
    }
  }

  return state
}

function createEmptySandboxState() {
  const state = defaultState('', 4, [
    { id: 'sandbox-focus', name: 'Sandbox Focus' },
    { id: 'sandbox-memory', name: 'Sandbox Memory' },
    { id: 'sandbox-projects', name: 'Sandbox Projects' }
  ], DEFAULT_THEME)
  const startDate = new Date()
  const startKey = toDateKey(startDate)
  state.sandboxStartDate = startKey
  state.sandboxLastDate = startKey
  state.anki[startKey] = {
    reviewed: 0,
    created: 0,
    loggedAt: setLocalTime(startDate, 0, 0).toISOString(),
    source: 'sandbox-baseline'
  }
  return state
}

function setLocalTime(date, hour, minute) {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

function makeSandboxThumbnail(label, index) {
  const colors = [
    ['#12bcea', '#c9ef68'],
    ['#f5c842', '#ef805a'],
    ['#82d2ef', '#254f6f'],
    ['#ffafcc', '#bde0fe']
  ][index % 4]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270">
      <rect width="480" height="270" fill="${colors[0]}"/>
      <circle cx="395" cy="58" r="38" fill="${colors[1]}" opacity="0.92"/>
      <rect x="0" y="184" width="480" height="86" fill="#173947"/>
      <rect x="72" y="118" width="80" height="66" rx="8" fill="#fff6cc" stroke="#050505" stroke-width="8"/>
      <path d="M58 122 L112 76 L166 122 Z" fill="#ef805a" stroke="#050505" stroke-width="8"/>
      <rect x="238" y="96" width="98" height="88" rx="9" fill="#ffffff" stroke="#050505" stroke-width="8"/>
      <path d="M224 100 L287 48 L350 100 Z" fill="#c9ef68" stroke="#050505" stroke-width="8"/>
      <text x="32" y="238" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${escapeSvgText(label)}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function escapeSvgText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeUndoState(state) {
  if (!state) return
  if (!Array.isArray(state.undoStack)) state.undoStack = []
  if (state.lastUndo?.type === 'video-status' && !state.undoStack.length) {
    state.undoStack.push(state.lastUndo)
  }
  state.undoStack = state.undoStack
    .filter(action => action?.type === 'video-status')
    .slice(-UNDO_STACK_LIMIT)
  delete state.lastUndo
}

function normalizeCityProgress(state) {
  if (!state) return
  const historicMax = getHistoricMaxCityLevelIndex(state)
  state.cityProgress = {
    maxLevelIndex: clampNumber(historicMax, 0, CITY_LEVELS.length - 1)
  }
}

function normalizeSandboxState(state) {
  if (!IS_SANDBOX || !state) return
  const firstKey = getFirstStudyActionDateKey(state) || toDateKey()
  if (!state.sandboxStartDate) state.sandboxStartDate = firstKey
  if (!state.sandboxLastDate) state.sandboxLastDate = getLatestSandboxDateKey(state) || state.sandboxStartDate
  if (!state.anki[state.sandboxStartDate]) {
    state.anki[state.sandboxStartDate] = {
      reviewed: 0,
      created: 0,
      loggedAt: setLocalTime(dateKeyToLocalDate(state.sandboxStartDate), 0, 0).toISOString(),
      source: 'sandbox-baseline'
    }
  }
}

function addMissingDefaultChannels(channels) {
  DEFAULT_CHANNELS.forEach(channel => {
    if (!channels.find(c => c.id === channel.id)) channels.push({ ...channel })
  })
}

// ════════════════════════════════════════════════════════════
// DATE & TIME HELPERS
// ════════════════════════════════════════════════════════════

function getWeekStart(from = new Date()) {
  const d = new Date(from)
  const day = d.getDay()                // 0=Sun
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateKey(d = new Date()) {
  // Use local date components — avoids UTC offset bug (e.g. Taiwan UTC+8:
  // before 8am local, toISOString() would return yesterday's UTC date)
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}`
}

function getCurrentAppDate(state = null) {
  if (!IS_SANDBOX) return new Date()
  const sandboxState = state || loadState()
  const latestKey = sandboxState?.sandboxLastDate || getLatestSandboxDateKey(sandboxState)
  return latestKey ? dateKeyToLocalDate(latestKey) : new Date()
}

function getCurrentAppDateKey(state = null) {
  return toDateKey(getCurrentAppDate(state))
}

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86_400_000)
  if (days < -1) return `in ${Math.abs(days)}d`
  if (days === -1) return 'tomorrow'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 14) return '1 week ago'
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatDuration(secs) {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const z = n => String(n).padStart(2, '0')
  return h ? `${h}:${z(m)}:${z(s)}` : `${m}:${z(s)}`
}

function getWeekLabel() {
  const start = getWeekStart()
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)
  const jan4  = new Date(start.getFullYear(), 0, 4)
  const wk    = Math.ceil(((start - jan4) / 86_400_000 + jan4.getDay() + 1) / 7)
  const fmt   = d => d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return `Week ${wk} · ${fmt(start)} – ${fmt(end)}`
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ════════════════════════════════════════════════════════════
// SETUP & SETTINGS
// ════════════════════════════════════════════════════════════

function init() {
  let state = loadState()
  if (!state) {
    state = IS_SANDBOX ? createEmptySandboxState() : defaultState('', 4, DEFAULT_CHANNELS)
    saveState(state)
  }

  document.title = IS_SANDBOX ? 'Sandbox - Study Build' : 'Study Build'
  document.body.dataset.sandbox = IS_SANDBOX ? 'true' : 'false'
  const sandboxTools = document.getElementById('sandboxTools')
  if (sandboxTools) sandboxTools.classList.toggle('hidden', !IS_SANDBOX)
  if (IS_SANDBOX) selectedHistoryView = 'heatmap'
  setDefaultCityDayOffset(state)
  syncStreak(state)
  saveState(state)
  applyTheme(state.config.theme)
  show('mainApp')
  renderAll(state)
  initCityImagePanZoom()
  startCityClock()
  if (!IS_SANDBOX) {
    refreshAnkiStats({ silent: true })
    startAnkiAutoRefresh()
    if (!state.lastFetched) showToast('Add or edit channels in ⚙ Settings, then hit ↻ Refresh', 'warn')
  } else {
    showToast('Sandbox mode: demo data is isolated from your real progress', 'warn')
  }
}

function loadSandboxDemo() {
  if (!IS_SANDBOX) return
  const state = createSandboxDemoState()
  saveState(state)
  setDefaultCityDayOffset(state)
  selectedHistoryView = 'heatmap'
  selectedHistoryRange = 'month'
  ankiStatsCache = null
  renderAll(state)
  showToast('Sandbox demo timeline loaded', 'success')
}

function resetSandboxState() {
  if (!IS_SANDBOX) return
  const state = createEmptySandboxState()
  saveState(state)
  setDefaultCityDayOffset(state)
  selectedHistoryView = 'heatmap'
  selectedHistoryRange = 'month'
  ankiStatsCache = null
  renderAll(state)
  showToast('Sandbox reset: no study progress yet', 'success')
}

function addSandboxDay() {
  if (!IS_SANDBOX) return
  const state = loadState() || createEmptySandboxState()
  const latestActivityDate = getLastSandboxActivityDate(state)
  const nextDate = latestActivityDate ? addDays(latestActivityDate, 1) : new Date()
  const scoreTarget = getSandboxAddedDayScoreTarget(state, nextDate)
  addSandboxStudyDay(state, nextDate, scoreTarget)
  syncStreak(state)
  saveState(state)
  setDefaultCityDayOffset(state)
  selectedHistoryView = 'heatmap'
  renderAll(state)
  showToast(`Added sandbox study day: ${formatCitySnapshotDate(nextDate)}`, 'success')
}

function getLastSandboxActivityDate(state) {
  const latestKey = state?.sandboxLastDate || getLatestSandboxDateKey(state)
  return latestKey ? dateKeyToLocalDate(latestKey) : null
}

function getLatestSandboxDateKey(state) {
  const dateKeys = []

  if (state?.sandboxStartDate) dateKeys.push(state.sandboxStartDate)

  Object.values(state?.videos || {}).forEach(video => {
    if (video.watchedAt) dateKeys.push(toDateKey(new Date(video.watchedAt)))
    else if (video.publishedAt && video.id?.startsWith?.('sandbox-added-')) {
      dateKeys.push(toDateKey(new Date(video.publishedAt)))
    }
  })

  Object.keys(state?.anki || {}).forEach(dateKey => dateKeys.push(dateKey))

  return dateKeys.sort().pop() || null
}

function getSandboxHeatmapEndDate(state) {
  const previewEnd = addDays(new Date(), 90)
  const latestActivityDate = getLastSandboxActivityDate(state)
  return latestActivityDate && latestActivityDate > previewEnd ? latestActivityDate : previewEnd
}

function getSandboxAddedDayScoreTarget(state, date) {
  return randomInt(0, 5)
}

function addSandboxStudyDay(state, date, scoreTarget = 6) {
  const dateKey = toDateKey(date)
  const daySeed = Math.abs(daysBetweenDateKeys('2024-01-01', dateKey))
  const channels = state.config.channels.length ? state.config.channels : DEFAULT_CHANNELS
  const activity = makeSandboxActivityForScore(scoreTarget)

  state.anki[dateKey] = {
    reviewed: activity.reviewed,
    created: activity.created,
    loggedAt: setLocalTime(date, 21, randomInt(0, 45)).toISOString(),
    source: 'sandbox'
  }

  const videoCount = activity.videoDurations.length
  for (let i = 0; i < videoCount; i += 1) {
    const id = `sandbox-added-${dateKey}-${Date.now()}-${i}`
    const channel = channels[(daySeed + i) % channels.length]
    state.videos[id] = {
      id,
      title: `Sandbox added study day ${dateKey}.${i + 1}`,
      channelId: channel.id,
      channelTitle: channel.name,
      thumbnail: makeSandboxThumbnail(channel.name, daySeed + i),
      publishedAt: setLocalTime(addDays(date, -randomInt(4, 28)), 9, randomInt(0, 45)).toISOString(),
      duration: activity.videoDurations[i],
      status: 'watched',
      watchedAt: setLocalTime(date, 17 + i, randomInt(0, 45)).toISOString()
    }
  }

  const activeId = `sandbox-added-active-${dateKey}-${Date.now()}`
  const activeChannel = channels[(daySeed + videoCount + 1) % channels.length]
  state.videos[activeId] = {
    id: activeId,
    title: `Sandbox upcoming lesson ${dateKey}`,
    channelId: activeChannel.id,
    channelTitle: activeChannel.name,
    thumbnail: makeSandboxThumbnail(activeChannel.name, daySeed + videoCount + 1),
    publishedAt: setLocalTime(date, 12, randomInt(0, 45)).toISOString(),
    duration: randomInt(18, 46) * 60,
    status: scoreTarget === 0 ? 'unwatched' : 'watch-later',
    watchedAt: null
  }

  state.sandboxLastDate = dateKey
  state.lastFetched = new Date().toISOString()
}

function createSandboxRecentVideos(state) {
  const channels = state.config.channels.length ? state.config.channels : DEFAULT_CHANNELS
  const now = new Date()
  const videos = []

  channels.forEach((channel, channelIndex) => {
    for (let i = 0; i < ACTIVE_VIDEOS_PER_CHANNEL; i += 1) {
      const publishedAt = new Date(now)
      publishedAt.setHours(now.getHours() - (channelIndex * ACTIVE_VIDEOS_PER_CHANNEL + i) * 6)
      videos.push({
        id: `sandbox-refresh-${channel.id}-${i}`,
        title: `Sandbox recent lesson ${channelIndex + 1}.${i + 1}`,
        channelId: channel.id,
        channelTitle: channel.name || channel.id,
        thumbnail: makeSandboxThumbnail(channel.name || channel.id, channelIndex + i),
        publishedAt: publishedAt.toISOString(),
        duration: (18 + ((channelIndex * 7 + i * 5) % 38)) * 60
      })
    }
  })

  return videos
}

function refreshSandboxFeed() {
  const s = loadState() || createEmptySandboxState()
  if (!s.config.channels.length) {
    showToast('Add at least one channel in ⚙ Settings first', 'warn')
    return
  }

  const videos = createSandboxRecentVideos(s)
  videos.forEach(v => {
    const existing = s.videos[v.id]
    s.videos[v.id] = {
      ...v,
      status: existing?.status ?? 'unwatched',
      watchedAt: existing?.watchedAt ?? null
    }
  })

  s.lastFetched = new Date().toISOString()
  saveState(s)
  renderAll(s)
  showToast(`${videos.length} dummy videos loaded`, 'success')
}

function makeSandboxActivityForScore(scoreTarget) {
  let remaining = Math.max(0, Math.floor(scoreTarget))
  const videoDurations = []

  if (remaining > 0) {
    videoDurations.push(randomInt(60, 180))
    remaining -= 1
  }

  const createdChunks = remaining >= 4 ? randomInt(0, Math.floor(remaining / 4)) : 0
  const created = createdChunks * 10 + (createdChunks ? randomInt(0, 9) : randomInt(0, 4))
  remaining -= createdChunks * 4

  const reviewedChunks = remaining >= 3 ? randomInt(0, Math.floor(remaining / 3)) : 0
  const reviewed = reviewedChunks * 50 + randomInt(0, 49)
  remaining -= reviewedChunks * 3

  if (remaining > 0) {
    const extraVideoCount = randomInt(0, Math.min(2, remaining))
    for (let i = 0; i < extraVideoCount; i += 1) {
      videoDurations.push(randomInt(60, 180))
    }
    remaining -= extraVideoCount
  }

  const durationPoints = remaining
  for (let i = 0; i < videoDurations.length; i += 1) {
    const scoredSeconds = i === 0 ? durationPoints * 12 * 60 : 0
    const unscoredSeconds = i === 0 ? randomInt(60, 300) : randomInt(60, 180)
    videoDurations[i] += scoredSeconds + unscoredSeconds
  }

  return { reviewed, created, videoDurations }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function openSettings() {
  const s = loadState()
  document.getElementById('settingsApiKey').value = s.config.apiKey
  document.getElementById('settingsGoal').value   = s.config.weeklyGoalHours
  renderChannelList(s.config.channels)
  show('settingsPanel')
}

function closeSettings() { hide('settingsPanel') }

function saveSettingsOnTheFly() {
  const s      = loadState()
  const apiKey = document.getElementById('settingsApiKey').value.trim()
  const goal   = parseInt(document.getElementById('settingsGoal').value) || 4
  if (apiKey) s.config.apiKey = apiKey
  s.config.weeklyGoalHours = goal
  saveState(s)
  renderAll(s)
}

function toggleTheme() {
  const s = loadState()
  s.config.theme = normalizeTheme(s.config.theme) === 'dark' ? 'light' : 'dark'
  saveState(s)
  applyTheme(s.config.theme)
}

function addChannel() {
  const idEl   = document.getElementById('newChannelId')
  const id     = idEl.value.trim()
  const name   = id

  if (!id.startsWith('UC') || id.length < 20) {
    showToast('Channel ID should start with UC and be ~24 characters', 'warn')
    return
  }
  const s = loadState()
  if (s.config.channels.find(c => c.id === id)) {
    showToast('Already added', 'warn'); return
  }
  s.config.channels.push({ id, name })
  saveState(s)
  renderChannelList(s.config.channels)
  idEl.value = ''
  showToast(`${name} added`)
}

function removeChannel(id) {
  const s = loadState()
  s.config.channels = s.config.channels.filter(c => c.id !== id)
  saveState(s)
  renderChannelList(s.config.channels)
}

function renderChannelList(channels) {
  const el = document.getElementById('channelList')
  if (!channels.length) { el.innerHTML = '<p style="color:var(--muted);font-size:.82rem">No channels yet</p>'; return }
  el.innerHTML = channels.map(c => `
    <div class="channel-item">
      <div>
        <div class="channel-item-name">${escHtml(c.name)}</div>
        <div class="channel-item-id">${escHtml(c.id)}</div>
      </div>
      <button class="channel-remove" onclick="removeChannel('${c.id}')" title="Remove">✕</button>
    </div>
  `).join('')
}

function showResetConfirm() {
  document.getElementById('resetConfirm')?.classList.remove('hidden')
}

function hideResetConfirm() {
  document.getElementById('resetConfirm')?.classList.add('hidden')
}

function resetApp() {
  localStorage.removeItem(STORAGE_KEY)
  document.cookie = `${CONFIG_COOKIE_KEY}=; max-age=0; path=/`
  location.reload()
}

// ════════════════════════════════════════════════════════════
// YOUTUBE API
// ════════════════════════════════════════════════════════════

// Every channel has a hidden uploads playlist: swap "UC" prefix for "UU"
function uploadsId(channelId) { return 'UU' + channelId.slice(2) }

function parseDuration(iso) {
  if (!iso) return 0  // live streams / premieres have no duration field
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  return m ? (parseInt(m[1]||0)*3600 + parseInt(m[2]||0)*60 + parseInt(m[3]||0)) : 0
}

async function ytFetch(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchChannelVideosPage(channel, apiKey, pageToken = '') {
  const pid  = uploadsId(channel.id)
  const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
  const url  = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${FETCH_PAGE_SIZE}&playlistId=${pid}&key=${apiKey}${tokenParam}`
  const data = await ytFetch(url)
  return {
    videos: data.items.map(item => ({
      id:           item.snippet.resourceId.videoId,
      title:        item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId:    channel.id,
      thumbnail:    item.snippet.thumbnails?.high?.url
                    || item.snippet.thumbnails?.medium?.url
                    || item.snippet.thumbnails?.default?.url,
      publishedAt:  item.snippet.publishedAt
    })),
    nextPageToken: data.nextPageToken || null
  }
}

async function fetchChannelVideos(channel, apiKey, knownVideos = {}) {
  const fetched = []
  let pageToken = ''
  let pages = 0

  while (pages < MAX_FETCH_PAGES_PER_CHANNEL) {
    const page = await fetchChannelVideosPage(channel, apiKey, pageToken)
    pages += 1
    fetched.push(...page.videos)

    const activeCount = fetched
      .filter(v => (knownVideos[v.id]?.status || 'unwatched') !== 'watched')
      .length

    if (activeCount >= ACTIVE_VIDEOS_PER_CHANNEL || !page.nextPageToken) break
    pageToken = page.nextPageToken
  }

  return fetched
}

async function fetchDurations(videoIds, apiKey) {
  const result = {}
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50).join(',')
    const url   = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch}&key=${apiKey}`
    const data  = await ytFetch(url)
    data.items.forEach(item => { result[item.id] = parseDuration(item.contentDetails?.duration) })
  }
  return result
}

async function refreshFeed() {
  const btn = document.getElementById('refreshBtn')
  btn.textContent = '↻ Refreshing…'
  btn.classList.add('loading')
  btn.disabled = true

  try {
    if (IS_SANDBOX) {
      refreshSandboxFeed()
      return
    }

    const s = loadState()
    if (!s.config.channels.length) {
      showToast('Add at least one channel in ⚙ Settings first', 'warn')
      return
    }

    const all    = []
    const errors = []

    // Fetch each channel concurrently
    await Promise.all(s.config.channels.map(async ch => {
      try {
        const vids = await fetchChannelVideos(ch, s.config.apiKey, s.videos)
        all.push(...vids)
        // Auto-update stored channel name from API response
        const first = vids[0]
        if (first?.channelTitle && first.channelTitle !== ch.name) {
          ch.name = first.channelTitle
        }
      } catch (err) {
        console.warn(`${ch.name}:`, err.message)
        errors.push(ch.name)
      }
    }))

    // Deduplicate
    const seen   = new Set()
    const unique = all.filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true })

    // Fetch durations (single batch call per 50 videos)
    const durations = await fetchDurations(unique.map(v => v.id), s.config.apiKey)

    // Merge into state — preserve existing watch status
    unique.forEach(v => {
      const existing = s.videos[v.id]
      s.videos[v.id] = {
        ...v,
        duration:   durations[v.id] ?? existing?.duration ?? 0,
        status:     existing?.status    ?? 'unwatched',
        watchedAt:  existing?.watchedAt ?? null
      }
    })

    s.lastFetched = new Date().toISOString()
    saveState(s)
    renderAll(s)

    const msg = errors.length
      ? `Loaded ${unique.length} videos (${errors.length} channel${errors.length > 1 ? 's' : ''} failed)`
      : `${unique.length} videos loaded`
    showToast(msg, errors.length ? 'warn' : 'success')

  } catch (err) {
    console.error(err)
    showToast(`Refresh failed: ${err.message}`, 'error')
  } finally {
    // Always re-enable the button, even if we returned early or threw
    btn.textContent = '↻ Refresh'
    btn.classList.remove('loading')
    btn.disabled = false
  }
}

// ════════════════════════════════════════════════════════════
// WATCH STATUS & STREAK
// ════════════════════════════════════════════════════════════

function markVideo(videoId, newStatus) {
  const s     = loadState()
  const video = s.videos[videoId]
  if (!video) return
  if (video.status === newStatus) return

  const undoAction = {
    type: 'video-status',
    videoId,
    before: {
      status: video.status,
      watchedAt: video.watchedAt || null
    },
    after: {
      status: newStatus
    }
  }

  video.status    = newStatus
  video.watchedAt = newStatus === 'watched' ? new Date().toISOString() : null
  undoAction.after.watchedAt = video.watchedAt
  pushUndoAction(s, undoAction)

  syncStreak(s)

  saveState(s)
  renderAll(s)
}

function markVideoInProgressOnOpen(videoId) {
  const s     = loadState()
  const video = s.videos[videoId]
  if (!video || ['partial', 'watched'].includes(video.status)) return

  pushUndoAction(s, {
    type: 'video-status',
    videoId,
    before: {
      status: video.status,
      watchedAt: video.watchedAt || null
    },
    after: {
      status: 'partial',
      watchedAt: null
    }
  })

  video.status = 'partial'
  video.watchedAt = null

  saveState(s)
  setTimeout(() => renderAll(loadState()), 0)
}

function pushUndoAction(s, action) {
  normalizeUndoState(s)
  s.undoStack.push(action)
  if (s.undoStack.length > UNDO_STACK_LIMIT) {
    s.undoStack.splice(0, s.undoStack.length - UNDO_STACK_LIMIT)
  }
}

function undoLastVideoAction() {
  const s = loadState()
  const undo = s.undoStack.pop()
  if (undo?.type !== 'video-status') {
    showToast('Nothing to undo', 'warn')
    return
  }

  const video = s.videos[undo.videoId]
  if (!video) {
    saveState(s)
    renderAll(s)
    showToast('That video is no longer available', 'warn')
    return
  }

  video.status = undo.before.status
  video.watchedAt = undo.before.watchedAt
  syncStreak(s)

  saveState(s)
  renderAll(s)
  showToast(`Undid change: "${formatToastTitle(video.title)}" is back to ${formatVideoStatus(undo.before.status)}.`)
}

function dateKeyToLocalDate(dateKey) {
  return new Date(`${dateKey}T00:00:00`)
}

function getPreviousDateKey(dateKey) {
  const date = dateKeyToLocalDate(dateKey)
  date.setDate(date.getDate() - 1)
  return toDateKey(date)
}

function getDaysBetweenDateKeys(prevKey, nextKey) {
  return Math.round((dateKeyToLocalDate(nextKey) - dateKeyToLocalDate(prevKey)) / 86_400_000)
}

function syncStreak(s) {
  const today = toDateKey()
  const end = dateKeyToLocalDate(today)
  end.setHours(23, 59, 59, 999)

  const qualifyingDays = getStudyHistoryBetween(s, new Date(0), end).rows
    .filter(row => getHistoryDayPoints(row) >= MIN_DAILY_STREAK_POINTS)
    .map(row => row.dateKey)
    .sort()

  const qualifyingSet = new Set(qualifyingDays)
  let longest = 0
  let run = 0
  let previous = null

  for (const dateKey of qualifyingDays) {
    run = previous && getDaysBetweenDateKeys(previous, dateKey) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = dateKey
  }

  const yesterday = getPreviousDateKey(today)
  const anchor = qualifyingSet.has(today) ? today : qualifyingSet.has(yesterday) ? yesterday : null
  let current = 0
  let cursor = anchor

  while (cursor && qualifyingSet.has(cursor)) {
    current += 1
    cursor = getPreviousDateKey(cursor)
  }

  s.streak.current = current
  s.streak.longest = longest
  s.streak.lastActivityDate = qualifyingDays[qualifyingDays.length - 1] || null
}

function isStreakAlive(s) {
  const today     = toDateKey()
  const yesterday = getPreviousDateKey(today)
  return s.streak.lastActivityDate === today || s.streak.lastActivityDate === yesterday
}

function formatVideoStatus(status) {
  return {
    unwatched: 'Unwatched',
    'watch-later': 'Watch later',
    partial: 'In progress',
    watched: 'Watched'
  }[status] || 'its previous status'
}

function formatToastTitle(title) {
  const clean = title || 'Video'
  return clean.length > 48 ? `${clean.slice(0, 45)}...` : clean
}

// ════════════════════════════════════════════════════════════
// ANKI
// ════════════════════════════════════════════════════════════

async function ankiConnect(action, params = {}, timeoutMs = 2500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      body: JSON.stringify({ action, version: 6, params }),
      signal: controller.signal
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.result
  } finally {
    clearTimeout(timer)
  }
}

async function fetchAnkiStats() {
  const actions = [
    { action: 'getNumCardsReviewedToday' },
    { action: 'findCards', params: { query: 'added:1' } },
    { action: 'findCards', params: { query: 'is:due' } }
  ]
  const result = await ankiConnect('multi', { actions })
  const unwrap = (idx, fallback) => {
    const item = result?.[idx]
    if (item == null) return fallback
    if (typeof item === 'object' && !Array.isArray(item) && 'error' in item) {
      if (item.error) return fallback
      return item.result ?? fallback
    }
    return item
  }

  const newToday = unwrap(1, [])
  const dueCards = unwrap(2, [])
  return {
    reviewedToday: unwrap(0, 0) || 0,
    newToday: Array.isArray(newToday) ? newToday.length : 0,
    dueCards: Array.isArray(dueCards) ? dueCards.length : 0,
    fetchedAt: new Date().toISOString()
  }
}

async function refreshAnkiStats({ silent = false } = {}) {
  const statusEl = document.getElementById('ankiConnectStatus')
  if (statusEl) {
    statusEl.textContent = 'Checking AnkiConnect…'
    statusEl.classList.remove('logged')
  }

  try {
    ankiStatsCache = await fetchAnkiStats()
    syncAnkiStatsToState(ankiStatsCache)
    renderAnkiStatus(loadState())
    if (!silent) showToast('Anki stats updated')
  } catch (err) {
    ankiStatsCache = null
    renderAnkiStatus(loadState())
    const message = err?.message ? `AnkiConnect failed: ${err.message}` : 'AnkiConnect not available'
    const statusEl = document.getElementById('ankiConnectStatus')
    if (statusEl) statusEl.textContent = message
    if (!silent) showToast(message, 'warn')
  }
}

function startAnkiAutoRefresh() {
  clearInterval(startAnkiAutoRefresh._timer)
  startAnkiAutoRefresh._timer = setInterval(() => {
    if (!document.hidden) refreshAnkiStats({ silent: true })
  }, ANKI_AUTO_REFRESH_MS)
}

function refreshAnkiStatsOnVisible() {
  if (!document.hidden) refreshAnkiStats({ silent: true })
}

function syncAnkiStatsToState(stats) {
  const s = loadState()
  if (!s || !stats) return

  s.anki[toDateKey()] = {
    reviewed: stats.reviewedToday,
    created: stats.newToday,
    loggedAt: stats.fetchedAt,
    source: 'ankiconnect'
  }
  syncStreak(s)
  saveState(s)
  renderHeader(s)
  renderAnalytics(getWeeklyStats(s), s)
  const score = getCurrentCityScore(s)
  renderCity(score, s)
}

function formatAnkiStatus(stats) {
  if (!stats?.fetchedAt) return 'Open Anki to load live stats'
  return `Updated ${timeAgo(stats.fetchedAt)}`
}

function setText(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value ?? '—'
}

function getHistoryRange(range = selectedHistoryRange, from = new Date()) {
  const end = new Date(from)
  end.setHours(23, 59, 59, 999)

  const start = new Date(from)
  if (range === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else if (range === 'week') {
    start.setTime(getWeekStart(from).getTime())
  } else {
    start.setHours(0, 0, 0, 0)
  }

  return { start, end }
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function createHistoryBucket(dateKey) {
  return {
    dateKey,
    secondsWatched: 0,
    videosWatched: 0,
    ankiReviewed: 0,
    ankiCreated: 0,
    watchedVideos: []
  }
}

function getStudyHistory(s, range = selectedHistoryRange) {
  const { start, end } = getHistoryRange(range)
  return getStudyHistoryBetween(s, start, end)
}

function getStudyHistoryBetween(s, start, end) {
  const buckets = new Map()
  const ensureBucket = dateKey => {
    if (!buckets.has(dateKey)) buckets.set(dateKey, createHistoryBucket(dateKey))
    return buckets.get(dateKey)
  }

  for (const video of Object.values(s.videos || {})) {
    if (!video.watchedAt || video.status !== 'watched') continue
    const date = new Date(video.watchedAt)
    if (date < start || date > end) continue
    const bucket = ensureBucket(toDateKey(date))
    bucket.videosWatched += 1
    bucket.secondsWatched += video.duration || 0
    bucket.watchedVideos.push({
      id: video.id || '',
      title: video.title || 'Untitled video',
      thumbnail: video.thumbnail || '',
      duration: video.duration || 0,
      watchedAt: video.watchedAt
    })
  }

  for (const [dateKey, day] of Object.entries(s.anki || {})) {
    const date = new Date(`${dateKey}T00:00:00`)
    if (date < start || date > end) continue
    const bucket = ensureBucket(dateKey)
    bucket.ankiReviewed += day.reviewed || 0
    bucket.ankiCreated += day.created || 0
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  rows.forEach(row => {
    row.watchedVideos.sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
  })

  const summary = rows.reduce((acc, row) => {
    acc.secondsWatched += row.secondsWatched
    acc.videosWatched += row.videosWatched
    acc.ankiReviewed += row.ankiReviewed
    acc.ankiCreated += row.ankiCreated
    acc.watchedVideos.push(...row.watchedVideos)
    return acc
  }, createHistoryBucket('summary'))

  return { rows, summary }
}

function renderHistoryWatchedCell(row) {
  if (!row.videosWatched || !row.watchedVideos.length) return '0'
  return `
    <span class="history-video-cell">
      <button type="button" class="history-video-count" onclick="toggleHistoryVideoPopover(event)" aria-expanded="false" aria-label="Show ${row.videosWatched} videos watched on ${escHtml(formatHeatmapTitle(row))}">
        <span class="history-video-count-number">${row.videosWatched}</span>
        <span class="history-video-count-caret" aria-hidden="true"></span>
      </button>
      <span class="history-video-popover" role="dialog" aria-label="Watched videos">
        ${row.watchedVideos.map(video => `
          <span class="history-video-popover-item">
            ${video.thumbnail
              ? `<img src="${escHtml(video.thumbnail)}" alt="" class="history-video-thumb" loading="lazy">`
              : '<span class="history-video-thumb history-video-thumb-empty"></span>'}
            <span class="history-video-details">
              <span class="history-video-title">${escHtml(video.title)}</span>
              <span class="history-video-duration">${formatDuration(video.duration)}</span>
            </span>
          </span>
        `).join('')}
      </span>
    </span>
  `
}

function toggleHistoryVideoPopover(event) {
  event.stopPropagation()
  const cell = event.currentTarget.closest('.history-video-cell')
  if (!cell) return
  const shouldOpen = !cell.classList.contains('open')
  closeHistoryVideoPopovers(cell)
  cell.classList.toggle('open', shouldOpen)
  event.currentTarget.setAttribute('aria-expanded', String(shouldOpen))
}

function closeHistoryVideoPopovers(exceptCell = null) {
  document.querySelectorAll('.history-video-cell.open').forEach(cell => {
    if (cell === exceptCell) return
    cell.classList.remove('open')
    cell.querySelector('.history-video-count')?.setAttribute('aria-expanded', 'false')
  })
}

function closeHistoryVideoPopoversOnOutsideClick(event) {
  if (event.target.closest('.history-video-cell')) return
  closeHistoryVideoPopovers()
}

function closeHistoryVideoPopoversOnEscape(event) {
  if (event.key !== 'Escape') return
  closeHistoryVideoPopovers()
}

function formatHistoryDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`)
  const today = toDateKey()
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000))
  if (dateKey === today) return 'Today'
  if (dateKey === yesterday) return 'Yesterday'
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function renderStudyHistoryPanel(s) {
  const todayLog = s?.anki?.[toDateKey()]
  const stats = ankiStatsCache || (todayLog ? {
    reviewedToday: todayLog.reviewed,
    newToday: todayLog.created,
    dueCards: null,
    fetchedAt: todayLog.loggedAt
  } : null)

  const el = document.getElementById('ankiConnectStatus')
  if (el) {
    el.textContent = formatAnkiStatus(stats)
    el.classList.toggle('logged', !!stats)
  }

  document.querySelectorAll('.history-range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.historyRange === selectedHistoryRange)
  })
  document.querySelectorAll('.history-view-btn').forEach(btn => {
    const isActive = btn.dataset.historyView === selectedHistoryView
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
  })

  const history = getStudyHistory(s || { videos: {}, anki: {} })
  setText('historyStudyTime', formatHistoryTime(history.summary.secondsWatched))
  setText('historyVideosWatched', history.summary.videosWatched)
  setText('historyAnkiReviewed', history.summary.ankiReviewed)
  setText('historyAnkiCreated', history.summary.ankiCreated)

  const table = document.getElementById('historyTable')
  if (table) {
    table.innerHTML = history.rows.length
      ? `
        <div class="history-row history-row-head">
          <span>Date</span>
          <span>Video</span>
          <span>Watched</span>
          <span>Anki</span>
        </div>
        ${history.rows.map(row => `
          <div class="history-row">
            <span>${formatHistoryDate(row.dateKey)}</span>
            <span>${formatHistoryTime(row.secondsWatched)}</span>
            <span>${renderHistoryWatchedCell(row)}</span>
            <span>${row.ankiReviewed} / ${row.ankiCreated}</span>
          </div>
        `).join('')}
      `
      : '<div class="history-empty">No activity in this range.</div>'
  }

  const summaryView = document.getElementById('historySummaryView')
  const heatmapView = document.getElementById('historyHeatmapView')
  const rangeToolbar = document.getElementById('historyRangeToolbar')
  if (rangeToolbar) rangeToolbar.classList.toggle('hidden', selectedHistoryView === 'heatmap')
  if (summaryView) summaryView.classList.toggle('hidden', selectedHistoryView !== 'summary')
  if (heatmapView) {
    heatmapView.classList.toggle('hidden', selectedHistoryView !== 'heatmap')
    if (selectedHistoryView === 'heatmap') renderHistoryHeatmap(s || { videos: {}, anki: {} }, heatmapView)
  }
}

function getHistoryHeatLevel(row) {
  const score = getHistoryDayPoints(row)
  if (score <= 0) return 0
  if (score < 2) return 1
  if (score < 4) return 2
  if (score < 7) return 3
  return 4
}

function getHistoryDayPoints(row) {
  const hoursWatched = row.secondsWatched / 3600
  const score =
    (hoursWatched * 5) +
    row.videosWatched +
    (Math.floor(row.ankiReviewed / 50) * 3) +
    (Math.floor(row.ankiCreated / 10) * 4)
  return Math.floor(score)
}

function hasHistoryActivity(row) {
  return row.secondsWatched > 0 || row.videosWatched > 0 || row.ankiReviewed > 0 || row.ankiCreated > 0
}

function formatHeatmapTitle(row) {
  const date = new Date(`${row.dateKey}T00:00:00`)
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatHeatmapAriaLabel(row) {
  return `${formatHeatmapTitle(row)}: ${getHistoryDayPoints(row)} points; ${formatHistoryTime(row.secondsWatched)} video time; ${row.videosWatched} videos watched; ${row.ankiReviewed} Anki cards reviewed; ${row.ankiCreated} new Anki cards created`
}

function renderHistoryHeatmap(s, container) {
  const end = IS_SANDBOX ? getSandboxHeatmapEndDate(s) : new Date()
  end.setHours(23, 59, 59, 999)
  const start = addDays(end, -364)
  start.setHours(0, 0, 0, 0)
  const history = getStudyHistoryBetween(s, start, end)
  const firstActive = history.rows
    .slice()
    .reverse()
    .find(hasHistoryActivity)
  if (!firstActive) {
    container.innerHTML = '<div class="history-empty">No activity to map yet.</div>'
    return
  }
  const gridStart = new Date(`${firstActive.dateKey}T00:00:00`)
  const rowsByDate = new Map(history.rows.map(row => [row.dateKey, row]))
  const days = []
  for (let date = new Date(gridStart); date <= end; date = addDays(date, 1)) {
    const dateKey = toDateKey(date)
    const row = rowsByDate.get(dateKey) || createHistoryBucket(dateKey)
    days.push(row)
  }
  const weekCount = Math.ceil(days.length / 7)

  container.innerHTML = `
    <div class="heatmap-scroll">
      <div class="heatmap-grid" style="grid-template-columns: repeat(${weekCount}, 12px)">
        ${days.map(row => `
          <span class="heatmap-day level-${getHistoryHeatLevel(row)}" data-date="${escHtml(formatHeatmapTitle(row))}" data-points="${getHistoryDayPoints(row)}" data-time="${escHtml(formatHistoryTime(row.secondsWatched))}" data-videos="${row.videosWatched}" data-reviewed="${row.ankiReviewed}" data-created="${row.ankiCreated}" aria-label="${escHtml(formatHeatmapAriaLabel(row))}" tabindex="0" onmouseenter="showHeatmapTooltip(event)" onmousemove="positionHeatmapTooltip(event.currentTarget)" onmouseleave="hideHeatmapTooltip()" onfocus="showHeatmapTooltip(event)" onblur="hideHeatmapTooltip()"></span>
        `).join('')}
      </div>
    </div>
  `
}

function showHeatmapTooltip(event) {
  const target = event.currentTarget
  const tooltip = document.getElementById('heatmapTooltip')
  if (!target || !tooltip) return
  tooltip.innerHTML = `
    <div class="heatmap-tooltip-head">
      <div class="heatmap-tooltip-title">${escHtml(target.dataset.date)}</div>
      <div class="heatmap-tooltip-points">${escHtml(target.dataset.points)} pts</div>
    </div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">⏱</span><span>Video time</span><b>${escHtml(target.dataset.time)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">✓</span><span>Videos watched</span><b>${escHtml(target.dataset.videos)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">A</span><span>Anki reviewed</span><b>${escHtml(target.dataset.reviewed)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">+</span><span>New Anki cards</span><b>${escHtml(target.dataset.created)}</b></div>
  `
  tooltip.classList.add('show')
  positionHeatmapTooltip(target)
}

function positionHeatmapTooltip(target) {
  const tooltip = document.getElementById('heatmapTooltip')
  if (!target || !tooltip || !tooltip.classList.contains('show')) return
  const rect = target.getBoundingClientRect()
  const gap = 10
  const margin = 8
  const left = Math.min(
    window.innerWidth - tooltip.offsetWidth - margin,
    Math.max(margin, rect.left + rect.width / 2 - tooltip.offsetWidth / 2)
  )
  let top = rect.top - tooltip.offsetHeight - gap
  if (top < margin) top = rect.bottom + gap
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
}

function hideHeatmapTooltip() {
  const tooltip = document.getElementById('heatmapTooltip')
  if (!tooltip) return
  tooltip.classList.remove('show')
}

// ════════════════════════════════════════════════════════════
// ANALYTICS & CITY SCORE
// ════════════════════════════════════════════════════════════

function getWeeklyStats(s) {
  const currentDate = getCurrentAppDate(s)
  const weekStart = getWeekStart(currentDate)
  const weekEnd = new Date(currentDate)
  if (IS_SANDBOX) weekEnd.setHours(23, 59, 59, 999)

  const videos = Object.values(s.videos)
  const weekVids = videos
    .filter(v => {
      if (!v.watchedAt) return false
      const watchedAt = new Date(v.watchedAt)
      return watchedAt >= weekStart && watchedAt <= weekEnd
    })

  const watched = weekVids.filter(v => v.status === 'watched')
  const partial = videos.filter(v => v.status === 'partial')

  const secondsWatched = watched.reduce((sum, v) => sum + (v.duration || 0), 0)

  const hoursWatched = secondsWatched / 3600
  const goalHours    = s.config.weeklyGoalHours || 4
  const goalProgress = Math.min((hoursWatched / goalHours) * 100, 100)
  const remainingSeconds = Math.max(0, Math.round(goalHours * 3600 - secondsWatched))

  // Anki totals for this week
  const todayKey = getCurrentAppDateKey(s)
  const ankiThisWeek = Object.entries(s.anki)
    .filter(([date]) => new Date(date) >= weekStart && date <= todayKey)
    .reduce((acc, [, d]) => ({ reviewed: acc.reviewed + (d.reviewed||0), created: acc.created + (d.created||0) }), { reviewed: 0, created: 0 })

  return {
    hoursWatched, secondsWatched, goalHours, goalProgress,
    videosWatched: watched.length,
    videosPartial: partial.length,
    remainingSeconds,
    ankiReviewed: ankiThisWeek.reviewed,
    ankiCreated:  ankiThisWeek.created
  }
}

function formatHoursMinutes(secs) {
  const hours = Math.floor(secs / 3600)
  const minutes = Math.ceil((secs % 3600) / 60)
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

function formatHistoryTime(secs) {
  const hours = Math.floor(secs / 3600)
  const minutes = Math.ceil((secs % 3600) / 60)
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes} min` : `${hours}h`
  }
  return `${minutes} min`
}

function getCurrentCityScore(s) {
  return calcCityScoreWithoutStreak(getCityStatsThroughDate(s, new Date()))
}

function calcCityScoreWithoutStreak(stats) {
  let score = 0
  score += stats.hoursWatched * 5                        // 5 pts per hour
  score += stats.videosWatched                           // 1 pt per watched video
  score += Math.floor(stats.ankiReviewed / 50) * 3      // 3 pts per 50 reviews
  score += Math.floor(stats.ankiCreated  / 10) * 4      // 4 pts per 10 new cards
  return Math.floor(score)
}

function getCityLevel(score) {
  return CITY_LEVELS[getCityLevelIndex(score)]
}

function getCityLevelIndex(score) {
  let index = 0
  CITY_LEVELS.forEach((level, i) => {
    if (score >= level.threshold) index = i
  })
  return index
}

function getCityScoreForLevelIndex(index) {
  return CITY_LEVELS[clampNumber(index, 0, CITY_LEVELS.length - 1)]?.threshold || 0
}

function getCityStage(score) {
  return getCityLevel(score).label
}

function getNextCityLevel(score) {
  return CITY_LEVELS.find(level => score < level.threshold) || null
}

function getTimeOfDay(date = new Date()) {
  const hour = date.getHours()
  if (hour >= TIME_OF_DAY_MODES.sunset.start) return hour >= TIME_OF_DAY_MODES.night.start ? 'night' : 'sunset'
  if (hour >= TIME_OF_DAY_MODES.afternoon.start) return 'afternoon'
  if (hour >= TIME_OF_DAY_MODES.noon.start) return 'noon'
  if (hour >= TIME_OF_DAY_MODES.morning.start) return 'morning'
  if (hour >= TIME_OF_DAY_MODES.dawn.start) return 'dawn'
  return 'night'
}

function isNightTime(date = new Date()) {
  const hour = date.getHours()
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
}

function getNightKey(date = new Date()) {
  const d = new Date(date)
  if (d.getHours() < NIGHT_END_HOUR) d.setDate(d.getDate() - 1)
  return toDateKey(d)
}

function getNightMinute(date = new Date()) {
  const hour = date.getHours()
  const minute = date.getMinutes()
  return hour >= NIGHT_START_HOUR
    ? (hour - NIGHT_START_HOUR) * 60 + minute
    : (24 - NIGHT_START_HOUR + hour) * 60 + minute
}

function isNightVisualTime(date = new Date()) {
  if (!isNightTime(date)) return false
  return getNightMinute(date) < NIGHT_VISUAL_TOTAL_MINUTES
}

function createNightVisualSchedule() {
  const slots = []
  const maxStart = NIGHT_VISUAL_TOTAL_MINUTES - NIGHT_VISUAL_DURATION_MINUTES

  NIGHT_VISUAL_TYPES.forEach(type => {
    const candidates = Array.from({ length: maxStart + 1 }, (_, start) => start)
      .filter(start => !slots.some(event =>
        start < event.startMinute + NIGHT_VISUAL_DURATION_MINUTES &&
        event.startMinute < start + NIGHT_VISUAL_DURATION_MINUTES
      ))
    const start = candidates[Math.floor(Math.random() * candidates.length)]
    slots.push({ type, startMinute: start })
  })

  return slots.sort((a, b) => a.startMinute - b.startMinute)
}

function ensureNightVisualSchedule(s, date = new Date()) {
  const nightKey = getNightKey(date)
  if (s.nightVisuals?.nightKey === nightKey && Array.isArray(s.nightVisuals.events)) return false

  s.nightVisuals = {
    nightKey,
    durationMinutes: NIGHT_VISUAL_DURATION_MINUTES,
    events: createNightVisualSchedule()
  }
  saveState(s)
  return true
}

// ════════════════════════════════════════════════════════════
// RENDERING
// ════════════════════════════════════════════════════════════

function renderAll(s) {
  const stats = getWeeklyStats(s)
  const score = getCurrentCityScore(s)
  renderHeader(s)
  renderAnalytics(stats, s)
  renderAnkiStatus(s)
  renderCity(score, s)
  renderFeed(s)
  renderUndoButton(s)
}

function renderHeader(s) {
  document.getElementById('weekLabel').textContent  = getWeekLabel()
  document.getElementById('streakCount').textContent = s.streak.current
  const pill = document.getElementById('streakDisplay')
  pill.classList.toggle('alive', isStreakAlive(s))
}

function renderAnalytics(stats, s) {
  document.getElementById('hoursWatched').textContent    = stats.hoursWatched.toFixed(1)
  document.getElementById('goalHours').textContent       = stats.goalHours
  document.getElementById('videosWatched').textContent   = stats.videosWatched
  document.getElementById('videosPartial').textContent   = stats.videosPartial
  document.getElementById('videosRemaining').textContent = formatHoursMinutes(stats.remainingSeconds)

  const bar = document.getElementById('goalProgressBar')
  bar.style.width = `${stats.goalProgress}%`
  bar.classList.toggle('has-progress', stats.goalProgress > 0)
  bar.classList.toggle('complete', stats.goalProgress >= 100)
}

function renderAnkiStatus(s) {
  renderStudyHistoryPanel(s)
}

function setHistoryRange(range) {
  selectedHistoryRange = HISTORY_RANGES.includes(range) ? range : 'week'
  renderStudyHistoryPanel(loadState())
}

function setHistoryView(view) {
  selectedHistoryView = view === 'heatmap' ? 'heatmap' : 'summary'
  renderStudyHistoryPanel(loadState())
}

function stepCityDay(delta) {
  const state = loadState()
  if (!state) return
  selectedCityDayOffset = clampCityDayOffset(state, selectedCityDayOffset + delta)
  renderCity(getCurrentCityScore(state), state)
}

function setDefaultCityDayOffset(state) {
  selectedCityDayOffset = IS_SANDBOX ? getLastCityDayOffset(state) : 0
}

function resetCityDay() {
  const state = loadState()
  if (state) setDefaultCityDayOffset(state)
  if (state) renderCity(getCurrentCityScore(state), state)
}

function setCityDayOffset(offset) {
  const state = loadState()
  if (!state) return
  selectedCityDayOffset = clampCityDayOffset(state, offset)
  renderCity(getCurrentCityScore(state), state)
}

function previewCityDayOffset(offset) {
  const state = loadState()
  if (!state) return
  const previousOffset = selectedCityDayOffset
  selectedCityDayOffset = clampCityDayOffset(state, offset)
  const snapshot = getCitySnapshot(getCurrentCityScore(state), state)
  selectedCityDayOffset = previousOffset
  renderCitySnapshot(snapshot, state, false)
}

function renderCity(score, s) {
  const snapshot = getCitySnapshot(score, s)
  renderCitySnapshot(snapshot, s, true)
}

function renderCitySnapshot(snapshot, s, includeTimeline = true) {
  document.getElementById('cityScore').textContent = snapshot.score
  document.getElementById('cityLabel').textContent = getCityStage(snapshot.visualScore)
  const scoreContext = document.getElementById('cityScoreContext')
  if (scoreContext) scoreContext.textContent = snapshot.isToday ? 'total pts' : 'pts by then'
  const nextLevel = CITY_LEVELS[snapshot.visualLevelIndex + 1] || null
  document.getElementById('cityNextLevel').textContent = nextLevel
    ? `${nextLevel.threshold - snapshot.score} pts to ${nextLevel.label}`
    : 'Max level'

  // Reveal elements whose threshold has been reached
  document.querySelectorAll('[data-threshold]').forEach(el => {
    el.style.opacity = snapshot.visualScore >= parseInt(el.dataset.threshold) ? '1' : '0'
  })

  if (includeTimeline) renderCityTimeControls(snapshot)
  updateCityMilestoneImage(snapshot.visualScore)
  applyCityTimeOfDay(s.streak.lastActivityDate === toDateKey())
  applyPeasantPosition()
  applyNightVisuals(s)
}

function getCitySnapshot(currentScore, s) {
  selectedCityDayOffset = clampCityDayOffset(s, selectedCityDayOffset)
  const date = addDays(new Date(), selectedCityDayOffset)
  const isToday = selectedCityDayOffset === 0
  const minOffset = getFirstCityDayOffset(s)
  const maxOffset = getLastCityDayOffset(s)
  if (isToday) {
    const visualLevelIndex = updatePersistentCityLevel(s, currentScore)
    return {
      date,
      isToday,
      minOffset,
      maxOffset,
      score: currentScore,
      visualLevelIndex,
      visualScore: getCityScoreForLevelIndex(visualLevelIndex)
    }
  }

  const stats = getCityStatsThroughDate(s, date)
  const score = calcCityScoreWithoutStreak(stats)
  const visualLevelIndex = getHistoricMaxCityLevelIndex(s, date)
  return {
    date,
    isToday,
    minOffset,
    maxOffset,
    score,
    visualLevelIndex,
    visualScore: getCityScoreForLevelIndex(visualLevelIndex)
  }
}

function updatePersistentCityLevel(s, score) {
  const previousMax = Number.isInteger(s.cityProgress?.maxLevelIndex)
    ? s.cityProgress.maxLevelIndex
    : 0
  normalizeCityProgress(s)
  if (s.cityProgress.maxLevelIndex !== previousMax) {
    saveState(s)
  }
  return s.cityProgress.maxLevelIndex
}

function clampCityDayOffset(s, offset) {
  const firstOffset = getFirstCityDayOffset(s)
  const lastOffset = getLastCityDayOffset(s)
  return Math.max(firstOffset, Math.min(lastOffset, offset))
}

function getFirstCityDayOffset(s) {
  const firstDateKey = getFirstStudyActionDateKey(s)
  if (!firstDateKey) return 0
  return Math.min(0, daysBetweenDateKeys(toDateKey(), firstDateKey))
}

function getLastCityDayOffset(s) {
  if (!IS_SANDBOX) return 0
  const lastDateKey = getLastStudyActionDateKey(s)
  if (!lastDateKey) return 0
  return Math.max(0, daysBetweenDateKeys(toDateKey(), lastDateKey))
}

function getFirstStudyActionDateKey(s) {
  const dates = []

  if (IS_SANDBOX && s?.sandboxStartDate) dates.push(s.sandboxStartDate)

  Object.values(s?.videos || {}).forEach(video => {
    if (video.watchedAt) dates.push(toDateKey(new Date(video.watchedAt)))
  })

  Object.entries(s?.anki || {}).forEach(([dateKey, day]) => {
    if ((day.reviewed || 0) > 0 || (day.created || 0) > 0) dates.push(dateKey)
  })

  return dates.sort()[0] || null
}

function getLastStudyActionDateKey(s) {
  const dates = []

  if (IS_SANDBOX && s?.sandboxLastDate) dates.push(s.sandboxLastDate)

  Object.values(s?.videos || {}).forEach(video => {
    if (video.watchedAt) dates.push(toDateKey(new Date(video.watchedAt)))
  })

  Object.entries(s?.anki || {}).forEach(([dateKey, day]) => {
    if ((day.reviewed || 0) > 0 || (day.created || 0) > 0) dates.push(dateKey)
  })

  return dates.sort().pop() || null
}

function daysBetweenDateKeys(fromKey, toKey) {
  const from = new Date(`${fromKey}T00:00:00`)
  const to = new Date(`${toKey}T00:00:00`)
  return Math.round((to - from) / 86_400_000)
}

function getCityStatsThroughDate(s, date) {
  const firstDateKey = getFirstStudyActionDateKey(s)
  const start = firstDateKey ? dateKeyToLocalDate(firstDateKey) : new Date(0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  const history = getStudyHistoryBetween(s || { videos: {}, anki: {} }, start, end)
  const summary = history.summary

  return {
    hoursWatched: summary.secondsWatched / 3600,
    secondsWatched: summary.secondsWatched,
    videosWatched: summary.videosWatched,
    videosPartial: 0,
    remainingSeconds: 0,
    ankiReviewed: summary.ankiReviewed,
    ankiCreated: summary.ankiCreated
  }
}

function getHistoricMaxCityLevelIndex(s, endDate = new Date()) {
  return getCityLevelIndex(calcCityScoreWithoutStreak(getCityStatsThroughDate(s, endDate)))
}

function renderCityTimeControls(snapshot) {
  const waveform = document.getElementById('cityTimeWaveform')
  const bars = document.getElementById('cityWaveBars')
  const tooltip = document.getElementById('cityWaveTooltip')
  if (!waveform || !bars || !tooltip) return

  const state = loadState()
  const rowsByDate = getCityHistoryRowsByDate(state)
  const days = getCityWaveformDays(snapshot.minOffset, snapshot.maxOffset)
  const selectedIndex = days.findIndex(day => day.offset === selectedCityDayOffset)

  bars.innerHTML = days.map((day, index) => {
    const row = rowsByDate.get(day.dateKey)
    const points = row ? getHistoryDayPoints(row) : 0
    const height = 8 + Math.min(20, points * 2)
    const label = formatCitySnapshotDate(day.date)
    const ariaLabel = `${label}, ${points} pts`
    return `
      <button class="city-wave-bar ${points > 0 ? 'has-activity' : ''} ${index === selectedIndex ? 'selected' : ''}"
        type="button"
        data-index="${index}"
        data-offset="${day.offset}"
        data-label="${escHtml(label)}"
        style="--bar-height:${height}px; --hover-boost:0px"
        aria-label="${escHtml(ariaLabel)}"
        onclick="setCityDayOffset(${day.offset})"
        onmouseenter="previewCityWaveBar(this)"
        onmousemove="previewCityWaveBar(this)"
        onfocus="previewCityWaveBar(this)"></button>
    `
  }).join('')

  updateCityWaveformScrollState()
  const selectedBar = bars.querySelector('.city-wave-bar.selected')
  if (selectedBar) {
    centerCityWaveBar(selectedBar)
    positionCityWaveTooltip(selectedBar)
  }
}

function updateCityWaveformScrollState() {
  const bars = document.getElementById('cityWaveBars')
  if (!bars) return
  bars.classList.toggle('is-scrollable', bars.scrollWidth > bars.clientWidth + 1)
}

function getCityWaveformDays(minOffset, maxOffset = 0) {
  const days = []
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    const date = addDays(new Date(), offset)
    days.push({ offset, date, dateKey: toDateKey(date) })
  }
  return days
}

function getCityHistoryRowsByDate(s) {
  const rows = new Map()
  const firstDateKey = getFirstStudyActionDateKey(s)
  if (!firstDateKey) return rows

  const start = dateKeyToLocalDate(firstDateKey)
  const end = IS_SANDBOX ? getSandboxHeatmapEndDate(s) : new Date()
  end.setHours(23, 59, 59, 999)
  getStudyHistoryBetween(s || { videos: {}, anki: {} }, start, end).rows
    .forEach(row => rows.set(row.dateKey, row))
  return rows
}

function previewCityWaveBar(bar, options = {}) {
  const waveform = document.getElementById('cityTimeWaveform')
  if (!bar || !waveform) return

  const index = parseInt(bar.dataset.index, 10)
  const bars = Array.from(waveform.querySelectorAll('.city-wave-bar'))
  bars.forEach((item, itemIndex) => {
    const distance = Math.abs(itemIndex - index)
    const boost = Math.max(0, 16 - distance * 5)
    item.style.setProperty('--hover-boost', `${boost}px`)
  })

  previewCityDayOffset(parseInt(bar.dataset.offset, 10))
  positionCityWaveTooltip(bar)

  if (!options.persist) {
    clearTimeout(previewCityWaveBar._timer)
  }
}

function handleCityWaveformMouseMove(event) {
  const bars = document.getElementById('cityWaveBars')
  cityWaveformScroll.pointerX = event.clientX
  cityWaveformScroll.pointerY = event.clientY
  if (!bars || bars.scrollWidth <= bars.clientWidth) {
    stopCityWaveformAutoScroll()
    return
  }

  const rect = bars.getBoundingClientRect()
  const edgeSize = Math.min(56, rect.width * 0.45)
  const leftDistance = event.clientX - rect.left
  const rightDistance = rect.right - event.clientX

  let speed = 0
  if (leftDistance >= 0 && leftDistance < edgeSize) {
    speed = -1 * (1 - leftDistance / edgeSize)
  } else if (rightDistance >= 0 && rightDistance < edgeSize) {
    speed = 1 - rightDistance / edgeSize
  }

  cityWaveformScroll.speed = speed * 14
  if (cityWaveformScroll.speed === 0) {
    stopCityWaveformAutoScroll()
  } else {
    startCityWaveformAutoScroll()
  }
}

function startCityWaveformAutoScroll() {
  if (cityWaveformScroll.frame) return

  const step = () => {
    const bars = document.getElementById('cityWaveBars')
    if (!bars || cityWaveformScroll.speed === 0) {
      stopCityWaveformAutoScroll()
      return
    }
    const maxScroll = bars.scrollWidth - bars.clientWidth
    const nextLeft = clampNumber(bars.scrollLeft + cityWaveformScroll.speed, 0, maxScroll)
    if (nextLeft === bars.scrollLeft) {
      stopCityWaveformAutoScroll()
      return
    }
    bars.scrollLeft = nextLeft
    previewCityWaveformBarAtPointer()
    cityWaveformScroll.frame = requestAnimationFrame(step)
  }

  cityWaveformScroll.frame = requestAnimationFrame(step)
}

function stopCityWaveformAutoScroll() {
  cityWaveformScroll.speed = 0
  if (!cityWaveformScroll.frame) return
  cancelAnimationFrame(cityWaveformScroll.frame)
  cityWaveformScroll.frame = null
}

function centerCityWaveBar(bar) {
  const bars = document.getElementById('cityWaveBars')
  if (!bar || !bars || bars.scrollWidth <= bars.clientWidth) return

  const targetLeft = bar.offsetLeft - (bars.clientWidth / 2) + (bar.offsetWidth / 2)
  const maxScroll = bars.scrollWidth - bars.clientWidth
  bars.scrollLeft = clampNumber(targetLeft, 0, maxScroll)
}

function previewCityWaveformBarAtPointer() {
  const target = document.elementFromPoint(cityWaveformScroll.pointerX, cityWaveformScroll.pointerY)
  const bar = target?.closest?.('.city-wave-bar')
  const bars = document.getElementById('cityWaveBars')
  if (!bar || !bars?.contains(bar)) return
  previewCityWaveBar(bar, { persist: true })
}

function positionCityWaveTooltip(bar) {
  const waveform = document.getElementById('cityTimeWaveform')
  const tooltip = document.getElementById('cityWaveTooltip')
  if (!bar || !waveform || !tooltip) return

  tooltip.textContent = bar.dataset.label || ''
  const barRect = bar.getBoundingClientRect()
  const waveRect = waveform.getBoundingClientRect()
  const left = barRect.left + barRect.width / 2 - waveRect.left
  tooltip.style.setProperty('--tooltip-left', `${left}px`)
}

function clearCityWaveformPreview() {
  clearTimeout(previewCityWaveBar._timer)
  stopCityWaveformAutoScroll()
  document.querySelectorAll('.city-wave-bar').forEach(bar => {
    bar.style.setProperty('--hover-boost', '0px')
  })
  const selected = document.querySelector('.city-wave-bar.selected')
  if (selected) positionCityWaveTooltip(selected)
  const state = loadState()
  if (state) renderCity(getCurrentCityScore(state), state)
}

function formatCitySnapshotDate(date) {
  const dateKey = toDateKey(date)
  if (dateKey === toDateKey(new Date(Date.now() - 86_400_000))) return 'Yesterday'
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function initCityImagePanZoom() {
  const wrap = document.querySelector('.city-image-wrap')
  const image = document.getElementById('cityMilestoneImage')
  if (!wrap || !image || wrap.dataset.panZoomReady === 'true') return

  wrap.dataset.panZoomReady = 'true'
  image.draggable = false
  image.addEventListener('dragstart', event => event.preventDefault())
  applyCityImageTransform()

  wrap.addEventListener('wheel', event => {
    if (event.target.closest('.city-time-waveform')) return
    event.preventDefault()
    zoomCityImageBy(event.deltaY > 0 ? -getWheelZoomAmount(event) : getWheelZoomAmount(event), event)
  }, { passive: false })

  wrap.addEventListener('pointerdown', event => {
    if (event.target.closest('button, .city-time-waveform')) return
    event.preventDefault()
    cityImageView.dragging = true
    cityImageView.pointerId = event.pointerId
    cityImageView.startX = event.clientX
    cityImageView.startY = event.clientY
    cityImageView.originX = cityImageView.x
    cityImageView.originY = cityImageView.y
    wrap.classList.add('is-dragging')
    wrap.setPointerCapture(event.pointerId)
  })

  wrap.addEventListener('pointermove', event => {
    if (!cityImageView.dragging || cityImageView.pointerId !== event.pointerId) return
    cityImageView.x = cityImageView.originX + event.clientX - cityImageView.startX
    cityImageView.y = cityImageView.originY + event.clientY - cityImageView.startY
    clampCityImagePan()
    applyCityImageTransform()
  })

  const endDrag = event => {
    if (cityImageView.pointerId !== event.pointerId) return
    cityImageView.dragging = false
    cityImageView.pointerId = null
    wrap.classList.remove('is-dragging')
  }
  wrap.addEventListener('pointerup', endDrag)
  wrap.addEventListener('pointercancel', endDrag)
  window.addEventListener('resize', () => {
    clampCityImagePan()
    applyCityImageTransform()
  })
}

function zoomCityImage(direction, event = null) {
  zoomCityImageBy(direction * CITY_IMAGE_ZOOM_STEP, event)
}

function getWheelZoomAmount(event) {
  return Math.min(0.12, Math.max(0.025, Math.abs(event.deltaY) / 120 * CITY_IMAGE_WHEEL_ZOOM_STEP))
}

function zoomCityImageBy(delta, event = null) {
  const previousScale = cityImageView.scale
  const nextScale = clampNumber(
    previousScale + delta,
    CITY_IMAGE_MIN_ZOOM,
    CITY_IMAGE_MAX_ZOOM
  )
  if (nextScale === previousScale) return

  if (event) {
    const wrap = document.querySelector('.city-image-wrap')
    const rect = wrap?.getBoundingClientRect()
    if (rect) {
      const focusX = event.clientX - rect.left - rect.width / 2
      const focusY = event.clientY - rect.top - rect.height / 2
      const ratio = nextScale / previousScale
      cityImageView.x = focusX - (focusX - cityImageView.x) * ratio
      cityImageView.y = focusY - (focusY - cityImageView.y) * ratio
    }
  }

  cityImageView.scale = nextScale
  clampCityImagePan()
  applyCityImageTransform()
}

function resetCityImageView() {
  cityImageView.scale = 1
  cityImageView.x = 0
  cityImageView.y = 0
  applyCityImageTransform()
}

function clampCityImagePan() {
  const wrap = document.querySelector('.city-image-wrap')
  if (!wrap || cityImageView.scale <= 1) {
    cityImageView.x = 0
    cityImageView.y = 0
    return
  }

  const rect = wrap.getBoundingClientRect()
  const maxX = rect.width * (cityImageView.scale - 1) / 2
  const maxY = rect.height * (cityImageView.scale - 1) / 2
  cityImageView.x = clampNumber(cityImageView.x, -maxX, maxX)
  cityImageView.y = clampNumber(cityImageView.y, -maxY, maxY)
}

function applyCityImageTransform() {
  const image = document.getElementById('cityMilestoneImage')
  if (!image) return
  image.style.transform = `translate(${cityImageView.x}px, ${cityImageView.y}px) scale(${cityImageView.scale})`
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function updateCityMilestoneImage(score) {
  const image = document.getElementById('cityMilestoneImage')
  if (!image || CITY_IMAGE_PATHS.length === 0) return

  const levelIndex = CITY_LEVELS.indexOf(getCityLevel(score))
  const imageIndex = Math.min(Math.max(levelIndex, 0), CITY_IMAGE_PATHS.length - 1)
  const nextSrc = CITY_IMAGE_PATHS[imageIndex]
  const nextAlt = `Study city milestone: ${getCityStage(score).replace(/[^\p{L}\p{N}\s-]/gu, '').trim()}`

  image.alt = nextAlt
  if (image.dataset.citySrc === nextSrc) return
  if (image.getAttribute('src') === nextSrc) {
    image.dataset.citySrc = nextSrc
    image.classList.remove('loading')
    return
  }

  image.dataset.citySrc = nextSrc
  image.classList.add('loading')
  image.onload = () => image.classList.remove('loading')
  image.src = nextSrc

  const preloadSrc = CITY_IMAGE_PATHS[imageIndex + 1]
  if (preloadSrc) {
    const preload = new Image()
    preload.src = preloadSrc
  }
}

function applyCityTimeOfDay(activeStreak = false) {
  const modeName = getTimeOfDay()
  const mode = TIME_OF_DAY_MODES[modeName]
  const sky = document.getElementById('citySky')
  const sun = document.getElementById('citySun')
  const horizon = document.getElementById('cityHorizonWash')
  const horizonColor = document.getElementById('horizonWashColor')
  const moon = document.querySelectorAll('.city-moon')
  const moonCutout = document.querySelector('.city-moon-cutout')
  const stars = document.querySelectorAll('.city-star')
  const shadows = document.getElementById('cityShadows')
  const tint = document.getElementById('cityLightTint')
  const cityscape = document.getElementById('cityscape')

  if (!mode || !sky) return

  cityscape.dataset.timeOfDay = modeName
  cityscape.setAttribute('aria-label', `Study city — grows as you learn, currently ${modeName}`)
  cityscape.style.filter = mode.cityFilter
  sky.setAttribute('fill', activeStreak ? mode.activeSky : mode.sky)
  horizon.setAttribute('opacity', mode.wash)
  horizonColor.setAttribute('stop-color', mode.horizon)
  sun.setAttribute('cx', mode.sun[0])
  sun.setAttribute('cy', mode.sun[1])
  sun.setAttribute('opacity', mode.sun[2])
  moon.forEach(el => el.setAttribute('opacity', mode.moon))
  if (moonCutout) {
    moonCutout.setAttribute('opacity', mode.moon)
    moonCutout.setAttribute('fill', activeStreak ? mode.activeSky : mode.sky)
  }
  stars.forEach(el => {
    if (!el.dataset.baseOpacity) el.dataset.baseOpacity = el.getAttribute('opacity') || '1'
    el.setAttribute('opacity', mode.stars * (parseFloat(el.dataset.baseOpacity) || 1))
  })
  shadows.setAttribute('opacity', mode.shadows)
  shadows.setAttribute('transform', `translate(${mode.shadowShift})`)
  tint.setAttribute('fill', mode.tint)
  tint.setAttribute('opacity', mode.tintOpacity)
}

function startCityClock() {
  clearInterval(startCityClock._timer)
  startCityClock._timer = setInterval(() => {
    const state = loadState()
    if (state) {
      applyCityTimeOfDay(state.streak.lastActivityDate === toDateKey())
      applyNightVisuals(state)
    }
    applyPeasantPosition()
  }, 60_000)
}

function applyPeasantPosition(date = new Date()) {
  const peasant = document.getElementById('cityPeasant')
  if (!peasant) return
  const [x, y] = PEASANT_POSITIONS[date.getHours() % PEASANT_POSITIONS.length]
  const groundY = PEASANT_GROUND_Y - PEASANT_FOOT_Y * PEASANT_SCALE
  peasant.setAttribute('transform', `translate(${x} ${Math.max(y, groundY)}) scale(${PEASANT_SCALE})`)
}

function applyNightVisuals(s, date = new Date()) {
  const layers = {
    aurora: document.getElementById('nightVisualAurora'),
    ufo: document.getElementById('nightVisualUfo'),
    meteors: document.getElementById('nightVisualMeteors')
  }

  Object.values(layers).forEach(layer => {
    if (layer) layer.setAttribute('opacity', '0')
  })

  if (!s || !isNightVisualTime(date)) return

  ensureNightVisualSchedule(s, date)
  const minute = getNightMinute(date)
  const active = s.nightVisuals.events.find(event =>
    minute >= event.startMinute &&
    minute < event.startMinute + NIGHT_VISUAL_DURATION_MINUTES
  )

  if (active && layers[active.type]) {
    layers[active.type].setAttribute('opacity', '1')
  }
}

function renderFeed(s) {
  renderStatusFilterOptions()
  renderChannelFilterOptions(s)

  const statusFilter = selectedStatusFilter
  const channelFilters = getSelectedChannelFilters(s)
  const grid   = document.getElementById('videoGrid')
  const watchedSection = document.getElementById('watchedSection')
  const watchedGrid = document.getElementById('watchedGrid')
  const watchedCount = document.getElementById('watchedCount')
  if (!grid || !watchedSection || !watchedGrid || !watchedCount) return

  const allVideos = Object.values(s.videos)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

  const activeVideos = getVisibleActiveVideos(allVideos)
    .filter(v => ['all', 'watch-later', 'unwatched', 'partial'].includes(statusFilter) && (statusFilter === 'all' || v.status === statusFilter))
    .filter(v => matchesChannelFilter(v, channelFilters))

  const watchedVideos = allVideos
    .filter(v => v.status === 'watched')
    .filter(v => matchesChannelFilter(v, channelFilters))
  const showWatched = statusFilter === 'all' || statusFilter === 'watched'

  if (statusFilter === 'watched') {
    grid.innerHTML = ''
  } else if (!activeVideos.length) {
    const channelMsg = channelFilters.size === getChannelFilterEntries(s).length ? '' : ' for the selected channels'
    const filterName = statusFilter === 'partial' ? 'in-progress' : statusFilter === 'watch-later' ? 'watch later' : statusFilter
    const msg = statusFilter === 'all' && watchedVideos.length
      ? 'No active videos right now. Watched videos are below.'
      : statusFilter === 'all' && !channelMsg
      ? 'No videos yet — click ↻ Refresh to load your feed.'
      : `No ${statusFilter === 'all' ? 'active' : filterName} videos${channelMsg} right now.`
    grid.innerHTML = `<div class="empty-state">${msg}</div>`
  } else {
    grid.innerHTML = activeVideos.map(v => renderCard(v)).join('')
  }

  watchedCount.textContent = watchedVideos.length
  watchedSection.classList.toggle('hidden', !showWatched || !watchedVideos.length)
  watchedGrid.innerHTML = showWatched ? watchedVideos.map(v => renderCard(v, true)).join('') : ''
}

function renderUndoButton(s) {
  const btn = document.getElementById('undoBtn')
  const tooltip = document.getElementById('undoTooltip')
  if (!btn) return
  const undoCount = Array.isArray(s.undoStack) ? s.undoStack.length : 0
  const canUndo = undoCount > 0
  btn.disabled = !canUndo
  btn.textContent = undoCount > 1 ? `Undo (${undoCount})` : 'Undo'
  btn.title = canUndo ? `Undo latest video status change (${undoCount} available)` : 'Nothing to undo'
  if (tooltip) tooltip.innerHTML = renderUndoTooltip(s)
}

function renderUndoTooltip(s) {
  const actions = Array.isArray(s.undoStack) ? s.undoStack.slice().reverse() : []
  if (!actions.length) {
    return '<div class="undo-tooltip-title">Nothing to undo</div>'
  }

  const visibleActions = actions.slice(0, 8)
  const hiddenCount = actions.length - visibleActions.length
  return `
    <div class="undo-tooltip-title">Undo queue</div>
    ${visibleActions.map(action => renderUndoTooltipItem(action, s)).join('')}
    ${hiddenCount > 0 ? `<div class="undo-tooltip-more">+ ${hiddenCount} older ${hiddenCount === 1 ? 'action' : 'actions'}</div>` : ''}
  `
}

function renderUndoTooltipItem(action, s) {
  const video = s.videos?.[action.videoId]
  const title = video?.title || 'Unavailable video'
  const currentStatus = formatVideoStatus(action.after?.status || video?.status)
  const previousStatus = formatVideoStatus(action.before?.status)
  return `
    <div class="undo-tooltip-item">
      <span class="undo-tooltip-video">${escHtml(title)}</span>
      <span class="undo-tooltip-action">${escHtml(currentStatus)} → back to ${escHtml(previousStatus)}</span>
    </div>
  `
}

function renderStatusFilterOptions() {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return

  btn.textContent = getStatusFilterLabel(selectedStatusFilter)
  menu.innerHTML = STATUS_FILTERS.map(([value, label]) => `
    <label class="channel-filter-option">
      <input type="radio" name="statusFilter" data-status="${value}" ${selectedStatusFilter === value ? 'checked' : ''} onchange="setStatusFilter(this.dataset.status)">
      <span>${label}</span>
    </label>
  `).join('')
}

function getStatusFilterLabel(status) {
  return STATUS_FILTERS.find(([value]) => value === status)?.[1] || 'All'
}

function setStatusFilter(status) {
  selectedStatusFilter = STATUS_FILTERS.some(([value]) => value === status) ? status : 'all'
  closeStatusFilterMenu()
  renderFeed(loadState())
}

function toggleStatusFilterMenu() {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return
  closeChannelFilterMenu()
  const isOpen = menu.classList.toggle('hidden') === false
  btn.setAttribute('aria-expanded', String(isOpen))
}

function closeStatusFilterMenu() {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  btn.setAttribute('aria-expanded', 'false')
}

function renderChannelFilterOptions(s) {
  const btn = document.getElementById('channelFilterBtn')
  const menu = document.getElementById('channelFilterMenu')
  if (!btn || !menu) return

  const entries = getChannelFilterEntries(s)
  const ids = new Set(entries.map(([id]) => id))
  if (selectedChannelFilters) {
    entries.forEach(([id]) => {
      if (!knownChannelFilterIds.has(id)) selectedChannelFilters.add(id)
    })
    selectedChannelFilters = new Set([...selectedChannelFilters].filter(id => ids.has(id)))
  }
  knownChannelFilterIds = ids

  const selected = getSelectedChannelFilters(s)
  const selectedCount = selected.size
  btn.textContent = getChannelFilterLabel(entries, selected)
  btn.disabled = !entries.length

  menu.innerHTML = entries.length
    ? entries.map(([id, name]) => `
      <label class="channel-filter-option">
        <input type="checkbox" data-channel-id="${escHtml(id)}" ${selected.has(id) ? 'checked' : ''} onchange="setChannelFilter(this.dataset.channelId, this.checked)">
        <span>${escHtml(name)}</span>
      </label>
    `).join('')
    : '<div class="channel-filter-empty">No channels yet</div>'
  menu.dataset.selectedCount = selectedCount
}

function getChannelFilterEntries(s) {
  const channels = new Map()
  s.config.channels.forEach(channel => {
    channels.set(channel.id, channel.name || channel.id)
  })
  Object.values(s.videos).forEach(video => {
    const key = video.channelId || video.channelTitle
    if (key) channels.set(key, video.channelTitle || channels.get(key) || key)
  })
  return Array.from(channels.entries()).sort((a, b) => a[1].localeCompare(b[1]))
}

function getSelectedChannelFilters(s) {
  const ids = getChannelFilterEntries(s).map(([id]) => id)
  if (!selectedChannelFilters) return new Set(ids)
  return new Set(ids.filter(id => selectedChannelFilters.has(id)))
}

function getChannelFilterLabel(entries, selected) {
  if (!entries.length) return 'No channels'
  if (selected.size === entries.length) return 'All channels'
  if (!selected.size) return 'No channels'
  if (selected.size === 1) {
    const selectedEntry = entries.find(([id]) => selected.has(id))
    return selectedEntry?.[1] || '1 channel'
  }
  return `${selected.size} channels`
}

function setChannelFilter(channelId, enabled) {
  const s = loadState()
  if (!selectedChannelFilters) {
    selectedChannelFilters = new Set(getChannelFilterEntries(s).map(([id]) => id))
  }
  if (enabled) selectedChannelFilters.add(channelId)
  else selectedChannelFilters.delete(channelId)
  renderFeed(s)
}

function toggleChannelFilterMenu() {
  const btn = document.getElementById('channelFilterBtn')
  const menu = document.getElementById('channelFilterMenu')
  if (!btn || !menu || btn.disabled) return
  closeStatusFilterMenu()
  const isOpen = menu.classList.toggle('hidden') === false
  btn.setAttribute('aria-expanded', String(isOpen))
}

function closeChannelFilterMenu() {
  const btn = document.getElementById('channelFilterBtn')
  const menu = document.getElementById('channelFilterMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  btn.setAttribute('aria-expanded', 'false')
}

function closeChannelFilterMenuOnOutsideClick(event) {
  const channelFilter = document.getElementById('channelFilter')
  const statusFilter = document.getElementById('statusFilter')
  if (channelFilter?.contains(event.target) || statusFilter?.contains(event.target)) return
  closeStatusFilterMenu()
  closeChannelFilterMenu()
}

function matchesChannelFilter(video, selectedChannelIds) {
  return selectedChannelIds.has(video.channelId) || selectedChannelIds.has(video.channelTitle)
}

function getVisibleActiveVideos(videos) {
  const byChannel = new Map()
  const activeSort = (a, b) => {
    const statusPriority = {
      partial: 2,
      'watch-later': 1
    }
    const priorityDiff = (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0)
    if (priorityDiff) return priorityDiff
    return new Date(b.publishedAt) - new Date(a.publishedAt)
  }

  videos
    .filter(v => v.status !== 'watched')
    .sort(activeSort)
    .forEach(v => {
      const key = v.channelId || v.channelTitle || 'unknown'
      const channelVideos = byChannel.get(key) || []
      if (channelVideos.length < ACTIVE_VIDEOS_PER_CHANNEL) {
        channelVideos.push(v)
        byChannel.set(key, channelVideos)
      }
    })

  return Array.from(byChannel.values())
    .flat()
    .sort(activeSort)
}

function renderCard(v, compact = false) {
  const isWatched = v.status === 'watched'
  const isPartial = v.status === 'partial'
  const isWatchLater = v.status === 'watch-later'
  const watchedLabel = compact ? 'Unmark' : `✓ ${isWatched ? 'Watched' : 'Mark watched'}`
  return `
    <div class="video-card ${compact ? 'compact-card' : ''} status-${v.status}">
      <a href="https://youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" class="thumb-link" onclick="markVideoInProgressOnOpen('${v.id}')">
        <img src="${escHtml(v.thumbnail)}" alt="" class="thumb" loading="lazy">
        <span class="dur-badge">${formatDuration(v.duration)}</span>
        ${isWatched ? '<span class="overlay-badge watched-badge">✓</span>' : ''}
        ${isPartial ? '<span class="overlay-badge partial-badge">⏸</span>' : ''}
        ${isWatchLater ? '<span class="overlay-badge watch-later-badge">★</span>' : ''}
        ${isPartial ? '<span class="progress-ribbon">In progress</span>' : ''}
        ${isWatchLater ? '<span class="progress-ribbon watch-later-ribbon">Watch later</span>' : ''}
      </a>
      <div class="card-body">
        ${isPartial ? '<div class="card-status partial-status">⏸ Resume watching</div>' : ''}
        ${isWatchLater ? '<div class="card-status watch-later-status">★ Watch later</div>' : ''}
        <div class="card-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
        <div class="card-meta">
          <span class="channel-name">${escHtml(v.channelTitle || '')}</span>
          <span class="pub-ago">${timeAgo(v.publishedAt)}</span>
        </div>
        <div class="card-actions">
          <button class="action-btn ${isWatched ? 'active' : ''}"
            onclick="markVideo('${v.id}','${isWatched ? 'unwatched' : 'watched'}')"
            title="${isWatched ? 'Unmark' : 'Mark as watched'}">
            ${watchedLabel}
          </button>
          <button class="action-btn partial-btn ${isPartial ? 'active' : ''}"
            onclick="markVideo('${v.id}','${isPartial ? 'unwatched' : 'partial'}')"
            title="${isPartial ? 'Clear' : 'Mark as in progress'}">⏸</button>
          <button class="action-btn watch-later-btn ${isWatchLater ? 'active' : ''}"
            onclick="markVideo('${v.id}','${isWatchLater ? 'unwatched' : 'watch-later'}')"
            title="${isWatchLater ? 'Remove from watch later' : 'Watch later'}">★</button>
        </div>
      </div>
    </div>
  `
}

// ════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className   = `toast toast-${type} show`
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 3500)
}

// ════════════════════════════════════════════════════════════
// FILTER & UI HELPERS
// ════════════════════════════════════════════════════════════

function filterFeed() { renderFeed(loadState()) }

function show(id) { document.getElementById(id).classList.remove('hidden') }
function hide(id) { document.getElementById(id).classList.add('hidden') }

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init)
document.addEventListener('click', closeChannelFilterMenuOnOutsideClick)
document.addEventListener('click', closeHistoryVideoPopoversOnOutsideClick)
document.addEventListener('keydown', closeHistoryVideoPopoversOnEscape)
document.addEventListener('visibilitychange', refreshAnkiStatsOnVisible)
