/* ═══════════════════════════════════════════════════════════
   EDENIA — app.js
   All logic: state, YouTube API, streak, Anki, city, rendering
═══════════════════════════════════════════════════════════ */

// Fresh public-beta users start with no pre-filled YouTube channels.
const DEFAULT_CHANNELS = []
const DEFAULT_CHANNELS_VERSION = 2

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

const IS_SANDBOX = new URLSearchParams(window.location.search).get('sandbox') === '1'
const STORAGE_KEY = IS_SANDBOX ? 'edenia_v1_sandbox' : 'edenia_v1'
const STATE_BACKUP_KEY = `${STORAGE_KEY}_backups`
const SANDBOX_WALKTHROUGH_AFTER_RESET_KEY = `${STORAGE_KEY}_walkthrough_after_reset`
const STATE_BACKUP_LIMIT = 8
const STATE_BACKUP_AUTO_INTERVAL_MS = 10 * 60_000
const CONFIG_COOKIE_KEY = IS_SANDBOX ? 'edenia_config_sandbox' : 'edenia_config'
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const YOUTUBE_REFRESH_INTERVAL_MS = 5 * 60 * 60_000
const YOUTUBE_REFRESH_ERROR_BACKOFF_MS = 30 * 60_000
const ACTIVE_VIDEOS_PER_CHANNEL = 5
const FETCH_PAGE_SIZE = ACTIVE_VIDEOS_PER_CHANNEL
const MAX_FETCH_PAGES_PER_CHANNEL = 3
const DEFAULT_THEME = 'light'
const THEMES = ['light', 'dark']
const ANKI_AUTO_REFRESH_MS = 5 * 60_000
const ANKI_DAY_START_HOUR = 4
const MIN_DAILY_STREAK_POINTS = 3
const UNDO_STACK_LIMIT = 50
const MIN_WEEKLY_GOAL_HOURS = 1
const MAX_WEEKLY_GOAL_HOURS = 99
const VIDEO_HOUR_POINTS = 5
const VIDEO_WATCHED_POINTS = 1
const SHORTS_MAX_DURATION_SECONDS = 180
const ANKI_REVIEW_CHUNK_SIZE = 60
const ANKI_REVIEW_CHUNK_POINTS = 3
const ANKI_CREATED_CHUNK_SIZE = 12
const ANKI_CREATED_CHUNK_POINTS = 4
const SCORING_RULES_VERSION = 2
const CITY_LEVELS = [
  { threshold: 0, label: '🏠 Lonely house' },
  { threshold: 5, label: '⛵ Your house got a fresh new look! Plus a boat!' },
  { threshold: 12, label: '🏝️ Oh look! A tiny island! Cute.' },
  { threshold: 20, label: 'Kids are gonna have fun now!' },
  { threshold: 28, label: "Let's add a pool to chill" },
  { threshold: 35, label: 'Oh! Some friends are coming to say hi...' },
  { threshold: 42, label: 'You expanded your small island!' },
  { threshold: 50, label: "That's a nice deckchair and some pretty flowers! 🌸" }
]
const CITY_IMAGE_PATHS = [
  'images/photoshop/level%201.png',
  'images/photoshop/level%202.png',
  'images/photoshop/level%203.png',
  'images/photoshop/level%204.png',
  'images/photoshop/level%205.png',
  'images/photoshop/level%206.png',
  'images/photoshop/level%207.png',
  'images/photoshop/level%208.png'
]
const cityImagePreloadCache = new Map()
let ankiStatsCache = null
let selectedStatusFilter = 'all'
let selectedChannelFilters = null
let knownChannelFilterIds = new Set()
let selectedHistoryRange = 'week'
let selectedHistoryView = 'summary'
const selectedHistoryPeriod = { week: null, month: null }
let selectedCityDayOffset = 0
const CITY_IMAGE_MIN_ZOOM = 1
const CITY_IMAGE_MAX_ZOOM = 2
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
const walkthroughState = {
  active: false,
  index: 0,
  steps: [],
  elements: null,
  frame: null,
  isTransitioning: false
}
const STATUS_FILTERS = [
  ['all', 'All'],
  ['watch-later', 'Watch later'],
  ['unwatched', 'Unwatched'],
  ['partial', 'In progress']
]
const VIDEO_STATUSES = ['watch-later', 'unwatched', 'partial', 'watched']
const HISTORY_RANGES = ['week', 'month']
const WALKTHROUGH_STEPS = [
  {
    id: 'town',
    target: '.city-image-wrap',
    text: 'This is your floating town. When you study, your town grows little by little. It gives you a quick picture of your progress.',
    placement: 'bottom'
  },
  {
    id: 'settings',
    target: '.gear-btn',
    text: 'Click Settings when you are ready to set up Edenia. This is where you add your YouTube channels, choose your weekly goal, and keep your progress safe.',
    placement: 'left',
    advanceOn: 'target-click',
    actionLabel: 'Click Settings',
    hooks: {
      beforeEnter: ['closeTransientUi', 'keepSettingsClosed'],
      targetClick: 'advanceAfterTargetClick'
    }
  },
  {
    id: 'channels',
    target: '.add-channel-row',
    text: 'Add the YouTube channels you study from here. Edenia will show recent videos from those channels so you can choose what to watch next.',
    placement: 'left',
    hooks: {
      beforeEnter: 'closeTransientUi',
      beforeExit: 'keepSettingsClosed'
    }
  },
  {
    id: 'weekly-goal',
    target: '.goal-card',
    text: 'This shows your weekly study goal. As you watch study videos, the bar fills up so you can quickly see how close you are.',
    placement: 'bottom',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'study-history',
    target: '.study-history-section',
    text: 'Study History shows what you did over time. Use the summary for clear numbers, and the heatmap to spot your active days quickly.',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'videos',
    target: '.feed-controls',
    text: 'This is your video area. You can filter the list, mark videos as watched, add a watched video by URL, and undo changes if you click the wrong thing.',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  }
]
const WALKTHROUGH_HOOKS = {
  closeTransientUi() {
    closeStatusFilterMenu()
    closeChannelFilterMenu()
    closeManualVideoPopover()
    closeHistoryVideoPopovers()
    closeHistoryPeriodPopovers()
    closeHistoryActionPopovers()
    hideHeatmapTooltip()
  },
  keepSettingsClosed() {
    closeSettings()
  },
  refreshSpotlight() {
    scheduleWalkthroughPosition()
  },
  advanceAfterTargetClick() {
    window.setTimeout(() => moveWalkthrough(1), 140)
  }
}

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

function publicConfig() {
  return window.EDENIA_CONFIG || {}
}

function getYoutubeApiKey() {
  return String(publicConfig().youtubeApiKey || '').trim()
}

function hasYoutubeApiKey() {
  return Boolean(getYoutubeApiKey())
}

function sanitizeConfigForStorage(config = {}) {
  const { apiKey, ...safeConfig } = config
  return safeConfig
}

function saveConfigCookie(config) {
  try {
    const value = encodeURIComponent(JSON.stringify(sanitizeConfigForStorage(config)))
    document.cookie = `${CONFIG_COOKIE_KEY}=${value}; max-age=31536000; path=/`
  } catch {}
}

function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : DEFAULT_THEME
}

function normalizeWeeklyGoalHours(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 4
  return clampNumber(parsed, MIN_WEEKLY_GOAL_HOURS, MAX_WEEKLY_GOAL_HOURS)
}

function normalizeIncludeShorts(value) {
  return value !== false
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
  let storageError = false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw)
      let shouldSave = false
      if (state?.config) state.config.theme = normalizeTheme(state.config.theme)
      if (state?.config) state.config.weeklyGoalHours = normalizeWeeklyGoalHours(state.config.weeklyGoalHours)
      if (state?.config) state.config.includeShorts = normalizeIncludeShorts(state.config.includeShorts)
      if (state?.config && !Array.isArray(state.config.channels)) state.config.channels = []
      if (state?.config) delete state.config.apiKey
      normalizeRemovedDefaultChannels(state)
      if (state?.config && (state.defaultChannelsVersion || 1) < DEFAULT_CHANNELS_VERSION) {
        state.defaultChannelsVersion = DEFAULT_CHANNELS_VERSION
        shouldSave = true
      }
      if (normalizeAnkiDateKeys(state)) shouldSave = true
      normalizeUndoState(state)
      if (normalizeOnboardingState(state)) shouldSave = true
      if (normalizeChannelRefreshState(state)) shouldSave = true
      normalizeSandboxState(state)
      normalizeCityProgress(state)
      delete state.nightVisuals
      if (shouldSave) saveState(state, { backupReason: 'before automatic cleanup', forceBackup: true })
      return state
    }
  } catch {
    storageError = true
  }

  if (storageError) {
    const recoveredState = getLatestBackupState()
    if (recoveredState) return recoveredState
  }

  const fallback = loadConfigCookie()
  if (fallback) {
    return defaultState(fallback.weeklyGoalHours || 4, fallback.channels, fallback.theme, fallback.removedDefaultChannelIds)
  }

  return null
}

function saveState(s, options = {}) {
  const { backup = true, backupReason = 'automatic backup', forceBackup = false } = options
  if (backup) createStateBackup(backupReason, { force: forceBackup })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    pruneOldestStateBackup()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  }
  saveConfigCookie(s.config)
}

function defaultState(goalHours, channels, theme, removedDefaultChannelIds = null) {
  const restoredRemovedDefaultIds = Array.isArray(removedDefaultChannelIds)
    ? removedDefaultChannelIds.filter(isDefaultChannelId)
    : null
  return {
    config: {
      weeklyGoalHours: normalizeWeeklyGoalHours(goalHours),
      theme: normalizeTheme(theme),
      includeShorts: true,
      channels: Array.isArray(channels) ? channels.map(c => ({ ...c })) : DEFAULT_CHANNELS.map(c => ({ ...c })),
      removedDefaultChannelIds: restoredRemovedDefaultIds || []
    },
    videos:  {},   // { [videoId]: VideoRecord }
    streak:  { current: 0, longest: 0, lastActivityDate: null },
    anki:    {},   // { 'YYYY-MM-DD': { reviewed, created } }
    cityProgress: { maxLevelIndex: 0, pendingLevelIndex: null },
    undoStack: [],
    redoStack: [],
    channelRefreshes: {},
    onboarding: {
      completed: false,
      completedAt: null
    },
    defaultChannelsVersion: DEFAULT_CHANNELS_VERSION
  }
}

function isValidStateShape(state) {
  return Boolean(
    state &&
    typeof state === 'object' &&
    state.config &&
    typeof state.config === 'object' &&
    state.videos &&
    typeof state.videos === 'object' &&
    !Array.isArray(state.videos) &&
    state.anki &&
    typeof state.anki === 'object' &&
    !Array.isArray(state.anki)
  )
}

function getStateBackupEntries() {
  try {
    const raw = localStorage.getItem(STATE_BACKUP_KEY)
    const entries = raw ? JSON.parse(raw) : []
    if (!Array.isArray(entries)) return []
    return entries
      .filter(entry => entry?.id && entry?.createdAt && isValidStateShape(entry.state))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, STATE_BACKUP_LIMIT)
  } catch {
    return []
  }
}

function writeStateBackupEntries(entries) {
  let nextEntries = entries.slice(0, STATE_BACKUP_LIMIT)
  while (nextEntries.length) {
    try {
      localStorage.setItem(STATE_BACKUP_KEY, JSON.stringify(nextEntries))
      return
    } catch {
      nextEntries = nextEntries.slice(0, -1)
    }
  }
  try { localStorage.removeItem(STATE_BACKUP_KEY) } catch {}
}

function pruneOldestStateBackup() {
  const entries = getStateBackupEntries()
  if (!entries.length) return false
  writeStateBackupEntries(entries.slice(0, -1))
  return true
}

function prepareStateForBackup(state) {
  const backupState = getImportedSyncState({
    app: 'edenia',
    state
  })
  if (!backupState) return null
  if (backupState.config) delete backupState.config.apiKey
  return backupState
}

function getStoredStateForBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return prepareStateForBackup(JSON.parse(raw))
  } catch {
    return null
  }
}

function createStateBackup(reason = 'automatic backup', options = {}) {
  const { force = false } = options
  const state = getStoredStateForBackup()
  if (!state) return null

  const entries = getStateBackupEntries()
  const latest = entries[0]
  const now = new Date()
  const isAutomatic = reason === 'automatic backup'
  const latestAgeMs = latest ? now - new Date(latest.createdAt) : Number.POSITIVE_INFINITY
  if (!force && isAutomatic && latest && latestAgeMs < STATE_BACKUP_AUTO_INTERVAL_MS) return null

  try {
    if (latest && JSON.stringify(latest.state) === JSON.stringify(state)) return null
  } catch {}

  const entry = {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    reason,
    sandbox: IS_SANDBOX,
    state
  }
  writeStateBackupEntries([entry, ...entries])
  return entry
}

function getLatestBackupState() {
  const entry = getStateBackupEntries()[0]
  return entry ? prepareStateForBackup(entry.state) : null
}

function createEmptySandboxState() {
  const state = defaultState(4, [
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
  if (!Array.isArray(state.redoStack)) state.redoStack = []
  if (state.lastUndo?.type === 'video-status' && !state.undoStack.length) {
    state.undoStack.push(state.lastUndo)
  }
  state.undoStack = state.undoStack
    .filter(action => action?.type === 'video-status')
    .slice(-UNDO_STACK_LIMIT)
  state.redoStack = state.redoStack
    .filter(action => action?.type === 'video-status')
    .slice(-UNDO_STACK_LIMIT)
  delete state.lastUndo
}

function isValidTimestamp(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function normalizeChannelRefreshState(state) {
  if (!state) return false
  let changed = false
  const existing = state.channelRefreshes && typeof state.channelRefreshes === 'object' && !Array.isArray(state.channelRefreshes)
    ? state.channelRefreshes
    : {}
  const legacyLastFetched = isValidTimestamp(state.lastFetched) ? state.lastFetched : null
  const channelIds = new Set((state.config?.channels || []).map(channel => channel.id).filter(Boolean))
  const normalized = {}

  channelIds.forEach(channelId => {
    const entry = existing[channelId]
    const lastFetchedAt = isValidTimestamp(entry?.lastFetchedAt)
      ? entry.lastFetchedAt
      : legacyLastFetched
    const lastFailedAt = isValidTimestamp(entry?.lastFailedAt) ? entry.lastFailedAt : null
    const lastError = typeof entry?.lastError === 'string' ? entry.lastError : null
    if (lastFetchedAt) {
      normalized[channelId] = {
        lastFetchedAt,
        lastError,
        lastFailedAt
      }
    } else if (entry) {
      normalized[channelId] = {
        lastFetchedAt: null,
        lastError,
        lastFailedAt
      }
    }
  })

  if (JSON.stringify(existing) !== JSON.stringify(normalized)) changed = true
  if ('lastFetched' in state) changed = true
  state.channelRefreshes = normalized
  delete state.lastFetched
  return changed
}

function normalizeOnboardingState(state) {
  if (!state) return false
  const existing = state.onboarding && typeof state.onboarding === 'object' && !Array.isArray(state.onboarding)
    ? state.onboarding
    : {}
  const normalized = {
    completed: existing.completed === true,
    completedAt: existing.completed === true && isValidTimestamp(existing.completedAt)
      ? existing.completedAt
      : null
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.onboarding = normalized
  return changed
}

function completeOnboarding(state = loadState()) {
  if (!state) return null
  normalizeOnboardingState(state)
  if (!state.onboarding.completed) {
    state.onboarding.completed = true
    state.onboarding.completedAt = new Date().toISOString()
    saveState(state)
  }
  return state
}

function normalizeCityProgress(state) {
  if (!state) return
  const currentProgress = state.cityProgress || {}
  const revealedLevelIndex = Number.isInteger(currentProgress.maxLevelIndex)
    ? currentProgress.maxLevelIndex
    : 0
  const pendingLevelIndex = Number.isInteger(currentProgress.pendingLevelIndex)
    ? currentProgress.pendingLevelIndex
    : null
  const scoringVersion = Number.isInteger(currentProgress.scoringVersion)
    ? currentProgress.scoringVersion
    : 1
  state.cityProgress = {
    maxLevelIndex: clampNumber(revealedLevelIndex, 0, CITY_LEVELS.length - 1),
    pendingLevelIndex: pendingLevelIndex === null
      ? null
      : clampNumber(pendingLevelIndex, 0, CITY_LEVELS.length - 1),
    scoringVersion
  }
  if (state.cityProgress.pendingLevelIndex !== null && state.cityProgress.pendingLevelIndex <= state.cityProgress.maxLevelIndex) {
    state.cityProgress.pendingLevelIndex = null
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

function getMissingDefaultChannelIds(channels) {
  const channelIds = new Set((channels || []).map(channel => channel.id))
  return DEFAULT_CHANNELS
    .filter(channel => !channelIds.has(channel.id))
    .map(channel => channel.id)
}

function isDefaultChannelId(id) {
  return DEFAULT_CHANNELS.some(channel => channel.id === id)
}

function normalizeRemovedDefaultChannels(state) {
  if (!state?.config) return
  const hadRemovedList = Array.isArray(state.config.removedDefaultChannelIds)
  const removedIds = new Set(hadRemovedList ? state.config.removedDefaultChannelIds : [])

  if (!hadRemovedList && (state.defaultChannelsVersion || 1) >= DEFAULT_CHANNELS_VERSION) {
    getMissingDefaultChannelIds(state.config.channels).forEach(id => removedIds.add(id))
  }

  state.config.removedDefaultChannelIds = [...removedIds].filter(isDefaultChannelId)
}

function normalizeAnkiDateKeys(state) {
  if (!state?.anki || typeof state.anki !== 'object' || Array.isArray(state.anki)) return false
  let changed = false

  for (const [dateKey, day] of Object.entries({ ...state.anki })) {
    if (day?.source !== 'ankiconnect' || !day.loggedAt) continue
    const loggedAt = new Date(day.loggedAt)
    if (Number.isNaN(loggedAt.getTime())) continue

    const ankiDateKey = getAnkiDateKey(loggedAt)
    if (ankiDateKey === dateKey) continue

    const existing = state.anki[ankiDateKey]
    state.anki[ankiDateKey] = {
      reviewed: Math.max(existing?.reviewed || 0, day.reviewed || 0),
      created: Math.max(existing?.created || 0, day.created || 0),
      loggedAt: existing?.loggedAt && new Date(existing.loggedAt) > loggedAt ? existing.loggedAt : day.loggedAt,
      source: existing?.source || day.source
    }
    delete state.anki[dateKey]
    changed = true
  }

  return changed
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

function getAnkiDateKey(from = new Date()) {
  const date = new Date(from)
  if (date.getHours() < ANKI_DAY_START_HOUR) date.setDate(date.getDate() - 1)
  return toDateKey(date)
}

function getCurrentAnkiDateKey() {
  return getAnkiDateKey(new Date())
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

function formatWatchedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const watchedDateKey = toDateKey(date)
  const today = getCurrentAppDate()
  const todayKey = toDateKey(today)
  const yesterdayKey = toDateKey(addDays(today, -1))
  if (watchedDateKey === todayKey) return 'Watched today'
  if (watchedDateKey === yesterdayKey) return 'Watched yesterday'
  const days = daysBetweenDateKeys(watchedDateKey, todayKey)
  if (days > 1 && days < 7) return `Watched ${days}d ago`
  if (days >= 7 && days < 14) return 'Watched 1 week ago'
  if (days >= 14 && days < 30) return `Watched ${Math.floor(days / 7)}w ago`
  return `Watched ${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
}

function formatDuration(secs) {
  if (!secs) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const z = n => String(n).padStart(2, '0')
  return h ? `${h}:${z(m)}:${z(s)}` : `${m}:${z(s)}`
}

function parseResumeTimestamp(value, duration = null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d+$/.test(raw)) {
    return normalizeResumeAtSeconds(Number(raw), duration)
  }

  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3 || !parts.every(part => /^\d+$/.test(part))) return NaN

  const nums = parts.map(part => Number(part))
  const seconds = nums.length === 3
    ? (nums[0] * 3600) + (nums[1] * 60) + nums[2]
    : (nums[0] * 60) + nums[1]
  return normalizeResumeAtSeconds(seconds, duration)
}

function formatResumeTimestamp(seconds) {
  const normalized = normalizeResumeAtSeconds(seconds)
  if (normalized === null) return ''
  const h = Math.floor(normalized / 3600)
  const m = Math.floor((normalized % 3600) / 60)
  const s = normalized % 60
  const z = n => String(n).padStart(2, '0')
  return h ? `${h}:${z(m)}:${z(s)}` : `${m}:${z(s)}`
}

function getWeekLabel(state = null) {
  const start = getWeekStart(getCurrentAppDate(state))
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
    state = IS_SANDBOX ? createEmptySandboxState() : defaultState(4, DEFAULT_CHANNELS)
    saveState(state)
  }

  document.title = IS_SANDBOX ? 'Sandbox - Edenia' : 'Edenia'
  document.body.dataset.sandbox = IS_SANDBOX ? 'true' : 'false'
  const sandboxTools = document.getElementById('sandboxTools')
  const sandboxVersionLabel = document.getElementById('sandboxVersionLabel')
  if (sandboxTools) sandboxTools.classList.toggle('hidden', !IS_SANDBOX)
  if (sandboxVersionLabel) sandboxVersionLabel.classList.toggle('hidden', !IS_SANDBOX)
  if (IS_SANDBOX) selectedHistoryView = 'heatmap'
  setDefaultCityDayOffset(state)
  syncStreak(state)
  saveState(state)
  applyTheme(state.config.theme)
  show('mainApp')
  renderAll(state)
  preloadCityImages()
  initCityImagePanZoom()
  if (!IS_SANDBOX) {
    refreshAnkiStats({ silent: true })
    startAnkiAutoRefresh()
    startYoutubeAutoRefresh()
  } else {
    showToast('Sandbox mode: demo data is isolated from your real progress', 'warn')
  }
  maybeStartOnboarding(state)
}

function maybeStartOnboarding(state) {
  if (consumeSandboxWalkthroughAfterReset()) {
    window.setTimeout(() => startWalkthrough(WALKTHROUGH_STEPS, { manual: true, reason: 'sandbox-reset' }), 350)
    return
  }
  if (IS_SANDBOX || state?.onboarding?.completed) return
  window.setTimeout(() => startWalkthrough(WALKTHROUGH_STEPS), 350)
}

function queueSandboxWalkthroughAfterReset() {
  if (!IS_SANDBOX) return
  try { sessionStorage.setItem(SANDBOX_WALKTHROUGH_AFTER_RESET_KEY, '1') } catch {}
}

function consumeSandboxWalkthroughAfterReset() {
  if (!IS_SANDBOX) return false
  try {
    const shouldStart = sessionStorage.getItem(SANDBOX_WALKTHROUGH_AFTER_RESET_KEY) === '1'
    sessionStorage.removeItem(SANDBOX_WALKTHROUGH_AFTER_RESET_KEY)
    return shouldStart
  } catch {
    return false
  }
}

function showWalkthroughAgain() {
  closeSettings()
  window.setTimeout(() => startWalkthrough(WALKTHROUGH_STEPS, { manual: true }), 120)
}

function startWalkthrough(steps = WALKTHROUGH_STEPS, options = {}) {
  const availableSteps = steps.filter(step => step?.target && document.querySelector(step.target))
  if (!availableSteps.length) return
  if (walkthroughState.active) endWalkthrough({ markCompleted: false })

  walkthroughState.active = true
  walkthroughState.steps = availableSteps
  walkthroughState.index = clampNumber(options.startIndex || 0, 0, availableSteps.length - 1)
  ensureWalkthroughElements()
  document.body.classList.add('walkthrough-active')
  walkthroughState.elements.layer.classList.remove('hidden')
  window.addEventListener('resize', scheduleWalkthroughPosition)
  window.addEventListener('scroll', scheduleWalkthroughPosition, true)
  document.addEventListener('click', handleWalkthroughTargetClick)
  document.addEventListener('keydown', handleWalkthroughKey)
  showWalkthroughStep(walkthroughState.index)
}

function ensureWalkthroughElements() {
  if (walkthroughState.elements) return walkthroughState.elements

  const layer = document.createElement('div')
  layer.className = 'walkthrough-layer hidden'
  layer.innerHTML = `
    <div class="walkthrough-scrim walkthrough-scrim-top"></div>
    <div class="walkthrough-scrim walkthrough-scrim-right"></div>
    <div class="walkthrough-scrim walkthrough-scrim-bottom"></div>
    <div class="walkthrough-scrim walkthrough-scrim-left"></div>
    <div class="walkthrough-highlight" aria-hidden="true"></div>
    <div class="walkthrough-card" role="dialog" aria-live="polite" aria-label="App walkthrough">
      <div class="walkthrough-progress"></div>
      <p class="walkthrough-text"></p>
      <div class="walkthrough-actions">
        <button class="btn-ghost walkthrough-skip" type="button">Skip</button>
        <span class="walkthrough-step-controls">
          <button class="btn-ghost walkthrough-back" type="button">Back</button>
          <button class="btn-secondary walkthrough-next" type="button">Next</button>
        </span>
      </div>
      <span class="walkthrough-arrow" aria-hidden="true"></span>
    </div>
  `
  document.body.appendChild(layer)

  const elements = {
    layer,
    scrims: {
      top: layer.querySelector('.walkthrough-scrim-top'),
      right: layer.querySelector('.walkthrough-scrim-right'),
      bottom: layer.querySelector('.walkthrough-scrim-bottom'),
      left: layer.querySelector('.walkthrough-scrim-left')
    },
    highlight: layer.querySelector('.walkthrough-highlight'),
    card: layer.querySelector('.walkthrough-card'),
    progress: layer.querySelector('.walkthrough-progress'),
    text: layer.querySelector('.walkthrough-text'),
    skip: layer.querySelector('.walkthrough-skip'),
    back: layer.querySelector('.walkthrough-back'),
    next: layer.querySelector('.walkthrough-next')
  }
  elements.skip.addEventListener('click', () => endWalkthrough({ markCompleted: true }))
  elements.back.addEventListener('click', () => moveWalkthrough(-1))
  elements.next.addEventListener('click', () => moveWalkthrough(1))
  walkthroughState.elements = elements
  return elements
}

function renderWalkthroughStep() {
  if (!walkthroughState.active) return
  const step = walkthroughState.steps[walkthroughState.index]
  runWalkthroughHooks(step, 'beforeEnter')
  const target = step ? document.querySelector(step.target) : null
  if (!target || !isWalkthroughTargetVisible(target)) {
    window.setTimeout(() => moveWalkthrough(1), 0)
    return
  }

  const elements = ensureWalkthroughElements()
  elements.progress.textContent = `${walkthroughState.index + 1} / ${walkthroughState.steps.length}`
  elements.text.textContent = step.text
  elements.back.disabled = walkthroughState.index === 0
  elements.next.disabled = step.advanceOn === 'target-click'
  elements.next.textContent = step.actionLabel || (walkthroughState.index === walkthroughState.steps.length - 1 ? 'Done' : 'Next')
  elements.card.classList.toggle('walkthrough-card-waiting', step.advanceOn === 'target-click')
  elements.card.classList.toggle('walkthrough-card-no-arrow', step.showArrow === false)

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
    inline: 'center'
  })
  scheduleWalkthroughPosition()
  window.setTimeout(scheduleWalkthroughPosition, prefersReducedMotion() ? 0 : 220)
  runWalkthroughHooks(step, 'afterEnter', { target })
}

function moveWalkthrough(delta) {
  if (!walkthroughState.active) return
  const nextIndex = walkthroughState.index + delta
  if (nextIndex < 0) return
  if (nextIndex >= walkthroughState.steps.length) {
    endWalkthrough({ markCompleted: true })
    return
  }
  showWalkthroughStep(nextIndex, { direction: delta })
}

function showWalkthroughStep(nextIndex, options = {}) {
  if (!walkthroughState.active || walkthroughState.isTransitioning) return
  const previousStep = walkthroughState.steps[walkthroughState.index]
  const isSameStep = nextIndex === walkthroughState.index
  walkthroughState.isTransitioning = true

  if (!isSameStep) runWalkthroughHooks(previousStep, 'beforeExit', options)
  walkthroughState.index = clampNumber(nextIndex, 0, walkthroughState.steps.length - 1)
  renderWalkthroughStep()
  if (!isSameStep) runWalkthroughHooks(previousStep, 'afterExit', options)

  walkthroughState.isTransitioning = false
}

function endWalkthrough(options = {}) {
  const { markCompleted = true } = options
  if (!walkthroughState.active) return

  const currentStep = walkthroughState.steps[walkthroughState.index]
  runWalkthroughHooks(currentStep, 'beforeExit', { completed: markCompleted })
  walkthroughState.active = false
  if (walkthroughState.frame) {
    cancelAnimationFrame(walkthroughState.frame)
    walkthroughState.frame = null
  }
  walkthroughState.elements?.layer.classList.add('hidden')
  document.body.classList.remove('walkthrough-active')
  window.removeEventListener('resize', scheduleWalkthroughPosition)
  window.removeEventListener('scroll', scheduleWalkthroughPosition, true)
  document.removeEventListener('click', handleWalkthroughTargetClick)
  document.removeEventListener('keydown', handleWalkthroughKey)
  runWalkthroughHooks(currentStep, 'afterExit', { completed: markCompleted })
  if (markCompleted) completeOnboarding()
}

function handleWalkthroughTargetClick(event) {
  if (!walkthroughState.active) return
  const step = walkthroughState.steps[walkthroughState.index]
  const target = step?.target ? event.target.closest(step.target) : null
  if (!target) return
  runWalkthroughHooks(step, 'targetClick', { event, target })
}

function handleWalkthroughKey(event) {
  if (!walkthroughState.active) return
  if (event.key === 'Escape') {
    event.preventDefault()
    endWalkthrough({ markCompleted: true })
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveWalkthrough(1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveWalkthrough(-1)
  }
}

function scheduleWalkthroughPosition() {
  if (!walkthroughState.active || walkthroughState.frame) return
  walkthroughState.frame = requestAnimationFrame(() => {
    walkthroughState.frame = null
    positionWalkthrough()
  })
}

function positionWalkthrough() {
  if (!walkthroughState.active) return
  const step = walkthroughState.steps[walkthroughState.index]
  const target = step ? document.querySelector(step.target) : null
  if (!target || !isWalkthroughTargetVisible(target)) return

  const elements = ensureWalkthroughElements()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const targetRect = target.getBoundingClientRect()
  const highlightRect = getWalkthroughHighlightRect(targetRect, viewportWidth, viewportHeight)

  positionWalkthroughScrims(elements.scrims, highlightRect, viewportWidth, viewportHeight)
  elements.highlight.style.borderRadius = getWalkthroughSpotlightRadius(step, highlightRect)
  setFixedRect(elements.highlight, highlightRect)
  positionWalkthroughCard(elements.card, highlightRect, step.placement || 'bottom', viewportWidth, viewportHeight)
}

function getWalkthroughHighlightRect(rect, viewportWidth, viewportHeight) {
  const step = walkthroughState.steps[walkthroughState.index]
  const padding = Number.isFinite(step?.spotlightPadding) ? step.spotlightPadding : 8
  const left = clampNumber(rect.left - padding, 8, viewportWidth - 8)
  const top = clampNumber(rect.top - padding, 8, viewportHeight - 8)
  const right = clampNumber(rect.right + padding, left + 1, viewportWidth - 8)
  const bottom = clampNumber(rect.bottom + padding, top + 1, viewportHeight - 8)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom
  }
}

function getWalkthroughSpotlightRadius(step, rect) {
  if (step?.spotlightShape === 'circle') return `${Math.max(rect.width, rect.height)}px`
  if (Number.isFinite(step?.spotlightRadius)) return `${step.spotlightRadius}px`
  return '16px'
}

function positionWalkthroughScrims(scrims, rect, viewportWidth, viewportHeight) {
  setFixedRect(scrims.top, { left: 0, top: 0, width: viewportWidth, height: rect.top })
  setFixedRect(scrims.right, { left: rect.right, top: rect.top, width: viewportWidth - rect.right, height: rect.height })
  setFixedRect(scrims.bottom, { left: 0, top: rect.bottom, width: viewportWidth, height: viewportHeight - rect.bottom })
  setFixedRect(scrims.left, { left: 0, top: rect.top, width: rect.left, height: rect.height })
}

function positionWalkthroughCard(card, rect, preferredPlacement, viewportWidth, viewportHeight) {
  const margin = 14
  const gap = 18
  const cardRect = card.getBoundingClientRect()
  const placements = uniqueWalkthroughPlacements([preferredPlacement, 'bottom', 'top', 'right', 'left'])
  let chosen = null

  for (const placement of placements) {
    const candidate = getWalkthroughCardPosition(rect, cardRect, placement, gap)
    if (
      candidate.left >= margin &&
      candidate.top >= margin &&
      candidate.left + cardRect.width <= viewportWidth - margin &&
      candidate.top + cardRect.height <= viewportHeight - margin
    ) {
      chosen = { ...candidate, placement }
      break
    }
  }

  if (!chosen) {
    const fallback = getWalkthroughCardPosition(rect, cardRect, preferredPlacement, gap)
    chosen = {
      placement: preferredPlacement,
      left: clampNumber(fallback.left, margin, viewportWidth - cardRect.width - margin),
      top: clampNumber(fallback.top, margin, viewportHeight - cardRect.height - margin)
    }
  }

  card.dataset.placement = chosen.placement
  card.style.left = `${Math.round(chosen.left)}px`
  card.style.top = `${Math.round(chosen.top)}px`
  positionWalkthroughArrow(card, rect, chosen, cardRect)
}

function getWalkthroughCardPosition(rect, cardRect, placement, gap) {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  if (placement === 'top') {
    return { left: centerX - cardRect.width / 2, top: rect.top - cardRect.height - gap }
  }
  if (placement === 'left') {
    return { left: rect.left - cardRect.width - gap, top: centerY - cardRect.height / 2 }
  }
  if (placement === 'right') {
    return { left: rect.right + gap, top: centerY - cardRect.height / 2 }
  }
  return { left: centerX - cardRect.width / 2, top: rect.bottom + gap }
}

function positionWalkthroughArrow(card, rect, cardPosition, cardRect) {
  const targetCenterX = rect.left + rect.width / 2
  const targetCenterY = rect.top + rect.height / 2
  const arrowInset = 28

  if (cardPosition.placement === 'top' || cardPosition.placement === 'bottom') {
    const arrowLeft = clampNumber(targetCenterX - cardPosition.left, arrowInset, cardRect.width - arrowInset)
    card.style.setProperty('--walkthrough-arrow-left', `${Math.round(arrowLeft)}px`)
    card.style.setProperty('--walkthrough-arrow-top', '')
  } else {
    const arrowTop = clampNumber(targetCenterY - cardPosition.top, arrowInset, cardRect.height - arrowInset)
    card.style.setProperty('--walkthrough-arrow-left', '')
    card.style.setProperty('--walkthrough-arrow-top', `${Math.round(arrowTop)}px`)
  }
}

function uniqueWalkthroughPlacements(placements) {
  const valid = new Set(['top', 'right', 'bottom', 'left'])
  return placements.filter((placement, index, list) => valid.has(placement) && list.indexOf(placement) === index)
}

function runWalkthroughHooks(step, phase, context = {}) {
  const hooks = getWalkthroughHookList(step?.hooks?.[phase])
  hooks.forEach(hook => {
    if (typeof hook === 'function') {
      hook({ ...context, step, phase })
      return
    }
    WALKTHROUGH_HOOKS[hook]?.({ ...context, step, phase })
  })
}

function getWalkthroughHookList(hooks) {
  if (!hooks) return []
  return Array.isArray(hooks) ? hooks : [hooks]
}

function isWalkthroughTargetVisible(target) {
  const rect = target.getBoundingClientRect()
  const style = window.getComputedStyle(target)
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function setFixedRect(element, rect) {
  if (!element) return
  element.style.left = `${Math.round(rect.left)}px`
  element.style.top = `${Math.round(rect.top)}px`
  element.style.width = `${Math.max(0, Math.round(rect.width))}px`
  element.style.height = `${Math.max(0, Math.round(rect.height))}px`
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function resetSandboxState() {
  if (!IS_SANDBOX) return
  createStateBackup('before sandbox reset', { force: true })
  const state = createEmptySandboxState()
  saveState(state, { backup: false })
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
  const latestActivityDate = getLastSandboxActivityDate(state)
  return latestActivityDate || new Date()
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
  const refreshedAt = new Date().toISOString()
  channels.forEach(channel => markChannelRefreshSuccess(state, channel.id, refreshedAt))
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

  const refreshedAt = new Date().toISOString()
  s.config.channels.forEach(channel => markChannelRefreshSuccess(s, channel.id, refreshedAt))
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

  const createdChunks = remaining >= ANKI_CREATED_CHUNK_POINTS ? randomInt(0, Math.floor(remaining / ANKI_CREATED_CHUNK_POINTS)) : 0
  const created = createdChunks * ANKI_CREATED_CHUNK_SIZE + (createdChunks ? randomInt(0, ANKI_CREATED_CHUNK_SIZE - 1) : randomInt(0, 4))
  remaining -= createdChunks * ANKI_CREATED_CHUNK_POINTS

  const reviewedChunks = remaining >= ANKI_REVIEW_CHUNK_POINTS ? randomInt(0, Math.floor(remaining / ANKI_REVIEW_CHUNK_POINTS)) : 0
  const reviewed = reviewedChunks * ANKI_REVIEW_CHUNK_SIZE + randomInt(0, ANKI_REVIEW_CHUNK_SIZE - 1)
  remaining -= reviewedChunks * ANKI_REVIEW_CHUNK_POINTS

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
  document.getElementById('settingsGoal').value   = s.config.weeklyGoalHours
  document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(s.config.includeShorts)
  renderChannelList(s.config.channels)
  renderBackupList()
  show('settingsPanel')
}

function closeSettings() { hide('settingsPanel') }

function closeSettingsOnEscape(event) {
  if (event.key !== 'Escape') return
  const panel = document.getElementById('settingsPanel')
  if (!panel || panel.classList.contains('hidden')) return
  closeSettings()
}

function saveSettingsOnTheFly() {
  const s      = loadState()
  const goal   = normalizeWeeklyGoalHours(document.getElementById('settingsGoal').value)
  s.config.weeklyGoalHours = goal
  s.config.includeShorts = Boolean(document.getElementById('settingsIncludeShorts')?.checked)
  document.getElementById('settingsGoal').value = goal
  saveState(s)
  renderAll(s)
}

function exportSyncFile() {
  const state = loadState()
  if (!state) {
    showToast('Nothing to sync yet', 'warn')
    return
  }

  const payload = {
    app: 'edenia',
    syncVersion: 1,
    exportedAt: new Date().toISOString(),
    sandbox: IS_SANDBOX,
    state
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `edenia-${IS_SANDBOX ? 'sandbox-' : ''}sync-${toDateKey()}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  showToast('Sync file exported')
}

function importSyncFileFromInput(input) {
  const file = input?.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || ''))
      const importedState = getImportedSyncState(payload)
      if (!importedState) {
        showToast('That sync file is not valid', 'error')
        return
      }
      if (payload?.app === 'edenia' && Boolean(payload.sandbox) !== IS_SANDBOX) {
        showToast(IS_SANDBOX ? 'Use a sandbox sync file here' : 'Use a normal Edenia sync file here', 'warn')
        return
      }

      createStateBackup('before sync import', { force: true })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(importedState))
      const normalizedState = loadState()
      if (!normalizedState) {
        showToast('Could not import that sync file', 'error')
        return
      }
      saveState(normalizedState, { backup: false })
      applyTheme(normalizedState.config.theme)
      setDefaultCityDayOffset(normalizedState)
      renderAll(normalizedState)
      renderChannelList(normalizedState.config.channels)
      renderBackupList()
      document.getElementById('settingsGoal').value = normalizedState.config.weeklyGoalHours
      document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(normalizedState.config.includeShorts)
      showToast('Sync file imported')
    } catch {
      showToast('Could not read that sync file', 'error')
    } finally {
      input.value = ''
    }
  }
  reader.onerror = () => {
    showToast('Could not read that sync file', 'error')
    input.value = ''
  }
  reader.readAsText(file)
}

function formatBackupTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatBackupReason(reason) {
  return String(reason || 'automatic backup')
    .replace(/^before /, 'Before ')
    .replace(/^automatic backup$/, 'Automatic backup')
}

function renderBackupList() {
  const el = document.getElementById('backupList')
  if (!el) return

  const entries = getStateBackupEntries()
  if (!entries.length) {
    el.innerHTML = '<p class="backup-empty">No local backups yet</p>'
    return
  }

  el.innerHTML = entries.slice(0, 4).map(entry => `
    <div class="backup-item">
      <div class="backup-item-copy">
        <span class="backup-time">${escHtml(formatBackupTimestamp(entry.createdAt))}</span>
        <span class="backup-reason">${escHtml(formatBackupReason(entry.reason))}</span>
      </div>
      <button class="btn-ghost backup-restore-btn" type="button" data-backup-id="${escHtml(entry.id)}" onclick="restoreStateBackup(this.dataset.backupId)">Restore</button>
    </div>
  `).join('')
}

function restoreStateBackup(id) {
  const entry = getStateBackupEntries().find(candidate => candidate.id === id)
  const state = entry ? prepareStateForBackup(entry.state) : null
  if (!state) {
    showToast('That backup is not available anymore', 'error')
    renderBackupList()
    return
  }

  createStateBackup('before backup restore', { force: true })
  syncStreak(state)
  saveState(state, { backup: false })
  applyTheme(state.config.theme)
  setDefaultCityDayOffset(state)
  renderAll(state)
  renderChannelList(state.config.channels)
  renderBackupList()
  document.getElementById('settingsGoal').value = state.config.weeklyGoalHours
  document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(state.config.includeShorts)
  showToast('Backup restored', 'success')
}

function getImportedSyncState(payload) {
  const state = payload?.app === 'edenia' ? payload.state : payload
  if (!state || typeof state !== 'object') return null
  if (!state.config || typeof state.config !== 'object') return null
  if (!state.videos || typeof state.videos !== 'object' || Array.isArray(state.videos)) return null
  if (!state.anki || typeof state.anki !== 'object' || Array.isArray(state.anki)) return null

  const baseState = defaultState(
    state.config.weeklyGoalHours || 4,
    state.config.channels,
    state.config.theme,
    state.config.removedDefaultChannelIds
  )

  return {
    ...baseState,
    ...state,
    config: {
      ...baseState.config,
      ...state.config
    }
  }
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
  if (isDefaultChannelId(id)) {
    s.config.removedDefaultChannelIds = (s.config.removedDefaultChannelIds || []).filter(channelId => channelId !== id)
  }
  saveState(s)
  renderChannelList(s.config.channels)
  idEl.value = ''
  if (IS_SANDBOX) {
    showToast(`${name} added`)
    return
  }
  if (!hasYoutubeApiKey()) {
    showToast(`${name} added. Add the shared YouTube API key to load videos.`, 'warn')
    return
  }
  showToast(`${name} added · loading recent videos...`)
  refreshAddedChannel(id)
}

function removeChannel(id) {
  const s = loadState()
  s.config.channels = s.config.channels.filter(c => c.id !== id)
  delete getChannelRefreshes(s)[id]
  if (isDefaultChannelId(id) && !s.config.removedDefaultChannelIds.includes(id)) {
    s.config.removedDefaultChannelIds.push(id)
  }
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
      <button class="channel-remove" data-channel-id="${escHtml(c.id)}" onclick="removeChannel(this.dataset.channelId)" title="Remove">✕</button>
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
  createStateBackup('before reset', { force: true })
  queueSandboxWalkthroughAfterReset()
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

function hasVerticalThumbnail(thumbnails = {}) {
  return Object.values(thumbnails).some(thumb => {
    const width = Number(thumb?.width)
    const height = Number(thumb?.height)
    return width > 0 && height > width * 1.12
  })
}

function hasShortsMetadataCue(snippet = {}) {
  const tags = Array.isArray(snippet.tags) ? snippet.tags : []
  const hashtagText = [snippet.title, snippet.description, ...tags].filter(Boolean).join(' ')
  return /(^|\s)#shorts?\b/i.test(hashtagText) || tags.some(tag => /^#?shorts?$/i.test(String(tag || '').trim()))
}

function isLikelyYoutubeShort(detail = {}) {
  const duration = Number(detail.duration || 0)
  if (!duration || duration > SHORTS_MAX_DURATION_SECONDS) return false
  return Boolean(detail.shortsMetadataCue || detail.verticalThumbnail || detail.shortsAspectThumbnail)
}

function getVideoDetailFromItem(item) {
  const snippet = item?.snippet || {}
  const detail = {
    duration: parseDuration(item?.contentDetails?.duration),
    shortsMetadataCue: hasShortsMetadataCue(snippet),
    verticalThumbnail: hasVerticalThumbnail(snippet.thumbnails)
  }
  detail.isShort = isLikelyYoutubeShort(detail)
  return detail
}

function probeShortsAspectThumbnail(videoId) {
  if (typeof Image === 'undefined') return Promise.resolve(false)
  return new Promise(resolve => {
    const img = new Image()
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      resolve(value)
    }
    img.onload = () => finish(img.naturalHeight > img.naturalWidth * 1.12)
    img.onerror = () => finish(false)
    window.setTimeout(() => finish(false), 1200)
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/oardefault.jpg`
  })
}

async function addShortsAspectSignals(detailsById) {
  const candidates = Object.entries(detailsById)
    .filter(([, detail]) => {
      const duration = Number(detail?.duration || 0)
      return duration > 0 && duration <= SHORTS_MAX_DURATION_SECONDS && !detail.isShort
    })

  await Promise.all(candidates.map(async ([videoId, detail]) => {
    detail.shortsAspectThumbnail = await probeShortsAspectThumbnail(videoId)
    detail.isShort = isLikelyYoutubeShort(detail)
  }))
}

async function ytFetch(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchChannelVideosPage(channel, pageToken = '') {
  const pid  = uploadsId(channel.id)
  const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
  const url  = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${FETCH_PAGE_SIZE}&playlistId=${pid}&key=${encodeURIComponent(getYoutubeApiKey())}${tokenParam}`
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

function getBestThumbnail(thumbnails = {}) {
  return thumbnails.maxres?.url
    || thumbnails.high?.url
    || thumbnails.medium?.url
    || thumbnails.default?.url
    || ''
}

function parseYoutubeVideoId(value) {
  const raw = String(value || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw

  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(normalized)
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com') {
      const watchedId = url.searchParams.get('v')
      if (/^[A-Za-z0-9_-]{11}$/.test(watchedId || '')) return watchedId
      const parts = url.pathname.split('/').filter(Boolean)
      if (['embed', 'shorts', 'live', 'v'].includes(parts[0]) && /^[A-Za-z0-9_-]{11}$/.test(parts[1] || '')) {
        return parts[1]
      }
    }
  } catch {
    // Fall back to pattern matching below.
  }

  const match = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/)
  return match?.[1] || ''
}

async function fetchVideoMetadata(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(getYoutubeApiKey())}`
  const data = await ytFetch(url)
  const item = data.items?.[0]
  if (!item) throw new Error('No YouTube video found for that URL')
  return {
    id: item.id,
    title: item.snippet?.title || 'Untitled video',
    channelTitle: item.snippet?.channelTitle || 'YouTube',
    channelId: item.snippet?.channelId || 'manual-youtube',
    thumbnail: getBestThumbnail(item.snippet?.thumbnails) || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`,
    publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
    duration: parseDuration(item.contentDetails?.duration),
    source: 'manual',
    manuallyAdded: true
  }
}

function getVideoStatus(video) {
  return normalizeVideoStatus(video?.status)
}

function normalizeVideoStatus(status) {
  return VIDEO_STATUSES.includes(status) ? status : 'unwatched'
}

function normalizeResumeAtSeconds(value, duration = null) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const rounded = Math.floor(seconds)
  if (Number.isFinite(duration) && duration > 0) return Math.min(rounded, Math.max(0, duration - 1))
  return rounded
}

function isActiveRefreshVideo(video) {
  return getVideoStatus(video) !== 'watched'
}

function isCountableRefreshVideo(video, includeShorts) {
  return isActiveRefreshVideo(video) && (includeShorts || !video?.isShort)
}

function getRefreshCountCandidate(video, knownVideos = {}) {
  const known = knownVideos[video.id]
  return known
    ? { ...video, ...known, isShort: Boolean(video.isShort || known.isShort) }
    : video
}

function getKnownChannelActiveCount(channel, knownVideos = {}, includeShorts = true) {
  return Object.values(knownVideos)
    .filter(video => video.channelId === channel.id)
    .filter(video => isCountableRefreshVideo(video, includeShorts))
    .length
}

function applyFetchedVideoDetails(videos, detailsById = {}) {
  return videos.map(video => {
    const detail = detailsById[video.id]
    return detail
      ? { ...video, duration: detail.duration, isShort: Boolean(detail.isShort) }
      : video
  })
}

function getRefreshCandidateDetails(s, videos) {
  const detailsById = {}
  videos.forEach(video => {
    const existing = s.videos[video.id]
    if (Number.isFinite(Number(video.duration))) {
      detailsById[video.id] = {
        duration: Number(video.duration),
        isShort: Boolean(video.isShort)
      }
    } else if (existing && typeof existing.duration === 'number') {
      detailsById[video.id] = {
        duration: existing.duration,
        isShort: Boolean(existing.isShort)
      }
    }
  })
  return detailsById
}

async function fetchChannelVideos(channel, knownVideos = {}, options = {}) {
  const includeShorts = normalizeIncludeShorts(options.includeShorts)
  const fetched = []
  let pageToken = ''
  let pages = 0
  let newCount = 0
  let knownActiveCount = getKnownChannelActiveCount(channel, knownVideos, includeShorts)

  while (pages < MAX_FETCH_PAGES_PER_CHANNEL) {
    const page = await fetchChannelVideosPage(channel, pageToken)
    pages += 1
    const detailsById = includeShorts
      ? {}
      : await fetchVideoDetails(page.videos.map(video => video.id), { detectShorts: true })
    const acceptedVideos = includeShorts
      ? page.videos
      : page.videos.filter(video => knownVideos[video.id] || !detailsById[video.id]?.isShort)
    const detailedAcceptedVideos = applyFetchedVideoDetails(acceptedVideos, detailsById)
    fetched.push(...detailedAcceptedVideos)

    const pageNewVideos = detailedAcceptedVideos.filter(v => !knownVideos[v.id])
    newCount += pageNewVideos.length

    const pageKnownOnly = pageNewVideos.length === 0
    const pageActiveCount = detailedAcceptedVideos
      .filter(v => isCountableRefreshVideo(getRefreshCountCandidate(v, knownVideos), includeShorts))
      .length
    knownActiveCount += pageNewVideos.filter(video => isCountableRefreshVideo(video, includeShorts)).length

    if (
      newCount >= ACTIVE_VIDEOS_PER_CHANNEL ||
      (knownActiveCount >= ACTIVE_VIDEOS_PER_CHANNEL && pageKnownOnly) ||
      pageActiveCount >= ACTIVE_VIDEOS_PER_CHANNEL ||
      !page.nextPageToken
    ) break
    pageToken = page.nextPageToken
  }

  return fetched
}

async function fetchVideoDetails(videoIds, { detectShorts = false } = {}) {
  const result = {}
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50).join(',')
    const url   = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch}&key=${encodeURIComponent(getYoutubeApiKey())}`
    const data  = await ytFetch(url)
    data.items.forEach(item => { result[item.id] = getVideoDetailFromItem(item) })
  }
  if (detectShorts) await addShortsAspectSignals(result)
  return result
}

function getChannelRefreshes(s) {
  if (!s.channelRefreshes || typeof s.channelRefreshes !== 'object' || Array.isArray(s.channelRefreshes)) {
    s.channelRefreshes = {}
  }
  return s.channelRefreshes
}

function getChannelLastFetchedMs(s, channelId) {
  const lastFetchedAt = getChannelRefreshes(s)[channelId]?.lastFetchedAt
  const lastFetchedMs = new Date(lastFetchedAt).getTime()
  return Number.isFinite(lastFetchedMs) ? lastFetchedMs : null
}

function formatChannelLastRefreshLabel(s, channelId) {
  const lastFetchedMs = getChannelLastFetchedMs(s, channelId)
  if (!lastFetchedMs) return 'Not yet'

  const elapsedMs = Date.now() - lastFetchedMs
  if (elapsedMs < 60_000) return 'just now'
  if (elapsedMs < 3_600_000) return `${Math.floor(elapsedMs / 60_000)}m ago`
  if (elapsedMs < 86_400_000) return `${Math.floor(elapsedMs / 3_600_000)}h ago`
  return timeAgo(new Date(lastFetchedMs).toISOString())
}

function formatChannelLastRefreshTitle(s, channelId) {
  const lastFetchedMs = getChannelLastFetchedMs(s, channelId)
  if (!lastFetchedMs) return 'Not refreshed yet'
  return `Last refreshed ${new Date(lastFetchedMs).toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}`
}

function getChannelLastFailedMs(s, channelId) {
  const lastFailedAt = getChannelRefreshes(s)[channelId]?.lastFailedAt
  const lastFailedMs = new Date(lastFailedAt).getTime()
  return Number.isFinite(lastFailedMs) ? lastFailedMs : null
}

function getChannelRefreshWaitMs(s, channelId) {
  const lastFetchedMs = getChannelLastFetchedMs(s, channelId)
  const lastFailedMs = getChannelLastFailedMs(s, channelId)
  const successWait = lastFetchedMs
    ? Math.max(0, YOUTUBE_REFRESH_INTERVAL_MS - (Date.now() - lastFetchedMs))
    : 0
  const failureWait = lastFailedMs
    ? Math.max(0, YOUTUBE_REFRESH_ERROR_BACKOFF_MS - (Date.now() - lastFailedMs))
    : 0
  return Math.max(successWait, failureWait)
}

function isChannelRefreshDue(s, channelId) {
  return getChannelRefreshWaitMs(s, channelId) <= 0
}

function getDueYoutubeChannels(s) {
  if (IS_SANDBOX || !hasYoutubeApiKey() || !s.config.channels.length) return []
  return s.config.channels.filter(channel => isChannelRefreshDue(s, channel.id))
}

function hasAnyChannelRefreshTimestamp(s) {
  return Object.values(getChannelRefreshes(s)).some(entry => isValidTimestamp(entry?.lastFetchedAt))
}

function markChannelRefreshSuccess(s, channelId, timestamp = new Date().toISOString()) {
  getChannelRefreshes(s)[channelId] = {
    lastFetchedAt: timestamp,
    lastError: null,
    lastFailedAt: null
  }
}

function markChannelRefreshError(s, channelId, error) {
  const refreshes = getChannelRefreshes(s)
  refreshes[channelId] = {
    lastFetchedAt: refreshes[channelId]?.lastFetchedAt || null,
    lastError: String(error?.message || error || 'Refresh failed'),
    lastFailedAt: new Date().toISOString()
  }
}

function shouldRefreshYoutubeFeed(s) {
  return getDueYoutubeChannels(s).length > 0
}

function getYoutubeRefreshRemainingMs(s) {
  if (IS_SANDBOX || !s.config.channels.length) return 0
  const waits = s.config.channels.map(channel => getChannelRefreshWaitMs(s, channel.id))
  return Math.min(...waits)
}

function formatRefreshWait(ms) {
  const totalMinutes = Math.ceil(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

async function maybeRefreshFeed({ notifyMissingKey = false } = {}) {
  if (maybeRefreshFeed._running) return
  maybeRefreshFeed._running = true
  const s = loadState()
  try {
    if (shouldRefreshYoutubeFeed(s)) {
      await refreshFeed({ silent: hasAnyChannelRefreshTimestamp(s) })
    } else if (!hasYoutubeApiKey() && notifyMissingKey) {
      showToast('Add the shared YouTube API key to config.local.js', 'warn')
    }
  } finally {
    maybeRefreshFeed._running = false
    scheduleYoutubeAutoRefresh(loadState())
  }
}

function startYoutubeAutoRefresh() {
  clearTimeout(startYoutubeAutoRefresh._timer)
  window.removeEventListener('focus', handleYoutubeRefreshWake)
  window.removeEventListener('online', handleYoutubeRefreshWake)
  document.removeEventListener('visibilitychange', handleYoutubeRefreshVisibility)
  window.addEventListener('focus', handleYoutubeRefreshWake)
  window.addEventListener('online', handleYoutubeRefreshWake)
  document.addEventListener('visibilitychange', handleYoutubeRefreshVisibility)
  maybeRefreshFeed({ notifyMissingKey: true })
}

function scheduleYoutubeAutoRefresh(s = loadState()) {
  clearTimeout(startYoutubeAutoRefresh._timer)
  if (IS_SANDBOX || !hasYoutubeApiKey() || !s?.config?.channels?.length) return

  const waitMs = getYoutubeRefreshRemainingMs(s)
  startYoutubeAutoRefresh._timer = setTimeout(maybeRefreshFeed, Math.max(1_000, waitMs))
}

function handleYoutubeRefreshWake() {
  maybeRefreshFeed()
}

function handleYoutubeRefreshVisibility() {
  if (!document.hidden) maybeRefreshFeed()
}

function dedupeVideos(videos = []) {
  const seen = new Set()
  return videos.filter(video => {
    if (seen.has(video.id)) return false
    seen.add(video.id)
    return true
  })
}

async function getFetchedVideoDetails(s, videos, includeShorts) {
  const knownDetailsById = getRefreshCandidateDetails(s, videos)
  const detailIds = videos
    .filter(v => !knownDetailsById[v.id])
    .map(v => v.id)
  return {
    ...knownDetailsById,
    ...await fetchVideoDetails(detailIds, { detectShorts: !includeShorts })
  }
}

function mergeFetchedVideos(s, videos, detailsById, includeShorts) {
  const videosToMerge = includeShorts
    ? videos
    : videos.filter(v => s.videos[v.id] || !detailsById[v.id]?.isShort)

  videosToMerge.forEach(v => {
    const existing = s.videos[v.id]
    const detail = detailsById[v.id] || {}
    const duration = detail.duration ?? v.duration ?? existing?.duration ?? 0
    s.videos[v.id] = {
      ...v,
      duration,
      status:     existing?.status    ?? 'unwatched',
      watchedAt:  existing?.watchedAt ?? null,
      resumeAtSeconds: normalizeResumeAtSeconds(existing?.resumeAtSeconds, duration),
      source: existing?.source || v.source || null,
      manuallyAdded: Boolean(existing?.manuallyAdded || v.manuallyAdded),
      isShort: Boolean(detail.isShort || v.isShort || existing?.isShort)
    }
  })

  return {
    mergedCount: videosToMerge.length,
    skippedShorts: includeShorts ? 0 : videos.length - videosToMerge.length
  }
}

function formatSkippedShortsMessage(skippedShorts) {
  return skippedShorts ? `, skipped ${skippedShorts} Short${skippedShorts === 1 ? '' : 's'}` : ''
}

async function refreshFeed({ silent = false } = {}) {
  const btn = document.getElementById('refreshBtn')
  if (btn) {
    btn.textContent = '↻ Refreshing…'
    btn.classList.add('loading')
    btn.disabled = true
  }

  try {
    if (IS_SANDBOX) {
      refreshSandboxFeed()
      return
    }

    const s = loadState()
    if (!hasYoutubeApiKey()) {
      showToast('Add the shared YouTube API key to config.local.js', 'warn')
      return
    }
    if (!s.config.channels.length) {
      showToast('Add at least one channel in ⚙ Settings first', 'warn')
      return
    }
    const channelsToRefresh = getDueYoutubeChannels(s)
    if (!channelsToRefresh.length) {
      if (!silent) showToast(`Next YouTube refresh in ${formatRefreshWait(getYoutubeRefreshRemainingMs(s))}`, 'warn')
      return
    }

    const all    = []
    const errors = []
    let successfulChannels = 0
    const includeShorts = normalizeIncludeShorts(s.config.includeShorts)

    await Promise.all(channelsToRefresh.map(async ch => {
      try {
        const vids = await fetchChannelVideos(ch, s.videos, { includeShorts })
        successfulChannels += 1
        all.push(...vids)
        const first = vids[0]
        if (first?.channelTitle && first.channelTitle !== ch.name) {
          ch.name = first.channelTitle
        }
        markChannelRefreshSuccess(s, ch.id)
      } catch (err) {
        console.warn(`${ch.name}:`, err.message)
        markChannelRefreshError(s, ch.id, err)
        errors.push(ch.name)
      }
    }))

    if (successfulChannels === 0) {
      saveState(s)
      showToast(`Refresh failed: ${errors.length} channel${errors.length > 1 ? 's' : ''} failed`, 'error')
      return
    }

    const unique = dedupeVideos(all)
    const detailsById = await getFetchedVideoDetails(s, unique, includeShorts)
    const { mergedCount, skippedShorts } = mergeFetchedVideos(s, unique, detailsById, includeShorts)

    saveState(s)
    renderAll(s)

    const shortsMsg = formatSkippedShortsMessage(skippedShorts)
    const msg = errors.length
      ? `Loaded ${mergedCount} videos${shortsMsg} (${errors.length} channel${errors.length > 1 ? 's' : ''} failed)`
      : `${mergedCount} videos loaded from ${successfulChannels} channel${successfulChannels === 1 ? '' : 's'}${shortsMsg}`
    if (!silent || errors.length) showToast(msg, errors.length ? 'warn' : 'success')

  } catch (err) {
    console.error(err)
    showToast(`Refresh failed: ${err.message}`, 'error')
  } finally {
    if (btn) {
      btn.textContent = '↻ Refresh'
      btn.classList.remove('loading')
      btn.disabled = false
    }
    if (!IS_SANDBOX) scheduleYoutubeAutoRefresh(loadState())
  }
}

async function refreshAddedChannel(channelId) {
  if (IS_SANDBOX || !hasYoutubeApiKey()) return

  try {
    const s = loadState()
    const channel = s.config.channels.find(ch => ch.id === channelId)
    if (!channel) return

    const includeShorts = normalizeIncludeShorts(s.config.includeShorts)
    const videos = dedupeVideos(await fetchChannelVideos(channel, s.videos, { includeShorts }))
    const first = videos[0]
    if (first?.channelTitle && first.channelTitle !== channel.name) {
      channel.name = first.channelTitle
    }

    const detailsById = await getFetchedVideoDetails(s, videos, includeShorts)
    const { mergedCount, skippedShorts } = mergeFetchedVideos(s, videos, detailsById, includeShorts)

    markChannelRefreshSuccess(s, channel.id)
    saveState(s)
    renderAll(s)
    renderChannelList(s.config.channels)

    const channelName = channel.name || channelId
    const shortsMsg = formatSkippedShortsMessage(skippedShorts)
    showToast(`${channelName}: ${mergedCount} videos loaded${shortsMsg}`, 'success')
  } catch (err) {
    console.error(err)
    const s = loadState()
    if (s?.config?.channels?.some(channel => channel.id === channelId)) {
      markChannelRefreshError(s, channelId, err)
      saveState(s)
    }
    showToast(`Channel added, but recent videos could not load: ${err.message}`, 'warn')
  }
}

// ════════════════════════════════════════════════════════════
// WATCH STATUS & STREAK
// ════════════════════════════════════════════════════════════

function markVideo(videoId, newStatus) {
  newStatus = normalizeVideoStatus(newStatus)
  const s     = loadState()
  const video = s.videos[videoId]
  if (!video) return
  if (video.status === newStatus) return

  const undoAction = {
    type: 'video-status',
    videoId,
    before: {
      status: video.status,
      watchedAt: video.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    },
    after: {
      status: newStatus
    }
  }

  video.status    = newStatus
  video.watchedAt = newStatus === 'watched' ? new Date().toISOString() : null
  video.resumeAtSeconds = newStatus === 'partial'
    ? normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    : null
  undoAction.after.watchedAt = video.watchedAt
  undoAction.after.resumeAtSeconds = video.resumeAtSeconds
  pushUndoAction(s, undoAction)

  syncStreak(s)

  saveState(s)
  renderAll(s)
}

function markVideoInProgressOnOpen(videoId) {
  const s     = loadState()
  const video = s.videos[videoId]
  if (!video || ['partial', 'watched'].includes(getVideoStatus(video))) return

  pushUndoAction(s, {
    type: 'video-status',
    videoId,
    before: {
      status: video.status,
      watchedAt: video.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    },
    after: {
      status: 'partial',
      watchedAt: null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    }
  })

  video.status = 'partial'
  video.watchedAt = null
  video.resumeAtSeconds = normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)

  saveState(s)
  setTimeout(() => renderAll(loadState()), 0)
}

async function addWatchedVideoFromUrl(event) {
  event.preventDefault()
  const input = document.getElementById('manualVideoUrlInput')
  const btn = document.getElementById('manualVideoAddBtn')
  const rawUrl = input?.value?.trim() || ''
  const videoId = parseYoutubeVideoId(rawUrl)

  if (!videoId) {
    showToast('Use a valid YouTube video URL', 'warn')
    input?.focus()
    return
  }
  if (!hasYoutubeApiKey()) {
    showToast('Add the shared YouTube API key to config.local.js', 'warn')
    return
  }

  if (btn) {
    btn.disabled = true
    btn.textContent = 'Adding...'
  }

  try {
    const metadata = await fetchVideoMetadata(videoId)
    const s = loadState()
    const existing = s.videos[videoId]
    const before = {
      status: existing?.status || 'unwatched',
      watchedAt: existing?.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(existing?.resumeAtSeconds, existing?.duration ?? metadata.duration)
    }

    if (existing?.status === 'watched' && existing?.watchedAt) {
      showToast('That video is already marked watched', 'warn')
      input.value = ''
      closeManualVideoPopover()
      return
    }

    const watchedAt = new Date().toISOString()
    s.videos[videoId] = {
      ...metadata,
      ...existing,
      id: videoId,
      title: metadata.title || existing?.title || 'Untitled video',
      channelTitle: metadata.channelTitle || existing?.channelTitle || 'YouTube',
      channelId: metadata.channelId || existing?.channelId || 'manual-youtube',
      thumbnail: metadata.thumbnail || existing?.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
      publishedAt: metadata.publishedAt || existing?.publishedAt || watchedAt,
      duration: metadata.duration || existing?.duration || 0,
      status: 'watched',
      watchedAt,
      resumeAtSeconds: null,
      source: existing?.source || 'manual',
      manuallyAdded: true
    }

    pushUndoAction(s, {
      type: 'video-status',
      videoId,
      before,
      after: {
        status: 'watched',
        watchedAt,
        resumeAtSeconds: null
      }
    })
    syncStreak(s)
    saveState(s)
    input.value = ''
    closeManualVideoPopover()
    renderAll(s)
    showToast(`Added watched video: "${formatToastTitle(s.videos[videoId].title)}"`, 'success')
  } catch (err) {
    console.warn(err)
    showToast(err.message || 'Could not add that video', 'error')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Add'
    }
  }
}

function saveVideoResumeTime(videoId, value) {
  const s = loadState()
  const video = s?.videos?.[videoId]
  if (!video || getVideoStatus(video) !== 'partial') return

  const parsed = parseResumeTimestamp(value, video.duration)
  if (Number.isNaN(parsed)) {
    showToast('Use a timestamp like 12:34 or 1:02:03', 'warn')
    renderAll(s)
    return
  }

  video.resumeAtSeconds = parsed
  saveState(s)
  renderAll(s)
}

function pushUndoAction(s, action) {
  normalizeUndoState(s)
  if (!action.createdAt) action.createdAt = new Date().toISOString()
  s.undoStack.push(action)
  s.redoStack = []
  if (s.undoStack.length > UNDO_STACK_LIMIT) {
    s.undoStack.splice(0, s.undoStack.length - UNDO_STACK_LIMIT)
  }
}

function undoLastVideoAction() {
  const s = loadState()
  normalizeUndoState(s)
  applyHistoryAction('undo', s.undoStack.length - 1)
}

function redoLastVideoAction() {
  const s = loadState()
  normalizeUndoState(s)
  applyHistoryAction('redo', s.redoStack.length - 1)
}

function applyHistoryAction(direction, actionIndex) {
  const s = loadState()
  normalizeUndoState(s)
  const sourceStack = direction === 'redo' ? s.redoStack : s.undoStack
  const targetStack = direction === 'redo' ? s.undoStack : s.redoStack
  const index = Number(actionIndex)
  const action = sourceStack[index]

  if (action?.type !== 'video-status') {
    showToast(direction === 'redo' ? 'Nothing to redo' : 'Nothing to undo', 'warn')
    return
  }

  sourceStack.splice(index, 1)
  const targetSnapshot = direction === 'redo' ? action.after : action.before
  const video = applyVideoStatusActionSnapshot(s, action.videoId, targetSnapshot)

  if (!video) {
    saveState(s)
    renderAll(s)
    showToast('That video is no longer available', 'warn')
    return
  }

  targetStack.push(action)
  if (targetStack.length > UNDO_STACK_LIMIT) {
    targetStack.splice(0, targetStack.length - UNDO_STACK_LIMIT)
  }
  syncStreak(s)

  closeHistoryActionPopovers()
  saveState(s)
  renderAll(s)
  showToast(formatHistoryActionToast(direction, video, targetSnapshot))
}

function applyVideoStatusActionSnapshot(s, videoId, snapshot) {
  const video = s.videos?.[videoId]
  if (!video || !snapshot) return null
  video.status = snapshot.status
  video.watchedAt = snapshot.watchedAt
  video.resumeAtSeconds = normalizeResumeAtSeconds(snapshot.resumeAtSeconds, video.duration)
  return video
}

function formatHistoryActionToast(direction, video, snapshot) {
  const verb = direction === 'redo' ? 'Redid' : 'Undid'
  return `${verb} change: "${formatToastTitle(video.title)}" is back to ${formatVideoStatus(snapshot.status)}.`
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
  const today = getCurrentAppDateKey(s)
  const end = getCurrentAppDate(s)
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
  const today     = getCurrentAppDateKey(s)
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
    fetchedAt: new Date().toISOString(),
    ankiDateKey: getCurrentAnkiDateKey()
  }
}

function isHostedOrigin() {
  return window.location.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function formatAnkiConnectError(err) {
  if (err?.name === 'AbortError') {
    return 'AnkiConnect unavailable: open Anki with AnkiConnect installed'
  }

  const message = err?.message || ''
  if (message === 'Failed to fetch') {
    return isHostedOrigin()
      ? 'AnkiConnect blocked: add this site to AnkiConnect webCorsOriginList'
      : 'AnkiConnect unavailable: open Anki with AnkiConnect installed'
  }

  return message ? `AnkiConnect failed: ${message}` : 'AnkiConnect not available'
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
    const message = formatAnkiConnectError(err)
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
  if (!IS_SANDBOX && !document.hidden) refreshAnkiStats({ silent: true })
}

function syncAnkiStatsToState(stats) {
  const s = loadState()
  if (!s || !stats) return

  const ankiDateKey = stats.ankiDateKey || getAnkiDateKey(new Date(stats.fetchedAt || Date.now()))
  s.anki[ankiDateKey] = {
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

function getHistoryRange(range = selectedHistoryRange, from = new Date(), state = null) {
  const currentDate = getCurrentAppDate(state)
  const end = new Date(from)
  end.setHours(23, 59, 59, 999)

  const start = new Date(from)
  if (range === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setMonth(start.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
  } else if (range === 'week') {
    start.setTime(getWeekStart(from).getTime())
    end.setTime(start.getTime())
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else {
    start.setHours(0, 0, 0, 0)
  }

  if (end > currentDate) {
    end.setTime(currentDate.getTime())
    end.setHours(23, 59, 59, 999)
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

function getStudyHistory(s, range = selectedHistoryRange, periodKey = selectedHistoryPeriod[range]) {
  const options = getHistoryPeriodOptions(s, range)
  const selectedOption = options.find(option => option.key === periodKey) || options[0]
  if (!selectedOption) return { rows: [], summary: createHistoryBucket('summary') }
  const { start, end } = getHistoryRange(range, selectedOption.start, s)
  return getStudyHistoryBetween(s, start, end)
}

function getStudyActivityDateKeys(s) {
  const dateKeys = new Set()
  for (const video of Object.values(s?.videos || {})) {
    if (!video.watchedAt || video.status !== 'watched') continue
    const date = new Date(video.watchedAt)
    if (Number.isNaN(date.getTime())) continue
    dateKeys.add(toDateKey(date))
  }

  for (const [dateKey, day] of Object.entries(s?.anki || {})) {
    if ((day.reviewed || 0) <= 0 && (day.created || 0) <= 0) continue
    dateKeys.add(dateKey)
  }

  return [...dateKeys].sort((a, b) => b.localeCompare(a))
}

function getHistoryPeriodOptions(s, range = selectedHistoryRange) {
  const periods = new Map()
  getStudyActivityDateKeys(s).forEach(dateKey => {
    const date = dateKeyToLocalDate(dateKey)
    const start = range === 'month'
      ? new Date(date.getFullYear(), date.getMonth(), 1)
      : getWeekStart(date)
    const key = range === 'month'
      ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
      : toDateKey(start)

    if (!periods.has(key)) {
      periods.set(key, {
        key,
        start,
        label: range === 'month' ? formatHistoryMonthOption(start) : formatHistoryWeekOption(start)
      })
    }
  })

  return [...periods.values()].sort((a, b) => b.start - a.start)
}

function formatHistoryMonthOption(start) {
  return start.toLocaleDateString('en', { month: 'long', year: 'numeric' })
}

function formatHistoryWeekOption(start) {
  const end = addDays(start, 6)
  const sameYear = start.getFullYear() === end.getFullYear()
  const startText = start.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
  const endText = end.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startText} - ${endText}`
}

function syncHistoryPeriodSelection(s) {
  const options = getHistoryPeriodOptions(s, selectedHistoryRange)
  if (!options.length) {
    selectedHistoryPeriod[selectedHistoryRange] = null
    return options
  }

  const currentKey = selectedHistoryPeriod[selectedHistoryRange]
  if (!options.some(option => option.key === currentKey)) {
    const currentRange = getHistoryRange(selectedHistoryRange, getCurrentAppDate(s), s)
    const currentPeriodKey = selectedHistoryRange === 'month'
      ? `${currentRange.start.getFullYear()}-${String(currentRange.start.getMonth() + 1).padStart(2, '0')}`
      : toDateKey(currentRange.start)
    selectedHistoryPeriod[selectedHistoryRange] =
      options.find(option => option.key === currentPeriodKey)?.key || options[0].key
  }

  return options
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
    if ((day.reviewed || 0) <= 0 && (day.created || 0) <= 0) continue
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
  if (!row.videosWatched || !row.watchedVideos.length) {
    return `
      <span class="history-video-cell">
        <span class="history-video-count history-video-count-empty">
          <span class="history-video-count-number">0</span>
        </span>
      </span>
    `
  }
  return `
    <span class="history-video-cell">
      <button type="button" class="history-video-count" onclick="toggleHistoryVideoPopover(event)" aria-expanded="false" aria-label="Show ${row.videosWatched} videos watched on ${escHtml(formatHeatmapTitle(row))}">
        <span class="history-video-count-number">${row.videosWatched}</span>
        <span class="history-video-count-caret" aria-hidden="true"></span>
      </button>
      <span class="history-video-popover" role="dialog" aria-label="Watched videos">
        ${row.watchedVideos.map(video => `
          <button type="button" class="history-video-popover-item" data-video-id="${escHtml(video.id)}" onclick="jumpToWatchedVideo(this.dataset.videoId)">
            ${video.thumbnail
              ? `<img src="${escHtml(video.thumbnail)}" alt="" class="history-video-thumb" loading="lazy">`
              : '<span class="history-video-thumb history-video-thumb-empty"></span>'}
            <span class="history-video-details">
              <span class="history-video-title">${escHtml(video.title)}</span>
              <span class="history-video-duration">${formatDuration(video.duration)}</span>
            </span>
          </button>
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
  closeManualVideoPopover()
  closeHistoryPeriodPopovers()
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

function jumpToWatchedVideo(videoId) {
  const targetId = String(videoId ?? '')
  const card = Array.from(document.querySelectorAll('#watchedGrid .video-card'))
    .find(el => el.dataset.videoId === targetId)
  if (!card) {
    showToast('That watched video is hidden by the current filters', 'warn')
    closeHistoryVideoPopovers()
    return
  }

  closeHistoryVideoPopovers()
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.classList.remove('flash-target')
  void card.offsetWidth
  card.classList.add('flash-target')
  window.setTimeout(() => card.classList.remove('flash-target'), 1900)
}

function formatHistoryDate(dateKey, state = null) {
  const date = new Date(`${dateKey}T00:00:00`)
  const todayDate = getCurrentAppDate(state)
  const today = toDateKey(todayDate)
  const yesterday = toDateKey(addDays(todayDate, -1))
  if (dateKey === today) return 'Today'
  if (dateKey === yesterday) return 'Yesterday'
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function renderStudyHistoryPanel(s) {
  const todayLog = s?.anki?.[getCurrentAnkiDateKey()]
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
    btn.setAttribute('aria-expanded', String(btn.closest('.history-period-cell')?.classList.contains('open') || false))
  })
  document.querySelectorAll('.history-view-btn').forEach(btn => {
    const isActive = btn.dataset.historyView === selectedHistoryView
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
  })

  renderHistoryPeriodPopover('week', 'historyWeekPeriodPopover', s || { videos: {}, anki: {} })
  renderHistoryPeriodPopover('month', 'historyMonthPeriodPopover', s || { videos: {}, anki: {} })

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
          <span class="history-points-col">PTS</span>
        </div>
        ${history.rows.map(row => `
          <div class="history-row">
            <span data-label="Date">${formatHistoryDate(row.dateKey, s)}</span>
            <span data-label="Video">${formatHistoryTime(row.secondsWatched)}</span>
            <span data-label="Watched">${renderHistoryWatchedCell(row)}</span>
            <span data-label="Anki">${row.ankiReviewed} / ${row.ankiCreated}</span>
            <span class="history-points-col" data-label="PTS">${getHistoryDayPoints(row)}</span>
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
    (hoursWatched * VIDEO_HOUR_POINTS) +
    (row.videosWatched * VIDEO_WATCHED_POINTS) +
    (Math.floor(row.ankiReviewed / ANKI_REVIEW_CHUNK_SIZE) * ANKI_REVIEW_CHUNK_POINTS) +
    (Math.floor(row.ankiCreated / ANKI_CREATED_CHUNK_SIZE) * ANKI_CREATED_CHUNK_POINTS)
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

function getWeekMonday(date) {
  const monday = new Date(date)
  const day = monday.getDay()
  const offset = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + offset)
  monday.setHours(0, 0, 0, 0)
  return monday
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
  const gridStart = getWeekMonday(new Date(`${firstActive.dateKey}T00:00:00`))
  const rowsByDate = new Map(history.rows.map(row => [row.dateKey, row]))
  const days = []
  for (let date = new Date(gridStart); date <= end; date = addDays(date, 1)) {
    const dateKey = toDateKey(date)
    const row = rowsByDate.get(dateKey) || createHistoryBucket(dateKey)
    days.push(row)
  }
  const weekCount = Math.ceil(days.length / 7)

  container.innerHTML = `
    <div class="heatmap-body">
      <div class="heatmap-weekday-labels" aria-hidden="true">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<span>${day}</span>`).join('')}
      </div>
      <div class="heatmap-scroll">
        <div class="heatmap-grid" style="grid-template-columns: repeat(${weekCount}, var(--heatmap-cell-size))">
          ${days.map(row => `
            <span class="heatmap-day level-${getHistoryHeatLevel(row)}" data-date="${escHtml(formatHeatmapTitle(row))}" data-points="${getHistoryDayPoints(row)}" data-time="${escHtml(formatHistoryTime(row.secondsWatched))}" data-videos="${row.videosWatched}" data-reviewed="${row.ankiReviewed}" data-created="${row.ankiCreated}" aria-label="${escHtml(formatHeatmapAriaLabel(row))}" tabindex="0" onmouseenter="showHeatmapTooltip(event)" onmousemove="positionHeatmapTooltip(event.currentTarget)" onmouseleave="hideHeatmapTooltip()" onclick="toggleHeatmapTooltip(event)" onfocus="showHeatmapTooltip(event)" onblur="hideHeatmapTooltip()"></span>
          `).join('')}
        </div>
      </div>
    </div>
  `
  scrollHeatmapToLatestOnTouch(container)
}

function scrollHeatmapToLatestOnTouch(container) {
  const scroll = container?.querySelector?.('.heatmap-scroll')
  if (!scroll || !window.matchMedia?.('(pointer: coarse)').matches) return
  requestAnimationFrame(() => {
    scroll.scrollLeft = scroll.scrollWidth
  })
}

function toggleHeatmapTooltip(event) {
  const target = event.currentTarget
  const tooltip = document.getElementById('heatmapTooltip')
  if (!target || !tooltip) return
  event.stopPropagation()
  if (tooltip.classList.contains('show') && tooltip._target === target) {
    hideHeatmapTooltip()
    return
  }
  showHeatmapTooltip(event)
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
  tooltip._target = target
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
  tooltip._target = null
  tooltip.classList.remove('show')
}

function hideHeatmapTooltipOnOutsideClick(event) {
  const tooltip = document.getElementById('heatmapTooltip')
  if (!tooltip?.classList.contains('show')) return
  if (event.target?.closest?.('.heatmap-day') || tooltip.contains(event.target)) return
  hideHeatmapTooltip()
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
  const goalHours    = normalizeWeeklyGoalHours(s.config.weeklyGoalHours)
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

function formatWeeklyWatchedTime(secs) {
  if (secs < 3600) {
    const minutes = secs > 0 ? Math.max(1, Math.floor(secs / 60)) : 0
    return `${minutes}m`
  }
  return `${(secs / 3600).toFixed(1)}h`
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
  return getCityScoreThroughDate(s, getCurrentAppDate(s))
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
  document.getElementById('weekLabel').textContent  = getWeekLabel(s)
  document.getElementById('streakCount').textContent = s.streak.current
  const pill = document.getElementById('streakDisplay')
  pill.classList.toggle('alive', isStreakAlive(s))
}

function renderAnalytics(stats, s) {
  document.getElementById('hoursWatched').textContent    = formatWeeklyWatchedTime(stats.secondsWatched)
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

function renderHistoryPeriodPopover(range, popoverId, state) {
  const options = range === selectedHistoryRange ? syncHistoryPeriodSelection(state) : getHistoryPeriodOptions(state, range)
  const popover = document.getElementById(popoverId)
  if (!popover) return
  popover.innerHTML = options.length
    ? options.map(option => `
        <button type="button" class="history-period-option ${selectedHistoryPeriod[range] === option.key ? 'active' : ''}" onclick="setHistoryPeriodForRange('${range}', '${escHtml(option.key)}')" aria-pressed="${selectedHistoryPeriod[range] === option.key}">
          ${escHtml(option.label)}
        </button>
      `).join('')
    : '<span class="history-period-empty">No activity yet</span>'
}

function toggleHistoryPeriodPopover(event, range) {
  event.stopPropagation()
  selectedHistoryRange = HISTORY_RANGES.includes(range) ? range : 'week'
  const cell = event.currentTarget.closest('.history-period-cell')
  if (!cell) return
  const shouldOpen = !cell.classList.contains('open')
  closeManualVideoPopover()
  closeHistoryVideoPopovers()
  closeHistoryPeriodPopovers(cell)
  cell.classList.toggle('open', shouldOpen)
  event.currentTarget.setAttribute('aria-expanded', String(shouldOpen))
  renderStudyHistoryPanel(loadState())
}

function closeHistoryPeriodPopovers(exceptCell = null) {
  document.querySelectorAll('.history-period-cell.open').forEach(cell => {
    if (cell === exceptCell) return
    cell.classList.remove('open')
    cell.querySelector('.history-range-btn')?.setAttribute('aria-expanded', 'false')
  })
}

function closeHistoryPeriodPopoversOnOutsideClick(event) {
  if (event.target.closest('.history-period-cell')) return
  closeHistoryPeriodPopovers()
}

function closeHistoryPeriodPopoversOnEscape(event) {
  if (event.key !== 'Escape') return
  closeHistoryPeriodPopovers()
}

function setHistoryPeriodForRange(range, periodKey) {
  selectedHistoryRange = HISTORY_RANGES.includes(range) ? range : 'week'
  selectedHistoryPeriod[selectedHistoryRange] = periodKey || null
  closeHistoryPeriodPopovers()
  renderStudyHistoryPanel(loadState())
}

function setHistoryView(view) {
  selectedHistoryView = view === 'heatmap' ? 'heatmap' : 'summary'
  renderStudyHistoryPanel(loadState())
}

function setDefaultCityDayOffset(state) {
  selectedCityDayOffset = IS_SANDBOX ? getLastCityDayOffset(state) : 0
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
  updatePersistentCityLevel(s, score)
  const snapshot = getCitySnapshot(score, s)
  renderCitySnapshot(snapshot, s, true)
}

function renderCitySnapshot(snapshot, s, includeTimeline = true) {
  document.getElementById('cityScore').textContent = snapshot.score
  document.getElementById('cityLabel').textContent = getCityStage(snapshot.visualScore)
  const scoreContext = document.getElementById('cityScoreContext')
  if (scoreContext) scoreContext.textContent = snapshot.isToday ? 'total pts' : 'pts by then'
  const nextLevel = CITY_LEVELS[snapshot.pendingLevelIndex || snapshot.visualLevelIndex + 1] || null
  const hasEarnedUnrevealedLevel = snapshot.earnedLevelIndex > snapshot.visualLevelIndex
  document.getElementById('cityNextLevel').textContent = nextLevel
    ? snapshot.hasPendingLevel || hasEarnedUnrevealedLevel
      ? 'Ready for next level'
      : `${nextLevel.threshold - snapshot.score} pts to next level`
    : 'Max level'
  if (includeTimeline) renderLevelUpButton(snapshot)

  if (includeTimeline) renderCityTimeControls(snapshot)
  updateCityMilestoneImage(snapshot.visualScore)
}

function getCitySnapshot(currentScore, s) {
  selectedCityDayOffset = clampCityDayOffset(s, selectedCityDayOffset)
  const date = addDays(new Date(), selectedCityDayOffset)
  const isToday = toDateKey(date) === getCurrentAppDateKey(s)
  const minOffset = getFirstCityDayOffset(s)
  const maxOffset = getLastCityDayOffset(s)
  if (isToday) {
    normalizeCityProgress(s)
    const visualLevelIndex = s.cityProgress.maxLevelIndex
    return {
      date,
      isToday,
      minOffset,
      maxOffset,
      score: currentScore,
      visualLevelIndex,
      visualScore: getCityScoreForLevelIndex(visualLevelIndex),
      earnedLevelIndex: getCityLevelIndex(currentScore),
      pendingLevelIndex: s.cityProgress?.pendingLevelIndex ?? null,
      hasPendingLevel: Number.isInteger(s.cityProgress?.pendingLevelIndex) && s.cityProgress.pendingLevelIndex > visualLevelIndex
    }
  }

  const score = getCityScoreThroughDate(s, date)
  const revealedLevelIndex = Number.isInteger(s.cityProgress?.maxLevelIndex)
    ? s.cityProgress.maxLevelIndex
    : 0
  const visualLevelIndex = Math.min(getHistoricMaxCityLevelIndex(s, date), revealedLevelIndex)
  return {
    date,
    isToday,
    minOffset,
    maxOffset,
    score,
    visualLevelIndex,
    visualScore: getCityScoreForLevelIndex(visualLevelIndex),
    earnedLevelIndex: getCityLevelIndex(score),
    pendingLevelIndex: s.cityProgress?.pendingLevelIndex ?? null,
    hasPendingLevel: Number.isInteger(s.cityProgress?.pendingLevelIndex) && s.cityProgress.pendingLevelIndex > revealedLevelIndex
  }
}

function updatePersistentCityLevel(s, score) {
  const previous = JSON.stringify(s.cityProgress || {})
  normalizeCityProgress(s)
  const earnedLevelIndex = getCityLevelIndex(score)
  if (earnedLevelIndex < s.cityProgress.maxLevelIndex) {
    s.cityProgress.maxLevelIndex = earnedLevelIndex
    s.cityProgress.pendingLevelIndex = null
  } else if (earnedLevelIndex > s.cityProgress.maxLevelIndex) {
    const nextLevelIndex = s.cityProgress.maxLevelIndex + 1
    s.cityProgress.pendingLevelIndex = Math.min(
      Math.max(s.cityProgress.pendingLevelIndex || nextLevelIndex, nextLevelIndex),
      earnedLevelIndex
    )
  } else if (
    s.cityProgress.pendingLevelIndex &&
    (s.cityProgress.pendingLevelIndex <= s.cityProgress.maxLevelIndex || s.cityProgress.pendingLevelIndex > earnedLevelIndex)
  ) {
    s.cityProgress.pendingLevelIndex = null
  }
  s.cityProgress.scoringVersion = SCORING_RULES_VERSION
  if (JSON.stringify(s.cityProgress) !== previous) {
    saveState(s)
  }
  return s.cityProgress.maxLevelIndex
}

function renderLevelUpButton(snapshot) {
  const button = document.getElementById('levelUpButton')
  if (!button) return
  button.classList.toggle('show', !!snapshot.hasPendingLevel)
  button.disabled = !snapshot.hasPendingLevel
  button.setAttribute('aria-hidden', String(!snapshot.hasPendingLevel))
}

function claimCityLevelUp() {
  const s = loadState()
  if (!s) return
  normalizeCityProgress(s)
  const earnedLevelIndex = getCityLevelIndex(getCurrentCityScore(s))
  const pendingLevelIndex = Math.min(
    s.cityProgress.pendingLevelIndex || s.cityProgress.maxLevelIndex + 1,
    earnedLevelIndex
  )
  if (pendingLevelIndex <= s.cityProgress.maxLevelIndex) return

  s.cityProgress.maxLevelIndex = clampNumber(pendingLevelIndex, 0, CITY_LEVELS.length - 1)
  s.cityProgress.pendingLevelIndex = null
  saveState(s)
  renderAll(s)
  showToast(`Level up! ${CITY_LEVELS[s.cityProgress.maxLevelIndex].label}`, 'success')
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

function getCityScoreThroughDate(s, date) {
  const firstDateKey = getFirstStudyActionDateKey(s)
  const start = firstDateKey ? dateKeyToLocalDate(firstDateKey) : new Date(0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  const history = getStudyHistoryBetween(s || { videos: {}, anki: {} }, start, end)
  return history.rows.reduce((total, row) => total + getHistoryDayPoints(row), 0)
}

function getHistoricMaxCityLevelIndex(s, endDate = new Date()) {
  return getCityLevelIndex(getCityScoreThroughDate(s, endDate))
}

function renderCityTimeControls(snapshot) {
  const waveform = document.getElementById('cityTimeWaveform')
  const bars = document.getElementById('cityWaveBars')
  const track = document.getElementById('cityWaveTrack')
  const tooltip = document.getElementById('cityWaveTooltip')
  if (!waveform || !bars || !track || !tooltip) return

  const state = loadState()
  const rowsByDate = getCityHistoryRowsByDate(state)
  const days = getCityWaveformDays(snapshot.minOffset, snapshot.maxOffset)
  const levelChangeDates = getCityWaveformLevelChangeDates(state, days)
  const selectedIndex = days.findIndex(day => day.offset === selectedCityDayOffset)

  track.innerHTML = days.map((day, index) => {
    const row = rowsByDate.get(day.dateKey)
    const points = row ? getHistoryDayPoints(row) : 0
    const height = 8 + Math.min(20, points * 2)
    const label = formatCitySnapshotDate(day.date)
    const hasLevelChange = levelChangeDates.has(day.dateKey)
    const ariaLabel = `${label}, ${points} pts${hasLevelChange ? ', city image changed' : ''}`
    return `
      <button class="city-wave-bar ${points > 0 ? 'has-activity' : ''} ${hasLevelChange ? 'has-level-change' : ''} ${index === selectedIndex ? 'selected' : ''}"
        type="button"
        data-index="${index}"
        data-offset="${day.offset}"
        data-label="${escHtml(label)}"
        style="--bar-height:${height}px; --hover-boost:0px"
        aria-label="${escHtml(ariaLabel)}"
        onclick="selectCityWaveBar(this)"
        onmouseenter="previewCityWaveBar(this)"
        onmousemove="previewCityWaveBar(this)"
        onfocus="previewCityWaveBar(this)"></button>
    `
  }).join('')

  updateCityWaveformScrollState()
  const selectedBar = track.querySelector('.city-wave-bar.selected')
  if (selectedBar) {
    centerCityWaveBar(selectedBar)
    positionCityWaveTooltip(selectedBar)
  }
}

function getCityWaveformLevelChangeDates(s, days) {
  const changeDates = new Set()
  if (!s || !days.length) return changeDates

  const revealedLevelIndex = Number.isInteger(s.cityProgress?.maxLevelIndex)
    ? s.cityProgress.maxLevelIndex
    : 0
  let previousLevelIndex = null

  days.forEach(day => {
    const historicLevelIndex = getHistoricMaxCityLevelIndex(s, day.date)
    const visualLevelIndex = Math.min(historicLevelIndex, revealedLevelIndex)
    if (previousLevelIndex !== null && visualLevelIndex > previousLevelIndex) {
      changeDates.add(day.dateKey)
    }
    previousLevelIndex = visualLevelIndex
  })

  return changeDates
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

function selectCityWaveBar(bar) {
  const offset = parseInt(bar?.dataset?.offset, 10)
  if (!Number.isFinite(offset)) return
  setCityDayOffset(offset)

  const waveform = document.getElementById('cityTimeWaveform')
  const selected = waveform?.querySelector(`.city-wave-bar[data-offset="${offset}"]`)
  if (!waveform || !selected) return

  previewCityWaveBar(selected, { persist: true })
  waveform.classList.add('has-touch-preview')
  clearTimeout(selectCityWaveBar._timer)
  selectCityWaveBar._timer = setTimeout(() => {
    waveform.classList.remove('has-touch-preview')
  }, 2600)
}

function handleCityWaveformMouseMove(event) {
  const waveform = document.getElementById('cityTimeWaveform')
  const bars = document.getElementById('cityWaveBars')
  cityWaveformScroll.pointerX = event.clientX
  cityWaveformScroll.pointerY = event.clientY
  if (!waveform || !bars || bars.scrollWidth <= bars.clientWidth) {
    stopCityWaveformAutoScroll()
    return
  }

  const rect = waveform.getBoundingClientRect()
  const edgeSize = Math.min(28, rect.width * 0.24)
  const leftDistance = event.clientX - rect.left
  const rightDistance = rect.right - event.clientX

  let speed = 0
  if (leftDistance >= 0 && leftDistance < edgeSize) {
    speed = -getCityWaveformEdgeSpeed(leftDistance, edgeSize)
  } else if (rightDistance >= 0 && rightDistance < edgeSize) {
    speed = getCityWaveformEdgeSpeed(rightDistance, edgeSize)
  }

  cityWaveformScroll.speed = speed
  if (cityWaveformScroll.speed === 0) {
    stopCityWaveformAutoScroll()
  } else {
    startCityWaveformAutoScroll()
  }
}

function getCityWaveformEdgeSpeed(distance, edgeSize) {
  const intensity = 1 - clampNumber(distance / edgeSize, 0, 1)
  if (intensity <= 0) return 0
  return 1.5 + (intensity * intensity * 7)
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
      previewCityWaveformBarAtPointer()
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

  const barRect = bar.getBoundingClientRect()
  const barsRect = bars.getBoundingClientRect()
  const barLeftInScroll = barRect.left - barsRect.left + bars.scrollLeft
  const targetLeft = barLeftInScroll - (bars.clientWidth / 2) + (barRect.width / 2)
  const maxScroll = bars.scrollWidth - bars.clientWidth
  bars.scrollLeft = clampNumber(targetLeft, 0, maxScroll)
}

function previewCityWaveformBarAtPointer() {
  const bars = document.getElementById('cityWaveBars')
  const target = document.elementFromPoint(cityWaveformScroll.pointerX, cityWaveformScroll.pointerY)
  const directBar = target?.closest?.('.city-wave-bar')
  const bar = directBar && bars?.contains(directBar)
    ? directBar
    : getClosestCityWaveBarAtPointer(bars)
  if (!bar || !bars?.contains(bar)) return
  previewCityWaveBar(bar, { persist: true })
}

function getClosestCityWaveBarAtPointer(bars) {
  if (!bars) return null
  const pointerX = cityWaveformScroll.pointerX
  const pointerY = cityWaveformScroll.pointerY
  const barsRect = bars.getBoundingClientRect()
  if (pointerX < barsRect.left || pointerX > barsRect.right || pointerY < barsRect.top || pointerY > barsRect.bottom) return null

  return Array.from(bars.querySelectorAll('.city-wave-bar'))
    .filter(bar => {
      const rect = bar.getBoundingClientRect()
      return rect.right >= barsRect.left && rect.left <= barsRect.right
    })
    .reduce((closest, bar) => {
      const rect = bar.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const distance = Math.abs(pointerX - center)
      return !closest || distance < closest.distance ? { bar, distance } : closest
    }, null)?.bar || null
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
  document.getElementById('cityTimeWaveform')?.classList.remove('has-touch-preview')
  document.querySelectorAll('.city-wave-bar').forEach(bar => {
    bar.style.setProperty('--hover-boost', '0px')
  })
  const selected = document.querySelector('.city-wave-bar.selected')
  if (selected) positionCityWaveTooltip(selected)
  const state = loadState()
  if (state) renderCity(getCurrentCityScore(state), state)
}

function clearCityWaveformPreviewOnOutsideClick(event) {
  if (event.target?.closest?.('.city-time-waveform')) return
  const waveform = document.getElementById('cityTimeWaveform')
  if (!waveform?.classList.contains('has-touch-preview')) return
  clearCityWaveformPreview()
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
    const zoomDelta = getCityImageWheelZoomDelta(event)
    if (!canZoomCityImageBy(zoomDelta)) return
    event.preventDefault()
    zoomCityImageBy(zoomDelta, event)
  }, { passive: false })

  wrap.addEventListener('pointerdown', event => {
    if (event.target.closest('button, .city-time-waveform')) return
    if (event.pointerType === 'touch' && cityImageView.scale <= 1) return
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

function getCityImageWheelZoomDelta(event) {
  if (!event.deltaY) return 0
  return event.deltaY > 0 ? -getWheelZoomAmount(event) : getWheelZoomAmount(event)
}

function canZoomCityImageBy(delta) {
  if (!delta) return false
  const nextScale = clampNumber(
    cityImageView.scale + delta,
    CITY_IMAGE_MIN_ZOOM,
    CITY_IMAGE_MAX_ZOOM
  )
  return nextScale !== cityImageView.scale
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
  document.querySelector('.city-image-wrap')?.classList.toggle('is-zoomed', cityImageView.scale > 1)
  image.style.transform = `translate(${cityImageView.x}px, ${cityImageView.y}px) scale(${cityImageView.scale})`
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function preloadCityImages() {
  CITY_IMAGE_PATHS.forEach(preloadCityImage)
}

function preloadCityImage(src) {
  if (!src) return null
  const cached = cityImagePreloadCache.get(src)
  if (cached) return cached

  const img = new Image()
  const promise = new Promise(resolve => {
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
  })
  img.src = src

  const entry = { img, promise }
  cityImagePreloadCache.set(src, entry)
  return entry
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

  image.dataset.cityTargetSrc = nextSrc
  const applyImage = () => {
    if (image.dataset.cityTargetSrc !== nextSrc) return
    image.dataset.citySrc = nextSrc
    image.classList.remove('loading')
    image.src = nextSrc
  }

  const preload = preloadCityImage(nextSrc)
  if (preload?.img.complete && preload.img.naturalWidth > 0) {
    applyImage()
  } else {
    preload?.promise.then(loaded => {
      if (loaded) applyImage()
    })
  }

  const preloadSrc = CITY_IMAGE_PATHS[imageIndex + 1]
  if (preloadSrc) preloadCityImage(preloadSrc)
}

function renderFeed(s) {
  renderChannelFilterOptions(s)

  const statusFilter = selectedStatusFilter
  const grid   = document.getElementById('videoGrid')
  const watchedSection = document.getElementById('watchedSection')
  const watchedGrid = document.getElementById('watchedGrid')
  const watchedCount = document.getElementById('watchedCount')
  if (!grid || !watchedSection || !watchedGrid || !watchedCount) return

  const allVideos = Object.values(s.videos)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  const channelFilters = getSelectedChannelFilters(s)
  renderStatusFilterOptions(allVideos, channelFilters)

  const activeVideos = getVisibleActiveVideos(allVideos)
    .filter(v => ['all', 'watch-later', 'unwatched', 'partial'].includes(statusFilter) && (statusFilter === 'all' || getVideoStatus(v) === statusFilter))
    .filter(v => matchesChannelFilter(v, channelFilters))

  const watchedVideos = allVideos
    .filter(v => getVideoStatus(v) === 'watched')
    .filter(v => matchesChannelFilter(v, channelFilters))

  if (!activeVideos.length) {
    const channelMsg = channelFilters.size === getChannelFilterEntries(s).length ? '' : ' for the selected channels'
    const filterName = statusFilter === 'partial' ? 'in-progress' : statusFilter === 'watch-later' ? 'watch later' : statusFilter
    const msg = statusFilter === 'all' && watchedVideos.length
      ? 'No active videos right now. Watched videos are below.'
      : statusFilter === 'all' && !channelMsg
      ? 'No videos yet. Edenia loads your feed automatically.'
      : `No ${statusFilter === 'all' ? 'active' : filterName} videos${channelMsg} right now.`
    grid.innerHTML = `<div class="empty-state">${msg}</div>`
  } else {
    grid.innerHTML = activeVideos.map(v => renderCard(v)).join('')
  }

  watchedCount.textContent = watchedVideos.length
  watchedSection.classList.toggle('hidden', !watchedVideos.length)
  watchedGrid.innerHTML = watchedVideos.map(v => renderCard(v, true)).join('')
}

function renderUndoButton(s) {
  renderHistoryActionButton({
    buttonId: 'undoBtn',
    tooltipId: 'undoTooltip',
    actions: Array.isArray(s.undoStack) ? s.undoStack : [],
    state: s,
    label: 'Undo',
    emptyTitle: 'Nothing to undo',
    queueTitle: 'Undo queue',
    titleVerb: 'Undo latest video status change',
    direction: 'undo'
  })
  renderHistoryActionButton({
    buttonId: 'redoBtn',
    tooltipId: 'redoTooltip',
    actions: Array.isArray(s.redoStack) ? s.redoStack : [],
    state: s,
    label: 'Redo',
    emptyTitle: 'Nothing to redo',
    queueTitle: 'Redo queue',
    titleVerb: 'Redo latest video status change',
    direction: 'redo'
  })
}

function renderHistoryActionButton({ buttonId, tooltipId, actions, state, label, emptyTitle, queueTitle, titleVerb, direction }) {
  const btn = document.getElementById(buttonId)
  const tooltip = document.getElementById(tooltipId)
  if (!btn) return
  const count = actions.length
  const canUse = count > 0
  const wrap = btn.closest('.undo-action-wrap')
  btn.disabled = !canUse
  btn.textContent = count > 1 ? `${label} (${count})` : label
  btn.title = canUse ? `${titleVerb} (${count} available)` : emptyTitle
  if (!canUse) wrap?.classList.remove('open')
  btn.setAttribute('aria-expanded', String(Boolean(canUse && wrap?.classList.contains('open'))))
  if (tooltip) tooltip.innerHTML = renderHistoryActionTooltip(actions, state, emptyTitle, queueTitle, direction)
}

function renderHistoryActionTooltip(actions, s, emptyTitle, queueTitle, direction) {
  const indexedActions = Array.isArray(actions)
    ? actions.map((action, index) => ({ action, index })).reverse()
    : []
  if (!indexedActions.length) {
    return `<div class="undo-tooltip-title">${escHtml(emptyTitle)}</div>`
  }

  const visibleActions = indexedActions.slice(0, 8)
  const hiddenCount = indexedActions.length - visibleActions.length
  return `
    <div class="undo-tooltip-title">${escHtml(queueTitle)}</div>
    ${visibleActions.map(entry => renderHistoryActionTooltipItem(entry, s, direction)).join('')}
    ${hiddenCount > 0 ? `<div class="undo-tooltip-more">+ ${hiddenCount} older ${hiddenCount === 1 ? 'action' : 'actions'}</div>` : ''}
  `
}

function renderHistoryActionTooltipItem(entry, s, direction) {
  const { action, index } = entry
  const video = s.videos?.[action.videoId]
  const title = video?.title || 'Unavailable video'
  const timestamp = formatHistoryActionTimestamp(action)
  const fromStatus = direction === 'redo'
    ? formatVideoStatus(action.before?.status)
    : formatVideoStatus(action.after?.status || video?.status)
  const toStatus = direction === 'redo'
    ? formatVideoStatus(action.after?.status)
    : formatVideoStatus(action.before?.status)
  const actionText = direction === 'redo'
    ? `${fromStatus} → ${toStatus}`
    : `${fromStatus} → back to ${toStatus}`
  return `
    <button type="button" class="undo-tooltip-item undo-tooltip-action-btn" onclick="applyHistoryAction('${direction}', ${index})">
      <span class="undo-tooltip-video">${escHtml(title)}</span>
      <span class="undo-tooltip-action">${escHtml(actionText)}</span>
      <span class="undo-tooltip-time">${escHtml(timestamp)}</span>
    </button>
  `
}

function formatHistoryActionTimestamp(action) {
  if (!action?.createdAt) return 'Time unavailable'
  const date = new Date(action.createdAt)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return `Done ${date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`
}

function toggleHistoryActionPopover(event, direction) {
  event.stopPropagation()
  const btn = event.currentTarget
  if (!btn || btn.disabled) return
  const wrap = btn.closest('.undo-action-wrap')
  if (!wrap) return
  const shouldOpen = !wrap.classList.contains('open')
  closeStatusFilterMenu()
  closeChannelFilterMenu()
  closeManualVideoPopover()
  closeHistoryVideoPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryActionPopovers(wrap)
  wrap.classList.toggle('open', shouldOpen)
  btn.setAttribute('aria-expanded', String(shouldOpen))
}

function closeHistoryActionPopovers(exceptWrap = null) {
  document.querySelectorAll('.undo-action-wrap.open').forEach(wrap => {
    if (wrap === exceptWrap) return
    wrap.classList.remove('open')
    wrap.querySelector('.undo-btn')?.setAttribute('aria-expanded', 'false')
  })
}

function closeHistoryActionPopoversOnOutsideClick(event) {
  if (event.target.closest('.undo-action-wrap')) return
  closeHistoryActionPopovers()
}

function closeHistoryActionPopoversOnEscape(event) {
  if (event.key !== 'Escape') return
  closeHistoryActionPopovers()
}

function renderStatusFilterOptions(allVideos = [], channelFilters = null) {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return

  const counts = getStatusFilterCounts(allVideos, channelFilters)
  btn.textContent = getStatusFilterLabel(selectedStatusFilter)
  menu.innerHTML = STATUS_FILTERS.map(([value, label]) => `
    <label class="channel-filter-option status-filter-option">
      <input type="radio" name="statusFilter" data-status="${value}" ${selectedStatusFilter === value ? 'checked' : ''} onchange="setStatusFilter(this.dataset.status)">
      <span class="status-filter-label">${label}</span>
      <span class="status-filter-count">${counts[value] ?? 0}</span>
    </label>
  `).join('')
  if (!menu.classList.contains('hidden')) positionFilterMenuWithinViewport(menu)
}

function getStatusFilterCounts(allVideos = [], channelFilters = null) {
  const selectedChannels = channelFilters || new Set()
  const matchesSelection = video => !channelFilters || matchesChannelFilter(video, selectedChannels)
  const activeVideos = getVisibleActiveVideos(allVideos).filter(matchesSelection)
  const counts = Object.fromEntries(STATUS_FILTERS.map(([value]) => [value, 0]))

  activeVideos.forEach(video => {
    const status = getVideoStatus(video)
    if (status !== 'watched') counts[status] += 1
  })

  counts.all = activeVideos.length

  return counts
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
  closeManualVideoPopover()
  const isOpen = menu.classList.toggle('hidden') === false
  btn.setAttribute('aria-expanded', String(isOpen))
  if (isOpen) positionFilterMenuWithinViewport(menu)
}

function closeStatusFilterMenu() {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
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
    ? entries.map(([id, name]) => {
      const refreshLabel = formatChannelLastRefreshLabel(s, id)
      const refreshTitle = formatChannelLastRefreshTitle(s, id)
      return `
      <label class="channel-filter-option" data-channel-id="${escHtml(id)}" onclick="handleChannelFilterOptionClick(event, this.dataset.channelId)">
        <input type="checkbox" data-channel-id="${escHtml(id)}" ${selected.has(id) ? 'checked' : ''} onchange="setChannelFilter(this.dataset.channelId, this.checked)">
        <span class="channel-filter-label">${escHtml(name)}</span>
        <span class="channel-filter-refresh" title="${escHtml(refreshTitle)}">${escHtml(refreshLabel)}</span>
      </label>
    `
    }).join('')
    : '<div class="channel-filter-empty">No channels yet</div>'
  menu.dataset.selectedCount = selectedCount
  if (!menu.classList.contains('hidden')) positionFilterMenuWithinViewport(menu)
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

function handleChannelFilterOptionClick(event, channelId) {
  if (!event?.altKey) return
  event.preventDefault()
  event.stopPropagation()
  selectOnlyChannelFilter(channelId)
}

function selectOnlyChannelFilter(channelId) {
  const s = loadState()
  const ids = new Set(getChannelFilterEntries(s).map(([id]) => id))
  if (!ids.has(channelId)) return
  selectedChannelFilters = new Set([channelId])
  renderFeed(s)
}

function toggleChannelFilterMenu() {
  const btn = document.getElementById('channelFilterBtn')
  const menu = document.getElementById('channelFilterMenu')
  if (!btn || !menu || btn.disabled) return
  closeStatusFilterMenu()
  closeManualVideoPopover()
  const isOpen = menu.classList.toggle('hidden') === false
  btn.setAttribute('aria-expanded', String(isOpen))
  if (isOpen) positionFilterMenuWithinViewport(menu)
}

function closeChannelFilterMenu() {
  const btn = document.getElementById('channelFilterBtn')
  const menu = document.getElementById('channelFilterMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
  btn.setAttribute('aria-expanded', 'false')
}

function toggleManualVideoPopover(event) {
  event.stopPropagation()
  const btn = document.getElementById('manualVideoBtn')
  const menu = document.getElementById('manualVideoPopover')
  const input = document.getElementById('manualVideoUrlInput')
  if (!btn || !menu) return
  closeStatusFilterMenu()
  closeChannelFilterMenu()
  closeHistoryActionPopovers()
  const isOpen = menu.classList.toggle('hidden') === false
  btn.setAttribute('aria-expanded', String(isOpen))
  if (isOpen) {
    positionFilterMenuWithinViewport(menu)
    setTimeout(() => input?.focus(), 0)
  }
}

function closeManualVideoPopover() {
  const btn = document.getElementById('manualVideoBtn')
  const menu = document.getElementById('manualVideoPopover')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
  btn.setAttribute('aria-expanded', 'false')
}

function positionFilterMenuWithinViewport(menu) {
  if (!menu || menu.classList.contains('hidden')) return
  menu.style.left = '0px'
  const margin = 12
  const rect = menu.getBoundingClientRect()
  let shift = 0

  if (rect.right > window.innerWidth - margin) {
    shift = window.innerWidth - margin - rect.right
  }
  if (rect.left + shift < margin) {
    shift += margin - (rect.left + shift)
  }

  menu.style.left = `${Math.round(shift)}px`
}

function closeChannelFilterMenuOnOutsideClick(event) {
  const channelFilter = document.getElementById('channelFilter')
  const statusFilter = document.getElementById('statusFilter')
  if (channelFilter?.contains(event.target) || statusFilter?.contains(event.target)) return
  closeStatusFilterMenu()
  closeChannelFilterMenu()
}

function closeManualVideoPopoverOnOutsideClick(event) {
  if (event.target.closest('.manual-video')) return
  closeManualVideoPopover()
}

function closeManualVideoPopoverOnEscape(event) {
  if (event.key !== 'Escape') return
  closeManualVideoPopover()
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
    const priorityDiff = (statusPriority[getVideoStatus(b)] || 0) - (statusPriority[getVideoStatus(a)] || 0)
    if (priorityDiff) return priorityDiff
    return new Date(b.publishedAt) - new Date(a.publishedAt)
  }

  videos
    .filter(v => getVideoStatus(v) !== 'watched')
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
  const status = getVideoStatus(v)
  const videoId = String(v.id ?? '')
  const safeVideoId = escHtml(videoId)
  const videoUrl = escHtml(`https://youtube.com/watch?v=${encodeURIComponent(videoId)}`)
  const isWatched = status === 'watched'
  const isPartial = status === 'partial'
  const isWatchLater = status === 'watch-later'
  const watchedNextStatus = isWatched ? 'unwatched' : 'watched'
  const partialNextStatus = isPartial ? 'unwatched' : 'partial'
  const watchLaterNextStatus = isWatchLater ? 'unwatched' : 'watch-later'
  const watchedLabel = compact ? 'Unmark' : `✓ ${isWatched ? 'Watched' : 'Mark watched'}`
  const watchedAtLabel = compact && v.watchedAt ? formatWatchedAt(v.watchedAt) : ''
  const resumeAtValue = isPartial ? formatResumeTimestamp(v.resumeAtSeconds) : ''
  return `
    <div class="video-card ${compact ? 'compact-card' : ''} status-${status}" data-video-id="${safeVideoId}">
      <a href="${videoUrl}" target="_blank" rel="noopener" class="thumb-link" data-video-id="${safeVideoId}" onclick="markVideoInProgressOnOpen(this.dataset.videoId)">
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
        <div class="card-copy">
          <div class="card-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
          ${watchedAtLabel ? `<div class="card-watched-at">${escHtml(watchedAtLabel)}</div>` : ''}
          ${isPartial ? `
            <label class="resume-time-field">
              <span>Continue at</span>
              <input type="text"
                value="${escHtml(resumeAtValue)}"
                placeholder="0:00"
                inputmode="text"
                data-video-id="${safeVideoId}"
                onchange="saveVideoResumeTime(this.dataset.videoId, this.value)"
                onkeydown="if (event.key === 'Enter') this.blur()"
                aria-label="Continue watching timestamp">
            </label>
          ` : ''}
        </div>
        <div class="card-meta">
          <span class="channel-name">${escHtml(v.channelTitle || '')}</span>
          <span class="pub-ago">${timeAgo(v.publishedAt)}</span>
        </div>
        <div class="card-actions">
          <button class="action-btn ${isWatched ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${watchedNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            title="${isWatched ? 'Unmark' : 'Mark as watched'}">
            ${watchedLabel}
          </button>
          <button class="action-btn partial-btn ${isPartial ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${partialNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            title="${isPartial ? 'Clear' : 'Mark as in progress'}">⏸</button>
          <button class="action-btn watch-later-btn ${isWatchLater ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${watchLaterNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
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

function show(id) { document.getElementById(id).classList.remove('hidden') }
function hide(id) { document.getElementById(id).classList.add('hidden') }

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init)
document.addEventListener('click', closeChannelFilterMenuOnOutsideClick)
document.addEventListener('click', closeHistoryVideoPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryPeriodPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryActionPopoversOnOutsideClick)
document.addEventListener('click', closeManualVideoPopoverOnOutsideClick)
document.addEventListener('click', hideHeatmapTooltipOnOutsideClick)
document.addEventListener('click', clearCityWaveformPreviewOnOutsideClick)
document.addEventListener('keydown', closeHistoryVideoPopoversOnEscape)
document.addEventListener('keydown', closeHistoryPeriodPopoversOnEscape)
document.addEventListener('keydown', closeHistoryActionPopoversOnEscape)
document.addEventListener('keydown', closeManualVideoPopoverOnEscape)
document.addEventListener('keydown', closeSettingsOnEscape)
if (!IS_SANDBOX) document.addEventListener('visibilitychange', refreshAnkiStatsOnVisible)
