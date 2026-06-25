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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

function defaultState(apiKey, goalHours) {
  return {
    config: {
      apiKey,
      weeklyGoalHours: goalHours || 4,
      channels: DEFAULT_CHANNELS.map(c => ({ ...c }))
    },
    videos:  {},   // { [videoId]: VideoRecord }
    streak:  { current: 0, longest: 0, lastActivityDate: null },
    anki:    {},   // { 'YYYY-MM-DD': { reviewed, created } }
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
  const state = loadState()
  if (!state?.config?.apiKey) {
    show('setupScreen')
  } else {
    show('mainApp')
    renderAll(state)
    if (!state.lastFetched) showToast('Add or edit channels in ⚙ Settings, then hit ↻ Refresh', 'warn')
  }
}

function completeSetup() {
  const apiKey = document.getElementById('setupApiKey').value.trim()
  const goal   = parseInt(document.getElementById('setupGoal').value) || 4
  if (!apiKey) { showToast('Paste your API key first', 'warn'); return }
  const s = defaultState(apiKey, goal)
  saveState(s)
  hide('setupScreen')
  show('mainApp')
  renderAll(s)
  showToast('All set! Open ⚙ Settings to confirm channels, then ↻ Refresh', 'warn')
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

async function fetchChannelVideos(channel, apiKey) {
  const pid  = uploadsId(channel.id)
  const url  = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=${pid}&key=${apiKey}`
  const data = await ytFetch(url)
  return data.items.map(item => ({
    id:           item.snippet.resourceId.videoId,
    title:        item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    channelId:    channel.id,
    thumbnail:    item.snippet.thumbnails?.high?.url
                  || item.snippet.thumbnails?.medium?.url
                  || item.snippet.thumbnails?.default?.url,
    publishedAt:  item.snippet.publishedAt
  }))
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
        const vids = await fetchChannelVideos(ch, s.config.apiKey)
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

function logAnkiSession() {
  const reviewed = parseInt(document.getElementById('ankiReviewedInput').value) || 0
  const created  = parseInt(document.getElementById('ankiCreatedInput').value)  || 0
  if (!reviewed && !created) { showToast('Enter at least one number', 'warn'); return }

  const s = loadState()
  s.anki[toDateKey()] = { reviewed, created, loggedAt: new Date().toISOString() }
  bumpStreak(s)
  saveState(s)

  document.getElementById('ankiReviewedInput').value = ''
  document.getElementById('ankiCreatedInput').value  = ''
  renderAll(s)
  showToast('Anki session logged ✓')
}

async function tryAnkiConnect() {
  try {
    const res  = await fetch('http://localhost:8765', {
      method: 'POST',
      body:   JSON.stringify({ action: 'getNumCardsReviewedToday', version: 6 }),
      signal: AbortSignal.timeout(2000)
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    document.getElementById('ankiReviewedInput').value = data.result ?? 0
    showToast(`AnkiConnect: ${data.result} reviews today — adjust if needed and hit Log`)
  } catch {
    showToast('AnkiConnect not available. Open Anki and install the AnkiConnect plugin first.', 'warn')
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

  // Estimate videos remaining based on average duration so far
  const avgSecs = watched.length
    ? watched.reduce((sum, v) => sum + (v.duration || 0), 0) / watched.length
    : 0
  const videosRemaining = avgSecs > 0
    ? Math.ceil(Math.max(0, goalHours * 3600 - secondsWatched) / avgSecs)
    : '?'

  // Anki totals for this week
  const ankiThisWeek = Object.entries(s.anki)
    .filter(([date]) => new Date(date) >= weekStart)
    .reduce((acc, [, d]) => ({ reviewed: acc.reviewed + (d.reviewed||0), created: acc.created + (d.created||0) }), { reviewed: 0, created: 0 })

  return {
    hoursWatched, secondsWatched, goalHours, goalProgress,
    videosWatched: watched.length,
    videosPartial: partial.length,
    videosRemaining,
    ankiReviewed: ankiThisWeek.reviewed,
    ankiCreated:  ankiThisWeek.created
  }
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
  if (score >= 100) return '🏘️ Full village'
  if (score >= 85)  return '⚙️ Windmill rising'
  if (score >= 65)  return '🏠 Two houses'
  if (score >= 50)  return '🪣 Homestead'
  if (score >= 35)  return '🌾 Barn built'
  if (score >= 20)  return '🏡 Farmhouse — goal hit!'
  if (score >= 12)  return '🌲 Two trees'
  if (score >= 5)   return '🌱 First tree'
  return '🌑 Empty land'
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
  document.getElementById('videosRemaining').textContent = stats.videosRemaining
  document.getElementById('ankiReviewedStat').textContent = stats.ankiReviewed || '—'
  document.getElementById('ankiCreatedStat').textContent  = stats.ankiCreated  || '—'
  document.getElementById('streakLongest').textContent   = s.streak.longest

  const bar = document.getElementById('goalProgressBar')
  bar.style.width = `${stats.goalProgress}%`
  bar.classList.toggle('complete', stats.goalProgress >= 100)
}

function renderAnkiStatus(s) {
  const log = s.anki[toDateKey()]
  const el  = document.getElementById('ankiTodayStatus')
  if (log) {
    el.textContent = `Today: ${log.reviewed} reviewed · ${log.created} new`
    el.classList.add('logged')
  } else {
    el.textContent = 'Today: not logged yet'
    el.classList.remove('logged')
  }
}

function renderCity(score, s) {
  document.getElementById('cityScore').textContent = score
  document.getElementById('cityLabel').textContent = getCityStage(score)

  // Reveal elements whose threshold has been reached
  document.querySelectorAll('[data-threshold]').forEach(el => {
    el.style.opacity = score >= parseInt(el.dataset.threshold) ? '1' : '0'
  })

  // Lighten the sky slightly on an active streak day
  const active = s.streak.lastActivityDate === toDateKey()
  document.getElementById('citySky').setAttribute('fill', active ? '#08102a' : '#06060e')
}

function renderFeed(s) {
  const filter = document.getElementById('filterSelect').value
  const grid   = document.getElementById('videoGrid')

  const videos = Object.values(s.videos)
    .filter(v => filter === 'all' || v.status === filter)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

  if (!videos.length) {
    const msg = filter === 'all'
      ? 'No videos yet — click ↻ Refresh to load your feed.'
      : `No ${filter === 'partial' ? 'in-progress' : filter} videos right now.`
    grid.innerHTML = `<div class="empty-state">${msg}</div>`
    return
  }
  grid.innerHTML = videos.map(renderCard).join('')
}

function renderCard(v) {
  const isWatched = v.status === 'watched'
  const isPartial = v.status === 'partial'
  return `
    <div class="video-card status-${v.status}">
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
            ✓ ${isWatched ? 'Watched' : 'Mark watched'}
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
