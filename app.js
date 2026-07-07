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
const ACTIVITY_LOG_LIMIT = 500
const STATE_BACKUP_AUTO_INTERVAL_MS = 10 * 60_000
const CONFIG_COOKIE_KEY = IS_SANDBOX ? 'edenia_config_sandbox' : 'edenia_config'
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const YOUTUBE_REFRESH_INTERVAL_MS = 5 * 60 * 60_000
const YOUTUBE_REFRESH_ERROR_BACKOFF_MS = 30 * 60_000
const ACTIVE_VIDEOS_PER_CHANNEL = 5
const FETCH_PAGE_SIZE = 50
const MAX_FETCH_PAGES_PER_CHANNEL = 1
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{20,}$/
const YOUTUBE_HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/
const DEFAULT_THEME = 'light'
const THEMES = ['light', 'dark']
const DEFAULT_LOCALE = 'en'
const SUPPORTED_LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr']
const LOCALE_LABELS = {
  en: 'English',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  es: 'Español',
  fr: 'Français'
}
const ANKI_AUTO_REFRESH_MS = 5 * 60_000
const ANKI_DAY_START_HOUR = 4
const MIN_DAILY_STREAK_POINTS = 3
const UNDO_STACK_LIMIT = 50
const MIN_WEEKLY_GOAL_HOURS = 1
const MAX_WEEKLY_GOAL_HOURS = 99
const VIDEO_HOUR_POINTS = 3
const SHORT_VIDEO_MAX_DURATION_SECONDS = 180
const SHORT_VIDEO_DETECTION_VERSION = 1
const ANKI_REVIEW_CHUNK_SIZE = 60
const ANKI_REVIEW_CHUNK_POINTS = 2
const SCORING_RULES_VERSION = 5
const CITY_LEVELS = [
  { threshold: 0, labelKey: 'city.level.0', label: '🏠 Lonely house' },
  { threshold: 5, labelKey: 'city.level.1', label: '⛵ Your house got a fresh new look! Plus a boat!' },
  { threshold: 12, labelKey: 'city.level.2', label: '🏝️ Oh look! A tiny island! Cute.' },
  { threshold: 20, labelKey: 'city.level.3', label: 'Kids are gonna have fun now!' },
  { threshold: 28, labelKey: 'city.level.4', label: "Let's add a pool to chill" },
  { threshold: 35, labelKey: 'city.level.5', label: 'Oh! Some friends are coming to say hi...' },
  { threshold: 42, labelKey: 'city.level.6', label: 'You expanded your small island!' },
  { threshold: 50, labelKey: 'city.level.7', label: "That's a nice deckchair and some pretty flowers! 🌸" }
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
let selectedActivityLogFilter = 'all'
let forcedSearchVideoId = null
let currentLocale = DEFAULT_LOCALE
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
const historyActionScroll = {
  frame: null,
  scroller: null,
  speed: 0
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
  ['all', 'videos.status.all'],
  ['watch-later', 'videos.status.watchLater'],
  ['unwatched', 'videos.status.unwatched'],
  ['partial', 'videos.status.partial']
]
const VIDEO_STATUSES = ['watch-later', 'unwatched', 'partial', 'watched']
const HISTORY_RANGES = ['week', 'month']
const ACTIVITY_LOG_FILTERS = ['all', 'user', 'auto', 'issues']
const VIDEO_SEARCH_RESULT_LIMIT = 8
const I18N_EN = {
  'app.title.sandbox': 'Sandbox - Edenia',
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.language.label': 'Language',
  'settings.weeklyGoal.label': 'Weekly goal (hours)',
  'settings.channels.label': 'Channels',
  'settings.channels.placeholder': 'Channel URL or ID',
  'settings.channels.add': 'Add',
  'settings.channels.hint': 'Paste a YouTube channel URL, @handle, or channel ID. Best examples: youtube.com/@channel or youtube.com/channel/UCxxxxxxxx.',
  'settings.shorts.label': 'Show short videos',
  'settings.shorts.hint': 'When off, videos under 3 minutes are skipped during refresh and hidden from your active video list.',
  'settings.activity.title': 'Activity log',
  'settings.activity.filtersLabel': 'Activity log filters',
  'settings.activity.all': 'All',
  'settings.activity.user': 'User',
  'settings.activity.auto': 'Auto',
  'settings.activity.issues': 'Issues',
  'settings.refresh': 'Refresh',
  'settings.remove': 'Remove',
  'settings.sync.export': 'Export sync file',
  'settings.sync.import': 'Import sync file',
  'settings.sync.note': 'Progress is saved in this browser. Use sync files to copy the same progress to another device or browser.',
  'settings.walkthroughAgain': 'Show walkthrough again',
  'settings.backups.title': 'Recent local backups',
  'settings.backups.note': 'Local backups can recover from a bad import, reset, or app save. Export a sync file for protection outside this browser.',
  'settings.reset.open': 'Reset everything',
  'settings.reset.warning': "This will clear this app's local watch history, streak, saved settings, and cached Anki stats. A rollback backup will be kept here. Your Anki collection will not be changed.",
  'settings.reset.cancel': 'Cancel',
  'settings.reset.delete': 'Delete data',
  'header.sandbox': 'Sandbox version',
  'header.search.title': 'Search videos',
  'header.search.dialog': 'Search saved videos',
  'header.search.placeholder': 'Search videos...',
  'header.theme.dark': 'Switch to dark mode',
  'header.theme.light': 'Switch to light mode',
  'header.settings': 'Settings',
  'streak.day': 'day streak',
  'sandbox.addDay': 'Add day',
  'sandbox.reset': 'Reset',
  'city.imageAlt': 'Study city milestone: Lonely house',
  'city.zoom.controls': 'City zoom controls',
  'city.zoom.out': 'Zoom out',
  'city.zoom.reset': 'Reset view',
  'city.zoom.in': 'Zoom in',
  'city.timeline': 'City history timeline',
  'city.timeline.today': 'Today',
  'city.levelUp': 'Level up',
  'city.totalPts': 'total pts',
  'city.ptsByThen': 'pts by then',
  'city.readyNext': 'Ready for next level',
  'city.ptsToNext': '{count} pts to next level',
  'city.maxLevel': 'Max level',
  'city.level.0': '🏠 Lonely house',
  'city.level.1': '⛵ Your house got a fresh new look! Plus a boat!',
  'city.level.2': '🏝️ Oh look! A tiny island! Cute.',
  'city.level.3': 'Kids are gonna have fun now!',
  'city.level.4': "Let's add a pool to chill",
  'city.level.5': 'Oh! Some friends are coming to say hi...',
  'city.level.6': 'You expanded your small island!',
  'city.level.7': "That's a nice deckchair and some pretty flowers! 🌸",
  'goal.title': 'Weekly goal',
  'goal.watched': 'watched',
  'goal.inProgress': 'in progress',
  'goal.toGo': 'to go',
  'history.title': 'Study History',
  'history.viewLabel': 'Study history view',
  'history.summary': 'Summary',
  'history.heatmap': 'Heatmap',
  'history.rangeLabel': 'Study history range',
  'history.selectWeek': 'Select week',
  'history.availableWeeks': 'Available weeks',
  'history.week': 'Week',
  'history.selectMonth': 'Select month',
  'history.availableMonths': 'Available months',
  'history.month': 'Month',
  'history.videoTime': 'video time',
  'history.videosWatched': 'videos watched',
  'history.ankiReviewed': 'Anki cards reviewed',
  'history.ankiCreated': 'new Anki cards created',
  'history.table.date': 'Date',
  'history.table.video': 'Video',
  'history.table.watched': 'Watched',
  'history.table.anki': 'Anki',
  'history.table.points': 'PTS',
  'history.emptyRange': 'No activity in this range.',
  'history.noActivityMap': 'No activity to map yet.',
  'history.noActivityYet': 'No activity yet',
  'history.showWatched': 'Show {count} videos watched on {date}',
  'history.watchedDialog': 'Watched videos',
  'history.showPoints': 'Show points scored on {date}',
  'history.pointsDialog': 'Point breakdown',
  'history.pointsAnkiReviews': 'Anki reviews',
  'history.pointsReviewsCount': '{count} reviews',
  'history.pointsDailyTotal': 'Daily total',
  'history.pointsRounding': 'rounded down',
  'history.pointsNone': 'No points scored',
  'history.today': 'Today',
  'history.yesterday': 'Yesterday',
  'history.weekdays.mon': 'Mon',
  'history.weekdays.tue': 'Tue',
  'history.weekdays.wed': 'Wed',
  'history.weekdays.thu': 'Thu',
  'history.weekdays.fri': 'Fri',
  'history.weekdays.sat': 'Sat',
  'history.weekdays.sun': 'Sun',
  'history.heatmapAria': '{date}: {points} points; {time} video time; {videos} videos watched; {reviewed} Anki cards reviewed; {created} new Anki cards created',
  'history.tooltip.points': '{count} pts',
  'history.tooltip.videoTime': 'Video time',
  'history.tooltip.videosWatched': 'Videos watched',
  'history.tooltip.ankiReviewed': 'Anki reviewed',
  'history.tooltip.ankiCreated': 'New Anki cards',
  'videos.title': 'Videos',
  'videos.status.all': 'All',
  'videos.status.watchLater': 'Watch later',
  'videos.status.unwatched': 'Unwatched',
  'videos.status.partial': 'In progress',
  'videos.status.watched': 'Watched',
  'videos.status.previous': 'its previous status',
  'videos.channels.all': 'All channels',
  'videos.channels.none': 'No channels',
  'videos.channels.one': '1 channel',
  'videos.channels.count': '{count} channels',
  'videos.manual.button': '+ Watched URL',
  'videos.manual.dialog': 'Add watched YouTube URL',
  'videos.manual.placeholder': 'youtube.com/watch?v=...',
  'videos.manual.add': 'Add',
  'videos.manual.adding': 'Adding...',
  'videos.undo': 'Undo',
  'videos.redo': 'Redo',
  'videos.undo.empty': 'Nothing to undo',
  'videos.redo.empty': 'Nothing to redo',
  'videos.undo.queue': 'Undo queue',
  'videos.redo.queue': 'Redo queue',
  'videos.undo.title': 'Undo latest video status change',
  'videos.redo.title': 'Redo latest video status change',
  'videos.watchedSection': 'Watched',
  'videos.empty.default': 'No videos yet. Edenia loads your feed automatically.',
  'videos.empty.activeBelow': 'No active videos right now. Watched videos are below.',
  'videos.empty.filtered': 'No {filter} videos{channelText} right now.',
  'videos.empty.selectedChannels': ' for the selected channels',
  'videos.filter.active': 'active',
  'videos.filter.inProgress': 'in-progress',
  'videos.filter.watchLater': 'watch later',
  'videos.search.empty': 'Search saved videos by title or channel.',
  'videos.search.noMatches': 'No matching videos found.',
  'videos.search.untitled': 'Untitled video',
  'videos.search.youtube': 'YouTube',
  'videos.card.markWatched': 'Mark watched',
  'videos.card.markWatchedTitle': 'Mark as watched',
  'videos.card.unmark': 'Unmark',
  'videos.card.clear': 'Clear',
  'videos.card.markProgress': 'Mark as in progress',
  'videos.card.removeWatchLater': 'Remove from watch later',
  'videos.card.watchLater': 'Watch later',
  'videos.card.resume': 'Resume watching',
  'videos.card.continueAt': 'Continue at',
  'videos.card.timestampLabel': 'Continue watching timestamp',
  'videos.card.inProgressRibbon': 'In progress',
  'videos.refreshing': 'Refreshing...',
  'videos.refresh': 'Refresh',
  'activity.empty': 'No activity logged yet',
  'activity.auto': 'Auto',
  'activity.user': 'User',
  'activity.error': 'Error',
  'activity.warn': 'Warn',
  'activity.done': 'Done',
  'activity.info': 'Info',
  'backups.empty': 'No local backups yet',
  'backups.restore': 'Restore',
  'backups.unknownTime': 'Unknown time',
  'backups.automatic': 'Automatic backup',
  'time.tomorrow': 'tomorrow',
  'time.today': 'today',
  'time.yesterday': 'yesterday',
  'time.inDays': 'in {count}d',
  'time.daysAgo': '{count}d ago',
  'time.weekAgo': '1 week ago',
  'time.weeksAgo': '{count}w ago',
  'time.monthsAgo': '{count}mo ago',
  'time.hourShort': 'h',
  'time.hoursMinutesCompact': '{hours}h {minutes}m',
  'time.hoursCompact': '{hours}h',
  'time.minutesCompact': '{minutes}m',
  'time.notYet': 'Not yet',
  'time.justNow': 'just now',
  'time.notRefreshedYet': 'Not refreshed yet',
  'time.lastRefreshed': 'Last refreshed {time}',
  'time.watchedToday': 'Watched today',
  'time.watchedYesterday': 'Watched yesterday',
  'time.watchedDaysAgo': 'Watched {count}d ago',
  'time.watchedWeekAgo': 'Watched 1 week ago',
  'time.watchedWeeksAgo': 'Watched {count}w ago',
  'time.watchedDate': 'Watched {date}',
  'time.weekLabel': 'Week {week} · {start} - {end}',
  'time.hoursMinutes': '{hours}h {minutes} min',
  'time.hours': '{hours}h',
  'time.minutes': '{minutes} min',
  'points.short': 'pts',
  'points.one': '{count} pnt',
  'points.many': '{count} pts',
  'city.timelineAria': '{date}, {points} pts{changed}',
  'city.timelineChanged': ', city image changed',
  'toast.sandboxMode': 'Sandbox mode: demo data is isolated from your real progress',
  'toast.sandboxReset': 'Sandbox reset: no study progress yet',
  'toast.sandboxDayAdded': 'Added sandbox study day: {date}',
  'toast.addChannelFirst': 'Add at least one channel in Settings first',
  'toast.dummyVideosLoaded': '{count} dummy videos loaded',
  'toast.nothingToSync': 'Nothing to sync yet',
  'toast.syncExported': 'Sync file exported',
  'toast.invalidSync': 'That sync file is not valid',
  'toast.useSandboxSync': 'Use a sandbox sync file here',
  'toast.useNormalSync': 'Use a normal Edenia sync file here',
  'toast.importFailed': 'Could not import that sync file',
  'toast.syncImported': 'Sync file imported',
  'toast.readSyncFailed': 'Could not read that sync file',
  'toast.backupUnavailable': 'That backup is not available anymore',
  'toast.backupRestored': 'Backup restored',
  'toast.channelInvalid': 'Use a YouTube channel URL, @handle, or UC channel ID',
  'toast.channelResolveNeedsKey': 'Add the shared YouTube API key to use @handle or /user URLs, or paste the /channel/UC... URL.',
  'toast.channelResolveNotFound': 'Could not find that YouTube channel',
  'toast.channelCustomUrlUnsupported': 'That custom channel URL cannot be resolved reliably yet. Try the /channel/UC... URL or @handle.',
  'toast.channelDuplicate': 'Already added',
  'toast.channelAdded': '{name} added',
  'toast.channelAddedNoKey': '{name} added. Add the shared YouTube API key to load videos.',
  'toast.channelAddedLoading': '{name} added · loading recent videos...',
  'toast.apiKeyMissing': 'Add the shared YouTube API key to config.local.js',
  'toast.nextRefresh': 'Next YouTube refresh in {time}',
  'toast.refreshFailedChannels': 'Refresh failed: {count} channel{plural} failed',
  'toast.refreshLoadedWithErrors': 'Loaded {count} videos{shorts} ({errors} channel{plural} failed)',
  'toast.refreshLoaded': '{count} videos loaded from {channels} channel{plural}{shorts}',
  'toast.refreshFailed': 'Refresh failed: {message}',
  'toast.channelLoaded': '{name}: {count} videos loaded{shorts}',
  'toast.channelAddLoadFailed': 'Channel added, but recent videos could not load: {message}',
  'toast.validYoutubeUrl': 'Use a valid YouTube video URL',
  'toast.alreadyWatched': 'That video is already marked watched',
  'toast.addedWatchedVideo': 'Added watched video: "{title}"',
  'toast.addVideoFailed': 'Could not add that video',
  'toast.timestampFormat': 'Use a timestamp like 1:23 (hour:minute)',
  'toast.nothingRedo': 'Nothing to redo',
  'toast.nothingUndo': 'Nothing to undo',
  'toast.videoGone': 'That video is no longer available',
  'toast.watchedHidden': 'That watched video is hidden by the current filters',
  'toast.couldNotShowVideo': 'Could not show that video right now',
  'toast.levelUp': 'Level up! {label}',
  'toast.localeChanged': 'Language changed to {language}',
  'toast.skippedShorts': ', skipped {count} short video{plural}',
  'anki.unavailableOpen': 'AnkiConnect unavailable: open Anki with AnkiConnect installed',
  'anki.blockedHosted': 'AnkiConnect blocked: add this site to AnkiConnect webCorsOriginList',
  'anki.failed': 'AnkiConnect failed: {message}',
  'anki.notAvailable': 'AnkiConnect not available',
  'undo.removed': '{verb} change: "{title}" was removed.',
  'undo.backTo': '{verb} change: "{title}" is back to {status}.',
  'undo.redid': 'Redid',
  'undo.undid': 'Undid',
  'undo.backToStatus': '{from} -> back to {to}',
  'undo.statusChange': '{from} -> {to}',
  'undo.timeUnavailable': 'Time unavailable',
  'undo.doneAt': 'Done {time}',
  'walkthrough.next': 'Next',
  'walkthrough.back': 'Back',
  'walkthrough.skip': 'Skip',
  'walkthrough.done': 'Done',
  'walkthrough.close': 'Close walkthrough',
  'walkthrough.progress': '{current} / {total}',
  'walkthrough.town': 'This is your floating town. When you study, your town grows little by little. It gives you a quick picture of your progress without needing to read every number.',
  'walkthrough.weeklyGoal': 'This is your weekly goal. Watched study time fills the bar, so you can quickly see if you are on track for the week.',
  'walkthrough.studyHistory': 'Study History shows what happened over time. It combines watched videos and Anki reviews so you can understand your real study rhythm.',
  'walkthrough.historyViews': 'Use Summary when you want clear numbers, and Heatmap when you want to see active days at a glance. Edenia remembers which view you prefer.',
  'walkthrough.videos': 'This is the video area. New videos from your channels appear here, and watched videos move into the Watched section below.',
  'walkthrough.videoFilters': 'These controls help you keep the list manageable. You can filter by status, filter by channel, add a watched URL, and fix mistakes.',
  'walkthrough.manualWatchedUrl': 'Use Watched URL when you studied from a YouTube video that is not in your channels. Paste the link, add it as watched, and it counts toward your progress.',
  'walkthrough.undoRedo': 'Undo and Redo let you recover from accidental clicks. Open the list, choose the action, and Edenia will update the score and history again.',
  'walkthrough.settings': 'Click Settings when you are ready to set up Edenia. This is where you add your YouTube channels, choose your weekly goal, and keep your progress safe.',
  'walkthrough.clickSettings': 'Click Settings',
  'walkthrough.channels': 'Add YouTube channels here. Paste a channel URL, @handle, or channel ID. Edenia uses them to find recent study videos, then keeps the feed fresh without you hunting through YouTube every time.',
  'walkthrough.shortVideos': 'This setting controls short videos. Turn it off if you want Edenia to skip and hide videos under 3 minutes, so your study list stays focused.',
  'walkthrough.settingsWeeklyGoal': 'You can change your weekly goal here. This only changes the target you are aiming for; it does not erase your history.',
  'walkthrough.syncFiles': 'Sync files are for moving your progress to another browser or device. Export a file from here, then import it where you want the same progress.',
  'walkthrough.localBackups': 'Recent local backups help after risky actions like import, restore, reset, or a bad save. They stay in this browser and give you a quick rollback point.',
  'walkthrough.activityLog': 'Activity Log is the calm record of what happened. It shows your actions and automatic events, like YouTube refreshes, Anki updates, imports, and issues.',
  'walkthrough.replay': 'If you ever want this tour again, use Show walkthrough again. It is useful after new features are added or if you share Edenia with someone else.',
  'walkthrough.resetSafety': 'Reset everything starts fresh, but Edenia keeps a rollback backup first. Use it carefully, and export a sync file when you want protection outside this browser.',
  'log.weeklyGoal.title': 'Weekly goal changed',
  'log.weeklyGoal.detail': '{from}h to {to}h',
  'log.shortVideos.title': 'Short video setting changed',
  'log.shortVideos.shown': 'Short videos are shown.',
  'log.shortVideos.hidden': 'Short videos are hidden.',
  'log.theme.title': 'Theme changed',
  'log.theme.dark': 'Dark theme enabled.',
  'log.theme.light': 'Light theme enabled.',
  'log.locale.title': 'Language changed',
  'log.locale.detail': 'Language set to {language}.'
}

const I18N = {
  en: I18N_EN,
  'zh-Hant': {
    ...I18N_EN,
    'settings.title': '設定',
    'settings.close': '關閉設定',
    'settings.language.label': '語言',
    'settings.weeklyGoal.label': '每週目標（小時）',
    'settings.channels.label': '頻道',
    'settings.channels.placeholder': '頻道網址或 ID',
    'settings.channels.add': '新增',
    'settings.channels.hint': '貼上 YouTube 頻道網址、@handle 或頻道 ID。建議格式：youtube.com/@channel 或 youtube.com/channel/UCxxxxxxxx。',
    'settings.shorts.label': '顯示短影片',
    'settings.shorts.hint': '關閉時，刷新會跳過 3 分鐘以下的影片，並從主要影片清單隱藏。',
    'settings.activity.title': '活動紀錄',
    'settings.activity.filtersLabel': '活動紀錄篩選',
    'settings.activity.all': '全部',
    'settings.activity.user': '使用者',
    'settings.activity.auto': '自動',
    'settings.activity.issues': '問題',
    'settings.refresh': '刷新',
    'settings.sync.export': '匯出同步檔',
    'settings.sync.import': '匯入同步檔',
    'settings.sync.note': '進度會儲存在這個瀏覽器。使用同步檔可以把同一份進度帶到其他裝置或瀏覽器。',
    'settings.walkthroughAgain': '再次顯示導覽',
    'settings.backups.title': '最近本機備份',
    'settings.backups.note': '本機備份可以在匯入、重置或儲存出錯後復原。若要保護到瀏覽器之外，請匯出同步檔。',
    'settings.reset.open': '全部重置',
    'settings.reset.warning': '這會清除本機觀看紀錄、連續天數、設定與快取的 Anki 統計。這裡會先保留一份回復備份。你的 Anki 牌組不會被更動。',
    'settings.reset.cancel': '取消',
    'settings.reset.delete': '刪除資料',
    'toast.channelInvalid': '請使用 YouTube 頻道網址、@handle 或 UC 頻道 ID',
    'toast.channelResolveNeedsKey': '若要使用 @handle 或 /user 網址，請先加入共用 YouTube API key；或貼上 /channel/UC... 網址。',
    'toast.channelResolveNotFound': '找不到這個 YouTube 頻道',
    'toast.channelCustomUrlUnsupported': '這種自訂頻道網址目前無法可靠解析。請試試 /channel/UC... 網址或 @handle。',
    'header.sandbox': '沙盒版本',
    'header.search.title': '搜尋影片',
    'header.search.dialog': '搜尋已儲存影片',
    'header.search.placeholder': '搜尋影片...',
    'header.theme.dark': '切換到深色模式',
    'header.theme.light': '切換到淺色模式',
    'streak.day': '天連續',
    'sandbox.addDay': '新增一天',
    'sandbox.reset': '重置',
    'city.levelUp': '升級',
    'city.totalPts': '總分',
    'city.ptsByThen': '當時分數',
    'city.readyNext': '可以升到下一級',
    'city.ptsToNext': '還差 {count} 分到下一級',
    'city.maxLevel': '最高等級',
    'city.level.0': '🏠 孤單的小屋',
    'city.level.1': '⛵ 你的小屋煥然一新！還多了一艘船！',
    'city.level.2': '🏝️ 看！一座小小島！好可愛。',
    'city.level.3': '孩子們現在會玩得很開心！',
    'city.level.4': '來加一個泳池放鬆一下',
    'city.level.5': '喔！有朋友要來打招呼了...',
    'city.level.6': '你的小島擴大了！',
    'city.level.7': '漂亮的躺椅和可愛的花！🌸',
    'goal.title': '每週目標',
    'goal.watched': '已看',
    'goal.inProgress': '進行中',
    'goal.toGo': '還差',
    'history.title': '學習紀錄',
    'history.summary': '摘要',
    'history.heatmap': '熱力圖',
    'history.week': '週',
    'history.month': '月',
    'history.videoTime': '影片時間',
    'history.videosWatched': '已看影片',
    'history.ankiReviewed': '已複習 Anki 卡',
    'history.ankiCreated': '新增 Anki 卡',
    'history.table.date': '日期',
    'history.table.video': '影片',
    'history.table.watched': '已看',
    'history.table.anki': 'Anki',
    'history.table.points': '分數',
    'history.emptyRange': '這個範圍沒有活動。',
    'history.noActivityMap': '還沒有活動可以顯示。',
    'history.noActivityYet': '還沒有活動',
    'history.showPoints': '顯示 {date} 的得分方式',
    'history.pointsDialog': '得分明細',
    'history.pointsAnkiReviews': 'Anki 複習',
    'history.pointsReviewsCount': '{count} 張複習',
    'history.pointsDailyTotal': '當日總分',
    'history.pointsRounding': '向下取整',
    'history.pointsNone': '沒有得分',
    'history.today': '今天',
    'history.yesterday': '昨天',
    'history.tooltip.videoTime': '影片時間',
    'history.tooltip.videosWatched': '已看影片',
    'history.tooltip.ankiReviewed': 'Anki 複習',
    'history.tooltip.ankiCreated': '新增 Anki 卡',
    'history.tooltip.points': '{count} 分',
    'history.heatmapAria': '{date}：{points} 分；{time} 影片時間；已看 {videos} 部影片；複習 {reviewed} 張 Anki 卡；新增 {created} 張 Anki 卡',
    'videos.title': '影片',
    'videos.status.all': '全部',
    'videos.status.watchLater': '稍後觀看',
    'videos.status.unwatched': '未觀看',
    'videos.status.partial': '進行中',
    'videos.status.watched': '已看',
    'videos.channels.all': '全部頻道',
    'videos.channels.none': '沒有頻道',
    'videos.manual.button': '+ 已看網址',
    'videos.manual.dialog': '新增已看的 YouTube 網址',
    'videos.manual.add': '新增',
    'videos.undo': '復原',
    'videos.redo': '重做',
    'videos.undo.empty': '沒有可復原動作',
    'videos.redo.empty': '沒有可重做動作',
    'videos.watchedSection': '已看',
    'videos.empty.default': '還沒有影片。Edenia 會自動載入你的影片清單。',
    'videos.empty.activeBelow': '目前沒有待看影片。已看影片在下方。',
    'videos.search.empty': '依標題或頻道搜尋已儲存影片。',
    'videos.search.noMatches': '找不到符合的影片。',
    'videos.card.markWatched': '標記已看',
    'videos.card.markWatchedTitle': '標記為已看',
    'videos.card.unmark': '取消標記',
    'videos.card.clear': '清除',
    'videos.card.resume': '繼續觀看',
    'videos.card.continueAt': '繼續於',
    'activity.empty': '還沒有活動紀錄',
    'activity.auto': '自動',
    'activity.user': '使用者',
    'activity.done': '完成',
    'backups.empty': '還沒有本機備份',
    'backups.restore': '復原',
    'time.today': '今天',
    'time.yesterday': '昨天',
    'time.tomorrow': '明天',
    'time.inDays': '{count} 天後',
    'time.daysAgo': '{count} 天前',
    'time.weekAgo': '1 週前',
    'time.weeksAgo': '{count} 週前',
    'time.monthsAgo': '{count} 個月前',
    'time.hourShort': '小時',
    'time.hoursMinutesCompact': '{hours} 小時 {minutes} 分',
    'time.hoursCompact': '{hours} 小時',
    'time.minutesCompact': '{minutes} 分',
    'time.watchedToday': '今天觀看',
    'time.watchedYesterday': '昨天觀看',
    'time.watchedDaysAgo': '{count} 天前觀看',
    'time.watchedWeekAgo': '1 週前觀看',
    'time.watchedWeeksAgo': '{count} 週前觀看',
    'time.watchedDate': '{date} 觀看',
    'time.weekLabel': '第 {week} 週 · {start} - {end}',
    'time.hoursMinutes': '{hours} 小時 {minutes} 分鐘',
    'time.hours': '{hours} 小時',
    'time.minutes': '{minutes} 分鐘',
    'points.short': '分',
    'points.one': '{count} 分',
    'points.many': '{count} 分',
    'city.timelineAria': '{date}，{points} 分{changed}',
    'city.timelineChanged': '，小鎮圖片已改變',
    'time.notYet': '尚未',
    'time.justNow': '剛剛',
    'time.notRefreshedYet': '尚未刷新',
    'time.lastRefreshed': '上次刷新：{time}',
    'toast.localeChanged': '語言已改為 {language}',
    'walkthrough.next': '下一步',
    'walkthrough.back': '上一步',
    'walkthrough.skip': '略過',
    'walkthrough.done': '完成',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': '這是你的浮空小鎮。你學習時，小鎮會一點一點成長，讓你不用讀很多數字也能快速看見進度。',
    'walkthrough.weeklyGoal': '這是你的每週目標。你看過的學習影片時間會填滿進度條，幫你知道這週是否跟上目標。',
    'walkthrough.studyHistory': '學習紀錄會顯示你一段時間內做了什麼。它會把看過的影片和 Anki 複習放在一起，讓你看懂真正的學習節奏。',
    'walkthrough.historyViews': '摘要適合看清楚的數字，熱力圖適合快速看哪些天有學習。Edenia 會記住你偏好的視圖。',
    'walkthrough.videos': '這裡是影片區。你加入的頻道會出現新影片，已看影片會移到下方的已看區。',
    'walkthrough.videoFilters': '這些控制可以讓清單更好管理。你可以依狀態或頻道篩選，新增已看的網址，也可以修正誤點。',
    'walkthrough.manualWatchedUrl': '如果你看的 YouTube 影片不在頻道清單裡，可以用已看網址。貼上連結後，它會算進你的進度。',
    'walkthrough.undoRedo': '復原和重做可以幫你修正誤點。打開清單，選一個動作，Edenia 會重新計算分數和紀錄。',
    'walkthrough.settings': '準備設定 Edenia 時，請點設定。你可以在這裡加入 YouTube 頻道、選每週目標，並保護進度資料。',
    'walkthrough.clickSettings': '點設定',
    'walkthrough.channels': '在這裡加入 YouTube 頻道。你可以貼上頻道網址、@handle 或頻道 ID。Edenia 會用它們尋找最近的學習影片，讓你不用每次都去 YouTube 找。',
    'walkthrough.shortVideos': '這個設定控制短影片。關閉後，Edenia 會跳過並隱藏 3 分鐘以下的影片，讓清單更專注。',
    'walkthrough.settingsWeeklyGoal': '你可以在這裡改每週目標。這只會改你想達成的目標，不會清除紀錄。',
    'walkthrough.syncFiles': '同步檔可以把進度搬到其他瀏覽器或裝置。先在這裡匯出，再到另一邊匯入。',
    'walkthrough.localBackups': '最近本機備份可以在匯入、復原、重置或儲存出錯後幫你回到較安全的狀態。',
    'walkthrough.activityLog': '活動紀錄會安靜地記下發生過的事，例如你的操作、YouTube 刷新、Anki 更新、匯入和問題。',
    'walkthrough.replay': '如果想再看一次導覽，可以用再次顯示導覽。新功能加入或分享給別人時很有用。',
    'walkthrough.resetSafety': '全部重置會重新開始，但 Edenia 會先保留回復備份。請小心使用，想要瀏覽器外的保護時請匯出同步檔。'
  },
  'zh-Hans': {
    ...I18N_EN,
    'settings.title': '设置',
    'settings.close': '关闭设置',
    'settings.language.label': '语言',
    'settings.weeklyGoal.label': '每周目标（小时）',
    'settings.channels.label': '频道',
    'settings.channels.placeholder': '频道网址或 ID',
    'settings.channels.add': '添加',
    'settings.channels.hint': '粘贴 YouTube 频道网址、@handle 或频道 ID。建议格式：youtube.com/@channel 或 youtube.com/channel/UCxxxxxxxx。',
    'settings.shorts.label': '显示短视频',
    'settings.shorts.hint': '关闭时，刷新会跳过 3 分钟以下的视频，并从主要视频列表隐藏。',
    'settings.activity.title': '活动记录',
    'settings.activity.all': '全部',
    'settings.activity.user': '用户',
    'settings.activity.auto': '自动',
    'settings.activity.issues': '问题',
    'settings.refresh': '刷新',
    'settings.sync.export': '导出同步文件',
    'settings.sync.import': '导入同步文件',
    'settings.sync.note': '进度会保存在这个浏览器。使用同步文件可以把同一份进度带到其他设备或浏览器。',
    'settings.walkthroughAgain': '再次显示导览',
    'settings.backups.title': '最近本地备份',
    'settings.backups.note': '本地备份可以在导入、重置或保存出错后恢复。若要保护到浏览器之外，请导出同步文件。',
    'settings.reset.open': '全部重置',
    'settings.reset.warning': '这会清除本地观看记录、连续天数、设置与缓存的 Anki 统计。这里会先保留一份回滚备份。你的 Anki 牌组不会被更改。',
    'settings.reset.cancel': '取消',
    'settings.reset.delete': '删除数据',
    'toast.channelInvalid': '请使用 YouTube 频道网址、@handle 或 UC 频道 ID',
    'toast.channelResolveNeedsKey': '若要使用 @handle 或 /user 网址，请先加入共享 YouTube API key；或粘贴 /channel/UC... 网址。',
    'toast.channelResolveNotFound': '找不到这个 YouTube 频道',
    'toast.channelCustomUrlUnsupported': '这种自定义频道网址目前无法可靠解析。请试试 /channel/UC... 网址或 @handle。',
    'header.sandbox': '沙盒版本',
    'header.search.title': '搜索视频',
    'header.search.placeholder': '搜索视频...',
    'header.theme.dark': '切换到深色模式',
    'header.theme.light': '切换到浅色模式',
    'streak.day': '天连续',
    'sandbox.addDay': '添加一天',
    'sandbox.reset': '重置',
    'city.levelUp': '升级',
    'city.totalPts': '总分',
    'city.ptsByThen': '当时分数',
    'city.readyNext': '可以升到下一级',
    'city.ptsToNext': '还差 {count} 分到下一级',
    'city.maxLevel': '最高等级',
    'city.level.0': '🏠 孤单的小屋',
    'city.level.1': '⛵ 你的小屋焕然一新！还多了一艘船！',
    'city.level.2': '🏝️ 看！一座小小岛！好可爱。',
    'city.level.3': '孩子们现在会玩得很开心！',
    'city.level.4': '来加一个泳池放松一下',
    'city.level.5': '哦！有朋友要来打招呼了...',
    'city.level.6': '你的小岛扩大了！',
    'city.level.7': '漂亮的躺椅和可爱的花！🌸',
    'goal.title': '每周目标',
    'goal.watched': '已看',
    'goal.inProgress': '进行中',
    'goal.toGo': '还差',
    'history.title': '学习记录',
    'history.summary': '摘要',
    'history.heatmap': '热力图',
    'history.week': '周',
    'history.month': '月',
    'history.videoTime': '视频时间',
    'history.videosWatched': '已看视频',
    'history.ankiReviewed': '已复习 Anki 卡',
    'history.ankiCreated': '新增 Anki 卡',
    'history.table.date': '日期',
    'history.table.video': '视频',
    'history.table.watched': '已看',
    'history.table.points': '分数',
    'history.emptyRange': '这个范围没有活动。',
    'history.showPoints': '显示 {date} 的得分方式',
    'history.pointsDialog': '得分明细',
    'history.pointsAnkiReviews': 'Anki 复习',
    'history.pointsReviewsCount': '{count} 张复习',
    'history.pointsDailyTotal': '当日总分',
    'history.pointsRounding': '向下取整',
    'history.pointsNone': '没有得分',
    'history.heatmapAria': '{date}：{points} 分；{time} 视频时间；已看 {videos} 部视频；复习 {reviewed} 张 Anki 卡；新增 {created} 张 Anki 卡',
    'history.tooltip.points': '{count} 分',
    'videos.title': '视频',
    'videos.status.all': '全部',
    'videos.status.watchLater': '稍后观看',
    'videos.status.unwatched': '未观看',
    'videos.status.partial': '进行中',
    'videos.status.watched': '已看',
    'videos.channels.all': '全部频道',
    'videos.channels.none': '没有频道',
    'videos.manual.button': '+ 已看网址',
    'videos.manual.add': '添加',
    'videos.undo': '撤销',
    'videos.redo': '重做',
    'videos.watchedSection': '已看',
    'videos.empty.default': '还没有视频。Edenia 会自动加载你的视频列表。',
    'videos.search.empty': '按标题或频道搜索已保存视频。',
    'videos.card.markWatched': '标记已看',
    'videos.card.unmark': '取消标记',
    'videos.card.resume': '继续观看',
    'videos.card.continueAt': '继续于',
    'activity.empty': '还没有活动记录',
    'backups.empty': '还没有本地备份',
    'backups.restore': '恢复',
    'time.today': '今天',
    'time.yesterday': '昨天',
    'time.tomorrow': '明天',
    'time.inDays': '{count} 天后',
    'time.daysAgo': '{count} 天前',
    'time.weekAgo': '1 周前',
    'time.weeksAgo': '{count} 周前',
    'time.monthsAgo': '{count} 个月前',
    'time.hourShort': '小时',
    'time.hoursMinutesCompact': '{hours} 小时 {minutes} 分',
    'time.hoursCompact': '{hours} 小时',
    'time.minutesCompact': '{minutes} 分',
    'time.watchedToday': '今天观看',
    'time.watchedYesterday': '昨天观看',
    'time.watchedDaysAgo': '{count} 天前观看',
    'time.watchedWeekAgo': '1 周前观看',
    'time.watchedWeeksAgo': '{count} 周前观看',
    'time.watchedDate': '{date} 观看',
    'time.weekLabel': '第 {week} 周 · {start} - {end}',
    'time.hoursMinutes': '{hours} 小时 {minutes} 分钟',
    'time.hours': '{hours} 小时',
    'time.minutes': '{minutes} 分钟',
    'points.short': '分',
    'points.one': '{count} 分',
    'points.many': '{count} 分',
    'city.timelineAria': '{date}，{points} 分{changed}',
    'city.timelineChanged': '，小镇图片已改变',
    'time.notYet': '尚未',
    'time.justNow': '刚刚',
    'time.notRefreshedYet': '尚未刷新',
    'time.lastRefreshed': '上次刷新：{time}',
    'toast.localeChanged': '语言已改为 {language}',
    'walkthrough.next': '下一步',
    'walkthrough.back': '上一步',
    'walkthrough.skip': '跳过',
    'walkthrough.done': '完成',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': '这是你的浮空小镇。你学习时，小镇会一点一点成长，让你不用读很多数字也能快速看到进度。',
    'walkthrough.weeklyGoal': '这是你的每周目标。你看过的学习视频时间会填满进度条，帮助你知道这周是否跟上目标。',
    'walkthrough.studyHistory': '学习记录会显示你一段时间内做了什么。它会把看过的视频和 Anki 复习放在一起，让你看懂真正的学习节奏。',
    'walkthrough.historyViews': '摘要适合看清楚的数字，热力图适合快速看哪些天有学习。Edenia 会记住你偏好的视图。',
    'walkthrough.videos': '这里是视频区。你加入的频道会出现新视频，已看视频会移到下方的已看区。',
    'walkthrough.videoFilters': '这些控制可以让列表更好管理。你可以按状态或频道筛选，添加已看的网址，也可以修正误点。',
    'walkthrough.manualWatchedUrl': '如果你看的 YouTube 视频不在频道列表里，可以用已看网址。粘贴链接后，它会算进你的进度。',
    'walkthrough.undoRedo': '撤销和重做可以帮你修正误点。打开列表，选一个动作，Edenia 会重新计算分数和记录。',
    'walkthrough.settings': '准备设置 Edenia 时，请点设置。你可以在这里添加 YouTube 频道、选择每周目标，并保护进度数据。',
    'walkthrough.clickSettings': '点设置',
    'walkthrough.channels': '在这里添加 YouTube 频道。你可以粘贴频道网址、@handle 或频道 ID。Edenia 会用它们寻找最近的学习视频，让你不用每次都去 YouTube 找。',
    'walkthrough.shortVideos': '这个设置控制短视频。关闭后，Edenia 会跳过并隐藏 3 分钟以下的视频，让列表更专注。',
    'walkthrough.settingsWeeklyGoal': '你可以在这里改每周目标。这只会改你想达成的目标，不会清除记录。',
    'walkthrough.syncFiles': '同步文件可以把进度搬到其他浏览器或设备。先在这里导出，再到另一边导入。',
    'walkthrough.localBackups': '最近本地备份可以在导入、恢复、重置或保存出错后帮你回到较安全的状态。',
    'walkthrough.activityLog': '活动记录会安静地记下发生过的事，例如你的操作、YouTube 刷新、Anki 更新、导入和问题。',
    'walkthrough.replay': '如果想再看一次导览，可以用再次显示导览。新功能加入或分享给别人时很有用。',
    'walkthrough.resetSafety': '全部重置会重新开始，但 Edenia 会先保留回滚备份。请小心使用，想要浏览器外的保护时请导出同步文件。'
  },
  es: {
    ...I18N_EN,
    'settings.title': 'Ajustes',
    'settings.close': 'Cerrar ajustes',
    'settings.language.label': 'Idioma',
    'settings.weeklyGoal.label': 'Objetivo semanal (horas)',
    'settings.channels.label': 'Canales',
    'settings.channels.placeholder': 'URL o ID del canal',
    'settings.channels.add': 'Añadir',
    'settings.channels.hint': 'Pega una URL de canal de YouTube, @handle o ID del canal. Mejores ejemplos: youtube.com/@channel o youtube.com/channel/UCxxxxxxxx.',
    'settings.shorts.label': 'Mostrar videos cortos',
    'settings.shorts.hint': 'Si está desactivado, los videos de menos de 3 minutos se omiten al actualizar y se ocultan de la lista activa.',
    'settings.activity.title': 'Registro de actividad',
    'settings.activity.all': 'Todo',
    'settings.activity.user': 'Usuario',
    'settings.activity.auto': 'Auto',
    'settings.activity.issues': 'Problemas',
    'settings.refresh': 'Actualizar',
    'settings.sync.export': 'Exportar archivo',
    'settings.sync.import': 'Importar archivo',
    'settings.sync.note': 'El progreso se guarda en este navegador. Usa archivos de sincronización para copiarlo a otro dispositivo o navegador.',
    'settings.walkthroughAgain': 'Ver guía otra vez',
    'settings.backups.title': 'Copias locales recientes',
    'settings.backups.note': 'Las copias locales ayudan después de una mala importación, un reinicio o un error de guardado. Exporta un archivo para protegerte fuera de este navegador.',
    'settings.reset.open': 'Restablecer todo',
    'settings.reset.warning': 'Esto borrará el historial local de videos, la racha, los ajustes y las estadísticas de Anki en caché. Se guardará una copia de recuperación aquí. Tu colección de Anki no cambiará.',
    'settings.reset.cancel': 'Cancelar',
    'settings.reset.delete': 'Borrar datos',
    'toast.channelInvalid': 'Usa una URL de canal de YouTube, @handle o ID de canal UC',
    'toast.channelResolveNeedsKey': 'Añade la clave compartida de YouTube API para usar URLs @handle o /user, o pega la URL /channel/UC...',
    'toast.channelResolveNotFound': 'No se encontró ese canal de YouTube',
    'toast.channelCustomUrlUnsupported': 'Esa URL personalizada del canal aún no se puede resolver de forma fiable. Prueba la URL /channel/UC... o @handle.',
    'header.sandbox': 'Versión sandbox',
    'header.search.title': 'Buscar videos',
    'header.search.placeholder': 'Buscar videos...',
    'header.theme.dark': 'Cambiar a modo oscuro',
    'header.theme.light': 'Cambiar a modo claro',
    'streak.day': 'días de racha',
    'sandbox.addDay': 'Añadir día',
    'sandbox.reset': 'Restablecer',
    'city.levelUp': 'Subir nivel',
    'city.totalPts': 'pts totales',
    'city.ptsByThen': 'pts hasta entonces',
    'city.readyNext': 'Listo para el siguiente nivel',
    'city.ptsToNext': '{count} pts para el siguiente nivel',
    'city.maxLevel': 'Nivel máximo',
    'city.level.0': '🏠 Casa solitaria',
    'city.level.1': '⛵ ¡Tu casa recibió una mejora! ¡Y un barco!',
    'city.level.2': '🏝️ ¡Mira! ¡Una isla pequeña! Qué linda.',
    'city.level.3': '¡Ahora los niños se van a divertir!',
    'city.level.4': 'Añadamos una piscina para relajarnos',
    'city.level.5': '¡Oh! Vienen algunos amigos a saludar...',
    'city.level.6': '¡Expandiste tu pequeña isla!',
    'city.level.7': '¡Una linda reposera y flores bonitas! 🌸',
    'goal.title': 'Objetivo semanal',
    'goal.watched': 'vistos',
    'goal.inProgress': 'en progreso',
    'goal.toGo': 'restantes',
    'history.title': 'Historial de estudio',
    'history.summary': 'Resumen',
    'history.heatmap': 'Mapa',
    'history.week': 'Semana',
    'history.month': 'Mes',
    'history.videoTime': 'tiempo de video',
    'history.videosWatched': 'videos vistos',
    'history.ankiReviewed': 'tarjetas Anki repasadas',
    'history.ankiCreated': 'tarjetas Anki nuevas',
    'history.table.date': 'Fecha',
    'history.table.video': 'Video',
    'history.table.watched': 'Vistos',
    'history.table.points': 'PTS',
    'history.emptyRange': 'No hay actividad en este rango.',
    'history.showPoints': 'Mostrar puntos ganados el {date}',
    'history.pointsDialog': 'Detalle de puntos',
    'history.pointsAnkiReviews': 'Repasos de Anki',
    'history.pointsReviewsCount': '{count} repasos',
    'history.pointsDailyTotal': 'Total del día',
    'history.pointsRounding': 'redondeado hacia abajo',
    'history.pointsNone': 'No se ganaron puntos',
    'history.heatmapAria': '{date}: {points} puntos; {time} de video; {videos} videos vistos; {reviewed} tarjetas Anki repasadas; {created} tarjetas Anki nuevas',
    'history.tooltip.points': '{count} pts',
    'history.today': 'Hoy',
    'history.yesterday': 'Ayer',
    'videos.title': 'Videos',
    'videos.status.all': 'Todo',
    'videos.status.watchLater': 'Ver luego',
    'videos.status.unwatched': 'Sin ver',
    'videos.status.partial': 'En progreso',
    'videos.status.watched': 'Visto',
    'videos.channels.all': 'Todos los canales',
    'videos.channels.none': 'Sin canales',
    'videos.manual.button': '+ URL vista',
    'videos.manual.add': 'Añadir',
    'videos.undo': 'Deshacer',
    'videos.redo': 'Rehacer',
    'videos.watchedSection': 'Vistos',
    'videos.empty.default': 'Aún no hay videos. Edenia carga tu feed automáticamente.',
    'videos.search.empty': 'Busca videos guardados por título o canal.',
    'videos.card.markWatched': 'Marcar visto',
    'videos.card.unmark': 'Desmarcar',
    'videos.card.resume': 'Continuar viendo',
    'videos.card.continueAt': 'Continuar en',
    'activity.empty': 'Aún no hay actividad registrada',
    'backups.empty': 'Aún no hay copias locales',
    'backups.restore': 'Restaurar',
    'time.today': 'hoy',
    'time.yesterday': 'ayer',
    'time.tomorrow': 'mañana',
    'time.inDays': 'en {count} d',
    'time.daysAgo': 'hace {count} d',
    'time.weekAgo': 'hace 1 semana',
    'time.weeksAgo': 'hace {count} sem',
    'time.monthsAgo': 'hace {count} meses',
    'time.hourShort': 'h',
    'time.hoursMinutesCompact': '{hours} h {minutes} min',
    'time.hoursCompact': '{hours} h',
    'time.minutesCompact': '{minutes} min',
    'time.watchedToday': 'Visto hoy',
    'time.watchedYesterday': 'Visto ayer',
    'time.watchedDaysAgo': 'Visto hace {count} d',
    'time.watchedWeekAgo': 'Visto hace 1 semana',
    'time.watchedWeeksAgo': 'Visto hace {count} sem',
    'time.watchedDate': 'Visto el {date}',
    'time.weekLabel': 'Semana {week} · {start} - {end}',
    'time.hoursMinutes': '{hours} h {minutes} min',
    'time.hours': '{hours} h',
    'time.minutes': '{minutes} min',
    'points.short': 'pts',
    'points.one': '{count} pto',
    'points.many': '{count} pts',
    'city.timelineAria': '{date}, {points} pts{changed}',
    'city.timelineChanged': ', imagen de ciudad cambiada',
    'time.notYet': 'Aún no',
    'time.justNow': 'ahora mismo',
    'time.notRefreshedYet': 'Aún no actualizado',
    'time.lastRefreshed': 'Última actualización: {time}',
    'toast.localeChanged': 'Idioma cambiado a {language}',
    'walkthrough.next': 'Siguiente',
    'walkthrough.back': 'Atrás',
    'walkthrough.skip': 'Saltar',
    'walkthrough.done': 'Listo',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': 'Este es tu pueblo flotante. Cuando estudias, crece poco a poco. Te da una imagen rápida de tu progreso sin tener que leer todos los números.',
    'walkthrough.weeklyGoal': 'Este es tu objetivo semanal. El tiempo de videos estudiados llena la barra, para que veas rápido si vas bien esta semana.',
    'walkthrough.studyHistory': 'El historial de estudio muestra lo que pasó con el tiempo. Junta videos vistos y repasos de Anki para que entiendas tu ritmo real.',
    'walkthrough.historyViews': 'Usa Resumen para ver números claros, y Mapa para ver tus días activos de un vistazo. Edenia recuerda la vista que prefieres.',
    'walkthrough.videos': 'Esta es la zona de videos. Aquí aparecen videos nuevos de tus canales, y los videos vistos pasan a la sección Vistos.',
    'walkthrough.videoFilters': 'Estos controles ayudan a mantener la lista clara. Puedes filtrar por estado, filtrar por canal, añadir una URL vista y corregir errores.',
    'walkthrough.manualWatchedUrl': 'Usa URL vista cuando estudiaste con un video de YouTube que no está en tus canales. Pega el enlace y contará para tu progreso.',
    'walkthrough.undoRedo': 'Deshacer y Rehacer te ayudan si haces clic por error. Abre la lista, elige la acción y Edenia recalculará el puntaje y el historial.',
    'walkthrough.settings': 'Haz clic en Ajustes cuando quieras configurar Edenia. Aquí añades canales de YouTube, eliges tu objetivo semanal y proteges tu progreso.',
    'walkthrough.clickSettings': 'Abrir ajustes',
    'walkthrough.channels': 'Añade canales de YouTube aquí. Puedes pegar una URL del canal, @handle o ID. Edenia los usa para encontrar videos recientes de estudio y mantener la lista fresca.',
    'walkthrough.shortVideos': 'Este ajuste controla los videos cortos. Desactívalo si quieres que Edenia salte y oculte videos de menos de 3 minutos.',
    'walkthrough.settingsWeeklyGoal': 'Puedes cambiar tu objetivo semanal aquí. Solo cambia la meta; no borra tu historial.',
    'walkthrough.syncFiles': 'Los archivos de sincronización sirven para mover tu progreso a otro navegador o dispositivo. Exporta aquí e importa allí.',
    'walkthrough.localBackups': 'Las copias locales recientes ayudan después de acciones riesgosas como importar, restaurar, reiniciar o un mal guardado.',
    'walkthrough.activityLog': 'El registro de actividad guarda con calma lo que pasó: tus acciones, actualizaciones de YouTube, Anki, importaciones y problemas.',
    'walkthrough.replay': 'Si quieres ver esta guía otra vez, usa Ver guía otra vez. Es útil después de nuevas funciones o al compartir Edenia.',
    'walkthrough.resetSafety': 'Restablecer todo empieza de cero, pero Edenia guarda primero una copia de recuperación. Úsalo con cuidado y exporta un archivo para protegerte fuera del navegador.'
  },
  fr: {
    ...I18N_EN,
    'settings.title': 'Réglages',
    'settings.close': 'Fermer les réglages',
    'settings.language.label': 'Langue',
    'settings.weeklyGoal.label': 'Objectif hebdomadaire (heures)',
    'settings.channels.label': 'Chaînes',
    'settings.channels.placeholder': 'URL ou ID de la chaîne',
    'settings.channels.add': 'Ajouter',
    'settings.channels.hint': 'Collez une URL de chaîne YouTube, un @handle ou un ID de chaîne. Exemples conseillés : youtube.com/@channel ou youtube.com/channel/UCxxxxxxxx.',
    'settings.shorts.label': 'Afficher les vidéos courtes',
    'settings.shorts.hint': 'Quand c’est désactivé, les vidéos de moins de 3 minutes sont ignorées au rafraîchissement et cachées de la liste active.',
    'settings.activity.title': 'Journal d’activité',
    'settings.activity.all': 'Tout',
    'settings.activity.user': 'Utilisateur',
    'settings.activity.auto': 'Auto',
    'settings.activity.issues': 'Problèmes',
    'settings.refresh': 'Actualiser',
    'settings.sync.export': 'Exporter le fichier',
    'settings.sync.import': 'Importer le fichier',
    'settings.sync.note': 'La progression est enregistrée dans ce navigateur. Utilisez les fichiers de synchronisation pour la copier sur un autre appareil ou navigateur.',
    'settings.walkthroughAgain': 'Revoir la visite guidée',
    'settings.backups.title': 'Sauvegardes locales récentes',
    'settings.backups.note': 'Les sauvegardes locales aident après une mauvaise importation, une réinitialisation ou une erreur de sauvegarde. Exportez un fichier pour protéger vos données hors de ce navigateur.',
    'settings.reset.open': 'Tout réinitialiser',
    'settings.reset.warning': 'Cela effacera l’historique local, la série, les réglages et les statistiques Anki mises en cache. Une sauvegarde de retour arrière sera gardée ici. Votre collection Anki ne sera pas modifiée.',
    'settings.reset.cancel': 'Annuler',
    'settings.reset.delete': 'Supprimer les données',
    'toast.channelInvalid': 'Utilisez une URL de chaîne YouTube, un @handle ou un ID de chaîne UC',
    'toast.channelResolveNeedsKey': 'Ajoutez la clé YouTube API partagée pour utiliser les URL @handle ou /user, ou collez l’URL /channel/UC...',
    'toast.channelResolveNotFound': 'Impossible de trouver cette chaîne YouTube',
    'toast.channelCustomUrlUnsupported': 'Cette URL personnalisée de chaîne ne peut pas encore être résolue de façon fiable. Essayez l’URL /channel/UC... ou @handle.',
    'header.sandbox': 'Version sandbox',
    'header.search.title': 'Rechercher des vidéos',
    'header.search.placeholder': 'Rechercher des vidéos...',
    'header.theme.dark': 'Passer en mode sombre',
    'header.theme.light': 'Passer en mode clair',
    'streak.day': 'jours de série',
    'sandbox.addDay': 'Ajouter un jour',
    'sandbox.reset': 'Réinitialiser',
    'city.levelUp': 'Niveau suivant',
    'city.totalPts': 'pts au total',
    'city.ptsByThen': 'pts jusque-là',
    'city.readyNext': 'Prêt pour le niveau suivant',
    'city.ptsToNext': '{count} pts avant le niveau suivant',
    'city.maxLevel': 'Niveau maximum',
    'city.level.0': '🏠 Maison solitaire',
    'city.level.1': '⛵ Votre maison a fière allure ! Et il y a un bateau !',
    'city.level.2': '🏝️ Oh ! Une toute petite île ! Adorable.',
    'city.level.3': 'Les enfants vont pouvoir s’amuser maintenant !',
    'city.level.4': 'Ajoutons une piscine pour se détendre',
    'city.level.5': 'Oh ! Des amis arrivent dire bonjour...',
    'city.level.6': 'Vous avez agrandi votre petite île !',
    'city.level.7': 'Une belle chaise longue et de jolies fleurs ! 🌸',
    'goal.title': 'Objectif hebdomadaire',
    'goal.watched': 'vues',
    'goal.inProgress': 'en cours',
    'goal.toGo': 'restant',
    'history.title': 'Historique d’étude',
    'history.summary': 'Résumé',
    'history.heatmap': 'Carte',
    'history.week': 'Semaine',
    'history.month': 'Mois',
    'history.videoTime': 'temps vidéo',
    'history.videosWatched': 'vidéos vues',
    'history.ankiReviewed': 'cartes Anki révisées',
    'history.ankiCreated': 'nouvelles cartes Anki',
    'history.table.date': 'Date',
    'history.table.video': 'Vidéo',
    'history.table.watched': 'Vues',
    'history.table.points': 'PTS',
    'history.emptyRange': 'Aucune activité dans cette période.',
    'history.showPoints': 'Afficher les points gagnés le {date}',
    'history.pointsDialog': 'Détail des points',
    'history.pointsAnkiReviews': 'Révisions Anki',
    'history.pointsReviewsCount': '{count} révisions',
    'history.pointsDailyTotal': 'Total du jour',
    'history.pointsRounding': 'arrondi vers le bas',
    'history.pointsNone': 'Aucun point gagné',
    'history.heatmapAria': '{date} : {points} points ; {time} de vidéo ; {videos} vidéos vues ; {reviewed} cartes Anki révisées ; {created} nouvelles cartes Anki',
    'history.tooltip.points': '{count} pts',
    'history.today': 'Aujourd’hui',
    'history.yesterday': 'Hier',
    'videos.title': 'Vidéos',
    'videos.status.all': 'Tout',
    'videos.status.watchLater': 'À voir',
    'videos.status.unwatched': 'Non vue',
    'videos.status.partial': 'En cours',
    'videos.status.watched': 'Vue',
    'videos.channels.all': 'Toutes les chaînes',
    'videos.channels.none': 'Aucune chaîne',
    'videos.manual.button': '+ URL vue',
    'videos.manual.add': 'Ajouter',
    'videos.undo': 'Annuler',
    'videos.redo': 'Rétablir',
    'videos.watchedSection': 'Vues',
    'videos.empty.default': 'Aucune vidéo pour l’instant. Edenia charge votre liste automatiquement.',
    'videos.search.empty': 'Recherchez les vidéos enregistrées par titre ou chaîne.',
    'videos.card.markWatched': 'Marquer vue',
    'videos.card.unmark': 'Retirer',
    'videos.card.resume': 'Continuer',
    'videos.card.continueAt': 'Reprendre à',
    'activity.empty': 'Aucune activité enregistrée',
    'backups.empty': 'Aucune sauvegarde locale',
    'backups.restore': 'Restaurer',
    'time.today': 'aujourd’hui',
    'time.yesterday': 'hier',
    'time.tomorrow': 'demain',
    'time.inDays': 'dans {count} j',
    'time.daysAgo': 'il y a {count} j',
    'time.weekAgo': 'il y a 1 semaine',
    'time.weeksAgo': 'il y a {count} sem',
    'time.monthsAgo': 'il y a {count} mois',
    'time.hourShort': 'h',
    'time.hoursMinutesCompact': '{hours} h {minutes} min',
    'time.hoursCompact': '{hours} h',
    'time.minutesCompact': '{minutes} min',
    'time.watchedToday': 'Vue aujourd’hui',
    'time.watchedYesterday': 'Vue hier',
    'time.watchedDaysAgo': 'Vue il y a {count} j',
    'time.watchedWeekAgo': 'Vue il y a 1 semaine',
    'time.watchedWeeksAgo': 'Vue il y a {count} sem',
    'time.watchedDate': 'Vue le {date}',
    'time.weekLabel': 'Semaine {week} · {start} - {end}',
    'time.hoursMinutes': '{hours} h {minutes} min',
    'time.hours': '{hours} h',
    'time.minutes': '{minutes} min',
    'points.short': 'pts',
    'points.one': '{count} pt',
    'points.many': '{count} pts',
    'city.timelineAria': '{date}, {points} pts{changed}',
    'city.timelineChanged': ', image de ville modifiée',
    'time.notYet': 'Pas encore',
    'time.justNow': 'à l’instant',
    'time.notRefreshedYet': 'Pas encore actualisé',
    'time.lastRefreshed': 'Dernière actualisation : {time}',
    'toast.localeChanged': 'Langue changée en {language}',
    'walkthrough.next': 'Suivant',
    'walkthrough.back': 'Retour',
    'walkthrough.skip': 'Passer',
    'walkthrough.done': 'Terminé',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': 'Voici votre ville flottante. Quand vous étudiez, elle grandit peu à peu. Elle donne une image rapide de vos progrès sans lire tous les chiffres.',
    'walkthrough.weeklyGoal': 'Voici votre objectif hebdomadaire. Le temps de vidéos étudiées remplit la barre, pour voir vite si vous êtes sur la bonne voie.',
    'walkthrough.studyHistory': 'L’historique d’étude montre ce qui s’est passé au fil du temps. Il réunit les vidéos vues et les révisions Anki pour montrer votre vrai rythme.',
    'walkthrough.historyViews': 'Utilisez Résumé pour des chiffres clairs, et Carte pour voir vos jours actifs en un coup d’œil. Edenia mémorise votre vue préférée.',
    'walkthrough.videos': 'Voici la zone des vidéos. Les nouvelles vidéos de vos chaînes apparaissent ici, et les vidéos vues passent dans la section Vues.',
    'walkthrough.videoFilters': 'Ces contrôles gardent la liste lisible. Vous pouvez filtrer par statut, par chaîne, ajouter une URL vue et corriger les erreurs.',
    'walkthrough.manualWatchedUrl': 'Utilisez URL vue quand vous avez étudié avec une vidéo YouTube absente de vos chaînes. Collez le lien et elle comptera dans vos progrès.',
    'walkthrough.undoRedo': 'Annuler et Rétablir aident après un clic accidentel. Ouvrez la liste, choisissez l’action, et Edenia recalculera le score et l’historique.',
    'walkthrough.settings': 'Cliquez sur Réglages pour configurer Edenia. Vous pouvez y ajouter vos chaînes YouTube, choisir votre objectif hebdomadaire et protéger vos données.',
    'walkthrough.clickSettings': 'Ouvrir les réglages',
    'walkthrough.channels': 'Ajoutez vos chaînes YouTube ici. Vous pouvez coller une URL de chaîne, un @handle ou un ID. Edenia les utilise pour trouver des vidéos d’étude récentes et garder la liste à jour.',
    'walkthrough.shortVideos': 'Ce réglage contrôle les vidéos courtes. Désactivez-le pour ignorer et cacher les vidéos de moins de 3 minutes.',
    'walkthrough.settingsWeeklyGoal': 'Vous pouvez changer votre objectif hebdomadaire ici. Cela change seulement la cible, sans effacer votre historique.',
    'walkthrough.syncFiles': 'Les fichiers de synchronisation déplacent votre progression vers un autre navigateur ou appareil. Exportez ici, puis importez ailleurs.',
    'walkthrough.localBackups': 'Les sauvegardes locales récentes aident après une importation, une restauration, une réinitialisation ou une mauvaise sauvegarde.',
    'walkthrough.activityLog': 'Le journal d’activité garde une trace calme de ce qui arrive : actions, actualisations YouTube, Anki, importations et problèmes.',
    'walkthrough.replay': 'Pour revoir cette visite, utilisez Revoir la visite guidée. C’est utile après de nouvelles fonctions ou pour partager Edenia.',
    'walkthrough.resetSafety': 'Tout réinitialiser recommence à zéro, mais Edenia garde d’abord une sauvegarde de retour arrière. Utilisez-le avec prudence et exportez un fichier pour protéger vos données hors du navigateur.'
  }
}

const WALKTHROUGH_STEPS = [
  {
    id: 'town',
    target: '.city-image-wrap',
    textKey: 'walkthrough.town',
    placement: 'bottom'
  },
  {
    id: 'weekly-goal',
    target: '.goal-card',
    textKey: 'walkthrough.weeklyGoal',
    placement: 'bottom',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'study-history',
    target: '.study-history-section',
    textKey: 'walkthrough.studyHistory',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'history-views',
    target: '.history-view-tabs',
    textKey: 'walkthrough.historyViews',
    placement: 'bottom',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'videos',
    target: '.feed-section',
    textKey: 'walkthrough.videos',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'video-filters',
    target: '.feed-controls',
    textKey: 'walkthrough.videoFilters',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'manual-watched-url',
    target: '.manual-video',
    textKey: 'walkthrough.manualWatchedUrl',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'undo-redo',
    target: '.undo-wrap',
    textKey: 'walkthrough.undoRedo',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'settings',
    target: '.gear-btn',
    textKey: 'walkthrough.settings',
    placement: 'left',
    advanceOn: 'target-click',
    actionLabelKey: 'walkthrough.clickSettings',
    hooks: {
      beforeEnter: ['closeTransientUi', 'keepSettingsClosed'],
      targetClick: 'advanceAfterTargetClick'
    }
  },
  {
    id: 'channels',
    target: '.settings-channels-group',
    textKey: 'walkthrough.channels',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'short-videos-setting',
    target: '.settings-shorts-group',
    textKey: 'walkthrough.shortVideos',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'settings-weekly-goal',
    target: '.settings-goal-group',
    textKey: 'walkthrough.settingsWeeklyGoal',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'sync-files',
    target: '.sync-actions',
    textKey: 'walkthrough.syncFiles',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'local-backups',
    target: '.backup-panel',
    textKey: 'walkthrough.localBackups',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'activity-log',
    target: '.activity-log-panel',
    textKey: 'walkthrough.activityLog',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'walkthrough-replay',
    target: '.walkthrough-replay-btn',
    textKey: 'walkthrough.replay',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget'
    }
  },
  {
    id: 'reset-safety',
    target: '.settings-reset-btn',
    textKey: 'walkthrough.resetSafety',
    placement: 'left',
    hooks: {
      beforeEnter: ['keepSettingsOpen', 'closeTransientUi'],
      afterEnter: 'settleWalkthroughTarget',
      beforeExit: 'closeSettingsWhenCompleted'
    }
  }
]
const WALKTHROUGH_HOOKS = {
  closeTransientUi() {
    closeStatusFilterMenu()
    closeChannelFilterMenu()
    closeManualVideoPopover()
    closeHistoryVideoPopovers()
    closeHistoryPointsPopovers()
    closeHistoryPeriodPopovers()
    closeHistoryActionPopovers()
    hideHeatmapTooltip()
  },
  keepSettingsClosed() {
    closeSettings()
  },
  keepSettingsOpen() {
    const panel = document.getElementById('settingsPanel')
    if (!panel || panel.classList.contains('hidden')) openSettings()
  },
  settleWalkthroughTarget({ target }) {
    target?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest'
    })
    scheduleWalkthroughPosition()
    window.setTimeout(scheduleWalkthroughPosition, prefersReducedMotion() ? 0 : 180)
  },
  closeSettingsWhenCompleted({ completed }) {
    if (completed) closeSettings()
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

function normalizeLocale(locale) {
  const value = String(locale || '').trim()
  if (SUPPORTED_LOCALES.includes(value)) return value
  const lower = value.toLowerCase()
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant') return 'zh-Hant'
  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans') return 'zh-Hans'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('fr')) return 'fr'
  if (lower.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

function getBrowserDefaultLocale() {
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language]
  return normalizeLocale(candidates.find(Boolean) || DEFAULT_LOCALE)
}

function getLocaleLabel(locale = currentLocale) {
  const normalized = normalizeLocale(locale)
  return LOCALE_LABELS[normalized] || LOCALE_LABELS[DEFAULT_LOCALE]
}

function t(key, params = {}) {
  const dictionary = I18N[currentLocale] || I18N[DEFAULT_LOCALE]
  const template = dictionary?.[key] ?? I18N[DEFAULT_LOCALE]?.[key] ?? key
  return String(template).replace(/\{(\w+)\}/g, (_, name) => {
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
  })
}

function applyLocale(locale = currentLocale) {
  currentLocale = normalizeLocale(locale)
  document.documentElement.lang = currentLocale
  applyTranslations()
}

function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n)
  })
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder))
  })
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.dataset.i18nTitle))
  })
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel))
  })
  root.querySelectorAll('[data-i18n-alt]').forEach(el => {
    el.setAttribute('alt', t(el.dataset.i18nAlt))
  })
  renderLocaleSelect()
}

function renderLocaleSelect() {
  const select = document.getElementById('settingsLocale')
  if (!select) return
  select.innerHTML = SUPPORTED_LOCALES.map(locale => `
    <option value="${escHtml(locale)}" ${locale === currentLocale ? 'selected' : ''}>${escHtml(getLocaleLabel(locale))}</option>
  `).join('')
  select.value = currentLocale
}

function reportMissingI18nKeys() {
  const sourceKeys = Object.keys(I18N[DEFAULT_LOCALE] || {})
  const missing = SUPPORTED_LOCALES.flatMap(locale => {
    const dictionary = I18N[locale] || {}
    return sourceKeys
      .filter(key => !Object.prototype.hasOwnProperty.call(dictionary, key))
      .map(key => `${locale}:${key}`)
  })
  if (missing.length) console.warn('Missing Edenia translations:', missing)
  return missing
}

function formatLocaleDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(currentLocale, options)
}

function formatLocaleDateTime(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(currentLocale, options)
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

function getDefaultHistoryView() {
  return IS_SANDBOX ? 'heatmap' : 'summary'
}

function normalizeHistoryView(view) {
  return view === 'heatmap' || view === 'summary' ? view : getDefaultHistoryView()
}

function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme)
  document.documentElement.dataset.theme = normalizedTheme
  document.body.dataset.theme = normalizedTheme
  const toggle = document.getElementById('themeToggle')
  if (toggle) {
    const isDark = normalizedTheme === 'dark'
    toggle.dataset.theme = normalizedTheme
    toggle.title = isDark ? t('header.theme.light') : t('header.theme.dark')
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
      if (state?.config) state.config.locale = normalizeLocale(state.config.locale || getBrowserDefaultLocale())
      if (state?.config) state.config.weeklyGoalHours = normalizeWeeklyGoalHours(state.config.weeklyGoalHours)
      if (state?.config) state.config.includeShorts = normalizeIncludeShorts(state.config.includeShorts)
      if (state?.config) {
        const historyView = normalizeHistoryView(state.config.historyView)
        if (state.config.historyView !== historyView) shouldSave = true
        state.config.historyView = historyView
      }
      if (state?.config && !Array.isArray(state.config.channels)) state.config.channels = []
      if (state?.config) delete state.config.apiKey
      normalizeRemovedDefaultChannels(state)
      if (state?.config && (state.defaultChannelsVersion || 1) < DEFAULT_CHANNELS_VERSION) {
        state.defaultChannelsVersion = DEFAULT_CHANNELS_VERSION
        shouldSave = true
      }
      if (normalizeAnkiDateKeys(state)) shouldSave = true
      if (normalizeVideoWatchProgressState(state)) shouldSave = true
      normalizeUndoState(state)
      if (normalizeActivityLogState(state)) shouldSave = true
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
    return defaultState(fallback.weeklyGoalHours || 4, fallback.channels, fallback.theme, fallback.removedDefaultChannelIds, fallback.locale)
  }

  return null
}

function saveState(s, options = {}) {
  const { backup = true, backupReason = 'automatic backup', forceBackup = false } = options
  normalizeActivityLogState(s)
  normalizeVideoWatchProgressState(s)
  if (backup) createStateBackup(backupReason, { force: forceBackup })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    pruneOldestStateBackup()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  }
  saveConfigCookie(s.config)
}

function defaultState(goalHours, channels, theme, removedDefaultChannelIds = null, locale = null) {
  const restoredRemovedDefaultIds = Array.isArray(removedDefaultChannelIds)
    ? removedDefaultChannelIds.filter(isDefaultChannelId)
    : null
  return {
    config: {
      weeklyGoalHours: normalizeWeeklyGoalHours(goalHours),
      theme: normalizeTheme(theme),
      locale: normalizeLocale(locale || getBrowserDefaultLocale()),
      includeShorts: true,
      historyView: getDefaultHistoryView(),
      channels: Array.isArray(channels) ? channels.map(c => ({ ...c })) : DEFAULT_CHANNELS.map(c => ({ ...c })),
      removedDefaultChannelIds: restoredRemovedDefaultIds || []
    },
    videos:  {},   // { [videoId]: VideoRecord }
    streak:  { current: 0, longest: 0, lastActivityDate: null },
    anki:    {},   // { 'YYYY-MM-DD': { reviewed, created } }
    cityProgress: { maxLevelIndex: 0, pendingLevelIndex: null },
    undoStack: [],
    redoStack: [],
    activityLog: [],
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

function normalizeVideoWatchProgress(progress, duration = null) {
  const entries = Array.isArray(progress) ? progress : []
  const maxSeconds = Number.isFinite(Number(duration)) && Number(duration) > 0
    ? Math.floor(Number(duration))
    : null

  return entries
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => {
      const watchedAt = isValidTimestamp(entry.watchedAt) ? entry.watchedAt : null
      const rawSeconds = Math.floor(Number(entry.seconds || 0))
      const seconds = maxSeconds === null
        ? Math.max(0, rawSeconds)
        : clampNumber(rawSeconds, 0, maxSeconds)
      return watchedAt && seconds > 0 ? { watchedAt, seconds } : null
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt))
}

function normalizeVideoWatchProgressState(state) {
  if (!state?.videos || typeof state.videos !== 'object') return false
  let changed = false
  Object.values(state.videos).forEach(video => {
    const normalized = normalizeVideoWatchProgress(video.watchProgress, video.duration)
    const previous = Array.isArray(video.watchProgress) ? video.watchProgress : []
    if (JSON.stringify(previous) !== JSON.stringify(normalized)) {
      video.watchProgress = normalized
      changed = true
    }
  })
  return changed
}

function normalizeActivityLogState(state) {
  if (!state) return false
  const existing = Array.isArray(state.activityLog) ? state.activityLog : []
  const normalized = existing
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => {
      const createdAt = isValidTimestamp(entry.createdAt) ? entry.createdAt : new Date().toISOString()
      const normalizedEntry = {
        id: typeof entry.id === 'string' && entry.id ? entry.id : makeActivityLogId(),
        createdAt,
        actor: entry.actor === 'auto' ? 'auto' : 'user',
        type: typeof entry.type === 'string' && entry.type ? entry.type : 'general',
        status: ['success', 'warn', 'error', 'info'].includes(entry.status) ? entry.status : 'info',
        title: typeof entry.title === 'string' && entry.title ? entry.title : 'Activity',
        detail: typeof entry.detail === 'string' ? entry.detail : ''
      }
      if (entry.meta && typeof entry.meta === 'object' && !Array.isArray(entry.meta)) {
        normalizedEntry.meta = entry.meta
      }
      return normalizedEntry
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, ACTIVITY_LOG_LIMIT)

  const changed = !Array.isArray(state.activityLog) || JSON.stringify(state.activityLog) !== JSON.stringify(normalized)
  state.activityLog = normalized
  return changed
}

function makeActivityLogId() {
  const now = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${now}-${random}`
}

function appendActivityLog(state, entry = {}) {
  if (!state) return null
  normalizeActivityLogState(state)
  const nextEntry = {
    id: makeActivityLogId(),
    createdAt: isValidTimestamp(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
    actor: entry.actor === 'auto' ? 'auto' : 'user',
    type: typeof entry.type === 'string' && entry.type ? entry.type : 'general',
    status: ['success', 'warn', 'error', 'info'].includes(entry.status) ? entry.status : 'info',
    title: typeof entry.title === 'string' && entry.title ? entry.title : 'Activity',
    detail: typeof entry.detail === 'string' ? entry.detail : ''
  }
  if (entry.meta && typeof entry.meta === 'object' && !Array.isArray(entry.meta)) {
    nextEntry.meta = entry.meta
  }
  state.activityLog.unshift(nextEntry)
  if (state.activityLog.length > ACTIVITY_LOG_LIMIT) {
    state.activityLog.splice(ACTIVITY_LOG_LIMIT)
  }
  return nextEntry
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

function getCurrentAppTimestamp(state = null) {
  if (!IS_SANDBOX) return new Date().toISOString()
  const now = new Date()
  const date = getCurrentAppDate(state)
  date.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  return date.toISOString()
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
  if (days < -1) return t('time.inDays', { count: Math.abs(days) })
  if (days === -1) return t('time.tomorrow')
  if (days === 0) return t('time.today')
  if (days === 1) return t('time.yesterday')
  if (days < 7)  return t('time.daysAgo', { count: days })
  if (days < 14) return t('time.weekAgo')
  if (days < 30) return t('time.weeksAgo', { count: Math.floor(days / 7) })
  return t('time.monthsAgo', { count: Math.floor(days / 30) })
}

function formatWatchedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const watchedDateKey = toDateKey(date)
  const today = getCurrentAppDate()
  const todayKey = toDateKey(today)
  const yesterdayKey = toDateKey(addDays(today, -1))
  if (watchedDateKey === todayKey) return t('time.watchedToday')
  if (watchedDateKey === yesterdayKey) return t('time.watchedYesterday')
  const days = daysBetweenDateKeys(watchedDateKey, todayKey)
  if (days > 1 && days < 7) return t('time.watchedDaysAgo', { count: days })
  if (days >= 7 && days < 14) return t('time.watchedWeekAgo')
  if (days >= 14 && days < 30) return t('time.watchedWeeksAgo', { count: Math.floor(days / 7) })
  return t('time.watchedDate', { date: formatLocaleDate(date, { month: 'short', day: 'numeric' }) })
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
    return normalizeResumeAtSeconds(Number(raw) * 60, duration)
  }

  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3 || !parts.every(part => /^\d+$/.test(part))) return NaN

  const nums = parts.map(part => Number(part))
  const seconds = nums.length === 3
    ? (nums[0] * 3600) + (nums[1] * 60) + nums[2]
    : (nums[0] * 3600) + (nums[1] * 60)
  return normalizeResumeAtSeconds(seconds, duration)
}

function formatResumeTimestamp(seconds) {
  const normalized = normalizeResumeAtSeconds(seconds)
  if (normalized === null) return ''
  const h = Math.floor(normalized / 3600)
  const m = Math.floor((normalized % 3600) / 60)
  const s = normalized % 60
  const z = n => String(n).padStart(2, '0')
  return `${z(h)}:${z(m)}:${z(s)}`
}

function getWeekLabel(state = null) {
  const start = getWeekStart(getCurrentAppDate(state))
  const end   = new Date(start)
  end.setDate(end.getDate() + 6)
  const jan4  = new Date(start.getFullYear(), 0, 4)
  const wk    = Math.ceil(((start - jan4) / 86_400_000 + jan4.getDay() + 1) / 7)
  const fmt   = d => formatLocaleDate(d, { month: 'short', day: 'numeric' })
  return t('time.weekLabel', { week: wk, start: fmt(start), end: fmt(end) })
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
  reportMissingI18nKeys()
  let state = loadState()
  if (!state) {
    state = IS_SANDBOX ? createEmptySandboxState() : defaultState(4, DEFAULT_CHANNELS)
    saveState(state)
  }

  applyLocale(state.config.locale)
  document.title = IS_SANDBOX ? t('app.title.sandbox') : 'Edenia'
  document.body.dataset.sandbox = IS_SANDBOX ? 'true' : 'false'
  const sandboxTools = document.getElementById('sandboxTools')
  const sandboxVersionLabel = document.getElementById('sandboxVersionLabel')
  if (sandboxTools) sandboxTools.classList.toggle('hidden', !IS_SANDBOX)
  if (sandboxVersionLabel) sandboxVersionLabel.classList.toggle('hidden', !IS_SANDBOX)
  selectedHistoryView = normalizeHistoryView(state.config.historyView)
  setDefaultCityDayOffset(state)
  syncStreak(state)
  saveState(state)
  applyTheme(state.config.theme)
  show('mainApp')
  renderAll(state)
  repairStoredShortsDetection()
  preloadCityImages()
  initCityImagePanZoom()
  if (!IS_SANDBOX) {
    refreshAnkiStats({ silent: true })
    startAnkiAutoRefresh()
    startYoutubeAutoRefresh()
  } else {
    showToast(t('toast.sandboxMode'), 'warn')
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
    <div class="walkthrough-card" role="dialog" aria-live="polite" aria-label="${escHtml(t('walkthrough.close'))}">
      <div class="walkthrough-progress"></div>
      <p class="walkthrough-text"></p>
      <div class="walkthrough-actions">
        <button class="btn-ghost walkthrough-skip" type="button">${escHtml(t('walkthrough.skip'))}</button>
        <span class="walkthrough-step-controls">
          <button class="btn-ghost walkthrough-back" type="button">${escHtml(t('walkthrough.back'))}</button>
          <button class="btn-secondary walkthrough-next" type="button">${escHtml(t('walkthrough.next'))}</button>
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
  elements.progress.textContent = t('walkthrough.progress', { current: walkthroughState.index + 1, total: walkthroughState.steps.length })
  elements.text.textContent = step.textKey ? t(step.textKey) : step.text
  elements.back.disabled = walkthroughState.index === 0
  elements.next.disabled = step.advanceOn === 'target-click'
  elements.back.textContent = t('walkthrough.back')
  elements.skip.textContent = t('walkthrough.skip')
  elements.next.textContent = step.actionLabelKey
    ? t(step.actionLabelKey)
    : (walkthroughState.index === walkthroughState.steps.length - 1 ? t('walkthrough.done') : t('walkthrough.next'))
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
    const step = walkthroughState.steps[walkthroughState.index]
    if (step?.advanceOn === 'target-click') return
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
  appendActivityLog(state, {
    actor: 'user',
    type: 'reset',
    status: 'warn',
    title: 'Sandbox reset',
    detail: 'Sandbox progress was reset after keeping a rollback backup.'
  })
  saveState(state, { backup: false })
  setDefaultCityDayOffset(state)
  selectedHistoryView = 'heatmap'
  selectedHistoryRange = 'month'
  ankiStatsCache = null
  renderAll(state)
  showToast(t('toast.sandboxReset'), 'success')
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
  renderAll(state)
  showToast(t('toast.sandboxDayAdded', { date: formatCitySnapshotDate(nextDate) }), 'success')
}

function getLastSandboxActivityDate(state) {
  const latestKey = state?.sandboxLastDate || getLatestSandboxDateKey(state)
  return latestKey ? dateKeyToLocalDate(latestKey) : null
}

function getLatestSandboxDateKey(state) {
  const dateKeys = []

  if (state?.sandboxStartDate) dateKeys.push(state.sandboxStartDate)

  Object.values(state?.videos || {}).forEach(video => {
    const watchedDateKeys = getVideoWatchActivityDateKeys(video)
    watchedDateKeys.forEach(dateKey => dateKeys.push(dateKey))
    if (!watchedDateKeys.length && video.publishedAt && video.id?.startsWith?.('sandbox-added-')) {
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
    showToast(t('toast.addChannelFirst'), 'warn')
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
  showToast(t('toast.dummyVideosLoaded', { count: videos.length }), 'success')
}

function makeSandboxActivityForScore(scoreTarget) {
  let remaining = Math.max(0, Math.floor(scoreTarget))
  const videoDurations = []

  if (remaining > 0) {
    videoDurations.push(randomInt(60, 180))
    remaining -= 1
  }

  const created = randomInt(0, 8)

  const reviewedChunks = remaining >= ANKI_REVIEW_CHUNK_POINTS ? randomInt(0, Math.floor(remaining / ANKI_REVIEW_CHUNK_POINTS)) : 0
  const unscoredReviewRemainder = Math.max(0, Math.floor(ANKI_REVIEW_CHUNK_SIZE / ANKI_REVIEW_CHUNK_POINTS) - 1)
  const reviewed = reviewedChunks * ANKI_REVIEW_CHUNK_SIZE + randomInt(0, unscoredReviewRemainder)
  remaining -= reviewedChunks * ANKI_REVIEW_CHUNK_POINTS

  if (remaining > 0) {
    const extraVideoCount = randomInt(0, Math.min(2, remaining))
    for (let i = 0; i < extraVideoCount; i += 1) {
      videoDurations.push(randomInt(60, 180))
    }
    remaining -= extraVideoCount
  }

  const durationPoints = remaining
  const scoredSecondsPerPoint = 3600 / VIDEO_HOUR_POINTS
  for (let i = 0; i < videoDurations.length; i += 1) {
    const scoredSeconds = i === 0 ? durationPoints * scoredSecondsPerPoint : 0
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
  const localeSelect = document.getElementById('settingsLocale')
  if (localeSelect) localeSelect.value = normalizeLocale(s.config.locale)
  document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(s.config.includeShorts)
  renderChannelList(s.config.channels)
  renderBackupList()
  renderActivityLog(s)
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
  const previousGoal = normalizeWeeklyGoalHours(s.config.weeklyGoalHours)
  const previousIncludeShorts = normalizeIncludeShorts(s.config.includeShorts)
  const goal   = normalizeWeeklyGoalHours(document.getElementById('settingsGoal').value)
  s.config.weeklyGoalHours = goal
  s.config.includeShorts = Boolean(document.getElementById('settingsIncludeShorts')?.checked)
  document.getElementById('settingsGoal').value = goal
  if (goal !== previousGoal) {
    appendActivityLog(s, {
      actor: 'user',
      type: 'weekly-goal',
      status: 'success',
      title: 'Weekly goal changed',
      detail: `${previousGoal}h to ${goal}h`
    })
  }
  if (normalizeIncludeShorts(s.config.includeShorts) !== previousIncludeShorts) {
    appendActivityLog(s, {
      actor: 'user',
      type: 'short-videos',
      status: 'success',
      title: 'Short video setting changed',
      detail: normalizeIncludeShorts(s.config.includeShorts) ? 'Short videos are shown.' : 'Short videos are hidden.'
    })
  }
  saveState(s)
  renderAll(s)
  renderActivityLog(s)
  if (!normalizeIncludeShorts(s.config.includeShorts)) repairStoredShortsDetection()
}

function saveLocaleFromSettings() {
  const s = loadState()
  if (!s?.config) return
  const previousLocale = normalizeLocale(s.config.locale)
  const nextLocale = normalizeLocale(document.getElementById('settingsLocale')?.value)
  if (previousLocale === nextLocale) return

  s.config.locale = nextLocale
  applyLocale(nextLocale)
  appendActivityLog(s, {
    actor: 'user',
    type: 'locale',
    status: 'success',
    title: t('log.locale.title'),
    detail: t('log.locale.detail', { language: getLocaleLabel(nextLocale) })
  })
  saveState(s)
  document.title = IS_SANDBOX ? t('app.title.sandbox') : 'Edenia'
  applyTheme(s.config.theme)
  renderAll(s)
  renderChannelList(s.config.channels)
  renderBackupList()
  renderActivityLog(s)
  showToast(t('toast.localeChanged', { language: getLocaleLabel(nextLocale) }))
}

function exportSyncFile() {
  const state = loadState()
  if (!state) {
    showToast(t('toast.nothingToSync'), 'warn')
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
  showToast(t('toast.syncExported'))
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
        showToast(t('toast.invalidSync'), 'error')
        return
      }
      if (payload?.app === 'edenia' && Boolean(payload.sandbox) !== IS_SANDBOX) {
        showToast(IS_SANDBOX ? t('toast.useSandboxSync') : t('toast.useNormalSync'), 'warn')
        return
      }

      const rollbackBackup = createStateBackup('before sync import', { force: true })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(importedState))
      const normalizedState = loadState()
      if (!normalizedState) {
        showToast(t('toast.importFailed'), 'error')
        return
      }
      if (rollbackBackup) {
        appendActivityLog(normalizedState, {
          actor: 'auto',
          type: 'backup',
          status: 'info',
          title: 'Rollback backup created',
          detail: 'Saved a local backup before importing a sync file.'
        })
      }
      appendActivityLog(normalizedState, {
        actor: 'user',
        type: 'import',
        status: 'success',
        title: 'Sync file imported',
        detail: file.name || 'Imported progress from a sync file.'
      })
      saveState(normalizedState, { backup: false })
      applyLocale(normalizedState.config.locale)
      document.title = IS_SANDBOX ? t('app.title.sandbox') : 'Edenia'
      applyTheme(normalizedState.config.theme)
      setDefaultCityDayOffset(normalizedState)
      renderAll(normalizedState)
      if (!normalizeIncludeShorts(normalizedState.config.includeShorts)) repairStoredShortsDetection()
      renderChannelList(normalizedState.config.channels)
      renderBackupList()
      renderActivityLog(normalizedState)
      document.getElementById('settingsGoal').value = normalizedState.config.weeklyGoalHours
      const localeSelect = document.getElementById('settingsLocale')
      if (localeSelect) localeSelect.value = normalizeLocale(normalizedState.config.locale)
      document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(normalizedState.config.includeShorts)
      showToast(t('toast.syncImported'))
    } catch {
      showToast(t('toast.readSyncFailed'), 'error')
    } finally {
      input.value = ''
    }
  }
  reader.onerror = () => {
    showToast(t('toast.readSyncFailed'), 'error')
    input.value = ''
  }
  reader.readAsText(file)
}

function formatBackupTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('backups.unknownTime')
  return formatLocaleDateTime(date, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatBackupReason(reason) {
  return String(reason || 'automatic backup')
    .replace(/^before /, 'Before ')
    .replace(/^automatic backup$/, t('backups.automatic'))
}

function renderBackupList() {
  const el = document.getElementById('backupList')
  if (!el) return

  const entries = getStateBackupEntries()
  if (!entries.length) {
    el.innerHTML = `<p class="backup-empty">${escHtml(t('backups.empty'))}</p>`
    return
  }

  el.innerHTML = entries.slice(0, 4).map(entry => `
    <div class="backup-item">
      <div class="backup-item-copy">
        <span class="backup-time">${escHtml(formatBackupTimestamp(entry.createdAt))}</span>
        <span class="backup-reason">${escHtml(formatBackupReason(entry.reason))}</span>
      </div>
      <button class="btn-ghost backup-restore-btn" type="button" data-backup-id="${escHtml(entry.id)}" onclick="restoreStateBackup(this.dataset.backupId)">${escHtml(t('backups.restore'))}</button>
    </div>
  `).join('')
}

function formatActivityLogTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('backups.unknownTime')
  return formatLocaleDateTime(date, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function setActivityLogFilter(filter) {
  selectedActivityLogFilter = ACTIVITY_LOG_FILTERS.includes(filter) ? filter : 'all'
  renderActivityLog()
}

function getFilteredActivityLogEntries(state) {
  const entries = Array.isArray(state?.activityLog) ? state.activityLog : []
  if (selectedActivityLogFilter === 'user') return entries.filter(entry => entry.actor === 'user')
  if (selectedActivityLogFilter === 'auto') return entries.filter(entry => entry.actor === 'auto')
  if (selectedActivityLogFilter === 'issues') return entries.filter(entry => ['warn', 'error'].includes(entry.status))
  return entries
}

function formatActivityLogLabel(entry) {
  const actor = entry.actor === 'auto' ? t('activity.auto') : t('activity.user')
  const status = entry.status === 'error' ? t('activity.error') : entry.status === 'warn' ? t('activity.warn') : entry.status === 'success' ? t('activity.done') : t('activity.info')
  return `${actor} · ${status}`
}

function renderActivityLog(state = loadState()) {
  const list = document.getElementById('activityLogList')
  if (!list) return

  document.querySelectorAll('[data-activity-log-filter]').forEach(button => {
    const isActive = button.dataset.activityLogFilter === selectedActivityLogFilter
    button.classList.toggle('active', isActive)
    button.setAttribute('aria-selected', String(isActive))
  })

  normalizeActivityLogState(state)
  const entries = getFilteredActivityLogEntries(state)
  if (!entries.length) {
    list.innerHTML = `<p class="activity-log-empty">${escHtml(t('activity.empty'))}</p>`
    return
  }

  list.innerHTML = entries.map(entry => `
    <div class="activity-log-item">
      <div class="activity-log-row">
        <span class="activity-log-time">${escHtml(formatActivityLogTimestamp(entry.createdAt))}</span>
        <span class="activity-log-chip ${escHtml(entry.status)}">${escHtml(formatActivityLogLabel(entry))}</span>
      </div>
      <div class="activity-log-title">${escHtml(entry.title)}</div>
      ${entry.detail ? `<p class="activity-log-detail">${escHtml(entry.detail)}</p>` : ''}
    </div>
  `).join('')
}

function restoreStateBackup(id) {
  const entry = getStateBackupEntries().find(candidate => candidate.id === id)
  const state = entry ? prepareStateForBackup(entry.state) : null
  if (!state) {
    showToast(t('toast.backupUnavailable'), 'error')
    renderBackupList()
    return
  }

  const rollbackBackup = createStateBackup('before backup restore', { force: true })
  syncStreak(state)
  if (rollbackBackup) {
    appendActivityLog(state, {
      actor: 'auto',
      type: 'backup',
      status: 'info',
      title: 'Rollback backup created',
      detail: 'Saved a local backup before restoring another backup.'
    })
  }
  appendActivityLog(state, {
    actor: 'user',
    type: 'backup-restore',
    status: 'success',
    title: 'Backup restored',
    detail: formatBackupTimestamp(entry.createdAt)
  })
  saveState(state, { backup: false })
  applyLocale(state.config.locale)
  document.title = IS_SANDBOX ? t('app.title.sandbox') : 'Edenia'
  applyTheme(state.config.theme)
  setDefaultCityDayOffset(state)
  renderAll(state)
  if (!normalizeIncludeShorts(state.config.includeShorts)) repairStoredShortsDetection()
  renderChannelList(state.config.channels)
  renderBackupList()
  renderActivityLog(state)
  document.getElementById('settingsGoal').value = state.config.weeklyGoalHours
  const localeSelect = document.getElementById('settingsLocale')
  if (localeSelect) localeSelect.value = normalizeLocale(state.config.locale)
  document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(state.config.includeShorts)
  showToast(t('toast.backupRestored'), 'success')
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
    state.config.removedDefaultChannelIds,
    state.config.locale
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
  appendActivityLog(s, {
    actor: 'user',
    type: 'theme',
    status: 'success',
    title: 'Theme changed',
    detail: s.config.theme === 'dark' ? 'Dark theme enabled.' : 'Light theme enabled.'
  })
  saveState(s)
  applyTheme(s.config.theme)
  renderActivityLog(s)
}

async function addChannel() {
  const idEl   = document.getElementById('newChannelId')
  const raw    = idEl.value.trim()
  let resolved

  try {
    resolved = await resolveYoutubeChannelInput(raw)
  } catch (err) {
    showToast(err.message || t('toast.channelInvalid'), 'warn')
    return
  }

  const id   = resolved.id
  const name = resolved.name || id
  const s = loadState()
  if (s.config.channels.find(c => c.id === id)) {
    showToast(t('toast.channelDuplicate'), 'warn'); return
  }
  s.config.channels.push({ id, name })
  if (isDefaultChannelId(id)) {
    s.config.removedDefaultChannelIds = (s.config.removedDefaultChannelIds || []).filter(channelId => channelId !== id)
  }
  appendActivityLog(s, {
    actor: 'user',
    type: 'channel-add',
    status: 'success',
    title: 'Channel added',
    detail: name
  })
  saveState(s)
  renderChannelList(s.config.channels)
  renderActivityLog(s)
  idEl.value = ''
  if (IS_SANDBOX) {
    showToast(t('toast.channelAdded', { name }))
    return
  }
  if (!hasYoutubeApiKey()) {
    showToast(t('toast.channelAddedNoKey', { name }), 'warn')
    return
  }
  showToast(t('toast.channelAddedLoading', { name }))
  refreshAddedChannel(id)
}

function removeChannel(id) {
  const s = loadState()
  const channel = s.config.channels.find(c => c.id === id)
  s.config.channels = s.config.channels.filter(c => c.id !== id)
  delete getChannelRefreshes(s)[id]
  if (isDefaultChannelId(id) && !s.config.removedDefaultChannelIds.includes(id)) {
    s.config.removedDefaultChannelIds.push(id)
  }
  appendActivityLog(s, {
    actor: 'user',
    type: 'channel-remove',
    status: 'success',
    title: 'Channel removed',
    detail: channel?.name || id
  })
  saveState(s)
  renderChannelList(s.config.channels)
  renderActivityLog(s)
}

function renderChannelList(channels) {
  const el = document.getElementById('channelList')
  if (!channels.length) { el.innerHTML = `<p style="color:var(--muted);font-size:.82rem">${escHtml(t('videos.channels.none'))}</p>`; return }
  el.innerHTML = channels.map(c => `
    <div class="channel-item">
      <div>
        <div class="channel-item-name">${escHtml(c.name)}</div>
        <div class="channel-item-id">${escHtml(c.id)}</div>
      </div>
      <button class="channel-remove" data-channel-id="${escHtml(c.id)}" onclick="removeChannel(this.dataset.channelId)" title="${escHtml(t('settings.remove'))}">✕</button>
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
  const nextState = IS_SANDBOX ? createEmptySandboxState() : defaultState(4, DEFAULT_CHANNELS, DEFAULT_THEME)
  appendActivityLog(nextState, {
    actor: 'user',
    type: 'reset',
    status: 'warn',
    title: 'Reset everything',
    detail: 'Started fresh after keeping a rollback backup.'
  })
  saveState(nextState, { backup: false })
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

function isShortDuration(seconds) {
  const duration = Number(seconds || 0)
  return duration > 0 && duration < SHORT_VIDEO_MAX_DURATION_SECONDS
}

function isShortVideoDetail(detail = {}) {
  return isShortDuration(detail.duration)
}

function getVideoDetailFromItem(item) {
  const detail = {
    duration: parseDuration(item?.contentDetails?.duration)
  }
  detail.isShort = isShortVideoDetail(detail)
  return detail
}

async function ytFetch(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

function normalizeYoutubeUrlHost(hostname = '') {
  return String(hostname || '').toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
}

function isYoutubeHost(host) {
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com'
}

function decodePathPart(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseYoutubeChannelInput(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (YOUTUBE_CHANNEL_ID_RE.test(raw)) return { kind: 'id', channelId: raw }
  if (YOUTUBE_HANDLE_RE.test(raw)) return { kind: 'handle', handle: raw }

  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(normalized)
    const host = normalizeYoutubeUrlHost(url.hostname)
    if (!isYoutubeHost(host)) return null

    const parts = url.pathname.split('/').filter(Boolean).map(decodePathPart)
    const [first, second] = parts
    if (first === 'channel' && YOUTUBE_CHANNEL_ID_RE.test(second || '')) {
      return { kind: 'id', channelId: second }
    }
    if (YOUTUBE_HANDLE_RE.test(first || '')) {
      return { kind: 'handle', handle: first }
    }
    if (first === 'user' && second) {
      return { kind: 'username', username: second }
    }
    if ((first === 'c' && second) || (first && !['watch', 'embed', 'shorts', 'live', 'playlist'].includes(first))) {
      return { kind: 'custom-url' }
    }
  } catch {
    return null
  }

  return null
}

async function fetchYoutubeChannelByFilter(filter, value) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&maxResults=1&${filter}=${encodeURIComponent(value)}&key=${encodeURIComponent(getYoutubeApiKey())}`
  const data = await ytFetch(url)
  const item = data.items?.[0]
  if (!item?.id) throw new Error(t('toast.channelResolveNotFound'))
  return {
    id: item.id,
    name: item.snippet?.title || item.id
  }
}

async function resolveYoutubeChannelInput(value) {
  const parsed = parseYoutubeChannelInput(value)
  if (!parsed) throw new Error(t('toast.channelInvalid'))
  if (parsed.kind === 'id') return { id: parsed.channelId, name: parsed.channelId }
  if (parsed.kind === 'custom-url') throw new Error(t('toast.channelCustomUrlUnsupported'))
  if (!hasYoutubeApiKey()) throw new Error(t('toast.channelResolveNeedsKey'))
  if (parsed.kind === 'handle') return fetchYoutubeChannelByFilter('forHandle', parsed.handle)
  if (parsed.kind === 'username') return fetchYoutubeChannelByFilter('forUsername', parsed.username)
  throw new Error(t('toast.channelInvalid'))
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

function getVideoUrl(video) {
  const videoId = String(video?.id ?? '')
  const url = `https://youtube.com/watch?v=${encodeURIComponent(videoId)}`
  const resumeAtSeconds = getVideoStatus(video) === 'partial'
    ? normalizeResumeAtSeconds(video?.resumeAtSeconds, video?.duration)
    : null
  return resumeAtSeconds !== null ? `${url}&t=${resumeAtSeconds}s` : url
}

function getVideoWatchProgressEntries(video) {
  const entries = normalizeVideoWatchProgress(video?.watchProgress, video?.duration)
  if (entries.length) return entries

  if (video?.watchedAt && getVideoStatus(video) === 'watched') {
    const seconds = Math.max(0, Math.floor(Number(video.duration || 0)))
    return seconds > 0 ? [{ watchedAt: video.watchedAt, seconds }] : []
  }

  return []
}

function getTotalVideoWatchProgressSeconds(video) {
  return getVideoWatchProgressEntries(video)
    .reduce((total, entry) => total + (entry.seconds || 0), 0)
}

function addVideoWatchProgress(video, seconds, watchedAt = new Date().toISOString()) {
  if (!video) return false
  const normalizedSeconds = Math.max(0, Math.floor(Number(seconds || 0)))
  if (!normalizedSeconds || !isValidTimestamp(watchedAt)) return false

  const entries = normalizeVideoWatchProgress(video.watchProgress, video.duration)
  const duration = Math.max(0, Math.floor(Number(video.duration || 0)))
  const alreadyWatched = entries.reduce((total, entry) => total + entry.seconds, 0)
  const secondsToAdd = duration > 0
    ? Math.min(normalizedSeconds, Math.max(0, duration - alreadyWatched))
    : normalizedSeconds

  if (!secondsToAdd) return false
  entries.push({ watchedAt, seconds: secondsToAdd })
  video.watchProgress = normalizeVideoWatchProgress(entries, video.duration)
  return true
}

function getVideoWatchActivityDateKeys(video) {
  return getVideoWatchProgressEntries(video)
    .map(entry => toDateKey(new Date(entry.watchedAt)))
}

function isActiveRefreshVideo(video) {
  return getVideoStatus(video) !== 'watched'
}

function isCountableRefreshVideo(video, includeShorts) {
  return isActiveRefreshVideo(video) && (includeShorts || !isShortDuration(video?.duration))
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
      ? {
        ...video,
        duration: detail.duration,
        isShort: Boolean(detail.isShort),
        shortsCheckedAt: detail.shortsCheckedAt,
        shortsDetectionVersion: detail.shortsDetectionVersion
      }
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
        isShort: Boolean(video.isShort),
        shortsCheckedAt: video.shortsCheckedAt || null,
        shortsDetectionVersion: video.shortsDetectionVersion || null
      }
    } else if (existing && typeof existing.duration === 'number') {
      detailsById[video.id] = {
        duration: existing.duration,
        isShort: Boolean(existing.isShort),
        shortsCheckedAt: existing.shortsCheckedAt || null,
        shortsDetectionVersion: existing.shortsDetectionVersion || null
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
  if (detectShorts) {
    const checkedAt = new Date().toISOString()
    Object.values(result).forEach(detail => {
      detail.shortsCheckedAt = checkedAt
      detail.shortsDetectionVersion = SHORT_VIDEO_DETECTION_VERSION
    })
  }
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
  if (!lastFetchedMs) return t('time.notYet')

  const elapsedMs = Date.now() - lastFetchedMs
  if (elapsedMs < 60_000) return t('time.justNow')
  if (elapsedMs < 3_600_000) return `${Math.floor(elapsedMs / 60_000)}m ago`
  if (elapsedMs < 86_400_000) return `${Math.floor(elapsedMs / 3_600_000)}h ago`
  return timeAgo(new Date(lastFetchedMs).toISOString())
}

function formatChannelLastRefreshTitle(s, channelId) {
  const lastFetchedMs = getChannelLastFetchedMs(s, channelId)
  if (!lastFetchedMs) return t('time.notRefreshedYet')
  return t('time.lastRefreshed', { time: formatLocaleDateTime(new Date(lastFetchedMs), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }) })
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
  if (hours && minutes) return t('time.hoursMinutesCompact', { hours, minutes })
  if (hours) return t('time.hoursCompact', { hours })
  return t('time.minutesCompact', { minutes })
}

async function maybeRefreshFeed({ notifyMissingKey = false } = {}) {
  if (maybeRefreshFeed._running) return
  maybeRefreshFeed._running = true
  const s = loadState()
  try {
    if (shouldRefreshYoutubeFeed(s)) {
      await refreshFeed({ silent: hasAnyChannelRefreshTimestamp(s) })
    } else if (!hasYoutubeApiKey() && notifyMissingKey) {
      showToast(t('toast.apiKeyMissing'), 'warn')
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
      watchProgress: normalizeVideoWatchProgress(existing?.watchProgress ?? v.watchProgress, duration),
      source: existing?.source || v.source || null,
      manuallyAdded: Boolean(existing?.manuallyAdded || v.manuallyAdded),
      isShort: isShortDuration(duration),
      shortsCheckedAt: detail.shortsCheckedAt || existing?.shortsCheckedAt || null,
      shortsDetectionVersion: detail.shortsDetectionVersion || existing?.shortsDetectionVersion || null
    }
  })

  return {
    mergedCount: videosToMerge.length,
    skippedShorts: includeShorts ? 0 : videos.length - videosToMerge.length
  }
}

function isYoutubeVideoId(id) {
  return /^[\w-]{11}$/.test(String(id || ''))
}

function hasKnownVideoDuration(video) {
  return Number(video?.duration || 0) > 0
}

function needsStoredShortsDetection(video) {
  return Boolean(
    video &&
    isYoutubeVideoId(video.id) &&
    getVideoStatus(video) !== 'watched' &&
    !hasKnownVideoDuration(video) &&
    !isShortDuration(video.duration) &&
    video.shortsDetectionVersion !== SHORT_VIDEO_DETECTION_VERSION
  )
}

function getStoredShortsDetectionCandidates(s) {
  if (!s?.videos) return []
  return Object.values(s.videos).filter(needsStoredShortsDetection)
}

async function repairStoredShortsDetection() {
  if (IS_SANDBOX || !hasYoutubeApiKey()) return
  if (repairStoredShortsDetection._running) return

  const initialState = loadState()
  if (!initialState || normalizeIncludeShorts(initialState.config?.includeShorts)) return
  const candidates = getStoredShortsDetectionCandidates(initialState)
  if (!candidates.length) return

  repairStoredShortsDetection._running = true
  try {
    const detailsById = await fetchVideoDetails(candidates.map(video => video.id), { detectShorts: true })
    const s = loadState()
    if (!s || normalizeIncludeShorts(s.config?.includeShorts)) return

    let changed = false
    let checkedCount = 0
    let shortCount = 0
    candidates.forEach(candidate => {
      const video = s.videos?.[candidate.id]
      const detail = detailsById[candidate.id]
      if (!video || !detail || !needsStoredShortsDetection(video)) return

      video.duration = detail.duration ?? video.duration ?? 0
      video.isShort = isShortDuration(detail.duration)
      video.shortsCheckedAt = detail.shortsCheckedAt || new Date().toISOString()
      video.shortsDetectionVersion = detail.shortsDetectionVersion || SHORT_VIDEO_DETECTION_VERSION
      checkedCount += 1
      if (video.isShort) shortCount += 1
      changed = true
    })

    if (changed) {
      appendActivityLog(s, {
        actor: 'auto',
        type: 'short-videos',
        status: 'info',
        title: 'Short videos checked',
        detail: `${checkedCount} stored video${checkedCount === 1 ? '' : 's'} checked; ${shortCount} short video${shortCount === 1 ? '' : 's'} found.`,
        meta: { checkedCount, shortCount }
      })
      saveState(s)
      renderAll(s)
    }
  } catch (err) {
    console.warn('Could not re-check stored short videos:', err)
    const s = loadState()
    if (s) {
      appendActivityLog(s, {
        actor: 'auto',
        type: 'short-videos',
        status: 'warn',
        title: 'Short video check failed',
        detail: err.message || 'Could not check stored short videos.'
      })
      saveState(s)
    }
  } finally {
    repairStoredShortsDetection._running = false
  }
}

function formatSkippedShortsMessage(skippedShorts) {
  return skippedShorts ? t('toast.skippedShorts', { count: skippedShorts, plural: skippedShorts === 1 ? '' : 's' }) : ''
}

async function refreshFeed({ silent = false } = {}) {
  const btn = document.getElementById('refreshBtn')
  if (btn) {
    btn.textContent = `↻ ${t('videos.refreshing')}`
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
      showToast(t('toast.apiKeyMissing'), 'warn')
      return
    }
    if (!s.config.channels.length) {
      showToast(t('toast.addChannelFirst'), 'warn')
      return
    }
    const channelsToRefresh = getDueYoutubeChannels(s)
    if (!channelsToRefresh.length) {
      if (!silent) showToast(t('toast.nextRefresh', { time: formatRefreshWait(getYoutubeRefreshRemainingMs(s)) }), 'warn')
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
        appendActivityLog(s, {
          actor: 'auto',
          type: 'youtube-refresh',
          status: 'success',
          title: 'YouTube channel refreshed',
          detail: `${ch.name}: ${vids.length} video${vids.length === 1 ? '' : 's'} fetched.`,
          meta: { channelId: ch.id, fetchedCount: vids.length }
        })
      } catch (err) {
        console.warn(`${ch.name}:`, err.message)
        markChannelRefreshError(s, ch.id, err)
        appendActivityLog(s, {
          actor: 'auto',
          type: 'youtube-refresh',
          status: 'error',
          title: 'YouTube channel refresh failed',
          detail: `${ch.name}: ${err.message || 'Unknown error'}`,
          meta: { channelId: ch.id }
        })
        errors.push(ch.name)
      }
    }))

    if (successfulChannels === 0) {
      saveState(s)
      showToast(t('toast.refreshFailedChannels', { count: errors.length, plural: errors.length > 1 ? 's' : '' }), 'error')
      return
    }

    const unique = dedupeVideos(all)
    const detailsById = await getFetchedVideoDetails(s, unique, includeShorts)
    const { mergedCount, skippedShorts } = mergeFetchedVideos(s, unique, detailsById, includeShorts)
    if (skippedShorts) {
      appendActivityLog(s, {
        actor: 'auto',
        type: 'short-videos',
        status: 'info',
        title: 'Short videos skipped',
        detail: `${skippedShorts} short video${skippedShorts === 1 ? '' : 's'} skipped during refresh.`,
        meta: { skippedShorts }
      })
    }

    saveState(s)
    renderAll(s)

    const shortsMsg = formatSkippedShortsMessage(skippedShorts)
    const msg = errors.length
      ? t('toast.refreshLoadedWithErrors', { count: mergedCount, shorts: shortsMsg, errors: errors.length, plural: errors.length > 1 ? 's' : '' })
      : t('toast.refreshLoaded', { count: mergedCount, channels: successfulChannels, plural: successfulChannels === 1 ? '' : 's', shorts: shortsMsg })
    if (!silent || errors.length) showToast(msg, errors.length ? 'warn' : 'success')

  } catch (err) {
    console.error(err)
    const s = loadState()
    if (s) {
      appendActivityLog(s, {
        actor: 'auto',
        type: 'youtube-refresh',
        status: 'error',
        title: 'YouTube refresh failed',
        detail: err.message || 'Unknown refresh error'
      })
      saveState(s)
    }
    showToast(t('toast.refreshFailed', { message: err.message }), 'error')
  } finally {
    if (btn) {
      btn.textContent = `↻ ${t('videos.refresh')}`
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
    appendActivityLog(s, {
      actor: 'auto',
      type: 'youtube-refresh',
      status: 'success',
      title: 'YouTube channel refreshed',
      detail: `${channel.name || channelId}: ${mergedCount} video${mergedCount === 1 ? '' : 's'} loaded.`,
      meta: { channelId, fetchedCount: videos.length, mergedCount, skippedShorts }
    })
    saveState(s)
    renderAll(s)
    renderChannelList(s.config.channels)

    const channelName = channel.name || channelId
    const shortsMsg = formatSkippedShortsMessage(skippedShorts)
    showToast(t('toast.channelLoaded', { name: channelName, count: mergedCount, shorts: shortsMsg }), 'success')
  } catch (err) {
    console.error(err)
    const s = loadState()
    if (s?.config?.channels?.some(channel => channel.id === channelId)) {
      markChannelRefreshError(s, channelId, err)
      appendActivityLog(s, {
        actor: 'auto',
        type: 'youtube-refresh',
        status: 'error',
        title: 'YouTube channel refresh failed',
        detail: `${channelId}: ${err.message || 'Unknown error'}`,
        meta: { channelId }
      })
      saveState(s)
    }
    showToast(t('toast.channelAddLoadFailed', { message: err.message }), 'warn')
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
  const previousStatus = getVideoStatus(video)

  const undoAction = {
    type: 'video-status',
    videoId,
    before: {
      video: cloneVideoForHistoryAction(video),
      status: video.status,
      watchedAt: video.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    },
    after: {
      status: newStatus
    }
  }

  video.status    = newStatus
  const watchedAt = newStatus === 'watched' ? getCurrentAppTimestamp(s) : null
  if (watchedAt) {
    const missingSeconds = Math.max(0, Math.floor(Number(video.duration || 0)) - getTotalVideoWatchProgressSeconds(video))
    if (missingSeconds > 0) addVideoWatchProgress(video, missingSeconds, watchedAt)
  } else if (newStatus === 'unwatched' || newStatus === 'watch-later' || previousStatus === 'watched') {
    video.watchProgress = []
  }
  video.watchedAt = watchedAt
  video.resumeAtSeconds = newStatus === 'partial'
    ? normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    : null
  undoAction.after.watchedAt = video.watchedAt
  undoAction.after.resumeAtSeconds = video.resumeAtSeconds
  undoAction.after.video = cloneVideoForHistoryAction(video)
  pushUndoAction(s, undoAction)

  syncStreak(s)
  appendActivityLog(s, {
    actor: 'user',
    type: 'video-status',
    status: 'success',
    title: 'Video status changed',
    detail: `"${formatToastTitle(video.title)}" is now ${formatVideoStatus(newStatus)}.`,
    meta: { videoId, status: newStatus }
  })

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
      video: cloneVideoForHistoryAction(video),
      status: video.status,
      watchedAt: video.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    },
    after: {
      video: null,
      status: 'partial',
      watchedAt: null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    }
  })

  video.status = 'partial'
  video.watchedAt = null
  video.resumeAtSeconds = normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
  const action = s.undoStack[s.undoStack.length - 1]
  if (action?.videoId === videoId && action.after) {
    action.after.video = cloneVideoForHistoryAction(video)
  }
  appendActivityLog(s, {
    actor: 'user',
    type: 'video-status',
    status: 'success',
    title: 'Video status changed',
    detail: `"${formatToastTitle(video.title)}" is now ${formatVideoStatus('partial')}.`,
    meta: { videoId, status: 'partial' }
  })

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
    showToast(t('toast.validYoutubeUrl'), 'warn')
    input?.focus()
    return
  }
  if (!hasYoutubeApiKey()) {
    showToast(t('toast.apiKeyMissing'), 'warn')
    return
  }

  if (btn) {
    btn.disabled = true
    btn.textContent = t('videos.manual.adding')
  }

  try {
    const metadata = await fetchVideoMetadata(videoId)
    const s = loadState()
    const existing = s.videos[videoId]
    const before = {
      exists: Boolean(existing),
      video: existing ? cloneVideoForHistoryAction(existing) : null,
      status: existing?.status || 'unwatched',
      watchedAt: existing?.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(existing?.resumeAtSeconds, existing?.duration ?? metadata.duration)
    }

    if (existing?.status === 'watched' && existing?.watchedAt) {
      showToast(t('toast.alreadyWatched'), 'warn')
      input.value = ''
      closeManualVideoPopover()
      return
    }

    const watchedAt = getCurrentAppTimestamp(s)
    const watchProgress = normalizeVideoWatchProgress(existing?.watchProgress, existing?.duration ?? metadata.duration)
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
      watchProgress,
      source: existing?.source || 'manual',
      manuallyAdded: true
    }
    const missingSeconds = Math.max(0, Math.floor(Number(s.videos[videoId].duration || 0)) - getTotalVideoWatchProgressSeconds(s.videos[videoId]))
    if (missingSeconds > 0) addVideoWatchProgress(s.videos[videoId], missingSeconds, watchedAt)

    pushUndoAction(s, {
      type: 'video-status',
      videoId,
      before,
      after: {
        exists: true,
        video: cloneVideoForHistoryAction(s.videos[videoId]),
        status: 'watched',
        watchedAt,
        resumeAtSeconds: null
      }
    })
    syncStreak(s)
    appendActivityLog(s, {
      actor: 'user',
      type: 'manual-video',
      status: 'success',
      title: 'Watched URL added',
      detail: `"${formatToastTitle(s.videos[videoId].title)}" was added as watched.`,
      meta: { videoId }
    })
    saveState(s)
    input.value = ''
    closeManualVideoPopover()
    renderAll(s)
    showToast(t('toast.addedWatchedVideo', { title: formatToastTitle(s.videos[videoId].title) }), 'success')
  } catch (err) {
    console.warn(err)
    showToast(err.message || t('toast.addVideoFailed'), 'error')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = t('videos.manual.add')
    }
  }
}

function saveVideoResumeTime(videoId, value) {
  const s = loadState()
  const video = s?.videos?.[videoId]
  if (!video || getVideoStatus(video) !== 'partial') return

  const parsed = parseResumeTimestamp(value, video.duration)
  if (Number.isNaN(parsed)) {
    showToast(t('toast.timestampFormat'), 'warn')
    renderAll(s)
    return
  }

  const beforeVideo = cloneVideoForHistoryAction(video)
  const previousResume = normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration) || 0
  const nextResume = parsed || 0
  if (nextResume === previousResume) {
    renderAll(s)
    return
  }
  const watchedAt = getCurrentAppTimestamp(s)
  const progressDelta = Math.max(0, nextResume - previousResume)
  if (progressDelta > 0) addVideoWatchProgress(video, progressDelta, watchedAt)
  video.resumeAtSeconds = parsed
  pushUndoAction(s, {
    type: 'video-status',
    videoId,
    before: {
      video: beforeVideo,
      status: beforeVideo.status,
      watchedAt: beforeVideo.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(beforeVideo.resumeAtSeconds, beforeVideo.duration)
    },
    after: {
      video: cloneVideoForHistoryAction(video),
      status: video.status,
      watchedAt: video.watchedAt || null,
      resumeAtSeconds: normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration)
    }
  })
  syncStreak(s)
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

function cloneVideoForHistoryAction(video) {
  return video ? {
    ...video,
    watchProgress: normalizeVideoWatchProgress(video.watchProgress, video.duration)
  } : null
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
    showToast(direction === 'redo' ? t('toast.nothingRedo') : t('toast.nothingUndo'), 'warn')
    return
  }

  sourceStack.splice(index, 1)
  const targetSnapshot = direction === 'redo' ? action.after : action.before
  const video = applyVideoStatusActionSnapshot(s, action.videoId, targetSnapshot, action, direction)

  if (!video) {
    saveState(s)
    renderAll(s)
    showToast(t('toast.videoGone'), 'warn')
    return
  }

  targetStack.push(action)
  if (targetStack.length > UNDO_STACK_LIMIT) {
    targetStack.splice(0, targetStack.length - UNDO_STACK_LIMIT)
  }
  syncStreak(s)
  appendActivityLog(s, {
    actor: 'user',
    type: direction === 'redo' ? 'redo' : 'undo',
    status: 'success',
    title: direction === 'redo' ? 'Redo action' : 'Undo action',
    detail: formatHistoryActionToast(direction, video, targetSnapshot),
    meta: { videoId: action.videoId }
  })

  closeHistoryActionPopovers()
  saveState(s)
  renderAll(s)
  showToast(formatHistoryActionToast(direction, video, targetSnapshot))
}

function applyVideoStatusActionSnapshot(s, videoId, snapshot, action = null, direction = 'undo') {
  if (!snapshot) return null
  let video = s.videos?.[videoId]
  if (!video && snapshot.video) {
    s.videos[videoId] = cloneVideoForHistoryAction(snapshot.video)
    video = s.videos[videoId]
  }
  if (!video) return null
  if (shouldDeleteManualVideoOnUndo(video, action, snapshot, direction)) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, 'exists')) snapshot.exists = false
    if (action?.after && !action.after.video) action.after.video = cloneVideoForHistoryAction(video)
    delete s.videos[videoId]
    return cloneVideoForHistoryAction(video)
  }
  if (snapshot.video) {
    s.videos[videoId] = cloneVideoForHistoryAction(snapshot.video)
    return s.videos[videoId]
  }
  video.status = snapshot.status
  video.watchedAt = snapshot.watchedAt
  video.resumeAtSeconds = normalizeResumeAtSeconds(snapshot.resumeAtSeconds, video.duration)
  return video
}

function shouldDeleteManualVideoOnUndo(video, action, snapshot, direction) {
  if (direction !== 'undo') return false
  if (snapshot?.exists === false) return true
  if (Object.prototype.hasOwnProperty.call(snapshot || {}, 'exists')) return false
  return Boolean(
    video?.manuallyAdded &&
    video?.source === 'manual' &&
    action?.after?.status === 'watched' &&
    action?.before?.status === 'unwatched' &&
    !action?.before?.watchedAt
  )
}

function formatHistoryActionToast(direction, video, snapshot) {
  const verb = direction === 'redo' ? t('undo.redid') : t('undo.undid')
  if (snapshot?.exists === false) {
    return t('undo.removed', { verb, title: formatToastTitle(video.title) })
  }
  return t('undo.backTo', { verb, title: formatToastTitle(video.title), status: formatVideoStatus(snapshot.status) })
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
    unwatched: t('videos.status.unwatched'),
    'watch-later': t('videos.status.watchLater'),
    partial: t('videos.status.partial'),
    watched: t('videos.status.watched')
  }[status] || t('videos.status.previous')
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
    return t('anki.unavailableOpen')
  }

  const message = err?.message || ''
  if (message === 'Failed to fetch') {
    return isHostedOrigin()
      ? t('anki.blockedHosted')
      : t('anki.unavailableOpen')
  }

  return message ? t('anki.failed', { message }) : t('anki.notAvailable')
}

async function refreshAnkiStats({ silent = false } = {}) {
  try {
    ankiStatsCache = await fetchAnkiStats()
    syncAnkiStatsToState(ankiStatsCache)
    renderAnkiStatus(loadState())
  } catch (err) {
    ankiStatsCache = null
    const s = loadState()
    if (s) {
      const message = formatAnkiConnectError(err)
      appendActivityLog(s, {
        actor: 'auto',
        type: 'anki-refresh',
        status: 'warn',
        title: 'Anki refresh failed',
        detail: message
      })
      saveState(s)
    }
    renderAnkiStatus(s)
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
  appendActivityLog(s, {
    actor: 'auto',
    type: 'anki-refresh',
    status: 'success',
    title: 'Anki stats refreshed',
    detail: `${stats.reviewedToday} reviewed today, ${stats.newToday} new card${stats.newToday === 1 ? '' : 's'} found.`,
    meta: {
      ankiDateKey,
      reviewedToday: stats.reviewedToday,
      newToday: stats.newToday,
      dueCards: stats.dueCards
    }
  })
  syncStreak(s)
  saveState(s)
  renderHeader(s)
  renderAnalytics(getWeeklyStats(s), s)
  const score = getCurrentCityScore(s)
  renderCity(score, s)
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
    getVideoWatchActivityDateKeys(video).forEach(dateKey => dateKeys.add(dateKey))
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
  return formatLocaleDate(start, { month: 'long', year: 'numeric' })
}

function formatHistoryWeekOption(start) {
  const end = addDays(start, 6)
  const sameYear = start.getFullYear() === end.getFullYear()
  const startText = formatLocaleDate(start, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
  const endText = formatLocaleDate(end, { month: 'short', day: 'numeric', year: 'numeric' })
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
    getVideoWatchProgressEntries(video).forEach(entry => {
      const date = new Date(entry.watchedAt)
      if (date < start || date > end) return
      const bucket = ensureBucket(toDateKey(date))
      if (!bucket.watchedVideoMap) bucket.watchedVideoMap = new Map()
      const videoId = video.id || ''
      let watchedVideo = bucket.watchedVideoMap.get(videoId)
      if (!watchedVideo) {
        watchedVideo = {
          id: videoId,
          title: video.title || 'Untitled video',
          thumbnail: video.thumbnail || '',
          duration: 0,
          watchedAt: entry.watchedAt
        }
        bucket.watchedVideoMap.set(videoId, watchedVideo)
        bucket.watchedVideos.push(watchedVideo)
        bucket.videosWatched += 1
      }
      watchedVideo.duration += entry.seconds || 0
      if (new Date(entry.watchedAt) > new Date(watchedVideo.watchedAt)) watchedVideo.watchedAt = entry.watchedAt
      bucket.secondsWatched += entry.seconds || 0
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
    delete row.watchedVideoMap
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
      <button type="button" class="history-video-count" onclick="toggleHistoryVideoPopover(event)" aria-expanded="false" aria-label="${escHtml(t('history.showWatched', { count: row.videosWatched, date: formatHeatmapTitle(row) }))}">
        <span class="history-video-count-number">${row.videosWatched}</span>
        <span class="history-video-count-caret" aria-hidden="true"></span>
      </button>
      <span class="history-video-popover" role="dialog" aria-label="${escHtml(t('history.watchedDialog'))}">
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

function formatHistoryPointNumber(points) {
  const value = Number(points || 0)
  return new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value)
}

function formatHistoryPointLabel(points) {
  const value = Number(points || 0)
  const key = Math.abs(value - 1) < 0.0001 ? 'points.one' : 'points.many'
  return t(key, { count: formatHistoryPointNumber(value) })
}

function getHistoryPointBreakdown(row) {
  const videoItems = (row.watchedVideos || [])
    .filter(video => (video.duration || 0) > 0)
    .map(video => ({
      type: 'video',
      title: video.title || 'Untitled video',
      detail: formatHistoryTime(video.duration || 0),
      points: ((video.duration || 0) / 3600) * VIDEO_HOUR_POINTS
    }))

  const ankiPoints = ((row.ankiReviewed || 0) / ANKI_REVIEW_CHUNK_SIZE) * ANKI_REVIEW_CHUNK_POINTS
  const items = []
  if ((row.ankiReviewed || 0) > 0) {
    items.push({
      type: 'anki',
      title: t('history.pointsAnkiReviews'),
      detail: t('history.pointsReviewsCount', { count: row.ankiReviewed }),
      points: ankiPoints
    })
  }
  items.push(...videoItems)

  const rawTotal = items.reduce((total, item) => total + item.points, 0)
  return {
    items,
    rawTotal,
    total: Math.floor(rawTotal)
  }
}

function renderHistoryPointsCell(row) {
  const breakdown = getHistoryPointBreakdown(row)
  const points = getHistoryDayPoints(row)
  return `
    <span class="history-points-cell" onmouseenter="openHistoryPointsPopover(event)" onmouseleave="closeHistoryPointsPopoverSoon()" onfocusin="openHistoryPointsPopover(event)" onfocusout="closeHistoryPointsPopoverSoon()" onclick="toggleHistoryPointsPopover(event)">
      <button type="button" class="history-points-trigger" aria-expanded="false" aria-label="${escHtml(t('history.showPoints', { date: formatHeatmapTitle(row) }))}">
        ${points}
      </button>
      <span class="history-points-popover" role="dialog" aria-label="${escHtml(t('history.pointsDialog'))}">
        ${breakdown.items.length
          ? breakdown.items.map(item => `
            <span class="history-points-popover-item">
              <span class="history-points-popover-title">${escHtml(item.title)}</span>
              <span class="history-points-popover-detail">${escHtml(item.detail)}</span>
              <span class="history-points-popover-score">${escHtml(formatHistoryPointLabel(Math.floor(item.points)))}</span>
            </span>
          `).join('')
          : `<span class="history-points-popover-empty">${escHtml(t('history.pointsNone'))}</span>`}
        <span class="history-points-popover-total">
          <span>${escHtml(t('history.pointsDailyTotal'))}</span>
          <b>${escHtml(formatHistoryPointLabel(breakdown.total))}</b>
          ${breakdown.rawTotal !== breakdown.total
            ? `<small>${escHtml(formatHistoryPointLabel(breakdown.rawTotal))} ${escHtml(t('history.pointsRounding'))}</small>`
            : ''}
        </span>
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
  closeHistoryPointsPopovers()
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

function toggleHistoryPointsPopover(event) {
  event.stopPropagation()
  const cell = event.currentTarget.closest('.history-points-cell')
  if (!cell) return
  const shouldOpen = !cell.classList.contains('open')
  openHistoryPointsCell(cell, shouldOpen)
}

function openHistoryPointsPopover(event) {
  const cell = event.currentTarget.closest('.history-points-cell')
  if (!cell) return
  openHistoryPointsCell(cell, true)
}

function closeHistoryPointsPopoverSoon() {
  clearTimeout(openHistoryPointsCell._closeTimer)
  openHistoryPointsCell._closeTimer = window.setTimeout(() => closeHistoryPointsPopovers(), 80)
}

function openHistoryPointsCell(cell, shouldOpen = true) {
  clearTimeout(openHistoryPointsCell._closeTimer)
  closeManualVideoPopover()
  closeHistoryVideoPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryPointsPopovers(cell)
  cell.classList.toggle('open', shouldOpen)
  cell.querySelector('.history-points-trigger')?.setAttribute('aria-expanded', String(shouldOpen))
}

function closeHistoryPointsPopovers(exceptCell = null) {
  clearTimeout(openHistoryPointsCell._closeTimer)
  document.querySelectorAll('.history-points-cell.open').forEach(cell => {
    if (cell === exceptCell) return
    cell.classList.remove('open')
    cell.querySelector('.history-points-trigger')?.setAttribute('aria-expanded', 'false')
  })
}

function closeHistoryPointsPopoversOnOutsideClick(event) {
  if (event.target.closest('.history-points-cell')) return
  closeHistoryPointsPopovers()
}

function closeHistoryPointsPopoversOnEscape(event) {
  if (event.key !== 'Escape') return
  closeHistoryPointsPopovers()
}

function jumpToWatchedVideo(videoId) {
  const targetId = String(videoId ?? '')
  const state = loadState()
  if (!state?.videos?.[targetId]) {
    closeHistoryVideoPopovers()
    showToast(t('toast.videoGone'), 'warn')
    return
  }

  closeHistoryVideoPopovers()
  forcedSearchVideoId = targetId
  renderFeed(state)
  window.setTimeout(() => {
    const found = scrollToVideoCard(targetId)
    forcedSearchVideoId = null
    if (!found) showToast(t('toast.couldNotShowVideo'), 'warn')
  }, 0)
}

function scrollToVideoCard(videoId, selector = '.video-card') {
  const targetId = String(videoId ?? '')
  const card = Array.from(document.querySelectorAll(selector))
    .find(el => el.dataset.videoId === targetId)
  if (!card) return false
  flashVideoCard(card)
  return true
}

function flashVideoCard(card) {
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.classList.remove('flash-target')
  void card.offsetWidth
  card.classList.add('flash-target')
  window.setTimeout(() => card.classList.remove('flash-target'), 1900)
}

function toggleVideoSearchPopover(event) {
  event?.stopPropagation()
  const popover = document.getElementById('videoSearchPopover')
  const button = document.getElementById('videoSearchBtn')
  const input = document.getElementById('videoSearchInput')
  if (!popover || !button || !input) return

  const shouldOpen = popover.classList.contains('hidden')
  if (!shouldOpen) {
    closeVideoSearchPopover()
    return
  }

  closeStatusFilterMenu()
  closeChannelFilterMenu()
  closeManualVideoPopover()
  closeHistoryVideoPopovers()
  closeHistoryPointsPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryActionPopovers()
  closeVideoSearchPopover()
  hideHeatmapTooltip()
  popover.classList.remove('hidden')
  button.setAttribute('aria-expanded', 'true')
  renderVideoSearchResults(input.value)
  window.setTimeout(() => input.focus(), 0)
}

function closeVideoSearchPopover() {
  const popover = document.getElementById('videoSearchPopover')
  const button = document.getElementById('videoSearchBtn')
  if (popover) popover.classList.add('hidden')
  if (button) button.setAttribute('aria-expanded', 'false')
}

function closeVideoSearchPopoverOnOutsideClick(event) {
  if (event.target.closest('.video-search')) return
  closeVideoSearchPopover()
}

function closeVideoSearchPopoverOnEscape(event) {
  if (event.key !== 'Escape') return
  closeVideoSearchPopover()
}

function handleVideoSearchInputKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeVideoSearchPopover()
    return
  }
  if (event.key !== 'Enter') return
  const firstResult = document.querySelector('#videoSearchResults .video-search-result')
  if (!firstResult) return
  event.preventDefault()
  firstResult.click()
}

function renderVideoSearchResults(query = '') {
  const list = document.getElementById('videoSearchResults')
  if (!list) return

  const normalizedQuery = normalizeVideoSearchText(query)
  if (!normalizedQuery) {
    list.innerHTML = `<p class="video-search-empty">${escHtml(t('videos.search.empty'))}</p>`
    return
  }

  const results = getVideoSearchMatches(normalizedQuery, loadState())
  if (!results.length) {
    list.innerHTML = `<p class="video-search-empty">${escHtml(t('videos.search.noMatches'))}</p>`
    return
  }

  list.innerHTML = results.map(video => `
    <button type="button" class="video-search-result" data-video-id="${escHtml(video.id)}" onclick="jumpToVideoFromSearch(this.dataset.videoId)">
      ${video.thumbnail
        ? `<img src="${escHtml(video.thumbnail)}" alt="" class="video-search-thumb" loading="lazy">`
        : '<span class="video-search-thumb video-search-thumb-empty"></span>'}
      <span class="video-search-copy">
        <span class="video-search-title">${escHtml(video.title || t('videos.search.untitled'))}</span>
        <span class="video-search-meta">
          <span>${escHtml(video.channelTitle || t('videos.search.youtube'))}</span>
          <span class="video-search-status">${escHtml(formatVideoStatus(getVideoStatus(video)))}</span>
        </span>
      </span>
    </button>
  `).join('')
}

function normalizeVideoSearchText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function getVideoSearchMatches(query, state = loadState()) {
  const normalizedQuery = normalizeVideoSearchText(query)
  if (!normalizedQuery || !state?.videos) return []
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  return Object.values(state.videos)
    .filter(video => videoMatchesSearch(video, normalizedQuery, tokens))
    .map(video => ({
      video,
      score: getVideoSearchScore(video, normalizedQuery, tokens)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return getVideoSearchTimestamp(b.video) - getVideoSearchTimestamp(a.video)
    })
    .slice(0, VIDEO_SEARCH_RESULT_LIMIT)
    .map(entry => entry.video)
}

function videoMatchesSearch(video, query, tokens) {
  const title = normalizeVideoSearchText(video?.title)
  const channel = normalizeVideoSearchText(video?.channelTitle)
  const haystack = `${title} ${channel}`
  return haystack.includes(query) || tokens.every(token => haystack.includes(token))
}

function getVideoSearchScore(video, query, tokens) {
  const title = normalizeVideoSearchText(video?.title)
  const channel = normalizeVideoSearchText(video?.channelTitle)
  const statusPriority = {
    partial: 18,
    'watch-later': 12,
    watched: 8,
    unwatched: 0
  }
  let score = statusPriority[getVideoStatus(video)] || 0

  if (title === query) score += 120
  else if (title.startsWith(query)) score += 95
  else if (title.includes(query)) score += 75
  else score += tokens.filter(token => title.includes(token)).length * 18

  if (channel === query) score += 70
  else if (channel.startsWith(query)) score += 52
  else if (channel.includes(query)) score += 40
  else score += tokens.filter(token => channel.includes(token)).length * 10

  return score
}

function getVideoSearchTimestamp(video) {
  const watchedAt = new Date(video?.watchedAt || 0).getTime()
  const publishedAt = new Date(video?.publishedAt || 0).getTime()
  return Math.max(
    Number.isFinite(watchedAt) ? watchedAt : 0,
    Number.isFinite(publishedAt) ? publishedAt : 0
  )
}

function jumpToVideoFromSearch(videoId) {
  const targetId = String(videoId ?? '')
  const state = loadState()
  if (!state?.videos?.[targetId]) {
    closeVideoSearchPopover()
    showToast(t('toast.videoGone'), 'warn')
    return
  }

  closeVideoSearchPopover()
  forcedSearchVideoId = targetId
  renderFeed(state)
  window.setTimeout(() => {
    const found = scrollToVideoCard(targetId)
    forcedSearchVideoId = null
    if (!found) showToast(t('toast.couldNotShowVideo'), 'warn')
  }, 0)
}

function formatHistoryDate(dateKey, state = null) {
  const date = new Date(`${dateKey}T00:00:00`)
  const todayDate = getCurrentAppDate(state)
  const today = toDateKey(todayDate)
  const yesterday = toDateKey(addDays(todayDate, -1))
  if (dateKey === today) return t('history.today')
  if (dateKey === yesterday) return t('history.yesterday')
  return formatLocaleDate(date, { month: 'short', day: 'numeric' })
}

function renderStudyHistoryPanel(s) {
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
          <span>${escHtml(t('history.table.date'))}</span>
          <span>${escHtml(t('history.table.video'))}</span>
          <span>${escHtml(t('history.table.watched'))}</span>
          <span>${escHtml(t('history.table.anki'))}</span>
          <span class="history-points-col">${escHtml(t('history.table.points'))}</span>
        </div>
        ${history.rows.map(row => `
          <div class="history-row">
            <span data-label="${escHtml(t('history.table.date'))}">${formatHistoryDate(row.dateKey, s)}</span>
            <span data-label="${escHtml(t('history.table.video'))}">${formatHistoryTime(row.secondsWatched)}</span>
            <span data-label="${escHtml(t('history.table.watched'))}">${renderHistoryWatchedCell(row)}</span>
            <span data-label="${escHtml(t('history.table.anki'))}">${row.ankiReviewed} / ${row.ankiCreated}</span>
            <span class="history-points-col" data-label="${escHtml(t('history.table.points'))}">${renderHistoryPointsCell(row)}</span>
          </div>
        `).join('')}
      `
      : `<div class="history-empty">${escHtml(t('history.emptyRange'))}</div>`
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
    ((row.ankiReviewed / ANKI_REVIEW_CHUNK_SIZE) * ANKI_REVIEW_CHUNK_POINTS)
  return Math.floor(score)
}

function hasHistoryActivity(row) {
  return row.secondsWatched > 0 || row.videosWatched > 0 || row.ankiReviewed > 0 || row.ankiCreated > 0
}

function formatHeatmapTitle(row) {
  const date = new Date(`${row.dateKey}T00:00:00`)
  return formatLocaleDate(date, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatHeatmapAriaLabel(row) {
  return t('history.heatmapAria', {
    date: formatHeatmapTitle(row),
    points: getHistoryDayPoints(row),
    time: formatHistoryTime(row.secondsWatched),
    videos: row.videosWatched,
    reviewed: row.ankiReviewed,
    created: row.ankiCreated
  })
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
    container.innerHTML = `<div class="history-empty">${escHtml(t('history.noActivityMap'))}</div>`
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
        ${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => `<span>${escHtml(t(`history.weekdays.${day}`))}</span>`).join('')}
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
      <div class="heatmap-tooltip-points">${escHtml(t('history.tooltip.points', { count: target.dataset.points }))}</div>
    </div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">⏱</span><span>${escHtml(t('history.tooltip.videoTime'))}</span><b>${escHtml(target.dataset.time)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">✓</span><span>${escHtml(t('history.tooltip.videosWatched'))}</span><b>${escHtml(target.dataset.videos)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">A</span><span>${escHtml(t('history.tooltip.ankiReviewed'))}</span><b>${escHtml(target.dataset.reviewed)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">+</span><span>${escHtml(t('history.tooltip.ankiCreated'))}</span><b>${escHtml(target.dataset.created)}</b></div>
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
  const partial = videos.filter(v => v.status === 'partial')
  const weekHistory = getStudyHistoryBetween(s, weekStart, weekEnd).summary
  const secondsWatched = weekHistory.secondsWatched

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
    videosWatched: weekHistory.videosWatched,
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
    return minutes > 0
      ? t('time.hoursMinutesCompact', { hours, minutes })
      : t('time.hoursCompact', { hours })
  }
  return t('time.minutesCompact', { minutes })
}

function formatWeeklyWatchedTime(secs) {
  if (secs < 3600) {
    const minutes = secs > 0 ? Math.max(1, Math.floor(secs / 60)) : 0
    return t('time.minutesCompact', { minutes })
  }
  return t('time.hoursCompact', { hours: (secs / 3600).toFixed(1) })
}

function formatHistoryTime(secs) {
  const hours = Math.floor(secs / 3600)
  const minutes = Math.ceil((secs % 3600) / 60)
  if (hours > 0) {
    return minutes > 0
      ? t('time.hoursMinutes', { hours, minutes })
      : t('time.hours', { hours })
  }
  return t('time.minutes', { minutes })
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
  return getCityLevelLabel(getCityLevel(score))
}

function getCityLevelLabel(level) {
  if (!level) return ''
  return level.labelKey ? t(level.labelKey) : level.label
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
  const streakCount = Math.max(0, Number(s.streak.current) || 0)
  pill.classList.toggle('streak-zero', streakCount === 0)
  pill.classList.toggle('streak-low', streakCount > 0 && streakCount < 5)
  pill.classList.toggle('streak-high', streakCount >= 5)
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
    : `<span class="history-period-empty">${escHtml(t('history.noActivityYet'))}</span>`
}

function toggleHistoryPeriodPopover(event, range) {
  event.stopPropagation()
  selectedHistoryRange = HISTORY_RANGES.includes(range) ? range : 'week'
  const cell = event.currentTarget.closest('.history-period-cell')
  if (!cell) return
  const shouldOpen = !cell.classList.contains('open')
  closeManualVideoPopover()
  closeHistoryVideoPopovers()
  closeHistoryPointsPopovers()
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
  const state = loadState()
  if (state?.config) {
    state.config.historyView = selectedHistoryView
    saveState(state, { backup: false })
  }
  renderStudyHistoryPanel(state)
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
  if (scoreContext) scoreContext.textContent = snapshot.isToday ? t('city.totalPts') : t('city.ptsByThen')
  const nextLevel = CITY_LEVELS[snapshot.pendingLevelIndex || snapshot.visualLevelIndex + 1] || null
  const hasEarnedUnrevealedLevel = snapshot.earnedLevelIndex > snapshot.visualLevelIndex
  document.getElementById('cityNextLevel').textContent = nextLevel
    ? snapshot.hasPendingLevel || hasEarnedUnrevealedLevel
      ? t('city.readyNext')
      : t('city.ptsToNext', { count: nextLevel.threshold - snapshot.score })
    : t('city.maxLevel')
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
  appendActivityLog(s, {
    actor: 'user',
    type: 'level-claim',
    status: 'success',
    title: 'Level-up claimed',
    detail: getCityLevelLabel(CITY_LEVELS[s.cityProgress.maxLevelIndex]),
    meta: { levelIndex: s.cityProgress.maxLevelIndex }
  })
  saveState(s)
  renderAll(s)
  showToast(t('toast.levelUp', { label: getCityLevelLabel(CITY_LEVELS[s.cityProgress.maxLevelIndex]) }), 'success')
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
    getVideoWatchActivityDateKeys(video).forEach(dateKey => dates.push(dateKey))
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
    getVideoWatchActivityDateKeys(video).forEach(dateKey => dates.push(dateKey))
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
    const ariaLabel = t('city.timelineAria', {
      date: label,
      points,
      changed: hasLevelChange ? t('city.timelineChanged') : ''
    })
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
  if (dateKey === toDateKey(new Date(Date.now() - 86_400_000))) return t('history.yesterday')
  return formatLocaleDate(date, { month: 'short', day: 'numeric' })
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
  const includeShorts = normalizeIncludeShorts(s.config.includeShorts)
  renderStatusFilterOptions(allVideos, channelFilters, includeShorts)

  const forcedSearchVideo = forcedSearchVideoId && s.videos?.[forcedSearchVideoId]
    ? s.videos[forcedSearchVideoId]
    : null

  let activeVideos = getVisibleActiveVideos(allVideos, includeShorts)
    .filter(v => ['all', 'watch-later', 'unwatched', 'partial'].includes(statusFilter) && (statusFilter === 'all' || getVideoStatus(v) === statusFilter))
    .filter(v => matchesChannelFilter(v, channelFilters))

  let watchedVideos = allVideos
    .filter(v => getVideoStatus(v) === 'watched')
    .filter(v => matchesChannelFilter(v, channelFilters))
    .sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0))

  if (forcedSearchVideo) {
    if (getVideoStatus(forcedSearchVideo) === 'watched') {
      watchedVideos = includeForcedSearchVideo(watchedVideos, forcedSearchVideo)
    } else {
      activeVideos = includeForcedSearchVideo(activeVideos, forcedSearchVideo)
    }
  }

  if (!activeVideos.length) {
    const channelMsg = channelFilters.size === getChannelFilterEntries(s).length ? '' : t('videos.empty.selectedChannels')
    const filterName = statusFilter === 'partial'
      ? t('videos.filter.inProgress')
      : statusFilter === 'watch-later'
      ? t('videos.filter.watchLater')
      : getStatusFilterLabel(statusFilter).toLowerCase()
    const msg = statusFilter === 'all' && watchedVideos.length
      ? t('videos.empty.activeBelow')
      : statusFilter === 'all' && !channelMsg
      ? t('videos.empty.default')
      : t('videos.empty.filtered', { filter: statusFilter === 'all' ? t('videos.filter.active') : filterName, channelText: channelMsg })
    grid.innerHTML = `<div class="empty-state">${escHtml(msg)}</div>`
  } else {
    grid.innerHTML = activeVideos.map(v => renderCard(v)).join('')
  }

  watchedCount.textContent = watchedVideos.length
  watchedSection.classList.toggle('hidden', !watchedVideos.length)
  watchedGrid.innerHTML = watchedVideos.map(v => renderCard(v, true)).join('')
}

function includeForcedSearchVideo(videos, forcedVideo) {
  if (!forcedVideo?.id) return videos
  if (videos.some(video => video.id === forcedVideo.id)) return videos
  return [forcedVideo, ...videos]
}

function renderUndoButton(s) {
  renderHistoryActionButton({
    buttonId: 'undoBtn',
    tooltipId: 'undoTooltip',
    actions: Array.isArray(s.undoStack) ? s.undoStack : [],
    state: s,
    label: t('videos.undo'),
    emptyTitle: t('videos.undo.empty'),
    queueTitle: t('videos.undo.queue'),
    titleVerb: t('videos.undo.title'),
    direction: 'undo'
  })
  renderHistoryActionButton({
    buttonId: 'redoBtn',
    tooltipId: 'redoTooltip',
    actions: Array.isArray(s.redoStack) ? s.redoStack : [],
    state: s,
    label: t('videos.redo'),
    emptyTitle: t('videos.redo.empty'),
    queueTitle: t('videos.redo.queue'),
    titleVerb: t('videos.redo.title'),
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

  return `
    <div class="undo-tooltip-title">${escHtml(queueTitle)}</div>
    <div class="undo-tooltip-scroll" onmousemove="handleHistoryActionScrollHover(event)" onmouseleave="stopHistoryActionAutoScroll()">
      ${indexedActions.map(entry => renderHistoryActionTooltipItem(entry, s, direction)).join('')}
    </div>
  `
}

function renderHistoryActionTooltipItem(entry, s, direction) {
  const { action, index } = entry
  const video = s.videos?.[action.videoId]
  const title = video?.title || t('videos.search.untitled')
  const timestamp = formatHistoryActionTimestamp(action)
  const fromStatus = direction === 'redo'
    ? formatVideoStatus(action.before?.status)
    : formatVideoStatus(action.after?.status || video?.status)
  const toStatus = direction === 'redo'
    ? formatVideoStatus(action.after?.status)
    : formatVideoStatus(action.before?.status)
  const actionText = direction === 'redo'
    ? t('undo.statusChange', { from: fromStatus, to: toStatus })
    : t('undo.backToStatus', { from: fromStatus, to: toStatus })
  return `
    <button type="button" class="undo-tooltip-item undo-tooltip-action-btn" onclick="applyHistoryAction('${direction}', ${index})">
      <span class="undo-tooltip-video">${escHtml(title)}</span>
      <span class="undo-tooltip-action">${escHtml(actionText)}</span>
      <span class="undo-tooltip-time">${escHtml(timestamp)}</span>
    </button>
  `
}

function formatHistoryActionTimestamp(action) {
  if (!action?.createdAt) return t('undo.timeUnavailable')
  const date = new Date(action.createdAt)
  if (Number.isNaN(date.getTime())) return t('undo.timeUnavailable')
  return t('undo.doneAt', { time: formatLocaleDateTime(date, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) })
}

function handleHistoryActionScrollHover(event) {
  const scroller = event.currentTarget
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight) {
    stopHistoryActionAutoScroll()
    return
  }

  const edgeSize = 44
  const maxSpeed = 8
  const rect = scroller.getBoundingClientRect()
  const topDistance = event.clientY - rect.top
  const bottomDistance = rect.bottom - event.clientY
  let speed = 0

  if (topDistance < edgeSize) {
    speed = -Math.ceil(((edgeSize - Math.max(0, topDistance)) / edgeSize) * maxSpeed)
  } else if (bottomDistance < edgeSize) {
    speed = Math.ceil(((edgeSize - Math.max(0, bottomDistance)) / edgeSize) * maxSpeed)
  }

  startHistoryActionAutoScroll(scroller, speed)
}

function startHistoryActionAutoScroll(scroller, speed) {
  if (!speed) {
    stopHistoryActionAutoScroll()
    return
  }
  historyActionScroll.scroller = scroller
  historyActionScroll.speed = speed
  if (historyActionScroll.frame) return
  historyActionScroll.frame = requestAnimationFrame(stepHistoryActionAutoScroll)
}

function stepHistoryActionAutoScroll() {
  const scroller = historyActionScroll.scroller
  if (!scroller || !historyActionScroll.speed) {
    stopHistoryActionAutoScroll()
    return
  }
  const before = scroller.scrollTop
  scroller.scrollTop += historyActionScroll.speed
  if (scroller.scrollTop === before) {
    stopHistoryActionAutoScroll()
    return
  }
  historyActionScroll.frame = requestAnimationFrame(stepHistoryActionAutoScroll)
}

function stopHistoryActionAutoScroll() {
  if (historyActionScroll.frame) cancelAnimationFrame(historyActionScroll.frame)
  historyActionScroll.frame = null
  historyActionScroll.scroller = null
  historyActionScroll.speed = 0
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
  closeHistoryPointsPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryActionPopovers(wrap)
  wrap.classList.toggle('open', shouldOpen)
  btn.setAttribute('aria-expanded', String(shouldOpen))
}

function closeHistoryActionPopovers(exceptWrap = null) {
  stopHistoryActionAutoScroll()
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

function renderStatusFilterOptions(allVideos = [], channelFilters = null, includeShorts = true) {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return

  const counts = getStatusFilterCounts(allVideos, channelFilters, includeShorts)
  btn.textContent = getStatusFilterLabel(selectedStatusFilter)
  menu.innerHTML = STATUS_FILTERS.map(([value, label]) => `
    <label class="channel-filter-option status-filter-option">
      <input type="radio" name="statusFilter" data-status="${value}" ${selectedStatusFilter === value ? 'checked' : ''} onchange="setStatusFilter(this.dataset.status)">
      <span class="status-filter-label">${escHtml(t(label))}</span>
      <span class="status-filter-count">${counts[value] ?? 0}</span>
    </label>
  `).join('')
  if (!menu.classList.contains('hidden')) positionFilterMenuWithinViewport(menu)
}

function getStatusFilterCounts(allVideos = [], channelFilters = null, includeShorts = true) {
  const selectedChannels = channelFilters || new Set()
  const matchesSelection = video => !channelFilters || matchesChannelFilter(video, selectedChannels)
  const activeVideos = getVisibleActiveVideos(allVideos, includeShorts).filter(matchesSelection)
  const counts = Object.fromEntries(STATUS_FILTERS.map(([value]) => [value, 0]))

  activeVideos.forEach(video => {
    const status = getVideoStatus(video)
    if (status !== 'watched') counts[status] += 1
  })

  counts.all = activeVideos.length

  return counts
}

function getStatusFilterLabel(status) {
  const key = STATUS_FILTERS.find(([value]) => value === status)?.[1] || 'videos.status.all'
  return t(key)
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
    : `<div class="channel-filter-empty">${escHtml(t('videos.channels.none'))}</div>`
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
  if (!entries.length) return t('videos.channels.none')
  if (selected.size === entries.length) return t('videos.channels.all')
  if (!selected.size) return t('videos.channels.none')
  if (selected.size === 1) {
    const selectedEntry = entries.find(([id]) => selected.has(id))
    return selectedEntry?.[1] || t('videos.channels.one')
  }
  return t('videos.channels.count', { count: selected.size })
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
  closeHistoryPointsPopovers()
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
  closeHistoryPointsPopovers()
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

function isHiddenShortVideo(video, includeShorts) {
  return !includeShorts && isShortDuration(video?.duration)
}

function getVisibleActiveVideos(videos, includeShorts = true) {
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
    .filter(v => !isHiddenShortVideo(v, includeShorts))
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
  const videoUrl = escHtml(getVideoUrl(v))
  const isWatched = status === 'watched'
  const isPartial = status === 'partial'
  const isWatchLater = status === 'watch-later'
  const watchedNextStatus = isWatched ? 'unwatched' : 'watched'
  const partialNextStatus = isPartial ? 'unwatched' : 'partial'
  const watchLaterNextStatus = isWatchLater ? 'unwatched' : 'watch-later'
  const watchedLabel = compact
    ? t('videos.card.unmark')
    : `✓ ${isWatched ? t('videos.status.watched') : t('videos.card.markWatched')}`
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
        ${isPartial ? `<span class="progress-ribbon">${escHtml(t('videos.card.inProgressRibbon'))}</span>` : ''}
        ${isWatchLater ? `<span class="progress-ribbon watch-later-ribbon">${escHtml(t('videos.card.watchLater'))}</span>` : ''}
      </a>
      <div class="card-body">
        ${isPartial ? `<div class="card-status partial-status">⏸ ${escHtml(t('videos.card.resume'))}</div>` : ''}
        ${isWatchLater ? `<div class="card-status watch-later-status">★ ${escHtml(t('videos.card.watchLater'))}</div>` : ''}
        <div class="card-copy">
          <div class="card-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
          ${watchedAtLabel ? `<div class="card-watched-at">${escHtml(watchedAtLabel)}</div>` : ''}
          ${isPartial ? `
            <label class="resume-time-field">
              <span>${escHtml(t('videos.card.continueAt'))}</span>
              <input type="text"
                value="${escHtml(resumeAtValue)}"
                placeholder="00:01:23"
                inputmode="text"
                data-video-id="${safeVideoId}"
                onchange="saveVideoResumeTime(this.dataset.videoId, this.value)"
                onkeydown="if (event.key === 'Enter') this.blur()"
                aria-label="${escHtml(t('videos.card.timestampLabel'))}">
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
            title="${escHtml(isWatched ? t('videos.card.unmark') : t('videos.card.markWatchedTitle'))}">
            ${watchedLabel}
          </button>
          <button class="action-btn partial-btn ${isPartial ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${partialNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            title="${escHtml(isPartial ? t('videos.card.clear') : t('videos.card.markProgress'))}">⏸</button>
          <button class="action-btn watch-later-btn ${isWatchLater ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${watchLaterNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            title="${escHtml(isWatchLater ? t('videos.card.removeWatchLater') : t('videos.card.watchLater'))}">★</button>
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
document.addEventListener('click', closeHistoryPointsPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryPeriodPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryActionPopoversOnOutsideClick)
document.addEventListener('click', closeManualVideoPopoverOnOutsideClick)
document.addEventListener('click', closeVideoSearchPopoverOnOutsideClick)
document.addEventListener('click', hideHeatmapTooltipOnOutsideClick)
document.addEventListener('click', clearCityWaveformPreviewOnOutsideClick)
document.addEventListener('keydown', closeHistoryVideoPopoversOnEscape)
document.addEventListener('keydown', closeHistoryPointsPopoversOnEscape)
document.addEventListener('keydown', closeHistoryPeriodPopoversOnEscape)
document.addEventListener('keydown', closeHistoryActionPopoversOnEscape)
document.addEventListener('keydown', closeManualVideoPopoverOnEscape)
document.addEventListener('keydown', closeVideoSearchPopoverOnEscape)
document.addEventListener('keydown', closeSettingsOnEscape)
if (!IS_SANDBOX) document.addEventListener('visibilitychange', refreshAnkiStatsOnVisible)
