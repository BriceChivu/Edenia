/* ═══════════════════════════════════════════════════════════
   STUDY BUILD — app.js
   All logic: state, YouTube API, streak, Anki, city, rendering
═══════════════════════════════════════════════════════════ */

// Pre-loaded channels (update names via Settings after first refresh)
const DEFAULT_CHANNELS = [
  { id: 'UCfsNycNoClXZA1FuUJSGT0w', name: 'Channel 1' },
  { id: 'UCIhaNRLn4OQDWZJiVvdhl5A', name: 'Channel 2' },
  { id: 'UCVBf2Zflj4WabkdCvEAFWew', name: 'Channel 3' },
]

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

const STORAGE_KEY = 'studybuild_v1'
const CONFIG_COOKIE_KEY = 'studybuild_config'
const DEFAULT_API_KEY = 'AIzaSyAVmsqp-5o1ufYCuMak38jigQRHFhf0g1Y'
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const ACTIVE_VIDEOS_PER_CHANNEL = 5
const FETCH_PAGE_SIZE = 50
const MAX_FETCH_PAGES_PER_CHANNEL = 10
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
const CITY_LEVELS = [
  { threshold: 0, label: '🌑 Empty land' },
  { threshold: 5, label: '🌱 First tree' },
  { threshold: 12, label: '🌲 Two trees' },
  { threshold: 20, label: '🏡 Farmhouse — goal hit!' },
  { threshold: 28, label: 'Farm wagon' },
  { threshold: 35, label: '🌾 Barn built' },
  { threshold: 45, label: 'Horse cart' },
  { threshold: 50, label: '🪣 Homestead' },
  { threshold: 65, label: '🏠 Two houses' },
  { threshold: 75, label: 'Timber crane' },
  { threshold: 85, label: '⚙️ Windmill rising' },
  { threshold: 100, label: '🏘️ Full village' }
]
const PEASANT_POSITIONS = [
  [118, 222], [176, 220], [254, 224], [340, 222], [430, 222], [518, 222],
  [606, 222], [694, 222], [782, 223], [738, 216], [650, 216], [560, 218],
  [470, 219], [382, 218], [294, 217], [204, 218], [138, 226], [244, 226],
  [348, 226], [452, 226], [556, 226], [660, 226], [760, 226], [820, 224]
]
let ankiStatsCache = null

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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw)
      if (state?.config && !state.config.apiKey) state.config.apiKey = DEFAULT_API_KEY
      return state
    }
  } catch {}

  const fallback = loadConfigCookie()
  if (fallback?.apiKey) {
    return defaultState(fallback.apiKey, fallback.weeklyGoalHours || 4, fallback.channels)
  }

  return null
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  saveConfigCookie(s.config)
}

function defaultState(apiKey, goalHours, channels) {
  return {
    config: {
      apiKey: apiKey || DEFAULT_API_KEY,
      weeklyGoalHours: goalHours || 4,
      channels: channels?.length ? channels.map(c => ({ ...c })) : DEFAULT_CHANNELS.map(c => ({ ...c }))
    },
    videos:  {},   // { [videoId]: VideoRecord }
    streak:  { current: 0, longest: 0, lastActivityDate: null },
    anki:    {},   // { 'YYYY-MM-DD': { reviewed, created } }
    nightVisuals: null,
    lastFetched: null
  }
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

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86_400_000)
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
    state = defaultState('', 4, DEFAULT_CHANNELS)
    saveState(state)
  }

  show('mainApp')
  renderAll(state)
  startCityClock()
  refreshAnkiStats({ silent: true })
  if (!state.lastFetched) showToast('Add or edit channels in ⚙ Settings, then hit ↻ Refresh', 'warn')
}

function openSettings() {
  const s = loadState()
  document.getElementById('settingsApiKey').value = s.config.apiKey
  document.getElementById('settingsGoal').value   = s.config.weeklyGoalHours
  renderChannelList(s.config.channels)
  show('settingsPanel')
}

function closeSettings() { hide('settingsPanel') }

function saveSettings() {
  const s      = loadState()
  const apiKey = document.getElementById('settingsApiKey').value.trim()
  const goal   = parseInt(document.getElementById('settingsGoal').value) || 4
  if (!apiKey) { showToast('API key cannot be empty', 'warn'); return }
  s.config.apiKey          = apiKey
  s.config.weeklyGoalHours = goal
  saveState(s)
  closeSettings()
  renderAll(s)
  showToast('Settings saved')
}

function addChannel() {
  const idEl   = document.getElementById('newChannelId')
  const nameEl = document.getElementById('newChannelName')
  const id     = idEl.value.trim()
  const name   = nameEl.value.trim() || id

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
  idEl.value = nameEl.value = ''
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

function resetApp() {
  if (!confirm('This will delete all your watch history, streak, and Anki data. Continue?')) return
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

  video.status    = newStatus
  video.watchedAt = newStatus !== 'unwatched' ? new Date().toISOString() : null

  if (newStatus !== 'unwatched') bumpStreak(s)

  saveState(s)
  renderAll(s)
}

function bumpStreak(s) {
  const today     = toDateKey()
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000))
  const last      = s.streak.lastActivityDate

  if (last === today)     return                // already logged today
  s.streak.current = last === yesterday ? s.streak.current + 1 : 1
  s.streak.longest = Math.max(s.streak.longest, s.streak.current)
  s.streak.lastActivityDate = today
}

function isStreakAlive(s) {
  const today     = toDateKey()
  const yesterday = toDateKey(new Date(Date.now() - 86_400_000))
  return s.streak.lastActivityDate === today || s.streak.lastActivityDate === yesterday
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

function syncAnkiStatsToState(stats) {
  const s = loadState()
  if (!s || !stats) return

  s.anki[toDateKey()] = {
    reviewed: stats.reviewedToday,
    created: stats.newToday,
    loggedAt: stats.fetchedAt,
    source: 'ankiconnect'
  }
  if (stats.reviewedToday || stats.newToday) bumpStreak(s)
  saveState(s)
  renderHeader(s)
  renderAnalytics(getWeeklyStats(s), s)
  const score = calcCityScore(getWeeklyStats(s), s)
  renderCity(score, s)
}

function setAnkiStatText(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value ?? '—'
}

function formatAnkiStatus(stats) {
  if (!stats?.fetchedAt) return 'Open Anki to load live stats'
  return `Updated ${timeAgo(stats.fetchedAt)}`
}

function renderAnkiStatsPanel(s) {
  const todayLog = s?.anki?.[toDateKey()]
  const stats = ankiStatsCache || (todayLog ? {
    reviewedToday: todayLog.reviewed,
    newToday: todayLog.created,
    dueCards: null,
    fetchedAt: todayLog.loggedAt
  } : null)

  setAnkiStatText('ankiReviewedToday', stats?.reviewedToday)
  setAnkiStatText('ankiNewToday', stats?.newToday)
  setAnkiStatText('ankiDueCards', stats?.dueCards)

  const el = document.getElementById('ankiConnectStatus')
  if (el) {
    el.textContent = formatAnkiStatus(stats)
    el.classList.toggle('logged', !!stats)
  }
}

// ════════════════════════════════════════════════════════════
// ANALYTICS & CITY SCORE
// ════════════════════════════════════════════════════════════

function getWeeklyStats(s) {
  const weekStart = getWeekStart()

  const weekVids = Object.values(s.videos)
    .filter(v => v.watchedAt && new Date(v.watchedAt) >= weekStart)

  const watched = weekVids.filter(v => v.status === 'watched')
  const partial = weekVids.filter(v => v.status === 'partial')

  // Full watch = full duration; partial = 50%
  const secondsWatched =
    watched.reduce((sum, v) => sum + (v.duration || 0), 0) +
    partial.reduce((sum, v) => sum + Math.floor((v.duration || 0) * 0.5), 0)

  const hoursWatched = secondsWatched / 3600
  const goalHours    = s.config.weeklyGoalHours || 4
  const goalProgress = Math.min((hoursWatched / goalHours) * 100, 100)
  const remainingSeconds = Math.max(0, Math.round(goalHours * 3600 - secondsWatched))

  // Anki totals for this week
  const ankiThisWeek = Object.entries(s.anki)
    .filter(([date]) => new Date(date) >= weekStart)
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

function calcCityScore(stats, s) {
  let score = 0
  score += stats.hoursWatched * 5                        // 5 pts per hour
  score += Math.floor(stats.ankiReviewed / 50) * 3      // 3 pts per 50 reviews
  score += Math.floor(stats.ankiCreated  / 10) * 4      // 4 pts per 10 new cards
  score += (s.streak.current || 0) * 0.5                // 0.5 pts per streak day
  return Math.floor(score)
}

function getCityStage(score) {
  const unlocked = CITY_LEVELS.filter(level => score >= level.threshold)
  return (unlocked[unlocked.length - 1] || CITY_LEVELS[0]).label
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
  const score = calcCityScore(stats, s)
  renderHeader(s)
  renderAnalytics(stats, s)
  renderAnkiStatus(s)
  renderCity(score, s)
  renderFeed(s)
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
  bar.classList.toggle('complete', stats.goalProgress >= 100)
}

function renderAnkiStatus(s) {
  renderAnkiStatsPanel(s)
}

function renderCity(score, s) {
  document.getElementById('cityScore').textContent = score
  document.getElementById('cityLabel').textContent = getCityStage(score)
  const nextLevel = getNextCityLevel(score)
  document.getElementById('cityNextLevel').textContent = nextLevel
    ? `${nextLevel.threshold - score} pts to ${nextLevel.label}`
    : 'Max level'

  // Reveal elements whose threshold has been reached
  document.querySelectorAll('[data-threshold]').forEach(el => {
    el.style.opacity = score >= parseInt(el.dataset.threshold) ? '1' : '0'
  })

  applyCityTimeOfDay(s.streak.lastActivityDate === toDateKey())
  applyPeasantPosition()
  applyNightVisuals(s)
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
  peasant.setAttribute('transform', `translate(${x} ${y}) scale(0.5)`)
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
  const filter = document.getElementById('filterSelect').value
  const grid   = document.getElementById('videoGrid')
  const watchedSection = document.getElementById('watchedSection')
  const watchedGrid = document.getElementById('watchedGrid')
  const watchedCount = document.getElementById('watchedCount')

  const allVideos = Object.values(s.videos)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

  const activeVideos = getVisibleActiveVideos(allVideos)
    .filter(v => ['all', 'unwatched', 'partial'].includes(filter) && (filter === 'all' || v.status === filter))

  const watchedVideos = allVideos.filter(v => v.status === 'watched')
  const showWatched = filter === 'all' || filter === 'watched'

  if (filter === 'watched') {
    grid.innerHTML = ''
  } else if (!activeVideos.length) {
    const msg = filter === 'all'
      ? 'No videos yet — click ↻ Refresh to load your feed.'
      : `No ${filter === 'partial' ? 'in-progress' : filter} videos right now.`
    grid.innerHTML = `<div class="empty-state">${msg}</div>`
  } else {
    grid.innerHTML = activeVideos.map(v => renderCard(v)).join('')
  }

  watchedCount.textContent = watchedVideos.length
  watchedSection.classList.toggle('hidden', !showWatched || !watchedVideos.length)
  watchedGrid.innerHTML = showWatched ? watchedVideos.map(v => renderCard(v, true)).join('') : ''
}

function getVisibleActiveVideos(videos) {
  const byChannel = new Map()

  videos
    .filter(v => v.status !== 'watched')
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
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

function renderCard(v, compact = false) {
  const isWatched = v.status === 'watched'
  const isPartial = v.status === 'partial'
  const watchedLabel = compact ? 'Unmark' : `✓ ${isWatched ? 'Watched' : 'Mark watched'}`
  return `
    <div class="video-card ${compact ? 'compact-card' : ''} status-${v.status}">
      <a href="https://youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" class="thumb-link">
        <img src="${escHtml(v.thumbnail)}" alt="" class="thumb" loading="lazy">
        <span class="dur-badge">${formatDuration(v.duration)}</span>
        ${isWatched ? '<span class="overlay-badge watched-badge">✓</span>' : ''}
        ${isPartial ? '<span class="overlay-badge partial-badge">⏸</span>' : ''}
      </a>
      <div class="card-body">
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
