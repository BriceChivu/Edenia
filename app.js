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

const URL_PARAMS = new URLSearchParams(window.location.search)
const IS_SANDBOX = URL_PARAMS.get('sandbox') === '1'
const IS_INTERNAL_TEST = URL_PARAMS.get('internal_test') === '1'
const IS_LOCALHOST = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
const SANDBOX_CHANNELS_VERSION = 2
const SANDBOX_CHANNEL_DEFINITIONS = [
  { id: 'sandbox-focus', nameKey: 'sandbox.channel.focus', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Dermot_Mulroney_Photo_Op_Nightmare_Weekend_Chicago_2025.jpg/250px-Dermot_Mulroney_Photo_Op_Nightmare_Weekend_Chicago_2025.jpg' },
  { id: 'sandbox-memory', nameKey: 'sandbox.channel.memory', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Apink_on_19_April_2022.jpg/250px-Apink_on_19_April_2022.jpg' },
  { id: 'sandbox-projects', nameKey: 'sandbox.channel.projects', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Ulughbegsaurus.webp/250px-Ulughbegsaurus.webp.png' },
  { id: 'sandbox-language', nameKey: 'sandbox.channel.language', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Brown_Rot_on_Apple.jpg/250px-Brown_Rot_on_Apple.jpg' },
  { id: 'sandbox-science', nameKey: 'sandbox.channel.science', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Waltraud_Strotzer_%28cropped%29.jpg/250px-Waltraud_Strotzer_%28cropped%29.jpg' },
  { id: 'sandbox-history', nameKey: 'sandbox.channel.history', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Hemicycla_mascaensis_01.JPG/250px-Hemicycla_mascaensis_01.JPG' },
  { id: 'sandbox-design', nameKey: 'sandbox.channel.design', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Movie_Madness_storefront_Oct_20_2017_%28cropped%29.jpg/250px-Movie_Madness_storefront_Oct_20_2017_%28cropped%29.jpg' },
  { id: 'sandbox-music', nameKey: 'sandbox.channel.music', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Savitha_Shri_B_2019_Karlsruhe.jpg/250px-Savitha_Shri_B_2019_Karlsruhe.jpg' },
  { id: 'sandbox-travel', nameKey: 'sandbox.channel.travel', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Ideogram_human_chromosome_3.svg/250px-Ideogram_human_chromosome_3.svg.png' },
  { id: 'sandbox-culture', nameKey: 'sandbox.channel.culture', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/SNYDER_MILL%2C_EXETER_TWP.%2C_BERKS_COUNTY.jpg/250px-SNYDER_MILL%2C_EXETER_TWP.%2C_BERKS_COUNTY.jpg' }
]
const NORMAL_STORAGE_KEY = 'edenia_v1'
const STORAGE_KEY = IS_SANDBOX
  ? 'edenia_v1_sandbox'
  : IS_INTERNAL_TEST
    ? 'edenia_v1_internal_test'
    : NORMAL_STORAGE_KEY
const STATE_BACKUP_KEY = `${STORAGE_KEY}_backups`
const SANDBOX_WALKTHROUGH_AFTER_RESET_KEY = `${STORAGE_KEY}_walkthrough_after_reset`
const ONBOARDING_NOTICE_KEY = IS_INTERNAL_TEST
  ? 'edenia_onboarding_notice_internal_test'
  : 'edenia_onboarding_notice'
const STATE_BACKUP_LIMIT = 8
const ACTIVITY_LOG_LIMIT = 500
const STATE_BACKUP_AUTO_INTERVAL_MS = 10 * 60_000
const CONFIG_COOKIE_KEY = IS_SANDBOX
  ? 'edenia_config_sandbox'
  : IS_INTERNAL_TEST
    ? 'edenia_config_internal_test'
    : 'edenia_config'
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const YOUTUBE_REFRESH_INTERVAL_MS = 5 * 60 * 60_000
const YOUTUBE_REFRESH_ERROR_BACKOFF_MS = 30 * 60_000
const SHORTS_ENABLE_REFETCH_COOLDOWN_MS = YOUTUBE_REFRESH_INTERVAL_MS
const ACTIVE_VIDEOS_PER_CHANNEL = 5
const SANDBOX_VIDEOS_PER_CHANNEL = 5
const FETCH_PAGE_SIZE = 50
const MAX_FETCH_PAGES_PER_CHANNEL = 1
const UNDO_ACTION_TYPES = ['video-status', 'video-resume-time', 'video-grid-remove', 'channel-remove', 'manual-video-add']
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{20,}$/
const YOUTUBE_HANDLE_RE = /^@[\p{L}\p{N}\p{M}._-]{3,30}$/u
const DEFAULT_THEME = 'light'
const THEMES = ['light', 'dark']
const BACKGROUND_PHYSICS_RADIUS = 130
const BACKGROUND_PHYSICS_MAX_PARTICLES = 2600
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
const MIN_DAILY_STREAK_POINTS = 0.5
const UNDO_STACK_LIMIT = 50
const MIN_WEEKLY_GOAL_HOURS = 1
const MAX_WEEKLY_GOAL_HOURS = 99
const VIDEO_HOUR_POINTS = 3
const VIDEO_WATCH_COOLDOWN_GRACE_SECONDS = 30
const VIDEO_WATCH_REMINDER_MAX_AGE_MS = 24 * 60 * 60_000
const VIDEO_WATCH_REMINDER_LIMIT = 12
const SHORT_VIDEO_MAX_DURATION_SECONDS = 180
const SHORT_VIDEO_DETECTION_VERSION = 1
const ANKI_REVIEW_CHUNK_SIZE = 60
const ANKI_REVIEW_CHUNK_POINTS = 2
const SCORING_RULES_VERSION = 6
const STUDY_INSIGHT_LOOKBACK_DAYS = 42
const STUDY_INSIGHT_MIN_ACTIVE_DAYS = 8
const STUDY_INSIGHT_MIN_VIDEO_SECONDS = 2 * 60 * 60
const STUDY_INSIGHT_HISTORY_LIMIT = 12
const STUDY_INSIGHT_TIME_WINDOWS = [
  { id: 'morning', startHour: 5, endHour: 12 },
  { id: 'afternoon', startHour: 12, endHour: 17 },
  { id: 'evening', startHour: 17, endHour: 22 },
  { id: 'night', startHour: 22, endHour: 5 }
]
const STUDY_INSIGHT_TYPES = [
  'weekly-summary',
  'preferred-window',
  'morning-opportunity',
  'reliable-weekday',
  'weekend-opportunity',
  'momentum-up',
  'momentum-reset',
  'anki-fallback',
  'steady-process'
]
const STUDY_INSIGHT_VARIANT_COUNT = 2
const CITY_LEVELS = [
  { threshold: 0, labelKey: 'city.level.1', label: '🏠 Lonely house' },
  { threshold: 5, labelKey: 'city.level.2', label: '⛵ Your house got a fresh new look! Plus a boat!' },
  { threshold: 12, labelKey: 'city.level.3', label: '🏝️ Oh look! A tiny island! Cute.' },
  { threshold: 20, labelKey: 'city.level.4', label: 'Kids are gonna have fun now!' },
  { threshold: 28, labelKey: 'city.level.5', label: "Let's add a pool to chill" },
  { threshold: 35, labelKey: 'city.level.6', label: 'Oh! Some friends are coming to say hi...' },
  { threshold: 42, labelKey: 'city.level.7', label: 'You expanded your small island!' },
  { threshold: 50, labelKey: 'city.level.8', label: "That's a nice deckchair and some pretty flowers! 🌸" },
  { threshold: 60, labelKey: 'city.level.9', label: 'You built a cute house in the backyard' },
  { threshold: 70, labelKey: 'city.level.10', label: 'Oh wow! You got a neighbor! 🏠' },
  { threshold: 80, labelKey: 'city.level.11', label: 'The little purple house has a cute garden!' },
  { threshold: 90, labelKey: 'city.level.12', label: 'Damn! A volcano appeared! I hope it won\'t erupt...' }
]
const CITY_IMAGE_PATHS = [
  'images/photoshop/level%201.png',
  'images/photoshop/level%202.png',
  'images/photoshop/level%203.png',
  'images/photoshop/level%204.png',
  'images/photoshop/level%205.png',
  'images/photoshop/level%206.png',
  'images/photoshop/level%207.png',
  'images/photoshop/level%208.png',
  'images/photoshop/level%209.png',
  'images/photoshop/level%2010.png',
  'images/photoshop/level%2011.png',
  'images/photoshop/level%2012.png'
]
const CITY_IMAGE_WEBP_PATHS = [
  'images/city/level%201.webp',
  'images/city/level%202.webp',
  'images/city/level%203.webp',
  'images/city/level%204.webp',
  'images/city/level%205.webp',
  'images/city/level%206.webp',
  'images/city/level%207.webp',
  'images/city/level%208.webp',
  'images/city/level%209.webp',
  'images/city/level%2010.webp',
  'images/city/level%2011.webp',
  'images/city/level%2012.webp'
]
const CITY_IMAGE_SOURCES = CITY_IMAGE_PATHS.map((fallback, index) => ({
  primary: CITY_IMAGE_WEBP_PATHS[index],
  fallback
}))
const cityImagePreloadCache = new Map()
const cityImagePreloadQueue = []
let cityImagePreloadQueueRunning = false
let activeCityImagePreloadCenter = null
let ankiStatsCache = null
let selectedStatusFilter = 'all'
let selectedChannelFilters = null
let knownChannelFilterIds = new Set()
let isWatchedSectionCollapsed = null
let selectedHistoryRange = 'week'
let selectedHistoryView = 'summary'
let selectedStudyInsightView = 'current'
let selectedActivityLogFilter = 'all'
let mobileActivityLogVisibleCount = 20
let forcedSearchVideoId = null
let pendingAddedChannelReveal = null
let shortsEnableRefetchPromise = null
const addedVideoSpotlightState = {
  element: null,
  frame: null,
  timer: null
}
let activeVideoWatchReminderId = null
let shouldGuideActiveVideoWatchReminder = false
let videoWatchReminderTimer = null
let videoWatchReminderRenderFrame = null
let videoWatchReminderZoomTimer = null
let videoWatchReminderPopupTimer = null
let currentLocale = DEFAULT_LOCALE
let backgroundPhysics = null
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
  originY: 0,
  touchPointers: new Map(),
  pinching: false,
  pinchStartDistance: 0,
  pinchStartScale: 1,
  pinchStartX: 0,
  pinchStartY: 0,
  pinchStartCenterX: 0,
  pinchStartCenterY: 0
}
const cityWaveformScroll = {
  frame: null,
  speed: 0,
  pointerX: 0,
  pointerY: 0,
  touchPointerId: null,
  touchStartX: 0,
  touchStartY: 0,
  touchStartScrollLeft: 0,
  touchDragging: false,
  touchPreviewOffset: null,
  touchPreviewFrame: null,
  suppressClickUntil: 0
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
const INTRO_TRAILER_SCENE_DURATIONS = [13000, 8600, 10800, 9200, 9600]
const INTRO_TRAILER_REFERENCE = {
  viewportWidth: 1710,
  viewportHeight: 986,
  stageWidth: 1180,
  sceneWidth: 1174
}
const introTrailerState = {
  active: false,
  replayMode: false,
  sceneIndex: 0,
  sceneTimer: null,
  cityLevelTimers: [],
  soundEnabled: false,
  audio: null,
  touchIdentifier: null,
  touchStartX: 0,
  touchStartY: 0,
  touchAxis: null
}
const ONBOARDING_CHANNEL_SELECTION_LIMIT = 5
const personalizedOnboardingState = {
  active: false,
  step: 'language',
  languageId: null,
  levelId: null,
  selectedChannelCatalogIds: [],
  channelSelectionsInitialized: false,
  isApplyingChannels: false
}
const curatedChannelResolutionCache = new Map()
const STATUS_FILTERS = [
  ['all', 'videos.status.all'],
  ['watch-later', 'videos.status.watchLater'],
  ['unwatched', 'videos.status.unwatched'],
  ['partial', 'videos.status.partial']
]
const VIDEO_STATUSES = ['watch-later', 'unwatched', 'partial', 'watched']
const HISTORY_RANGES = ['week', 'month']
const ACTIVITY_LOG_FILTERS = ['all', 'user', 'auto', 'issues', 'points']
const VIDEO_SEARCH_RESULT_LIMIT = 8
const ONBOARDING_VERSION = 2
const LEARNER_LANGUAGE_OPTIONS = [
  { id: 'mandarin', label: 'Mandarin Chinese', shortLabel: 'Mandarin', icon: '中' },
  { id: 'japanese', label: 'Japanese', shortLabel: 'Japanese', icon: '日' },
  { id: 'korean', label: 'Korean', shortLabel: 'Korean', icon: '한' },
  { id: 'spanish', label: 'Spanish', shortLabel: 'Spanish', icon: 'ES' },
  { id: 'french', label: 'French', shortLabel: 'French', icon: 'FR' },
  { id: 'german', label: 'German', shortLabel: 'German', icon: 'DE' },
  { id: 'english', label: 'English', shortLabel: 'English', icon: 'EN' },
  { id: 'other', label: 'Other', shortLabel: 'Other', icon: '···' }
]
const LEARNER_LEVEL_OPTIONS = [
  { id: 'starting', label: 'Just starting', detail: 'I understand very little so far.' },
  { id: 'beginner', label: 'Beginner', detail: 'I know basic words and sentences.' },
  { id: 'intermediate', label: 'Intermediate', detail: 'I can follow learner content and some native material.' },
  { id: 'advanced', label: 'Advanced', detail: 'I mostly learn through native content.' },
  { id: 'not-sure', label: 'Not sure', detail: 'Give me a balanced starter mix.' }
]
const ONBOARDING_CHANNEL_STYLE_KEYS = {
  'Casual conversations': 'onboarding.channelStyle.casualConversations',
  'Clear explanations': 'onboarding.channelStyle.clearExplanations',
  'Comprehensible input': 'onboarding.channelStyle.comprehensibleInput',
  'Conversations and interviews': 'onboarding.channelStyle.conversationsInterviews',
  'Conversations and stories': 'onboarding.channelStyle.conversationsStories',
  'Detailed lessons': 'onboarding.channelStyle.detailedLessons',
  'Film and technology': 'onboarding.channelStyle.filmTechnology',
  'Lessons and conversations': 'onboarding.channelStyle.lessonsConversations',
  'Native entertainment': 'onboarding.channelStyle.nativeEntertainment',
  'Natural Mandarin': 'onboarding.channelStyle.naturalMandarin',
  'News and commentary': 'onboarding.channelStyle.newsCommentary',
  Podcast: 'onboarding.channelStyle.podcast',
  'Psychology and conversations': 'onboarding.channelStyle.psychologyConversations',
  'Street interviews': 'onboarding.channelStyle.streetInterviews',
  'Structured lessons': 'onboarding.channelStyle.structuredLessons'
}
const BASE_CURATED_CHANNEL_CATALOG = [
  {
    id: 'mandarin-grace',
    language: 'mandarin',
    input: '@GraceMandarinChinese',
    name: 'Grace Mandarin Chinese',
    levels: ['starting'],
    style: 'Clear explanations',
    description: 'Practical pronunciation, vocabulary, and culture lessons.'
  },
  {
    id: 'mandarin-espresso-chinese',
    language: 'mandarin',
    input: '@espressochinese',
    name: 'Espresso Chinese - John Wang',
    levels: ['starting'],
    style: 'Clear explanations'
  },
  {
    id: 'mandarin-everyday-chinese',
    language: 'mandarin',
    input: '@EverydayChinese',
    name: 'Everyday Chinese',
    levels: ['starting'],
    style: 'Structured lessons'
  },
  {
    id: 'mandarin-chinese-for-us',
    language: 'mandarin',
    input: '@ChineseForUsOfficial',
    name: 'ChineseFor.Us',
    levels: ['starting'],
    style: 'Structured lessons'
  },
  {
    id: 'mandarin-stickynote',
    language: 'mandarin',
    input: '@Stickynote.Chinese',
    name: 'Jun - Stickynote Chinese',
    levels: ['starting', 'beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-harbin',
    language: 'mandarin',
    input: '@HarbinMandarin',
    name: 'Harbin Mandarin',
    levels: ['starting'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-xiaogua',
    language: 'mandarin',
    input: '@xiaoguachinese',
    name: 'Xiaogua Chinese',
    levels: ['beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-lazy',
    language: 'mandarin',
    input: '@Lazy-Chinese',
    name: 'Lazy Chinese - Comprehensible Input',
    levels: ['beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-chinese-with-ben',
    language: 'mandarin',
    input: '@chinesewithben',
    name: 'Chinese with Ben',
    levels: ['beginner'],
    style: 'Clear explanations'
  },
  {
    id: 'mandarin-richard-chinese',
    language: 'mandarin',
    input: '@RichardChineseLanguage',
    name: '理查老师的中文直播课 - Richard Chinese',
    levels: ['beginner'],
    style: 'Structured lessons'
  },
  {
    id: 'mandarin-chinese-at-dawn',
    language: 'mandarin',
    input: '@chinese-at-dawn',
    name: 'Chinese at Dawn',
    levels: ['beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-dashu',
    language: 'mandarin',
    input: '@dashumandarin',
    name: 'Dashu Mandarin 大叔中文',
    levels: ['intermediate'],
    style: 'Conversations and interviews'
  },
  {
    id: 'mandarin-annie-kerin',
    language: 'mandarin',
    input: '@LearnChinesewithAnnieandKerin',
    name: '俩北京姑娘闲聊',
    levels: ['intermediate'],
    style: 'Casual conversations'
  },
  {
    id: 'mandarin-corner',
    language: 'mandarin',
    input: '@MandarinCorner2',
    name: 'Mandarin Corner',
    levels: ['intermediate'],
    style: 'Conversations and stories',
    description: 'Long-form listening, street interviews, and everyday Mandarin.'
  },
  {
    id: 'mandarin-free-to-learn',
    language: 'mandarin',
    input: '@DANLIAOFreeToLearnChinese',
    name: 'Free To Learn Chinese',
    levels: ['intermediate'],
    style: 'Natural Mandarin'
  },
  {
    id: 'mandarin-shenglan-podcast',
    language: 'mandarin',
    input: '@chinesepodcastwithshenglan',
    name: 'Chinese Podcast With Shenglan',
    levels: ['intermediate'],
    style: 'Podcast'
  },
  {
    id: 'mandarin-sophia-c',
    language: 'mandarin',
    input: '@sonargalc',
    name: 'Sophia C.',
    levels: ['intermediate'],
    style: 'Natural Mandarin'
  },
  {
    id: 'mandarin-out-of-office',
    language: 'mandarin',
    input: '@theOutofOfficePodcast',
    name: '不上班 / Out of Office',
    levels: ['advanced'],
    style: 'Podcast'
  },
  {
    id: 'mandarin-muerstalk',
    language: 'mandarin',
    input: '@muerstalk',
    name: '周慕姿放心說',
    levels: ['advanced'],
    style: 'Psychology and conversations'
  },
  {
    id: 'mandarin-bailingguo',
    language: 'mandarin',
    input: '@bailingguo',
    name: 'Bailingguo News',
    levels: ['advanced'],
    style: 'News and commentary'
  },
  {
    id: 'mandarin-mediastorm',
    language: 'mandarin',
    input: '@mediastorm6801',
    name: 'Mediastorm影视飓风',
    levels: ['advanced'],
    style: 'Film and technology'
  },
  {
    id: 'mandarin-hahatai',
    language: 'mandarin',
    input: '@Hahatai',
    name: 'HahaTai 哈哈台',
    levels: ['advanced'],
    style: 'Street interviews'
  },
  {
    id: 'mandarin-one-in-billion',
    language: 'mandarin',
    input: '@One-In-a-Billion',
    name: '亿点点不一样',
    levels: ['advanced'],
    style: 'Native entertainment'
  },
  {
    id: 'japanese-comprehensible',
    language: 'japanese',
    input: '@nihongo-no-jikan',
    name: 'Comprehensible Japanese',
    levels: ['starting', 'beginner', 'intermediate'],
    style: 'Comprehensible input',
    description: 'Illustrated Japanese stories designed to be understood in context.'
  },
  {
    id: 'japanese-ammo',
    language: 'japanese',
    input: '@JapaneseAmmowithMisa',
    name: 'Japanese Ammo with Misa',
    levels: ['beginner', 'intermediate', 'advanced'],
    style: 'Detailed lessons',
    description: 'Grammar, nuance, and natural Japanese explained in depth.'
  },
  {
    id: 'japanese-zero',
    language: 'japanese',
    input: '@JapaneseFromZero',
    name: 'Japanese From Zero!',
    levels: ['starting', 'beginner'],
    style: 'Structured lessons',
    description: 'Friendly, step-by-step Japanese lessons for new learners.'
  },
  {
    id: 'korean-comprehensible',
    language: 'korean',
    input: '@ComprehensibleInputKorean',
    name: 'Comprehensible Input Korean',
    levels: ['starting', 'beginner', 'intermediate'],
    style: 'Comprehensible input',
    description: 'Context-rich Korean listening for building natural comprehension.'
  },
  {
    id: 'korean-ttmik',
    language: 'korean',
    input: '@talktomeinkorean',
    name: 'Talk To Me In Korean',
    levels: ['starting', 'beginner', 'intermediate', 'advanced'],
    style: 'Lessons and conversations',
    description: 'A broad library of practical Korean lessons and native conversations.'
  },
  {
    id: 'spanish-dreaming',
    language: 'spanish',
    input: '@DreamingSpanish',
    name: 'Dreaming Spanish',
    levels: ['starting', 'beginner', 'intermediate', 'advanced'],
    style: 'Comprehensible input',
    description: 'Levelled Spanish immersion built around interesting, understandable videos.'
  },
  {
    id: 'spanish-easy',
    language: 'spanish',
    input: '@EasySpanish',
    name: 'Easy Spanish',
    levels: ['beginner', 'intermediate', 'advanced'],
    style: 'Street interviews',
    description: 'Authentic conversations with subtitles and learner-focused explanations.'
  },
  {
    id: 'french-easy',
    language: 'french',
    input: '@EasyFrench',
    name: 'Easy French',
    levels: ['beginner', 'intermediate', 'advanced'],
    style: 'Street interviews',
    description: 'Real French conversations with supportive subtitles and context.'
  },
  {
    id: 'french-input',
    language: 'french',
    input: '@FrenchComprehensibleInput',
    name: 'French Comprehensible Input',
    levels: ['starting', 'beginner', 'intermediate'],
    style: 'Comprehensible input',
    description: 'Stories and explanations delivered in accessible French.'
  },
  {
    id: 'german-easy',
    language: 'german',
    input: '@EasyGerman',
    name: 'Easy German',
    levels: ['beginner', 'intermediate', 'advanced'],
    style: 'Street interviews',
    description: 'Natural German conversations with bilingual subtitles.'
  },
  {
    id: 'german-lingoni',
    language: 'german',
    input: '@lingoniGERMAN',
    name: 'lingoni GERMAN',
    levels: ['starting', 'beginner', 'intermediate'],
    style: 'Structured lessons',
    description: 'Levelled grammar, vocabulary, and listening lessons.'
  },
  {
    id: 'english-easy',
    language: 'english',
    input: '@EasyEnglishVideos',
    name: 'Easy English',
    levels: ['beginner', 'intermediate', 'advanced'],
    style: 'Street interviews',
    description: 'Everyday English from real speakers with learner-friendly subtitles.'
  },
  {
    id: 'english-lucy',
    language: 'english',
    input: '@EnglishwithLucy',
    name: 'English with Lucy',
    levels: ['beginner', 'intermediate', 'advanced'],
    style: 'Clear explanations',
    description: 'Pronunciation, vocabulary, and natural British English lessons.'
  }
]
const CURATED_CHANNEL_LEVEL_OVERRIDES = {
  'japanese-comprehensible': ['starting'],
  'japanese-zero': ['starting'],
  'japanese-ammo': ['beginner'],
  'korean-comprehensible': ['starting'],
  'korean-ttmik': ['starting'],
  'spanish-dreaming': ['starting'],
  'spanish-easy': ['beginner'],
  'french-input': ['starting'],
  'french-easy': ['beginner'],
  'german-lingoni': ['starting'],
  'german-easy': ['beginner'],
  'english-easy': ['starting'],
  'english-lucy': ['beginner']
}
const EXPANDED_CURATED_CHANNEL_DATA = [
  ['japanese-pod101', 'japanese', '@JapanesePod101', 'JapanesePod101', 'beginner', 'Structured lessons'],
  ['japanese-miku', 'japanese', '@mikurealjapanese', 'Miku Real Japanese', 'beginner', 'Clear explanations'],
  ['japanese-onomappu', 'japanese', '@Onomappu', 'Onomappu', 'intermediate', 'Casual conversations'],
  ['japanese-sambon', 'japanese', '@SambonJuku', 'Sambon Juku', 'intermediate', 'Detailed lessons'],
  ['japanese-yuyu', 'japanese', '@YUYUNihongo', 'YUYUの日本語Podcast', 'intermediate', 'Podcast'],
  ['japanese-shun', 'japanese', '@JapanesewithShun', 'Japanese with Shun', 'intermediate', 'Podcast'],
  ['japanese-quizknock', 'japanese', '@QuizKnock', 'QuizKnock', 'advanced', 'Native entertainment'],
  ['japanese-kevin', 'japanese', '@kevinsenglishroom', "Kevin's English Room", 'advanced', 'Native entertainment'],
  ['japanese-pdr', 'japanese', '@PDRsan', 'PDRさん', 'advanced', 'Native entertainment'],
  ['japanese-nakata', 'japanese', '@NKTofficial', '中田敦彦のYouTube大学', 'advanced', 'Clear explanations'],
  ['japanese-bilingirl', 'japanese', '@Fischers', "Fischer's", 'advanced', 'Native entertainment'],

  ['korean-gobilly', 'korean', '@GoBillyKorean', 'Learn Korean with GO! Billy Korean', 'beginner', 'Structured lessons'],
  ['korean-unnie', 'korean', '@KoreanUnnie', 'Korean Unnie', 'beginner', 'Clear explanations'],
  ['korean-prof-yoon', 'korean', '@ProfYoonsKoreanLanguageClass', "Prof. Yoon's Korean Language Class", 'beginner', 'Structured lessons'],
  ['korean-choisusu', 'korean', '@choisusu', 'Choisusu Korean', 'intermediate', 'Comprehensible input'],
  ['korean-tammy', 'korean', '@KoreanwithMissVicky', 'Korean with Miss Vicky', 'intermediate', 'Clear explanations'],
  ['korean-jream', 'korean', '@KoreanJream', 'Korean Jream', 'intermediate', 'Casual conversations'],
  ['korean-conversational', 'korean', '@ConversationalKorean', 'Conversational Korean', 'intermediate', 'Casual conversations'],
  ['korean-psick', 'korean', '@koreanenglishman', '영국남자 Korean Englishman', 'advanced', 'Native entertainment'],
  ['korean-ootb', 'korean', '@ootbstudio', 'ootb STUDIO', 'advanced', 'Native entertainment'],
  ['korean-mmtg', 'korean', '@MMTG', '문명특급 MMTG', 'advanced', 'Conversations and interviews'],
  ['korean-14f', 'korean', '@14f', '14F 일사에프', 'advanced', 'News and commentary'],
  ['korean-diggle', 'korean', '@Diggle', '디글 :Diggle', 'advanced', 'Native entertainment'],

  ['spanish-after-hours', 'spanish', '@spanishafterhours', 'Spanish After Hours', 'starting', 'Comprehensible input'],
  ['spanish-butterfly', 'spanish', '@ButterflySpanish', 'Butterfly Spanish', 'beginner', 'Clear explanations'],
  ['spanish-hola', 'spanish', '@HolaSpanish', 'Hola Spanish', 'beginner', 'Structured lessons'],
  ['spanish-how-to', 'spanish', '@SpanishlandSchool', 'Spanishland School', 'intermediate', 'Detailed lessons'],
  ['spanish-juan', 'spanish', '@espanolconjuan', 'Español con Juan', 'intermediate', 'Podcast'],
  ['spanish-erre', 'spanish', '@ErrequeELE', 'Erre que ELE', 'intermediate', 'Casual conversations'],
  ['spanish-vicente', 'spanish', '@SpanishwithVicente', 'Spanish with Vicente', 'intermediate', 'Clear explanations'],
  ['spanish-visualpolitik', 'spanish', '@VisualPolitik', 'VisualPolitik', 'advanced', 'News and commentary'],
  ['spanish-linguriosa', 'spanish', '@Linguriosa', 'Linguriosa', 'advanced', 'Clear explanations'],
  ['spanish-ter', 'spanish', '@Ter', 'Ter', 'advanced', 'Native entertainment'],
  ['spanish-quantum', 'spanish', '@QuantumFracture', 'QuantumFracture', 'advanced', 'Clear explanations'],
  ['spanish-dw', 'spanish', '@DWDocumental', 'DW Documental', 'advanced', 'News and commentary'],

  ['french-alice', 'french', '@aliceayel', 'Alice Ayel', 'starting', 'Comprehensible input'],
  ['french-alexa', 'french', '@learnfrenchwithalexa', 'Learn French With Alexa', 'beginner', 'Structured lessons'],
  ['french-pod101', 'french', '@FrenchPod101', 'FrenchPod101', 'beginner', 'Structured lessons'],
  ['french-inner', 'french', '@innerFrench', 'innerFrench', 'intermediate', 'Podcast'],
  ['french-piece', 'french', '@pieceoffrench', 'Piece of French', 'intermediate', 'Casual conversations'],
  ['french-elisa', 'french', '@FrenchmorningswithElisa', 'French Mornings with Elisa', 'intermediate', 'Clear explanations'],
  ['french-hello', 'french', '@HelloFrench', 'HelloFrench', 'intermediate', 'Clear explanations'],
  ['french-hugo', 'french', '@konbini', 'Konbini', 'advanced', 'Conversations and interviews'],
  ['french-arte', 'french', '@arte', 'ARTE', 'advanced', 'News and commentary'],
  ['french-nota-bene', 'french', '@notabenemovies', 'Nota Bene', 'advanced', 'Clear explanations'],
  ['french-lemonde', 'french', '@lemondefr', 'Le Monde', 'advanced', 'News and commentary'],
  ['french-micode', 'french', '@Micode', 'Micode', 'advanced', 'Film and technology'],

  ['german-naturlich', 'german', '@naturlichgerman2021', 'Natürlich German', 'starting', 'Comprehensible input'],
  ['german-teacher', 'german', '@yourgermanteacher', 'YourGermanTeacher', 'beginner', 'Structured lessons'],
  ['german-anja', 'german', '@LearnGermanwithAnja', 'Learn German with Anja', 'beginner', 'Clear explanations'],
  ['german-marija', 'german', '@DeutschmitMarija', 'Deutsch mit Marija', 'intermediate', 'Detailed lessons'],
  ['german-lera', 'german', '@DeutschLera', 'DeutschLera', 'intermediate', 'Clear explanations'],
  ['german-benjamin', 'german', '@BenjaminDerDeutschlehrer', 'Benjamin - Der Deutschlehrer', 'intermediate', 'Detailed lessons'],
  ['german-deutsch1', 'german', '@deutsch1', 'Deutsch1', 'intermediate', 'Structured lessons'],
  ['german-wissen2go', 'german', '@MrWissen2go', 'MrWissen2go', 'advanced', 'News and commentary'],
  ['german-kurzgesagt', 'german', '@KurzgesagtDE', 'Dinge Erklärt – Kurzgesagt', 'advanced', 'Clear explanations'],
  ['german-simplicissimus', 'german', '@Simplicissimus', 'Simplicissimus', 'advanced', 'News and commentary'],
  ['german-lesch', 'german', '@TerraXLeschundCo', 'Terra X Lesch & Co', 'advanced', 'Clear explanations'],
  ['german-dw', 'german', '@dwdeutsch', 'DW Deutsch', 'advanced', 'News and commentary'],

  ['english-voa', 'english', '@voalearningenglish', 'VOA Learning English', 'starting', 'Comprehensible input'],
  ['english-bbc', 'english', '@bbclearningenglish', 'BBC Learning English', 'beginner', 'Structured lessons'],
  ['english-vanessa', 'english', '@SpeakEnglishWithVanessa', 'Speak English With Vanessa', 'beginner', 'Clear explanations'],
  ['english-rachel', 'english', '@rachelsenglish', "Rachel's English", 'intermediate', 'Detailed lessons'],
  ['english-mmm', 'english', '@LearnEnglishWithTVSeries', 'Learn English With TV Series', 'intermediate', 'Comprehensible input'],
  ['english-marina', 'english', '@linguamarina', 'linguamarina', 'intermediate', 'Clear explanations'],
  ['english-class101', 'english', '@EnglishClass101', 'EnglishClass101', 'intermediate', 'Structured lessons'],
  ['english-ted', 'english', '@TED', 'TED', 'advanced', 'Conversations and interviews'],
  ['english-bigthink', 'english', '@bigthink', 'Big Think', 'advanced', 'Conversations and interviews'],
  ['english-veritasium', 'english', '@veritasium', 'Veritasium', 'advanced', 'Clear explanations'],
  ['english-johnny', 'english', '@johnnyharris', 'Johnny Harris', 'advanced', 'News and commentary'],
  ['english-dw', 'english', '@DWDocumentary', 'DW Documentary', 'advanced', 'News and commentary']
]
const EXPANDED_CURATED_CHANNEL_CATALOG = EXPANDED_CURATED_CHANNEL_DATA.map(([id, language, input, name, level, style]) => ({
  id,
  language,
  input,
  name,
  levels: [level],
  style
}))
const CURATED_CHANNEL_CATALOG = [
  ...BASE_CURATED_CHANNEL_CATALOG.map(channel => ({
    ...channel,
    levels: CURATED_CHANNEL_LEVEL_OVERRIDES[channel.id] || channel.levels
  })),
  ...EXPANDED_CURATED_CHANNEL_CATALOG
]
const CURATED_NOT_SURE_CHANNEL_IDS = {
  mandarin: [
    'mandarin-grace',
    'mandarin-stickynote',
    'mandarin-lazy',
    'mandarin-chinese-at-dawn',
    'mandarin-chinese-with-ben',
    'mandarin-corner'
  ]
}
const I18N_EN = {
  'app.title.sandbox': 'Sandbox - Edenia',
  'intro.skip': 'Skip intro',
  'intro.sound.off': 'Sound off',
  'intro.sound.on': 'Sound on',
  'intro.opening.kicker': 'Your language-learning world',
  'intro.opening.title': 'Make every lesson count.',
  'intro.purpose.kicker': 'Study your way',
  'intro.purpose.title': 'Turn YouTube and Anki into visible progress.',
  'intro.purpose.body': 'Watch the channels you love, review your cards, and let Edenia connect the pieces.',
  'intro.purpose.progress': 'Study points',
  'intro.purpose.watched': 'watched',
  'intro.purpose.reviews': 'reviews',
  'intro.city.kicker': 'Progress becomes a place',
  'intro.city.title': 'Study.\nEarn points.\nWatch your town evolve.',
  'intro.city.level': 'Town level',
  'intro.features.history': 'Study history',
  'intro.features.week': 'This week',
  'intro.features.studied': 'studied',
  'intro.features.streak': 'day streak',
  'intro.features.goal': 'Goal',
  'intro.features.kicker': 'See the journey',
  'intro.features.title': 'Your rhythm, history,\nand momentum- at a glance',
  'intro.features.body': 'Heatmaps, goals, streaks, and Study Insights turn your history into a clearer next step.',
  'intro.features.insightBody': 'Your recent rhythm is stronger. Repeat the routine that made it work.',
  'intro.finale.kicker': 'A little progress. A whole world.',
  'intro.finale.title': 'What will you build?',
  'intro.finale.body': 'Create your study feed and begin your Edenia.',
  'intro.finale.cta': 'Start my journey',
  'intro.finale.return': 'Back to Edenia',
  'onboarding.progress': 'Step {current} of {total}',
  'onboarding.promise': 'Turn YouTube and Anki into visible language-learning progress.',
  'onboarding.eyebrow': 'Make your study visible',
  'onboarding.language.title': 'What language are you learning?',
  'onboarding.language.subtitle': 'Choose the language you want to learn and Edenia will build a focused starter feed.',
  'onboarding.language.hint': 'Choose one language to continue.',
  'onboarding.level.title': 'Where are you in the journey?',
  'onboarding.channels.title': 'Your starter study feed',
  'onboarding.channels.subtitle': 'Select up to 5 channels. You can modify them anytime later on.',
  'onboarding.channels.selected': '{count} selected',
  'onboarding.channels.limit': 'You can select up to {count} channels. Deselect one to add another.',
  'onboarding.channels.none': 'No starter channels match this combination yet. You can still continue and add your own.',
  'onboarding.continue': 'Continue',
  'onboarding.back': 'Back',
  'onboarding.build': 'Start my journey',
  'onboarding.building': 'Starting your journey...',
  'onboarding.private': 'No account required · Your real progress stays in this browser',
  'onboarding.channelIssue': '{count} starter channel{plural} could not be added. You can add it manually later.',
  'onboarding.videoIssue': 'Your channels were added, but their recent videos could not load yet. Check YouTube access, then try again.',
  'onboarding.language.mandarin': 'Mandarin Chinese',
  'onboarding.language.japanese': 'Japanese',
  'onboarding.language.korean': 'Korean',
  'onboarding.language.spanish': 'Spanish',
  'onboarding.language.french': 'French',
  'onboarding.language.german': 'German',
  'onboarding.language.english': 'English',
  'onboarding.language.other': 'Other',
  'onboarding.other.title': 'Every language belongs here',
  'onboarding.other.subtitle': 'Edenia works with any language. Once you enter the app, add the YouTube channels you want to learn from and build a study feed that is entirely your own.',
  'onboarding.other.note': 'No recommendations are needed—you can choose your own channels after entering Edenia.',
  'onboarding.level.starting.label': 'Just starting',
  'onboarding.level.starting.detail': 'I understand very little so far.',
  'onboarding.level.beginner.label': 'Beginner',
  'onboarding.level.beginner.detail': 'I know basic words and sentences.',
  'onboarding.level.intermediate.label': 'Intermediate',
  'onboarding.level.intermediate.detail': 'I can follow learner content and some native material.',
  'onboarding.level.advanced.label': 'Advanced',
  'onboarding.level.advanced.detail': 'I mostly learn through native content.',
  'onboarding.level.not-sure.label': 'Not sure',
  'onboarding.level.not-sure.detail': 'Give me a balanced starter mix.',
  'onboarding.channelStyle.casualConversations': 'Casual conversations',
  'onboarding.channelStyle.clearExplanations': 'Clear explanations',
  'onboarding.channelStyle.comprehensibleInput': 'Comprehensible input',
  'onboarding.channelStyle.conversationsInterviews': 'Conversations and interviews',
  'onboarding.channelStyle.conversationsStories': 'Conversations and stories',
  'onboarding.channelStyle.detailedLessons': 'Detailed lessons',
  'onboarding.channelStyle.filmTechnology': 'Film and technology',
  'onboarding.channelStyle.lessonsConversations': 'Lessons and conversations',
  'onboarding.channelStyle.nativeEntertainment': 'Native entertainment',
  'onboarding.channelStyle.naturalMandarin': 'Natural Mandarin',
  'onboarding.channelStyle.newsCommentary': 'News and commentary',
  'onboarding.channelStyle.podcast': 'Podcast',
  'onboarding.channelStyle.psychologyConversations': 'Psychology and conversations',
  'onboarding.channelStyle.streetInterviews': 'Street interviews',
  'onboarding.channelStyle.structuredLessons': 'Structured lessons',
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.language.label': 'Language',
  'settings.weeklyGoal.label': 'Weekly goal (hours)',
  'settings.channels.label': 'Channels',
  'settings.channels.placeholder': 'Channel URL or @',
  'settings.channels.add': 'Add',
  'settings.channels.hint': 'Paste a YouTube channel URL, @handle, or channel ID. Best examples: youtube.com/@channel or youtube.com/channel/UCxxxxxxxx.',
  'settings.shorts.label': 'Show short videos',
  'settings.shorts.hint': 'When off, videos under 3 minutes are skipped during refresh and hidden from your active video list.',
  'settings.howto.title': 'How to',
  'settings.youtube.title': 'Add a YouTube channel',
  'settings.youtube.intro': 'Add a channel by copying its YouTube URL. You can also use its @handle.',
  'settings.youtube.step1': "On YouTube, open the channel you want and copy its URL from your browser's address bar.",
  'settings.youtube.step2': 'In Edenia, open Add above your video list and paste the URL.',
  'settings.youtube.step3': 'Click Add to add the channel to your study feed.',
  'settings.anki.whatTitle': 'What is Anki?',
  'settings.anki.whatIntro': 'Anki is a flashcard app that schedules reviews to help you remember words and ideas over time. Using Anki with Edenia is optional.',
  'settings.anki.title': 'Connect to Anki',
  'settings.anki.enabled': 'Enable Anki tracking',
  'settings.anki.toggleHint': 'When on, Edenia can read Anki review counts while Anki is open.',
  'settings.insights.enabled': 'Enable study insights',
  'settings.insights.toggleHint': 'Controls whether insights appear in Analytics. Insight tracking and history continue when hidden.',
  'settings.anki.intro': 'Edenia can count your Anki reviews automatically. To let Edenia talk to Anki, install AnkiConnect and allow Edenia in its settings.',
  'settings.anki.step1': 'Open Anki. In Tools, click Add-ons, then Get Add-ons, then paste this code: 2055492159.',
  'settings.anki.step2': 'In Add-ons, click AnkiConnect, then Config. Make sure the text after "...," is at the end of the config.',
  'settings.anki.step3': 'Restart Anki and keep Anki open while you use Edenia.',
  'settings.scoring.title': 'How points work',
  'settings.scoring.intro': 'Points reward video study time and Anki reviews. Edenia adds each source before rounding down the total points of the day.',
  'settings.scoring.video': 'Watching 1 hour of video gives 3 pts.',
  'settings.scoring.anki': '60 Anki reviews gives 2 pts.',
  'settings.workflow.title': 'Typical Edenia workflow',
  'settings.workflow.item1': "Watch videos from the channels you've added.",
  'settings.workflow.item2': 'Use Add to paste either a YouTube video or channel URL.',
  'settings.workflow.item3': 'Check your studies with the study history summary and heatmap.',
  'settings.workflow.item4': 'Watch your town grow.',
  'settings.activity.title': 'Activity log',
  'settings.activity.filtersLabel': 'Activity log filters',
  'settings.activity.all': 'All',
  'settings.activity.user': 'User',
  'settings.activity.auto': 'Auto',
  'settings.activity.issues': 'Issues',
  'settings.activity.points': 'Points',
  'activity.pointsLabel': 'Points',
  'activity.points.empty': 'No scored points yet.',
  'activity.points.videoTitle': 'Watched {time} of {title}',
  'activity.points.ankiTitle': 'Reviewed {count} Anki cards',
  'activity.points.unmarkTitle': 'Unmarked {title}',
  'activity.points.undoTitle': 'Undo: {title}',
  'activity.points.redoTitle': 'Redo: {title}',
  'settings.remove': 'Remove',
  'settings.sync.export': 'Export sync file',
  'settings.sync.import': 'Import sync file',
  'settings.sync.note': 'Progress is saved in this browser. Use sync files to copy the same progress to another device or browser.',
  'settings.walkthroughAgain': 'Show walkthrough again',
  'settings.trailerAgain': 'Show trailer again',
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
  'sandbox.channel.focus': 'Sandbox Focus',
  'sandbox.channel.memory': 'Sandbox Memory',
  'sandbox.channel.projects': 'Sandbox Projects',
  'sandbox.channel.language': 'Sandbox Language',
  'sandbox.channel.science': 'Sandbox Science',
  'sandbox.channel.history': 'Sandbox History',
  'sandbox.channel.design': 'Sandbox Design',
  'sandbox.channel.music': 'Sandbox Music',
  'sandbox.channel.travel': 'Sandbox Travel',
  'sandbox.channel.culture': 'Sandbox Culture',
  'sandbox.video.addedDay': 'Sandbox added study day {date}.{index}',
  'sandbox.video.upcoming': 'Sandbox upcoming lesson {date}',
  'sandbox.video.recent': 'Sandbox recent lesson {channel}.{index}',
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
  'city.level.1': '🏠 Lonely house',
  'city.level.2': '⛵ Your house got a fresh new look! Plus a boat!',
  'city.level.3': '🏝️ Oh look! A tiny island! Cute.',
  'city.level.4': 'Kids are gonna have fun now!',
  'city.level.5': "Let's add a pool to chill",
  'city.level.6': 'Oh! Some friends are coming to say hi...',
  'city.level.7': 'You expanded your small island!',
  'city.level.8': "That's a nice deckchair and some pretty flowers! 🌸",
  'city.level.9': 'You built a cute house in the backyard',
  'city.level.10': 'Oh wow! You got a neighbor! 🏠',
  'city.level.11': 'The little purple house has a cute garden!',
  'city.level.12': "Damn! A volcano appeared! I hope it won't erupt...",
  'goal.title': 'Weekly goal',
  'nextStudy.title': 'Continue watching',
  'nextStudy.studyNext': 'Study next',
  'nextStudy.resume': 'Resume video',
  'nextStudy.watch': 'Watch',
  'nextStudy.notInterested': 'Not interested',
  'nextStudy.unwatch': 'Unwatch',
  'nextStudy.continueShort': 'Continue',
  'goal.watched': 'watched',
  'goal.inProgress': 'in progress',
  'goal.toGo': 'to go',
  'goal.pace.session': 'One {minutes}-minute session today keeps you on track.',
  'goal.pace.longSession': 'Aim for {time} today to get back on track.',
  'goal.pace.onTrack': 'You’re on track for this week.',
  'goal.pace.complete': 'Weekly goal complete. Nice work.',
  'insights.eyebrow': 'Study insight',
  'insights.weekly.title': 'Your week in review',
  'insights.weekly.summary.zero': 'No video study time was recorded this week.',
  'insights.weekly.summary.one': 'You studied {time} across 1 video this week.',
  'insights.weekly.summary.many': 'You studied {time} across {videos} videos this week.',
  'insights.weekly.channels': 'By channel: {channels}.',
  'insights.weekly.noChannels': 'No channel watch time was recorded.',
  'insights.weekly.otherChannel': 'Other channels',
  'insights.weekly.topVideo': 'Most watched: {video} ({time})',
  'insights.weekly.activeDays': '{days} active days',
  'insights.weekly.anki': 'Anki: {reviewed} reviewed, {created} new',
  'insights.subject.study': 'study',
  'insights.window.morning': 'morning',
  'insights.window.afternoon': 'afternoon',
  'insights.window.evening': 'evening',
  'insights.window.night': 'late evening',
  'insights.title.preferred-window': 'Protect what already works',
  'insights.body.preferred-window': 'The {window} is your most reliable study window. Try protecting a {minutes}-minute slot there on busy days.',
  'insights.title.preferred-window.alt': 'Defend your best study window',
  'insights.body.preferred-window.alt': 'Your study repeatedly lands in the {window}. Reserve even {minutes} minutes there when the day gets crowded.',
  'insights.evidence.preferred-window': '{percent}% of your video study happened in the {window} across {days} active days.',
  'insights.title.morning-opportunity': 'A small morning experiment',
  'insights.body.morning-opportunity': 'You almost never study in the morning. Would a {minutes}-minute {subject} session fit into your morning routine?',
  'insights.title.morning-opportunity.alt': 'Test a different start to the day',
  'insights.body.morning-opportunity.alt': 'Morning is still mostly unused for study. Try one {minutes}-minute {subject} block and see whether it feels sustainable.',
  'insights.evidence.morning-opportunity': 'Morning sessions made up {percent}% of your video study across {days} active days.',
  'insights.title.short-sessions': 'Small sessions are working',
  'insights.body.short-sessions': 'Your typical video-study session lasts about {minutes} minutes. Keeping a short session ready can make consistency easier.',
  'insights.title.short-sessions.alt': 'Your rhythm fits compact sessions',
  'insights.body.short-sessions.alt': 'You often make progress in roughly {minutes}-minute blocks. Treat that as a valid default, not a backup plan.',
  'insights.evidence.short-sessions': '{sessions} study sessions across {days} active days.',
  'insights.title.reliable-weekday': 'Make {weekday} your weekly anchor',
  'insights.body.reliable-weekday': '{weekday} appears more reliably than other days. Protecting that recurring slot could stabilize the rest of your week.',
  'insights.title.reliable-weekday.alt': '{weekday} keeps showing up',
  'insights.body.reliable-weekday.alt': 'Your history points to {weekday} as a dependable study day. Plan around that strength before adding new commitments.',
  'insights.evidence.reliable-weekday': '{percent}% of your active study days fell on {weekday}.',
  'insights.title.weekend-opportunity': 'Leave a small weekend doorway',
  'insights.body.weekend-opportunity': 'Weekends are almost absent from your study pattern. A flexible {minutes}-minute session could prevent a full two-day gap.',
  'insights.title.weekend-opportunity.alt': 'Try a weekend fallback',
  'insights.body.weekend-opportunity.alt': 'Your routine is strongly weekday-based. Keep one low-pressure {minutes}-minute option available for Saturday or Sunday.',
  'insights.evidence.weekend-opportunity': '{percent}% of your video study happened on weekends.',
  'insights.title.momentum-up': 'Your momentum is building',
  'insights.body.momentum-up': 'Study time increased meaningfully over the last two weeks. Keep the next step familiar so the pace remains sustainable.',
  'insights.title.momentum-up.alt': 'The last two weeks moved upward',
  'insights.body.momentum-up.alt': 'Your recent study volume is above the previous period. Repeat the routine that made the increase possible.',
  'insights.evidence.momentum-up': 'The latest 14 days included {recentMinutes} minutes, {comparisonPercent}% more than the prior 14 days.',
  'insights.title.momentum-reset': 'Make the restart smaller',
  'insights.body.momentum-reset': 'Recent study time dipped compared with the previous two weeks. Restart with one easy {minutes}-minute session instead of catching up all at once.',
  'insights.title.momentum-reset.alt': 'Lower the cost of getting started',
  'insights.body.momentum-reset.alt': 'Your recent pace is quieter than before. Choose the easiest {minutes}-minute study action and rebuild from there.',
  'insights.evidence.momentum-reset': 'The latest 14 days included {recentMinutes} minutes, {comparisonPercent}% below the prior 14 days.',
  'insights.title.long-sessions': 'Add a short-session safety net',
  'insights.body.long-sessions': 'Your typical session lasts about {minutes} minutes. On crowded days, a {suggestedMinutes}-minute fallback can protect continuity.',
  'insights.title.long-sessions.alt': 'Keep a lighter option ready',
  'insights.body.long-sessions.alt': 'You usually study in substantial blocks of about {minutes} minutes. Define a smaller version for days when that block will not fit.',
  'insights.evidence.long-sessions': '{sessions} sessions across {days} active days; the typical session was {typicalMinutes} minutes.',
  'insights.title.anki-fallback': 'Keep a 15-card fallback',
  'insights.body.anki-fallback': 'No time for a video today? Reviewing 15 Anki cards still keeps the language close and the habit moving.',
  'insights.title.anki-fallback.alt': 'A small review still counts',
  'insights.body.anki-fallback.alt': 'When a video will not fit, try 15 Anki cards. A lighter study day is still part of the process.',
  'insights.evidence.anki-fallback': 'You reviewed {reviewedCards} cards across {ankiDays} days in this period.',
  'insights.title.steady-process': 'Think in seasons, not days',
  'insights.body.steady-process': 'Language learning is a long-term commitment. Steady contact matters more than one perfect study day.',
  'insights.title.steady-process.alt': 'Let consistency do the heavy lifting',
  'insights.body.steady-process.alt': 'Fluency grows through ordinary sessions repeated over time. Keep choosing the next sustainable step.',
  'insights.evidence.steady-process': '{days} active study days across the last {observationDays} days.',
  'insights.collapse': 'Collapse study insights',
  'insights.reopen': 'Insights',
  'insights.reopen.aria': 'Show study insights',
  'insights.tabs.aria': 'Study insight views',
  'insights.tab.current': 'Current',
  'insights.tab.previous': 'Previous',
  'insights.previous.aria': 'Show {count} previous insights',
  'insights.previous.empty': 'Past insights will appear here as your study pattern changes.',
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
  'history.ankiCreated': 'new Anki cards',
  'history.table.date': 'Date',
  'history.table.video': 'Video',
  'history.table.watched': 'Watched',
  'history.table.anki': 'Anki',
  'history.table.points': 'PTS',
  'history.emptyRange': 'No activity in this range.',
  'history.noActivityMap': 'No activity to map yet.',
  'history.heatmap.less': 'Less',
  'history.heatmap.more': 'More',
  'history.heatmap.legend': 'Study activity intensity',
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
  'history.heatmapAria': '{date}: {points} points; {time} video time; {videos} videos watched; {reviewed} Anki cards reviewed; {created} new Anki cards',
  'history.heatmapAriaNoAnki': '{date}: {points} points; {time} video time; {videos} videos watched',
  'history.tooltip.points': '{count} pts',
  'history.tooltip.videoTime': 'Video time',
  'history.tooltip.videosWatched': 'Videos watched',
  'history.tooltip.ankiReviewed': 'Anki reviewed',
  'history.tooltip.ankiCreated': 'New Anki cards',
  'videos.title': 'Videos to watch',
  'videos.status.label': 'Video status',
  'videos.channel.oneVideo': '1 video',
  'videos.channel.videoCount': '{count} videos',
  'videos.channel.shelfLabel': '{channel} videos',
  'videos.channel.previousLabel': 'Scroll {channel} videos left',
  'videos.channel.nextLabel': 'Scroll {channel} videos right',
  'videos.channel.dragLabel': 'Reorder {channel}',
  'videos.status.all': 'All',
  'videos.status.watchLater': 'Watch later',
  'videos.status.unwatched': 'Unwatched',
  'videos.status.partial': 'In progress',
  'videos.status.watched': 'Watched',
  'videos.status.previous': 'its previous status',
  'videos.channels.all': 'All channels',
  'videos.channels.manage': 'Manage channels',
  'videos.channels.add': 'Add channels',
  'videos.channels.none': 'No channels',
  'videos.channels.one': '1 channel',
  'videos.channels.count': '{count} channels',
  'videos.manual.button': 'Add',
  'videos.manual.dialog': 'Add YouTube video or channel',
  'videos.manual.hint': 'Here you can paste the URL of a YouTube video or a channel.',
  'videos.manual.placeholder': 'YouTube video or channel URL',
  'videos.manual.add': 'Add',
  'videos.manual.adding': 'Adding...',
  'videos.undo': 'Undo',
  'videos.redo': 'Redo',
  'videos.undo.empty': 'Nothing to undo',
  'videos.redo.empty': 'Nothing to redo',
  'videos.undo.queue': 'Undo queue',
  'videos.redo.queue': 'Redo queue',
  'videos.undo.title': 'Undo latest action',
  'videos.redo.title': 'Redo latest action',
  'videos.watchedSection': 'Watched',
  'videos.watched.show': 'Show watched videos',
  'videos.watched.hide': 'Hide watched videos',
  'videos.empty.default': 'Your study feed is ready to grow. Add a YouTube channel or paste one video to begin.',
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
  'videos.card.new': 'New',
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
  'videos.card.removeFromGrid': 'Remove from grid',
  'videoReminder.tabTitle': '✓ Mark as watched · Edenia',
  'videoReminder.aria': 'Video watch reminder',
  'videoReminder.eyebrow': 'Quick check-in',
  'videoReminder.question': 'Finished watching the video? Mark it as watched!',
  'videoReminder.markWatched': 'Mark as watched',
  'videoReminder.notYet': 'Not yet',
  'videos.refreshing': 'Refreshing...',
  'videos.refresh': 'Refresh',
  'activity.empty': 'No activity logged yet',
  'activity.showOlder': 'Show older',
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
  'backups.reason.automaticCleanup': 'Before automatic cleanup',
  'backups.reason.sandboxReset': 'Before sandbox reset',
  'backups.reason.syncImport': 'Before sync import',
  'backups.reason.backupRestore': 'Before backup restore',
  'backups.reason.reset': 'Before reset',
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
  'points.one': '{count} pts',
  'points.many': '{count} pts',
  'city.timelineAria': '{date}, {points} pts{changed}',
  'city.timelineChanged': ', city image changed',
  'toast.sandboxMode': 'Sandbox mode: demo data is isolated from your real progress',
  'toast.sandboxReset': 'Sandbox reset: no study progress yet',
  'toast.sandboxDayAdded': 'Added sandbox study day: {date}',
  'toast.addChannelFirst': 'Add at least one channel from the channel filter first',
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
  'toast.validYoutubeUrl': 'Use a valid YouTube video or channel URL',
  'toast.videoNotFound': 'No YouTube video was found for that URL',
  'toast.alreadyWatched': 'That video is already marked watched',
  'toast.watchCooldown': 'You can mark this video as watched in {time}',
  'toast.addedWatchedVideo': 'Added video: "{title}"',
  'toast.addVideoFailed': 'Could not add that video',
  'toast.timestampFormat': 'Use a timestamp like 1:23 (hour:minute)',
  'toast.nothingRedo': 'Nothing to redo',
  'toast.nothingUndo': 'Nothing to undo',
  'toast.videoGone': 'That video is no longer available',
  'toast.watchedHidden': 'That watched video is hidden by the current filters',
  'toast.couldNotShowVideo': 'Could not show that video right now',
  'toast.videoRemovedFromGrid': 'Removed from the video grid',
  'toast.levelUp': 'Level up! {label}',
  'toast.localeChanged': 'Language changed to {language}',
  'toast.skippedShorts': ', skipped {count} short video{plural}',
  'toast.skippedShortsSettingsHint': '; fetched {count} short video{plural}, then filtered them out. To include them, enable “Show short videos” in Settings',
  'toast.shortsRefetching': 'Refreshing all channels to load short videos…',
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
  'undo.continueAtBack': 'Continue at {from} -> back to {to}',
  'undo.continueAtChange': 'Continue at {from} -> {to}',
  'undo.continueAtSet': '{verb} change: "{title}" continues at {time}.',
  'undo.timeUnavailable': 'Time unavailable',
  'undo.doneAt': 'Done {time}',
  'undo.logUndoTitle': 'Undo action',
  'undo.logRedoTitle': 'Redo action',
  'undo.restoreChannel': 'Restore channel',
  'undo.removeChannelAgain': 'Remove channel again',
  'undo.channelRestored': 'Restored channel: {name}',
  'undo.channelRemoved': 'Removed channel again: {name}',
  'undo.restoreVideo': 'Restore to video grid',
  'undo.removeVideoAgain': 'Remove from video grid again',
  'undo.videoRestored': 'Restored to video grid: {title}',
  'undo.videoRemoved': 'Removed from video grid again: {title}',
  'undo.restoreAddedVideoAndChannel': 'Restore added video and channel',
  'undo.restoreAddedVideo': 'Restore added video',
  'undo.removeAddedVideoAndChannel': 'Remove added video and channel',
  'undo.removeAddedVideo': 'Remove added video',
  'undo.addedVideoAndChannelRestored': 'Restored added video "{title}" and channel {channel}.',
  'undo.addedVideoRestored': 'Restored added video: "{title}".',
  'undo.addedVideoAndChannelRemoved': 'Removed added video "{title}" and channel {channel}.',
  'undo.addedVideoRemoved': 'Removed added video: "{title}".',
  'log.videoRemovedFromGrid': 'Video removed from grid',
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
  'walkthrough.videosMobile': 'This is the video area. New videos from your channels appear here. When you mark one watched, Edenia moves it into a Watched section to keep your active feed clear.',
  'walkthrough.firstStudyChannels': 'You can add YouTube channels or individual videos here.',
  'walkthrough.otherAddNow': 'Add a Youtube channel or video now!',
  'walkthrough.firstStudyFeed': 'This is your study feed. Choose a video, then mark it watched, in progress, or watch later. Your goal, history, and town update from what you study.',
  'walkthrough.startWatching': 'Start watching a video!',
  'walkthrough.videoFilters': 'These controls help you keep the list manageable. You can filter by status, filter by channel, add a video URL, and fix mistakes.',
  'walkthrough.manualWatchedUrl': 'Use Add to paste a YouTube video or channel URL. Edenia will recognize which one you entered.',
  'walkthrough.undoRedo': 'Undo and Redo let you recover from accidental clicks. Open the list, choose the action, and Edenia will update the score and history again.',
  'walkthrough.settings': 'Click Settings when you want to adjust Edenia. This is where you choose your weekly goal, language, short-video preference, backups, and sync files.',
  'walkthrough.clickSettings': 'Click Settings',
  'walkthrough.channels': 'Use this channel button to add YouTube channels and choose which ones appear in the video list. Paste a channel URL, @handle, or channel ID at the top of the popup. The small cross next to a tracked channel removes it, and Undo can bring it back.',
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
  'log.locale.detail': 'Language set to {language}.',
  'log.onboarding.title': 'Starter feed created',
  'log.onboarding.detail': '{language} · {level} · {count} channels',
  'log.onboarding.otherDetail': '{language} · Choose your own channels',
  'log.sandboxReset.title': 'Sandbox reset',
  'log.sandboxReset.detail': 'Sandbox progress was reset after keeping a rollback backup.',
  'log.ankiSetting.title': 'Anki setting changed',
  'log.ankiSetting.enabled': 'Anki tracking is enabled.',
  'log.ankiSetting.disabled': 'Anki tracking is disabled.',
  'log.insightsSetting.title': 'Study insights setting changed',
  'log.insightsSetting.shown': 'Study insights are shown.',
  'log.insightsSetting.hidden': 'Study insights are hidden.',
  'log.rollback.title': 'Rollback backup created',
  'log.rollback.beforeImport': 'Saved a local backup before importing a sync file.',
  'log.rollback.beforeRestore': 'Saved a local backup before restoring another backup.',
  'log.syncImported.title': 'Sync file imported',
  'log.syncImported.detail': 'Imported progress from a sync file.',
  'log.backupRestored.title': 'Backup restored',
  'log.channelAdded.title': 'Channel added',
  'log.channelRemoved.title': 'Channel removed',
  'log.reset.title': 'Reset everything',
  'log.reset.detail': 'Started fresh after keeping a rollback backup.',
  'log.shortsChecked.title': 'Short videos checked',
  'log.shortsChecked.detail': '{checked} stored videos checked; {shorts} short videos found.',
  'log.shortsCheckFailed.title': 'Short video check failed',
  'log.shortsCheckFailed.detail': 'Could not check stored short videos.',
  'log.channelRefreshed.title': 'YouTube channel refreshed',
  'log.channelRefreshed.fetched': '{name}: {count} videos fetched.',
  'log.channelRefreshed.loaded': '{name}: {count} videos loaded.',
  'log.channelRefreshFailed.title': 'YouTube channel refresh failed',
  'log.unknownError': 'Unknown error',
  'log.shortsSkipped.title': 'Short videos skipped',
  'log.shortsSkipped.detail': '{count} short videos skipped during refresh.',
  'log.refreshFailed.title': 'YouTube refresh failed',
  'log.unknownRefreshError': 'Unknown refresh error',
  'log.videoStatus.title': 'Video status changed',
  'log.videoStatus.detail': '“{title}” is now {status}.',
  'log.videoAdded.title': 'Video URL added',
  'log.videoAdded.detail': '“{title}” was added to the video grid.',
  'log.ankiRefreshFailed.title': 'Anki refresh failed',
  'log.ankiStats.title': 'Anki stats refreshed',
  'log.ankiStats.detail': '{reviewed} tracked reviews today, {created} new cards found.',
  'log.levelUp.title': 'Level-up claimed'
}

const I18N = {
  en: I18N_EN,
  'zh-Hant': {
    ...I18N_EN,
    'intro.skip': '跳過介紹',
    'intro.sound.off': '聲音關閉',
    'intro.sound.on': '聲音開啟',
    'intro.opening.kicker': '你的語言學習世界',
    'intro.opening.title': '讓每一堂課都有意義。',
    'intro.purpose.kicker': '用你的方式學習',
    'intro.purpose.title': '把 YouTube 和 Anki 變成\n看得見的進步。',
    'intro.purpose.body': '觀看你喜愛的頻道、複習卡片，讓 Edenia 把每一份努力連在一起。',
    'intro.purpose.progress': '學習積分',
    'intro.purpose.watched': '已觀看',
    'intro.purpose.reviews': '次複習',
    'intro.city.kicker': '讓進步成為一個地方',
    'intro.city.title': '學習、獲得積分，\n看著你的城鎮進化。',
    'intro.city.level': '城鎮等級',
    'intro.features.history': '學習歷史',
    'intro.features.week': '本週',
    'intro.features.studied': '學習時間',
    'intro.features.streak': '天連續學習',
    'intro.features.goal': '目標',
    'intro.features.kicker': '看見整段旅程',
    'intro.features.title': '你的節奏、歷史與動力，一眼掌握。',
    'intro.features.body': '熱圖、目標、連續紀錄和學習洞察，將你的歷史轉化為更清楚的下一步。',
    'intro.features.insightBody': '你最近的學習節奏正在增強。延續有效的方式，讓動力保持下去。',
    'intro.finale.kicker': '一點點進步，一整個世界。',
    'intro.finale.title': '你會建造出什麼？',
    'intro.finale.body': '建立你的學習影片清單，開始屬於你的 Edenia。',
    'intro.finale.cta': '開始我的旅程',
    'intro.finale.return': '返回 Edenia',
    'onboarding.progress': '第 {current} 步，共 {total} 步',
    'onboarding.promise': '把 YouTube 和 Anki 轉化為看得見的語言學習進步。',
    'onboarding.eyebrow': '讓學習成果看得見',
    'onboarding.language.title': '你正在學哪一種語言？',
    'onboarding.language.subtitle': '選擇你的主要學習語言。Edenia 會據此建立專注的入門影片清單，之後仍可加入更多頻道。',
    'onboarding.language.hint': '選擇一種語言以繼續。',
    'onboarding.level.title': '你目前學到哪個階段？',
    'onboarding.channels.title': '你的入門學習清單',
    'onboarding.channels.subtitle': '最多選擇 5 個頻道。之後可以隨時修改。',
    'onboarding.channels.selected': '已選擇 {count} 個',
    'onboarding.channels.limit': '最多只能選擇 {count} 個頻道。請先取消一個，再加入其他頻道。',
    'onboarding.channels.none': '目前沒有符合這個組合的入門頻道。你仍可繼續並自行新增。',
    'onboarding.continue': '繼續',
    'onboarding.back': '返回',
    'onboarding.build': '開始我的旅程',
    'onboarding.building': '正在開始你的旅程…',
    'onboarding.private': '不需帳號 · 你的真實進度只會保存在這個瀏覽器中',
    'onboarding.channelIssue': '有 {count} 個入門頻道無法加入。你之後可以手動新增。',
    'onboarding.videoIssue': '頻道已加入，但目前無法載入近期影片。請檢查 YouTube 存取權限後再試一次。',
    'onboarding.language.mandarin': '華語',
    'onboarding.language.japanese': '日語',
    'onboarding.language.korean': '韓語',
    'onboarding.language.spanish': '西班牙語',
    'onboarding.language.french': '法語',
    'onboarding.language.german': '德語',
    'onboarding.language.english': '英語',
    'onboarding.language.other': '其他',
    'onboarding.other.title': '每種語言都能在這裡學習',
    'onboarding.other.subtitle': 'Edenia 適用於任何語言。進入應用程式後，你可以加入想學習的 YouTube 頻道，建立完全屬於自己的學習清單。',
    'onboarding.other.note': '不需要推薦內容——進入 Edenia 後，你可以自行選擇頻道。',
    'onboarding.level.starting.label': '剛開始',
    'onboarding.level.starting.detail': '目前只能理解很少的內容。',
    'onboarding.level.beginner.label': '初級',
    'onboarding.level.beginner.detail': '我知道基本單字和句子。',
    'onboarding.level.intermediate.label': '中級',
    'onboarding.level.intermediate.detail': '我能理解學習者內容和一些母語素材。',
    'onboarding.level.advanced.label': '進階',
    'onboarding.level.advanced.detail': '我主要透過母語內容學習。',
    'onboarding.level.not-sure.label': '不確定',
    'onboarding.level.not-sure.detail': '請提供均衡的入門組合。',
    'onboarding.channelStyle.casualConversations': '輕鬆對話',
    'onboarding.channelStyle.clearExplanations': '清楚講解',
    'onboarding.channelStyle.comprehensibleInput': '可理解輸入',
    'onboarding.channelStyle.conversationsInterviews': '對話與訪談',
    'onboarding.channelStyle.conversationsStories': '對話與故事',
    'onboarding.channelStyle.detailedLessons': '深入課程',
    'onboarding.channelStyle.filmTechnology': '影像與科技',
    'onboarding.channelStyle.lessonsConversations': '課程與對話',
    'onboarding.channelStyle.nativeEntertainment': '母語娛樂內容',
    'onboarding.channelStyle.naturalMandarin': '自然華語',
    'onboarding.channelStyle.newsCommentary': '新聞與評論',
    'onboarding.channelStyle.podcast': 'Podcast',
    'onboarding.channelStyle.psychologyConversations': '心理與對談',
    'onboarding.channelStyle.streetInterviews': '街頭訪談',
    'onboarding.channelStyle.structuredLessons': '系統化課程',
    'settings.title': '設定',
    'settings.close': '關閉設定',
    'settings.language.label': '語言',
    'settings.weeklyGoal.label': '每週目標（小時）',
    'settings.channels.label': '頻道',
    'settings.channels.placeholder': 'Channel URL or @',
    'settings.channels.add': '新增',
    'settings.channels.hint': '貼上 YouTube 頻道網址、@handle 或頻道 ID。建議格式：youtube.com/@channel 或 youtube.com/channel/UCxxxxxxxx。',
    'settings.shorts.label': '顯示短影片',
    'settings.shorts.hint': '關閉時，刷新會跳過 3 分鐘以下的影片，並從主要影片清單隱藏。',
    'settings.howto.title': '使用說明',
    'settings.youtube.title': '新增 YouTube 頻道',
    'settings.youtube.intro': '複製 YouTube 頻道網址即可新增頻道。你也可以使用頻道的 @handle。',
    'settings.youtube.step1': '在 YouTube 打開你想新增的頻道，從瀏覽器網址列複製其網址。',
    'settings.youtube.step2': '在 Edenia 中，打開影片清單上方的「新增」，並貼上網址。',
    'settings.youtube.step3': '點「新增」，將頻道加入你的學習動態。',
    'settings.anki.whatTitle': 'Anki 是什麼？',
    'settings.anki.whatIntro': 'Anki 是一款單字卡應用程式，會安排複習時間，幫助你長期記住單字和概念。你可以選擇是否搭配 Edenia 使用 Anki。',
    'settings.anki.title': '連接到 Anki',
    'settings.anki.enabled': '啟用 Anki 追蹤',
    'settings.anki.toggleHint': '開啟後，Edenia 可以在 Anki 開著時讀取複習數量。',
    'settings.insights.enabled': '啟用學習洞察',
    'settings.insights.toggleHint': '控制是否在分析中顯示洞察。隱藏後仍會持續追蹤洞察並保留紀錄。',
    'settings.anki.intro': 'Edenia 可以自動計算你的 Anki 複習量。要讓 Edenia 和 Anki 連接，請安裝 AnkiConnect，並在設定中允許 Edenia。',
    'settings.anki.step1': '打開 Anki。在 Tools 點 Add-ons，再點 Get Add-ons，然後貼上這個代碼：2055492159。',
    'settings.anki.step2': '重新啟動 Anki 後，再到 Tools、Add-ons，點 AnkiConnect，然後點 Config。請確認下面這段文字在 config 的最後面。',
    'settings.anki.step3': '重新啟動 Anki，使用 Edenia 時請保持 Anki 開著。',
    'settings.anki.note': 'Edenia 只會讀取你的複習數量，用在學習紀錄中。它不會修改你的 Anki 卡片。',
    'settings.scoring.title': '分數怎麼算',
    'settings.scoring.intro': '分數來自影片學習時間和 Anki 複習。Edenia 會先把每一種來源的分數向下取整，再加到當天。',
  'settings.scoring.video': '觀看 1 小時影片會得到 3 分。',
  'settings.scoring.anki': '複習 60 張 Anki 卡會得到 2 分。',
  'settings.scoring.examples': '例子：',
  'settings.scoring.exampleVideo': '觀看 30 分鐘影片會得到 1 分（1.5 向下取整為 1）。',
  'settings.scoring.exampleAnki': '複習 30 張 Anki 卡會得到 1 分，但複習 29 張會得到 0 分（0.9 向下取整為 0）。',
  'settings.workflow.title': '典型 Edenia 流程',
  'settings.workflow.item1': '觀看你已新增的頻道中的影片。',
  'settings.workflow.item2': '使用「新增」貼上 YouTube 影片或頻道網址。',
  'settings.workflow.item3': '使用學習歷史摘要和熱圖查看你的學習情況。',
  'settings.workflow.item4': '看著你的城鎮成長。',
    'settings.activity.title': '活動紀錄',
    'settings.activity.filtersLabel': '活動紀錄篩選',
    'settings.activity.all': '全部',
    'settings.activity.user': '使用者',
    'settings.activity.auto': '自動',
    'settings.activity.issues': '問題',
    'settings.activity.points': '分數',
    'activity.pointsLabel': '分數',
    'activity.points.empty': '還沒有得分紀錄。',
    'activity.points.videoTitle': '觀看 {title} {time}',
    'activity.points.ankiTitle': '複習 {count} 張 Anki 卡',
    'activity.points.unmarkTitle': '取消標記 {title}',
    'activity.points.undoTitle': '復原：{title}',
    'activity.points.redoTitle': '重做：{title}',
    'settings.sync.export': '匯出同步檔',
    'settings.sync.import': '匯入同步檔',
    'settings.sync.note': '進度會儲存在這個瀏覽器。使用同步檔可以把同一份進度帶到其他裝置或瀏覽器。',
    'settings.walkthroughAgain': '再次顯示導覽',
    'settings.trailerAgain': '再次播放預告片',
    'settings.backups.title': '最近本機備份',
    'settings.backups.note': '本機備份可以在匯入、重置或儲存出錯後復原。若要保護到瀏覽器之外，請匯出同步檔。',
    'settings.reset.open': '全部重置',
    'settings.reset.warning': '這會清除本機觀看紀錄、連續天數、設定與快取的 Anki 統計。這裡會先保留一份回復備份。你的 Anki 牌組不會被更動。',
    'settings.reset.cancel': '取消',
    'settings.reset.delete': '刪除資料',
    'toast.channelInvalid': '請使用 YouTube 頻道網址、@handle 或 UC 頻道 ID',
    'toast.addChannelFirst': '請先從頻道篩選加入至少一個頻道',
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
    'city.level.1': '🏠 孤單的小屋',
    'city.level.2': '⛵ 你的小屋煥然一新！還多了一艘船！',
    'city.level.3': '🏝️ 看！一座小小島！好可愛。',
    'city.level.4': '孩子們現在會玩得很開心！',
    'city.level.5': '來加一個泳池放鬆一下',
    'city.level.6': '喔！有朋友要來打招呼了...',
    'city.level.7': '你的小島擴大了！',
    'city.level.8': '漂亮的躺椅和可愛的花！🌸',
    'city.level.9': '你在後院蓋了一間可愛的小屋',
    'city.level.10': '哇！你有鄰居了！🏠',
    'city.level.11': '紫色小屋有了一座可愛的花園！',
    'city.level.12': '天啊！出現了一座火山！希望它不要爆發...',
    'goal.title': '每週目標',
    'nextStudy.title': '繼續觀看',
    'nextStudy.studyNext': '接著學習',
    'nextStudy.resume': '繼續觀看',
    'nextStudy.watch': '觀看',
    'nextStudy.notInterested': '不感興趣',
    'nextStudy.unwatch': '標記為未觀看',
    'nextStudy.continueShort': '繼續',
    'goal.watched': '已看',
    'goal.inProgress': '進行中',
    'goal.toGo': '還差',
    'goal.pace.session': '今天進行一次 {minutes} 分鐘的學習，就能保持進度。',
    'goal.pace.longSession': '今天以 {time} 為目標，讓進度回到正軌。',
    'goal.pace.onTrack': '你本週的進度正按計畫前進。',
    'goal.pace.complete': '本週目標已完成。做得好！',
    'insights.eyebrow': '學習洞察',
    'insights.weekly.title': '本週學習回顧',
    'insights.weekly.summary.zero': '本週沒有記錄到影片學習時間。',
    'insights.weekly.summary.one': '本週你在 1 部影片中累積了 {time}。',
    'insights.weekly.summary.many': '本週你在 {videos} 部影片中累積了 {time}。',
    'insights.weekly.channels': '各頻道：{channels}。',
    'insights.weekly.noChannels': '本週沒有記錄到頻道觀看時間。',
    'insights.weekly.otherChannel': '其他頻道',
    'insights.weekly.topVideo': '觀看最多：{video}（{time}）',
    'insights.weekly.activeDays': '{days} 個活躍日',
    'insights.weekly.anki': 'Anki：複習 {reviewed} 張、新增 {created} 張',
    'insights.subject.study': '學習',
    'insights.window.morning': '早晨',
    'insights.window.afternoon': '下午',
    'insights.window.evening': '傍晚',
    'insights.window.night': '深夜',
    'insights.title.preferred-window': '保留已經有效的節奏',
    'insights.body.preferred-window': '{window}是你最穩定的學習時段。忙碌的日子也可以試著保留 {minutes} 分鐘給自己。',
    'insights.evidence.preferred-window': '在 {days} 個有學習的日子中，{percent}% 的影片學習發生在{window}。',
    'insights.title.morning-opportunity': '試試小小的晨間學習',
    'insights.body.morning-opportunity': '你幾乎不在早晨學習。要不要在晨間作息中安排一段 {minutes} 分鐘的{subject}時間？',
    'insights.evidence.morning-opportunity': '在 {days} 個有學習的日子中，早晨只占影片學習的 {percent}%。',
    'insights.title.short-sessions': '短時間學習也很有效',
    'insights.body.short-sessions': '你的影片學習通常一次約 {minutes} 分鐘。預留一個短時間選項，能讓持續學習更容易。',
    'insights.evidence.short-sessions': '{days} 個有學習的日子中，共記錄了 {sessions} 次學習。',
    'insights.title.preferred-window.alt': '守住最適合你的學習時段',
    'insights.body.preferred-window.alt': '你的學習一再落在{window}。行程擁擠時，也先留下 {minutes} 分鐘。',
    'insights.title.morning-opportunity.alt': '試著用不同方式開始一天',
    'insights.body.morning-opportunity.alt': '早上仍很少用來學習。先試一次 {minutes} 分鐘的{subject}學習，看看是否能持續。',
    'insights.title.short-sessions.alt': '你的節奏適合精簡學習',
    'insights.body.short-sessions.alt': '你經常在約 {minutes} 分鐘內取得進展。把這當作有效的預設方式，而不是備案。',
    'insights.title.reliable-weekday': '讓{weekday}成為每週錨點',
    'insights.body.reliable-weekday': '{weekday}比其他日子更穩定地出現學習。保留這個固定時段，能讓整週更穩定。',
    'insights.title.reliable-weekday.alt': '{weekday}一再出現',
    'insights.body.reliable-weekday.alt': '紀錄顯示{weekday}是你可靠的學習日。加入新安排前，先圍繞這個優勢規劃。',
    'insights.evidence.reliable-weekday': '你的有效學習日中，{percent}% 落在{weekday}。',
    'insights.title.weekend-opportunity': '週末留一個小入口',
    'insights.body.weekend-opportunity': '週末幾乎沒有出現在你的學習模式中。彈性的 {minutes} 分鐘學習可避免連續兩天空白。',
    'insights.title.weekend-opportunity.alt': '試試週末備案',
    'insights.body.weekend-opportunity.alt': '你的節奏很偏向平日。為週六或週日準備一個低壓力的 {minutes} 分鐘選項。',
    'insights.evidence.weekend-opportunity': '週末影片學習佔比為 {percent}%。',
    'insights.title.momentum-up': '你的動力正在增強',
    'insights.body.momentum-up': '過去兩週的學習時間明顯增加。繼續熟悉的下一步，讓這個速度能持續。',
    'insights.title.momentum-up.alt': '最近兩週向上走',
    'insights.body.momentum-up.alt': '最近的學習量高於前一階段。重複促成這次增長的例行節奏。',
    'insights.evidence.momentum-up': '最近 14 天學習 {recentMinutes} 分鐘，比前 14 天多 {comparisonPercent}%。',
    'insights.title.momentum-reset': '把重新開始變得更小',
    'insights.body.momentum-reset': '最近的學習時間比前兩週少。別一次追進度，先從輕鬆的 {minutes} 分鐘開始。',
    'insights.title.momentum-reset.alt': '降低開始的門檻',
    'insights.body.momentum-reset.alt': '你最近的節奏比以前安靜。選擇最容易的 {minutes} 分鐘學習行動，再慢慢重建。',
    'insights.evidence.momentum-reset': '最近 14 天學習 {recentMinutes} 分鐘，比前 14 天少 {comparisonPercent}%。',
    'insights.title.long-sessions': '加上短時間學習安全網',
    'insights.body.long-sessions': '你典型的學習約 {minutes} 分鐘。忙碌時，可用 {suggestedMinutes} 分鐘備案保持連續性。',
    'insights.title.long-sessions.alt': '準備一個輕量版本',
    'insights.body.long-sessions.alt': '你通常以約 {minutes} 分鐘的大塊時間學習。為無法安排這段時間的日子定義一個小版本。',
    'insights.evidence.long-sessions': '{days} 個有學習的日子共 {sessions} 次；典型學習時長為 {typicalMinutes} 分鐘。',
    'insights.title.anki-fallback': '準備 15 張卡片的備案',
    'insights.body.anki-fallback': '今天沒時間看影片嗎？複習 15 張 Anki 卡片，仍能讓語言保持熟悉，也讓習慣繼續前進。',
    'insights.title.anki-fallback.alt': '小小的複習也算數',
    'insights.body.anki-fallback.alt': '沒時間看影片時，試著複習 15 張 Anki 卡片。輕量的學習日也是過程的一部分。',
    'insights.evidence.anki-fallback': '這段期間，你在 {ankiDays} 天內共複習了 {reviewedCards} 張卡片。',
    'insights.title.steady-process': '用季節衡量，而不是一天',
    'insights.body.steady-process': '語言學習是長期承諾。穩定接觸，比某一天學得完美更重要。',
    'insights.title.steady-process.alt': '讓持續累積發揮力量',
    'insights.body.steady-process.alt': '流利來自長時間重複的平凡練習。繼續選擇下一個能持續的步驟。',
    'insights.evidence.steady-process': '最近 {observationDays} 天中，你有 {days} 個有效學習日。',
    'insights.collapse': '收合學習洞察',
    'insights.reopen': '學習洞察',
    'insights.reopen.aria': '顯示學習洞察',
    'insights.tabs.aria': '學習洞察檢視',
    'insights.tab.current': '目前',
    'insights.tab.previous': '過往',
    'insights.previous.aria': '顯示 {count} 則過往洞察',
    'insights.previous.empty': '當你的學習模式改變時，過往洞察會顯示在這裡。',
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
    'history.heatmap.less': '較少',
    'history.heatmap.more': '較多',
    'history.heatmap.legend': '學習活動強度',
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
    'history.heatmapAriaNoAnki': '{date}：{points} 分；{time} 影片時間；已看 {videos} 部影片',
    'videos.title': '待看影片',
    'videos.status.label': '影片狀態',
    'videos.channel.oneVideo': '1 部影片',
    'videos.channel.videoCount': '{count} 部影片',
    'videos.channel.shelfLabel': '{channel} 的影片',
    'videos.channel.previousLabel': '向左瀏覽 {channel} 的影片',
    'videos.channel.nextLabel': '向右瀏覽 {channel} 的影片',
    'videos.channel.dragLabel': '重新排列 {channel}',
    'videos.status.all': '全部',
    'videos.status.watchLater': '稍後觀看',
    'videos.status.unwatched': '未觀看',
    'videos.status.partial': '進行中',
    'videos.status.watched': '已看',
    'videos.channels.all': '全部頻道',
    'videos.channels.manage': '管理頻道',
    'videos.channels.add': '新增頻道',
    'videos.channels.none': '沒有頻道',
    'videos.manual.button': '新增',
    'videos.manual.dialog': '新增 YouTube 影片或頻道',
    'videos.manual.hint': '你可以在這裡貼上 YouTube 影片或頻道網址。',
    'videos.manual.add': '新增',
    'videos.undo': '復原',
    'videos.redo': '重做',
    'videos.undo.empty': '沒有可復原動作',
    'videos.redo.empty': '沒有可重做動作',
    'videos.undo.queue': '復原佇列',
    'videos.redo.queue': '重做佇列',
    'videos.undo.title': '復原最近的動作',
    'videos.redo.title': '重做最近的動作',
    'videos.watchedSection': '已看',
    'videos.watched.show': '顯示已看影片',
    'videos.watched.hide': '隱藏已看影片',
    'videos.empty.default': '你的學習清單準備好成長了。新增 YouTube 頻道或貼上一部影片即可開始。',
    'videos.empty.activeBelow': '目前沒有待看影片。已看影片在下方。',
    'videos.search.empty': '依標題或頻道搜尋已儲存影片。',
    'videos.search.noMatches': '找不到符合的影片。',
    'videos.card.markWatched': '標記已看',
    'videos.card.new': '新片',
    'videos.card.markWatchedTitle': '標記為已看',
    'videos.card.unmark': '取消標記',
    'videos.card.clear': '清除',
    'videos.card.resume': '繼續觀看',
    'videos.card.continueAt': '繼續於',
    'videos.card.removeFromGrid': '從清單移除',
    'activity.empty': '還沒有活動紀錄',
    'activity.showOlder': '顯示較舊紀錄',
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
    'toast.nothingRedo': '沒有可重做動作',
    'toast.nothingUndo': '沒有可復原動作',
    'toast.videoRemovedFromGrid': '已從影片清單移除',
    'undo.removed': '{verb}變更：「{title}」已移除。',
    'undo.backTo': '{verb}變更：「{title}」已回到{status}。',
    'undo.redid': '已重做',
    'undo.undid': '已復原',
    'undo.backToStatus': '{from} -> 回到 {to}',
    'undo.statusChange': '{from} -> {to}',
    'undo.continueAtBack': '繼續於 {from} -> 回到 {to}',
    'undo.continueAtChange': '繼續於 {from} -> {to}',
    'undo.continueAtSet': '{verb}變更：「{title}」將從 {time} 繼續。',
    'undo.timeUnavailable': '時間不可用',
    'undo.doneAt': '完成於 {time}',
    'undo.logUndoTitle': '復原動作',
    'undo.logRedoTitle': '重做動作',
    'undo.restoreChannel': '恢復頻道',
    'undo.removeChannelAgain': '再次移除頻道',
    'undo.channelRestored': '已恢復頻道：{name}',
    'undo.channelRemoved': '已再次移除頻道：{name}',
    'undo.restoreVideo': '恢復至影片清單',
    'undo.removeVideoAgain': '再次從影片清單移除',
    'undo.videoRestored': '已恢復至影片清單：{title}',
    'undo.videoRemoved': '已再次從影片清單移除：{title}',
    'undo.restoreAddedVideoAndChannel': '恢復已新增的影片和頻道',
    'undo.restoreAddedVideo': '恢復已新增的影片',
    'undo.removeAddedVideoAndChannel': '移除已新增的影片和頻道',
    'undo.removeAddedVideo': '移除已新增的影片',
    'undo.addedVideoAndChannelRestored': '已恢復新增的影片「{title}」及頻道 {channel}。',
    'undo.addedVideoRestored': '已恢復新增的影片：「{title}」。',
    'undo.addedVideoAndChannelRemoved': '已移除新增的影片「{title}」及頻道 {channel}。',
    'undo.addedVideoRemoved': '已移除新增的影片：「{title}」。',
    'log.videoRemovedFromGrid': '影片已從清單移除',
    'walkthrough.next': '下一步',
    'walkthrough.back': '上一步',
    'walkthrough.skip': '略過',
    'walkthrough.done': '完成',
    'walkthrough.close': '關閉導覽',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': '這是你的漂浮小鎮。你學習時，小鎮會一點一點成長，讓你不用讀很多數字也能快速看見進度。',
    'walkthrough.weeklyGoal': '這是你的每週目標。你看過的學習影片時間會填滿進度條，幫你知道這週是否跟上目標。',
    'walkthrough.studyHistory': '學習紀錄會顯示你一段時間內做了什麼。它會把看過的影片和 Anki 複習放在一起，讓你看懂真正的學習節奏。',
    'walkthrough.historyViews': '摘要適合看清楚的數字，熱力圖適合快速看哪些天有學習。Edenia 會記住你偏好的視圖。',
    'walkthrough.videos': '這裡是影片區。你加入的頻道會出現新影片，已看影片會移到下方的已看區。',
    'walkthrough.videosMobile': '這裡是影片區。你加入的頻道會在這裡顯示新影片。標記為已看後，Edenia 會把影片移到「已看」區，讓進行中的清單保持清楚。',
    'walkthrough.firstStudyChannels': '你可以在這裡新增 YouTube 頻道或單部影片。',
    'walkthrough.otherAddNow': '立即新增 YouTube 頻道或影片！',
    'walkthrough.firstStudyFeed': '這是你的學習清單。選擇一部影片，再標記為已看、進行中或稍後觀看。你的目標、紀錄和小鎮都會隨著你的學習更新。',
    'walkthrough.startWatching': '開始觀看影片吧！',
    'walkthrough.videoFilters': '這些控制可以讓清單更好管理。你可以依狀態或頻道篩選，新增影片網址，也可以修正誤點。',
    'walkthrough.manualWatchedUrl': '使用「新增」貼上 YouTube 影片或頻道網址，Edenia 會自動辨識內容。',
    'walkthrough.undoRedo': '復原和重做可以幫你修正誤點。打開清單，選一個動作，Edenia 會重新計算分數和紀錄。',
    'walkthrough.settings': '想調整 Edenia 時，請點設定。你可以在這裡選每週目標、語言、短影片偏好、備份和同步檔。',
    'walkthrough.clickSettings': '點設定',
    'walkthrough.channels': '用這個頻道按鈕加入 YouTube 頻道，並選擇哪些頻道顯示在影片清單中。在彈窗上方貼上頻道網址、@handle 或頻道 ID。已追蹤頻道旁的小叉可以移除頻道，也可以用復原加回來。',
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
    'intro.skip': '跳过介绍',
    'intro.sound.off': '声音关闭',
    'intro.sound.on': '声音开启',
    'intro.opening.kicker': '你的语言学习世界',
    'intro.opening.title': '让每一堂课都有意义。',
    'intro.purpose.kicker': '用你的方式学习',
    'intro.purpose.title': '把 YouTube 和 Anki 变成\n看得见的进步。',
    'intro.purpose.body': '观看你喜爱的频道、复习卡片，让 Edenia 把每一份努力连接起来。',
    'intro.purpose.progress': '学习积分',
    'intro.purpose.watched': '已观看',
    'intro.purpose.reviews': '次复习',
    'intro.city.kicker': '让进步成为一个地方',
    'intro.city.title': '学习、获得积分，\n看着你的城镇进化。',
    'intro.city.level': '城镇等级',
    'intro.features.history': '学习历史',
    'intro.features.week': '本周',
    'intro.features.studied': '学习时间',
    'intro.features.streak': '天连续学习',
    'intro.features.goal': '目标',
    'intro.features.kicker': '看见整段旅程',
    'intro.features.title': '你的节奏、历史与动力，一眼掌握。',
    'intro.features.body': '热图、目标、连续记录和学习洞察，将你的历史转化为更清楚的下一步。',
    'intro.features.insightBody': '你最近的学习节奏正在增强。延续有效的方式，让动力保持下去。',
    'intro.finale.kicker': '一点点进步，一整个世界。',
    'intro.finale.title': '你会建造出什么？',
    'intro.finale.body': '建立你的学习视频清单，开始属于你的 Edenia。',
    'intro.finale.cta': '开始我的旅程',
    'intro.finale.return': '返回 Edenia',
    'onboarding.progress': '第 {current} 步，共 {total} 步',
    'onboarding.promise': '把 YouTube 和 Anki 转化为看得见的语言学习进步。',
    'onboarding.eyebrow': '让学习成果看得见',
    'onboarding.language.title': '你正在学习哪种语言？',
    'onboarding.language.subtitle': '选择你的主要学习语言。Edenia 会据此建立专注的入门视频列表，之后仍可添加更多频道。',
    'onboarding.language.hint': '选择一种语言以继续。',
    'onboarding.level.title': '你目前学到哪个阶段？',
    'onboarding.channels.title': '你的入门学习列表',
    'onboarding.channels.subtitle': '最多选择 5 个频道。之后可以随时修改。',
    'onboarding.channels.selected': '已选择 {count} 个',
    'onboarding.channels.limit': '最多只能选择 {count} 个频道。请先取消一个，再添加其他频道。',
    'onboarding.channels.none': '目前没有符合这个组合的入门频道。你仍可继续并自行添加。',
    'onboarding.continue': '继续',
    'onboarding.back': '返回',
    'onboarding.build': '开始我的旅程',
    'onboarding.building': '正在开始你的旅程…',
    'onboarding.private': '无需账号 · 你的真实进度只会保存在这个浏览器中',
    'onboarding.channelIssue': '有 {count} 个入门频道无法添加。你之后可以手动添加。',
    'onboarding.videoIssue': '频道已添加，但目前无法加载近期视频。请检查 YouTube 访问权限后再试一次。',
    'onboarding.language.mandarin': '普通话',
    'onboarding.language.japanese': '日语',
    'onboarding.language.korean': '韩语',
    'onboarding.language.spanish': '西班牙语',
    'onboarding.language.french': '法语',
    'onboarding.language.german': '德语',
    'onboarding.language.english': '英语',
    'onboarding.language.other': '其他',
    'onboarding.other.title': '每种语言都能在这里学习',
    'onboarding.other.subtitle': 'Edenia 适用于任何语言。进入应用后，你可以添加想学习的 YouTube 频道，建立完全属于自己的学习列表。',
    'onboarding.other.note': '不需要推荐内容——进入 Edenia 后，你可以自行选择频道。',
    'onboarding.level.starting.label': '刚开始',
    'onboarding.level.starting.detail': '目前只能理解很少的内容。',
    'onboarding.level.beginner.label': '初级',
    'onboarding.level.beginner.detail': '我知道基本单词和句子。',
    'onboarding.level.intermediate.label': '中级',
    'onboarding.level.intermediate.detail': '我能理解学习者内容和一些母语素材。',
    'onboarding.level.advanced.label': '高级',
    'onboarding.level.advanced.detail': '我主要通过母语内容学习。',
    'onboarding.level.not-sure.label': '不确定',
    'onboarding.level.not-sure.detail': '请提供均衡的入门组合。',
    'onboarding.channelStyle.casualConversations': '轻松对话',
    'onboarding.channelStyle.clearExplanations': '清楚讲解',
    'onboarding.channelStyle.comprehensibleInput': '可理解输入',
    'onboarding.channelStyle.conversationsInterviews': '对话与访谈',
    'onboarding.channelStyle.conversationsStories': '对话与故事',
    'onboarding.channelStyle.detailedLessons': '深入课程',
    'onboarding.channelStyle.filmTechnology': '影视与科技',
    'onboarding.channelStyle.lessonsConversations': '课程与对话',
    'onboarding.channelStyle.nativeEntertainment': '母语娱乐内容',
    'onboarding.channelStyle.naturalMandarin': '自然普通话',
    'onboarding.channelStyle.newsCommentary': '新闻与评论',
    'onboarding.channelStyle.podcast': '播客',
    'onboarding.channelStyle.psychologyConversations': '心理与对谈',
    'onboarding.channelStyle.streetInterviews': '街头采访',
    'onboarding.channelStyle.structuredLessons': '系统化课程',
    'settings.title': '设置',
    'settings.close': '关闭设置',
    'settings.language.label': '语言',
    'settings.weeklyGoal.label': '每周目标（小时）',
    'settings.channels.label': '频道',
    'settings.channels.placeholder': 'Channel URL or @',
    'settings.channels.add': '添加',
    'settings.channels.hint': '粘贴 YouTube 频道网址、@handle 或频道 ID。建议格式：youtube.com/@channel 或 youtube.com/channel/UCxxxxxxxx。',
    'settings.shorts.label': '显示短视频',
    'settings.shorts.hint': '关闭时，刷新会跳过 3 分钟以下的视频，并从主要视频列表隐藏。',
    'settings.howto.title': '使用说明',
    'settings.youtube.title': '添加 YouTube 频道',
    'settings.youtube.intro': '复制 YouTube 频道网址即可添加频道。你也可以使用频道的 @handle。',
    'settings.youtube.step1': '在 YouTube 打开你想添加的频道，从浏览器地址栏复制其网址。',
    'settings.youtube.step2': '在 Edenia 中，打开视频列表上方的“添加”，并粘贴网址。',
    'settings.youtube.step3': '点击“添加”，将频道加入你的学习动态。',
    'settings.anki.whatTitle': '什么是 Anki？',
    'settings.anki.whatIntro': 'Anki 是一款抽认卡应用，会安排复习时间，帮助你长期记住单词和概念。你可以选择是否搭配 Edenia 使用 Anki。',
    'settings.anki.title': '连接 Anki',
    'settings.anki.enabled': '启用 Anki 追踪',
    'settings.anki.toggleHint': '开启后，Edenia 可以在 Anki 打开时读取复习数量。',
    'settings.insights.enabled': '启用学习洞察',
    'settings.insights.toggleHint': '控制是否在分析中显示洞察。隐藏后仍会继续追踪洞察并保留记录。',
    'settings.anki.intro': 'Edenia 可以自动计算你的 Anki 复习量。要让 Edenia 和 Anki 连接，请安装 AnkiConnect，并在设置中允许 Edenia。',
    'settings.anki.step1': '打开 Anki。在 Tools 点 Add-ons，再点 Get Add-ons，然后粘贴这个代码：2055492159。',
    'settings.anki.step2': '重新启动 Anki 后，再到 Tools、Add-ons，点击 AnkiConnect，然后点击 Config。请确认下面这段文字在 config 的最后面。',
    'settings.anki.step3': '重新启动 Anki，使用 Edenia 时请保持 Anki 打开。',
    'settings.anki.note': 'Edenia 只会读取你的复习数量，用在学习记录中。它不会修改你的 Anki 卡片。',
    'settings.scoring.title': '分数怎么算',
    'settings.scoring.intro': '分数来自视频学习时间和 Anki 复习。Edenia 会先把每一种来源的分数向下取整，再加到当天。',
  'settings.scoring.video': '观看 1 小时视频会得到 3 分。',
  'settings.scoring.anki': '复习 60 张 Anki 卡会得到 2 分。',
  'settings.scoring.examples': '例子：',
  'settings.scoring.exampleVideo': '观看 30 分钟视频会得到 1 分（1.5 向下取整为 1）。',
  'settings.scoring.exampleAnki': '复习 30 张 Anki 卡会得到 1 分，但复习 29 张会得到 0 分（0.9 向下取整为 0）。',
  'settings.workflow.title': '典型 Edenia 流程',
  'settings.workflow.item1': '观看你已添加的频道中的视频。',
  'settings.workflow.item2': '使用“添加”粘贴 YouTube 视频或频道网址。',
  'settings.workflow.item3': '通过学习历史摘要和热图查看你的学习情况。',
  'settings.workflow.item4': '看着你的城镇成长。',
    'settings.activity.title': '活动记录',
    'settings.activity.all': '全部',
    'settings.activity.user': '用户',
    'settings.activity.auto': '自动',
    'settings.activity.issues': '问题',
    'settings.activity.points': '分数',
    'activity.pointsLabel': '分数',
    'activity.points.empty': '还没有得分记录。',
    'activity.points.videoTitle': '观看 {title} {time}',
    'activity.points.ankiTitle': '复习 {count} 张 Anki 卡',
    'activity.points.unmarkTitle': '取消标记 {title}',
    'activity.points.undoTitle': '撤销：{title}',
    'activity.points.redoTitle': '重做：{title}',
    'settings.sync.export': '导出同步文件',
    'settings.sync.import': '导入同步文件',
    'settings.sync.note': '进度会保存在这个浏览器。使用同步文件可以把同一份进度带到其他设备或浏览器。',
    'settings.walkthroughAgain': '再次显示导览',
    'settings.trailerAgain': '再次播放预告片',
    'settings.backups.title': '最近本地备份',
    'settings.backups.note': '本地备份可以在导入、重置或保存出错后恢复。若要保护到浏览器之外，请导出同步文件。',
    'settings.reset.open': '全部重置',
    'settings.reset.warning': '这会清除本地观看记录、连续天数、设置与缓存的 Anki 统计。这里会先保留一份回滚备份。你的 Anki 牌组不会被更改。',
    'settings.reset.cancel': '取消',
    'settings.reset.delete': '删除数据',
    'toast.channelInvalid': '请使用 YouTube 频道网址、@handle 或 UC 频道 ID',
    'toast.addChannelFirst': '请先从频道筛选添加至少一个频道',
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
    'city.level.1': '🏠 孤单的小屋',
    'city.level.2': '⛵ 你的小屋焕然一新！还多了一艘船！',
    'city.level.3': '🏝️ 看！一座小小岛！好可爱。',
    'city.level.4': '孩子们现在会玩得很开心！',
    'city.level.5': '来加一个泳池放松一下',
    'city.level.6': '哦！有朋友要来打招呼了...',
    'city.level.7': '你的小岛扩大了！',
    'city.level.8': '漂亮的躺椅和可爱的花！🌸',
    'city.level.9': '你在后院盖了一间可爱的小屋',
    'city.level.10': '哇！你有邻居了！🏠',
    'city.level.11': '紫色小屋有了一座可爱的花园！',
    'city.level.12': '天啊！出现了一座火山！希望它不要爆发...',
    'goal.title': '每周目标',
    'nextStudy.title': '继续观看',
    'nextStudy.studyNext': '接下来学习',
    'nextStudy.resume': '继续观看',
    'nextStudy.watch': '观看',
    'nextStudy.notInterested': '不感兴趣',
    'nextStudy.unwatch': '标记为未观看',
    'nextStudy.continueShort': '继续',
    'goal.watched': '已看',
    'goal.inProgress': '进行中',
    'goal.toGo': '还差',
    'goal.pace.session': '今天进行一次 {minutes} 分钟的学习，就能保持进度。',
    'goal.pace.longSession': '今天以 {time} 为目标，让进度回到正轨。',
    'goal.pace.onTrack': '你本周的进度正按计划前进。',
    'goal.pace.complete': '本周目标已完成。做得好！',
    'insights.eyebrow': '学习洞察',
    'insights.weekly.title': '本周学习回顾',
    'insights.weekly.summary.zero': '本周没有记录到视频学习时间。',
    'insights.weekly.summary.one': '本周你在 1 部视频中累计了 {time}。',
    'insights.weekly.summary.many': '本周你在 {videos} 部视频中累计了 {time}。',
    'insights.weekly.channels': '各频道：{channels}。',
    'insights.weekly.noChannels': '本周没有记录到频道观看时间。',
    'insights.weekly.otherChannel': '其他频道',
    'insights.weekly.topVideo': '观看最多：{video}（{time}）',
    'insights.weekly.activeDays': '{days} 个活跃日',
    'insights.weekly.anki': 'Anki：复习 {reviewed} 张、新增 {created} 张',
    'insights.subject.study': '学习',
    'insights.window.morning': '早晨',
    'insights.window.afternoon': '下午',
    'insights.window.evening': '傍晚',
    'insights.window.night': '深夜',
    'insights.title.preferred-window': '保留已经有效的节奏',
    'insights.body.preferred-window': '{window}是你最稳定的学习时段。忙碌的日子也可以试着保留 {minutes} 分钟给自己。',
    'insights.evidence.preferred-window': '在 {days} 个有学习的日子中，{percent}% 的视频学习发生在{window}。',
    'insights.title.morning-opportunity': '试试小小的晨间学习',
    'insights.body.morning-opportunity': '你几乎不在早晨学习。要不要在晨间作息中安排一段 {minutes} 分钟的{subject}时间？',
    'insights.evidence.morning-opportunity': '在 {days} 个有学习的日子中，早晨只占视频学习的 {percent}%。',
    'insights.title.short-sessions': '短时间学习也很有效',
    'insights.body.short-sessions': '你的视频学习通常一次约 {minutes} 分钟。预留一个短时间选项，能让持续学习更容易。',
    'insights.evidence.short-sessions': '{days} 个有学习的日子中，共记录了 {sessions} 次学习。',
    'insights.title.preferred-window.alt': '守住最适合你的学习时段',
    'insights.body.preferred-window.alt': '你的学习一再落在{window}。行程拥挤时，也先留下 {minutes} 分钟。',
    'insights.title.morning-opportunity.alt': '试着用不同方式开始一天',
    'insights.body.morning-opportunity.alt': '早上仍很少用来学习。先试一次 {minutes} 分钟的{subject}学习，看看是否能持续。',
    'insights.title.short-sessions.alt': '你的节奏适合精简学习',
    'insights.body.short-sessions.alt': '你经常在约 {minutes} 分钟内取得进展。把这当作有效的默认方式，而不是备案。',
    'insights.title.reliable-weekday': '让{weekday}成为每周锚点',
    'insights.body.reliable-weekday': '{weekday}比其他日子更稳定地出现学习。保留这个固定时段，能让整周更稳定。',
    'insights.title.reliable-weekday.alt': '{weekday}一再出现',
    'insights.body.reliable-weekday.alt': '记录显示{weekday}是你可靠的学习日。加入新安排前，先围绕这个优势规划。',
    'insights.evidence.reliable-weekday': '你的有效学习日中，{percent}% 落在{weekday}。',
    'insights.title.weekend-opportunity': '周末留一个小入口',
    'insights.body.weekend-opportunity': '周末几乎没有出现在你的学习模式中。灵活的 {minutes} 分钟学习可避免连续两天空白。',
    'insights.title.weekend-opportunity.alt': '试试周末备案',
    'insights.body.weekend-opportunity.alt': '你的节奏很偏向工作日。为周六或周日准备一个低压力的 {minutes} 分钟选项。',
    'insights.evidence.weekend-opportunity': '周末视频学习占比为 {percent}%。',
    'insights.title.momentum-up': '你的动力正在增强',
    'insights.body.momentum-up': '过去两周的学习时间明显增加。继续熟悉的下一步，让这个速度能持续。',
    'insights.title.momentum-up.alt': '最近两周向上走',
    'insights.body.momentum-up.alt': '最近的学习量高于前一阶段。重复促成这次增长的日常节奏。',
    'insights.evidence.momentum-up': '最近 14 天学习 {recentMinutes} 分钟，比前 14 天多 {comparisonPercent}%。',
    'insights.title.momentum-reset': '把重新开始变得更小',
    'insights.body.momentum-reset': '最近的学习时间比前两周少。别一次追进度，先从轻松的 {minutes} 分钟开始。',
    'insights.title.momentum-reset.alt': '降低开始的门槛',
    'insights.body.momentum-reset.alt': '你最近的节奏比以前安静。选择最容易的 {minutes} 分钟学习行动，再慢慢重建。',
    'insights.evidence.momentum-reset': '最近 14 天学习 {recentMinutes} 分钟，比前 14 天少 {comparisonPercent}%。',
    'insights.title.long-sessions': '加上短时间学习安全网',
    'insights.body.long-sessions': '你典型的学习约 {minutes} 分钟。忙碌时，可用 {suggestedMinutes} 分钟备案保持连续性。',
    'insights.title.long-sessions.alt': '准备一个轻量版本',
    'insights.body.long-sessions.alt': '你通常以约 {minutes} 分钟的大块时间学习。为无法安排这段时间的日子定义一个小版本。',
    'insights.evidence.long-sessions': '{days} 个有学习的日子共 {sessions} 次；典型学习时长为 {typicalMinutes} 分钟。',
    'insights.title.anki-fallback': '准备 15 张卡片的备案',
    'insights.body.anki-fallback': '今天没时间看视频吗？复习 15 张 Anki 卡片，仍能让语言保持熟悉，也让习惯继续前进。',
    'insights.title.anki-fallback.alt': '小小的复习也算数',
    'insights.body.anki-fallback.alt': '没时间看视频时，试着复习 15 张 Anki 卡片。轻量的学习日也是过程的一部分。',
    'insights.evidence.anki-fallback': '这段期间，你在 {ankiDays} 天内共复习了 {reviewedCards} 张卡片。',
    'insights.title.steady-process': '用季节衡量，而不是一天',
    'insights.body.steady-process': '语言学习是长期承诺。稳定接触，比某一天学得完美更重要。',
    'insights.title.steady-process.alt': '让持续积累发挥力量',
    'insights.body.steady-process.alt': '流利来自长时间重复的平凡练习。继续选择下一个能持续的步骤。',
    'insights.evidence.steady-process': '最近 {observationDays} 天中，你有 {days} 个有效学习日。',
    'insights.collapse': '收起学习洞察',
    'insights.reopen': '学习洞察',
    'insights.reopen.aria': '显示学习洞察',
    'insights.tabs.aria': '学习洞察视图',
    'insights.tab.current': '当前',
    'insights.tab.previous': '过往',
    'insights.previous.aria': '显示 {count} 则过往洞察',
    'insights.previous.empty': '当你的学习模式改变时，过往洞察会显示在这里。',
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
    'history.heatmap.less': '较少',
    'history.heatmap.more': '较多',
    'history.heatmap.legend': '学习活动强度',
    'history.showPoints': '显示 {date} 的得分方式',
    'history.pointsDialog': '得分明细',
    'history.pointsAnkiReviews': 'Anki 复习',
    'history.pointsReviewsCount': '{count} 张复习',
    'history.pointsDailyTotal': '当日总分',
    'history.pointsRounding': '向下取整',
    'history.pointsNone': '没有得分',
    'history.heatmapAria': '{date}：{points} 分；{time} 视频时间；已看 {videos} 部视频；复习 {reviewed} 张 Anki 卡；新增 {created} 张 Anki 卡',
    'history.heatmapAriaNoAnki': '{date}：{points} 分；{time} 视频时间；已看 {videos} 部视频',
    'history.tooltip.points': '{count} 分',
    'videos.title': '待看视频',
    'videos.status.label': '视频状态',
    'videos.channel.oneVideo': '1 个视频',
    'videos.channel.videoCount': '{count} 个视频',
    'videos.channel.shelfLabel': '{channel} 的视频',
    'videos.channel.previousLabel': '向左浏览 {channel} 的视频',
    'videos.channel.nextLabel': '向右浏览 {channel} 的视频',
    'videos.channel.dragLabel': '重新排列 {channel}',
    'videos.status.all': '全部',
    'videos.status.watchLater': '稍后观看',
    'videos.status.unwatched': '未观看',
    'videos.status.partial': '进行中',
    'videos.status.watched': '已看',
    'videos.channels.all': '全部频道',
    'videos.channels.manage': '管理频道',
    'videos.channels.add': '添加频道',
    'videos.channels.none': '没有频道',
    'videos.manual.button': '添加',
    'videos.manual.hint': '你可以在这里粘贴 YouTube 视频或频道网址。',
    'videos.manual.add': '添加',
    'videos.undo': '撤销',
    'videos.redo': '重做',
    'videos.undo.empty': '没有可撤销动作',
    'videos.redo.empty': '没有可重做动作',
    'videos.undo.queue': '撤销队列',
    'videos.redo.queue': '重做队列',
    'videos.undo.title': '撤销最近的动作',
    'videos.redo.title': '重做最近的动作',
    'videos.watchedSection': '已看',
    'videos.watched.show': '显示已看视频',
    'videos.watched.hide': '隐藏已看视频',
    'videos.empty.default': '你的学习列表准备好成长了。添加 YouTube 频道或粘贴一个视频即可开始。',
    'videos.search.empty': '按标题或频道搜索已保存视频。',
    'videos.card.markWatched': '标记已看',
    'videos.card.new': '新视频',
    'videos.card.unmark': '取消标记',
    'videos.card.resume': '继续观看',
    'videos.card.continueAt': '继续于',
    'videos.card.removeFromGrid': '从列表移除',
    'activity.empty': '还没有活动记录',
    'activity.showOlder': '显示较早记录',
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
    'toast.nothingRedo': '没有可重做动作',
    'toast.nothingUndo': '没有可撤销动作',
    'toast.videoRemovedFromGrid': '已从视频列表移除',
    'undo.removed': '{verb}变更：“{title}”已移除。',
    'undo.backTo': '{verb}变更：“{title}”已回到{status}。',
    'undo.redid': '已重做',
    'undo.undid': '已撤销',
    'undo.backToStatus': '{from} -> 回到 {to}',
    'undo.statusChange': '{from} -> {to}',
    'undo.continueAtBack': '继续于 {from} -> 回到 {to}',
    'undo.continueAtChange': '继续于 {from} -> {to}',
    'undo.continueAtSet': '{verb}变更：“{title}”将从 {time} 继续。',
    'undo.timeUnavailable': '时间不可用',
    'undo.doneAt': '完成于 {time}',
    'undo.logUndoTitle': '撤销动作',
    'undo.logRedoTitle': '重做动作',
    'undo.restoreChannel': '恢复频道',
    'undo.removeChannelAgain': '再次移除频道',
    'undo.channelRestored': '已恢复频道：{name}',
    'undo.channelRemoved': '已再次移除频道：{name}',
    'undo.restoreVideo': '恢复至视频列表',
    'undo.removeVideoAgain': '再次从视频列表移除',
    'undo.videoRestored': '已恢复至视频列表：{title}',
    'undo.videoRemoved': '已再次从视频列表移除：{title}',
    'undo.restoreAddedVideoAndChannel': '恢复已添加的视频和频道',
    'undo.restoreAddedVideo': '恢复已添加的视频',
    'undo.removeAddedVideoAndChannel': '移除已添加的视频和频道',
    'undo.removeAddedVideo': '移除已添加的视频',
    'undo.addedVideoAndChannelRestored': '已恢复添加的视频“{title}”及频道 {channel}。',
    'undo.addedVideoRestored': '已恢复添加的视频：“{title}”。',
    'undo.addedVideoAndChannelRemoved': '已移除添加的视频“{title}”及频道 {channel}。',
    'undo.addedVideoRemoved': '已移除添加的视频：“{title}”。',
    'log.videoRemovedFromGrid': '视频已从列表移除',
    'walkthrough.next': '下一步',
    'walkthrough.back': '上一步',
    'walkthrough.skip': '跳过',
    'walkthrough.done': '完成',
    'walkthrough.close': '关闭导览',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': '这是你的漂浮小镇。你学习时，小镇会一点一点成长，让你不用读很多数字也能快速看到进度。',
    'walkthrough.weeklyGoal': '这是你的每周目标。你看过的学习视频时间会填满进度条，帮助你知道这周是否跟上目标。',
    'walkthrough.studyHistory': '学习记录会显示你一段时间内做了什么。它会把看过的视频和 Anki 复习放在一起，让你看懂真正的学习节奏。',
    'walkthrough.historyViews': '摘要适合看清楚的数字，热力图适合快速看哪些天有学习。Edenia 会记住你偏好的视图。',
    'walkthrough.videos': '这里是视频区。你加入的频道会出现新视频，已看视频会移到下方的已看区。',
    'walkthrough.videosMobile': '这里是视频区。你添加的频道会在这里显示新视频。标记为已看后，Edenia 会把视频移到“已看”区，让当前列表保持清晰。',
    'walkthrough.firstStudyChannels': '你可以在这里添加 YouTube 频道或单个视频。',
    'walkthrough.otherAddNow': '立即添加 YouTube 频道或视频！',
    'walkthrough.firstStudyFeed': '这是你的学习列表。选择一个视频，再标记为已看、进行中或稍后观看。你的目标、记录和小镇都会随着你的学习更新。',
    'walkthrough.startWatching': '开始观看视频吧！',
    'walkthrough.videoFilters': '这些控制可以让列表更好管理。你可以按状态或频道筛选，添加视频网址，也可以修正误点。',
    'walkthrough.manualWatchedUrl': '使用“添加”粘贴 YouTube 视频或频道网址，Edenia 会自动识别内容。',
    'walkthrough.undoRedo': '撤销和重做可以帮你修正误点。打开列表，选一个动作，Edenia 会重新计算分数和记录。',
    'walkthrough.settings': '想调整 Edenia 时，请点设置。你可以在这里选择每周目标、语言、短视频偏好、备份和同步文件。',
    'walkthrough.clickSettings': '点设置',
    'walkthrough.channels': '用这个频道按钮添加 YouTube 频道，并选择哪些频道显示在视频列表中。在弹窗上方粘贴频道网址、@handle 或频道 ID。已追踪频道旁的小叉可以移除频道，也可以用撤销加回来。',
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
    'intro.skip': 'Omitir introducción',
    'intro.sound.off': 'Sonido desactivado',
    'intro.sound.on': 'Sonido activado',
    'intro.opening.kicker': 'Tu mundo de aprendizaje',
    'intro.opening.title': 'Haz que cada lección cuente.',
    'intro.purpose.kicker': 'Estudia a tu manera',
    'intro.purpose.title': 'Convierte YouTube y Anki en progreso visible.',
    'intro.purpose.body': 'Mira los canales que te gustan, repasa tus tarjetas y deja que Edenia conecte cada esfuerzo.',
    'intro.purpose.progress': 'Puntos de estudio',
    'intro.purpose.watched': 'vistos',
    'intro.purpose.reviews': 'repasos',
    'intro.city.kicker': 'El progreso se convierte en un lugar',
    'intro.city.title': 'Estudia.\nGana puntos.\nMira cómo evoluciona tu ciudad.',
    'intro.city.level': 'Nivel de ciudad',
    'intro.features.history': 'Historial de estudio',
    'intro.features.week': 'Esta semana',
    'intro.features.studied': 'estudiado',
    'intro.features.streak': 'días de racha',
    'intro.features.goal': 'Objetivo',
    'intro.features.kicker': 'Contempla el viaje',
    'intro.features.title': 'Tu ritmo, historial e impulso de un vistazo.',
    'intro.features.body': 'Los mapas de actividad, objetivos, rachas y observaciones convierten tu historial en un próximo paso más claro.',
    'intro.features.insightBody': 'Tu ritmo reciente es más fuerte. Repite la rutina que lo hizo posible.',
    'intro.finale.kicker': 'Un poco de progreso. Todo un mundo.',
    'intro.finale.title': '¿Qué vas a construir?',
    'intro.finale.body': 'Crea tu selección de estudio y comienza tu Edenia.',
    'intro.finale.cta': 'Empezar mi viaje',
    'intro.finale.return': 'Volver a Edenia',
    'onboarding.progress': 'Paso {current} de {total}',
    'onboarding.promise': 'Convierte YouTube y Anki en un progreso visible en el aprendizaje de idiomas.',
    'onboarding.eyebrow': 'Haz visible tu aprendizaje',
    'onboarding.language.title': '¿Qué idioma estás aprendiendo?',
    'onboarding.language.subtitle': 'Elige tu idioma principal. Edenia lo usará para crear una lista inicial enfocada; podrás añadir más canales después.',
    'onboarding.language.hint': 'Elige un idioma para continuar.',
    'onboarding.level.title': '¿En qué punto del camino estás?',
    'onboarding.channels.title': 'Tu lista de estudio inicial',
    'onboarding.channels.subtitle': 'Selecciona hasta 5 canales. Podrás modificarlos en cualquier momento más adelante.',
    'onboarding.channels.selected': '{count} seleccionados',
    'onboarding.channels.limit': 'Puedes seleccionar hasta {count} canales. Deselecciona uno para añadir otro.',
    'onboarding.channels.none': 'Aún no hay canales iniciales para esta combinación. Puedes continuar y añadir los tuyos.',
    'onboarding.continue': 'Continuar',
    'onboarding.back': 'Atrás',
    'onboarding.build': 'Empezar mi viaje',
    'onboarding.building': 'Preparando tu viaje...',
    'onboarding.private': 'Sin cuenta · Tu progreso real permanece en este navegador',
    'onboarding.channelIssue': 'No se pudieron añadir {count} canales iniciales. Puedes añadirlos manualmente después.',
    'onboarding.videoIssue': 'Los canales se añadieron, pero sus videos recientes aún no se pudieron cargar. Comprueba el acceso a YouTube e inténtalo de nuevo.',
    'onboarding.language.mandarin': 'Chino mandarín',
    'onboarding.language.japanese': 'Japonés',
    'onboarding.language.korean': 'Coreano',
    'onboarding.language.spanish': 'Español',
    'onboarding.language.french': 'Francés',
    'onboarding.language.german': 'Alemán',
    'onboarding.language.english': 'Inglés',
    'onboarding.language.other': 'Otro',
    'onboarding.other.title': 'Todos los idiomas tienen cabida aquí',
    'onboarding.other.subtitle': 'Edenia funciona con cualquier idioma. Cuando entres en la aplicación, añade los canales de YouTube con los que quieras aprender y crea una lista de estudio totalmente tuya.',
    'onboarding.other.note': 'No necesitas recomendaciones: podrás elegir tus propios canales después de entrar en Edenia.',
    'onboarding.level.starting.label': 'Recién empiezo',
    'onboarding.level.starting.detail': 'Todavía entiendo muy poco.',
    'onboarding.level.beginner.label': 'Principiante',
    'onboarding.level.beginner.detail': 'Conozco palabras y frases básicas.',
    'onboarding.level.intermediate.label': 'Intermedio',
    'onboarding.level.intermediate.detail': 'Puedo seguir contenido para estudiantes y algo de material nativo.',
    'onboarding.level.advanced.label': 'Avanzado',
    'onboarding.level.advanced.detail': 'Aprendo principalmente con contenido nativo.',
    'onboarding.level.not-sure.label': 'No estoy seguro',
    'onboarding.level.not-sure.detail': 'Dame una selección inicial equilibrada.',
    'onboarding.channelStyle.casualConversations': 'Conversaciones informales',
    'onboarding.channelStyle.clearExplanations': 'Explicaciones claras',
    'onboarding.channelStyle.comprehensibleInput': 'Input comprensible',
    'onboarding.channelStyle.conversationsInterviews': 'Conversaciones y entrevistas',
    'onboarding.channelStyle.conversationsStories': 'Conversaciones e historias',
    'onboarding.channelStyle.detailedLessons': 'Lecciones detalladas',
    'onboarding.channelStyle.filmTechnology': 'Cine y tecnología',
    'onboarding.channelStyle.lessonsConversations': 'Lecciones y conversaciones',
    'onboarding.channelStyle.nativeEntertainment': 'Entretenimiento nativo',
    'onboarding.channelStyle.naturalMandarin': 'Mandarín natural',
    'onboarding.channelStyle.newsCommentary': 'Noticias y comentarios',
    'onboarding.channelStyle.podcast': 'Pódcast',
    'onboarding.channelStyle.psychologyConversations': 'Psicología y conversaciones',
    'onboarding.channelStyle.streetInterviews': 'Entrevistas callejeras',
    'onboarding.channelStyle.structuredLessons': 'Lecciones estructuradas',
    'settings.title': 'Ajustes',
    'settings.close': 'Cerrar ajustes',
    'settings.language.label': 'Idioma',
    'settings.weeklyGoal.label': 'Objetivo semanal (horas)',
    'settings.channels.label': 'Canales',
    'settings.channels.placeholder': 'Channel URL or @',
    'settings.channels.add': 'Añadir',
    'settings.channels.hint': 'Pega una URL de canal de YouTube, @handle o ID del canal. Mejores ejemplos: youtube.com/@channel o youtube.com/channel/UCxxxxxxxx.',
    'settings.shorts.label': 'Mostrar videos cortos',
    'settings.shorts.hint': 'Si está desactivado, los videos de menos de 3 minutos se omiten al actualizar y se ocultan de la lista activa.',
    'settings.howto.title': 'Cómo usar',
    'settings.youtube.title': 'Añadir un canal de YouTube',
    'settings.youtube.intro': 'Añade un canal copiando su URL de YouTube. También puedes usar su @handle.',
    'settings.youtube.step1': 'En YouTube, abre el canal que quieras y copia su URL desde la barra de direcciones del navegador.',
    'settings.youtube.step2': 'En Edenia, abre Añadir encima de la lista de videos y pega la URL.',
    'settings.youtube.step3': 'Haz clic en Añadir para agregar el canal a tu lista de estudio.',
    'settings.anki.whatTitle': '¿Qué es Anki?',
    'settings.anki.whatIntro': 'Anki es una aplicación de tarjetas que programa repasos para ayudarte a recordar palabras e ideas a largo plazo. Usar Anki con Edenia es opcional.',
    'settings.anki.title': 'Conectar Anki',
    'settings.anki.enabled': 'Activar seguimiento de Anki',
    'settings.anki.toggleHint': 'Cuando está activo, Edenia puede leer tus repasos de Anki mientras Anki está abierto.',
    'settings.insights.enabled': 'Activar observaciones de estudio',
    'settings.insights.toggleHint': 'Controla si las observaciones aparecen en Análisis. El seguimiento y el historial continúan cuando están ocultas.',
    'settings.anki.intro': 'Edenia puede contar tus repasos de Anki automáticamente. Para que Edenia pueda hablar con Anki, instala AnkiConnect y permite Edenia en sus ajustes.',
    'settings.anki.step1': 'Abre Anki. En Tools, haz clic en Add-ons, luego Get Add-ons, y pega este código: 2055492159.',
    'settings.anki.step2': 'Después de reiniciar Anki, vuelve a Tools, Add-ons, haz clic en AnkiConnect y luego en Config. Asegúrate de que el texto de abajo esté al final de la configuración.',
    'settings.anki.step3': 'Reinicia Anki y mantenlo abierto mientras usas Edenia.',
    'settings.anki.note': 'Edenia solo lee tu número de repasos para el historial de estudio. No cambia tus tarjetas de Anki.',
    'settings.scoring.title': 'Cómo funcionan los puntos',
    'settings.scoring.intro': 'Los puntos recompensan el tiempo de estudio con videos y los repasos de Anki. Edenia redondea cada fuente hacia abajo antes de sumar los puntos al día.',
  'settings.scoring.video': 'Ver 1 hora de video da 3 pts.',
  'settings.scoring.anki': '60 repasos de Anki dan 2 pts.',
  'settings.scoring.examples': 'Ejemplos:',
  'settings.scoring.exampleVideo': 'Ver 30 min de video da 1 pts (1.5 redondeado hacia abajo a 1).',
  'settings.scoring.exampleAnki': 'Hacer 30 repasos de Anki da 1 pts, pero hacer 29 repasos da 0 pts (0.9 redondeado hacia abajo a 0).',
  'settings.workflow.title': 'Flujo típico de Edenia',
  'settings.workflow.item1': 'Mira videos de los canales que has añadido.',
  'settings.workflow.item2': 'Usa Añadir para pegar la URL de un video o canal de YouTube.',
  'settings.workflow.item3': 'Revisa tus estudios con el resumen del historial y el mapa de calor.',
  'settings.workflow.item4': 'Mira crecer tu ciudad.',
    'settings.activity.title': 'Registro de actividad',
    'settings.activity.all': 'Todo',
    'settings.activity.user': 'Usuario',
    'settings.activity.auto': 'Auto',
    'settings.activity.issues': 'Problemas',
    'settings.activity.points': 'Puntos',
    'activity.pointsLabel': 'Puntos',
    'activity.points.empty': 'Aún no hay puntos ganados.',
    'activity.points.videoTitle': 'Visto {time} de {title}',
    'activity.points.ankiTitle': '{count} repasos de Anki',
    'activity.points.unmarkTitle': 'Desmarcado {title}',
    'activity.points.undoTitle': 'Deshacer: {title}',
    'activity.points.redoTitle': 'Rehacer: {title}',
    'settings.sync.export': 'Exportar archivo',
    'settings.sync.import': 'Importar archivo',
    'settings.sync.note': 'El progreso se guarda en este navegador. Usa archivos de sincronización para copiarlo a otro dispositivo o navegador.',
    'settings.walkthroughAgain': 'Ver guía otra vez',
    'settings.trailerAgain': 'Ver tráiler otra vez',
    'settings.backups.title': 'Copias locales recientes',
    'settings.backups.note': 'Las copias locales ayudan después de una mala importación, un reinicio o un error de guardado. Exporta un archivo para protegerte fuera de este navegador.',
    'settings.reset.open': 'Restablecer todo',
    'settings.reset.warning': 'Esto borrará el historial local de videos, la racha, los ajustes y las estadísticas de Anki en caché. Se guardará una copia de recuperación aquí. Tu colección de Anki no cambiará.',
    'settings.reset.cancel': 'Cancelar',
    'settings.reset.delete': 'Borrar datos',
    'toast.channelInvalid': 'Usa una URL de canal de YouTube, @handle o ID de canal UC',
    'toast.addChannelFirst': 'Añade al menos un canal desde el filtro de canales primero',
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
    'city.level.1': '🏠 Casa solitaria',
    'city.level.2': '⛵ ¡Tu casa recibió una mejora! ¡Y un barco!',
    'city.level.3': '🏝️ ¡Mira! ¡Una isla pequeña! Qué linda.',
    'city.level.4': '¡Ahora los niños se van a divertir!',
    'city.level.5': 'Añadamos una piscina para relajarnos',
    'city.level.6': '¡Oh! Vienen algunos amigos a saludar...',
    'city.level.7': '¡Expandiste tu pequeña isla!',
    'city.level.8': '¡Una linda reposera y flores bonitas! 🌸',
    'city.level.9': 'Construiste una casita linda en el patio',
    'city.level.10': '¡Vaya! ¡Tienes un vecino! 🏠',
    'city.level.11': '¡La casita morada tiene un jardín precioso!',
    'city.level.12': '¡Caramba! ¡Apareció un volcán! Espero que no haga erupción...',
    'goal.title': 'Objetivo semanal',
    'nextStudy.title': 'Seguir viendo',
    'nextStudy.studyNext': 'Estudiar a continuación',
    'nextStudy.resume': 'Continuar vídeo',
    'nextStudy.watch': 'Ver',
    'nextStudy.notInterested': 'No me interesa',
    'nextStudy.unwatch': 'Marcar sin ver',
    'nextStudy.continueShort': 'Continuar',
    'goal.watched': 'vistos',
    'goal.inProgress': 'en progreso',
    'goal.toGo': 'restantes',
    'goal.pace.session': 'Una sesión de {minutes} minutos hoy te mantiene al día.',
    'goal.pace.longSession': 'Intenta estudiar {time} hoy para volver al ritmo previsto.',
    'goal.pace.onTrack': 'Vas por buen camino esta semana.',
    'goal.pace.complete': 'Objetivo semanal completado. ¡Buen trabajo!',
    'insights.eyebrow': 'Observación de estudio',
    'insights.weekly.title': 'Tu semana en resumen',
    'insights.weekly.summary.zero': 'Esta semana no se registró tiempo de estudio con vídeos.',
    'insights.weekly.summary.one': 'Esta semana estudiaste {time} con 1 vídeo.',
    'insights.weekly.summary.many': 'Esta semana estudiaste {time} con {videos} vídeos.',
    'insights.weekly.channels': 'Por canal: {channels}.',
    'insights.weekly.noChannels': 'No se registró tiempo de visualización por canal.',
    'insights.weekly.otherChannel': 'Otros canales',
    'insights.weekly.topVideo': 'Más visto: {video} ({time})',
    'insights.weekly.activeDays': '{days} días activos',
    'insights.weekly.anki': 'Anki: {reviewed} repasadas, {created} nuevas',
    'insights.subject.study': 'estudio',
    'insights.window.morning': 'mañana',
    'insights.window.afternoon': 'tarde',
    'insights.window.evening': 'noche',
    'insights.window.night': 'noche',
    'insights.title.preferred-window': 'Protege lo que ya funciona',
    'insights.body.preferred-window': 'La {window} es tu momento de estudio más fiable. En los días ocupados, intenta reservar allí {minutes} minutos.',
    'insights.evidence.preferred-window': 'El {percent}% de tu estudio con vídeos ocurrió por la {window}, a lo largo de {days} días activos.',
    'insights.title.morning-opportunity': 'Un pequeño experimento matutino',
    'insights.body.morning-opportunity': 'Casi nunca estudias por la mañana. ¿Encajaría una sesión de {subject} de {minutes} minutos en tu rutina matutina?',
    'insights.evidence.morning-opportunity': 'Las sesiones matutinas representaron el {percent}% de tu estudio con vídeos durante {days} días activos.',
    'insights.title.short-sessions': 'Las sesiones cortas funcionan',
    'insights.body.short-sessions': 'Tu sesión habitual con vídeos dura unos {minutes} minutos. Tener preparada una opción corta puede facilitar la constancia.',
    'insights.evidence.short-sessions': '{sessions} sesiones de estudio durante {days} días activos.',
    'insights.title.preferred-window.alt': 'Defiende tu mejor momento de estudio',
    'insights.body.preferred-window.alt': 'Tu estudio vuelve una y otra vez a la {window}. Reserva al menos {minutes} minutos cuando el día esté lleno.',
    'insights.title.morning-opportunity.alt': 'Prueba otra forma de empezar el día',
    'insights.body.morning-opportunity.alt': 'La mañana sigue casi sin usarse para estudiar. Prueba un bloque de {subject} de {minutes} minutos y comprueba si es sostenible.',
    'insights.title.short-sessions.alt': 'Tu ritmo encaja con sesiones compactas',
    'insights.body.short-sessions.alt': 'Sueles avanzar en bloques de unos {minutes} minutos. Trátalos como una opción válida, no como un plan B.',
    'insights.title.reliable-weekday': 'Haz del {weekday} tu punto de apoyo',
    'insights.body.reliable-weekday': 'El {weekday} aparece con más constancia que otros días. Proteger ese espacio puede estabilizar el resto de la semana.',
    'insights.title.reliable-weekday.alt': 'El {weekday} sigue apareciendo',
    'insights.body.reliable-weekday.alt': 'Tu historial señala el {weekday} como un día fiable. Planifica desde esa fortaleza antes de añadir compromisos.',
    'insights.evidence.reliable-weekday': 'El {percent}% de tus días de estudio activos fueron {weekday}.',
    'insights.title.weekend-opportunity': 'Deja una pequeña puerta para el fin de semana',
    'insights.body.weekend-opportunity': 'Los fines de semana casi no aparecen en tu patrón. Una sesión flexible de {minutes} minutos puede evitar dos días vacíos.',
    'insights.title.weekend-opportunity.alt': 'Prueba un plan B de fin de semana',
    'insights.body.weekend-opportunity.alt': 'Tu rutina se concentra entre semana. Deja disponible una opción tranquila de {minutes} minutos para sábado o domingo.',
    'insights.evidence.weekend-opportunity': 'El {percent}% de tu estudio con vídeos ocurrió durante el fin de semana.',
    'insights.title.momentum-up': 'Tu impulso está creciendo',
    'insights.body.momentum-up': 'El tiempo de estudio aumentó claramente en las últimas dos semanas. Mantén familiar el siguiente paso para sostener el ritmo.',
    'insights.title.momentum-up.alt': 'Las últimas dos semanas fueron a más',
    'insights.body.momentum-up.alt': 'Tu volumen reciente supera al periodo anterior. Repite la rutina que hizo posible ese aumento.',
    'insights.evidence.momentum-up': 'Los últimos 14 días sumaron {recentMinutes} minutos, un {comparisonPercent}% más que los 14 anteriores.',
    'insights.title.momentum-reset': 'Haz más pequeño el reinicio',
    'insights.body.momentum-reset': 'El estudio reciente bajó frente a las dos semanas anteriores. Vuelve con una sesión sencilla de {minutes} minutos, sin recuperar todo de golpe.',
    'insights.title.momentum-reset.alt': 'Reduce el esfuerzo de empezar',
    'insights.body.momentum-reset.alt': 'Tu ritmo reciente está más tranquilo. Elige la acción de {minutes} minutos más fácil y reconstruye desde ahí.',
    'insights.evidence.momentum-reset': 'Los últimos 14 días sumaron {recentMinutes} minutos, un {comparisonPercent}% menos que los 14 anteriores.',
    'insights.title.long-sessions': 'Añade una red de seguridad corta',
    'insights.body.long-sessions': 'Tu sesión habitual dura unos {minutes} minutos. En días llenos, una alternativa de {suggestedMinutes} minutos puede mantener la continuidad.',
    'insights.title.long-sessions.alt': 'Ten preparada una versión más ligera',
    'insights.body.long-sessions.alt': 'Sueles estudiar en bloques amplios de unos {minutes} minutos. Define una versión menor para los días en que no quepan.',
    'insights.evidence.long-sessions': '{sessions} sesiones en {days} días activos; la sesión habitual duró {typicalMinutes} minutos.',
    'insights.title.anki-fallback': 'Ten una alternativa de 15 tarjetas',
    'insights.body.anki-fallback': '¿Hoy no tienes tiempo para un video? Repasar 15 tarjetas de Anki mantiene el idioma cerca y el hábito en marcha.',
    'insights.title.anki-fallback.alt': 'Un repaso pequeño también cuenta',
    'insights.body.anki-fallback.alt': 'Cuando no quepa un video, prueba con 15 tarjetas de Anki. Un día más ligero también forma parte del proceso.',
    'insights.evidence.anki-fallback': 'Repasaste {reviewedCards} tarjetas durante {ankiDays} días de este periodo.',
    'insights.title.steady-process': 'Piensa en temporadas, no en días',
    'insights.body.steady-process': 'Aprender un idioma es un compromiso a largo plazo. El contacto constante importa más que un día perfecto.',
    'insights.title.steady-process.alt': 'Deja que la constancia haga el trabajo',
    'insights.body.steady-process.alt': 'La fluidez crece con sesiones normales repetidas en el tiempo. Sigue eligiendo el próximo paso sostenible.',
    'insights.evidence.steady-process': '{days} días activos de estudio durante los últimos {observationDays} días.',
    'insights.collapse': 'Contraer las observaciones de estudio',
    'insights.reopen': 'Observaciones',
    'insights.reopen.aria': 'Mostrar las observaciones de estudio',
    'insights.tabs.aria': 'Vistas de observaciones de estudio',
    'insights.tab.current': 'Actual',
    'insights.tab.previous': 'Anteriores',
    'insights.previous.aria': 'Mostrar {count} observaciones anteriores',
    'insights.previous.empty': 'Las observaciones anteriores aparecerán aquí cuando cambie tu patrón de estudio.',
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
    'history.heatmap.less': 'Menos',
    'history.heatmap.more': 'Más',
    'history.heatmap.legend': 'Intensidad de estudio',
    'history.showPoints': 'Mostrar puntos ganados el {date}',
    'history.pointsDialog': 'Detalle de puntos',
    'history.pointsAnkiReviews': 'Repasos de Anki',
    'history.pointsReviewsCount': '{count} repasos',
    'history.pointsDailyTotal': 'Total del día',
    'history.pointsRounding': 'redondeado hacia abajo',
    'history.pointsNone': 'No se ganaron puntos',
    'history.heatmapAria': '{date}: {points} puntos; {time} de video; {videos} videos vistos; {reviewed} tarjetas Anki repasadas; {created} tarjetas Anki nuevas',
    'history.heatmapAriaNoAnki': '{date}: {points} puntos; {time} de video; {videos} videos vistos',
    'history.tooltip.points': '{count} pts',
    'history.today': 'Hoy',
    'history.yesterday': 'Ayer',
    'videos.title': 'Vídeos para ver',
    'videos.status.label': 'Estado del vídeo',
    'videos.channel.oneVideo': '1 vídeo',
    'videos.channel.videoCount': '{count} vídeos',
    'videos.channel.shelfLabel': 'Vídeos de {channel}',
    'videos.channel.previousLabel': 'Desplazar los vídeos de {channel} a la izquierda',
    'videos.channel.nextLabel': 'Desplazar los vídeos de {channel} a la derecha',
    'videos.channel.dragLabel': 'Reordenar {channel}',
    'videos.status.all': 'Todo',
    'videos.status.watchLater': 'Ver luego',
    'videos.status.unwatched': 'Sin ver',
    'videos.status.partial': 'En progreso',
    'videos.status.watched': 'Visto',
    'videos.channels.all': 'Todos los canales',
    'videos.channels.manage': 'Gestionar canales',
    'videos.channels.add': 'Añadir canales',
    'videos.channels.none': 'Sin canales',
    'videos.manual.button': 'Añadir',
    'videos.manual.hint': 'Aquí puedes pegar la URL de un video o canal de YouTube.',
    'videos.manual.add': 'Añadir',
    'videos.undo': 'Deshacer',
    'videos.redo': 'Rehacer',
    'videos.undo.empty': 'Nada que deshacer',
    'videos.redo.empty': 'Nada que rehacer',
    'videos.undo.queue': 'Cola de deshacer',
    'videos.redo.queue': 'Cola de rehacer',
    'videos.undo.title': 'Deshacer la última acción',
    'videos.redo.title': 'Rehacer la última acción',
    'videos.watchedSection': 'Vistos',
    'videos.watched.show': 'Mostrar vídeos vistos',
    'videos.watched.hide': 'Ocultar vídeos vistos',
    'videos.empty.default': 'Tu lista de estudio está lista para crecer. Añade un canal de YouTube o pega un video para empezar.',
    'videos.search.empty': 'Busca videos guardados por título o canal.',
    'videos.card.markWatched': 'Marcar visto',
    'videos.card.new': 'Nuevo',
    'videos.card.unmark': 'Desmarcar',
    'videos.card.resume': 'Continuar viendo',
    'videos.card.continueAt': 'Continuar en',
    'videos.card.removeFromGrid': 'Quitar de la lista',
    'activity.empty': 'Aún no hay actividad registrada',
    'activity.showOlder': 'Mostrar anteriores',
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
    'points.one': '{count} pts',
    'points.many': '{count} pts',
    'city.timelineAria': '{date}, {points} pts{changed}',
    'city.timelineChanged': ', imagen de ciudad cambiada',
    'time.notYet': 'Aún no',
    'time.justNow': 'ahora mismo',
    'time.notRefreshedYet': 'Aún no actualizado',
    'time.lastRefreshed': 'Última actualización: {time}',
    'toast.localeChanged': 'Idioma cambiado a {language}',
    'toast.nothingRedo': 'Nada que rehacer',
    'toast.nothingUndo': 'Nada que deshacer',
    'toast.videoRemovedFromGrid': 'Quitado de la lista de videos',
    'undo.removed': '{verb} cambio: "{title}" se eliminó.',
    'undo.backTo': '{verb} cambio: "{title}" vuelve a {status}.',
    'undo.redid': 'Rehecho',
    'undo.undid': 'Deshecho',
    'undo.backToStatus': '{from} -> vuelve a {to}',
    'undo.statusChange': '{from} -> {to}',
    'undo.continueAtBack': 'Continuar en {from} -> vuelve a {to}',
    'undo.continueAtChange': 'Continuar en {from} -> {to}',
    'undo.continueAtSet': '{verb} cambio: "{title}" continúa en {time}.',
    'undo.timeUnavailable': 'Hora no disponible',
    'undo.doneAt': 'Hecho {time}',
    'undo.logUndoTitle': 'Acción deshecha',
    'undo.logRedoTitle': 'Acción rehecha',
    'undo.restoreChannel': 'Restaurar canal',
    'undo.removeChannelAgain': 'Quitar canal otra vez',
    'undo.channelRestored': 'Canal restaurado: {name}',
    'undo.channelRemoved': 'Canal quitado otra vez: {name}',
    'undo.restoreVideo': 'Restaurar a la lista de videos',
    'undo.removeVideoAgain': 'Quitar de la lista de videos otra vez',
    'undo.videoRestored': 'Restaurado a la lista de videos: {title}',
    'undo.videoRemoved': 'Quitado de la lista de videos otra vez: {title}',
    'undo.restoreAddedVideoAndChannel': 'Restaurar video y canal añadidos',
    'undo.restoreAddedVideo': 'Restaurar video añadido',
    'undo.removeAddedVideoAndChannel': 'Eliminar video y canal añadidos',
    'undo.removeAddedVideo': 'Eliminar video añadido',
    'undo.addedVideoAndChannelRestored': 'Se restauraron el video añadido "{title}" y el canal {channel}.',
    'undo.addedVideoRestored': 'Se restauró el video añadido: "{title}".',
    'undo.addedVideoAndChannelRemoved': 'Se eliminaron el video añadido "{title}" y el canal {channel}.',
    'undo.addedVideoRemoved': 'Se eliminó el video añadido: "{title}".',
    'log.videoRemovedFromGrid': 'Video quitado de la lista',
    'walkthrough.next': 'Siguiente',
    'walkthrough.back': 'Atrás',
    'walkthrough.skip': 'Saltar',
    'walkthrough.done': 'Listo',
    'walkthrough.close': 'Cerrar guía',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': 'Este es tu pueblo flotante. Cuando estudias, crece poco a poco. Te da una imagen rápida de tu progreso sin tener que leer todos los números.',
    'walkthrough.weeklyGoal': 'Este es tu objetivo semanal. El tiempo de videos estudiados llena la barra, para que veas rápido si vas bien esta semana.',
    'walkthrough.studyHistory': 'El historial de estudio muestra lo que pasó con el tiempo. Junta videos vistos y repasos de Anki para que entiendas tu ritmo real.',
    'walkthrough.historyViews': 'Usa Resumen para ver números claros, y Mapa para ver tus días activos de un vistazo. Edenia recuerda la vista que prefieres.',
    'walkthrough.videos': 'Esta es la zona de videos. Aquí aparecen videos nuevos de tus canales, y los videos vistos pasan a la sección Vistos.',
    'walkthrough.videosMobile': 'Esta es la zona de videos. Aquí aparecen videos nuevos de tus canales. Cuando marcas uno como visto, Edenia lo mueve a una sección Vistos para mantener clara tu lista activa.',
    'walkthrough.firstStudyChannels': 'Aquí puedes añadir canales de YouTube o videos individuales.',
    'walkthrough.otherAddNow': '¡Añade ahora un canal o video de YouTube!',
    'walkthrough.firstStudyFeed': 'Esta es tu lista de estudio. Elige un video y márcalo como visto, en progreso o para ver después. Tu objetivo, historial y pueblo se actualizan con lo que estudias.',
    'walkthrough.startWatching': '¡Empieza a ver un video!',
    'walkthrough.videoFilters': 'Estos controles ayudan a mantener la lista clara. Puedes filtrar por estado, filtrar por canal, añadir una URL de video y corregir errores.',
    'walkthrough.manualWatchedUrl': 'Usa Añadir para pegar la URL de un video o canal de YouTube. Edenia reconocerá cuál has introducido.',
    'walkthrough.undoRedo': 'Deshacer y Rehacer te ayudan si haces clic por error. Abre la lista, elige la acción y Edenia recalculará el puntaje y el historial.',
    'walkthrough.settings': 'Haz clic en Ajustes cuando quieras cambiar Edenia. Aquí eliges tu objetivo semanal, idioma, preferencia de videos cortos, copias y archivos de sincronización.',
    'walkthrough.clickSettings': 'Abrir ajustes',
    'walkthrough.channels': 'Usa este botón de canales para añadir canales de YouTube y elegir cuáles aparecen en la lista. Pega una URL de canal, @handle o ID arriba del popup. La cruz pequeña junto a un canal seguido lo quita, y Deshacer puede recuperarlo.',
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
    'intro.skip': 'Passer l’introduction',
    'intro.sound.off': 'Son désactivé',
    'intro.sound.on': 'Son activé',
    'intro.opening.kicker': 'Votre monde d’apprentissage',
    'intro.opening.title': 'Chaque leçon compte.',
    'intro.purpose.kicker': 'Étudiez à votre façon',
    'intro.purpose.title': 'Transformez YouTube et Anki en progrès visible.',
    'intro.purpose.body': 'Regardez les chaînes que vous aimez, révisez vos cartes et laissez Edenia relier tous vos efforts.',
    'intro.purpose.progress': 'Points d’étude',
    'intro.purpose.watched': 'regardées',
    'intro.purpose.reviews': 'révisions',
    'intro.city.kicker': 'Le progrès devient un lieu',
    'intro.city.title': 'Étudiez.\nGagnez\u00a0des\u00a0points.\nFaites évoluer votre ville.',
    'intro.city.level': 'Niveau de la ville',
    'intro.features.history': 'Historique d’étude',
    'intro.features.week': 'Cette semaine',
    'intro.features.studied': 'étudiées',
    'intro.features.streak': 'jours de série',
    'intro.features.goal': 'Objectif',
    'intro.features.kicker': 'Voyez le chemin parcouru',
    'intro.features.title': 'Votre rythme, votre historique et votre élan en un coup d’œil.',
    'intro.features.body': 'Cartes d’activité, objectifs, séries et observations transforment votre historique en prochaine étape claire.',
    'intro.features.insightBody': 'Votre rythme récent se renforce. Reprenez la routine qui a permis cet élan.',
    'intro.finale.kicker': 'Un peu de progrès. Tout un monde.',
    'intro.finale.title': 'Qu’allez-vous construire ?',
    'intro.finale.body': 'Créez votre sélection d’étude et commencez votre Edenia.',
    'intro.finale.cta': 'Commencer mon voyage',
    'intro.finale.return': 'Retour à Edenia',
    'onboarding.progress': 'Étape {current} sur {total}',
    'onboarding.promise': 'Transformez Youtube et Anki en progrès visibles.',
    'onboarding.eyebrow': 'Rendez votre apprentissage visible',
    'onboarding.language.title': 'Quelle langue apprenez-vous ?',
    'onboarding.language.subtitle': 'Choisissez votre langue principale. Edenia créera une liste de départ ciblée ; vous pourrez ajouter d’autres chaînes plus tard.',
    'onboarding.language.hint': 'Choisissez une langue pour continuer.',
    'onboarding.level.title': 'Où en êtes-vous ?',
    'onboarding.channels.title': 'Votre liste d’étude de départ',
    'onboarding.channels.subtitle': 'Sélectionnez jusqu’à 5 chaînes. Vous pourrez les modifier à tout moment par la suite.',
    'onboarding.channels.selected': '{count} sélectionnées',
    'onboarding.channels.limit': 'Vous pouvez sélectionner jusqu’à {count} chaînes. Désélectionnez-en une pour en ajouter une autre.',
    'onboarding.channels.none': 'Aucune chaîne de départ ne correspond encore à cette combinaison. Vous pouvez continuer et ajouter les vôtres.',
    'onboarding.continue': 'Continuer',
    'onboarding.back': 'Retour',
    'onboarding.build': 'Commencer mon parcours',
    'onboarding.building': 'Préparation de votre parcours…',
    'onboarding.private': 'Aucun compte requis · Votre progression réelle reste dans ce navigateur',
    'onboarding.channelIssue': '{count} chaînes de départ n’ont pas pu être ajoutées. Vous pourrez les ajouter manuellement plus tard.',
    'onboarding.videoIssue': 'Les chaînes ont été ajoutées, mais leurs vidéos récentes n’ont pas encore pu être chargées. Vérifiez l’accès à YouTube, puis réessayez.',
    'onboarding.language.mandarin': 'Chinois mandarin',
    'onboarding.language.japanese': 'Japonais',
    'onboarding.language.korean': 'Coréen',
    'onboarding.language.spanish': 'Espagnol',
    'onboarding.language.french': 'Français',
    'onboarding.language.german': 'Allemand',
    'onboarding.language.english': 'Anglais',
    'onboarding.language.other': 'Autre',
    'onboarding.other.title': 'Toutes les langues ont leur place ici',
    'onboarding.other.subtitle': 'Edenia fonctionne avec toutes les langues. Une fois dans l’application, ajoutez les chaînes YouTube avec lesquelles vous souhaitez apprendre et créez une liste d’étude qui vous ressemble.',
    'onboarding.other.note': 'Aucune recommandation n’est nécessaire : vous pourrez choisir vos propres chaînes après être entré dans Edenia.',
    'onboarding.level.starting.label': 'Je débute',
    'onboarding.level.starting.detail': 'Je comprends encore très peu de choses.',
    'onboarding.level.beginner.label': 'Débutant',
    'onboarding.level.beginner.detail': 'Je connais des mots et des phrases simples.',
    'onboarding.level.intermediate.label': 'Intermédiaire',
    'onboarding.level.intermediate.detail': 'Je peux suivre du contenu pour apprenants et quelques ressources natives.',
    'onboarding.level.advanced.label': 'Avancé',
    'onboarding.level.advanced.detail': 'J’apprends surtout avec du contenu natif.',
    'onboarding.level.not-sure.label': 'Je ne sais pas',
    'onboarding.level.not-sure.detail': 'Proposez-moi une sélection de départ équilibrée.',
    'onboarding.channelStyle.casualConversations': 'Conversations informelles',
    'onboarding.channelStyle.clearExplanations': 'Explications claires',
    'onboarding.channelStyle.comprehensibleInput': 'Input compréhensible',
    'onboarding.channelStyle.conversationsInterviews': 'Conversations et interviews',
    'onboarding.channelStyle.conversationsStories': 'Conversations et histoires',
    'onboarding.channelStyle.detailedLessons': 'Leçons détaillées',
    'onboarding.channelStyle.filmTechnology': 'Cinéma et technologie',
    'onboarding.channelStyle.lessonsConversations': 'Leçons et conversations',
    'onboarding.channelStyle.nativeEntertainment': 'Divertissement natif',
    'onboarding.channelStyle.naturalMandarin': 'Mandarin naturel',
    'onboarding.channelStyle.newsCommentary': 'Actualités et commentaires',
    'onboarding.channelStyle.podcast': 'Podcast',
    'onboarding.channelStyle.psychologyConversations': 'Psychologie et conversations',
    'onboarding.channelStyle.streetInterviews': 'Interviews de rue',
    'onboarding.channelStyle.structuredLessons': 'Leçons structurées',
    'settings.title': 'Réglages',
    'settings.close': 'Fermer les réglages',
    'settings.language.label': 'Langue',
    'settings.weeklyGoal.label': 'Objectif hebdomadaire (heures)',
    'settings.channels.label': 'Chaînes',
    'settings.channels.placeholder': 'Channel URL or @',
    'settings.channels.add': 'Ajouter',
    'settings.channels.hint': 'Collez une URL de chaîne YouTube, un @handle ou un ID de chaîne. Exemples conseillés : youtube.com/@channel ou youtube.com/channel/UCxxxxxxxx.',
    'settings.shorts.label': 'Afficher les vidéos courtes',
    'settings.shorts.hint': 'Quand c’est désactivé, les vidéos de moins de 3 minutes sont ignorées au rafraîchissement et cachées de la liste active.',
    'settings.howto.title': 'Mode d’emploi',
    'settings.youtube.title': 'Ajouter une chaîne YouTube',
    'settings.youtube.intro': 'Ajoutez une chaîne en copiant son URL YouTube. Vous pouvez aussi utiliser son @handle.',
    'settings.youtube.step1': 'Sur YouTube, ouvrez la chaîne souhaitée et copiez son URL depuis la barre d’adresse du navigateur.',
    'settings.youtube.step2': 'Dans Edenia, ouvrez Ajouter au-dessus de votre liste de vidéos et collez l’URL.',
    'settings.youtube.step3': 'Cliquez sur Ajouter pour intégrer la chaîne à votre fil d’étude.',
    'settings.anki.whatTitle': 'Qu’est-ce qu’Anki ?',
    'settings.anki.whatIntro': 'Anki est une application de cartes mémoire qui programme les révisions pour vous aider à retenir des mots et des idées dans le temps. Utiliser Anki avec Edenia est facultatif.',
    'settings.anki.title': 'Connecter Anki',
    'settings.anki.enabled': 'Activer le suivi Anki',
    'settings.anki.toggleHint': 'Quand il est activé, Edenia peut lire vos révisions Anki pendant qu’Anki est ouvert.',
    'settings.insights.enabled': 'Activer les observations d’étude',
    'settings.insights.toggleHint': 'Contrôle l’affichage des observations dans Analyses. Le suivi et l’historique continuent lorsqu’elles sont masquées.',
    'settings.anki.intro': 'Edenia peut compter automatiquement vos révisions Anki. Pour permettre à Edenia de communiquer avec Anki, installez AnkiConnect et autorisez Edenia dans ses réglages.',
    'settings.anki.step1': 'Ouvrez Anki. Dans Tools, cliquez sur Add-ons, puis Get Add-ons, puis collez ce code : 2055492159.',
    'settings.anki.step2': 'Après avoir redémarré Anki, retournez dans Tools, Add-ons, cliquez sur AnkiConnect, puis Config. Vérifiez que le texte ci-dessous est à la fin de la configuration.',
    'settings.anki.step3': 'Redémarrez Anki et gardez Anki ouvert pendant que vous utilisez Edenia.',
    'settings.anki.note': 'Edenia lit seulement votre nombre de révisions pour l’historique d’étude. Il ne modifie pas vos cartes Anki.',
    'settings.scoring.title': 'Fonctionnement des points',
    'settings.scoring.intro': 'Les points récompensent le temps d’étude en vidéo et les révisions Anki. Edenia arrondit chaque source vers le bas avant de l’ajouter à la journée.',
  'settings.scoring.video': 'Regarder 1 heure de vidéo donne 3 pts.',
  'settings.scoring.anki': '60 révisions Anki donnent 2 pts.',
  'settings.scoring.examples': 'Exemples :',
  'settings.scoring.exampleVideo': 'Regarder 30 min de vidéo donne 1 pts (1,5 arrondi vers le bas à 1).',
  'settings.scoring.exampleAnki': 'Faire 30 révisions Anki donne 1 pts, mais faire 29 révisions donne 0 pts (0,9 arrondi vers le bas à 0).',
  'settings.workflow.title': 'Flux Edenia typique',
  'settings.workflow.item1': 'Regardez les vidéos des chaînes que vous avez ajoutées.',
  'settings.workflow.item2': 'Utilisez Ajouter pour coller l’URL d’une vidéo ou d’une chaîne YouTube.',
  'settings.workflow.item3': 'Consultez vos études avec le résumé de l’historique et la carte thermique.',
  'settings.workflow.item4': 'Regardez votre ville grandir.',
    'settings.activity.title': 'Journal d’activité',
    'settings.activity.all': 'Tout',
    'settings.activity.user': 'Utilisateur',
    'settings.activity.auto': 'Auto',
    'settings.activity.issues': 'Problèmes',
    'settings.activity.points': 'Points',
    'activity.pointsLabel': 'Points',
    'activity.points.empty': 'Aucun point gagné pour le moment.',
    'activity.points.videoTitle': '{time} de {title} vues',
    'activity.points.ankiTitle': '{count} révisions Anki',
    'activity.points.unmarkTitle': '{title} retirée',
    'activity.points.undoTitle': 'Annuler : {title}',
    'activity.points.redoTitle': 'Rétablir : {title}',
    'settings.sync.export': 'Exporter le fichier',
    'settings.sync.import': 'Importer le fichier',
    'settings.sync.note': 'La progression est enregistrée dans ce navigateur. Utilisez les fichiers de synchronisation pour la copier sur un autre appareil ou navigateur.',
    'settings.walkthroughAgain': 'Revoir la visite guidée',
    'settings.trailerAgain': 'Revoir la bande-annonce',
    'settings.backups.title': 'Sauvegardes locales récentes',
    'settings.backups.note': 'Les sauvegardes locales aident après une mauvaise importation, une réinitialisation ou une erreur de sauvegarde. Exportez un fichier pour protéger vos données hors de ce navigateur.',
    'settings.reset.open': 'Tout réinitialiser',
    'settings.reset.warning': 'Cela effacera l’historique local, la série, les réglages et les statistiques Anki mises en cache. Une sauvegarde de retour arrière sera gardée ici. Votre collection Anki ne sera pas modifiée.',
    'settings.reset.cancel': 'Annuler',
    'settings.reset.delete': 'Supprimer les données',
    'toast.channelInvalid': 'Utilisez une URL de chaîne YouTube, un @handle ou un ID de chaîne UC',
    'toast.addChannelFirst': 'Ajoutez d’abord au moins une chaîne depuis le filtre de chaînes',
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
    'city.level.1': '🏠 Maison solitaire',
    'city.level.2': '⛵ Votre maison a fière allure ! Et il y a un bateau !',
    'city.level.3': '🏝️ Oh ! Une toute petite île ! Adorable.',
    'city.level.4': 'Les enfants vont pouvoir s’amuser maintenant !',
    'city.level.5': 'Ajoutons une piscine pour se détendre',
    'city.level.6': 'Oh ! Des amis arrivent dire bonjour...',
    'city.level.7': 'Vous avez agrandi votre petite île !',
    'city.level.8': 'Une belle chaise longue et de jolies fleurs ! 🌸',
    'city.level.9': 'Vous avez construit une jolie maison dans le jardin',
    'city.level.10': 'Oh wow ! Vous avez un voisin ! 🏠',
    'city.level.11': 'La petite maison violette a un joli jardin !',
    'city.level.12': 'Mince ! Un volcan est apparu ! Espérons qu’il n’entre pas en éruption...',
    'goal.title': 'Objectif hebdomadaire',
    'nextStudy.title': 'Continuer à regarder',
    'nextStudy.studyNext': 'À étudier ensuite',
    'nextStudy.resume': 'Reprendre la vidéo',
    'nextStudy.watch': 'Regarder',
    'nextStudy.notInterested': 'Pas intéressé',
    'nextStudy.unwatch': 'Marquer non vue',
    'nextStudy.continueShort': 'Continuer',
    'goal.watched': 'vues',
    'goal.inProgress': 'en cours',
    'goal.toGo': 'restant',
    'goal.pace.session': 'Une session de {minutes} minutes aujourd’hui vous permet de garder le rythme.',
    'goal.pace.longSession': 'Visez {time} aujourd’hui pour reprendre le bon rythme.',
    'goal.pace.onTrack': 'Vous êtes dans le bon rythme cette semaine.',
    'goal.pace.complete': 'Objectif hebdomadaire atteint. Bravo !',
    'insights.eyebrow': 'Observation d’étude',
    'insights.weekly.title': 'Votre semaine en bref',
    'insights.weekly.summary.zero': 'Aucun temps d’étude en vidéo n’a été enregistré cette semaine.',
    'insights.weekly.summary.one': 'Cette semaine, vous avez étudié {time} avec 1 vidéo.',
    'insights.weekly.summary.many': 'Cette semaine, vous avez étudié {time} avec {videos} vidéos.',
    'insights.weekly.channels': 'Par chaîne : {channels}.',
    'insights.weekly.noChannels': 'Aucun temps de visionnage par chaîne n’a été enregistré.',
    'insights.weekly.otherChannel': 'Autres chaînes',
    'insights.weekly.topVideo': 'Vidéo la plus regardée : {video} ({time})',
    'insights.weekly.activeDays': '{days} jours actifs',
    'insights.weekly.anki': 'Anki : {reviewed} révisées, {created} nouvelles',
    'insights.subject.study': 'travail',
    'insights.window.morning': 'matin',
    'insights.window.afternoon': 'après-midi',
    'insights.window.evening': 'soirée',
    'insights.window.night': 'fin de soirée',
    'insights.title.preferred-window': 'Préservez ce qui fonctionne déjà',
    'insights.body.preferred-window': 'Le créneau « {window} » est votre moment d’étude le plus fiable. Les jours chargés, essayez d’y préserver {minutes} minutes.',
    'insights.evidence.preferred-window': '{percent} % de votre étude en vidéo a eu lieu sur le créneau « {window} », pendant {days} jours actifs.',
    'insights.title.morning-opportunity': 'Une petite expérience matinale',
    'insights.body.morning-opportunity': 'Vous étudiez très rarement le matin. Une session de {subject} de {minutes} minutes pourrait-elle s’intégrer à votre routine matinale ?',
    'insights.evidence.morning-opportunity': 'Les sessions matinales ont représenté {percent} % de votre étude en vidéo pendant {days} jours actifs.',
    'insights.title.short-sessions': 'Les courtes sessions fonctionnent',
    'insights.body.short-sessions': 'Votre session habituelle en vidéo dure environ {minutes} minutes. Garder une option courte à portée de main peut faciliter la régularité.',
    'insights.evidence.short-sessions': '{sessions} sessions d’étude pendant {days} jours actifs.',
    'insights.title.preferred-window.alt': 'Protégez votre meilleur créneau',
    'insights.body.preferred-window.alt': 'Votre travail revient régulièrement sur le créneau « {window} ». Réservez-y au moins {minutes} minutes les jours chargés.',
    'insights.title.morning-opportunity.alt': 'Testez un autre début de journée',
    'insights.body.morning-opportunity.alt': 'Le matin reste presque inutilisé pour étudier. Essayez {minutes} minutes de {subject} et voyez si ce rythme vous convient.',
    'insights.title.short-sessions.alt': 'Votre rythme convient aux sessions compactes',
    'insights.body.short-sessions.alt': 'Vous progressez souvent par blocs d’environ {minutes} minutes. Considérez-les comme un vrai format, pas comme un plan de secours.',
    'insights.title.reliable-weekday': 'Faites du {weekday} votre point d’ancrage',
    'insights.body.reliable-weekday': 'Le {weekday} revient plus régulièrement que les autres jours. Protéger ce créneau peut stabiliser toute la semaine.',
    'insights.title.reliable-weekday.alt': 'Le {weekday} revient souvent',
    'insights.body.reliable-weekday.alt': 'Votre historique désigne le {weekday} comme un jour fiable. Organisez-vous autour de cette force avant d’ajouter des contraintes.',
    'insights.evidence.reliable-weekday': '{percent} % de vos jours d’étude actifs étaient des {weekday}.',
    'insights.title.weekend-opportunity': 'Laissez une petite place au week-end',
    'insights.body.weekend-opportunity': 'Le week-end est presque absent de votre rythme. Une session souple de {minutes} minutes peut éviter deux jours entièrement vides.',
    'insights.title.weekend-opportunity.alt': 'Prévoyez un plan B pour le week-end',
    'insights.body.weekend-opportunity.alt': 'Votre routine se concentre en semaine. Gardez une option sans pression de {minutes} minutes pour samedi ou dimanche.',
    'insights.evidence.weekend-opportunity': '{percent} % de votre étude en vidéo a eu lieu le week-end.',
    'insights.title.momentum-up': 'Votre élan se renforce',
    'insights.body.momentum-up': 'Votre temps d’étude a nettement augmenté ces deux dernières semaines. Gardez une prochaine étape familière pour tenir ce rythme.',
    'insights.title.momentum-up.alt': 'Les deux dernières semaines progressent',
    'insights.body.momentum-up.alt': 'Votre volume récent dépasse la période précédente. Répétez la routine qui a permis cette hausse.',
    'insights.evidence.momentum-up': 'Les 14 derniers jours totalisent {recentMinutes} minutes, soit {comparisonPercent} % de plus que les 14 jours précédents.',
    'insights.title.momentum-reset': 'Rendez la reprise plus petite',
    'insights.body.momentum-reset': 'Le temps d’étude récent a baissé. Reprenez avec une session simple de {minutes} minutes plutôt que de tout rattraper.',
    'insights.title.momentum-reset.alt': 'Réduisez l’effort pour commencer',
    'insights.body.momentum-reset.alt': 'Votre rythme récent est plus calme. Choisissez l’action de {minutes} minutes la plus facile et reconstruisez à partir de là.',
    'insights.evidence.momentum-reset': 'Les 14 derniers jours totalisent {recentMinutes} minutes, soit {comparisonPercent} % de moins que les 14 jours précédents.',
    'insights.title.long-sessions': 'Ajoutez un filet de sécurité court',
    'insights.body.long-sessions': 'Votre session habituelle dure environ {minutes} minutes. Les jours chargés, une option de {suggestedMinutes} minutes peut préserver la continuité.',
    'insights.title.long-sessions.alt': 'Gardez une version plus légère',
    'insights.body.long-sessions.alt': 'Vous travaillez souvent par blocs d’environ {minutes} minutes. Définissez une version réduite pour les jours où ce bloc ne tient pas.',
    'insights.evidence.long-sessions': '{sessions} sessions sur {days} jours actifs ; la session habituelle durait {typicalMinutes} minutes.',
    'insights.title.anki-fallback': 'Gardez une option de 15 cartes',
    'insights.body.anki-fallback': 'Pas le temps de regarder une vidéo aujourd’hui ? Réviser 15 cartes Anki entretient la langue et maintient l’habitude.',
    'insights.title.anki-fallback.alt': 'Une petite révision compte aussi',
    'insights.body.anki-fallback.alt': 'Quand une vidéo ne tient pas dans la journée, essayez 15 cartes Anki. Une journée plus légère fait aussi partie du processus.',
    'insights.evidence.anki-fallback': 'Vous avez révisé {reviewedCards} cartes pendant {ankiDays} jours sur cette période.',
    'insights.title.steady-process': 'Pensez en saisons, pas en journées',
    'insights.body.steady-process': 'Apprendre une langue est un engagement à long terme. Un contact régulier compte plus qu’une journée parfaite.',
    'insights.title.steady-process.alt': 'Laissez la régularité faire son travail',
    'insights.body.steady-process.alt': 'L’aisance grandit grâce à des sessions ordinaires répétées dans le temps. Choisissez toujours la prochaine étape durable.',
    'insights.evidence.steady-process': '{days} jours d’étude actifs au cours des {observationDays} derniers jours.',
    'insights.collapse': 'Réduire les observations d’étude',
    'insights.reopen': 'Observations',
    'insights.reopen.aria': 'Afficher les observations d’étude',
    'insights.tabs.aria': 'Vues des observations d’étude',
    'insights.tab.current': 'Actuelle',
    'insights.tab.previous': 'Précédentes',
    'insights.previous.aria': 'Afficher {count} observations précédentes',
    'insights.previous.empty': 'Les anciennes observations apparaîtront ici lorsque votre rythme d’étude évoluera.',
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
    'history.heatmap.less': 'Moins',
    'history.heatmap.more': 'Plus',
    'history.heatmap.legend': 'Intensité des études',
    'history.showPoints': 'Afficher les points gagnés le {date}',
    'history.pointsDialog': 'Détail des points',
    'history.pointsAnkiReviews': 'Révisions Anki',
    'history.pointsReviewsCount': '{count} révisions',
    'history.pointsDailyTotal': 'Total du jour',
    'history.pointsRounding': 'arrondi vers le bas',
    'history.pointsNone': 'Aucun point gagné',
    'history.heatmapAria': '{date} : {points} points ; {time} de vidéo ; {videos} vidéos vues ; {reviewed} cartes Anki révisées ; {created} nouvelles cartes Anki',
    'history.heatmapAriaNoAnki': '{date} : {points} points ; {time} de vidéo ; {videos} vidéos vues',
    'history.tooltip.points': '{count} pts',
    'history.today': 'Aujourd’hui',
    'history.yesterday': 'Hier',
    'videos.title': 'À regarder',
    'videos.status.label': 'Statut des vidéos',
    'videos.channel.oneVideo': '1 vidéo',
    'videos.channel.videoCount': '{count} vidéos',
    'videos.channel.shelfLabel': 'Vidéos de {channel}',
    'videos.channel.previousLabel': 'Faire défiler les vidéos de {channel} vers la gauche',
    'videos.channel.nextLabel': 'Faire défiler les vidéos de {channel} vers la droite',
    'videos.channel.dragLabel': 'Réorganiser {channel}',
    'videos.status.all': 'Tout',
    'videos.status.watchLater': 'À voir',
    'videos.status.unwatched': 'Non vue',
    'videos.status.partial': 'En cours',
    'videos.status.watched': 'Vue',
    'videos.channels.all': 'Toutes les chaînes',
    'videos.channels.manage': 'Gérer les chaînes',
    'videos.channels.add': 'Ajouter des chaînes',
    'videos.channels.none': 'Aucune chaîne',
    'videos.manual.button': 'Ajouter',
    'videos.manual.hint': 'Vous pouvez coller ici l’URL d’une vidéo ou d’une chaîne YouTube.',
    'videos.manual.add': 'Ajouter',
    'videos.undo': 'Annuler',
    'videos.redo': 'Rétablir',
    'videos.undo.empty': 'Rien à annuler',
    'videos.redo.empty': 'Rien à rétablir',
    'videos.undo.queue': 'File d’annulation',
    'videos.redo.queue': 'File de rétablissement',
    'videos.undo.title': 'Annuler la dernière action',
    'videos.redo.title': 'Rétablir la dernière action',
    'videos.watchedSection': 'Vues',
    'videos.watched.show': 'Afficher les vidéos regardées',
    'videos.watched.hide': 'Masquer les vidéos regardées',
    'videos.empty.default': 'Votre liste d’étude est prête à s’enrichir. Ajoutez une chaîne YouTube ou collez une vidéo pour commencer.',
    'videos.search.empty': 'Recherchez les vidéos enregistrées par titre ou chaîne.',
    'videos.card.markWatched': 'Marquer vue',
    'videos.card.new': 'Nouveau',
    'videos.card.unmark': 'Retirer',
    'videos.card.resume': 'Continuer',
    'videos.card.continueAt': 'Reprendre à',
    'videos.card.removeFromGrid': 'Retirer de la liste',
    'activity.empty': 'Aucune activité enregistrée',
    'activity.showOlder': 'Afficher les plus anciennes',
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
    'points.one': '{count} pts',
    'points.many': '{count} pts',
    'city.timelineAria': '{date}, {points} pts{changed}',
    'city.timelineChanged': ', image de ville modifiée',
    'time.notYet': 'Pas encore',
    'time.justNow': 'à l’instant',
    'time.notRefreshedYet': 'Pas encore actualisé',
    'time.lastRefreshed': 'Dernière actualisation : {time}',
    'toast.localeChanged': 'Langue changée en {language}',
    'toast.nothingRedo': 'Rien à rétablir',
    'toast.nothingUndo': 'Rien à annuler',
    'toast.videoRemovedFromGrid': 'Retirée de la liste des vidéos',
    'undo.removed': '{verb} le changement : "{title}" a été supprimé.',
    'undo.backTo': '{verb} le changement : "{title}" revient à {status}.',
    'undo.redid': 'Rétabli',
    'undo.undid': 'Annulé',
    'undo.backToStatus': '{from} -> retour à {to}',
    'undo.statusChange': '{from} -> {to}',
    'undo.continueAtBack': 'Reprendre à {from} -> retour à {to}',
    'undo.continueAtChange': 'Reprendre à {from} -> {to}',
    'undo.continueAtSet': '{verb} le changement : "{title}" reprend à {time}.',
    'undo.timeUnavailable': 'Heure indisponible',
    'undo.doneAt': 'Fait {time}',
    'undo.logUndoTitle': 'Action annulée',
    'undo.logRedoTitle': 'Action rétablie',
    'undo.restoreChannel': 'Restaurer la chaîne',
    'undo.removeChannelAgain': 'Retirer la chaîne à nouveau',
    'undo.channelRestored': 'Chaîne restaurée : {name}',
    'undo.channelRemoved': 'Chaîne retirée à nouveau : {name}',
    'undo.restoreVideo': 'Restaurer dans la liste des vidéos',
    'undo.removeVideoAgain': 'Retirer à nouveau de la liste des vidéos',
    'undo.videoRestored': 'Restaurée dans la liste des vidéos : {title}',
    'undo.videoRemoved': 'Retirée à nouveau de la liste des vidéos : {title}',
    'undo.restoreAddedVideoAndChannel': 'Restaurer la vidéo ajoutée et sa chaîne',
    'undo.restoreAddedVideo': 'Restaurer la vidéo ajoutée',
    'undo.removeAddedVideoAndChannel': 'Retirer la vidéo ajoutée et sa chaîne',
    'undo.removeAddedVideo': 'Retirer la vidéo ajoutée',
    'undo.addedVideoAndChannelRestored': 'La vidéo ajoutée « {title} » et la chaîne {channel} ont été restaurées.',
    'undo.addedVideoRestored': 'Vidéo ajoutée restaurée : « {title} ».',
    'undo.addedVideoAndChannelRemoved': 'La vidéo ajoutée « {title} » et la chaîne {channel} ont été retirées.',
    'undo.addedVideoRemoved': 'Vidéo ajoutée retirée : « {title} ».',
    'log.videoRemovedFromGrid': 'Vidéo retirée de la liste',
    'walkthrough.next': 'Suivant',
    'walkthrough.back': 'Retour',
    'walkthrough.skip': 'Passer',
    'walkthrough.done': 'Terminé',
    'walkthrough.close': 'Fermer la visite guidée',
    'walkthrough.progress': '{current} / {total}',
    'walkthrough.town': 'Voici votre ville flottante. Quand vous étudiez, elle grandit peu à peu. Elle donne une image rapide de vos progrès sans lire tous les chiffres.',
    'walkthrough.weeklyGoal': 'Voici votre objectif hebdomadaire. Le temps de vidéos étudiées remplit la barre, pour voir vite si vous êtes sur la bonne voie.',
    'walkthrough.studyHistory': 'L’historique d’étude montre ce qui s’est passé au fil du temps. Il réunit les vidéos vues et les révisions Anki pour montrer votre vrai rythme.',
    'walkthrough.historyViews': 'Utilisez Résumé pour des chiffres clairs, et Carte pour voir vos jours actifs en un coup d’œil. Edenia mémorise votre vue préférée.',
    'walkthrough.videos': 'Voici la zone des vidéos. Les nouvelles vidéos de vos chaînes apparaissent ici, et les vidéos vues passent dans la section Vues.',
    'walkthrough.videosMobile': 'Voici la zone des vidéos. Les nouvelles vidéos de vos chaînes apparaissent ici. Quand vous en marquez une comme vue, Edenia la déplace dans une section Vues pour garder la liste active claire.',
    'walkthrough.firstStudyChannels': 'Vous pouvez ajouter ici des chaînes YouTube ou des vidéos individuelles.',
    'walkthrough.otherAddNow': 'Ajoutez maintenant une chaîne ou une vidéo YouTube !',
    'walkthrough.firstStudyFeed': 'Voici votre liste d’étude. Choisissez une vidéo, puis marquez-la comme vue, en cours ou à regarder plus tard. Votre objectif, votre historique et votre ville évoluent selon ce que vous étudiez.',
    'walkthrough.startWatching': 'Commencez à regarder une vidéo !',
    'walkthrough.videoFilters': 'Ces contrôles gardent la liste lisible. Vous pouvez filtrer par statut, par chaîne, ajouter une URL de vidéo et corriger les erreurs.',
    'walkthrough.manualWatchedUrl': 'Utilisez Ajouter pour coller l’URL d’une vidéo ou d’une chaîne YouTube. Edenia reconnaîtra le type de lien.',
    'walkthrough.undoRedo': 'Annuler et Rétablir aident après un clic accidentel. Ouvrez la liste, choisissez l’action, et Edenia recalculera le score et l’historique.',
    'walkthrough.settings': 'Cliquez sur Réglages pour ajuster Edenia. Vous pouvez y choisir votre objectif hebdomadaire, la langue, les vidéos courtes, les sauvegardes et les fichiers de synchronisation.',
    'walkthrough.clickSettings': 'Ouvrir les réglages',
    'walkthrough.channels': 'Utilisez ce bouton de chaînes pour ajouter des chaînes YouTube et choisir celles qui apparaissent dans la liste. Collez une URL de chaîne, un @handle ou un ID en haut du popup. La petite croix à côté d’une chaîne suivie la retire, et Annuler peut la restaurer.',
    'walkthrough.shortVideos': 'Ce réglage contrôle les vidéos courtes. Désactivez-le pour ignorer et cacher les vidéos de moins de 3 minutes.',
    'walkthrough.settingsWeeklyGoal': 'Vous pouvez changer votre objectif hebdomadaire ici. Cela change seulement la cible, sans effacer votre historique.',
    'walkthrough.syncFiles': 'Les fichiers de synchronisation déplacent votre progression vers un autre navigateur ou appareil. Exportez ici, puis importez ailleurs.',
    'walkthrough.localBackups': 'Les sauvegardes locales récentes aident après une importation, une restauration, une réinitialisation ou une mauvaise sauvegarde.',
    'walkthrough.activityLog': 'Le journal d’activité garde une trace calme de ce qui arrive : actions, actualisations YouTube, Anki, importations et problèmes.',
    'walkthrough.replay': 'Pour revoir cette visite, utilisez Revoir la visite guidée. C’est utile après de nouvelles fonctions ou pour partager Edenia.',
    'walkthrough.resetSafety': 'Tout réinitialiser recommence à zéro, mais Edenia garde d’abord une sauvegarde de retour arrière. Utilisez-le avec prudence et exportez un fichier pour protéger vos données hors du navigateur.'
  }
}

Object.assign(I18N['zh-Hant'], {
  'app.title.sandbox': '沙盒版 - Edenia',
  'videoReminder.tabTitle': '✓ 標記為已觀看 · Edenia',
  'videoReminder.aria': '影片觀看提醒',
  'videoReminder.eyebrow': '快速確認',
  'videoReminder.question': '看完這部影片了嗎？將它標記為已觀看！',
  'videoReminder.markWatched': '標記為已觀看',
  'videoReminder.notYet': '還沒有',
  'settings.remove': '移除',
  'header.settings': '設定',
  'city.imageAlt': '學習城鎮里程碑：孤單的小屋',
  'city.zoom.controls': '城鎮縮放控制',
  'city.zoom.out': '縮小',
  'city.zoom.reset': '重設視圖',
  'city.zoom.in': '放大',
  'city.timeline': '城鎮歷史時間軸',
  'city.timeline.today': '今天',
  'history.viewLabel': '學習歷史視圖',
  'history.rangeLabel': '學習歷史範圍',
  'history.selectWeek': '選擇週次',
  'history.availableWeeks': '可選週次',
  'history.selectMonth': '選擇月份',
  'history.availableMonths': '可選月份',
  'history.showWatched': '顯示 {date} 已觀看的 {count} 部影片',
  'history.watchedDialog': '已觀看影片',
  'history.weekdays.mon': '週一',
  'history.weekdays.tue': '週二',
  'history.weekdays.wed': '週三',
  'history.weekdays.thu': '週四',
  'history.weekdays.fri': '週五',
  'history.weekdays.sat': '週六',
  'history.weekdays.sun': '週日',
  'videos.status.previous': '先前狀態',
  'videos.channels.one': '1 個頻道',
  'videos.channels.count': '{count} 個頻道',
  'videos.manual.placeholder': 'YouTube 影片或頻道網址',
  'videos.manual.adding': '新增中…',
  'videos.empty.filtered': '沒有符合「{filter}」{channelText}的影片。',
  'videos.empty.selectedChannels': '（已選頻道）',
  'videos.filter.active': '使用中',
  'videos.filter.inProgress': '進行中',
  'videos.filter.watchLater': '稍後觀看',
  'videos.search.untitled': '未命名影片',
  'videos.search.youtube': 'YouTube',
  'videos.card.markProgress': '標記為進行中',
  'videos.card.removeWatchLater': '從稍後觀看移除',
  'videos.card.watchLater': '稍後觀看',
  'videos.card.timestampLabel': '繼續播放時間',
  'videos.card.inProgressRibbon': '進行中',
  'videos.refreshing': '刷新中…',
  'videos.refresh': '刷新',
  'activity.error': '錯誤',
  'activity.warn': '警告',
  'activity.info': '資訊',
  'backups.unknownTime': '時間不明',
  'backups.automatic': '自動備份',
  'backups.reason.automaticCleanup': '自動清理前',
  'backups.reason.sandboxReset': '沙盒重設前',
  'backups.reason.syncImport': '匯入同步檔前',
  'backups.reason.backupRestore': '還原備份前',
  'backups.reason.reset': '全部重置前',
  'sandbox.channel.focus': '沙盒專注',
  'sandbox.channel.memory': '沙盒記憶',
  'sandbox.channel.projects': '沙盒專案',
  'sandbox.video.addedDay': '沙盒新增學習日 {date}.{index}',
  'sandbox.video.upcoming': '沙盒即將學習的課程 {date}',
  'sandbox.video.recent': '沙盒近期課程 {channel}.{index}',
  'toast.sandboxMode': '沙盒模式已啟用。變更不會影響一般資料。',
  'toast.sandboxReset': '沙盒資料已重設',
  'toast.sandboxDayAdded': '已新增沙盒學習日期：{date}',
  'toast.dummyVideosLoaded': '已載入 {count} 部示範影片',
  'toast.nothingToSync': '目前沒有可匯出的進度',
  'toast.syncExported': '同步檔已匯出',
  'toast.invalidSync': '這不是有效的 Edenia 同步檔',
  'toast.useSandboxSync': '請在沙盒版匯入這個沙盒同步檔',
  'toast.useNormalSync': '請在一般版匯入這個同步檔',
  'toast.importFailed': '無法匯入同步檔',
  'toast.syncImported': '同步檔已匯入',
  'toast.readSyncFailed': '無法讀取同步檔',
  'toast.backupUnavailable': '找不到這個備份',
  'toast.backupRestored': '備份已還原',
  'toast.channelDuplicate': '這個頻道已經加入',
  'toast.channelAdded': '已加入 {name}',
  'toast.channelAddedNoKey': '已加入 {name}。設定 YouTube API 金鑰後即可載入影片。',
  'toast.channelAddedLoading': '已加入 {name}，正在載入影片…',
  'toast.apiKeyMissing': '請先設定 YouTube API 金鑰',
  'toast.nextRefresh': '可在 {time} 後再次刷新',
  'toast.refreshFailedChannels': '{count} 個頻道刷新失敗',
  'toast.refreshLoadedWithErrors': '已載入 {count} 部影片{shorts}，但有 {errors} 個頻道失敗',
  'toast.refreshLoaded': '已從 {channels} 個頻道載入 {count} 部影片{shorts}',
  'toast.refreshFailed': '刷新失敗：{message}',
  'toast.channelLoaded': '已從 {name} 載入 {count} 部影片{shorts}',
  'toast.channelAddLoadFailed': '頻道已加入，但影片載入失敗：{message}',
  'toast.validYoutubeUrl': '請貼上有效的 YouTube 影片或頻道網址',
  'toast.videoNotFound': '找不到這個網址對應的 YouTube 影片',
  'toast.alreadyWatched': '這部影片已標記為已觀看',
  'toast.watchCooldown': '再過 {time} 就能將這部影片標記為已觀看',
  'toast.addedWatchedVideo': '已加入並標記為已觀看：{title}',
  'toast.addVideoFailed': '無法新增影片',
  'toast.timestampFormat': '請使用 HH:MM:SS 或 MM:SS 格式',
  'toast.videoGone': '找不到這部影片',
  'toast.watchedHidden': '已觀看影片會顯示在學習歷史中',
  'toast.couldNotShowVideo': '無法顯示這部影片',
  'toast.levelUp': '城鎮升級：{label}',
  'toast.skippedShorts': '，已略過 {count} 部短影片',
  'toast.skippedShortsSettingsHint': '；已擷取 {count} 部短影片，但已將其篩除。如要顯示，請在設定中啟用「顯示短影片」',
  'toast.shortsRefetching': '正在重新整理所有頻道以載入短影片…',
  'anki.unavailableOpen': '請開啟 Anki，讓 Edenia 讀取今天的複習資料。',
  'anki.blockedHosted': '瀏覽器封鎖了本機 Anki 連線。請在 localhost 使用 Edenia，或允許此連線。',
  'anki.failed': 'Anki 連線失敗：{message}',
  'anki.notAvailable': '目前無法使用 Anki',
  'log.weeklyGoal.title': '每週目標已變更',
  'log.weeklyGoal.detail': '從 {from} 小時改為 {to} 小時',
  'log.shortVideos.title': '短影片設定已變更',
  'log.shortVideos.shown': '顯示短影片。',
  'log.shortVideos.hidden': '隱藏短影片。',
  'log.theme.title': '主題已變更',
  'log.theme.dark': '已啟用深色主題。',
  'log.theme.light': '已啟用淺色主題。',
  'log.locale.title': '語言已變更',
  'log.locale.detail': '語言已設為 {language}。',
  'log.onboarding.title': '已建立入門學習清單',
  'log.onboarding.detail': '{language} · {level} · {count} 個頻道',
  'log.onboarding.otherDetail': '{language} · 自行選擇頻道',
  'log.sandboxReset.title': '沙盒已重設',
  'log.sandboxReset.detail': '保留回復備份後，沙盒進度已重設。',
  'log.ankiSetting.title': 'Anki 設定已變更',
  'log.ankiSetting.enabled': '已啟用 Anki 追蹤。',
  'log.ankiSetting.disabled': '已停用 Anki 追蹤。',
  'log.insightsSetting.title': '學習洞察設定已變更',
  'log.insightsSetting.shown': '顯示學習洞察。',
  'log.insightsSetting.hidden': '隱藏學習洞察。',
  'log.rollback.title': '已建立回復備份',
  'log.rollback.beforeImport': '匯入同步檔前已儲存本機備份。',
  'log.rollback.beforeRestore': '還原其他備份前已儲存本機備份。',
  'log.syncImported.title': '同步檔已匯入',
  'log.syncImported.detail': '已從同步檔匯入進度。',
  'log.backupRestored.title': '備份已還原',
  'log.channelAdded.title': '頻道已加入',
  'log.channelRemoved.title': '頻道已移除',
  'log.reset.title': '全部重置',
  'log.reset.detail': '保留回復備份後已重新開始。',
  'log.shortsChecked.title': '短影片檢查完成',
  'log.shortsChecked.detail': '已檢查 {checked} 部已儲存影片；找到 {shorts} 部短影片。',
  'log.shortsCheckFailed.title': '短影片檢查失敗',
  'log.shortsCheckFailed.detail': '無法檢查已儲存的短影片。',
  'log.channelRefreshed.title': 'YouTube 頻道已刷新',
  'log.channelRefreshed.fetched': '{name}：已取得 {count} 部影片。',
  'log.channelRefreshed.loaded': '{name}：已載入 {count} 部影片。',
  'log.channelRefreshFailed.title': 'YouTube 頻道刷新失敗',
  'log.unknownError': '未知錯誤',
  'log.shortsSkipped.title': '已略過短影片',
  'log.shortsSkipped.detail': '刷新時略過了 {count} 部短影片。',
  'log.refreshFailed.title': 'YouTube 刷新失敗',
  'log.unknownRefreshError': '未知的刷新錯誤',
  'log.videoStatus.title': '影片狀態已變更',
  'log.videoStatus.detail': '「{title}」現在是{status}。',
  'log.videoAdded.title': '已加入影片網址',
  'log.videoAdded.detail': '「{title}」已加入影片清單。',
  'log.ankiRefreshFailed.title': 'Anki 刷新失敗',
  'log.ankiStats.title': 'Anki 統計已刷新',
  'log.ankiStats.detail': '今天追蹤到 {reviewed} 次複習，並找到 {created} 張新卡片。',
  'log.levelUp.title': '已領取城鎮升級'
})

Object.assign(I18N['zh-Hans'], {
  'app.title.sandbox': '沙盒版 - Edenia',
  'videoReminder.tabTitle': '✓ 标记为已观看 · Edenia',
  'videoReminder.aria': '视频观看提醒',
  'videoReminder.eyebrow': '快速确认',
  'videoReminder.question': '看完这个视频了吗？将它标记为已观看！',
  'videoReminder.markWatched': '标记为已观看',
  'videoReminder.notYet': '还没有',
  'settings.activity.filtersLabel': '活动记录筛选',
  'settings.remove': '移除',
  'header.search.dialog': '搜索已保存的视频',
  'header.settings': '设置',
  'city.imageAlt': '学习城镇里程碑：孤单的小屋',
  'city.zoom.controls': '城镇缩放控制',
  'city.zoom.out': '缩小',
  'city.zoom.reset': '重置视图',
  'city.zoom.in': '放大',
  'city.timeline': '城镇历史时间轴',
  'city.timeline.today': '今天',
  'history.viewLabel': '学习历史视图',
  'history.rangeLabel': '学习历史范围',
  'history.selectWeek': '选择周次',
  'history.availableWeeks': '可选周次',
  'history.selectMonth': '选择月份',
  'history.availableMonths': '可选月份',
  'history.table.anki': 'Anki',
  'history.noActivityMap': '还没有可显示的活动。',
  'history.noActivityYet': '还没有活动',
  'history.showWatched': '显示 {date} 已观看的 {count} 个视频',
  'history.watchedDialog': '已观看视频',
  'history.today': '今天',
  'history.yesterday': '昨天',
  'history.weekdays.mon': '周一',
  'history.weekdays.tue': '周二',
  'history.weekdays.wed': '周三',
  'history.weekdays.thu': '周四',
  'history.weekdays.fri': '周五',
  'history.weekdays.sat': '周六',
  'history.weekdays.sun': '周日',
  'history.tooltip.videoTime': '视频时间',
  'history.tooltip.videosWatched': '已观看视频',
  'history.tooltip.ankiReviewed': 'Anki 已复习',
  'history.tooltip.ankiCreated': 'Anki 新建卡片',
  'videos.status.previous': '之前状态',
  'videos.channels.one': '1 个频道',
  'videos.channels.count': '{count} 个频道',
  'videos.manual.dialog': '添加 YouTube 视频或频道',
  'videos.manual.placeholder': 'YouTube 视频或频道网址',
  'videos.manual.adding': '添加中…',
  'videos.empty.activeBelow': '当前筛选条件下没有视频。',
  'videos.empty.filtered': '没有符合“{filter}”{channelText}的视频。',
  'videos.empty.selectedChannels': '（已选频道）',
  'videos.filter.active': '使用中',
  'videos.filter.inProgress': '进行中',
  'videos.filter.watchLater': '稍后观看',
  'videos.search.noMatches': '没有匹配的视频',
  'videos.search.untitled': '未命名视频',
  'videos.search.youtube': 'YouTube',
  'videos.card.markWatchedTitle': '标记为已观看',
  'videos.card.clear': '清除状态',
  'videos.card.markProgress': '标记为进行中',
  'videos.card.removeWatchLater': '从稍后观看移除',
  'videos.card.watchLater': '稍后观看',
  'videos.card.timestampLabel': '继续播放时间',
  'videos.card.inProgressRibbon': '进行中',
  'videos.refreshing': '刷新中…',
  'videos.refresh': '刷新',
  'activity.auto': '自动',
  'activity.user': '用户',
  'activity.error': '错误',
  'activity.warn': '警告',
  'activity.done': '完成',
  'activity.info': '信息',
  'backups.unknownTime': '时间未知',
  'backups.automatic': '自动备份',
  'backups.reason.automaticCleanup': '自动清理前',
  'backups.reason.sandboxReset': '沙盒重置前',
  'backups.reason.syncImport': '导入同步文件前',
  'backups.reason.backupRestore': '恢复备份前',
  'backups.reason.reset': '全部重置前',
  'sandbox.channel.focus': '沙盒专注',
  'sandbox.channel.memory': '沙盒记忆',
  'sandbox.channel.projects': '沙盒项目',
  'sandbox.video.addedDay': '沙盒添加学习日 {date}.{index}',
  'sandbox.video.upcoming': '沙盒即将学习的课程 {date}',
  'sandbox.video.recent': '沙盒近期课程 {channel}.{index}',
  'toast.sandboxMode': '沙盒模式已启用。更改不会影响普通数据。',
  'toast.sandboxReset': '沙盒数据已重置',
  'toast.sandboxDayAdded': '已添加沙盒学习日期：{date}',
  'toast.dummyVideosLoaded': '已加载 {count} 个示例视频',
  'toast.nothingToSync': '目前没有可导出的进度',
  'toast.syncExported': '同步文件已导出',
  'toast.invalidSync': '这不是有效的 Edenia 同步文件',
  'toast.useSandboxSync': '请在沙盒版中导入这个沙盒同步文件',
  'toast.useNormalSync': '请在普通版中导入这个同步文件',
  'toast.importFailed': '无法导入同步文件',
  'toast.syncImported': '同步文件已导入',
  'toast.readSyncFailed': '无法读取同步文件',
  'toast.backupUnavailable': '找不到这个备份',
  'toast.backupRestored': '备份已恢复',
  'toast.channelDuplicate': '这个频道已经添加',
  'toast.channelAdded': '已添加 {name}',
  'toast.channelAddedNoKey': '已添加 {name}。设置 YouTube API 密钥后即可加载视频。',
  'toast.channelAddedLoading': '已添加 {name}，正在加载视频…',
  'toast.apiKeyMissing': '请先设置 YouTube API 密钥',
  'toast.nextRefresh': '可在 {time} 后再次刷新',
  'toast.refreshFailedChannels': '{count} 个频道刷新失败',
  'toast.refreshLoadedWithErrors': '已加载 {count} 个视频{shorts}，但有 {errors} 个频道失败',
  'toast.refreshLoaded': '已从 {channels} 个频道加载 {count} 个视频{shorts}',
  'toast.refreshFailed': '刷新失败：{message}',
  'toast.channelLoaded': '已从 {name} 加载 {count} 个视频{shorts}',
  'toast.channelAddLoadFailed': '频道已添加，但视频加载失败：{message}',
  'toast.validYoutubeUrl': '请粘贴有效的 YouTube 视频或频道网址',
  'toast.videoNotFound': '找不到这个网址对应的 YouTube 视频',
  'toast.alreadyWatched': '这个视频已标记为已观看',
  'toast.watchCooldown': '再过 {time} 就能将这个视频标记为已观看',
  'toast.addedWatchedVideo': '已添加并标记为已观看：{title}',
  'toast.addVideoFailed': '无法添加视频',
  'toast.timestampFormat': '请使用 HH:MM:SS 或 MM:SS 格式',
  'toast.videoGone': '找不到这个视频',
  'toast.watchedHidden': '已观看视频会显示在学习历史中',
  'toast.couldNotShowVideo': '无法显示这个视频',
  'toast.levelUp': '城镇升级：{label}',
  'toast.skippedShorts': '，已跳过 {count} 个短视频',
  'toast.skippedShortsSettingsHint': '；已获取 {count} 个短视频，但已将其过滤。如要显示，请在设置中启用“显示短视频”',
  'toast.shortsRefetching': '正在刷新所有频道以加载短视频…',
  'anki.unavailableOpen': '请打开 Anki，让 Edenia 读取今天的复习数据。',
  'anki.blockedHosted': '浏览器阻止了本地 Anki 连接。请在 localhost 使用 Edenia，或允许此连接。',
  'anki.failed': 'Anki 连接失败：{message}',
  'anki.notAvailable': '目前无法使用 Anki',
  'log.weeklyGoal.title': '每周目标已更改',
  'log.weeklyGoal.detail': '从 {from} 小时改为 {to} 小时',
  'log.shortVideos.title': '短视频设置已更改',
  'log.shortVideos.shown': '显示短视频。',
  'log.shortVideos.hidden': '隐藏短视频。',
  'log.theme.title': '主题已更改',
  'log.theme.dark': '已启用深色主题。',
  'log.theme.light': '已启用浅色主题。',
  'log.locale.title': '语言已更改',
  'log.locale.detail': '语言已设为 {language}。',
  'log.onboarding.title': '已创建入门学习列表',
  'log.onboarding.detail': '{language} · {level} · {count} 个频道',
  'log.onboarding.otherDetail': '{language} · 自行选择频道',
  'log.sandboxReset.title': '沙盒已重置',
  'log.sandboxReset.detail': '保留回滚备份后，沙盒进度已重置。',
  'log.ankiSetting.title': 'Anki 设置已更改',
  'log.ankiSetting.enabled': '已启用 Anki 追踪。',
  'log.ankiSetting.disabled': '已停用 Anki 追踪。',
  'log.insightsSetting.title': '学习洞察设置已更改',
  'log.insightsSetting.shown': '显示学习洞察。',
  'log.insightsSetting.hidden': '隐藏学习洞察。',
  'log.rollback.title': '已创建回滚备份',
  'log.rollback.beforeImport': '导入同步文件前已保存本地备份。',
  'log.rollback.beforeRestore': '恢复其他备份前已保存本地备份。',
  'log.syncImported.title': '同步文件已导入',
  'log.syncImported.detail': '已从同步文件导入进度。',
  'log.backupRestored.title': '备份已恢复',
  'log.channelAdded.title': '频道已添加',
  'log.channelRemoved.title': '频道已移除',
  'log.reset.title': '全部重置',
  'log.reset.detail': '保留回滚备份后已重新开始。',
  'log.shortsChecked.title': '短视频检查完成',
  'log.shortsChecked.detail': '已检查 {checked} 个已保存视频；找到 {shorts} 个短视频。',
  'log.shortsCheckFailed.title': '短视频检查失败',
  'log.shortsCheckFailed.detail': '无法检查已保存的短视频。',
  'log.channelRefreshed.title': 'YouTube 频道已刷新',
  'log.channelRefreshed.fetched': '{name}：已获取 {count} 个视频。',
  'log.channelRefreshed.loaded': '{name}：已加载 {count} 个视频。',
  'log.channelRefreshFailed.title': 'YouTube 频道刷新失败',
  'log.unknownError': '未知错误',
  'log.shortsSkipped.title': '已跳过短视频',
  'log.shortsSkipped.detail': '刷新时跳过了 {count} 个短视频。',
  'log.refreshFailed.title': 'YouTube 刷新失败',
  'log.unknownRefreshError': '未知的刷新错误',
  'log.videoStatus.title': '视频状态已更改',
  'log.videoStatus.detail': '“{title}”现在是{status}。',
  'log.videoAdded.title': '已添加视频网址',
  'log.videoAdded.detail': '“{title}”已添加到视频列表。',
  'log.ankiRefreshFailed.title': 'Anki 刷新失败',
  'log.ankiStats.title': 'Anki 统计已刷新',
  'log.ankiStats.detail': '今天追踪到 {reviewed} 次复习，并找到 {created} 张新卡片。',
  'log.levelUp.title': '已领取城镇升级'
})

Object.assign(I18N.es, {
  'app.title.sandbox': 'Entorno de prueba - Edenia',
  'videoReminder.tabTitle': '✓ Marcar como visto · Edenia',
  'videoReminder.aria': 'Recordatorio de video',
  'videoReminder.eyebrow': 'Comprobación rápida',
  'videoReminder.question': '¿Terminaste de ver el video? ¡Márcalo como visto!',
  'videoReminder.markWatched': 'Marcar como visto',
  'videoReminder.notYet': 'Todavía no',
  'settings.activity.filtersLabel': 'Filtros del registro de actividad',
  'settings.remove': 'Quitar',
  'header.search.dialog': 'Buscar videos guardados',
  'header.settings': 'Ajustes',
  'city.imageAlt': 'Hito de la ciudad de estudio: casa solitaria',
  'city.zoom.controls': 'Controles de zoom de la ciudad',
  'city.zoom.out': 'Alejar',
  'city.zoom.reset': 'Restablecer vista',
  'city.zoom.in': 'Acercar',
  'city.timeline': 'Cronología de la ciudad',
  'city.timeline.today': 'Hoy',
  'history.viewLabel': 'Vista del historial de estudio',
  'history.rangeLabel': 'Período del historial de estudio',
  'history.selectWeek': 'Seleccionar semana',
  'history.availableWeeks': 'Semanas disponibles',
  'history.selectMonth': 'Seleccionar mes',
  'history.availableMonths': 'Meses disponibles',
  'history.table.anki': 'Anki',
  'history.noActivityMap': 'Todavía no hay actividad para mostrar.',
  'history.noActivityYet': 'Todavía no hay actividad',
  'history.showWatched': 'Mostrar {count} videos vistos el {date}',
  'history.watchedDialog': 'Videos vistos',
  'history.weekdays.mon': 'Lun',
  'history.weekdays.tue': 'Mar',
  'history.weekdays.wed': 'Mié',
  'history.weekdays.thu': 'Jue',
  'history.weekdays.fri': 'Vie',
  'history.weekdays.sat': 'Sáb',
  'history.weekdays.sun': 'Dom',
  'history.tooltip.videoTime': 'Tiempo de video',
  'history.tooltip.videosWatched': 'Videos vistos',
  'history.tooltip.ankiReviewed': 'Anki repasadas',
  'history.tooltip.ankiCreated': 'Tarjetas Anki nuevas',
  'videos.status.previous': 'estado anterior',
  'videos.channels.one': '1 canal',
  'videos.channels.count': '{count} canales',
  'videos.manual.dialog': 'Añadir video o canal de YouTube',
  'videos.manual.placeholder': 'URL de video o canal de YouTube',
  'videos.manual.adding': 'Añadiendo…',
  'videos.empty.activeBelow': 'No hay videos con los filtros actuales.',
  'videos.empty.filtered': 'No hay videos que coincidan con «{filter}» {channelText}.',
  'videos.empty.selectedChannels': 'en los canales seleccionados',
  'videos.filter.active': 'Activos',
  'videos.filter.inProgress': 'En progreso',
  'videos.filter.watchLater': 'Ver después',
  'videos.search.noMatches': 'No hay videos que coincidan',
  'videos.search.untitled': 'Video sin título',
  'videos.search.youtube': 'YouTube',
  'videos.card.markWatchedTitle': 'Marcar como visto',
  'videos.card.clear': 'Borrar estado',
  'videos.card.markProgress': 'Marcar en progreso',
  'videos.card.removeWatchLater': 'Quitar de Ver después',
  'videos.card.watchLater': 'Ver después',
  'videos.card.timestampLabel': 'Hora para continuar',
  'videos.card.inProgressRibbon': 'En progreso',
  'videos.refreshing': 'Actualizando…',
  'videos.refresh': 'Actualizar',
  'activity.auto': 'Automático',
  'activity.user': 'Usuario',
  'activity.error': 'Error',
  'activity.warn': 'Aviso',
  'activity.done': 'Hecho',
  'activity.info': 'Información',
  'backups.unknownTime': 'Hora desconocida',
  'backups.automatic': 'Copia automática',
  'backups.reason.automaticCleanup': 'Antes de la limpieza automática',
  'backups.reason.sandboxReset': 'Antes de restablecer el entorno de prueba',
  'backups.reason.syncImport': 'Antes de importar la sincronización',
  'backups.reason.backupRestore': 'Antes de restaurar una copia',
  'backups.reason.reset': 'Antes de restablecer todo',
  'sandbox.channel.focus': 'Prueba de concentración',
  'sandbox.channel.memory': 'Prueba de memoria',
  'sandbox.channel.projects': 'Prueba de proyectos',
  'sandbox.video.addedDay': 'Día de estudio de prueba {date}.{index}',
  'sandbox.video.upcoming': 'Próxima lección de prueba {date}',
  'sandbox.video.recent': 'Lección reciente de prueba {channel}.{index}',
  'toast.sandboxMode': 'El modo de prueba está activo. Los cambios no afectan a los datos normales.',
  'toast.sandboxReset': 'Datos de prueba restablecidos',
  'toast.sandboxDayAdded': 'Día de estudio de prueba añadido: {date}',
  'toast.dummyVideosLoaded': 'Se cargaron {count} videos de ejemplo',
  'toast.nothingToSync': 'Todavía no hay progreso para exportar',
  'toast.syncExported': 'Archivo de sincronización exportado',
  'toast.invalidSync': 'No es un archivo de sincronización válido de Edenia',
  'toast.useSandboxSync': 'Importa este archivo de prueba en la versión de prueba',
  'toast.useNormalSync': 'Importa este archivo en la versión normal',
  'toast.importFailed': 'No se pudo importar el archivo de sincronización',
  'toast.syncImported': 'Archivo de sincronización importado',
  'toast.readSyncFailed': 'No se pudo leer el archivo de sincronización',
  'toast.backupUnavailable': 'Esta copia ya no está disponible',
  'toast.backupRestored': 'Copia restaurada',
  'toast.channelDuplicate': 'Este canal ya está añadido',
  'toast.channelAdded': 'Se añadió {name}',
  'toast.channelAddedNoKey': 'Se añadió {name}. Configura la clave de la API de YouTube para cargar videos.',
  'toast.channelAddedLoading': 'Se añadió {name}; cargando videos…',
  'toast.apiKeyMissing': 'Configura primero la clave de la API de YouTube',
  'toast.nextRefresh': 'Puedes volver a actualizar en {time}',
  'toast.refreshFailedChannels': 'No se pudieron actualizar {count} canales',
  'toast.refreshLoadedWithErrors': 'Se cargaron {count} videos{shorts}, pero fallaron {errors} canales',
  'toast.refreshLoaded': 'Se cargaron {count} videos de {channels} canales{shorts}',
  'toast.refreshFailed': 'Falló la actualización: {message}',
  'toast.channelLoaded': 'Se cargaron {count} videos de {name}{shorts}',
  'toast.channelAddLoadFailed': 'El canal se añadió, pero sus videos no se cargaron: {message}',
  'toast.validYoutubeUrl': 'Pega una URL válida de un video o canal de YouTube',
  'toast.videoNotFound': 'No se encontró ningún video de YouTube para esa URL',
  'toast.alreadyWatched': 'Este video ya está marcado como visto',
  'toast.watchCooldown': 'Podrás marcar este video como visto en {time}',
  'toast.addedWatchedVideo': 'Añadido y marcado como visto: {title}',
  'toast.addVideoFailed': 'No se pudo añadir el video',
  'toast.timestampFormat': 'Usa el formato HH:MM:SS o MM:SS',
  'toast.videoGone': 'Este video ya no está disponible',
  'toast.watchedHidden': 'Los videos vistos aparecen en el historial de estudio',
  'toast.couldNotShowVideo': 'No se pudo mostrar este video',
  'toast.levelUp': 'La ciudad subió de nivel: {label}',
  'toast.skippedShorts': '; se omitieron {count} videos cortos',
  'toast.skippedShortsSettingsHint': '; se obtuvieron {count} videos cortos, pero se filtraron. Para incluirlos, activa «Mostrar videos cortos» en Ajustes',
  'toast.shortsRefetching': 'Actualizando todos los canales para cargar videos cortos…',
  'anki.unavailableOpen': 'Abre Anki para que Edenia pueda leer los repasos de hoy.',
  'anki.blockedHosted': 'El navegador bloqueó la conexión local con Anki. Usa Edenia en localhost o permite la conexión.',
  'anki.failed': 'Falló la conexión con Anki: {message}',
  'anki.notAvailable': 'Anki no está disponible ahora',
  'log.weeklyGoal.title': 'Objetivo semanal cambiado',
  'log.weeklyGoal.detail': 'De {from} h a {to} h',
  'log.shortVideos.title': 'Ajuste de videos cortos cambiado',
  'log.shortVideos.shown': 'Se muestran los videos cortos.',
  'log.shortVideos.hidden': 'Se ocultan los videos cortos.',
  'log.theme.title': 'Tema cambiado',
  'log.theme.dark': 'Tema oscuro activado.',
  'log.theme.light': 'Tema claro activado.',
  'log.locale.title': 'Idioma cambiado',
  'log.locale.detail': 'Idioma establecido en {language}.',
  'log.onboarding.title': 'Lista inicial creada',
  'log.onboarding.detail': '{language} · {level} · {count} canales',
  'log.onboarding.otherDetail': '{language} · Elige tus propios canales',
  'log.sandboxReset.title': 'Entorno de prueba restablecido',
  'log.sandboxReset.detail': 'El progreso de prueba se restableció después de guardar una copia de recuperación.',
  'log.ankiSetting.title': 'Ajuste de Anki cambiado',
  'log.ankiSetting.enabled': 'El seguimiento de Anki está activado.',
  'log.ankiSetting.disabled': 'El seguimiento de Anki está desactivado.',
  'log.insightsSetting.title': 'Ajuste de conclusiones cambiado',
  'log.insightsSetting.shown': 'Se muestran las conclusiones de estudio.',
  'log.insightsSetting.hidden': 'Se ocultan las conclusiones de estudio.',
  'log.rollback.title': 'Copia de recuperación creada',
  'log.rollback.beforeImport': 'Se guardó una copia local antes de importar un archivo de sincronización.',
  'log.rollback.beforeRestore': 'Se guardó una copia local antes de restaurar otra copia.',
  'log.syncImported.title': 'Archivo de sincronización importado',
  'log.syncImported.detail': 'Se importó el progreso desde un archivo de sincronización.',
  'log.backupRestored.title': 'Copia restaurada',
  'log.channelAdded.title': 'Canal añadido',
  'log.channelRemoved.title': 'Canal eliminado',
  'log.reset.title': 'Restablecer todo',
  'log.reset.detail': 'Se empezó de cero después de guardar una copia de recuperación.',
  'log.shortsChecked.title': 'Videos cortos comprobados',
  'log.shortsChecked.detail': 'Se comprobaron {checked} videos guardados; se encontraron {shorts} videos cortos.',
  'log.shortsCheckFailed.title': 'Falló la comprobación de videos cortos',
  'log.shortsCheckFailed.detail': 'No se pudieron comprobar los videos cortos guardados.',
  'log.channelRefreshed.title': 'Canal de YouTube actualizado',
  'log.channelRefreshed.fetched': '{name}: se obtuvieron {count} videos.',
  'log.channelRefreshed.loaded': '{name}: se cargaron {count} videos.',
  'log.channelRefreshFailed.title': 'Falló la actualización del canal de YouTube',
  'log.unknownError': 'Error desconocido',
  'log.shortsSkipped.title': 'Videos cortos omitidos',
  'log.shortsSkipped.detail': 'Se omitieron {count} videos cortos durante la actualización.',
  'log.refreshFailed.title': 'Falló la actualización de YouTube',
  'log.unknownRefreshError': 'Error de actualización desconocido',
  'log.videoStatus.title': 'Estado del video cambiado',
  'log.videoStatus.detail': '«{title}» ahora está {status}.',
  'log.videoAdded.title': 'URL de video añadida',
  'log.videoAdded.detail': '«{title}» se añadió a la lista de videos.',
  'log.ankiRefreshFailed.title': 'Falló la actualización de Anki',
  'log.ankiStats.title': 'Estadísticas de Anki actualizadas',
  'log.ankiStats.detail': '{reviewed} repasos registrados hoy; {created} tarjetas nuevas encontradas.',
  'log.levelUp.title': 'Subida de nivel reclamada'
})

Object.assign(I18N.fr, {
  'app.title.sandbox': 'Bac à sable - Edenia',
  'videoReminder.tabTitle': '✓ Marquer comme vue · Edenia',
  'videoReminder.aria': 'Rappel de visionnage',
  'videoReminder.eyebrow': 'Vérification rapide',
  'videoReminder.question': 'Vous avez fini de regarder la vidéo ? Marquez-la comme vue !',
  'videoReminder.markWatched': 'Marquer comme vue',
  'videoReminder.notYet': 'Pas encore',
  'settings.activity.filtersLabel': 'Filtres du journal d’activité',
  'settings.remove': 'Retirer',
  'header.search.dialog': 'Rechercher dans les vidéos enregistrées',
  'header.settings': 'Réglages',
  'city.imageAlt': 'Étape de la ville d’étude : maison solitaire',
  'city.zoom.controls': 'Commandes de zoom de la ville',
  'city.zoom.out': 'Dézoomer',
  'city.zoom.reset': 'Réinitialiser la vue',
  'city.zoom.in': 'Zoomer',
  'city.timeline': 'Chronologie de la ville',
  'city.timeline.today': 'Aujourd’hui',
  'history.viewLabel': 'Vue de l’historique d’étude',
  'history.rangeLabel': 'Période de l’historique d’étude',
  'history.selectWeek': 'Sélectionner une semaine',
  'history.availableWeeks': 'Semaines disponibles',
  'history.selectMonth': 'Sélectionner un mois',
  'history.availableMonths': 'Mois disponibles',
  'history.table.anki': 'Anki',
  'history.noActivityMap': 'Aucune activité à afficher pour le moment.',
  'history.noActivityYet': 'Aucune activité pour le moment',
  'history.showWatched': 'Afficher les {count} vidéos vues le {date}',
  'history.watchedDialog': 'Vidéos vues',
  'history.weekdays.mon': 'Lun',
  'history.weekdays.tue': 'Mar',
  'history.weekdays.wed': 'Mer',
  'history.weekdays.thu': 'Jeu',
  'history.weekdays.fri': 'Ven',
  'history.weekdays.sat': 'Sam',
  'history.weekdays.sun': 'Dim',
  'history.tooltip.videoTime': 'Temps vidéo',
  'history.tooltip.videosWatched': 'Vidéos vues',
  'history.tooltip.ankiReviewed': 'Cartes Anki révisées',
  'history.tooltip.ankiCreated': 'Nouvelles cartes Anki',
  'videos.status.previous': 'état précédent',
  'videos.channels.one': '1 chaîne',
  'videos.channels.count': '{count} chaînes',
  'videos.manual.dialog': 'Ajouter une vidéo ou une chaîne YouTube',
  'videos.manual.placeholder': 'URL de vidéo ou de chaîne YouTube',
  'videos.manual.adding': 'Ajout…',
  'videos.empty.activeBelow': 'Aucune vidéo avec les filtres actuels.',
  'videos.empty.filtered': 'Aucune vidéo ne correspond à « {filter} » {channelText}.',
  'videos.empty.selectedChannels': 'dans les chaînes sélectionnées',
  'videos.filter.active': 'Actives',
  'videos.filter.inProgress': 'En cours',
  'videos.filter.watchLater': 'À regarder',
  'videos.search.noMatches': 'Aucune vidéo correspondante',
  'videos.search.untitled': 'Vidéo sans titre',
  'videos.search.youtube': 'YouTube',
  'videos.card.markWatchedTitle': 'Marquer comme vue',
  'videos.card.clear': 'Effacer l’état',
  'videos.card.markProgress': 'Marquer comme en cours',
  'videos.card.removeWatchLater': 'Retirer de À regarder',
  'videos.card.watchLater': 'À regarder',
  'videos.card.timestampLabel': 'Heure de reprise',
  'videos.card.inProgressRibbon': 'En cours',
  'videos.refreshing': 'Actualisation…',
  'videos.refresh': 'Actualiser',
  'activity.auto': 'Automatique',
  'activity.user': 'Utilisateur',
  'activity.error': 'Erreur',
  'activity.warn': 'Avertissement',
  'activity.done': 'Terminé',
  'activity.info': 'Information',
  'backups.unknownTime': 'Heure inconnue',
  'backups.automatic': 'Sauvegarde automatique',
  'backups.reason.automaticCleanup': 'Avant le nettoyage automatique',
  'backups.reason.sandboxReset': 'Avant la réinitialisation du bac à sable',
  'backups.reason.syncImport': 'Avant l’importation de la synchronisation',
  'backups.reason.backupRestore': 'Avant la restauration d’une sauvegarde',
  'backups.reason.reset': 'Avant la réinitialisation complète',
  'sandbox.channel.focus': 'Test de concentration',
  'sandbox.channel.memory': 'Test de mémoire',
  'sandbox.channel.projects': 'Test de projets',
  'sandbox.video.addedDay': 'Jour d’étude de test {date}.{index}',
  'sandbox.video.upcoming': 'Prochaine leçon de test {date}',
  'sandbox.video.recent': 'Leçon récente de test {channel}.{index}',
  'toast.sandboxMode': 'Le mode bac à sable est actif. Les changements ne touchent pas les données normales.',
  'toast.sandboxReset': 'Données du bac à sable réinitialisées',
  'toast.sandboxDayAdded': 'Jour d’étude de test ajouté : {date}',
  'toast.dummyVideosLoaded': '{count} vidéos d’exemple chargées',
  'toast.nothingToSync': 'Aucune progression à exporter pour le moment',
  'toast.syncExported': 'Fichier de synchronisation exporté',
  'toast.invalidSync': 'Ce fichier de synchronisation Edenia n’est pas valide',
  'toast.useSandboxSync': 'Importez ce fichier de test dans la version bac à sable',
  'toast.useNormalSync': 'Importez ce fichier dans la version normale',
  'toast.importFailed': 'Impossible d’importer le fichier de synchronisation',
  'toast.syncImported': 'Fichier de synchronisation importé',
  'toast.readSyncFailed': 'Impossible de lire le fichier de synchronisation',
  'toast.backupUnavailable': 'Cette sauvegarde n’est plus disponible',
  'toast.backupRestored': 'Sauvegarde restaurée',
  'toast.channelDuplicate': 'Cette chaîne est déjà ajoutée',
  'toast.channelAdded': '{name} ajoutée',
  'toast.channelAddedNoKey': '{name} ajoutée. Configurez la clé API YouTube pour charger les vidéos.',
  'toast.channelAddedLoading': '{name} ajoutée ; chargement des vidéos…',
  'toast.apiKeyMissing': 'Configurez d’abord la clé API YouTube',
  'toast.nextRefresh': 'Nouvelle actualisation possible dans {time}',
  'toast.refreshFailedChannels': 'Échec de l’actualisation de {count} chaînes',
  'toast.refreshLoadedWithErrors': '{count} vidéos chargées{shorts}, mais {errors} chaînes ont échoué',
  'toast.refreshLoaded': '{count} vidéos chargées depuis {channels} chaînes{shorts}',
  'toast.refreshFailed': 'Échec de l’actualisation : {message}',
  'toast.channelLoaded': '{count} vidéos chargées depuis {name}{shorts}',
  'toast.channelAddLoadFailed': 'La chaîne a été ajoutée, mais ses vidéos n’ont pas été chargées : {message}',
  'toast.validYoutubeUrl': 'Collez une URL valide de vidéo ou de chaîne YouTube',
  'toast.videoNotFound': 'Aucune vidéo YouTube n’a été trouvée pour cette URL',
  'toast.alreadyWatched': 'Cette vidéo est déjà marquée comme vue',
  'toast.watchCooldown': 'Vous pourrez marquer cette vidéo comme vue dans {time}',
  'toast.addedWatchedVideo': 'Ajoutée et marquée comme vue : {title}',
  'toast.addVideoFailed': 'Impossible d’ajouter la vidéo',
  'toast.timestampFormat': 'Utilisez le format HH:MM:SS ou MM:SS',
  'toast.videoGone': 'Cette vidéo n’est plus disponible',
  'toast.watchedHidden': 'Les vidéos vues apparaissent dans l’historique d’étude',
  'toast.couldNotShowVideo': 'Impossible d’afficher cette vidéo',
  'toast.levelUp': 'La ville passe au niveau supérieur : {label}',
  'toast.skippedShorts': ' ; {count} vidéos courtes ignorées',
  'toast.skippedShortsSettingsHint': ' ; {count} vidéos courtes récupérées puis filtrées. Pour les inclure, activez « Afficher les vidéos courtes » dans Réglages',
  'toast.shortsRefetching': 'Actualisation de toutes les chaînes pour charger les vidéos courtes…',
  'anki.unavailableOpen': 'Ouvrez Anki pour qu’Edenia puisse lire les révisions du jour.',
  'anki.blockedHosted': 'Le navigateur a bloqué la connexion locale à Anki. Utilisez Edenia sur localhost ou autorisez la connexion.',
  'anki.failed': 'Échec de la connexion à Anki : {message}',
  'anki.notAvailable': 'Anki n’est pas disponible pour le moment',
  'log.weeklyGoal.title': 'Objectif hebdomadaire modifié',
  'log.weeklyGoal.detail': 'De {from} h à {to} h',
  'log.shortVideos.title': 'Réglage des vidéos courtes modifié',
  'log.shortVideos.shown': 'Les vidéos courtes sont affichées.',
  'log.shortVideos.hidden': 'Les vidéos courtes sont masquées.',
  'log.theme.title': 'Thème modifié',
  'log.theme.dark': 'Thème sombre activé.',
  'log.theme.light': 'Thème clair activé.',
  'log.locale.title': 'Langue modifiée',
  'log.locale.detail': 'Langue réglée sur {language}.',
  'log.onboarding.title': 'Liste de départ créée',
  'log.onboarding.detail': '{language} · {level} · {count} chaînes',
  'log.onboarding.otherDetail': '{language} · Choisissez vos propres chaînes',
  'log.sandboxReset.title': 'Bac à sable réinitialisé',
  'log.sandboxReset.detail': 'La progression de test a été réinitialisée après la création d’une sauvegarde de retour.',
  'log.ankiSetting.title': 'Réglage Anki modifié',
  'log.ankiSetting.enabled': 'Le suivi Anki est activé.',
  'log.ankiSetting.disabled': 'Le suivi Anki est désactivé.',
  'log.insightsSetting.title': 'Réglage des analyses modifié',
  'log.insightsSetting.shown': 'Les analyses d’étude sont affichées.',
  'log.insightsSetting.hidden': 'Les analyses d’étude sont masquées.',
  'log.rollback.title': 'Sauvegarde de retour créée',
  'log.rollback.beforeImport': 'Une sauvegarde locale a été créée avant l’importation du fichier de synchronisation.',
  'log.rollback.beforeRestore': 'Une sauvegarde locale a été créée avant la restauration d’une autre sauvegarde.',
  'log.syncImported.title': 'Fichier de synchronisation importé',
  'log.syncImported.detail': 'Progression importée depuis un fichier de synchronisation.',
  'log.backupRestored.title': 'Sauvegarde restaurée',
  'log.channelAdded.title': 'Chaîne ajoutée',
  'log.channelRemoved.title': 'Chaîne retirée',
  'log.reset.title': 'Tout réinitialiser',
  'log.reset.detail': 'Un nouveau départ a été créé après une sauvegarde de retour.',
  'log.shortsChecked.title': 'Vidéos courtes vérifiées',
  'log.shortsChecked.detail': '{checked} vidéos enregistrées vérifiées ; {shorts} vidéos courtes trouvées.',
  'log.shortsCheckFailed.title': 'Échec de la vérification des vidéos courtes',
  'log.shortsCheckFailed.detail': 'Impossible de vérifier les vidéos courtes enregistrées.',
  'log.channelRefreshed.title': 'Chaîne YouTube actualisée',
  'log.channelRefreshed.fetched': '{name} : {count} vidéos récupérées.',
  'log.channelRefreshed.loaded': '{name} : {count} vidéos chargées.',
  'log.channelRefreshFailed.title': 'Échec de l’actualisation de la chaîne YouTube',
  'log.unknownError': 'Erreur inconnue',
  'log.shortsSkipped.title': 'Vidéos courtes ignorées',
  'log.shortsSkipped.detail': '{count} vidéos courtes ignorées pendant l’actualisation.',
  'log.refreshFailed.title': 'Échec de l’actualisation YouTube',
  'log.unknownRefreshError': 'Erreur d’actualisation inconnue',
  'log.videoStatus.title': 'État de la vidéo modifié',
  'log.videoStatus.detail': '« {title} » est maintenant {status}.',
  'log.videoAdded.title': 'URL de vidéo ajoutée',
  'log.videoAdded.detail': '« {title} » a été ajoutée à la liste des vidéos.',
  'log.ankiRefreshFailed.title': 'Échec de l’actualisation Anki',
  'log.ankiStats.title': 'Statistiques Anki actualisées',
  'log.ankiStats.detail': '{reviewed} révisions suivies aujourd’hui ; {created} nouvelles cartes trouvées.',
  'log.levelUp.title': 'Niveau supérieur obtenu'
})

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
    id: 'videos',
    target: '.feed-section',
    mobileTarget: '.feed-section > .section-header',
    textKey: 'walkthrough.videos',
    mobileTextKey: 'walkthrough.videosMobile',
    placement: 'top',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  }
]
const FIRST_STUDY_WALKTHROUGH_STEPS = [
  {
    id: 'first-study-channels',
    target: '#manualVideoBtn',
    textKey: 'walkthrough.firstStudyChannels',
    placement: 'bottom',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'first-study-feed',
    target: '#videoGrid',
    textKey: 'walkthrough.firstStudyFeed',
    placement: 'top',
    scrollTarget: '.feed-controls',
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  },
  {
    id: 'first-study-video',
    target: '#videoGrid .channel-video-group:first-child .channel-shelf-slot:first-child .video-card',
    textKey: 'walkthrough.startWatching',
    placement: 'top',
    spotlightPadding: 6,
    spotlightRadius: 12,
    hooks: {
      beforeEnter: 'closeTransientUi'
    }
  }
]
const OTHER_FIRST_STUDY_WALKTHROUGH_STEP = {
  id: 'first-study-other-add-now',
  target: '#manualVideoBtn',
  textKey: 'walkthrough.otherAddNow',
  placement: 'bottom',
  hooks: {
    beforeEnter: 'closeTransientUi'
  }
}

function getFirstStudyWalkthroughSteps(state) {
  if (state?.learnerProfile?.languages?.[0] !== 'other') return FIRST_STUDY_WALKTHROUGH_STEPS
  return [...FIRST_STUDY_WALKTHROUGH_STEPS, OTHER_FIRST_STUDY_WALKTHROUGH_STEP]
}

const WALKTHROUGH_HOOKS = {
  closeTransientUi() {
    closeVideoShelfPreview(activeVideoShelfPreview, true)
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
  openSettingsActivityLog() {
    setSettingsActivityLogOpen(true)
  },
  openSettingsBackups() {
    setSettingsBackupsOpen(true)
  },
  settleWalkthroughTarget({ target }) {
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    })
    scheduleWalkthroughPosition()
    window.setTimeout(scheduleWalkthroughPosition, 180)
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
  const primaryLocale = navigator.language
    || (Array.isArray(navigator.languages) ? navigator.languages.find(Boolean) : '')
  return normalizeLocale(primaryLocale || DEFAULT_LOCALE)
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
  const introButton = document.getElementById('introLocaleBtn')
  const introLabel = document.getElementById('introLocaleLabel')
  const introMenu = document.getElementById('introLocaleMenu')
  if (introButton && introLabel && introMenu) {
    introLabel.textContent = getLocaleLabel(currentLocale)
    introMenu.innerHTML = SUPPORTED_LOCALES.map(locale => `
      <label class="settings-locale-option">
        <input type="radio" name="introLocale" value="${escHtml(locale)}" ${locale === currentLocale ? 'checked' : ''} onchange="changeIntroLocale(this.value)">
        <span>${escHtml(getLocaleLabel(locale))}</span>
      </label>
    `).join('')
  }
  const onboardingButton = document.getElementById('onboardingLocaleBtn')
  const onboardingLabel = document.getElementById('onboardingLocaleLabel')
  const onboardingMenu = document.getElementById('onboardingLocaleMenu')
  if (onboardingButton && onboardingLabel && onboardingMenu) {
    onboardingLabel.textContent = getLocaleLabel(currentLocale)
    onboardingMenu.innerHTML = SUPPORTED_LOCALES.map(locale => `
      <label class="settings-locale-option">
        <input type="radio" name="onboardingLocale" value="${escHtml(locale)}" ${locale === currentLocale ? 'checked' : ''} onchange="changeOnboardingLocale(this.value)">
        <span>${escHtml(getLocaleLabel(locale))}</span>
      </label>
    `).join('')
  }
  const btn = document.getElementById('settingsLocaleBtn')
  const label = document.getElementById('settingsLocaleLabel')
  const menu = document.getElementById('settingsLocaleMenu')
  if (!btn || !label || !menu) return
  label.textContent = getLocaleLabel(currentLocale)
  menu.innerHTML = SUPPORTED_LOCALES.map(locale => `
    <label class="settings-locale-option">
      <input type="radio" name="settingsLocale" value="${escHtml(locale)}" ${locale === currentLocale ? 'checked' : ''} onchange="saveLocaleFromSettings(this.value)">
      <span>${escHtml(getLocaleLabel(locale))}</span>
    </label>
  `).join('')
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
  const {
    apiKey,
    ankiDisabledAt,
    ankiResumeBaselines,
    ankiPendingResumeBaseline,
    ...safeConfig
  } = config
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

function normalizeAnkiEnabled(value) {
  return value !== false
}

function isAnkiEnabled(state) {
  return normalizeAnkiEnabled(state?.config?.ankiEnabled)
}

function isStudyInsightsEnabled(state) {
  return state?.config?.studyInsights?.enabled !== false
}

function normalizeAnkiCount(value) {
  const count = Math.floor(Number(value) || 0)
  return Math.max(0, count)
}

function getTrackedAnkiCounts(s, dateKey) {
  const day = s?.anki?.[dateKey] || {}
  return {
    reviewed: normalizeAnkiCount(day.reviewed),
    created: normalizeAnkiCount(day.created)
  }
}

function normalizeAnkiTrackingConfig(state) {
  if (!state?.config) return false
  let changed = false
  state.config.ankiEnabled = normalizeAnkiEnabled(state.config.ankiEnabled)

  if (state.config.ankiDisabledAt && !isValidTimestamp(state.config.ankiDisabledAt)) {
    state.config.ankiDisabledAt = null
    changed = true
  }

  if (!state.config.ankiEnabled && !state.config.ankiDisabledAt) {
    state.config.ankiDisabledAt = new Date().toISOString()
    changed = true
  }

  if (state.config.ankiEnabled && state.config.ankiDisabledAt) {
    state.config.ankiDisabledAt = null
    changed = true
  }

  if (!state.config.ankiResumeBaselines || typeof state.config.ankiResumeBaselines !== 'object' || Array.isArray(state.config.ankiResumeBaselines)) {
    state.config.ankiResumeBaselines = {}
    changed = true
  }

  const pending = state.config.ankiPendingResumeBaseline
  if (pending && (typeof pending !== 'object' || Array.isArray(pending) || !pending.dateKey)) {
    state.config.ankiPendingResumeBaseline = null
    changed = true
  }

  return changed
}

function normalizeStudyInsightConfig(state) {
  if (!state?.config) return false
  const existing = state.config.studyInsights && typeof state.config.studyInsights === 'object' && !Array.isArray(state.config.studyInsights)
    ? state.config.studyInsights
    : {}
  const legacyVariantCounts = new Map()
  const history = (Array.isArray(existing.history) ? existing.history : [])
    .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map(entry => {
      const type = STUDY_INSIGHT_TYPES.includes(entry.type)
        ? entry.type
        : null
      const windowId = STUDY_INSIGHT_TIME_WINDOWS.some(window => window.id === entry.windowId)
        ? entry.windowId
        : null
      if (!entry.key || !type || !isValidTimestamp(entry.recordedAt)) return null
      return {
        key: String(entry.key).slice(0, 140),
        insightId: String(entry.insightId || '').slice(0, 80),
        type,
        variant: Number.isInteger(entry.variant)
          ? clampNumber(entry.variant, 0, STUDY_INSIGHT_VARIANT_COUNT - 1)
          : null,
        windowId,
        weekdayIndex: Number.isInteger(entry.weekdayIndex) && entry.weekdayIndex >= 0 && entry.weekdayIndex <= 6
          ? entry.weekdayIndex
          : null,
        percent: clampNumber(Math.round(Number(entry.percent) || 0), 0, 100),
        comparisonPercent: Math.max(0, Math.round(Number(entry.comparisonPercent) || 0)),
        recentMinutes: Math.max(0, Math.round(Number(entry.recentMinutes) || 0)),
        previousMinutes: Math.max(0, Math.round(Number(entry.previousMinutes) || 0)),
        suggestedMinutes: clampNumber(Math.round(Number(entry.suggestedMinutes) || 0), 1, 180),
        activeDays: Math.max(0, Math.round(Number(entry.activeDays) || 0)),
        ankiDays: Math.max(0, Math.round(Number(entry.ankiDays) || 0)),
        reviewedCards: Math.max(0, Math.round(Number(entry.reviewedCards) || 0)),
        ankiCreated: Math.max(0, Math.round(Number(entry.ankiCreated) || 0)),
        totalSeconds: Math.max(0, Math.round(Number(entry.totalSeconds) || 0)),
        videoCount: Math.max(0, Math.round(Number(entry.videoCount) || 0)),
        topVideoTitle: String(entry.topVideoTitle || '').slice(0, 180),
        topVideoSeconds: Math.max(0, Math.round(Number(entry.topVideoSeconds) || 0)),
        channelBreakdown: (Array.isArray(entry.channelBreakdown) ? entry.channelBreakdown : [])
          .filter(channel => channel && typeof channel === 'object' && !Array.isArray(channel) && channel.name)
          .map(channel => ({
            name: String(channel.name).slice(0, 100),
            seconds: Math.max(0, Math.round(Number(channel.seconds) || 0))
          }))
          .filter(channel => channel.seconds > 0)
          .slice(0, 5),
        observationDays: clampNumber(Math.round(Number(entry.observationDays) || 0), 0, STUDY_INSIGHT_LOOKBACK_DAYS),
        recordedAt: new Date(entry.recordedAt).toISOString()
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .filter((entry, index, entries) => entries.findIndex(candidate => candidate.key === entry.key) === index)
    .map(entry => {
      if (entry.variant !== null) return entry
      const count = legacyVariantCounts.get(entry.insightId) || 0
      legacyVariantCounts.set(entry.insightId, count + 1)
      return { ...entry, variant: count % STUDY_INSIGHT_VARIANT_COUNT }
    })
    .slice(0, STUDY_INSIGHT_HISTORY_LIMIT)
  const normalized = {
    enabled: existing.enabled !== false,
    collapsed: existing.collapsed === true,
    history
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.config.studyInsights = normalized
  return changed
}

function setAnkiResumeBaselineFromStats(s, stats, createdAt = new Date().toISOString()) {
  if (!s?.config || !stats) return null
  const dateKey = stats.ankiDateKey || getAnkiDateKey(new Date(stats.fetchedAt || Date.now()))
  const tracked = getTrackedAnkiCounts(s, dateKey)
  if (!s.config.ankiResumeBaselines || typeof s.config.ankiResumeBaselines !== 'object' || Array.isArray(s.config.ankiResumeBaselines)) {
    s.config.ankiResumeBaselines = {}
  }
  s.config.ankiResumeBaselines[dateKey] = {
    rawReviewed: normalizeAnkiCount(stats.reviewedToday),
    rawCreated: normalizeAnkiCount(stats.newToday),
    trackedReviewed: tracked.reviewed,
    trackedCreated: tracked.created,
    createdAt
  }
  if (s.config.ankiPendingResumeBaseline?.dateKey === dateKey) s.config.ankiPendingResumeBaseline = null
  return s.config.ankiResumeBaselines[dateKey]
}

function setPendingAnkiResumeBaseline(s, dateKey = getCurrentAnkiDateKey(), createdAt = new Date().toISOString()) {
  if (!s?.config) return null
  const tracked = getTrackedAnkiCounts(s, dateKey)
  s.config.ankiPendingResumeBaseline = {
    dateKey,
    trackedReviewed: tracked.reviewed,
    trackedCreated: tracked.created,
    createdAt
  }
  return s.config.ankiPendingResumeBaseline
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
  backgroundPhysics?.setTheme()
  const toggle = document.getElementById('themeToggle')
  if (toggle) {
    const isDark = normalizedTheme === 'dark'
    toggle.dataset.theme = normalizedTheme
    toggle.title = isDark ? t('header.theme.light') : t('header.theme.dark')
    toggle.setAttribute('aria-label', toggle.title)
  }
}

function getLearnerLanguageOption(languageId) {
  return LEARNER_LANGUAGE_OPTIONS.find(option => option.id === languageId) || null
}

function getLearnerLevelOption(levelId) {
  return LEARNER_LEVEL_OPTIONS.find(option => option.id === levelId) || null
}

function getCuratedChannelEntry(catalogId) {
  return CURATED_CHANNEL_CATALOG.find(channel => channel.id === catalogId) || null
}

function getCuratedChannelAvatarPath(catalogId) {
  return `images/channel-avatars/${encodeURIComponent(catalogId)}.jpg`
}

function normalizeLearnerProfileState(state) {
  if (!state) return false
  const existing = state.learnerProfile && typeof state.learnerProfile === 'object' && !Array.isArray(state.learnerProfile)
    ? state.learnerProfile
    : {}
  const validLanguageIds = new Set(LEARNER_LANGUAGE_OPTIONS.map(option => option.id))
  const validLevelIds = new Set(LEARNER_LEVEL_OPTIONS.map(option => option.id))
  const validCatalogIds = new Set(CURATED_CHANNEL_CATALOG.map(channel => channel.id))
  const languages = Array.from(new Set(
    (Array.isArray(existing.languages) ? existing.languages : [])
      .filter(languageId => validLanguageIds.has(languageId))
  ))
  const selectedChannelCatalogIds = Array.from(new Set(
    (Array.isArray(existing.selectedChannelCatalogIds) ? existing.selectedChannelCatalogIds : [])
      .filter(catalogId => validCatalogIds.has(catalogId))
  ))
  const normalized = {
    languages,
    level: validLevelIds.has(existing.level) ? existing.level : null,
    selectedChannelCatalogIds,
    createdAt: isValidTimestamp(existing.createdAt) ? existing.createdAt : null,
    updatedAt: isValidTimestamp(existing.updatedAt) ? existing.updatedAt : null
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.learnerProfile = normalized
  return changed
}

function getRecommendedChannelCatalog(profile, limit = 6) {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 6))
  const languages = Array.isArray(profile?.languages) ? profile.languages : []
  const level = getLearnerLevelOption(profile?.level)?.id || 'not-sure'
  const byLanguage = languages.map(languageId => {
    const notSureChannelIds = CURATED_NOT_SURE_CHANNEL_IDS[languageId]
    if (level === 'not-sure' && notSureChannelIds) {
      return notSureChannelIds
        .map(catalogId => getCuratedChannelEntry(catalogId))
        .filter(Boolean)
        .slice(0, normalizedLimit)
    }
    const matches = CURATED_CHANNEL_CATALOG.filter(channel => {
      if (channel.language !== languageId) return false
      return level === 'not-sure' || channel.levels.includes(level)
    })
    const fallbacks = CURATED_CHANNEL_CATALOG.filter(channel => channel.language === languageId)
    return (matches.length ? matches : fallbacks).slice(0, normalizedLimit)
  })
  const recommendations = []
  for (let index = 0; recommendations.length < normalizedLimit; index += 1) {
    let addedAtThisIndex = false
    byLanguage.forEach(channels => {
      const channel = channels[index]
      if (!channel || recommendations.length >= normalizedLimit) return
      recommendations.push(channel)
      addedAtThisIndex = true
    })
    if (!addedAtThisIndex) break
  }
  return recommendations
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
      if (normalizeAnkiTrackingConfig(state)) shouldSave = true
      if (normalizeStudyInsightConfig(state)) shouldSave = true
      if (state?.config) {
        const historyView = normalizeHistoryView(state.config.historyView)
        if (state.config.historyView !== historyView) shouldSave = true
        state.config.historyView = historyView
      }
      if (state?.config && !Array.isArray(state.config.channels)) state.config.channels = []
      if (state?.config) delete state.config.apiKey
      normalizeRemovedDefaultChannels(state)
      normalizeRemovedChannels(state)
      if (state?.config && (state.defaultChannelsVersion || 1) < DEFAULT_CHANNELS_VERSION) {
        state.defaultChannelsVersion = DEFAULT_CHANNELS_VERSION
        shouldSave = true
      }
      if (normalizeAnkiDateKeys(state)) shouldSave = true
      if (normalizeVideoWatchProgressState(state)) shouldSave = true
      if (normalizeVideoWatchReminderState(state)) shouldSave = true
      normalizeUndoState(state)
      if (normalizeActivityLogState(state)) shouldSave = true
      if (normalizeLearnerProfileState(state)) shouldSave = true
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
  normalizeVideoWatchReminderState(s)
  normalizeStudyInsightConfig(s)
  if (backup) createStateBackup(backupReason, { force: forceBackup })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    pruneOldestStateBackup()
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  }
  saveConfigCookie(s.config)
  syncPersistedStateToAnalytics(s)
}

function roundAnalyticsNumber(value, decimals = 3) {
  const multiplier = 10 ** decimals
  return Math.round((Number(value) || 0) * multiplier) / multiplier
}

function getAnalyticsChannelAddedAt(state, channel) {
  const channelLog = (Array.isArray(state?.activityLog) ? state.activityLog : []).find(entry => (
    entry?.type === 'channel-add'
    && (
      entry.meta?.channelId === channel.id
      || entry.detail === channel.name
      || entry.detail === channel.id
    )
  ))
  if (channelLog?.createdAt) {
    return { addedAt: channelLog.createdAt, addedAtSource: 'activity_log' }
  }

  if (state?.onboarding?.setupCompletedAt) {
    return {
      addedAt: state.onboarding.setupCompletedAt,
      addedAtSource: 'onboarding_completed'
    }
  }

  return { addedAt: null, addedAtSource: 'first_sync' }
}

function getEdeniaAnalyticsSnapshot(state) {
  const historyEnd = getCurrentAppDate(state)
  historyEnd.setHours(23, 59, 59, 999)
  const studyDays = getStudyHistoryBetween(state, new Date(0), historyEnd).rows
    .map(row => {
      const rawPoints = getHistoryDayRawPoints(row)
      return {
        date: row.dateKey,
        videoSeconds: Math.max(0, Math.round(Number(row.secondsWatched) || 0)),
        videosWatched: Math.max(0, Math.round(Number(row.videosWatched) || 0)),
        ankiReviewed: Math.max(0, Math.round(Number(row.ankiReviewed) || 0)),
        ankiCreated: Math.max(0, Math.round(Number(row.ankiCreated) || 0)),
        rawPoints: roundAnalyticsNumber(rawPoints),
        points: Math.floor(rawPoints),
        qualifiesForStreak: rawPoints >= MIN_DAILY_STREAK_POINTS
      }
    })
    .sort((left, right) => left.date.localeCompare(right.date))

  const currentScore = getCurrentCityScore(state)
  const visibleLevelIndex = clampNumber(
    Number(state?.cityProgress?.maxLevelIndex) || 0,
    0,
    CITY_LEVELS.length - 1
  )
  const earnedLevelIndex = getCityLevelIndex(currentScore)
  const pendingLevelIndex = Number.isInteger(state?.cityProgress?.pendingLevelIndex)
    ? clampNumber(state.cityProgress.pendingLevelIndex, 0, CITY_LEVELS.length - 1)
    : null
  const channels = (Array.isArray(state?.config?.channels) ? state.config.channels : [])
    .filter(channel => channel?.id)
    .map(channel => ({
      id: String(channel.id),
      name: String(channel.name || channel.id),
      ...getAnalyticsChannelAddedAt(state, channel)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const watchedVideos = Object.entries(state?.videos || {})
    .filter(([, video]) => getVideoStatus(video) === 'watched')
    .map(([videoId, video]) => ({
      id: String(video.id || videoId),
      channelId: video.channelId ? String(video.channelId) : null,
      watchedAt: isValidTimestamp(video.watchedAt) ? video.watchedAt : null,
      durationSeconds: Math.max(0, Math.round(Number(video.duration) || 0)),
      source: video.manuallyAdded ? 'manual' : 'channel',
      isShort: Boolean(video.isShort)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    channels,
    watchedVideos,
    studyDays,
    streak: {
      currentDays: Math.max(0, Number(state?.streak?.current) || 0),
      longestDays: Math.max(0, Number(state?.streak?.longest) || 0),
      lastActivityDate: state?.streak?.lastActivityDate || null
    },
    town: {
      visibleLevelIndex,
      earnedLevelIndex,
      pendingLevelIndex,
      hasPendingLevel: pendingLevelIndex !== null && pendingLevelIndex > visibleLevelIndex,
      totalStudyScore: roundAnalyticsNumber(currentScore)
    },
    settings: {
      locale: normalizeLocale(state?.config?.locale),
      theme: normalizeTheme(state?.config?.theme),
      weeklyGoalHours: normalizeWeeklyGoalHours(state?.config?.weeklyGoalHours),
      includeShortVideos: normalizeIncludeShorts(state?.config?.includeShorts),
      ankiEnabled: isAnkiEnabled(state),
      studyInsightsEnabled: isStudyInsightsEnabled(state),
      historyView: normalizeHistoryView(state?.config?.historyView),
      channelShelfOrder: normalizeChannelShelfOrder(state?.config?.channelShelfOrder),
      learningLanguages: Array.isArray(state?.learnerProfile?.languages)
        ? state.learnerProfile.languages.map(String)
        : [],
      learnerLevel: state?.learnerProfile?.level || null,
      onboardingCompleted: Boolean(state?.onboarding?.setupCompleted)
    }
  }
}

function syncPersistedStateToAnalytics(state) {
  if (
    IS_SANDBOX
    || !window.EDENIA_ANALYTICS_ENABLED
    || typeof window.syncEdeniaAnalyticsState !== 'function'
    || !state
  ) return

  try {
    window.syncEdeniaAnalyticsState(getEdeniaAnalyticsSnapshot(state))
  } catch {}
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
      shortsEnableRefetchAvailableAt: null,
      ankiEnabled: true,
      ankiDisabledAt: null,
      ankiResumeBaselines: {},
      ankiPendingResumeBaseline: null,
      historyView: getDefaultHistoryView(),
      studyInsights: { enabled: true, collapsed: false, history: [] },
      channels: Array.isArray(channels) ? channels.map(c => ({ ...c })) : DEFAULT_CHANNELS.map(c => ({ ...c })),
      channelShelfOrder: [],
      removedDefaultChannelIds: restoredRemovedDefaultIds || [],
      removedChannelIds: []
    },
    videos:  {},   // { [videoId]: VideoRecord }
    streak:  { current: 0, longest: 0, lastActivityDate: null },
    anki:    {},   // { 'YYYY-MM-DD': { reviewed, created } }
    cityProgress: { maxLevelIndex: 0, pendingLevelIndex: null },
    undoStack: [],
    redoStack: [],
    activityLog: [],
    lastVideoMarkedWatchedAt: null,
    videoWatchReminders: {},
    channelRefreshes: {},
    onboarding: {
      version: ONBOARDING_VERSION,
      introSeenAt: null,
      setupCompleted: false,
      setupCompletedAt: null,
      walkthroughCompleted: false,
      walkthroughCompletedAt: null,
      recommendationsAppliedAt: null
    },
    learnerProfile: {
      languages: [],
      level: null,
      selectedChannelCatalogIds: [],
      createdAt: null,
      updatedAt: null
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

function getSandboxChannels() {
  return SANDBOX_CHANNEL_DEFINITIONS.map(channel => ({
    id: channel.id,
    name: t(channel.nameKey),
    imageUrl: channel.imageUrl
  }))
}

function createEmptySandboxState() {
  const state = defaultState(4, getSandboxChannels(), DEFAULT_THEME)
  state.sandboxChannelsVersion = SANDBOX_CHANNELS_VERSION
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
    .filter(action => UNDO_ACTION_TYPES.includes(action?.type))
    .slice(-UNDO_STACK_LIMIT)
  state.redoStack = state.redoStack
    .filter(action => UNDO_ACTION_TYPES.includes(action?.type))
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

function normalizeVideoWatchReminderState(state) {
  if (!state) return false
  const existing = state.videoWatchReminders && typeof state.videoWatchReminders === 'object' && !Array.isArray(state.videoWatchReminders)
    ? state.videoWatchReminders
    : {}
  const staleBefore = Date.now() - VIDEO_WATCH_REMINDER_MAX_AGE_MS
  const normalizedEntries = Object.entries(existing)
    .map(([videoId, reminder]) => {
      const video = state.videos?.[videoId]
      if (!video || getVideoStatus(video) === 'watched' || !reminder || typeof reminder !== 'object') return null

      const startedAtMs = Date.parse(reminder.startedAt || '')
      const dueAtMs = Date.parse(reminder.dueAt || '')
      const promptedAtMs = reminder.promptedAt ? Date.parse(reminder.promptedAt) : null
      const durationSeconds = Math.floor(Number(reminder.durationSeconds || 0))
      if (!Number.isFinite(startedAtMs) || !Number.isFinite(dueAtMs) || dueAtMs < staleBefore || durationSeconds < 1) return null
      if (reminder.promptedAt && !Number.isFinite(promptedAtMs)) return null

      return [videoId, {
        startedAt: new Date(startedAtMs).toISOString(),
        dueAt: new Date(dueAtMs).toISOString(),
        durationSeconds,
        ...(promptedAtMs ? { promptedAt: new Date(promptedAtMs).toISOString() } : {})
      }]
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b[1].startedAt) - new Date(a[1].startedAt))
    .slice(0, VIDEO_WATCH_REMINDER_LIMIT)
  const normalized = Object.fromEntries(normalizedEntries)
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.videoWatchReminders = normalized
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
        title: typeof entry.title === 'string' && entry.title ? entry.title : t('settings.activity.title'),
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
    title: typeof entry.title === 'string' && entry.title ? entry.title : t('settings.activity.title'),
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
  const legacyCompleted = existing.completed === true
  const setupCompleted = existing.setupCompleted === true || legacyCompleted
  const walkthroughCompleted = existing.walkthroughCompleted === true || legacyCompleted
  const setupCompletedAt = setupCompleted
    ? (isValidTimestamp(existing.setupCompletedAt) ? existing.setupCompletedAt : (isValidTimestamp(existing.completedAt) ? existing.completedAt : null))
    : null
  const normalized = {
    version: Number.isInteger(existing.version) ? existing.version : ONBOARDING_VERSION,
    introSeenAt: isValidTimestamp(existing.introSeenAt) ? existing.introSeenAt : setupCompletedAt,
    setupCompleted,
    setupCompletedAt,
    walkthroughCompleted,
    walkthroughCompletedAt: walkthroughCompleted
      ? (isValidTimestamp(existing.walkthroughCompletedAt) ? existing.walkthroughCompletedAt : (isValidTimestamp(existing.completedAt) ? existing.completedAt : null))
      : null,
    recommendationsAppliedAt: isValidTimestamp(existing.recommendationsAppliedAt) ? existing.recommendationsAppliedAt : null
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.onboarding = normalized
  return changed
}

function completeWalkthrough(state = loadState()) {
  if (!state) return null
  normalizeOnboardingState(state)
  if (!state.onboarding.walkthroughCompleted) {
    state.onboarding.version = ONBOARDING_VERSION
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = new Date().toISOString()
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
  if (state.sandboxChannelsVersion !== SANDBOX_CHANNELS_VERSION) {
    const existingChannels = new Map((state.config?.channels || []).map(channel => [channel.id, channel]))
    state.config.channels = getSandboxChannels().map(channel => ({
      ...channel,
      ...(existingChannels.get(channel.id) || {}),
      imageUrl: channel.imageUrl
    }))
    state.sandboxChannelsVersion = SANDBOX_CHANNELS_VERSION
  }
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

function normalizeRemovedChannels(state) {
  if (!state?.config) return
  const configuredIds = new Set((state.config.channels || []).map(channel => channel.id).filter(Boolean))
  const removedIds = Array.isArray(state.config.removedChannelIds)
    ? state.config.removedChannelIds.filter(Boolean)
    : []
  state.config.removedChannelIds = [...new Set(removedIds)]
    .filter(id => !configuredIds.has(id))
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

function initBackgroundPhysics() {
  const canvas = document.getElementById('backgroundPhysics')
  const context = canvas?.getContext('2d', { alpha: true })
  if (!canvas || !context) return null

  const staticCanvas = document.createElement('canvas')
  const staticContext = staticCanvas.getContext('2d', { alpha: true })
  if (!staticContext) return null

  const coarsePointer = window.matchMedia('(pointer: coarse)')
  const particles = []
  const activeParticles = new Set()
  const pointer = {
    x: -BACKGROUND_PHYSICS_RADIUS,
    y: -BACKGROUND_PHYSICS_RADIUS,
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
    lastEventAt: 0,
    hasPosition: false,
    activeUntil: 0
  }
  let width = 0
  let height = 0
  let pixelRatio = 1
  let spacing = 20
  let columns = 0
  let rows = 0
  let frame = null
  let lastFrameAt = 0
  let resizeTimer = null

  const getDotColor = () => document.body.dataset.theme === 'dark'
    ? 'rgba(130, 210, 239, 0.17)'
    : 'rgba(5, 5, 5, 0.095)'

  const drawParticlePath = (targetContext, items, xKey, yKey, radius) => {
    targetContext.beginPath()
    items.forEach(particle => {
      targetContext.moveTo(particle[xKey] + radius, particle[yKey])
      targetContext.arc(particle[xKey], particle[yKey], radius, 0, Math.PI * 2)
    })
    targetContext.fill()
  }

  const renderStaticLayer = () => {
    staticContext.setTransform(1, 0, 0, 1, 0, 0)
    staticContext.clearRect(0, 0, staticCanvas.width, staticCanvas.height)
    staticContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    staticContext.fillStyle = getDotColor()
    drawParticlePath(staticContext, particles, 'homeX', 'homeY', 1)
  }

  const draw = () => {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(staticCanvas, 0, 0)
    if (!activeParticles.size) return

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = '#000'
    drawParticlePath(context, activeParticles, 'homeX', 'homeY', 2.2)
    context.globalCompositeOperation = 'source-over'
    context.fillStyle = getDotColor()
    drawParticlePath(context, activeParticles, 'x', 'y', 1.15)
  }

  const resetParticles = () => {
    width = Math.max(1, window.innerWidth)
    height = Math.max(1, window.innerHeight)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    const isLowPower = coarsePointer.matches || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    const particleLimit = isLowPower ? 1200 : BACKGROUND_PHYSICS_MAX_PARTICLES
    spacing = Math.max(18, Math.min(34, Math.sqrt((width * height) / particleLimit)))
    columns = Math.ceil(width / spacing) + 1
    rows = Math.ceil(height / spacing) + 1

    canvas.width = Math.ceil(width * pixelRatio)
    canvas.height = Math.ceil(height * pixelRatio)
    staticCanvas.width = canvas.width
    staticCanvas.height = canvas.height
    particles.length = 0
    activeParticles.clear()

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const homeX = (column * spacing) + (spacing * 0.5)
        const homeY = (row * spacing) + (spacing * 0.5)
        particles.push({ homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0 })
      }
    }

    renderStaticLayer()
    draw()
  }

  const activateParticlesNearPointer = () => {
    const radius = BACKGROUND_PHYSICS_RADIUS
    const minColumn = Math.max(0, Math.floor((pointer.x - radius) / spacing))
    const maxColumn = Math.min(columns - 1, Math.ceil((pointer.x + radius) / spacing))
    const minRow = Math.max(0, Math.floor((pointer.y - radius) / spacing))
    const maxRow = Math.min(rows - 1, Math.ceil((pointer.y + radius) / spacing))
    const radiusSquared = radius * radius

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const particle = particles[(row * columns) + column]
        if (!particle) continue
        const dx = particle.homeX - pointer.x
        const dy = particle.homeY - pointer.y
        if ((dx * dx) + (dy * dy) <= radiusSquared) activeParticles.add(particle)
      }
    }
  }

  const tick = now => {
    const timeStep = Math.min(2, Math.max(0.5, (now - lastFrameAt) / 16.67 || 1))
    const pointerIsActive = now < pointer.activeUntil
    const radiusSquared = BACKGROUND_PHYSICS_RADIUS * BACKGROUND_PHYSICS_RADIUS
    const damping = Math.pow(0.82, timeStep)
    lastFrameAt = now
    pointer.vx *= Math.pow(0.72, timeStep)
    pointer.vy *= Math.pow(0.72, timeStep)

    activeParticles.forEach(particle => {
      if (pointerIsActive) {
        const dx = particle.x - pointer.x
        const dy = particle.y - pointer.y
        const distanceSquared = (dx * dx) + (dy * dy)
        if (distanceSquared < radiusSquared) {
          const distance = Math.max(1, Math.sqrt(distanceSquared))
          const influence = 1 - (distance / BACKGROUND_PHYSICS_RADIUS)
          const push = influence * influence * 1.8 * timeStep
          particle.vx += ((dx / distance) * push) + (pointer.vx * influence * 0.16)
          particle.vy += ((dy / distance) * push) + (pointer.vy * influence * 0.16)
        }
      }

      particle.vx = (particle.vx + ((particle.homeX - particle.x) * 0.055 * timeStep)) * damping
      particle.vy = (particle.vy + ((particle.homeY - particle.y) * 0.055 * timeStep)) * damping
      particle.x += particle.vx * timeStep
      particle.y += particle.vy * timeStep

      const distanceHome = Math.abs(particle.homeX - particle.x) + Math.abs(particle.homeY - particle.y)
      const speed = Math.abs(particle.vx) + Math.abs(particle.vy)
      if (!pointerIsActive && distanceHome < 0.08 && speed < 0.04) {
        particle.x = particle.homeX
        particle.y = particle.homeY
        particle.vx = 0
        particle.vy = 0
        activeParticles.delete(particle)
      }
    })

    draw()
    if (activeParticles.size) {
      frame = window.requestAnimationFrame(tick)
    } else {
      frame = null
    }
  }

  const requestTick = () => {
    if (frame !== null) return
    lastFrameAt = performance.now()
    frame = window.requestAnimationFrame(tick)
  }

  const handlePointerMove = event => {
    const now = performance.now()
    if (pointer.hasPosition) {
      const elapsedFrames = Math.max(0.5, (now - pointer.lastEventAt) / 16.67)
      pointer.vx = Math.max(-18, Math.min(18, (event.clientX - pointer.lastX) / elapsedFrames))
      pointer.vy = Math.max(-18, Math.min(18, (event.clientY - pointer.lastY) / elapsedFrames))
    }
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY
    pointer.lastEventAt = now
    pointer.hasPosition = true
    pointer.activeUntil = now + 90
    activateParticlesNearPointer()
    requestTick()
  }

  const handleResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(resetParticles, 120)
  }

  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('resize', handleResize, { passive: true })
  resetParticles()

  return {
    setTheme() {
      renderStaticLayer()
      draw()
    }
  }
}

function init() {
  reportMissingI18nKeys()
  let state = loadState()
  if (!state) {
    state = IS_SANDBOX ? createEmptySandboxState() : defaultState(4, DEFAULT_CHANNELS)
    saveState(state)
  }

  applyLocale(state.config.locale)
  updateDocumentTitle(state)
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
  backgroundPhysics = initBackgroundPhysics()
  show('mainApp')
  renderAll(state)
  syncHeaderCompactState()
  startChannelRefreshLabelTicker()
  repairStoredShortsDetection()
  hydrateStoredManualVideoChannelImages()
  initCityImagePanZoom()
  initCityWaveformTouchNavigation()
  initIntroTrailerTouchNavigation()
  if (!IS_SANDBOX) {
    if (state.onboarding.setupCompleted) startLiveIntegrations(state)
  } else {
    if (IS_SANDBOX) showToast(t('toast.sandboxMode'), 'warn')
  }
  maybeStartOnboarding(state)
  showPendingOnboardingNotice()
  initializeVideoWatchReminders(state)
}

function queueOnboardingNotice(message) {
  if (!message) return
  try { sessionStorage.setItem(ONBOARDING_NOTICE_KEY, message) } catch {}
}

function showPendingOnboardingNotice() {
  let message = ''
  try {
    message = sessionStorage.getItem(ONBOARDING_NOTICE_KEY) || ''
    sessionStorage.removeItem(ONBOARDING_NOTICE_KEY)
  } catch {}
  if (message) window.setTimeout(() => showToast(message, 'warn'), 500)
}

function startLiveIntegrations(state = loadState()) {
  if (IS_SANDBOX || !state?.onboarding?.setupCompleted) return
  applyAnkiRefreshPreference(state)
  startYoutubeAutoRefresh()
}

function syncHeaderCompactState() {
  const header = document.querySelector('.app-header')
  if (!header) return
  if (!isMobileLayout()) {
    header.classList.remove('is-compact')
    return
  }
  if (document.body.classList.contains('walkthrough-active')) {
    header.classList.remove('is-compact')
    return
  }

  const isCompact = header.classList.contains('is-compact')
  const collapseAt = header.offsetHeight + 24
  const expandAt = 16
  const shouldCompact = isCompact
    ? window.scrollY > expandAt
    : window.scrollY > collapseAt
  if (shouldCompact !== isCompact) header.classList.toggle('is-compact', shouldCompact)
}

function maybeStartOnboarding(state) {
  if (consumeSandboxWalkthroughAfterReset()) {
    window.setTimeout(() => startWalkthrough(WALKTHROUGH_STEPS, { manual: true, reason: 'sandbox-reset' }), 350)
    return
  }
  if (IS_SANDBOX) return
  if (!state?.onboarding?.setupCompleted) {
    if (!state?.onboarding?.introSeenAt) {
      window.setTimeout(() => startIntroTrailer(), 220)
    } else {
      window.setTimeout(() => startPersonalizedOnboarding(state), 220)
    }
    return
  }
  if (!state?.onboarding?.walkthroughCompleted) {
    window.setTimeout(() => startWalkthrough(getFirstStudyWalkthroughSteps(state)), 350)
  }
}

function syncIntroTrailerStageScale() {
  const stage = document.querySelector('.intro-stage')
  if (!stage) return
  const stageWidth = stage.clientWidth
  if (!stageWidth) return

  const scale = stageWidth / INTRO_TRAILER_REFERENCE.sceneWidth
  stage.style.setProperty('--intro-stage-scale', scale.toFixed(6))
  stage.style.setProperty('--intro-stage-enter-scale', (scale * 1.025).toFixed(6))
}

function startIntroTrailer({ replay = false } = {}) {
  if ((IS_SANDBOX && !replay) || introTrailerState.active) return
  const trailer = document.getElementById('introTrailer')
  if (!trailer) {
    if (!replay) startPersonalizedOnboarding()
    return
  }

  introTrailerState.active = true
  introTrailerState.replayMode = replay
  stopIntroMusic()
  document.body.classList.add('intro-active')
  document.getElementById('mainApp')?.setAttribute('inert', '')
  trailer.classList.remove('hidden')
  syncIntroTrailerStageScale()
  const startButton = document.getElementById('introStartBtn')
  if (startButton) {
    const labelKey = replay ? 'intro.finale.return' : 'intro.finale.cta'
    startButton.dataset.i18n = labelKey
    startButton.textContent = t(labelKey)
  }

  setIntroTrailerScene(0)
  startIntroMusic().catch(() => {})
}

function setIntroTrailerScene(sceneIndex, { autoAdvance = true } = {}) {
  if (!introTrailerState.active) return
  const trailer = document.getElementById('introTrailer')
  const timeline = document.getElementById('introTimeline')
  const previousButton = document.getElementById('introPreviousBtn')
  const nextButton = document.getElementById('introNextBtn')
  if (!trailer) return

  window.clearTimeout(introTrailerState.sceneTimer)
  introTrailerState.cityLevelTimers.forEach(timer => window.clearTimeout(timer))
  introTrailerState.cityLevelTimers = []
  introTrailerState.sceneIndex = Math.max(0, Math.min(sceneIndex, INTRO_TRAILER_SCENE_DURATIONS.length - 1))
  const duration = INTRO_TRAILER_SCENE_DURATIONS[introTrailerState.sceneIndex]

  trailer.dataset.scene = String(introTrailerState.sceneIndex)
  trailer.style.setProperty('--intro-duration', `${duration}ms`)
  if (previousButton) previousButton.disabled = introTrailerState.sceneIndex === 0
  if (nextButton) nextButton.disabled = introTrailerState.sceneIndex === INTRO_TRAILER_SCENE_DURATIONS.length - 1
  timeline?.querySelectorAll('span').forEach((segment, index) => {
    segment.classList.toggle('is-complete', index < introTrailerState.sceneIndex)
    segment.classList.toggle('is-active', index === introTrailerState.sceneIndex)
  })

  if (introTrailerState.sceneIndex === 2) animateIntroCityLevel()
  const isFinalScene = introTrailerState.sceneIndex === INTRO_TRAILER_SCENE_DURATIONS.length - 1
  if (!autoAdvance || isFinalScene) return
  introTrailerState.sceneTimer = window.setTimeout(() => {
    const nextScene = introTrailerState.sceneIndex + 1
    if (nextScene < INTRO_TRAILER_SCENE_DURATIONS.length) setIntroTrailerScene(nextScene)
  }, duration)
}

function navigateIntroTrailer(direction) {
  if (!introTrailerState.active) return
  const nextScene = introTrailerState.sceneIndex + Math.sign(Number(direction) || 0)
  if (nextScene < 0 || nextScene >= INTRO_TRAILER_SCENE_DURATIONS.length) return
  setIntroTrailerScene(nextScene)
}

function resetIntroTrailerTouchNavigation() {
  introTrailerState.touchIdentifier = null
  introTrailerState.touchStartX = 0
  introTrailerState.touchStartY = 0
  introTrailerState.touchAxis = null
}

function initIntroTrailerTouchNavigation() {
  const trailer = document.getElementById('introTrailer')
  if (!trailer) return

  trailer.addEventListener('touchstart', event => {
    resetIntroTrailerTouchNavigation()
    if (!introTrailerState.active || event.touches.length !== 1) return
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, label, [role="button"]')) return

    const touch = event.touches[0]
    introTrailerState.touchIdentifier = touch.identifier
    introTrailerState.touchStartX = touch.clientX
    introTrailerState.touchStartY = touch.clientY
  }, { passive: true })

  trailer.addEventListener('touchmove', event => {
    const touch = Array.from(event.touches).find(item => item.identifier === introTrailerState.touchIdentifier)
    if (!touch) return

    const deltaX = touch.clientX - introTrailerState.touchStartX
    const deltaY = touch.clientY - introTrailerState.touchStartY
    if (!introTrailerState.touchAxis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 10) {
      introTrailerState.touchAxis = Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? 'horizontal' : 'vertical'
    }
    if (introTrailerState.touchAxis === 'horizontal' && event.cancelable) event.preventDefault()
  }, { passive: false })

  trailer.addEventListener('touchend', event => {
    const touch = Array.from(event.changedTouches).find(item => item.identifier === introTrailerState.touchIdentifier)
    if (!touch) return

    const deltaX = touch.clientX - introTrailerState.touchStartX
    const deltaY = touch.clientY - introTrailerState.touchStartY
    const isHorizontalSwipe = introTrailerState.touchAxis !== 'vertical'
      && Math.abs(deltaX) >= 56
      && Math.abs(deltaX) > Math.abs(deltaY) * 1.25
    resetIntroTrailerTouchNavigation()
    if (isHorizontalSwipe) navigateIntroTrailer(deltaX < 0 ? 1 : -1)
  }, { passive: true })

  trailer.addEventListener('touchcancel', resetIntroTrailerTouchNavigation, { passive: true })
}

function changeIntroLocale(locale) {
  closeIntroLocaleMenu()
  const state = loadState()
  if (!state?.config) return
  const nextLocale = normalizeLocale(locale)
  state.config.locale = nextLocale
  saveState(state, { backup: false })
  applyLocale(nextLocale)
  updateIntroSoundButton()
  updateIntroCityLevelControls(document.getElementById('introCityLevel')?.textContent || '1')
  updateDocumentTitle(state)

  if (introTrailerState.active && introTrailerState.sceneIndex === 0) {
    setIntroTrailerScene(0)
  }
}

function handleIntroTrailerKeydown(event) {
  if (!introTrailerState.active || event.defaultPrevented) return
  if (event.target instanceof Element && event.target.closest('select, input, textarea')) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    navigateIntroTrailer(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    navigateIntroTrailer(1)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    const localeMenu = document.getElementById('introLocaleMenu')
    if (localeMenu && !localeMenu.classList.contains('hidden')) {
      closeIntroLocaleMenu()
      return
    }
    finishIntroTrailer()
  }
}

function toggleIntroLocaleMenu(event) {
  event.stopPropagation()
  const button = document.getElementById('introLocaleBtn')
  const menu = document.getElementById('introLocaleMenu')
  if (!button || !menu) return
  const isOpen = menu.classList.toggle('hidden') === false
  button.setAttribute('aria-expanded', String(isOpen))
}

function closeIntroLocaleMenu() {
  const button = document.getElementById('introLocaleBtn')
  const menu = document.getElementById('introLocaleMenu')
  if (!button || !menu) return
  menu.classList.add('hidden')
  button.setAttribute('aria-expanded', 'false')
}

function closeIntroLocaleMenuOnOutsideClick(event) {
  if (event.target.closest('.intro-language-picker')) return
  closeIntroLocaleMenu()
}

function toggleOnboardingLocaleMenu(event) {
  event.stopPropagation()
  const button = document.getElementById('onboardingLocaleBtn')
  const menu = document.getElementById('onboardingLocaleMenu')
  if (!button || !menu) return
  const isOpen = menu.classList.toggle('hidden') === false
  button.setAttribute('aria-expanded', String(isOpen))
}

function closeOnboardingLocaleMenu() {
  const button = document.getElementById('onboardingLocaleBtn')
  const menu = document.getElementById('onboardingLocaleMenu')
  if (!button || !menu) return
  menu.classList.add('hidden')
  button.setAttribute('aria-expanded', 'false')
}

function closeOnboardingLocaleMenuOnOutsideClick(event) {
  if (event.target.closest('.onboarding-language-picker')) return
  closeOnboardingLocaleMenu()
}

function changeOnboardingLocale(locale) {
  closeOnboardingLocaleMenu()
  const state = loadState()
  if (!state?.config) return
  const nextLocale = normalizeLocale(locale)
  state.config.locale = nextLocale
  saveState(state, { backup: false })
  applyLocale(nextLocale)
  updateDocumentTitle(state)
  renderPersonalizedOnboarding()
}

function animateIntroCityLevel() {
  const trailer = document.getElementById('introTrailer')
  trailer?.classList.remove('is-manual-city-level')
  trailer?.querySelectorAll('[data-intro-city-frame]').forEach(frame => frame.classList.remove('is-selected'))
  trailer?.querySelectorAll('.intro-city-growth button, .intro-city-growth i').forEach(marker => marker.classList.remove('is-selected', 'is-reached'))
  updateIntroCityLevelControls(1)
  ;[[2500, '4'], [5100, '8'], [7700, '12']].forEach(([delay, value]) => {
    introTrailerState.cityLevelTimers.push(window.setTimeout(() => {
      updateIntroCityLevelControls(value)
    }, delay))
  })
}

function updateIntroCityLevelControls(level) {
  const normalizedLevel = String(level)
  const levelLabel = document.getElementById('introCityLevel')
  if (levelLabel) levelLabel.textContent = normalizedLevel
  document.querySelectorAll('[data-intro-city-level]').forEach(button => {
    const isSelected = button.dataset.introCityLevel === normalizedLevel
    button.setAttribute('aria-pressed', String(isSelected))
    button.setAttribute('aria-label', `${t('intro.city.level')} ${button.dataset.introCityLevel}`)
  })
}

function selectIntroCityLevel(level) {
  if (!introTrailerState.active || introTrailerState.sceneIndex !== 2) return
  const normalizedLevel = String(level)
  if (!['1', '4', '8', '12'].includes(normalizedLevel)) return
  const trailer = document.getElementById('introTrailer')
  if (!trailer) return

  window.clearTimeout(introTrailerState.sceneTimer)
  introTrailerState.cityLevelTimers.forEach(timer => window.clearTimeout(timer))
  introTrailerState.cityLevelTimers = []
  trailer.classList.add('is-manual-city-level')
  const levels = ['1', '4', '8', '12']
  const selectedIndex = levels.indexOf(normalizedLevel)
  const showLevel = nextLevel => {
    const nextIndex = levels.indexOf(nextLevel)
    trailer.querySelectorAll('[data-intro-city-frame]').forEach(frame => {
      frame.classList.toggle('is-selected', frame.dataset.introCityFrame === nextLevel)
    })
    trailer.querySelectorAll('[data-intro-city-level]').forEach((button, index) => {
      button.classList.toggle('is-selected', index === nextIndex)
      button.classList.toggle('is-reached', index <= nextIndex)
    })
    trailer.querySelectorAll('.intro-city-growth i').forEach((rail, index) => {
      rail.classList.toggle('is-reached', index < nextIndex)
    })
    updateIntroCityLevelControls(nextLevel)
  }

  showLevel(normalizedLevel)
  const levelPause = 2800
  levels.slice(selectedIndex + 1).forEach((nextLevel, index) => {
    introTrailerState.cityLevelTimers.push(window.setTimeout(() => showLevel(nextLevel), levelPause * (index + 1)))
  })
  const remainingLevelCount = levels.length - selectedIndex - 1
  introTrailerState.sceneTimer = window.setTimeout(() => setIntroTrailerScene(3), levelPause * (remainingLevelCount + 1))
}

function updateIntroSoundButton() {
  const button = document.getElementById('introSoundBtn')
  const labelKey = introTrailerState.soundEnabled ? 'intro.sound.on' : 'intro.sound.off'
  const labelText = t(labelKey)
  if (button) {
    button.setAttribute('aria-pressed', String(introTrailerState.soundEnabled))
    button.setAttribute('aria-label', labelText)
    button.title = labelText
  }
}

function removeIntroMusicUnlockListeners() {
  window.removeEventListener('pointerdown', unlockIntroMusic, true)
  window.removeEventListener('keydown', unlockIntroMusic, true)
}

function unlockIntroMusic() {
  const audio = introTrailerState.audio
  if (!introTrailerState.active || !introTrailerState.soundEnabled || !audio) {
    removeIntroMusicUnlockListeners()
    return
  }
  audio.play().then(removeIntroMusicUnlockListeners).catch(() => {})
}

async function startIntroMusic() {
  if (!introTrailerState.active || introTrailerState.audio) return
  const audio = new Audio('assets/audio/intro-trailer-rainy-10pm.mp4')
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 0.42
  introTrailerState.audio = audio
  introTrailerState.soundEnabled = true
  updateIntroSoundButton()
  try {
    await audio.play()
  } catch (error) {
    window.addEventListener('pointerdown', unlockIntroMusic, { capture: true })
    window.addEventListener('keydown', unlockIntroMusic, { capture: true })
  }
}

function stopIntroMusic({ fadeDuration = 0.28 } = {}) {
  removeIntroMusicUnlockListeners()
  const audio = introTrailerState.audio
  if (audio) {
    const duration = Math.max(fadeDuration * 1000, 10)
    const startedAt = performance.now()
    const startingVolume = audio.volume
    const fadeTimer = window.setInterval(() => {
      const progress = Math.min((performance.now() - startedAt) / duration, 1)
      audio.volume = startingVolume * (0.5 + (0.5 * Math.cos(Math.PI * progress)))
      if (progress < 1) return
      window.clearInterval(fadeTimer)
      audio.pause()
      audio.currentTime = 0
    }, 50)
  }
  introTrailerState.audio = null
  introTrailerState.soundEnabled = false
  updateIntroSoundButton()
}

async function toggleIntroSound() {
  if (introTrailerState.soundEnabled) {
    const audio = introTrailerState.audio
    if (!audio) {
      stopIntroMusic()
      return
    }
    removeIntroMusicUnlockListeners()
    audio.pause()
    introTrailerState.soundEnabled = false
    updateIntroSoundButton()
    return
  }
  try {
    const audio = introTrailerState.audio
    if (audio) {
      introTrailerState.soundEnabled = true
      updateIntroSoundButton()
      await audio.play()
    } else {
      await startIntroMusic()
    }
  } catch (error) {
    stopIntroMusic()
    console.warn('Unable to start intro music.', error)
  }
}

function finishIntroTrailer() {
  if (!introTrailerState.active) return
  const wasReplay = introTrailerState.replayMode
  stopIntroMusic({ fadeDuration: 7.5 })
  window.clearTimeout(introTrailerState.sceneTimer)
  introTrailerState.cityLevelTimers.forEach(timer => window.clearTimeout(timer))
  introTrailerState.cityLevelTimers = []
  introTrailerState.active = false
  introTrailerState.replayMode = false

  const trailer = document.getElementById('introTrailer')
  trailer?.classList.add('hidden')
  document.body.classList.remove('intro-active')

  if (wasReplay) {
    document.getElementById('mainApp')?.removeAttribute('inert')
    return
  }

  const state = loadState()
  if (state) {
    normalizeOnboardingState(state)
    state.onboarding.introSeenAt = state.onboarding.introSeenAt || new Date().toISOString()
    saveState(state, { backup: false })
  }
  startPersonalizedOnboarding(state)
}

function startPersonalizedOnboarding(state = loadState()) {
  if (!state || IS_SANDBOX) return
  normalizeLearnerProfileState(state)
  personalizedOnboardingState.active = true
  personalizedOnboardingState.step = state.learnerProfile.languages[0]
    ? (state.learnerProfile.languages[0] === 'other'
        ? 'other'
        : (state.learnerProfile.level ? 'channels' : 'level'))
    : 'language'
  personalizedOnboardingState.languageId = state.learnerProfile.languages[0] || null
  personalizedOnboardingState.levelId = state.learnerProfile.level || null
  personalizedOnboardingState.selectedChannelCatalogIds = state.learnerProfile.selectedChannelCatalogIds.slice(0, ONBOARDING_CHANNEL_SELECTION_LIMIT)
  personalizedOnboardingState.channelSelectionsInitialized = state.learnerProfile.selectedChannelCatalogIds.length > 0
  personalizedOnboardingState.isApplyingChannels = false
  document.body.classList.add('onboarding-active')
  document.getElementById('mainApp')?.setAttribute('inert', '')
  document.getElementById('onboardingPanel')?.classList.remove('hidden')
  renderPersonalizedOnboarding()
}

function renderPersonalizedOnboarding() {
  if (!personalizedOnboardingState.active) return
  const content = document.getElementById('onboardingContent')
  const localePicker = document.getElementById('onboardingLocalePicker')
  const progressLabel = document.getElementById('onboardingProgressLabel')
  const progressFill = document.getElementById('onboardingProgressFill')
  if (!content || !progressLabel || !progressFill) return

  const stepOrder = personalizedOnboardingState.languageId === 'other'
    ? ['language', 'other']
    : ['language', 'level', 'channels']
  const stepIndex = Math.max(0, stepOrder.indexOf(personalizedOnboardingState.step))
  progressLabel.textContent = t('onboarding.progress', { current: stepIndex + 1, total: stepOrder.length })
  progressFill.style.width = `${((stepIndex + 1) / stepOrder.length) * 100}%`
  localePicker?.classList.toggle('hidden', personalizedOnboardingState.step !== 'language')

  if (personalizedOnboardingState.step === 'language') {
    renderOnboardingLanguageStep(content)
  } else if (personalizedOnboardingState.step === 'level') {
    renderOnboardingLevelStep(content)
  } else if (personalizedOnboardingState.step === 'channels') {
    prepareOnboardingChannelSelections()
    renderOnboardingChannelsStep(content)
  } else {
    renderOnboardingOtherStep(content)
  }
}

function renderOnboardingHeading(titleKey, subtitleKey = '') {
  return `
    <div class="onboarding-heading">
      <span class="onboarding-eyebrow">${escHtml(t('onboarding.eyebrow'))}</span>
      <h2 class="onboarding-title" id="onboardingTitle">${escHtml(t(titleKey))}</h2>
      ${subtitleKey ? `<p class="onboarding-subtitle">${escHtml(t(subtitleKey))}</p>` : ''}
    </div>
  `
}

function renderOnboardingLanguageStep(content) {
  const selectedLanguageId = personalizedOnboardingState.languageId
  content.innerHTML = `
    ${renderOnboardingHeading('onboarding.language.title', 'onboarding.language.subtitle')}
    <div class="onboarding-choice-grid onboarding-language-grid" role="radiogroup" aria-label="${escHtml(t('onboarding.language.title'))}">
      ${LEARNER_LANGUAGE_OPTIONS.map(option => `
        <button type="button" class="onboarding-choice" data-language-id="${escHtml(option.id)}" aria-pressed="${option.id === selectedLanguageId}" onclick="selectOnboardingLanguage(this.dataset.languageId)">
          <span class="onboarding-choice-icon" aria-hidden="true">${escHtml(option.icon)}</span>
          <span class="onboarding-choice-label">${escHtml(t(`onboarding.language.${option.id}`))}</span>
        </button>
      `).join('')}
    </div>
    <div class="onboarding-actions onboarding-actions-end">
      <button type="button" class="btn-primary" onclick="continuePersonalizedOnboardingFromLanguage()" ${selectedLanguageId ? '' : 'disabled'}>${escHtml(t('onboarding.continue'))}</button>
    </div>
    <p class="onboarding-private-note">${escHtml(t('onboarding.private'))}</p>
  `
  renderLocaleSelect()
}

function renderOnboardingOtherStep(content) {
  content.innerHTML = `
    ${renderOnboardingHeading('onboarding.other.title', 'onboarding.other.subtitle')}
    <div class="onboarding-empty">${escHtml(t('onboarding.other.note'))}</div>
    <div class="onboarding-actions">
      <button type="button" class="btn-ghost" onclick="setPersonalizedOnboardingStep('language')" ${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}>${escHtml(t('onboarding.back'))}</button>
      <button type="button" class="btn-primary" onclick="finishPersonalizedOnboarding()" ${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}>${escHtml(t(personalizedOnboardingState.isApplyingChannels ? 'onboarding.building' : 'onboarding.build'))}</button>
    </div>
  `
}

function renderOnboardingLevelStep(content) {
  const selectedLevelId = personalizedOnboardingState.levelId
  content.innerHTML = `
    ${renderOnboardingHeading('onboarding.level.title')}
    <div class="onboarding-level-grid" role="radiogroup" aria-label="${escHtml(t('onboarding.level.title'))}">
      ${LEARNER_LEVEL_OPTIONS.map(option => `
        <button type="button" class="onboarding-choice onboarding-level-choice" data-level-id="${escHtml(option.id)}" aria-pressed="${option.id === selectedLevelId}" onclick="selectOnboardingLevel(this.dataset.levelId)">
          <span class="onboarding-choice-label">${escHtml(t(`onboarding.level.${option.id}.label`))}</span>
          <span class="onboarding-choice-detail">${escHtml(t(`onboarding.level.${option.id}.detail`))}</span>
        </button>
      `).join('')}
    </div>
    <div class="onboarding-actions">
      <button type="button" class="btn-ghost" onclick="setPersonalizedOnboardingStep('language')">${escHtml(t('onboarding.back'))}</button>
      <button type="button" class="btn-primary" onclick="setPersonalizedOnboardingStep('channels')" ${selectedLevelId ? '' : 'disabled'}>${escHtml(t('onboarding.continue'))}</button>
    </div>
  `
}

function renderOnboardingChannelsStep(content) {
  const recommendations = getRecommendedChannelCatalog({
    languages: [personalizedOnboardingState.languageId],
    level: personalizedOnboardingState.levelId
  })
  const selectedIds = new Set(personalizedOnboardingState.selectedChannelCatalogIds)
  const language = getLearnerLanguageOption(personalizedOnboardingState.languageId)
  const channelMarkup = recommendations.length
    ? recommendations.map(channel => {
        const selected = selectedIds.has(channel.id)
        const avatarUrl = getCuratedChannelAvatarPath(channel.id)
        const avatarFallback = language?.icon || channel.name.slice(0, 2).toUpperCase()
        const avatar = avatarUrl
          ? `<img src="${escHtml(avatarUrl)}" alt="" loading="eager">`
          : escHtml(avatarFallback)
        return `
          <button type="button" class="onboarding-channel" data-catalog-id="${escHtml(channel.id)}" aria-pressed="${selected}" onclick="toggleOnboardingChannel(this.dataset.catalogId)">
            <span class="onboarding-channel-avatar" aria-hidden="true">${avatar}</span>
            <span class="onboarding-channel-copy">
              <span class="onboarding-channel-name">${escHtml(channel.name)}</span>
              <span class="onboarding-channel-meta">${escHtml(t(ONBOARDING_CHANNEL_STYLE_KEYS[channel.style] || channel.style))}</span>
            </span>
            <span class="onboarding-channel-check" aria-hidden="true">✓</span>
          </button>
        `
      }).join('')
    : `<div class="onboarding-empty">${escHtml(t('onboarding.channels.none'))}</div>`
  content.innerHTML = `
    ${renderOnboardingHeading('onboarding.channels.title', 'onboarding.channels.subtitle')}
    <div class="onboarding-channel-list${recommendations.length >= 4 ? ' onboarding-channel-list-grid' : ''}">${channelMarkup}</div>
    <div class="onboarding-actions">
      <button type="button" class="btn-ghost" onclick="setPersonalizedOnboardingStep('level')" ${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}>${escHtml(t('onboarding.back'))}</button>
      <button type="button" class="btn-primary" onclick="finishPersonalizedOnboarding()" ${personalizedOnboardingState.isApplyingChannels ? 'disabled' : ''}>${escHtml(t(personalizedOnboardingState.isApplyingChannels ? 'onboarding.building' : 'onboarding.build'))}</button>
    </div>
  `
}

function selectOnboardingLanguage(languageId) {
  if (!getLearnerLanguageOption(languageId)) return
  personalizedOnboardingState.languageId = languageId
  if (languageId === 'other') personalizedOnboardingState.levelId = null
  personalizedOnboardingState.selectedChannelCatalogIds = []
  personalizedOnboardingState.channelSelectionsInitialized = false
  renderPersonalizedOnboarding()
}

function continuePersonalizedOnboardingFromLanguage() {
  setPersonalizedOnboardingStep(personalizedOnboardingState.languageId === 'other' ? 'other' : 'level')
}

function selectOnboardingLevel(levelId) {
  if (!getLearnerLevelOption(levelId)) return
  personalizedOnboardingState.levelId = levelId
  personalizedOnboardingState.selectedChannelCatalogIds = []
  personalizedOnboardingState.channelSelectionsInitialized = false
  renderPersonalizedOnboarding()
}

function setPersonalizedOnboardingStep(step) {
  if (!['language', 'level', 'channels', 'other'].includes(step)) return
  if (step !== 'language' && !personalizedOnboardingState.languageId) return
  if (step === 'other' && personalizedOnboardingState.languageId !== 'other') return
  if ((step === 'level' || step === 'channels') && personalizedOnboardingState.languageId === 'other') return
  if (step === 'channels' && !personalizedOnboardingState.levelId) return
  personalizedOnboardingState.step = step
  renderPersonalizedOnboarding()
}

function prepareOnboardingChannelSelections() {
  if (personalizedOnboardingState.channelSelectionsInitialized) return
  personalizedOnboardingState.selectedChannelCatalogIds = getRecommendedChannelCatalog({
    languages: [personalizedOnboardingState.languageId],
    level: personalizedOnboardingState.levelId
  }).slice(0, ONBOARDING_CHANNEL_SELECTION_LIMIT).map(channel => channel.id)
  personalizedOnboardingState.channelSelectionsInitialized = true
}

function toggleOnboardingChannel(catalogId) {
  if (!getCuratedChannelEntry(catalogId) || personalizedOnboardingState.isApplyingChannels) return
  const selectedIds = new Set(personalizedOnboardingState.selectedChannelCatalogIds)
  if (selectedIds.has(catalogId)) selectedIds.delete(catalogId)
  else {
    if (selectedIds.size >= ONBOARDING_CHANNEL_SELECTION_LIMIT) {
      showToast(t('onboarding.channels.limit', { count: ONBOARDING_CHANNEL_SELECTION_LIMIT }), 'warn')
      return
    }
    selectedIds.add(catalogId)
  }
  personalizedOnboardingState.selectedChannelCatalogIds = [...selectedIds]
  renderPersonalizedOnboarding()
}

function resolveCuratedChannelEntry(entry) {
  const cached = curatedChannelResolutionCache.get(entry.id)
  if (cached) return cached
  const request = resolveYoutubeChannelInput(entry.input).catch(error => {
    curatedChannelResolutionCache.delete(entry.id)
    throw error
  })
  curatedChannelResolutionCache.set(entry.id, request)
  return request
}

async function resolveStarterChannelSelections(catalogIds) {
  const entries = catalogIds.map(getCuratedChannelEntry).filter(Boolean)
  if (!entries.length) return { channels: [], failures: [], failedCount: 0, attempted: false }
  if (!hasYoutubeApiKey()) {
    const message = t('toast.channelResolveNeedsKey')
    const failures = entries.map(entry => ({ catalogId: entry.id, name: entry.name, message }))
    return { channels: [], failures, failedCount: failures.length, attempted: false }
  }
  const results = await Promise.allSettled(entries.map(resolveCuratedChannelEntry))
  const channels = []
  const failures = []
  const seenIds = new Set()
  results.forEach((result, index) => {
    const entry = entries[index]
    if (result.status !== 'fulfilled' || !result.value?.id) {
      failures.push({
        catalogId: entry.id,
        name: entry.name,
        message: result.status === 'rejected' ? String(result.reason?.message || result.reason) : t('toast.channelResolveNotFound')
      })
      return
    }
    if (seenIds.has(result.value.id)) return
    seenIds.add(result.value.id)
    channels.push({
      id: result.value.id,
      name: result.value.name || result.value.id,
      imageUrl: getCuratedChannelAvatarPath(entry.id),
      catalogId: entry.id
    })
  })
  return {
    channels,
    failures,
    failedCount: failures.length,
    attempted: true
  }
}

async function finishPersonalizedOnboarding() {
  if (personalizedOnboardingState.isApplyingChannels) return
  personalizedOnboardingState.isApplyingChannels = true
  renderPersonalizedOnboarding()

  const now = new Date().toISOString()
  let state = loadState() || defaultState(4, DEFAULT_CHANNELS)
  normalizeLearnerProfileState(state)
  normalizeOnboardingState(state)
  state.learnerProfile = {
    languages: [personalizedOnboardingState.languageId].filter(Boolean),
    level: personalizedOnboardingState.levelId,
    selectedChannelCatalogIds: personalizedOnboardingState.selectedChannelCatalogIds.slice(0, ONBOARDING_CHANNEL_SELECTION_LIMIT),
    createdAt: state.learnerProfile.createdAt || now,
    updatedAt: now
  }
  saveState(state, { backup: false })

  const resolution = await resolveStarterChannelSelections(state.learnerProfile.selectedChannelCatalogIds)
  if (resolution.failedCount && !resolution.channels.length) {
    personalizedOnboardingState.isApplyingChannels = false
    renderPersonalizedOnboarding()
    const firstFailure = resolution.failures[0]?.message
    const issue = t('onboarding.channelIssue', {
      count: resolution.failedCount,
      plural: resolution.failedCount === 1 ? '' : 's'
    })
    showToast(firstFailure ? `${issue} ${firstFailure}` : issue, 'warn')
    return
  }

  let completionNotice = ''
  if (resolution.failedCount) {
    const firstFailure = resolution.failures[0]?.message
    const issue = t('onboarding.channelIssue', {
      count: resolution.failedCount,
      plural: resolution.failedCount === 1 ? '' : 's'
    })
    completionNotice = firstFailure ? `${issue} ${firstFailure}` : issue
  }

  state = loadState() || state
  const existingIds = new Set((state.config.channels || []).map(channel => channel.id))
  let addedChannelCount = 0
  resolution.channels.forEach(channel => {
    if (!existingIds.has(channel.id)) {
      state.config.channels.push(channel)
      existingIds.add(channel.id)
      addedChannelCount += 1
    }
    state.config.removedChannelIds = (state.config.removedChannelIds || []).filter(channelId => channelId !== channel.id)
  })
  saveState(state, { backup: false })

  let onboardingRefreshResult = null
  if (resolution.channels.length) {
    onboardingRefreshResult = await refreshFeed({
      silent: true,
      channelIds: resolution.channels.map(channel => channel.id),
      trigger: 'onboarding'
    })
    if (!onboardingRefreshResult?.ok) {
      const firstError = onboardingRefreshResult?.errors?.[0]?.message || onboardingRefreshResult?.error?.message
      const videoIssue = firstError ? `${t('onboarding.videoIssue')} ${firstError}` : t('onboarding.videoIssue')
      completionNotice = completionNotice ? `${completionNotice} ${videoIssue}` : videoIssue
    }
    state = loadState() || state
  }

  state.onboarding.version = ONBOARDING_VERSION
  state.onboarding.setupCompleted = true
  state.onboarding.setupCompletedAt = now
  state.onboarding.recommendationsAppliedAt = resolution.attempted ? now : null
  const onboardingDetail = personalizedOnboardingState.levelId
    ? t('log.onboarding.detail', {
        language: t(`onboarding.language.${personalizedOnboardingState.languageId}`),
        level: t(`onboarding.level.${personalizedOnboardingState.levelId}.label`),
        count: resolution.channels.length
      })
    : t('log.onboarding.otherDetail', {
        language: t(`onboarding.language.${personalizedOnboardingState.languageId}`)
      })
  appendActivityLog(state, {
    actor: 'user',
    type: 'onboarding',
    status: 'success',
    title: t('log.onboarding.title'),
    detail: onboardingDetail
  })
  saveState(state)
  window.trackEdeniaEvent?.('onboarding_completed', {
    selected_channel_count: state.learnerProfile.selectedChannelCatalogIds.length,
    added_channel_count: addedChannelCount,
    resolved_channel_count: resolution.channels.length,
    failed_channel_count: resolution.failedCount,
    refresh_result: !onboardingRefreshResult
      ? 'not_requested'
      : (onboardingRefreshResult.ok ? 'success' : 'partial_or_failed')
  })
  queueOnboardingNotice(completionNotice)
  window.location.assign(getNormalAppUrl())
}

function getNormalAppUrl() {
  const url = new URL(window.location.href)
  url.search = ''
  return url.toString()
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

function isMobileLayout() {
  return Boolean(window.matchMedia?.('(max-width: 640px)').matches)
}

function syncMobileAddButtonWidth() {
  const addControl = document.getElementById('manualVideo')
  const undoRedoControl = document.querySelector('.feed-action-controls .undo-wrap')
  const shouldShrinkAddControl = Boolean(window.matchMedia?.('(max-aspect-ratio: 590/736)').matches)
  if (!addControl) return

  addControl.style.removeProperty('flex')
  addControl.style.removeProperty('width')
  if (!undoRedoControl || (!isMobileLayout() && !shouldShrinkAddControl)) return

  const undoRedoWidth = undoRedoControl.getBoundingClientRect().width
  if (undoRedoWidth <= 0) return
  const addControlWidth = shouldShrinkAddControl ? undoRedoWidth / 2 : undoRedoWidth
  addControl.style.flex = `0 0 ${addControlWidth}px`
  addControl.style.width = `${addControlWidth}px`
}

function getWalkthroughTargetSelector(step) {
  if (!step) return ''
  return isMobileLayout() && step.mobileTarget ? step.mobileTarget : step.target
}

function getWalkthroughTarget(step) {
  const selector = getWalkthroughTargetSelector(step)
  return selector ? document.querySelector(selector) : null
}

function showWalkthroughAgain() {
  if (isMobileLayout()) openSettings.returnFocus = null
  closeSettings()
  window.setTimeout(() => startWalkthrough(WALKTHROUGH_STEPS, { manual: true }), 120)
}

function showTrailerAgain() {
  closeSettings()
  window.setTimeout(() => startIntroTrailer({ replay: true }), 120)
}

function startWalkthrough(steps = WALKTHROUGH_STEPS, options = {}) {
  const availableSteps = steps.filter(step => getWalkthroughTarget(step))
  if (!availableSteps.length) return
  if (walkthroughState.active) endWalkthrough({ markCompleted: false })

  walkthroughState.active = true
  walkthroughState.steps = availableSteps
  walkthroughState.index = clampNumber(options.startIndex || 0, 0, availableSteps.length - 1)
  ensureWalkthroughElements()
  document.body.classList.add('walkthrough-active')
  if (isMobileLayout()) document.activeElement?.blur?.()
  syncHeaderCompactState()
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
  const target = getWalkthroughTarget(step)
  if (!target || !isWalkthroughTargetVisible(target)) {
    window.setTimeout(() => moveWalkthrough(1), 0)
    return
  }

  const elements = ensureWalkthroughElements()
  elements.progress.textContent = t('walkthrough.progress', { current: walkthroughState.index + 1, total: walkthroughState.steps.length })
  const textKey = isMobileLayout() && step.mobileTextKey ? step.mobileTextKey : step.textKey
  elements.text.textContent = textKey ? t(textKey) : step.text
  elements.back.disabled = walkthroughState.index === 0
  elements.next.disabled = step.advanceOn === 'target-click'
  elements.back.textContent = t('walkthrough.back')
  elements.skip.textContent = t('walkthrough.skip')
  elements.next.textContent = step.actionLabelKey
    ? t(step.actionLabelKey)
    : (walkthroughState.index === walkthroughState.steps.length - 1 ? t('walkthrough.done') : t('walkthrough.next'))
  elements.card.classList.toggle('walkthrough-card-waiting', step.advanceOn === 'target-click')
  elements.card.classList.toggle('walkthrough-card-no-arrow', step.showArrow === false)

  const scrollTarget = step.scrollTarget ? document.querySelector(step.scrollTarget) : target
  scrollTarget.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center'
  })
  scheduleWalkthroughPosition()
  window.setTimeout(scheduleWalkthroughPosition, 220)
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
  syncHeaderCompactState()
  window.removeEventListener('resize', scheduleWalkthroughPosition)
  window.removeEventListener('scroll', scheduleWalkthroughPosition, true)
  document.removeEventListener('click', handleWalkthroughTargetClick)
  document.removeEventListener('keydown', handleWalkthroughKey)
  runWalkthroughHooks(currentStep, 'afterExit', { completed: markCompleted })
  if (markCompleted) completeWalkthrough()
}

function handleWalkthroughTargetClick(event) {
  if (!walkthroughState.active) return
  const step = walkthroughState.steps[walkthroughState.index]
  const selector = getWalkthroughTargetSelector(step)
  const target = selector ? event.target.closest(selector) : null
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
  const target = getWalkthroughTarget(step)
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

function resetSandboxState() {
  if (!IS_SANDBOX) return
  createStateBackup('before sandbox reset', { force: true })
  const state = createEmptySandboxState()
  appendActivityLog(state, {
    actor: 'user',
    type: 'reset',
    status: 'warn',
    title: t('log.sandboxReset.title'),
    detail: t('log.sandboxReset.detail')
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
      title: t('sandbox.video.addedDay', { date: dateKey, index: i + 1 }),
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
    title: t('sandbox.video.upcoming', { date: dateKey }),
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
    for (let i = 0; i < SANDBOX_VIDEOS_PER_CHANNEL; i += 1) {
      const publishedAt = new Date(now)
      publishedAt.setHours(now.getHours() - (channelIndex * SANDBOX_VIDEOS_PER_CHANNEL + i) * 6)
      videos.push({
        id: `sandbox-refresh-${channel.id}-${i}`,
        title: t('sandbox.video.recent', { channel: channelIndex + 1, index: i + 1 }),
        channelId: channel.id,
        channelTitle: channel.name || channel.id,
        channelImageUrl: channel.imageUrl || '',
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
  const panel = document.getElementById('settingsPanel')
  const main = document.getElementById('mainApp')
  if (panel?.classList.contains('hidden')) openSettings.returnFocus = document.activeElement
  const s = loadState()
  document.getElementById('settingsGoal').value   = s.config.weeklyGoalHours
  applyLocale(s.config.locale)
  document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(s.config.includeShorts)
  document.getElementById('settingsAnkiEnabled').checked = isAnkiEnabled(s)
  document.getElementById('settingsInsightsEnabled').checked = isStudyInsightsEnabled(s)
  renderChannelList(s.config.channels)
  renderBackupList()
  mobileActivityLogVisibleCount = 20
  renderActivityLog(s)
  setSettingsHowToOpen(false)
  setSettingsActivityLogOpen(false)
  setSettingsBackupsOpen(false)
  closeLocaleMenu()
  show('settingsPanel')
  const drawer = panel?.querySelector('.settings-drawer')
  if (drawer && isMobileLayout()) drawer.scrollTop = 0
  if (main) main.inert = true
  window.setTimeout(() => document.getElementById('settingsCloseBtn')?.focus(), 0)
}

function closeSettings() {
  const panel = document.getElementById('settingsPanel')
  if (!panel || panel.classList.contains('hidden')) return
  hide('settingsPanel')
  const main = document.getElementById('mainApp')
  if (main) main.inert = false
  const returnFocus = openSettings.returnFocus
  openSettings.returnFocus = null
  if (returnFocus?.isConnected) window.setTimeout(() => returnFocus.focus(), 0)
}

function setSettingsAccordionOpen(contentId, toggleSelector, groupSelector, isOpen) {
  const content = document.getElementById(contentId)
  const toggle = document.querySelector(toggleSelector)
  const group = document.querySelector(groupSelector)
  if (!content || !toggle || !group) return
  content.hidden = !isOpen
  toggle.setAttribute('aria-expanded', String(isOpen))
  group.classList.toggle('open', isOpen)
}

function setSettingsHowToOpen(isOpen) {
  setSettingsAccordionOpen('settingsHowToContent', '.settings-howto-toggle', '.settings-howto-group', isOpen)
  const drawer = document.querySelector('#settingsPanel .settings-drawer')
  drawer?.classList.toggle('settings-howto-mode', Boolean(isOpen && isMobileLayout()))
  if (drawer && isMobileLayout()) drawer.scrollTop = 0
}

function toggleSettingsHowTo() {
  const content = document.getElementById('settingsHowToContent')
  if (!content) return
  setSettingsHowToOpen(content.hidden)
}

function setSettingsActivityLogOpen(isOpen) {
  setSettingsAccordionOpen('activityLogContent', '.activity-log-toggle', '.activity-log-panel', isOpen)
}

function toggleSettingsActivityLog() {
  const content = document.getElementById('activityLogContent')
  if (!content) return
  setSettingsActivityLogOpen(content.hidden)
}

function setSettingsBackupsOpen(isOpen) {
  setSettingsAccordionOpen('backupContent', '.backup-toggle', '.backup-panel', isOpen)
}

function toggleSettingsBackups() {
  const content = document.getElementById('backupContent')
  if (!content) return
  setSettingsBackupsOpen(content.hidden)
}

function handleSettingsKeydown(event) {
  const panel = document.getElementById('settingsPanel')
  if (!panel || panel.classList.contains('hidden')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSettings()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = Array.from(panel.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.hidden && !el.closest('.hidden') && !el.closest('[hidden]') && el.getClientRects().length)
  if (!focusable.length) {
    event.preventDefault()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

async function saveSettingsOnTheFly() {
  const s      = loadState()
  normalizeStudyInsightConfig(s)
  const previousGoal = normalizeWeeklyGoalHours(s.config.weeklyGoalHours)
  const previousIncludeShorts = normalizeIncludeShorts(s.config.includeShorts)
  const previousAnkiEnabled = isAnkiEnabled(s)
  const previousInsightsEnabled = isStudyInsightsEnabled(s)
  const goal   = normalizeWeeklyGoalHours(document.getElementById('settingsGoal').value)
  const nextAnkiEnabled = Boolean(document.getElementById('settingsAnkiEnabled')?.checked)
  const nextInsightsEnabled = Boolean(document.getElementById('settingsInsightsEnabled')?.checked)
  const ankiPreferenceChanged = nextAnkiEnabled !== previousAnkiEnabled
  const insightsPreferenceChanged = nextInsightsEnabled !== previousInsightsEnabled
  const now = new Date().toISOString()

  if (ankiPreferenceChanged && previousAnkiEnabled && !nextAnkiEnabled && !IS_SANDBOX) {
    try {
      const stats = await fetchAnkiStats()
      applyAnkiStatsToState(s, stats)
    } catch {
      ankiStatsCache = null
    }
  }

  if (ankiPreferenceChanged && !previousAnkiEnabled && nextAnkiEnabled && !IS_SANDBOX) {
    try {
      const stats = await fetchAnkiStats()
      setAnkiResumeBaselineFromStats(s, stats, now)
    } catch {
      setPendingAnkiResumeBaseline(s, getCurrentAnkiDateKey(), now)
    }
  }

  s.config.weeklyGoalHours = goal
  s.config.includeShorts = Boolean(document.getElementById('settingsIncludeShorts')?.checked)
  const shortsWereEnabled = !previousIncludeShorts && normalizeIncludeShorts(s.config.includeShorts)
  s.config.ankiEnabled = nextAnkiEnabled
  s.config.ankiDisabledAt = nextAnkiEnabled ? null : now
  s.config.studyInsights.enabled = nextInsightsEnabled
  document.getElementById('settingsGoal').value = goal
  if (goal !== previousGoal) {
    appendActivityLog(s, {
      actor: 'user',
      type: 'weekly-goal',
      status: 'success',
      title: t('log.weeklyGoal.title'),
      detail: t('log.weeklyGoal.detail', { from: previousGoal, to: goal })
    })
  }
  if (normalizeIncludeShorts(s.config.includeShorts) !== previousIncludeShorts) {
    appendActivityLog(s, {
      actor: 'user',
      type: 'short-videos',
      status: 'success',
      title: t('log.shortVideos.title'),
      detail: t(normalizeIncludeShorts(s.config.includeShorts) ? 'log.shortVideos.shown' : 'log.shortVideos.hidden')
    })
  }
  if (ankiPreferenceChanged) {
    appendActivityLog(s, {
      actor: 'user',
      type: 'anki-setting',
      status: 'success',
      title: t('log.ankiSetting.title'),
      detail: t(isAnkiEnabled(s) ? 'log.ankiSetting.enabled' : 'log.ankiSetting.disabled')
    })
    syncStreak(s)
  }
  if (insightsPreferenceChanged) {
    appendActivityLog(s, {
      actor: 'user',
      type: 'study-insights-setting',
      status: 'success',
      title: t('log.insightsSetting.title'),
      detail: t(nextInsightsEnabled ? 'log.insightsSetting.shown' : 'log.insightsSetting.hidden')
    })
  }
  saveState(s)
  if (ankiPreferenceChanged) applyAnkiRefreshPreference(s)
  renderAll(s)
  renderActivityLog(s)
  if (shortsWereEnabled) refetchAllChannelsAfterShortsEnabled()
  else if (!normalizeIncludeShorts(s.config.includeShorts)) repairStoredShortsDetection()
}

function saveLocaleFromSettings(locale = null) {
  const s = loadState()
  if (!s?.config) return
  const previousLocale = normalizeLocale(s.config.locale)
  const selectedInput = document.querySelector('input[name="settingsLocale"]:checked')
  const nextLocale = normalizeLocale(locale || selectedInput?.value)
  if (previousLocale === nextLocale) return

  s.config.locale = nextLocale
  applyLocale(nextLocale)
  closeLocaleMenu()
  appendActivityLog(s, {
    actor: 'user',
    type: 'locale',
    status: 'success',
    title: t('log.locale.title'),
    detail: t('log.locale.detail', { language: getLocaleLabel(nextLocale) })
  })
  saveState(s)
  updateDocumentTitle(s)
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
    state: {
      ...state,
      videoWatchReminders: {}
    }
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
          title: t('log.rollback.title'),
          detail: t('log.rollback.beforeImport')
        })
      }
      appendActivityLog(normalizedState, {
        actor: 'user',
        type: 'import',
        status: 'success',
        title: t('log.syncImported.title'),
        detail: file.name || t('log.syncImported.detail')
      })
      syncStreak(normalizedState)
      saveState(normalizedState, { backup: false })
      applyLocale(normalizedState.config.locale)
      updateDocumentTitle(normalizedState)
      applyTheme(normalizedState.config.theme)
      setDefaultCityDayOffset(normalizedState)
      renderAll(normalizedState)
      if (!normalizeIncludeShorts(normalizedState.config.includeShorts)) repairStoredShortsDetection()
      renderChannelList(normalizedState.config.channels)
      renderBackupList()
      renderActivityLog(normalizedState)
      document.getElementById('settingsGoal').value = normalizedState.config.weeklyGoalHours
      renderLocaleSelect()
      document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(normalizedState.config.includeShorts)
      document.getElementById('settingsAnkiEnabled').checked = isAnkiEnabled(normalizedState)
      document.getElementById('settingsInsightsEnabled').checked = isStudyInsightsEnabled(normalizedState)
      applyAnkiRefreshPreference(normalizedState)
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
  const key = {
    'automatic backup': 'backups.automatic',
    'before automatic cleanup': 'backups.reason.automaticCleanup',
    'before sandbox reset': 'backups.reason.sandboxReset',
    'before sync import': 'backups.reason.syncImport',
    'before backup restore': 'backups.reason.backupRestore',
    'before reset': 'backups.reason.reset'
  }[String(reason || 'automatic backup')]
  return key ? t(key) : String(reason || t('backups.automatic'))
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
  mobileActivityLogVisibleCount = 20
  renderActivityLog()
}

function getFilteredActivityLogEntries(state) {
  const entries = Array.isArray(state?.activityLog) ? state.activityLog : []
  if (selectedActivityLogFilter === 'user') return entries.filter(entry => entry.actor === 'user')
  if (selectedActivityLogFilter === 'auto') return entries.filter(entry => entry.actor === 'auto')
  if (selectedActivityLogFilter === 'issues') return entries.filter(entry => ['warn', 'error'].includes(entry.status))
  return entries
}

function getPointActivityLogEntries(state) {
  const entries = []
  const end = getCurrentAppDate(state)
  end.setHours(23, 59, 59, 999)
  const history = getStudyHistoryBetween(state || { videos: {}, anki: {} }, new Date(0), end)

  history.rows.forEach(row => {
    const ankiPoints = getAnkiPointsFromReviews(row.ankiReviewed || 0)
    if (ankiPoints > 0) {
      entries.push({
        createdAt: `${row.dateKey}T23:59:59`,
        status: 'success',
        points: ankiPoints,
        title: t('activity.points.ankiTitle', { count: row.ankiReviewed }),
        detail: formatHeatmapTitle(row)
      })
    }

    ;(row.watchedVideos || []).forEach(video => {
      const videoPoints = getVideoPointsFromSeconds(video.duration || 0)
      if (videoPoints <= 0) return
      entries.push({
        createdAt: video.watchedAt || `${row.dateKey}T23:59:59`,
        status: 'success',
        points: videoPoints,
        title: t('activity.points.videoTitle', {
          time: formatHistoryTime(video.duration || 0),
          title: video.title || t('videos.search.untitled')
        }),
        detail: formatHeatmapTitle(row)
      })
    })
  })

  const pointDeltas = (Array.isArray(state?.activityLog) ? state.activityLog : [])
    .filter(entry => entry?.type === 'point-delta' && Number(entry.meta?.pointsDelta || 0) !== 0)
    .map(entry => ({
      createdAt: entry.createdAt,
      status: entry.status || (Number(entry.meta?.pointsDelta || 0) < 0 ? 'warn' : 'success'),
      points: Number(entry.meta?.pointsDelta || 0),
      title: entry.title || t('activity.pointsLabel'),
      detail: entry.detail || ''
    }))

  return entries
    .concat(pointDeltas)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function formatActivityLogLabel(entry) {
  const actor = entry.actor === 'auto' ? t('activity.auto') : t('activity.user')
  const status = entry.status === 'error' ? t('activity.error') : entry.status === 'warn' ? t('activity.warn') : entry.status === 'success' ? t('activity.done') : t('activity.info')
  return `${actor} · ${status}`
}

function groupMobileActivityLogEntries(entries) {
  if (!isMobileLayout()) return entries

  return entries.reduce((grouped, entry) => {
    const previous = grouped[grouped.length - 1]
    const canGroup = entry?.actor === 'auto'
      && entry?.type === 'anki-refresh'
      && previous?.actor === 'auto'
      && previous?.type === 'anki-refresh'
      && previous?.status === entry.status
      && previous?.title === entry.title
      && previous?.detail === entry.detail

    if (canGroup) {
      previous.mobileRepeatCount = (previous.mobileRepeatCount || 1) + 1
      return grouped
    }

    grouped.push({ ...entry, mobileRepeatCount: 1 })
    return grouped
  }, [])
}

function getMobileActivityLogPage(entries, { groupAnki = false } = {}) {
  const prepared = groupAnki ? groupMobileActivityLogEntries(entries) : entries
  if (!isMobileLayout()) return { entries: prepared, totalCount: prepared.length }
  return {
    entries: prepared.slice(0, mobileActivityLogVisibleCount),
    totalCount: prepared.length
  }
}

function appendMobileActivityLogMoreButton(list, totalCount) {
  if (!isMobileLayout() || totalCount <= mobileActivityLogVisibleCount) return
  list.insertAdjacentHTML('beforeend', `
    <button class="btn-ghost activity-log-more" type="button" onclick="showOlderActivityLogEntries()">${escHtml(t('activity.showOlder'))}</button>
  `)
}

function showOlderActivityLogEntries() {
  mobileActivityLogVisibleCount += 20
  renderActivityLog()
}

function renderPointActivityLog(state, list) {
  const allEntries = getPointActivityLogEntries(state)
  if (!allEntries.length) {
    list.innerHTML = `<p class="activity-log-empty">${escHtml(t('activity.points.empty'))}</p>`
    return
  }

  const page = getMobileActivityLogPage(allEntries)

  list.innerHTML = page.entries.map(entry => `
    <div class="activity-log-item">
      <div class="activity-log-row">
        <span class="activity-log-time">${escHtml(formatActivityLogTimestamp(entry.createdAt))}</span>
        <span class="activity-log-chip ${entry.points < 0 ? 'warn' : 'success'}">${escHtml(t('activity.pointsLabel'))} · ${escHtml(formatSignedActivityLogPointLabel(entry.points))}</span>
      </div>
      <div class="activity-log-title">${escHtml(entry.title)}</div>
      ${entry.detail ? `<p class="activity-log-detail">${escHtml(entry.detail)}</p>` : ''}
    </div>
  `).join('')
  appendMobileActivityLogMoreButton(list, page.totalCount)
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
  if (selectedActivityLogFilter === 'points') {
    renderPointActivityLog(state, list)
    return
  }

  const allEntries = getFilteredActivityLogEntries(state)
  if (!allEntries.length) {
    list.innerHTML = `<p class="activity-log-empty">${escHtml(t('activity.empty'))}</p>`
    return
  }

  const page = getMobileActivityLogPage(allEntries, { groupAnki: true })

  list.innerHTML = page.entries.map(entry => `
    <div class="activity-log-item">
      <div class="activity-log-row">
        <span class="activity-log-time">${escHtml(formatActivityLogTimestamp(entry.createdAt))}</span>
        <span class="activity-log-chip ${escHtml(entry.status)}">${escHtml(formatActivityLogLabel(entry))}</span>
        ${entry.mobileRepeatCount > 1 ? `<span class="activity-log-repeat">×${entry.mobileRepeatCount}</span>` : ''}
      </div>
      <div class="activity-log-title">${escHtml(entry.title)}</div>
      ${entry.detail ? `<p class="activity-log-detail">${escHtml(entry.detail)}</p>` : ''}
    </div>
  `).join('')
  appendMobileActivityLogMoreButton(list, page.totalCount)
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
      title: t('log.rollback.title'),
      detail: t('log.rollback.beforeRestore')
    })
  }
  appendActivityLog(state, {
    actor: 'user',
    type: 'backup-restore',
    status: 'success',
    title: t('log.backupRestored.title'),
    detail: formatBackupTimestamp(entry.createdAt)
  })
  saveState(state, { backup: false })
  applyLocale(state.config.locale)
  updateDocumentTitle(state)
  applyTheme(state.config.theme)
  setDefaultCityDayOffset(state)
  renderAll(state)
  if (!normalizeIncludeShorts(state.config.includeShorts)) repairStoredShortsDetection()
  renderChannelList(state.config.channels)
  renderBackupList()
  renderActivityLog(state)
  document.getElementById('settingsGoal').value = state.config.weeklyGoalHours
  renderLocaleSelect()
  document.getElementById('settingsIncludeShorts').checked = normalizeIncludeShorts(state.config.includeShorts)
  document.getElementById('settingsAnkiEnabled').checked = isAnkiEnabled(state)
  document.getElementById('settingsInsightsEnabled').checked = isStudyInsightsEnabled(state)
  applyAnkiRefreshPreference(state)
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
    videoWatchReminders: {},
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
    title: t('log.theme.title'),
    detail: t(s.config.theme === 'dark' ? 'log.theme.dark' : 'log.theme.light')
  })
  saveState(s)
  applyTheme(s.config.theme)
  renderActivityLog(s)
}

function addTrackedYoutubeChannelToState(state, channel) {
  const id = String(channel?.id || '').trim()
  if (!state?.config || !id) return false

  if (!Array.isArray(state.config.channels)) state.config.channels = []
  const existing = state.config.channels.find(entry => entry.id === id)
  if (existing) {
    if (!existing.name && channel.name) existing.name = channel.name
    if (!existing.imageUrl && channel.imageUrl) existing.imageUrl = channel.imageUrl
  } else {
    state.config.channels.push({
      id,
      name: channel.name || id,
      imageUrl: channel.imageUrl || ''
    })
    state.config.channelShelfOrder = [
      id,
      ...normalizeChannelShelfOrder(state.config.channelShelfOrder).filter(channelId => channelId !== id)
    ]
  }

  state.config.removedChannelIds = (state.config.removedChannelIds || []).filter(channelId => channelId !== id)
  restoreChannelVideosToGrid(state, id)
  if (isDefaultChannelId(id)) {
    state.config.removedDefaultChannelIds = (state.config.removedDefaultChannelIds || []).filter(channelId => channelId !== id)
  }
  selectedChannelFilters?.add(id)
  return !existing
}

async function addChannel(options = {}) {
  const idEl = options.input
    || document.getElementById('channelFilterAddInput')
    || document.getElementById('newChannelId')
  const btn = options.button || document.getElementById('channelFilterAddBtn')
  const idleButtonText = options.idleButtonText || t('settings.channels.add')
  const addedFromFilter = !options.input && Boolean(document.getElementById('channelFilterAddInput'))
  const raw    = idEl?.value?.trim() || ''
  let resolved

  try {
    resolved = await resolveYoutubeChannelInput(raw)
  } catch (err) {
    showToast(err.message || t('toast.channelInvalid'), 'warn')
    idEl?.focus()
    return
  }

  if (btn) {
    btn.disabled = true
    btn.textContent = t('videos.manual.adding')
  }

  const id   = resolved.id
  const name = resolved.name || id
  const s = loadState()
  if (s.config.channels.find(c => c.id === id)) {
    if (btn) {
      btn.disabled = false
      btn.textContent = idleButtonText
    }
    showToast(t('toast.channelDuplicate'), 'warn')
    return
  }
  addTrackedYoutubeChannelToState(s, { id, name, imageUrl: resolved.thumbnail || '' })
  appendActivityLog(s, {
    actor: 'user',
    type: 'channel-add',
    status: 'success',
    title: t('log.channelAdded.title'),
    detail: name,
    meta: { channelId: id }
  })
  saveState(s)
  renderFeed(s)
  renderActivityLog(s)
  if (idEl) idEl.value = ''
  if (btn) {
    btn.disabled = false
    btn.textContent = idleButtonText
  }
  if (options.closePopover) closeManualVideoPopover()
  if (addedFromFilter && isMobileLayout()) closeChannelFilterMenu()
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

function addChannelFromFilter(event) {
  event?.preventDefault()
  event?.stopPropagation()
  addChannel()
}

function removeChannelFromFilter(event, channelId) {
  event?.preventDefault()
  event?.stopPropagation()
  removeChannel(channelId)
}

function removeChannel(id) {
  const s = loadState()
  const channel = s.config.channels.find(c => c.id === id) || getInferredChannelEntry(s, id)
  if (!channel) return
  const before = getChannelRemoveSnapshot(s, id, channel)

  applyChannelRemoval(s, id)
  const after = getChannelRemoveSnapshot(s, id)
  pushUndoAction(s, {
    type: 'channel-remove',
    channelId: id,
    channelName: channel.name || id,
    before,
    after
  })
  appendActivityLog(s, {
    actor: 'user',
    type: 'channel-remove',
    status: 'success',
    title: t('log.channelRemoved.title'),
    detail: channel?.name || id,
    meta: { channelId: id }
  })
  saveState(s)
  renderAll(s)
  renderActivityLog(s)
}

function applyChannelRemoval(s, channelId) {
  const refreshes = getChannelRefreshes(s)
  s.config.channels = (s.config.channels || []).filter(c => c.id !== channelId)
  delete refreshes[channelId]
  if (!Array.isArray(s.config.removedChannelIds)) s.config.removedChannelIds = []
  if (!s.config.removedChannelIds.includes(channelId)) {
    s.config.removedChannelIds.push(channelId)
  }
  if (!Array.isArray(s.config.removedDefaultChannelIds)) s.config.removedDefaultChannelIds = []
  if (isDefaultChannelId(channelId) && !s.config.removedDefaultChannelIds.includes(channelId)) {
    s.config.removedDefaultChannelIds.push(channelId)
  }
  Object.values(s.videos || {}).forEach(video => {
    if (!isChannelRemovalVideo(video, channelId)) return
    if (getVideoStatus(video) === 'watched' || isSavedActiveVideo(video)) {
      video.hiddenFromGrid = false
      video.hiddenFromGridAt = null
      return
    }
    video.hiddenFromGrid = true
    video.hiddenFromGridAt = getCurrentAppTimestamp(s)
  })
}

function restoreChannelVideosToGrid(s, channelId) {
  Object.values(s.videos || {}).forEach(video => {
    if (!isChannelRemovalVideo(video, channelId)) return
    video.hiddenFromGrid = false
    video.hiddenFromGridAt = null
  })
}

function getChannelRemoveSnapshot(s, channelId, channel = null) {
  const refreshes = getChannelRefreshes(s)
  return {
    channel: channel
      ? { ...channel }
      : (s.config.channels || []).find(c => c.id === channelId) || null,
    refresh: refreshes[channelId] ? { ...refreshes[channelId] } : null,
    removedChannelIds: [...(s.config.removedChannelIds || [])],
    removedDefaultChannelIds: [...(s.config.removedDefaultChannelIds || [])],
    videos: Object.fromEntries(Object.entries(s.videos || {})
      .filter(([, video]) => isChannelRemovalVideo(video, channelId))
      .map(([videoId, video]) => [videoId, cloneVideoForHistoryAction(video)]))
  }
}

function getInferredChannelEntry(s, channelId) {
  const video = Object.values(s.videos || {}).find(candidate => isChannelRemovalVideo(candidate, channelId))
  return video ? { id: channelId, name: video.channelTitle || channelId } : null
}

function isChannelRemovalVideo(video, channelId) {
  return Boolean(
    video &&
    (video.channelId || video.channelTitle) === channelId
  )
}

function renderChannelList(channels) {
  const el = document.getElementById('channelList')
  if (!el) return
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
    title: t('log.reset.title'),
    detail: t('log.reset.detail')
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
    name: item.snippet?.title || item.id,
    thumbnail: getBestThumbnail(item.snippet?.thumbnails)
  }
}

async function resolveYoutubeChannelInput(value) {
  const parsed = parseYoutubeChannelInput(value)
  if (!parsed) throw new Error(t('toast.channelInvalid'))
  if (parsed.kind === 'id') {
    if (hasYoutubeApiKey()) return fetchYoutubeChannelByFilter('id', parsed.channelId)
    return { id: parsed.channelId, name: parsed.channelId }
  }
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

async function hydrateYoutubeChannelProfiles(channels = []) {
  const missingChannels = Array.from(new Map(
    channels
      .filter(channel => channel?.id && !channel.imageUrl)
      .map(channel => [channel.id, channel])
  ).values())
  let updatedCount = 0

  for (let index = 0; index < missingChannels.length; index += 50) {
    const batch = missingChannels.slice(index, index + 50)
    const ids = batch.map(channel => channel.id).join(',')
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(ids)}&key=${encodeURIComponent(getYoutubeApiKey())}`
    const data = await ytFetch(url)
    const profiles = new Map((data.items || []).map(item => [item.id, item]))

    batch.forEach(channel => {
      const profile = profiles.get(channel.id)
      const imageUrl = getBestThumbnail(profile?.snippet?.thumbnails)
      if (!imageUrl) return
      channel.imageUrl = imageUrl
      updatedCount += 1
    })
  }

  return updatedCount
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
  if (!item) throw new Error(t('toast.videoNotFound'))
  const channelId = item.snippet?.channelId || 'manual-youtube'
  const channelProfile = YOUTUBE_CHANNEL_ID_RE.test(channelId)
    ? await fetchYoutubeChannelByFilter('id', channelId).catch(err => {
        console.warn('Could not load the manually added video channel profile:', err)
        return null
      })
    : null
  return {
    id: item.id,
    title: item.snippet?.title || t('videos.search.untitled'),
    channelTitle: item.snippet?.channelTitle || t('videos.search.youtube'),
    channelId,
    channelImageUrl: channelProfile?.thumbnail || '',
    thumbnail: getBestThumbnail(item.snippet?.thumbnails) || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`,
    publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
    duration: parseDuration(item.contentDetails?.duration),
    source: 'manual',
    manuallyAdded: true
  }
}

async function hydrateStoredManualVideoChannelImages() {
  if (IS_SANDBOX || !hasYoutubeApiKey() || hydrateStoredManualVideoChannelImages._running) return

  const initialState = loadState()
  const channelIds = Array.from(new Set(
    Object.values(initialState?.videos || {})
      .filter(video => video?.manuallyAdded && !video.channelImageUrl && YOUTUBE_CHANNEL_ID_RE.test(video.channelId || ''))
      .map(video => video.channelId)
  ))
  if (!channelIds.length) return

  hydrateStoredManualVideoChannelImages._running = true
  try {
    const channelProfiles = channelIds.map(id => ({ id, imageUrl: '' }))
    await hydrateYoutubeChannelProfiles(channelProfiles)
    const imageUrlsByChannelId = new Map(
      channelProfiles
        .filter(channel => channel.imageUrl)
        .map(channel => [channel.id, channel.imageUrl])
    )
    if (!imageUrlsByChannelId.size) return

    const state = loadState()
    let changed = false
    Object.values(state?.videos || {}).forEach(video => {
      if (!video?.manuallyAdded || video.channelImageUrl) return
      const imageUrl = imageUrlsByChannelId.get(video.channelId)
      if (!imageUrl) return
      video.channelImageUrl = imageUrl
      changed = true
    })
    if (changed) {
      saveState(state)
      renderFeed(state)
    }
  } catch (err) {
    console.warn('Could not load stored manual video channel profiles:', err)
  } finally {
    hydrateStoredManualVideoChannelImages._running = false
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
  let filteredShorts = 0
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
    filteredShorts += page.videos.length - acceptedVideos.length
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

  return { videos: fetched, filteredShorts }
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
      hiddenFromGrid: Boolean(existing?.hiddenFromGrid || v.hiddenFromGrid),
      hiddenFromGridAt: existing?.hiddenFromGridAt || v.hiddenFromGridAt || null,
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
        title: t('log.shortsChecked.title'),
        detail: t('log.shortsChecked.detail', { checked: checkedCount, shorts: shortCount }),
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
        title: t('log.shortsCheckFailed.title'),
        detail: err.message || t('log.shortsCheckFailed.detail')
      })
      saveState(s)
    }
  } finally {
    repairStoredShortsDetection._running = false
  }
}

function formatSkippedShortsMessage(skippedShorts, loadedVideos = 0) {
  if (!skippedShorts) return ''
  const showSettingsHint = loadedVideos < ACTIVE_VIDEOS_PER_CHANNEL
    && skippedShorts >= ACTIVE_VIDEOS_PER_CHANNEL
  const key = showSettingsHint ? 'toast.skippedShortsSettingsHint' : 'toast.skippedShorts'
  return t(key, { count: skippedShorts, plural: skippedShorts === 1 ? '' : 's' })
}

function refetchAllChannelsAfterShortsEnabled() {
  if (IS_SANDBOX || !hasYoutubeApiKey() || shortsEnableRefetchPromise) return shortsEnableRefetchPromise

  const state = loadState()
  const refetchAvailableAt = new Date(state?.config?.shortsEnableRefetchAvailableAt).getTime()
  if (Number.isFinite(refetchAvailableAt) && Date.now() < refetchAvailableAt) return null

  const channelIds = (state?.config?.channels || []).map(channel => channel.id).filter(Boolean)
  if (!channelIds.length) return null

  const input = document.getElementById('settingsIncludeShorts')
  if (input) input.disabled = true
  showToast(t('toast.shortsRefetching'))

  const request = refreshFeed({
    silent: false,
    channelIds,
    trigger: 'shorts_enabled'
  }).then(result => {
    const latestState = loadState()
    if (latestState?.config) {
      const cooldownMs = result?.successfulChannels > 0
        ? SHORTS_ENABLE_REFETCH_COOLDOWN_MS
        : YOUTUBE_REFRESH_ERROR_BACKOFF_MS
      latestState.config.shortsEnableRefetchAvailableAt = new Date(Date.now() + cooldownMs).toISOString()
      saveState(latestState, { backup: false })
    }
    return result
  }).finally(() => {
    if (shortsEnableRefetchPromise === request) shortsEnableRefetchPromise = null
    if (input) input.disabled = false
  })
  shortsEnableRefetchPromise = request
  return request
}

async function refreshFeed({ silent = false, channelIds = null, trigger = 'automatic' } = {}) {
  const btn = document.getElementById('refreshBtn')
  if (btn) {
    btn.textContent = `↻ ${t('videos.refreshing')}`
    btn.classList.add('loading')
    btn.disabled = true
  }

  try {
    if (IS_SANDBOX) {
      refreshSandboxFeed()
      return { ok: true, sandbox: true }
    }

    const s = loadState()
    if (!hasYoutubeApiKey()) {
      showToast(t('toast.apiKeyMissing'), 'warn')
      return { ok: false, reason: 'missing-key', errors: [] }
    }
    if (!s.config.channels.length) {
      showToast(t('toast.addChannelFirst'), 'warn')
      return { ok: false, reason: 'no-channels', errors: [] }
    }
    const requestedChannelIds = Array.isArray(channelIds) ? new Set(channelIds) : null
    const channelsToRefresh = requestedChannelIds
      ? s.config.channels.filter(channel => requestedChannelIds.has(channel.id))
      : getDueYoutubeChannels(s)
    if (!channelsToRefresh.length) {
      if (!silent) showToast(t('toast.nextRefresh', { time: formatRefreshWait(getYoutubeRefreshRemainingMs(s)) }), 'warn')
      return { ok: true, skipped: true, mergedCount: 0, successfulChannels: 0, errors: [] }
    }

    const all    = []
    const errors = []
    let successfulChannels = 0
    let filteredShortsDuringFetch = 0
    const includeShorts = normalizeIncludeShorts(s.config.includeShorts)

    try {
      await hydrateYoutubeChannelProfiles(channelsToRefresh)
    } catch (err) {
      console.warn('Channel profile pictures:', err.message)
    }

    await Promise.all(channelsToRefresh.map(async ch => {
      try {
        const { videos: vids, filteredShorts } = await fetchChannelVideos(ch, s.videos, { includeShorts })
        successfulChannels += 1
        all.push(...vids)
        filteredShortsDuringFetch += filteredShorts
        const first = vids[0]
        if (first?.channelTitle && first.channelTitle !== ch.name) {
          ch.name = first.channelTitle
        }
        markChannelRefreshSuccess(s, ch.id)
        appendActivityLog(s, {
          actor: 'auto',
          type: 'youtube-refresh',
          status: 'success',
          title: t('log.channelRefreshed.title'),
          detail: t('log.channelRefreshed.fetched', { name: ch.name, count: vids.length }),
          meta: { channelId: ch.id, fetchedCount: vids.length }
        })
      } catch (err) {
        console.warn(`${ch.name}:`, err.message)
        markChannelRefreshError(s, ch.id, err)
        appendActivityLog(s, {
          actor: 'auto',
          type: 'youtube-refresh',
          status: 'error',
          title: t('log.channelRefreshFailed.title'),
          detail: `${ch.name}: ${err.message || t('log.unknownError')}`,
          meta: { channelId: ch.id }
        })
        errors.push({ channelId: ch.id, name: ch.name, message: err.message || t('log.unknownError') })
      }
    }))

    if (successfulChannels === 0) {
      saveState(s)
      showToast(t('toast.refreshFailedChannels', { count: errors.length, plural: errors.length > 1 ? 's' : '' }), 'error')
      return { ok: false, mergedCount: 0, successfulChannels, errors }
    }

    const unique = dedupeVideos(all)
    const detailsById = await getFetchedVideoDetails(s, unique, includeShorts)
    const mergeResult = mergeFetchedVideos(s, unique, detailsById, includeShorts)
    const mergedCount = mergeResult.mergedCount
    const skippedShorts = filteredShortsDuringFetch + mergeResult.skippedShorts
    if (skippedShorts) {
      appendActivityLog(s, {
        actor: 'auto',
        type: 'short-videos',
        status: 'info',
        title: t('log.shortsSkipped.title'),
        detail: t('log.shortsSkipped.detail', { count: skippedShorts }),
        meta: { skippedShorts }
      })
    }

    saveState(s)
    renderAll(s)

    const shortsMsg = formatSkippedShortsMessage(skippedShorts, mergedCount)
    const msg = errors.length
      ? t('toast.refreshLoadedWithErrors', { count: mergedCount, shorts: shortsMsg, errors: errors.length, plural: errors.length > 1 ? 's' : '' })
      : t('toast.refreshLoaded', { count: mergedCount, channels: successfulChannels, plural: successfulChannels === 1 ? '' : 's', shorts: shortsMsg })
    if (!silent || errors.length) showToast(msg, errors.length ? 'warn' : 'success')
    window.trackEdeniaEvent?.('refresh_completed', {
      trigger,
      result: errors.length ? 'partial' : 'success',
      refreshed_channel_count: successfulChannels,
      failed_channel_count: errors.length,
      new_video_count: mergedCount,
      skipped_short_count: skippedShorts
    })
    return {
      ok: errors.length === 0,
      mergedCount,
      successfulChannels,
      errors
    }

  } catch (err) {
    console.error(err)
    const s = loadState()
    if (s) {
      appendActivityLog(s, {
        actor: 'auto',
        type: 'youtube-refresh',
        status: 'error',
        title: t('log.refreshFailed.title'),
        detail: err.message || t('log.unknownRefreshError')
      })
      saveState(s)
    }
    showToast(t('toast.refreshFailed', { message: err.message }), 'error')
    return { ok: false, error: err, errors: [{ message: err.message || t('log.unknownRefreshError') }] }
  } finally {
    if (btn) {
      btn.textContent = `↻ ${t('videos.refresh')}`
      btn.classList.remove('loading')
      btn.disabled = false
    }
    if (!IS_SANDBOX) scheduleYoutubeAutoRefresh(loadState())
  }
}

async function refreshAddedChannel(channelId, options = {}) {
  if (IS_SANDBOX || !hasYoutubeApiKey()) return
  const revealNotBefore = Date.now() + Math.max(0, Number(options.revealDelayMs) || 0)

  try {
    const s = loadState()
    const channel = s.config.channels.find(ch => ch.id === channelId)
    if (!channel) return

    try {
      await hydrateYoutubeChannelProfiles([channel])
    } catch (err) {
      console.warn('Channel profile picture:', err.message)
    }

    const includeShorts = normalizeIncludeShorts(s.config.includeShorts)
    const fetchResult = await fetchChannelVideos(channel, s.videos, { includeShorts })
    const videos = dedupeVideos(fetchResult.videos)
    const first = videos[0]
    if (first?.channelTitle && first.channelTitle !== channel.name) {
      channel.name = first.channelTitle
    }

    const detailsById = await getFetchedVideoDetails(s, videos, includeShorts)
    const mergeResult = mergeFetchedVideos(s, videos, detailsById, includeShorts)
    const mergedCount = mergeResult.mergedCount
    const skippedShorts = fetchResult.filteredShorts + mergeResult.skippedShorts
    const revealDelayRemaining = revealNotBefore - Date.now()
    if (revealDelayRemaining > 0) {
      await new Promise(resolve => window.setTimeout(resolve, revealDelayRemaining))
    }
    const currentState = loadState()
    if (!currentState.config.channels.some(currentChannel => currentChannel.id === channel.id)) return

    markChannelRefreshSuccess(s, channel.id)
    appendActivityLog(s, {
      actor: 'auto',
      type: 'youtube-refresh',
      status: 'success',
      title: t('log.channelRefreshed.title'),
      detail: t('log.channelRefreshed.loaded', { name: channel.name || channelId, count: mergedCount }),
      meta: { channelId, fetchedCount: videos.length, mergedCount, skippedShorts }
    })
    saveState(s)
    const focusVideoId = String(options.focusVideoId || '')
    if (focusVideoId && s.videos[focusVideoId]) {
      pendingAddedChannelReveal = { channelId, videoId: focusVideoId }
      forcedSearchVideoId = focusVideoId
    }
    renderAll(s)
    renderChannelList(s.config.channels)
    if (focusVideoId && s.videos[focusVideoId]) {
      const activeReveal = pendingAddedChannelReveal
      window.requestAnimationFrame(() => {
        scrollToVideoCard(focusVideoId, '.video-card', {
          duration: 1800,
          highlightTarget: 'spotlight'
        })
        const focusedCard = findVideoCard(focusVideoId)
        const refreshedShelf = focusedCard?.closest('.channel-refresh-arriving')
        window.setTimeout(() => refreshedShelf?.classList.remove('channel-refresh-arriving'), 900)
        window.setTimeout(() => {
          if (forcedSearchVideoId === focusVideoId) forcedSearchVideoId = null
          if (pendingAddedChannelReveal === activeReveal) pendingAddedChannelReveal = null
        }, 1800)
      })
    }

    const channelName = channel.name || channelId
    const shortsMsg = formatSkippedShortsMessage(skippedShorts, mergedCount)
    showToast(t('toast.channelLoaded', { name: channelName, count: mergedCount, shorts: shortsMsg }), 'success')
    window.trackEdeniaEvent?.('refresh_completed', {
      trigger: 'channel_added',
      result: 'success',
      refreshed_channel_count: 1,
      failed_channel_count: 0,
      new_video_count: mergedCount,
      skipped_short_count: skippedShorts
    })
  } catch (err) {
    console.error(err)
    const s = loadState()
    if (s?.config?.channels?.some(channel => channel.id === channelId)) {
      markChannelRefreshError(s, channelId, err)
      appendActivityLog(s, {
        actor: 'auto',
        type: 'youtube-refresh',
        status: 'error',
        title: t('log.channelRefreshFailed.title'),
        detail: `${channelId}: ${err.message || t('log.unknownError')}`,
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

function getBaseDocumentTitle() {
  return IS_SANDBOX ? t('app.title.sandbox') : 'Edenia'
}

function getVideoWatchReminderEntries(state, includePrompted = false) {
  return Object.entries(state?.videoWatchReminders || {})
    .map(([videoId, reminder]) => ({
      videoId,
      reminder,
      video: state?.videos?.[videoId],
      dueAtMs: Date.parse(reminder?.dueAt || '')
    }))
    .filter(entry => (
      entry.video
      && getVideoStatus(entry.video) !== 'watched'
      && Number.isFinite(entry.dueAtMs)
      && (includePrompted || !entry.reminder?.promptedAt)
    ))
    .sort((a, b) => a.dueAtMs - b.dueAtMs)
}

function getDueVideoWatchReminderEntries(state, includePrompted = false) {
  const now = Date.now()
  return getVideoWatchReminderEntries(state, includePrompted)
    .filter(entry => entry.dueAtMs <= now)
}

function isVideoWatchReminderDue(state, videoId) {
  const dueAtMs = Date.parse(state?.videoWatchReminders?.[String(videoId ?? '')]?.dueAt || '')
  return Number.isFinite(dueAtMs) && dueAtMs <= Date.now()
}

function updateDocumentTitle(state = null) {
  const currentState = state || loadState()
  const hasDueReminder = document.hidden && getDueVideoWatchReminderEntries(currentState).length > 0
  document.title = hasDueReminder ? t('videoReminder.tabTitle') : getBaseDocumentTitle()
}

function getVideoWatchReminderDurationSeconds(video) {
  const duration = Math.max(0, Math.floor(Number(video?.duration || 0)))
  if (!duration) return 0
  const resumeAtSeconds = getVideoStatus(video) === 'partial'
    ? normalizeResumeAtSeconds(video?.resumeAtSeconds, duration)
    : null
  return Math.max(1, duration - (resumeAtSeconds || 0))
}

function setVideoWatchReminderInState(state, video) {
  if (!state || !video?.id || getVideoStatus(video) === 'watched') return false
  const durationSeconds = getVideoWatchReminderDurationSeconds(video)
  if (!durationSeconds) return false
  const startedAtMs = Date.now()
  if (!state.videoWatchReminders || typeof state.videoWatchReminders !== 'object' || Array.isArray(state.videoWatchReminders)) {
    state.videoWatchReminders = {}
  }
  state.videoWatchReminders[video.id] = {
    startedAt: new Date(startedAtMs).toISOString(),
    dueAt: new Date(startedAtMs + durationSeconds * 1000).toISOString(),
    durationSeconds
  }
  if (activeVideoWatchReminderId === String(video.id)) {
    activeVideoWatchReminderId = null
    shouldGuideActiveVideoWatchReminder = false
    removeVideoWatchReminderUi()
  }
  return true
}

function clearVideoWatchReminderInState(state, videoId) {
  const targetId = String(videoId ?? '')
  if (!targetId || !state?.videoWatchReminders?.[targetId]) return false
  delete state.videoWatchReminders[targetId]
  if (activeVideoWatchReminderId === targetId) {
    activeVideoWatchReminderId = null
    shouldGuideActiveVideoWatchReminder = false
  }
  return true
}

function removeVideoWatchReminderUi() {
  window.clearTimeout(videoWatchReminderZoomTimer)
  videoWatchReminderZoomTimer = null
  window.clearTimeout(videoWatchReminderPopupTimer)
  videoWatchReminderPopupTimer = null
  closeVideoShelfPreview(activeVideoShelfPreview, true)
  if (videoWatchReminderRenderFrame !== null) {
    window.cancelAnimationFrame(videoWatchReminderRenderFrame)
    videoWatchReminderRenderFrame = null
  }
  document.querySelectorAll('.video-watch-reminder-popover').forEach(popover => popover.remove())
  document.querySelectorAll('.video-card.watch-reminder-target, .video-card.watch-reminder-arriving').forEach(card => {
    card.classList.remove('watch-reminder-target', 'watch-reminder-arriving')
  })
  const globalReminder = document.getElementById('videoWatchReminderGlobal')
  if (globalReminder) {
    globalReminder.classList.add('hidden')
    globalReminder.innerHTML = ''
  }
}

function getVideoWatchReminderMarkup(videoId, global = false) {
  const safeVideoId = escHtml(String(videoId ?? ''))
  return `
    <div class="video-watch-reminder-popover${global ? ' is-global' : ''}" role="region" aria-live="polite" aria-label="${escHtml(t('videoReminder.aria'))}">
      <div class="video-watch-reminder-copy">
        <span class="video-watch-reminder-icon" aria-hidden="true">✓</span>
        <span>
          <strong>${escHtml(t('videoReminder.eyebrow'))}</strong>
          <span>${escHtml(t('videoReminder.question'))}</span>
        </span>
      </div>
      <div class="video-watch-reminder-actions">
        <button type="button" class="video-watch-reminder-mark" data-video-id="${safeVideoId}" onclick="markVideoFromWatchReminder(event, this.dataset.videoId)">${escHtml(t('videoReminder.markWatched'))}</button>
        <button type="button" class="video-watch-reminder-later" data-video-id="${safeVideoId}" onclick="dismissVideoWatchReminder(event, this.dataset.videoId)">${escHtml(t('videoReminder.notYet'))}</button>
      </div>
    </div>
  `
}

function renderActiveVideoWatchReminder(state = null) {
  videoWatchReminderRenderFrame = null
  const currentState = state || loadState()
  const videoId = activeVideoWatchReminderId
  removeVideoWatchReminderUi()
  if (!videoId) return

  const reminder = currentState?.videoWatchReminders?.[videoId]
  const video = currentState?.videos?.[videoId]
  if (!reminder || !video || getVideoStatus(video) === 'watched') {
    activeVideoWatchReminderId = null
    shouldGuideActiveVideoWatchReminder = false
    forcedSearchVideoId = null
    scheduleVideoWatchReminderTimer(currentState)
    return
  }

  const card = Array.from(document.querySelectorAll('.video-card'))
    .find(candidate => candidate.dataset.videoId === videoId)
  if (card) {
    closeVideoShelfPreview(activeVideoShelfPreview, true)
    card.classList.add('watch-reminder-target')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (shouldGuideActiveVideoWatchReminder) {
      card.classList.add('watch-reminder-arriving')
      card.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'center'
      })
      window.setTimeout(() => card.classList.remove('watch-reminder-arriving'), 1800)
    }
    const targetVideoId = videoId
    videoWatchReminderZoomTimer = window.setTimeout(() => {
      if (activeVideoWatchReminderId !== targetVideoId) return
      const targetCard = Array.from(document.querySelectorAll('.video-card'))
        .find(candidate => candidate.dataset.videoId === targetVideoId)
      openVideoShelfPreview(targetCard, true)
      videoWatchReminderPopupTimer = window.setTimeout(() => {
        if (activeVideoWatchReminderId !== targetVideoId) return
        const zoomedCard = Array.from(document.querySelectorAll('.video-card'))
          .find(candidate => candidate.dataset.videoId === targetVideoId)
        if (!zoomedCard || zoomedCard.querySelector('.video-watch-reminder-popover')) return
        zoomedCard.insertAdjacentHTML('beforeend', getVideoWatchReminderMarkup(targetVideoId))
      }, reduceMotion ? 80 : 260)
    }, shouldGuideActiveVideoWatchReminder && !reduceMotion ? 750 : 0)
  } else {
    const globalReminder = document.getElementById('videoWatchReminderGlobal')
    if (globalReminder) {
      globalReminder.innerHTML = getVideoWatchReminderMarkup(videoId, true)
      globalReminder.classList.remove('hidden')
    }
  }
  shouldGuideActiveVideoWatchReminder = false
  forcedSearchVideoId = null
}

function queueActiveVideoWatchReminderRender(state = null) {
  if (!activeVideoWatchReminderId) {
    removeVideoWatchReminderUi()
    return
  }
  if (videoWatchReminderRenderFrame !== null) window.cancelAnimationFrame(videoWatchReminderRenderFrame)
  videoWatchReminderRenderFrame = window.requestAnimationFrame(() => renderActiveVideoWatchReminder(state))
}

function showNextDueVideoWatchReminder(state = null) {
  const currentState = state || loadState()
  if (!currentState || activeVideoWatchReminderId) {
    queueActiveVideoWatchReminderRender(currentState)
    return
  }
  const entry = getDueVideoWatchReminderEntries(currentState)[0]
  if (!entry) {
    scheduleVideoWatchReminderTimer(currentState)
    return
  }

  entry.reminder.promptedAt = new Date().toISOString()
  closeVideoShelfPreview(activeVideoShelfPreview, true)
  activeVideoWatchReminderId = entry.videoId
  shouldGuideActiveVideoWatchReminder = true
  forcedSearchVideoId = entry.videoId
  saveState(currentState, { backup: false })
  renderFeed(currentState)
  updateDocumentTitle(currentState)
}

function handleVideoWatchReminderTimer() {
  videoWatchReminderTimer = null
  const state = loadState()
  if (!state) return
  if (document.hidden) {
    updateDocumentTitle(state)
    return
  }
  showNextDueVideoWatchReminder(state)
}

function scheduleVideoWatchReminderTimer(state = null) {
  window.clearTimeout(videoWatchReminderTimer)
  videoWatchReminderTimer = null
  const currentState = state || loadState()
  updateDocumentTitle(currentState)
  if (!currentState || activeVideoWatchReminderId) return

  const nextReminder = getVideoWatchReminderEntries(currentState)[0]
  if (!nextReminder) return
  const delay = Math.max(0, nextReminder.dueAtMs - Date.now())
  if (!delay && document.hidden) return
  videoWatchReminderTimer = window.setTimeout(
    handleVideoWatchReminderTimer,
    Math.min(delay, 2_147_000_000)
  )
}

function initializeVideoWatchReminders(state) {
  normalizeVideoWatchReminderState(state)
  scheduleVideoWatchReminderTimer(state)
}

function handleVideoWatchReminderVisibilityChange() {
  const state = loadState()
  if (!state) return
  scheduleVideoWatchReminderTimer(state)
  if (!document.hidden && activeVideoWatchReminderId) queueActiveVideoWatchReminderRender(state)
}

function completeVideoWatchReminderDismissal(videoId) {
  const state = loadState()
  if (!state) return
  clearVideoWatchReminderInState(state, videoId)
  saveState(state, { backup: false })
  renderFeed(state)
  removeVideoWatchReminderUi()
  scheduleVideoWatchReminderTimer(state)
}

function dismissVideoWatchReminder(event, videoId) {
  event?.preventDefault()
  event?.stopPropagation()
  completeVideoWatchReminderDismissal(videoId)
}

function dismissVideoWatchReminderOnOutsideClick(event) {
  const videoId = activeVideoWatchReminderId
  if (!videoId) return
  const target = event.target instanceof Element ? event.target : null
  const targetCard = target?.closest('.video-card')
  if (targetCard?.dataset.videoId === videoId) return
  if (target?.closest('#videoWatchReminderGlobal')) return
  completeVideoWatchReminderDismissal(videoId)
}

function markVideoFromWatchReminder(event, videoId) {
  event?.preventDefault()
  event?.stopPropagation()
  markVideo(videoId, 'watched')
}

function getLastVideoMarkedWatchedAt(state) {
  if (isValidTimestamp(state?.lastVideoMarkedWatchedAt)) {
    return state.lastVideoMarkedWatchedAt
  }

  return Object.values(state?.videos || {}).reduce((latest, video) => {
    if (!isValidTimestamp(video?.watchedAt)) return latest
    if (!latest || new Date(video.watchedAt) > new Date(latest)) return video.watchedAt
    return latest
  }, null)
}

function getVideoWatchCooldownRemainingMs(state, video) {
  if (IS_SANDBOX || IS_LOCALHOST) return 0
  const durationMs = Math.max(
    0,
    Math.floor(Number(video?.duration || 0)) - VIDEO_WATCH_COOLDOWN_GRACE_SECONDS
  ) * 1000
  const lastMarkedAt = getLastVideoMarkedWatchedAt(state)
  if (!durationMs || !lastMarkedAt) return 0
  return Math.max(0, durationMs - (Date.now() - new Date(lastMarkedAt).getTime()))
}

function formatVideoWatchCooldown(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000))
  if (ms < 3_600_000) return t('time.minutes', { minutes: totalMinutes })
  return t('time.hoursMinutes', {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60
  })
}

function markVideo(videoId, newStatus) {
  newStatus = normalizeVideoStatus(newStatus)
  const s     = loadState()
  const video = s.videos[videoId]
  if (!video) return
  if (video.status === newStatus) return
  if (newStatus === 'watched') {
    const remainingMs = isVideoWatchReminderDue(s, videoId)
      ? 0
      : getVideoWatchCooldownRemainingMs(s, video)
    if (remainingMs > 0) {
      showToast(t('toast.watchCooldown', { time: formatVideoWatchCooldown(remainingMs) }), 'warn')
      return
    }
  }
  const previousStatus = getVideoStatus(video)
  if (newStatus !== 'partial') clearVideoWatchReminderInState(s, videoId)

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
  if (watchedAt) s.lastVideoMarkedWatchedAt = watchedAt
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
    title: t('log.videoStatus.title'),
    detail: t('log.videoStatus.detail', { title: formatToastTitle(video.title), status: formatVideoStatus(newStatus) }),
    meta: { videoId, status: newStatus }
  })
  if (getVideoActionPointDelta(undoAction, 'redo') < 0) {
    appendPointDeltaActivityLog(s, {
      action: undoAction,
      direction: 'redo',
      reason: 'unmark',
      video
    })
  }

  saveState(s)
  renderAll(s)
  scheduleVideoWatchReminderTimer(s)
}

function markVideoInProgressOnOpen(videoId) {
  const s     = loadState()
  const video = s.videos[videoId]
  if (!video) return
  const previousStatus = getVideoStatus(video)
  window.trackEdeniaEvent?.('video_opened', {
    previous_status: previousStatus,
    video_source: video.manuallyAdded ? 'manual' : 'channel',
    is_short: Boolean(video.isShort),
    resumed: previousStatus === 'partial' && normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration) !== null
  })
  if (previousStatus === 'watched') return
  if (previousStatus === 'partial') {
    if (setVideoWatchReminderInState(s, video)) {
      saveState(s, { backup: false })
      scheduleVideoWatchReminderTimer(s)
    }
    return
  }

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
  setVideoWatchReminderInState(s, video)
  const action = s.undoStack[s.undoStack.length - 1]
  if (action?.videoId === videoId && action.after) {
    action.after.video = cloneVideoForHistoryAction(video)
  }
  appendActivityLog(s, {
    actor: 'user',
    type: 'video-status',
    status: 'success',
    title: t('log.videoStatus.title'),
    detail: t('log.videoStatus.detail', { title: formatToastTitle(video.title), status: formatVideoStatus('partial') }),
    meta: { videoId, status: 'partial' }
  })

  saveState(s)
  setTimeout(() => {
    const nextState = loadState()
    renderAll(nextState)
    scheduleVideoWatchReminderTimer(nextState)
  }, 0)
}

function revealAddedVideoCard(videoId, state) {
  forcedSearchVideoId = String(videoId ?? '')
  renderAll(state)
  const revealCard = () => {
    const card = findVideoCard(forcedSearchVideoId)
    const found = Boolean(card)
    forcedSearchVideoId = null
    if (card) {
      if (usesTabletAddedVideoReveal()) {
        flashVideoCard(card, {
          duration: 1800,
          highlightTarget: 'spotlight'
        })
      } else {
        showAddedVideoSpotlight(card, 1800)
      }
    }
    if (!found) showToast(t('toast.couldNotShowVideo'), 'warn')
  }

  if (usesTabletAddedVideoReveal()) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(revealCard))
  } else {
    window.setTimeout(revealCard, 0)
  }
}

function usesTabletAddedVideoReveal() {
  return Boolean(window.matchMedia?.('(min-width: 641px) and (any-pointer: coarse)').matches)
}

async function addVideoFromUrl(event) {
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
    const existingChannel = s.config.channels.find(channel => channel.id === metadata.channelId) || null
    const before = {
      exists: Boolean(existing),
      video: existing ? cloneVideoForHistoryAction(existing) : null,
      channel: existingChannel ? { ...existingChannel } : null
    }

    const watchProgress = normalizeVideoWatchProgress(existing?.watchProgress, existing?.duration ?? metadata.duration)
    const status = existing ? getVideoStatus(existing) : 'unwatched'
    const watchedAt = status === 'watched' ? existing?.watchedAt || null : null
    const duration = metadata.duration || existing?.duration || 0
    const channelWasAdded = addTrackedYoutubeChannelToState(s, {
      id: metadata.channelId,
      name: metadata.channelTitle,
      imageUrl: metadata.channelImageUrl
    })
    s.videos[videoId] = {
      ...metadata,
      ...existing,
      id: videoId,
      title: metadata.title || existing?.title || t('videos.search.untitled'),
      channelTitle: metadata.channelTitle || existing?.channelTitle || 'YouTube',
      channelId: metadata.channelId || existing?.channelId || 'manual-youtube',
      channelImageUrl: metadata.channelImageUrl || existing?.channelImageUrl || '',
      thumbnail: metadata.thumbnail || existing?.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
      publishedAt: metadata.publishedAt || existing?.publishedAt || getCurrentAppTimestamp(s),
      duration,
      status,
      watchedAt,
      resumeAtSeconds: status === 'partial'
        ? normalizeResumeAtSeconds(existing?.resumeAtSeconds, duration)
        : null,
      watchProgress,
      source: existing?.source || 'manual',
      manuallyAdded: true,
      hiddenFromGrid: false,
      hiddenFromGridAt: null
    }

    pushUndoAction(s, {
      type: 'manual-video-add',
      videoId,
      channelId: metadata.channelId,
      channelName: metadata.channelTitle || metadata.channelId,
      channelWasAdded,
      before,
      after: {
        exists: true,
        video: cloneVideoForHistoryAction(s.videos[videoId]),
        channel: s.config.channels.find(channel => channel.id === metadata.channelId)
          ? { ...s.config.channels.find(channel => channel.id === metadata.channelId) }
          : null
      }
    })
    appendActivityLog(s, {
      actor: 'user',
      type: 'manual-video',
      status: 'success',
      title: t('log.videoAdded.title'),
      detail: t('log.videoAdded.detail', { title: formatToastTitle(s.videos[videoId].title) }),
      meta: { videoId }
    })
    if (channelWasAdded) {
      appendActivityLog(s, {
        actor: 'user',
        type: 'channel-add',
        status: 'success',
        title: t('log.channelAdded.title'),
        detail: metadata.channelTitle || metadata.channelId,
        meta: { channelId: metadata.channelId }
      })
    }
    saveState(s)
    input.value = ''
    if (usesTabletAddedVideoReveal()) input.blur()
    closeManualVideoPopover()
    revealAddedVideoCard(videoId, s)
    showToast(t('toast.addedWatchedVideo', { title: formatToastTitle(s.videos[videoId].title) }), 'success')
    if (channelWasAdded) {
      refreshAddedChannel(metadata.channelId, {
        focusVideoId: videoId,
        revealDelayMs: 1500
      })
    }
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

async function addYoutubeInput(event) {
  event.preventDefault()
  const input = document.getElementById('manualVideoUrlInput')
  const btn = document.getElementById('manualVideoAddBtn')
  const rawUrl = input?.value?.trim() || ''

  if (parseYoutubeVideoId(rawUrl)) {
    await addVideoFromUrl(event)
    return
  }
  if (parseYoutubeChannelInput(rawUrl)) {
    await addChannel({
      input,
      button: btn,
      idleButtonText: t('videos.manual.add'),
      closePopover: true
    })
    return
  }

  showToast(t('toast.validYoutubeUrl'), 'warn')
  input?.focus()
}

function saveVideoResumeTime(videoId, value, options = {}) {
  const shouldRender = options.render !== false
  const s = loadState()
  const video = s?.videos?.[videoId]
  if (!video || getVideoStatus(video) !== 'partial') return false

  const parsed = parseResumeTimestamp(value, video.duration)
  if (Number.isNaN(parsed)) {
    showToast(t('toast.timestampFormat'), 'warn')
    if (shouldRender) renderAll(s)
    return false
  }

  const beforeVideo = cloneVideoForHistoryAction(video)
  const previousResume = normalizeResumeAtSeconds(video.resumeAtSeconds, video.duration) || 0
  const nextResume = parsed || 0
  if (nextResume === previousResume) {
    if (shouldRender) renderAll(s)
    return true
  }
  const watchedAt = getCurrentAppTimestamp(s)
  const progressDelta = Math.max(0, nextResume - previousResume)
  if (progressDelta > 0) addVideoWatchProgress(video, progressDelta, watchedAt)
  video.resumeAtSeconds = parsed
  pushUndoAction(s, {
    type: 'video-resume-time',
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
  if (shouldRender) renderAll(s)
  return true
}

function prepareNextStudyVideoOpen(link) {
  const videoId = link?.dataset?.videoId
  const input = link?.closest('.next-study-continue')?.querySelector('.next-study-time-input')
  if (!videoId || !input || !saveVideoResumeTime(videoId, input.value, { render: false })) return false

  const video = loadState()?.videos?.[videoId]
  if (!video) return false
  link.href = getVideoUrl(video)
  markVideoInProgressOnOpen(videoId)
  return true
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

  if (!UNDO_ACTION_TYPES.includes(action?.type)) {
    showToast(direction === 'redo' ? t('toast.nothingRedo') : t('toast.nothingUndo'), 'warn')
    return
  }

  sourceStack.splice(index, 1)
  const targetSnapshot = direction === 'redo' ? action.after : action.before
  let historyResult = null

  if (action.type === 'channel-remove') {
    historyResult = applyChannelRemoveActionSnapshot(s, action, targetSnapshot, direction)
  } else if (action.type === 'manual-video-add') {
    historyResult = applyManualVideoAddActionSnapshot(s, action, targetSnapshot, direction)
  } else {
    const video = applyVideoStatusActionSnapshot(s, action.videoId, targetSnapshot, action, direction)
    if (video) {
      historyResult = {
        detail: formatHistoryActionToast(direction, video, targetSnapshot, action),
        toast: formatHistoryActionToast(direction, video, targetSnapshot, action),
        meta: { videoId: action.videoId },
        video
      }
    }
  }

  if (!historyResult) {
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
    title: direction === 'redo' ? t('undo.logRedoTitle') : t('undo.logUndoTitle'),
    detail: historyResult.detail,
    meta: historyResult.meta
  })
  if (action.type === 'video-status' || action.type === 'video-resume-time') {
    appendPointDeltaActivityLog(s, {
      action,
      direction,
      reason: direction,
      video: historyResult.video,
      createdAt: new Date().toISOString()
    })
  }

  closeHistoryActionPopovers()
  saveState(s)
  renderAll(s)
  showToast(historyResult.toast)
}

function applyChannelRemoveActionSnapshot(s, action, snapshot, direction = 'undo') {
  if (!snapshot) return null
  const channelId = action.channelId
  const channel = snapshot.channel || action.before?.channel || action.after?.channel || {
    id: channelId,
    name: action.channelName || channelId
  }

  s.config.channels = Array.isArray(s.config.channels) ? s.config.channels : []
  s.config.removedChannelIds = [...(snapshot.removedChannelIds || [])]
  s.config.removedDefaultChannelIds = [...(snapshot.removedDefaultChannelIds || [])]

  const channelIndex = s.config.channels.findIndex(existing => existing.id === channelId)
  if (snapshot.channel) {
    if (channelIndex >= 0) s.config.channels[channelIndex] = { ...channel }
    else s.config.channels.push({ ...channel })
  } else if (channelIndex >= 0) {
    s.config.channels.splice(channelIndex, 1)
  }

  const refreshes = getChannelRefreshes(s)
  if (snapshot.refresh) refreshes[channelId] = { ...snapshot.refresh }
  else delete refreshes[channelId]

  Object.entries(snapshot.videos || {}).forEach(([videoId, video]) => {
    if (video) s.videos[videoId] = cloneVideoForHistoryAction(video)
  })
  if (!snapshot.channel) {
    Object.values(s.videos || {}).forEach(video => {
      if (!isChannelRemovalVideo(video, channelId)) return
      video.hiddenFromGrid = true
      video.hiddenFromGridAt = getCurrentAppTimestamp(s)
    })
  }

  normalizeRemovedChannels(s)

  return {
    detail: formatChannelRemoveActionToast(direction, channel, snapshot),
    toast: formatChannelRemoveActionToast(direction, channel, snapshot),
    meta: { channelId }
  }
}

function applyManualVideoAddActionSnapshot(s, action, snapshot, direction = 'undo') {
  if (!snapshot) return null
  const videoId = action.videoId
  const channelId = action.channelId
  const actionVideo = snapshot.video || action.after?.video || action.before?.video
  if (!videoId || !actionVideo) return null

  if (direction === 'undo') {
    if (action.channelWasAdded && channelId) applyChannelRemoval(s, channelId)
    if (snapshot.exists && snapshot.video) {
      s.videos[videoId] = cloneVideoForHistoryAction(snapshot.video)
    } else {
      delete s.videos[videoId]
    }
  } else {
    if (action.channelWasAdded && snapshot.channel) {
      addTrackedYoutubeChannelToState(s, snapshot.channel)
    }
    s.videos[videoId] = cloneVideoForHistoryAction(snapshot.video)
  }

  const title = formatToastTitle(actionVideo.title)
  const channelName = action.channelName || snapshot.channel?.name || channelId
  const detail = direction === 'redo'
    ? action.channelWasAdded
      ? t('undo.addedVideoAndChannelRestored', { title, channel: channelName })
      : t('undo.addedVideoRestored', { title })
    : action.channelWasAdded
      ? t('undo.addedVideoAndChannelRemoved', { title, channel: channelName })
      : t('undo.addedVideoRemoved', { title })

  return {
    detail,
    toast: detail,
    meta: { videoId, channelId }
  }
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

function formatHistoryActionToast(direction, video, snapshot, action = null) {
  if (action?.type === 'video-grid-remove') {
    return direction === 'redo'
      ? t('undo.videoRemoved', { title: formatToastTitle(video.title) })
      : t('undo.videoRestored', { title: formatToastTitle(video.title) })
  }
  const verb = direction === 'redo' ? t('undo.redid') : t('undo.undid')
  if (action?.type === 'video-resume-time') {
    return t('undo.continueAtSet', {
      verb,
      title: formatToastTitle(video.title),
      time: formatResumeTimestamp(snapshot?.resumeAtSeconds) || '00:00:00'
    })
  }
  if (snapshot?.exists === false) {
    return t('undo.removed', { verb, title: formatToastTitle(video.title) })
  }
  return t('undo.backTo', { verb, title: formatToastTitle(video.title), status: formatVideoStatus(snapshot.status) })
}

function formatChannelRemoveActionToast(direction, channel, snapshot) {
  const channelName = channel?.name || channel?.id || t('videos.channels.one')
  return snapshot?.channel
    ? t('undo.channelRestored', { name: channelName })
    : t('undo.channelRemoved', { name: channelName })
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
    .filter(row => getHistoryDayRawPoints(row) >= MIN_DAILY_STREAK_POINTS)
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
  if (!isAnkiEnabled(loadState())) return
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
        title: t('log.ankiRefreshFailed.title'),
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
    if (!document.hidden && isAnkiEnabled(loadState())) refreshAnkiStats({ silent: true })
  }, ANKI_AUTO_REFRESH_MS)
}

function stopAnkiAutoRefresh() {
  clearInterval(startAnkiAutoRefresh._timer)
  startAnkiAutoRefresh._timer = null
  ankiStatsCache = null
}

function applyAnkiRefreshPreference(state = loadState()) {
  if (IS_SANDBOX || !isAnkiEnabled(state)) {
    stopAnkiAutoRefresh()
    return
  }
  startAnkiAutoRefresh()
  refreshAnkiStats({ silent: true })
}

function refreshAnkiStatsOnVisible() {
  if (!IS_SANDBOX && !document.hidden && isAnkiEnabled(loadState())) refreshAnkiStats({ silent: true })
}

function syncAnkiStatsToState(stats) {
  const s = loadState()
  if (!s || !stats) return

  applyAnkiStatsToState(s, stats)
  const ankiDateKey = stats.ankiDateKey || getAnkiDateKey(new Date(stats.fetchedAt || Date.now()))
  const tracked = getTrackedAnkiCounts(s, ankiDateKey)
  appendActivityLog(s, {
    actor: 'auto',
    type: 'anki-refresh',
    status: 'success',
    title: t('log.ankiStats.title'),
    detail: t('log.ankiStats.detail', { reviewed: tracked.reviewed, created: tracked.created }),
    meta: {
      ankiDateKey,
      reviewedToday: tracked.reviewed,
      newToday: tracked.created,
      rawReviewedToday: stats.reviewedToday,
      rawNewToday: stats.newToday,
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

function applyAnkiStatsToState(s, stats) {
  if (!s || !stats) return null
  const ankiDateKey = stats.ankiDateKey || getAnkiDateKey(new Date(stats.fetchedAt || Date.now()))
  const rawReviewed = normalizeAnkiCount(stats.reviewedToday)
  const rawCreated = normalizeAnkiCount(stats.newToday)
  const pending = s.config?.ankiPendingResumeBaseline

  if (pending?.dateKey === ankiDateKey) {
    if (!s.config.ankiResumeBaselines || typeof s.config.ankiResumeBaselines !== 'object' || Array.isArray(s.config.ankiResumeBaselines)) {
      s.config.ankiResumeBaselines = {}
    }
    s.config.ankiResumeBaselines[ankiDateKey] = {
      rawReviewed,
      rawCreated,
      trackedReviewed: normalizeAnkiCount(pending.trackedReviewed),
      trackedCreated: normalizeAnkiCount(pending.trackedCreated),
      createdAt: pending.createdAt || new Date().toISOString()
    }
    s.config.ankiPendingResumeBaseline = null
  }

  const baseline = s.config?.ankiResumeBaselines?.[ankiDateKey]
  const reviewed = baseline
    ? normalizeAnkiCount(baseline.trackedReviewed) + Math.max(0, rawReviewed - normalizeAnkiCount(baseline.rawReviewed))
    : rawReviewed
  const created = baseline
    ? normalizeAnkiCount(baseline.trackedCreated) + Math.max(0, rawCreated - normalizeAnkiCount(baseline.rawCreated))
    : rawCreated

  s.anki[ankiDateKey] = {
    reviewed,
    created,
    loggedAt: stats.fetchedAt,
    source: 'ankiconnect',
    rawReviewed,
    rawCreated
  }
  return s.anki[ankiDateKey]
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
    const reviewed = normalizeAnkiCount(day.reviewed)
    const created = normalizeAnkiCount(day.created)
    if (reviewed <= 0 && created <= 0) continue
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
          title: video.title || t('videos.search.untitled'),
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
    const reviewed = normalizeAnkiCount(day.reviewed)
    const created = normalizeAnkiCount(day.created)
    if (reviewed <= 0 && created <= 0) continue
    const date = new Date(`${dateKey}T00:00:00`)
    if (date < start || date > end) continue
    const bucket = ensureBucket(dateKey)
    bucket.ankiReviewed += reviewed
    bucket.ankiCreated += created
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
    <span class="history-video-cell" onmouseenter="openHistoryVideoPopover(event)" onmouseleave="closeHistoryVideoPopoverSoon()" onfocusin="openHistoryVideoPopover(event)" onfocusout="closeHistoryVideoPopoverSoon()" onclick="toggleHistoryVideoPopover(event)">
      <button type="button" class="history-video-count" aria-expanded="false" aria-label="${escHtml(t('history.showWatched', { count: row.videosWatched, date: formatHeatmapTitle(row) }))}">
        <span class="history-video-count-number">${row.videosWatched}</span>
        <span class="history-video-count-caret" aria-hidden="true"></span>
      </button>
      <span class="history-video-popover" role="dialog" aria-label="${escHtml(t('history.watchedDialog'))}" onmouseenter="openHistoryVideoPopover(event)" onmouseleave="closeHistoryVideoPopoverSoon()">
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
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value)
}

function formatHistoryPointLabel(points) {
  const value = Number(points || 0)
  return t('points.many', { count: formatHistoryPointNumber(value) })
}

function getVideoPointsFromSeconds(seconds) {
  return ((Number(seconds) || 0) / 3600) * VIDEO_HOUR_POINTS
}

function getAnkiPointsFromReviews(reviews) {
  return ((Number(reviews) || 0) / ANKI_REVIEW_CHUNK_SIZE) * ANKI_REVIEW_CHUNK_POINTS
}

function formatSignedHistoryPointLabel(points) {
  const value = Number(points || 0)
  const sign = value > 0 ? '+' : ''
  return t('points.many', { count: `${sign}${formatHistoryPointNumber(value)}` })
}

function formatSignedActivityLogPointLabel(points) {
  const value = Number(points || 0)
  const sign = value > 0 ? '+' : ''
  const count = new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value)
  return t('points.many', { count: `${sign}${count}` })
}

function getVideoSnapshotPoints(video) {
  const secondsByDate = new Map()
  getVideoWatchProgressEntries(video).forEach(entry => {
    const dateKey = toDateKey(new Date(entry.watchedAt))
    secondsByDate.set(dateKey, (secondsByDate.get(dateKey) || 0) + (entry.seconds || 0))
  })
  return Array.from(secondsByDate.values())
    .reduce((sum, seconds) => sum + Math.floor((seconds / 3600) * VIDEO_HOUR_POINTS), 0)
}

function getVideoActionPointDelta(action, direction = 'redo') {
  if (!action?.before || !action?.after) return 0
  const beforePoints = getVideoSnapshotPoints(action.before.video)
  const afterPoints = getVideoSnapshotPoints(action.after.video)
  return direction === 'undo'
    ? beforePoints - afterPoints
    : afterPoints - beforePoints
}

function appendPointDeltaActivityLog(state, { action, direction = 'redo', reason = 'redo', video = null, createdAt = null } = {}) {
  const delta = getVideoActionPointDelta(action, direction)
  if (!delta) return null
  const sourceVideo = video || action?.after?.video || action?.before?.video
  const titleKey = reason === 'unmark'
    ? 'activity.points.unmarkTitle'
    : direction === 'undo'
    ? 'activity.points.undoTitle'
    : 'activity.points.redoTitle'
  return appendActivityLog(state, {
    actor: 'user',
    type: 'point-delta',
    status: delta < 0 ? 'warn' : 'success',
    title: t(titleKey, { title: formatToastTitle(sourceVideo?.title || t('videos.search.untitled')) }),
    detail: formatSignedHistoryPointLabel(delta),
    createdAt: isValidTimestamp(createdAt) ? createdAt : new Date().toISOString(),
    meta: {
      pointsDelta: delta,
      videoId: action?.videoId || sourceVideo?.id || null
    }
  })
}

function getHistoryPointBreakdown(row) {
  const videoItems = (row.watchedVideos || [])
    .filter(video => (video.duration || 0) > 0)
    .map(video => ({
      type: 'video',
      title: video.title || t('videos.search.untitled'),
      detail: formatHistoryTime(video.duration || 0),
      points: getVideoPointsFromSeconds(video.duration || 0)
    }))

  const ankiPoints = getAnkiPointsFromReviews(row.ankiReviewed || 0)
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

  const total = Math.floor(items.reduce((sum, item) => sum + item.points, 0))
  return {
    items,
    total
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
        <span class="history-points-popover-total">
          <span>${escHtml(t('history.pointsDailyTotal'))}</span>
          <b>${escHtml(formatHistoryPointLabel(breakdown.total))}</b>
        </span>
        ${breakdown.items.length
          ? breakdown.items.map(item => `
            <span class="history-points-popover-item">
              <span class="history-points-popover-title">${escHtml(item.title)}</span>
              <span class="history-points-popover-detail">${escHtml(item.detail)}</span>
              <span class="history-points-popover-score">${escHtml(formatHistoryPointLabel(item.points))}</span>
            </span>
          `).join('')
          : `<span class="history-points-popover-empty">${escHtml(t('history.pointsNone'))}</span>`}
      </span>
    </span>
  `
}

function toggleHistoryVideoPopover(event) {
  event.stopPropagation()
  const cell = event.currentTarget.closest('.history-video-cell')
  if (!cell) return
  const shouldOpen = !cell.classList.contains('open')
  clearTimeout(openHistoryVideoPopover._closeTimer)
  closeManualVideoPopover()
  closeHistoryPointsPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryVideoPopovers(cell)
  cell.classList.toggle('open', shouldOpen)
  cell.querySelector('.history-video-count')?.setAttribute('aria-expanded', String(shouldOpen))
}

function closeHistoryVideoPopovers(exceptCell = null) {
  clearTimeout(openHistoryVideoPopover._closeTimer)
  document.querySelectorAll('.history-video-cell.open').forEach(cell => {
    if (cell === exceptCell) return
    cell.classList.remove('open')
    cell.querySelector('.history-video-count')?.setAttribute('aria-expanded', 'false')
  })
}

function openHistoryVideoPopover(event) {
  if (isMobileLayout()) return
  const cell = event.currentTarget.closest('.history-video-cell')
  if (!cell) return
  clearTimeout(openHistoryVideoPopover._closeTimer)
  closeManualVideoPopover()
  closeHistoryPointsPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryVideoPopovers(cell)
  cell.classList.add('open')
  cell.querySelector('.history-video-count')?.setAttribute('aria-expanded', 'true')
}

function closeHistoryVideoPopoverSoon() {
  clearTimeout(openHistoryVideoPopover._closeTimer)
  openHistoryVideoPopover._closeTimer = window.setTimeout(() => closeHistoryVideoPopovers(), 80)
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
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    openHistoryPointsCell(cell, true)
    return
  }
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

function scrollToVideoCard(videoId, selector = '.video-card', options = {}) {
  const card = findVideoCard(videoId, selector)
  if (!card) return false
  flashVideoCard(card, options)
  return true
}

function findVideoCard(videoId, selector = '.video-card') {
  const targetId = String(videoId ?? '')
  return Array.from(document.querySelectorAll(selector))
    .find(element => element.dataset.videoId === targetId) || null
}

function scrollVideoCardIntoView(card) {
  const slot = card.closest('.channel-shelf-slot')
  const track = card.closest('.channel-shelf-track')
  const shelf = card.closest('.channel-shelf')
  if (!slot || !track || !shelf) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    return
  }

  shelf.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (isVideoShelfCardFullyVisible(card)) return
  const centeredLeft = slot.offsetLeft - ((track.clientWidth - slot.offsetWidth) / 2)
  track.scrollTo({
    behavior: 'smooth',
    left: Math.max(0, centeredLeft)
  })
}

function removeAddedVideoSpotlight() {
  if (addedVideoSpotlightState.frame) window.cancelAnimationFrame(addedVideoSpotlightState.frame)
  if (addedVideoSpotlightState.timer) window.clearTimeout(addedVideoSpotlightState.timer)
  addedVideoSpotlightState.element?.remove()
  addedVideoSpotlightState.element = null
  addedVideoSpotlightState.frame = null
  addedVideoSpotlightState.timer = null
}

function showAddedVideoSpotlight(card, duration = 1800) {
  removeAddedVideoSpotlight()
  if (!card?.isConnected) return

  const spotlight = document.createElement('div')
  spotlight.className = 'walkthrough-highlight added-video-spotlight'
  spotlight.setAttribute('aria-hidden', 'true')
  document.body.appendChild(spotlight)
  addedVideoSpotlightState.element = spotlight

  const positionSpotlight = () => {
    if (!card.isConnected || addedVideoSpotlightState.element !== spotlight) {
      removeAddedVideoSpotlight()
      return
    }
    const rect = card.getBoundingClientRect()
    const padding = 6
    const left = clampNumber(rect.left - padding, 8, window.innerWidth - 8)
    const top = clampNumber(rect.top - padding, 8, window.innerHeight - 8)
    const right = clampNumber(rect.right + padding, left + 1, window.innerWidth - 8)
    const bottom = clampNumber(rect.bottom + padding, top + 1, window.innerHeight - 8)
    spotlight.style.borderRadius = '12px'
    setFixedRect(spotlight, {
      left,
      top,
      width: right - left,
      height: bottom - top
    })
    addedVideoSpotlightState.frame = window.requestAnimationFrame(positionSpotlight)
  }

  positionSpotlight()
  addedVideoSpotlightState.timer = window.setTimeout(removeAddedVideoSpotlight, Math.max(0, Number(duration) || 1800))
}

function flashVideoCard(card, options = {}) {
  const className = options.className || 'flash-target'
  const duration = Math.max(0, Number(options.duration) || 1900)
  scrollVideoCardIntoView(card)
  if (options.highlightTarget === 'spotlight') {
    showAddedVideoSpotlight(card, duration)
    return
  }
  const highlightTarget = options.highlightTarget === 'slot'
    ? card.closest('.channel-shelf-slot') || card
    : card
  highlightTarget.classList.remove(className)
  void highlightTarget.offsetWidth
  highlightTarget.classList.add(className)
  window.setTimeout(() => highlightTarget.classList.remove(className), duration)
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

function closeVideoSearchPopover(restoreFocus = false) {
  const popover = document.getElementById('videoSearchPopover')
  const button = document.getElementById('videoSearchBtn')
  if (popover) popover.classList.add('hidden')
  if (button) button.setAttribute('aria-expanded', 'false')
  if (restoreFocus && button && isMobileLayout()) window.setTimeout(() => button.focus(), 0)
}

function closeVideoSearchPopoverOnOutsideClick(event) {
  if (event.target.closest('.video-search')) return
  closeVideoSearchPopover()
}

function closeVideoSearchPopoverOnEscape(event) {
  if (event.key !== 'Escape') return
  if (document.getElementById('videoSearchPopover')?.classList.contains('hidden')) return
  closeVideoSearchPopover(true)
}

function handleVideoSearchInputKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeVideoSearchPopover(true)
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
  const historyState = s || { videos: {}, anki: {} }
  const hasHistoryActivity = getStudyActivityDateKeys(historyState).length > 0
  document.querySelectorAll('.history-range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.historyRange === selectedHistoryRange)
    btn.setAttribute('aria-expanded', String(btn.closest('.history-period-cell')?.classList.contains('open') || false))
  })
  document.querySelectorAll('.history-view-btn').forEach(btn => {
    const isActive = btn.dataset.historyView === selectedHistoryView
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
  })

  renderHistoryPeriodPopover('week', 'historyWeekPeriodPopover', historyState)
  renderHistoryPeriodPopover('month', 'historyMonthPeriodPopover', historyState)

  const history = getStudyHistory(historyState)
  const showAnkiColumns = isAnkiEnabled(s) || history.rows.some(row => row.ankiReviewed > 0 || row.ankiCreated > 0)
  setText('historyStudyTime', formatHistoryTime(history.summary.secondsWatched))
  setText('historyVideosWatched', history.summary.videosWatched)
  setText('historyAnkiReviewed', history.summary.ankiReviewed)
  setText('historyAnkiCreated', history.summary.ankiCreated)
  document.querySelectorAll('.history-anki-stat').forEach(el => el.classList.toggle('hidden', !showAnkiColumns))

  const table = document.getElementById('historyTable')
  if (table) {
    table.innerHTML = history.rows.length
      ? `
        <div class="history-row history-row-head ${showAnkiColumns ? '' : 'history-row-no-anki'}">
          <span>${escHtml(t('history.table.date'))}</span>
          <span>${escHtml(t('history.table.video'))}</span>
          <span>${escHtml(t('history.table.watched'))}</span>
          ${showAnkiColumns ? `<span>${escHtml(t('history.table.anki'))}</span>` : ''}
          <span class="history-points-col">${escHtml(t('history.table.points'))}</span>
        </div>
        ${history.rows.map(row => `
          <div class="history-row ${showAnkiColumns ? '' : 'history-row-no-anki'}">
            <span data-label="${escHtml(t('history.table.date'))}">${formatHistoryDate(row.dateKey, s)}</span>
            <span data-label="${escHtml(t('history.table.video'))}">${formatHistoryTime(row.secondsWatched)}</span>
            <span data-label="${escHtml(t('history.table.watched'))}">${renderHistoryWatchedCell(row)}</span>
            ${showAnkiColumns ? `<span data-label="${escHtml(t('history.table.anki'))}">${row.ankiReviewed} / ${row.ankiCreated}</span>` : ''}
            <span class="history-points-col" data-label="${escHtml(t('history.table.points'))}">${renderHistoryPointsCell(row)}</span>
          </div>
        `).join('')}
      `
      : `<div class="history-empty">${escHtml(t('history.emptyRange'))}</div>`
  }

  const summaryView = document.getElementById('historySummaryView')
  const heatmapView = document.getElementById('historyHeatmapView')
  const rangeToolbar = document.getElementById('historyRangeToolbar')
  if (rangeToolbar) {
    rangeToolbar.classList.toggle('hidden', selectedHistoryView === 'heatmap')
    rangeToolbar.classList.toggle('mobile-history-empty', !hasHistoryActivity)
  }
  if (summaryView) summaryView.classList.toggle('hidden', selectedHistoryView !== 'summary')
  if (heatmapView) {
    heatmapView.classList.toggle('hidden', selectedHistoryView !== 'heatmap')
    if (selectedHistoryView === 'heatmap') renderHistoryHeatmap(s || { videos: {}, anki: {} }, heatmapView)
  }
}

function getHistoryHeatLevel(row) {
  const score = getHistoryDayRawPoints(row)
  if (score <= 0) return 0
  if (score < 0.5) return 1
  if (score < 1) return 2
  if (score < 2) return 3
  if (score < 4) return 4
  if (score < 7) return 5
  return 6
}

function getHistoryDayRawPoints(row) {
  const ankiPoints = getAnkiPointsFromReviews(row.ankiReviewed || 0)
  const watchedVideos = Array.isArray(row.watchedVideos) ? row.watchedVideos : []
  const videoPoints = watchedVideos.length
    ? watchedVideos.reduce((sum, video) => sum + getVideoPointsFromSeconds(video.duration || 0), 0)
    : getVideoPointsFromSeconds(row.secondsWatched || 0)
  return ankiPoints + videoPoints
}

function getHistoryDayPoints(row) {
  return Math.floor(getHistoryDayRawPoints(row))
}

function hasHistoryActivity(row) {
  return row.secondsWatched > 0 || row.videosWatched > 0 || row.ankiReviewed > 0 || row.ankiCreated > 0
}

function formatHeatmapTitle(row) {
  const date = new Date(`${row.dateKey}T00:00:00`)
  return formatLocaleDate(date, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatHeatmapAriaLabel(row, ankiEnabled = true) {
  const key = ankiEnabled ? 'history.heatmapAria' : 'history.heatmapAriaNoAnki'
  return t(key, {
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

function getHeatmapMonthLabels(gridStart, end, weekCount) {
  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = addDays(gridStart, index * 7)
    const weekEnd = addDays(weekStart, 6)
    const nextMonthStart = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 1)
    const labelDate = nextMonthStart <= weekEnd && nextMonthStart <= end
      ? nextMonthStart
      : (index === 0 ? weekStart : null)
    return labelDate ? formatLocaleDate(labelDate, { month: 'short' }) : ''
  })
}

function renderHistoryHeatmap(s, container) {
  container.classList.remove('is-sparse')
  const ankiEnabled = isAnkiEnabled(s)
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
  const monthLabels = getHeatmapMonthLabels(gridStart, end, weekCount)
  container.classList.toggle('is-sparse', weekCount <= 8)

  container.innerHTML = `
    <div class="heatmap-body">
      <div class="heatmap-weekday-labels" aria-hidden="true">
        ${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => `<span>${escHtml(t(`history.weekdays.${day}`))}</span>`).join('')}
      </div>
      <div class="heatmap-scroll">
        <div class="heatmap-months" style="grid-template-columns: repeat(${weekCount}, var(--heatmap-cell-size))" aria-hidden="true">
          ${monthLabels.map(label => `<span class="heatmap-month-label">${escHtml(label)}</span>`).join('')}
        </div>
        <div class="heatmap-grid" style="grid-template-columns: repeat(${weekCount}, var(--heatmap-cell-size))">
          ${days.map(row => {
            const showAnkiForRow = ankiEnabled || row.ankiReviewed > 0 || row.ankiCreated > 0
            return `
            <button type="button" class="heatmap-day level-${getHistoryHeatLevel(row)}" data-date="${escHtml(formatHeatmapTitle(row))}" data-points="${getHistoryDayPoints(row)}" data-time="${escHtml(formatHistoryTime(row.secondsWatched))}" data-videos="${row.videosWatched}" data-anki-enabled="${showAnkiForRow ? 'true' : 'false'}" data-reviewed="${row.ankiReviewed}" data-created="${row.ankiCreated}" aria-label="${escHtml(formatHeatmapAriaLabel(row, showAnkiForRow))}" onmouseenter="showHeatmapTooltip(event)" onmousemove="positionHeatmapTooltip(event.currentTarget)" onmouseleave="hideHeatmapTooltip()" onclick="toggleHeatmapTooltip(event)" onfocus="showHeatmapTooltip(event)" onblur="hideHeatmapTooltip()"></button>
          `}).join('')}
        </div>
      </div>
    </div>
    <div class="heatmap-legend" aria-label="${escHtml(t('history.heatmap.legend'))}">
      <span>${escHtml(t('history.heatmap.less'))}</span>
      ${[0, 1, 2, 3, 4, 5, 6].map(level => `<span class="heatmap-legend-cell level-${level}" aria-hidden="true"></span>`).join('')}
      <span>${escHtml(t('history.heatmap.more'))}</span>
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
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    showHeatmapTooltip(event)
    return
  }
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
  const ankiRows = target.dataset.ankiEnabled === 'true'
    ? `
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">A</span><span>${escHtml(t('history.tooltip.ankiReviewed'))}</span><b>${escHtml(target.dataset.reviewed)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">+</span><span>${escHtml(t('history.tooltip.ankiCreated'))}</span><b>${escHtml(target.dataset.created)}</b></div>
  `
    : ''
  tooltip.innerHTML = `
    <div class="heatmap-tooltip-head">
      <div class="heatmap-tooltip-title">${escHtml(target.dataset.date)}</div>
      <div class="heatmap-tooltip-points">${escHtml(t('history.tooltip.points', { count: target.dataset.points }))}</div>
    </div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">⏱</span><span>${escHtml(t('history.tooltip.videoTime'))}</span><b>${escHtml(target.dataset.time)}</b></div>
    <div class="heatmap-tooltip-row"><span class="heatmap-tooltip-icon">✓</span><span>${escHtml(t('history.tooltip.videosWatched'))}</span><b>${escHtml(target.dataset.videos)}</b></div>
    ${ankiRows}
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
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches || window.innerWidth <= 768
  const baseLeft = rect.left + (isCoarsePointer ? window.scrollX : 0)
  const baseTop = rect.top + (isCoarsePointer ? window.scrollY : 0)
  const viewportLeft = Math.min(
    window.innerWidth - tooltip.offsetWidth - margin,
    Math.max(margin, rect.left + rect.width / 2 - tooltip.offsetWidth / 2)
  )
  let top = rect.top - tooltip.offsetHeight - gap
  if (top < margin) top = rect.bottom + gap
  const absoluteLeft = Math.min(
    window.scrollX + window.innerWidth - tooltip.offsetWidth - margin,
    Math.max(window.scrollX + margin, baseLeft + rect.width / 2 - tooltip.offsetWidth / 2)
  )
  const absoluteTop = (top < margin ? baseTop + rect.height + gap : baseTop - tooltip.offsetHeight - gap)
  tooltip.style.position = isCoarsePointer ? 'absolute' : 'fixed'
  tooltip.style.left = `${isCoarsePointer ? absoluteLeft : viewportLeft}px`
  tooltip.style.top = `${isCoarsePointer ? absoluteTop : top}px`
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

function getStudyInsightTimeWindow(hour) {
  const normalizedHour = clampNumber(Math.floor(Number(hour) || 0), 0, 23)
  return STUDY_INSIGHT_TIME_WINDOWS.find(window => (
    window.startHour < window.endHour
      ? normalizedHour >= window.startHour && normalizedHour < window.endHour
      : normalizedHour >= window.startHour || normalizedHour < window.endHour
  ))?.id || 'night'
}

function getStudyInsightEvents(state, referenceDate = getCurrentAppDate(state)) {
  const end = new Date(referenceDate)
  if (IS_SANDBOX) end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (STUDY_INSIGHT_LOOKBACK_DAYS - 1))
  start.setHours(0, 0, 0, 0)

  return Object.values(state?.videos || {})
    .flatMap(video => getVideoWatchProgressEntries(video).map(entry => ({
      ...entry,
      videoId: video.id || '',
      videoTitle: video.title || '',
      channelId: video.channelId || '',
      channelTitle: video.channelTitle || ''
    })))
    .map(entry => {
      const watchedAt = new Date(entry.watchedAt)
      const seconds = Math.max(0, Math.floor(Number(entry.seconds) || 0))
      if (!seconds || watchedAt < start || watchedAt > end) return null
      return {
        watchedAt: entry.watchedAt,
        dateKey: toDateKey(watchedAt),
        seconds,
        videoId: entry.videoId,
        videoTitle: entry.videoTitle,
        channelId: entry.channelId,
        channelTitle: entry.channelTitle,
        windowId: getStudyInsightTimeWindow(watchedAt.getHours())
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt))
}

function getWeeklySummaryInsight(state, referenceDate = getCurrentAppDate(state)) {
  const end = new Date(referenceDate)
  if (end.getDay() !== 0) return null
  if (IS_SANDBOX) end.setHours(23, 59, 59, 999)
  const start = getWeekStart(end)
  const events = getStudyInsightEvents(state, end).filter(event => {
    const watchedAt = new Date(event.watchedAt)
    return watchedAt >= start && watchedAt <= end
  })
  const totalSeconds = events.reduce((sum, event) => sum + event.seconds, 0)
  const videoTotals = new Map()
  events.forEach(event => {
    const key = event.videoId || event.videoTitle
    if (!key) return
    const current = videoTotals.get(key) || {
      title: event.videoTitle || t('videos.search.untitled'),
      seconds: 0
    }
    current.seconds += event.seconds
    videoTotals.set(key, current)
  })
  const topVideo = Array.from(videoTotals.values()).sort((a, b) => b.seconds - a.seconds)[0] || null
  const channelTotals = new Map()
  events.forEach(event => {
    const key = event.channelId || event.channelTitle || 'youtube'
    const current = channelTotals.get(key) || {
      name: event.channelTitle || t('videos.search.youtube'),
      seconds: 0
    }
    current.seconds += event.seconds
    channelTotals.set(key, current)
  })
  const sortedChannels = Array.from(channelTotals.values()).sort((a, b) => b.seconds - a.seconds)
  const channelBreakdown = sortedChannels.slice(0, 4)
  if (sortedChannels.length > 4) {
    channelBreakdown.push({
      name: t('insights.weekly.otherChannel'),
      seconds: sortedChannels.slice(4).reduce((sum, channel) => sum + channel.seconds, 0)
    })
  }

  const startKey = toDateKey(start)
  const endKey = toDateKey(end)
  const weeklyAnki = Object.entries(state?.anki || {})
    .filter(([dateKey]) => dateKey >= startKey && dateKey <= endKey)
    .map(([dateKey, day]) => ({
      dateKey,
      reviewed: normalizeAnkiCount(day?.reviewed),
      created: normalizeAnkiCount(day?.created)
    }))
  const reviewedCards = weeklyAnki.reduce((sum, day) => sum + day.reviewed, 0)
  const ankiCreated = weeklyAnki.reduce((sum, day) => sum + day.created, 0)
  const activeDateKeys = new Set(events.map(event => event.dateKey))
  weeklyAnki.forEach(day => {
    if (day.reviewed > 0 || day.created > 0) activeDateKeys.add(day.dateKey)
  })

  return {
    id: 'weekly-summary',
    type: 'weekly-summary',
    variant: 0,
    totalSeconds,
    activeDays: activeDateKeys.size,
    videoCount: videoTotals.size,
    topVideoTitle: topVideo?.title || '',
    topVideoSeconds: topVideo?.seconds || 0,
    reviewedCards,
    ankiCreated,
    channelBreakdown,
    observationDays: 7
  }
}

function getStudyInsightCandidates(state, referenceDate = getCurrentAppDate(state)) {
  const events = getStudyInsightEvents(state, referenceDate)
  const activeDateKeys = new Set(events.map(event => event.dateKey))
  const totalSeconds = events.reduce((sum, event) => sum + event.seconds, 0)
  if (activeDateKeys.size < STUDY_INSIGHT_MIN_ACTIVE_DAYS || totalSeconds < STUDY_INSIGHT_MIN_VIDEO_SECONDS) return []

  const firstStudyDate = new Date(`${events[0].dateKey}T12:00:00`)
  const lastObservationDate = new Date(referenceDate)
  lastObservationDate.setHours(12, 0, 0, 0)
  const observationDays = Math.min(
    STUDY_INSIGHT_LOOKBACK_DAYS,
    Math.max(1, Math.floor((lastObservationDate - firstStudyDate) / 86_400_000) + 1)
  )
  if (observationDays < 14) return []

  const distribution = Object.fromEntries(STUDY_INSIGHT_TIME_WINDOWS.map(window => [window.id, {
    seconds: 0,
    activeDateKeys: new Set()
  }]))
  events.forEach(event => {
    distribution[event.windowId].seconds += event.seconds
    distribution[event.windowId].activeDateKeys.add(event.dateKey)
  })

  const suggestedMinutes = 15
  const candidates = []
  const ankiLookbackStart = new Date(referenceDate)
  ankiLookbackStart.setDate(ankiLookbackStart.getDate() - (STUDY_INSIGHT_LOOKBACK_DAYS - 1))
  const ankiLookbackStartKey = toDateKey(ankiLookbackStart)
  const ankiLookbackEndKey = toDateKey(referenceDate)
  const ankiReviewDays = Object.entries(state?.anki || {})
    .map(([dateKey, day]) => ({ dateKey, reviewed: normalizeAnkiCount(day?.reviewed) }))
    .filter(day => day.dateKey >= ankiLookbackStartKey && day.dateKey <= ankiLookbackEndKey && day.reviewed > 0)
  const reviewedCards = ankiReviewDays.reduce((sum, day) => sum + day.reviewed, 0)
  const activeDates = Array.from(activeDateKeys).map(dateKey => new Date(`${dateKey}T12:00:00`))
  const weekdayCounts = Array(7).fill(0)
  activeDates.forEach(date => { weekdayCounts[date.getDay()] += 1 })
  const dominantWeekdayIndex = weekdayCounts.reduce(
    (bestIndex, count, index) => count > weekdayCounts[bestIndex] ? index : bestIndex,
    0
  )
  const dominantWeekdayDays = weekdayCounts[dominantWeekdayIndex]
  const dominantWeekdayRatio = dominantWeekdayDays / activeDateKeys.size
  const weekendDateKeys = new Set(events
    .filter(event => {
      const day = new Date(`${event.dateKey}T12:00:00`).getDay()
      return day === 0 || day === 6
    })
    .map(event => event.dateKey))
  const weekendSeconds = events
    .filter(event => weekendDateKeys.has(event.dateKey))
    .reduce((sum, event) => sum + event.seconds, 0)
  const weekendRatio = weekendSeconds / totalSeconds
  const comparisonEnd = new Date(referenceDate)
  comparisonEnd.setHours(23, 59, 59, 999)
  const recentStart = new Date(comparisonEnd)
  recentStart.setDate(recentStart.getDate() - 13)
  recentStart.setHours(0, 0, 0, 0)
  const previousStart = new Date(recentStart)
  previousStart.setDate(previousStart.getDate() - 14)
  const recentEvents = events.filter(event => new Date(event.watchedAt) >= recentStart)
  const previousEvents = events.filter(event => {
    const watchedAt = new Date(event.watchedAt)
    return watchedAt >= previousStart && watchedAt < recentStart
  })
  const recentSeconds = recentEvents.reduce((sum, event) => sum + event.seconds, 0)
  const previousSeconds = previousEvents.reduce((sum, event) => sum + event.seconds, 0)
  const recentActiveDays = new Set(recentEvents.map(event => event.dateKey)).size
  const dominantWindow = STUDY_INSIGHT_TIME_WINDOWS
    .map(window => ({
      id: window.id,
      seconds: distribution[window.id].seconds,
      activeDays: distribution[window.id].activeDateKeys.size,
      ratio: distribution[window.id].seconds / totalSeconds
    }))
    .sort((a, b) => b.ratio - a.ratio)[0]

  if (dominantWindow?.ratio >= 0.55 && dominantWindow.activeDays >= 4) {
    candidates.push({
      id: `preferred-${dominantWindow.id}`,
      type: 'preferred-window',
      score: dominantWindow.ratio + 0.18,
      windowId: dominantWindow.id,
      percent: Math.round(dominantWindow.ratio * 100),
      suggestedMinutes,
      activeDays: activeDateKeys.size,
      observationDays
    })
  }

  const morning = distribution.morning
  const morningRatio = morning.seconds / totalSeconds
  if (morningRatio <= 0.08 && morning.activeDateKeys.size <= 1) {
    candidates.push({
      id: 'morning-opportunity',
      type: 'morning-opportunity',
      score: 0.72 + Math.max(0, 0.08 - morningRatio),
      windowId: 'morning',
      percent: Math.round(morningRatio * 100),
      suggestedMinutes: 15,
      activeDays: activeDateKeys.size,
      observationDays
    })
  }

  if (dominantWeekdayDays >= 4 && dominantWeekdayRatio >= 0.28) {
    candidates.push({
      id: `reliable-weekday-${dominantWeekdayIndex}`,
      type: 'reliable-weekday',
      score: 0.62 + dominantWeekdayRatio,
      weekdayIndex: dominantWeekdayIndex,
      percent: Math.round(dominantWeekdayRatio * 100),
      activeDays: activeDateKeys.size,
      observationDays
    })
  }

  if (weekendRatio <= 0.08 && weekendDateKeys.size <= 1) {
    candidates.push({
      id: 'weekend-opportunity',
      type: 'weekend-opportunity',
      score: 0.6 + Math.max(0, 0.08 - weekendRatio),
      percent: Math.round(weekendRatio * 100),
      suggestedMinutes: 15,
      activeDays: activeDateKeys.size,
      observationDays
    })
  }

  if (previousSeconds >= 30 * 60 && recentSeconds >= previousSeconds * 1.4 && recentActiveDays >= 3) {
    candidates.push({
      id: 'momentum-up',
      type: 'momentum-up',
      score: 0.78,
      comparisonPercent: Math.round((recentSeconds / previousSeconds - 1) * 100),
      recentMinutes: Math.round(recentSeconds / 60),
      previousMinutes: Math.round(previousSeconds / 60),
      activeDays: recentActiveDays,
      observationDays
    })
  } else if (previousSeconds >= 60 * 60 && recentSeconds <= previousSeconds * 0.55) {
    candidates.push({
      id: 'momentum-reset',
      type: 'momentum-reset',
      score: 0.74,
      comparisonPercent: Math.round((1 - recentSeconds / previousSeconds) * 100),
      recentMinutes: Math.round(recentSeconds / 60),
      previousMinutes: Math.round(previousSeconds / 60),
      suggestedMinutes: 15,
      activeDays: recentActiveDays,
      observationDays
    })
  }

  if (isAnkiEnabled(state) && ankiReviewDays.length >= 2 && reviewedCards >= 30) {
    candidates.push({
      id: 'anki-fallback',
      type: 'anki-fallback',
      score: 0.64,
      ankiDays: ankiReviewDays.length,
      reviewedCards,
      activeDays: activeDateKeys.size,
      observationDays
    })
  }

  candidates.push({
    id: 'steady-process',
    type: 'steady-process',
    score: 0.54,
    activeDays: activeDateKeys.size,
    observationDays
  })

  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

function getStudyInsight(state, referenceDate = getCurrentAppDate(state)) {
  const weeklySummary = getWeeklySummaryInsight(state, referenceDate)
  if (weeklySummary) return weeklySummary
  const candidates = getStudyInsightCandidates(state, referenceDate)
  if (!candidates.length) return null

  const date = new Date(referenceDate)
  date.setHours(12, 0, 0, 0)
  const weekIndex = Math.floor(date.getTime() / (7 * 86_400_000))
  const candidate = candidates[weekIndex % candidates.length]
  const history = state?.config?.studyInsights?.history || []
  const currentKey = getStudyInsightHistoryKey(candidate, state, referenceDate)
  const currentEntry = history.find(entry => entry.key === currentKey)
  const previousEntry = history.find(entry => entry.insightId === candidate.id)
  const variant = currentEntry
    ? currentEntry.variant
    : ((Number(previousEntry?.variant) || 0) + (previousEntry ? 1 : 0)) % STUDY_INSIGHT_VARIANT_COUNT
  return { ...candidate, variant }
}

function getStudyInsightHistoryKey(insight, state, referenceDate = getCurrentAppDate(state)) {
  if (!insight?.id) return ''
  return `${toDateKey(getWeekStart(referenceDate))}:${insight.id}`
}

function recordStudyInsight(state, insight, referenceDate = getCurrentAppDate(state)) {
  if (!state?.config || !insight) return ''
  normalizeStudyInsightConfig(state)
  const key = getStudyInsightHistoryKey(insight, state, referenceDate)
  if (!key) return ''
  const historyEntry = {
    key,
    insightId: insight.id,
    type: insight.type,
    variant: insight.variant || 0,
    windowId: insight.windowId || null,
    weekdayIndex: Number.isInteger(insight.weekdayIndex) ? insight.weekdayIndex : null,
    percent: insight.percent || 0,
    comparisonPercent: insight.comparisonPercent || 0,
    recentMinutes: insight.recentMinutes || 0,
    previousMinutes: insight.previousMinutes || 0,
    suggestedMinutes: insight.suggestedMinutes || 0,
    activeDays: insight.activeDays || 0,
    ankiDays: insight.ankiDays || 0,
    reviewedCards: insight.reviewedCards || 0,
    ankiCreated: insight.ankiCreated || 0,
    totalSeconds: insight.totalSeconds || 0,
    videoCount: insight.videoCount || 0,
    topVideoTitle: insight.topVideoTitle || '',
    topVideoSeconds: insight.topVideoSeconds || 0,
    channelBreakdown: insight.channelBreakdown || [],
    observationDays: insight.observationDays || 0,
    recordedAt: getCurrentAppTimestamp(state)
  }
  const existingIndex = state.config.studyInsights.history.findIndex(entry => entry.key === key)
  if (existingIndex >= 0) {
    if (insight.type !== 'weekly-summary') return key
    state.config.studyInsights.history[existingIndex] = historyEntry
  } else {
    state.config.studyInsights.history.unshift(historyEntry)
  }
  normalizeStudyInsightConfig(state)
  saveState(state, { backup: false })
  return key
}

function getPreviousStudyInsights(state, currentKey = '') {
  normalizeStudyInsightConfig(state)
  return state.config.studyInsights.history.filter(entry => entry.key !== currentKey)
}

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

  return {
    hoursWatched, secondsWatched, goalHours, goalProgress,
    videosWatched: weekHistory.videosWatched,
    videosPartial: partial.length,
    remainingSeconds,
    ankiReviewed: weekHistory.ankiReviewed,
    ankiCreated:  weekHistory.ankiCreated
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
  const totalMinutes = secs > 0 ? Math.max(1, Math.round(secs / 60)) : 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
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
  syncMobileAddButtonWidth()
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
  renderGoalPaceGuidance(stats, s)
  renderStudyInsight(s)
}

function getFriendlyPaceMinutes(minutes) {
  const roundedMinutes = Math.max(1, Math.ceil(Number(minutes) || 0))
  const friendlySteps = [5, 10, 15, 20, 30, 45, 60]
  return friendlySteps.find(step => roundedMinutes <= step) || Math.ceil(roundedMinutes / 15) * 15
}

function getGoalPaceGuidance(stats, state) {
  if (stats.goalProgress >= 100 || stats.remainingSeconds <= 0) {
    return { state: 'complete', text: t('goal.pace.complete') }
  }
  const includeShorts = normalizeIncludeShorts(state.config.includeShorts)
  const hasStudyVideo = getVisibleActiveVideos(Object.values(state.videos || {}), includeShorts).length > 0
  if (!hasStudyVideo) return null

  const currentDate = getCurrentAppDate(state)
  const dayIndex = (currentDate.getDay() + 6) % 7
  const expectedThroughToday = stats.goalHours * 3600 * ((dayIndex + 1) / 7)
  if (stats.secondsWatched > 0 && stats.secondsWatched >= expectedThroughToday) {
    return { state: 'on-track', text: t('goal.pace.onTrack') }
  }

  const remainingDays = Math.max(1, 7 - dayIndex)
  const paceMinutes = getFriendlyPaceMinutes(stats.remainingSeconds / remainingDays / 60)
  const isShortSession = paceMinutes <= 60
  const text = isShortSession
    ? t('goal.pace.session', { minutes: paceMinutes })
    : t('goal.pace.longSession', { time: formatHoursMinutes(paceMinutes * 60) })
  return { state: 'action', text }
}

function renderGoalPaceGuidance(stats, state) {
  const container = document.getElementById('goalPaceGuidance')
  const text = document.getElementById('goalPaceText')
  if (!container || !text) return

  const guidance = getGoalPaceGuidance(stats, state)
  container.classList.toggle('hidden', !guidance)
  if (!guidance) {
    container.removeAttribute('data-state')
    text.textContent = ''
    return
  }
  container.dataset.state = guidance.state
  text.textContent = guidance.text
}

function getStudyInsightSubject(state) {
  const languages = Array.isArray(state?.learnerProfile?.languages)
    ? Array.from(new Set(state.learnerProfile.languages))
    : []
  const language = languages.length === 1 ? getLearnerLanguageOption(languages[0]) : null
  return language ? t(`onboarding.language.${language.id}`) : t('insights.subject.study')
}

function getStudyInsightViewModel(insight, state) {
  if (!insight) return null
  const windowLabel = insight.windowId ? t(`insights.window.${insight.windowId}`) : ''
  const weekday = Number.isInteger(insight.weekdayIndex)
    ? formatLocaleDate(new Date(2026, 0, 4 + insight.weekdayIndex), { weekday: 'long' })
    : ''
  const suffix = insight.variant === 1 ? '.alt' : ''
  const common = {
    window: windowLabel,
    weekday,
    minutes: insight.suggestedMinutes,
    suggestedMinutes: insight.suggestedMinutes,
    percent: insight.percent,
    comparisonPercent: insight.comparisonPercent,
    recentMinutes: insight.recentMinutes,
    previousMinutes: insight.previousMinutes,
    days: insight.activeDays,
    ankiDays: insight.ankiDays,
    reviewedCards: insight.reviewedCards,
    observationDays: insight.observationDays,
    subject: getStudyInsightSubject(state)
  }

  if (insight.type === 'weekly-summary') {
    const summaryKey = insight.videoCount === 0
      ? 'insights.weekly.summary.zero'
      : insight.videoCount === 1
        ? 'insights.weekly.summary.one'
        : 'insights.weekly.summary.many'
    const summary = t(summaryKey, {
      time: formatHoursMinutes(insight.totalSeconds),
      videos: insight.videoCount
    })
    const channelText = insight.channelBreakdown?.length
      ? t('insights.weekly.channels', {
          channels: insight.channelBreakdown
            .map(channel => `${channel.name} ${formatHoursMinutes(channel.seconds)}`)
            .join(', ')
        })
      : ''
    const details = [t('insights.weekly.activeDays', { days: insight.activeDays })]
    if (insight.topVideoTitle && insight.topVideoSeconds > 0) {
      details.push(t('insights.weekly.topVideo', {
        video: insight.topVideoTitle,
        time: formatHoursMinutes(insight.topVideoSeconds)
      }))
    }
    if (insight.reviewedCards > 0 || insight.ankiCreated > 0) {
      details.push(t('insights.weekly.anki', {
        reviewed: insight.reviewedCards,
        created: insight.ankiCreated
      }))
    }
    return {
      title: t('insights.weekly.title'),
      body: channelText ? `${summary} ${channelText}` : summary,
      evidence: details.join(' · ')
    }
  }

  if (insight.type === 'preferred-window') {
    return {
      title: t(`insights.title.preferred-window${suffix}`),
      body: t(`insights.body.preferred-window${suffix}`, common),
      evidence: t('insights.evidence.preferred-window', common)
    }
  }
  if (insight.type === 'morning-opportunity') {
    return {
      title: t(`insights.title.morning-opportunity${suffix}`),
      body: t(`insights.body.morning-opportunity${suffix}`, common),
      evidence: t('insights.evidence.morning-opportunity', common)
    }
  }
  if (insight.type === 'reliable-weekday') {
    return {
      title: t(`insights.title.reliable-weekday${suffix}`, common),
      body: t(`insights.body.reliable-weekday${suffix}`, common),
      evidence: t('insights.evidence.reliable-weekday', common)
    }
  }
  if (insight.type === 'weekend-opportunity') {
    return {
      title: t(`insights.title.weekend-opportunity${suffix}`),
      body: t(`insights.body.weekend-opportunity${suffix}`, common),
      evidence: t('insights.evidence.weekend-opportunity', common)
    }
  }
  if (insight.type === 'momentum-up') {
    return {
      title: t(`insights.title.momentum-up${suffix}`),
      body: t(`insights.body.momentum-up${suffix}`, common),
      evidence: t('insights.evidence.momentum-up', common)
    }
  }
  if (insight.type === 'momentum-reset') {
    return {
      title: t(`insights.title.momentum-reset${suffix}`),
      body: t(`insights.body.momentum-reset${suffix}`, common),
      evidence: t('insights.evidence.momentum-reset', common)
    }
  }
  if (insight.type === 'anki-fallback') {
    return {
      title: t(`insights.title.anki-fallback${suffix}`),
      body: t(`insights.body.anki-fallback${suffix}`),
      evidence: t('insights.evidence.anki-fallback', common)
    }
  }
  if (insight.type === 'steady-process') {
    return {
      title: t(`insights.title.steady-process${suffix}`),
      body: t(`insights.body.steady-process${suffix}`),
      evidence: t('insights.evidence.steady-process', common)
    }
  }
  return null
}

function renderPreviousStudyInsightItem(entry, state) {
  const viewModel = getStudyInsightViewModel(entry, state)
  if (!viewModel) return ''
  const recordedAt = new Date(entry.recordedAt)
  const dateLabel = formatLocaleDate(recordedAt, { year: 'numeric', month: 'short', day: 'numeric' })
  return `
    <article class="study-insight-history-item">
      <span class="study-insight-history-head">
        <strong class="study-insight-title">${escHtml(viewModel.title)}</strong>
        <time class="study-insight-history-date" datetime="${escHtml(recordedAt.toISOString())}">${escHtml(dateLabel)}</time>
      </span>
      <span class="study-insight-body">${escHtml(viewModel.body)}</span>
      <span class="study-insight-evidence">${escHtml(viewModel.evidence)}</span>
    </article>
  `
}

function setStudyInsightView(view) {
  selectedStudyInsightView = view === 'previous' ? 'previous' : 'current'
  const state = loadState()
  if (state) renderStudyInsight(state)
}

function renderStudyInsight(state) {
  const container = document.getElementById('studyInsightCard')
  const reopenButton = document.getElementById('studyInsightReopen')
  const icon = document.getElementById('studyInsightIcon')
  const title = document.getElementById('studyInsightTitle')
  const body = document.getElementById('studyInsightBody')
  const evidence = document.getElementById('studyInsightEvidence')
  const currentTab = document.getElementById('studyInsightCurrentTab')
  const previousTab = document.getElementById('studyInsightPreviousTab')
  const currentPanel = document.getElementById('studyInsightCurrentPanel')
  const historyPanel = document.getElementById('studyInsightHistoryPanel')
  const historyCount = document.getElementById('studyInsightHistoryCount')
  if (!container || !icon || !title || !body || !evidence) return

  normalizeStudyInsightConfig(state)
  const insight = getStudyInsight(state)
  const viewModel = getStudyInsightViewModel(insight, state)
  const enabled = isStudyInsightsEnabled(state)
  const collapsed = state.config.studyInsights.collapsed === true
  const currentKey = insight && viewModel
    ? (collapsed && enabled ? getStudyInsightHistoryKey(insight, state) : recordStudyInsight(state, insight))
    : ''
  const previousInsights = getPreviousStudyInsights(state, currentKey)
  if (selectedStudyInsightView === 'previous' && !previousInsights.length) selectedStudyInsightView = 'current'
  const showingHistory = selectedStudyInsightView === 'previous'
  container.classList.toggle('hidden', !viewModel || collapsed || !enabled)
  reopenButton?.classList.toggle('hidden', !viewModel || !collapsed || !enabled)
  if (!viewModel) {
    selectedStudyInsightView = 'current'
    container.removeAttribute('data-insight-id')
    container.classList.remove('showing-history')
    title.textContent = ''
    body.textContent = ''
    evidence.textContent = ''
    return
  }

  container.dataset.insightId = insight.id
  container.classList.toggle('showing-history', showingHistory)
  title.textContent = viewModel.title
  body.textContent = viewModel.body
  evidence.textContent = viewModel.evidence

  currentTab?.classList.toggle('active', !showingHistory)
  currentTab?.setAttribute('aria-selected', String(!showingHistory))
  currentTab?.setAttribute('tabindex', showingHistory ? '-1' : '0')
  previousTab?.classList.toggle('active', showingHistory)
  previousTab?.setAttribute('aria-selected', String(showingHistory))
  previousTab?.setAttribute('tabindex', showingHistory ? '0' : '-1')
  previousTab?.toggleAttribute('disabled', !previousInsights.length)
  previousTab?.setAttribute('aria-label', t('insights.previous.aria', { count: previousInsights.length }))
  currentPanel?.classList.toggle('hidden', showingHistory)
  historyPanel?.classList.toggle('hidden', !showingHistory)
  if (historyCount) historyCount.textContent = String(previousInsights.length)
  if (historyPanel) {
    historyPanel.innerHTML = previousInsights.length
      ? previousInsights.map(entry => renderPreviousStudyInsightItem(entry, state)).join('')
      : `<span class="study-insight-history-empty">${escHtml(t('insights.previous.empty'))}</span>`
  }
}

function setStudyInsightsCollapsed(collapsed) {
  const state = loadState()
  if (!state) return
  normalizeStudyInsightConfig(state)
  state.config.studyInsights.collapsed = collapsed === true
  saveState(state, { backup: false })
  renderStudyInsight(state)
  requestAnimationFrame(() => {
    if (collapsed) document.getElementById('studyInsightReopen')?.focus()
    else document.querySelector('.study-insight-tab.active')?.focus()
  })
}

function renderNextStudy(activeVideos = []) {
  const container = document.getElementById('nextStudyCard')
  if (!container) return null
  const nextVideo = activeVideos.find(video => getVideoStatus(video) === 'partial')
    || activeVideos.find(video => getVideoStatus(video) === 'watch-later')
  container.classList.toggle('hidden', !nextVideo)
  if (!nextVideo) {
    container.classList.remove('continue-watching-card', 'study-next-card')
    container.innerHTML = ''
    return null
  }

  const status = getVideoStatus(nextVideo)
  const isInProgress = status === 'partial'
  const safeVideoId = escHtml(nextVideo.id)
  const videoUrl = escHtml(getVideoUrl(nextVideo))
  const cta = isInProgress ? t('nextStudy.resume') : t('nextStudy.watch')
  const resumeAt = formatResumeTimestamp(nextVideo.resumeAtSeconds) || '00:00:00'
  container.classList.toggle('continue-watching-card', isInProgress)
  container.classList.toggle('study-next-card', !isInProgress)
  const actions = isInProgress
    ? `
      <button type="button"
        class="next-study-cta next-study-reset"
        data-video-id="${safeVideoId}"
        onclick="markVideo(this.dataset.videoId, 'unwatched')">${escHtml(t('nextStudy.unwatch'))}</button>
      <span class="next-study-cta next-study-continue"
        onclick="if (!event.target.closest('input, a')) this.querySelector('.next-study-play')?.click()">
        <span class="next-study-continue-at">${escHtml(t('videos.card.continueAt'))}</span>
        <span class="next-study-continue-short">${escHtml(t('nextStudy.continueShort'))}</span>
        <input type="text"
          class="next-study-time-input"
          value="${escHtml(resumeAt)}"
          placeholder="00:01:23"
          inputmode="text"
          data-video-id="${safeVideoId}"
          onchange="saveVideoResumeTime(this.dataset.videoId, this.value)"
          onkeydown="if (event.key === 'Enter') this.blur()"
          aria-label="${escHtml(t('videos.card.timestampLabel'))}">
        <a class="next-study-play"
          href="${videoUrl}"
          target="_blank"
          rel="noopener"
          data-video-id="${safeVideoId}"
          onmousedown="if (event.button === 0) event.preventDefault()"
          onclick="return prepareNextStudyVideoOpen(this)"
          aria-label="${escHtml(cta)}: ${escHtml(nextVideo.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5L8 5.5Z"></path></svg>
        </a>
      </span>
    `
    : `
      <button type="button"
        class="next-study-cta next-study-reset"
        data-video-id="${safeVideoId}"
        onclick="markVideo(this.dataset.videoId, 'unwatched')">${escHtml(t('nextStudy.notInterested'))}</button>
      <a class="next-study-cta next-study-watch"
        href="${videoUrl}"
        target="_blank"
        rel="noopener"
        data-video-id="${safeVideoId}"
        onclick="markVideoInProgressOnOpen(this.dataset.videoId)">${escHtml(t('nextStudy.watch'))}</a>
    `
  container.innerHTML = `
    <a class="next-study-mobile-link" href="${videoUrl}" target="_blank" rel="noopener" data-video-id="${safeVideoId}" onclick="markVideoInProgressOnOpen(this.dataset.videoId)" aria-label="${escHtml(cta)}: ${escHtml(nextVideo.title)}"></a>
    <a class="next-study-thumb-link" href="${videoUrl}" target="_blank" rel="noopener" data-video-id="${safeVideoId}" onclick="markVideoInProgressOnOpen(this.dataset.videoId)" aria-label="${escHtml(cta)}: ${escHtml(nextVideo.title)}">
      <img class="next-study-thumb" src="${escHtml(nextVideo.thumbnail)}" alt="" loading="lazy">
    </a>
    <span class="next-study-copy">
      <span class="next-study-eyebrow">${escHtml(t(isInProgress ? 'nextStudy.title' : 'nextStudy.studyNext'))}</span>
      <span class="next-study-title" title="${escHtml(nextVideo.title)}">${escHtml(nextVideo.title)}</span>
      <span class="next-study-meta">${escHtml(nextVideo.channelTitle || '')} · ${escHtml(formatVideoStatus(status))}</span>
    </span>
    <span class="next-study-actions">
      ${actions}
    </span>
  `
  return nextVideo
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
  const state = loadState()
  if (isMobileLayout() && getHistoryPeriodOptions(state || { videos: {}, anki: {} }, range).length === 0) return
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
  renderStudyHistoryPanel(state)
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
  updateCityMilestoneImage(snapshot.visualScore, { preloadCenterIndex: getCurrentCityImageIndex(s) })
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

function launchCityLevelUpConfetti() {
  const cityImageWrap = document.querySelector('.city-image-wrap')
  if (!cityImageWrap) return

  cityImageWrap.querySelector('.city-level-up-confetti')?.remove()
  const burst = document.createElement('div')
  burst.className = 'city-level-up-confetti'
  burst.setAttribute('aria-hidden', 'true')
  const colors = ['#dfff45', '#12bcea', '#ff5f87', '#ffd84a', '#ffffff', '#9f7aea']
  const { width, height } = cityImageWrap.getBoundingClientRect()

  ;['left', 'right'].forEach(corner => {
    const emitter = document.createElement('div')
    emitter.className = `city-confetti-emitter city-confetti-emitter-${corner}`
    const direction = corner === 'left' ? 1 : -1

    for (let index = 0; index < 44; index += 1) {
      const particle = document.createElement('i')
      const particleKind = index % 5 === 0 ? 'ribbon' : index % 4 === 0 ? 'streamer' : 'paper'
      particle.className = `city-confetti-${particleKind}`
      const horizontalDistance = direction * width * (0.08 + Math.random() * 0.42)
      const verticalDistance = -height * (0.52 + Math.random() * 0.48)
      particle.style.setProperty('--confetti-x', `${horizontalDistance.toFixed(1)}px`)
      particle.style.setProperty('--confetti-y', `${verticalDistance.toFixed(1)}px`)
      particle.style.setProperty('--confetti-rotation', `${Math.round((Math.random() - 0.5) * 1080)}deg`)
      particle.style.setProperty('--confetti-delay', `${(Math.random() * 90).toFixed(0)}ms`)
      particle.style.setProperty('--confetti-duration', `${(780 + Math.random() * 520).toFixed(0)}ms`)
      particle.style.setProperty('--confetti-color', colors[index % colors.length])
      particle.style.setProperty('--confetti-width', `${(4 + Math.random() * 5).toFixed(1)}px`)
      particle.style.setProperty('--confetti-height', `${(7 + Math.random() * 7).toFixed(1)}px`)
      emitter.appendChild(particle)
    }

    burst.appendChild(emitter)
  })

  cityImageWrap.appendChild(burst)
  window.setTimeout(() => burst.remove(), 1700)
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
    title: t('log.levelUp.title'),
    detail: getCityLevelLabel(CITY_LEVELS[s.cityProgress.maxLevelIndex]),
    meta: { levelIndex: s.cityProgress.maxLevelIndex }
  })
  saveState(s)
  renderAll(s)
  launchCityLevelUpConfetti()
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
    if (normalizeAnkiCount(day.reviewed) > 0 || normalizeAnkiCount(day.created) > 0) dates.push(dateKey)
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
    if (normalizeAnkiCount(day.reviewed) > 0 || normalizeAnkiCount(day.created) > 0) dates.push(dateKey)
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

function initCityWaveformTouchNavigation() {
  const bars = document.getElementById('cityWaveBars')
  if (!bars || bars.dataset.touchNavigationReady === 'true') return
  bars.dataset.touchNavigationReady = 'true'

  bars.addEventListener('pointerdown', event => {
    if (!isMobileLayout() || event.pointerType !== 'touch' || cityWaveformScroll.touchPointerId !== null) return
    cityWaveformScroll.touchPointerId = event.pointerId
    cityWaveformScroll.touchStartX = event.clientX
    cityWaveformScroll.touchStartY = event.clientY
    cityWaveformScroll.touchStartScrollLeft = bars.scrollLeft
    cityWaveformScroll.touchDragging = false
    cityWaveformScroll.touchPreviewOffset = null
  })

  bars.addEventListener('pointermove', event => {
    if (event.pointerId !== cityWaveformScroll.touchPointerId) return
    const deltaX = event.clientX - cityWaveformScroll.touchStartX
    const deltaY = event.clientY - cityWaveformScroll.touchStartY

    if (!cityWaveformScroll.touchDragging) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return
      if (Math.abs(deltaY) >= Math.abs(deltaX)) return
      cityWaveformScroll.touchDragging = true
      bars.classList.add('is-touch-dragging')
      try { bars.setPointerCapture(event.pointerId) } catch {}
    }

    event.preventDefault()
    const maxScroll = Math.max(0, bars.scrollWidth - bars.clientWidth)
    bars.scrollLeft = clampNumber(cityWaveformScroll.touchStartScrollLeft - deltaX, 0, maxScroll)
    scheduleCityWaveformTouchPreview(bars, { pointerX: event.clientX })
  }, { passive: false })

  const finishTouchNavigation = event => {
    if (event.pointerId !== cityWaveformScroll.touchPointerId) return
    const didDrag = cityWaveformScroll.touchDragging
    if (didDrag) {
      scheduleCityWaveformTouchPreview(bars, { commit: true, pointerX: event.clientX })
      cityWaveformScroll.suppressClickUntil = Date.now() + 450
    }
    bars.classList.remove('is-touch-dragging')
    cityWaveformScroll.touchPointerId = null
    cityWaveformScroll.touchDragging = false
    try { bars.releasePointerCapture(event.pointerId) } catch {}
  }

  bars.addEventListener('pointerup', finishTouchNavigation)
  bars.addEventListener('pointercancel', finishTouchNavigation)
  bars.addEventListener('click', event => {
    if (Date.now() > cityWaveformScroll.suppressClickUntil) return
    event.preventDefault()
    event.stopPropagation()
  }, true)
}

function scheduleCityWaveformTouchPreview(bars, { commit = false, pointerX = null } = {}) {
  if (!bars) return
  if (cityWaveformScroll.touchPreviewFrame) cancelAnimationFrame(cityWaveformScroll.touchPreviewFrame)
  cityWaveformScroll.touchPreviewFrame = requestAnimationFrame(() => {
    cityWaveformScroll.touchPreviewFrame = null
    const rect = bars.getBoundingClientRect()
    cityWaveformScroll.pointerX = bars.scrollWidth > bars.clientWidth + 1
      ? rect.left + rect.width / 2
      : clampNumber(pointerX ?? rect.left + rect.width / 2, rect.left, rect.right)
    cityWaveformScroll.pointerY = rect.top + rect.height / 2
    const bar = getClosestCityWaveBarAtPointer(bars)
    const offset = Number.parseInt(bar?.dataset?.offset, 10)
    if (!bar || !Number.isFinite(offset)) return

    if (commit) {
      selectCityWaveBar(bar)
      return
    }
    if (offset === cityWaveformScroll.touchPreviewOffset) return
    cityWaveformScroll.touchPreviewOffset = offset
    previewCityWaveBar(bar, { persist: true })
    document.getElementById('cityTimeWaveform')?.classList.add('has-touch-preview')
  })
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
  if (isMobileLayout()) return
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
    if (event.pointerType === 'touch' && isMobileLayout()) {
      cityImageView.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (cityImageView.touchPointers.size >= 2) {
        event.preventDefault()
        beginCityImagePinch(wrap)
      } else if (cityImageView.scale > 1) {
        event.preventDefault()
        beginCityImageTouchDrag(wrap, event.pointerId, event.clientX, event.clientY)
      }
      return
    }
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
    if (event.pointerType === 'touch' && isMobileLayout() && cityImageView.touchPointers.has(event.pointerId)) {
      cityImageView.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (cityImageView.pinching && cityImageView.touchPointers.size >= 2) {
        event.preventDefault()
        updateCityImagePinch(wrap)
        return
      }
    }
    if (!cityImageView.dragging || cityImageView.pointerId !== event.pointerId) return
    if (event.pointerType === 'touch') event.preventDefault()
    cityImageView.x = cityImageView.originX + event.clientX - cityImageView.startX
    cityImageView.y = cityImageView.originY + event.clientY - cityImageView.startY
    clampCityImagePan()
    applyCityImageTransform()
  })

  const endDrag = event => {
    if (event.pointerType === 'touch' && isMobileLayout()) {
      const trackedTouch = cityImageView.touchPointers.has(event.pointerId)
      cityImageView.touchPointers.delete(event.pointerId)
      if (trackedTouch && cityImageView.pinching) {
        cityImageView.pinching = false
        if (cityImageView.touchPointers.size >= 2) {
          beginCityImagePinch(wrap)
          return
        }
        const remaining = cityImageView.touchPointers.entries().next().value
        if (remaining && cityImageView.scale > 1) {
          const [pointerId, point] = remaining
          beginCityImageTouchDrag(wrap, pointerId, point.x, point.y)
        } else {
          cityImageView.dragging = false
          cityImageView.pointerId = null
          wrap.classList.remove('is-dragging')
        }
        return
      }
    }
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

function beginCityImageTouchDrag(wrap, pointerId, clientX, clientY) {
  cityImageView.pinching = false
  cityImageView.dragging = true
  cityImageView.pointerId = pointerId
  cityImageView.startX = clientX
  cityImageView.startY = clientY
  cityImageView.originX = cityImageView.x
  cityImageView.originY = cityImageView.y
  wrap.classList.add('is-dragging')
  try { wrap.setPointerCapture(pointerId) } catch {}
}

function beginCityImagePinch(wrap) {
  const points = Array.from(cityImageView.touchPointers.values()).slice(0, 2)
  if (points.length < 2) return
  const rect = wrap.getBoundingClientRect()
  const center = getCityImageTouchCenter(points, rect)
  cityImageView.pinching = true
  cityImageView.dragging = false
  cityImageView.pointerId = null
  cityImageView.pinchStartDistance = Math.max(1, getCityImageTouchDistance(points))
  cityImageView.pinchStartScale = cityImageView.scale
  cityImageView.pinchStartX = cityImageView.x
  cityImageView.pinchStartY = cityImageView.y
  cityImageView.pinchStartCenterX = center.x
  cityImageView.pinchStartCenterY = center.y
  wrap.classList.add('is-dragging')
  cityImageView.touchPointers.forEach((_point, pointerId) => {
    try { wrap.setPointerCapture(pointerId) } catch {}
  })
}

function updateCityImagePinch(wrap) {
  const points = Array.from(cityImageView.touchPointers.values()).slice(0, 2)
  if (points.length < 2 || !cityImageView.pinchStartDistance) return
  const rect = wrap.getBoundingClientRect()
  const center = getCityImageTouchCenter(points, rect)
  const nextScale = clampNumber(
    cityImageView.pinchStartScale * getCityImageTouchDistance(points) / cityImageView.pinchStartDistance,
    CITY_IMAGE_MIN_ZOOM,
    CITY_IMAGE_MAX_ZOOM
  )
  const scaleRatio = nextScale / cityImageView.pinchStartScale
  cityImageView.scale = nextScale
  cityImageView.x = center.x - (cityImageView.pinchStartCenterX - cityImageView.pinchStartX) * scaleRatio
  cityImageView.y = center.y - (cityImageView.pinchStartCenterY - cityImageView.pinchStartY) * scaleRatio
  clampCityImagePan()
  applyCityImageTransform()
}

function getCityImageTouchDistance(points) {
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
}

function getCityImageTouchCenter(points, rect) {
  return {
    x: (points[0].x + points[1].x) / 2 - rect.left - rect.width / 2,
    y: (points[0].y + points[1].y) / 2 - rect.top - rect.height / 2
  }
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
  cityImageView.touchPointers.clear()
  cityImageView.pinching = false
  cityImageView.dragging = false
  cityImageView.pointerId = null
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

function getCityImageSource(index) {
  if (CITY_IMAGE_SOURCES.length === 0) return null
  return CITY_IMAGE_SOURCES[clampNumber(index, 0, CITY_IMAGE_SOURCES.length - 1)]
}

function getCurrentCityImageIndex(state) {
  if (!state) return 0
  normalizeCityProgress(state)
  return clampNumber(state.cityProgress.maxLevelIndex, 0, CITY_IMAGE_SOURCES.length - 1)
}

function normalizeCityImageSource(source) {
  if (!source) return null
  if (typeof source === 'string') return { primary: source, fallback: source }
  const primary = source.primary || source.fallback
  const fallback = source.fallback || source.primary
  if (!primary && !fallback) return null
  return { primary, fallback }
}

function getCityImageCacheKey(source) {
  const normalized = normalizeCityImageSource(source)
  return normalized?.primary || normalized?.fallback || ''
}

function isCityImageLoaded(source) {
  return Boolean(cityImagePreloadCache.get(getCityImageCacheKey(source))?.loaded)
}

function decodeCityPreloadImage(img) {
  if (!img?.decode) return Promise.resolve()
  return img.decode().catch(() => {})
}

function preloadCityImages(centerIndex = 0) {
  queueCityImagePreloadsAround(centerIndex)
}

function preloadCityImage(source, options = {}) {
  const normalized = normalizeCityImageSource(source)
  if (!normalized) return null

  const cacheKey = getCityImageCacheKey(normalized)
  const cached = cityImagePreloadCache.get(cacheKey)
  if (cached) return cached

  const img = new Image()
  img.decoding = 'async'
  if ('fetchPriority' in img) img.fetchPriority = options.fetchPriority || 'low'

  const entry = {
    img,
    loaded: false,
    loadedSrc: null,
    promise: null,
    source: normalized
  }
  const promise = new Promise(resolve => {
    let triedFallback = false
    const finish = (loaded, src = null) => {
      entry.loaded = loaded
      entry.loadedSrc = src
      resolve({ loaded, src })
    }

    img.onload = () => {
      const loadedSrc = img.currentSrc || img.src
      decodeCityPreloadImage(img).then(() => finish(true, loadedSrc))
    }
    img.onerror = () => {
      if (!triedFallback && normalized.fallback && normalized.fallback !== normalized.primary) {
        triedFallback = true
        img.src = normalized.fallback
        return
      }
      finish(false)
    }
  })

  entry.promise = promise
  cityImagePreloadCache.set(cacheKey, entry)
  img.src = normalized.primary || normalized.fallback
  return entry
}

function getCityImagePreloadOrder(centerIndex) {
  const order = []
  for (let i = centerIndex - 1; i >= 0; i -= 1) order.push(i)
  if (centerIndex + 1 < CITY_IMAGE_SOURCES.length) order.push(centerIndex + 1)
  for (let i = centerIndex + 2; i < CITY_IMAGE_SOURCES.length; i += 1) order.push(i)
  return order
}

function queueCityImagePreloadsAround(centerIndex) {
  if (!Number.isInteger(centerIndex) || CITY_IMAGE_SOURCES.length === 0) return
  if (activeCityImagePreloadCenter === centerIndex) return

  activeCityImagePreloadCenter = centerIndex
  cityImagePreloadQueue.length = 0
  getCityImagePreloadOrder(centerIndex).forEach(index => {
    const source = getCityImageSource(index)
    if (source && !isCityImageLoaded(source)) cityImagePreloadQueue.push(source)
  })
  runCityImagePreloadQueue()
}

function scheduleCityImagePreloadStep(callback) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: 1500 })
  } else {
    setTimeout(callback, 120)
  }
}

function runCityImagePreloadQueue() {
  if (cityImagePreloadQueueRunning) return
  cityImagePreloadQueueRunning = true

  const loadNext = () => {
    const source = cityImagePreloadQueue.shift()
    if (!source) {
      cityImagePreloadQueueRunning = false
      return
    }

    const preload = preloadCityImage(source, { fetchPriority: 'low' })
    if (!preload) {
      scheduleCityImagePreloadStep(loadNext)
      return
    }
    preload.promise.then(() => scheduleCityImagePreloadStep(loadNext))
  }

  scheduleCityImagePreloadStep(loadNext)
}

function updateCityMilestoneImage(score, options = {}) {
  const image = document.getElementById('cityMilestoneImage')
  if (!image || CITY_IMAGE_SOURCES.length === 0) return

  const levelIndex = CITY_LEVELS.indexOf(getCityLevel(score))
  const imageIndex = Math.min(Math.max(levelIndex, 0), CITY_IMAGE_SOURCES.length - 1)
  const preloadCenterIndex = Number.isInteger(options.preloadCenterIndex)
    ? clampNumber(options.preloadCenterIndex, 0, CITY_IMAGE_SOURCES.length - 1)
    : imageIndex
  const nextSource = getCityImageSource(imageIndex)
  const nextKey = getCityImageCacheKey(nextSource)
  const nextAlt = `Study city milestone: ${getCityStage(score).replace(/[^\p{L}\p{N}\s-]/gu, '').trim()}`

  image.alt = nextAlt
  if (image.dataset.citySourceKey === nextKey) {
    queueCityImagePreloadsAround(preloadCenterIndex)
    return
  }
  if (image.getAttribute('src') === nextSource.primary) {
    image.dataset.citySourceKey = nextKey
    image.dataset.citySrc = nextSource.primary
    image.classList.remove('loading')
    queueCityImagePreloadsAround(preloadCenterIndex)
    return
  }

  const shouldAnimateTransition = image.dataset.initialCityTransitionStarted !== 'true'
  image.dataset.initialCityTransitionStarted = 'true'
  image.dataset.cityTargetKey = nextKey
  image.classList.toggle('loading', shouldAnimateTransition)
  if ('fetchPriority' in image) image.fetchPriority = 'high'
  const applyImage = result => {
    if (image.dataset.cityTargetKey !== nextKey) return
    const loadedSrc = result?.src || result?.loadedSrc || nextSource.fallback || nextSource.primary
    image.dataset.citySourceKey = nextKey
    image.dataset.citySrc = loadedSrc
    image.src = loadedSrc
    if (!shouldAnimateTransition) {
      image.classList.remove('loading')
      return
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (image.dataset.citySourceKey === nextKey && image.dataset.cityTargetKey === nextKey) {
          image.classList.remove('loading')
        }
      })
    })
  }

  const preload = preloadCityImage(nextSource, { fetchPriority: 'high' })
  if (preload?.loaded && preload.loadedSrc) {
    applyImage(preload)
    queueCityImagePreloadsAround(preloadCenterIndex)
  } else {
    preload?.promise.then(result => {
      if (result.loaded) {
        applyImage(result)
        if (image.dataset.cityTargetKey === nextKey) queueCityImagePreloadsAround(preloadCenterIndex)
      }
    })
  }
}

function renderFeed(s) {
  renderChannelFilterOptions(s)

  const statusFilter = selectedStatusFilter
  const grid   = document.getElementById('videoGrid')
  const watchedSection = document.getElementById('watchedSection')
  const watchedGrid = document.getElementById('watchedGrid')
  const watchedCount = document.getElementById('watchedCount')
  const watchedToggle = document.getElementById('watchedSectionToggle')
  if (!grid || !watchedSection || !watchedGrid || !watchedCount) return
  grid.classList.add('channel-view')

  const allVideos = Object.values(s.videos)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  const channelFilters = getSelectedChannelFilters(s)
  const removedChannelIds = new Set(s.config?.removedChannelIds || [])
  const includeShorts = normalizeIncludeShorts(s.config.includeShorts)
  renderStatusFilterOptions(allVideos, channelFilters, includeShorts, removedChannelIds)

  const forcedSearchCandidate = forcedSearchVideoId && s.videos?.[forcedSearchVideoId]
    ? s.videos[forcedSearchVideoId]
    : null
  const forcedSearchVideo = forcedSearchCandidate && !isHiddenShortVideo(forcedSearchCandidate, includeShorts)
    ? forcedSearchCandidate
    : null

  const visibleActiveVideos = getVisibleActiveVideos(allVideos, includeShorts, {
    limitPerChannel: false
  })
    .filter(v => matchesActiveChannelFilter(v, channelFilters, removedChannelIds))
  let activeVideos = visibleActiveVideos
    .filter(v => ['all', 'watch-later', 'unwatched', 'partial'].includes(statusFilter) && (statusFilter === 'all' || getVideoStatus(v) === statusFilter))

  let watchedVideos = allVideos
    .filter(v => getVideoStatus(v) === 'watched')
    .filter(v => !isHiddenFromVideoGrid(v))
    .filter(v => !isHiddenShortVideo(v, includeShorts))
    .filter(v => matchesWatchedChannelFilter(v, channelFilters, removedChannelIds))
    .sort((a, b) => new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0))

  if (forcedSearchVideo) {
    if (getVideoStatus(forcedSearchVideo) === 'watched') {
      watchedVideos = includeForcedSearchVideo(watchedVideos, forcedSearchVideo)
    } else {
      activeVideos = includeForcedSearchVideo(activeVideos, forcedSearchVideo)
    }
  }

  renderNextStudy(visibleActiveVideos)
  const cardOptions = {
    currentDateKey: getCurrentAppDateKey(s),
    focusedVideoId: pendingAddedChannelReveal?.videoId || forcedSearchVideoId,
    arrivingChannelId: pendingAddedChannelReveal?.channelId || '',
    removedChannelIds
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
    grid.innerHTML = renderChannelVideoGroups(
      activeVideos,
      cardOptions,
      s.config?.channelShelfOrder,
      s.config?.channels
    )
  }
  requestAnimationFrame(() => {
    document.querySelectorAll('.channel-shelf-track').forEach(syncVideoChannelShelfControls)
  })

  watchedCount.textContent = watchedVideos.length
  watchedSection.classList.toggle('hidden', !watchedVideos.length)
  const watchedCollapsed = isWatchedSectionCollapsed === null
    ? watchedVideos.length > 6
    : isWatchedSectionCollapsed
  watchedSection.classList.toggle('collapsed', watchedCollapsed)
  if (watchedToggle) {
    watchedToggle.setAttribute('aria-expanded', String(!watchedCollapsed))
    watchedToggle.setAttribute('aria-label', t(watchedCollapsed ? 'videos.watched.show' : 'videos.watched.hide'))
  }
  watchedGrid.innerHTML = watchedVideos.map(v => renderCard(v, true, cardOptions)).join('')
  queueActiveVideoWatchReminderRender(s)
}

function toggleWatchedSection() {
  const watchedSection = document.getElementById('watchedSection')
  const watchedToggle = document.getElementById('watchedSectionToggle')
  if (!watchedSection || !watchedToggle) return
  isWatchedSectionCollapsed = !watchedSection.classList.contains('collapsed')
  watchedSection.classList.toggle('collapsed', isWatchedSectionCollapsed)
  watchedToggle.setAttribute('aria-expanded', String(!isWatchedSectionCollapsed))
  watchedToggle.setAttribute('aria-label', t(isWatchedSectionCollapsed ? 'videos.watched.show' : 'videos.watched.hide'))
}

function getVideoDisplayChannelKey(video) {
  return video?.channelId || video?.channelTitle || `video:${video?.id || 'unknown'}`
}

function getVideoPublishedTimestamp(video) {
  const timestamp = Date.parse(video?.publishedAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareActiveVideos(a, b) {
  return getVideoPublishedTimestamp(b) - getVideoPublishedTimestamp(a)
}

function compareChannelTimelineVideos(a, b) {
  const statusPriority = {
    partial: 0,
    'watch-later': 1
  }
  const priorityDifference = (statusPriority[getVideoStatus(a)] ?? 2) - (statusPriority[getVideoStatus(b)] ?? 2)
  return priorityDifference || compareActiveVideos(a, b)
}

function getVideoUploadRibbon(video, currentDateKey = getCurrentAppDateKey()) {
  const publishedAt = new Date(video?.publishedAt || '')
  if (Number.isNaN(publishedAt.getTime())) return null
  return toDateKey(publishedAt) === currentDateKey ? t('videos.card.new') : null
}

function normalizeChannelShelfOrder(order) {
  if (!Array.isArray(order)) return []
  return Array.from(new Set(
    order
      .map(key => String(key || '').trim())
      .filter(Boolean)
  ))
}

function groupActiveVideosByChannel(videos, channelOrder = [], configuredChannels = []) {
  const groups = new Map()
  const configuredChannelsById = new Map(
    configuredChannels
      .filter(channel => channel?.id)
      .map(channel => [channel.id, channel])
  )
  videos.forEach(video => {
    const key = getVideoDisplayChannelKey(video)
    const configuredChannel = configuredChannelsById.get(key)
    const group = groups.get(key) || {
      key,
      title: video.channelTitle || t('videos.search.youtube'),
      imageUrl: video.channelImageUrl || configuredChannel?.imageUrl || '',
      catalogId: configuredChannel?.catalogId || '',
      videos: []
    }
    if (!group.imageUrl && video.channelImageUrl) group.imageUrl = video.channelImageUrl
    group.videos.push(video)
    groups.set(key, group)
  })
  const orderedChannelIndexes = new Map(
    normalizeChannelShelfOrder(channelOrder).map((key, index) => [key, index])
  )
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      videos: group.videos.sort(compareChannelTimelineVideos)
    }))
    .sort((a, b) => {
      const aIndex = orderedChannelIndexes.get(a.key)
      const bIndex = orderedChannelIndexes.get(b.key)
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
      if (aIndex !== undefined) return -1
      if (bIndex !== undefined) return 1
      const latestB = Math.max(...b.videos.map(getVideoPublishedTimestamp))
      const latestA = Math.max(...a.videos.map(getVideoPublishedTimestamp))
      return latestB - latestA
    })
}

function renderChannelVideoGroups(videos, cardOptions = {}, channelOrder = [], configuredChannels = []) {
  return groupActiveVideosByChannel(
    videos,
    channelOrder,
    configuredChannels
  ).map((group, index) => {
    const countLabel = group.videos.length === 1
      ? t('videos.channel.oneVideo')
      : t('videos.channel.videoCount', { count: group.videos.length })
    const trackId = `channelShelfTrack${index}`
    const isArrivingChannel = group.key === cardOptions.arrivingChannelId
    const isRemovedChannel = cardOptions.removedChannelIds?.has(group.key)
    return `
      <section class="channel-video-group channel-shelf ${isArrivingChannel ? 'channel-refresh-arriving' : ''}"
        data-channel-key="${escHtml(group.key)}"
        draggable="true"
        ondragstart="startChannelShelfDrag(event, this)"
        ondragend="finishChannelShelfDrag()"
        ondragover="moveChannelShelfDrag(event, this)"
        ondragleave="leaveChannelShelfDrag(event, this)"
        ondrop="dropChannelShelf(event, this)">
        <header class="channel-shelf-header"
          aria-label="${escHtml(t('videos.channel.dragLabel', { channel: group.title }))}"
          title="${escHtml(t('videos.channel.dragLabel', { channel: group.title }))}">
          <div class="channel-shelf-identity"
            onpointerdown="startTouchChannelShelfDrag(event, this)">
            ${renderChannelShelfAvatar(group)}
            <span class="channel-shelf-heading">
              <span class="channel-shelf-title-row">
                <strong>${escHtml(group.title)}</strong>
                ${isRemovedChannel ? '' : `<button type="button"
                  class="channel-shelf-remove"
                  data-channel-id="${escHtml(group.key)}"
                  onclick="removeChannelFromFilter(event, this.dataset.channelId)"
                  title="${escHtml(t('settings.remove'))}"
                  aria-label="${escHtml(t('settings.remove'))}">
                  <svg class="channel-shelf-remove-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8"></path>
                  </svg>
                </button>`}
              </span>
              <span>${escHtml(countLabel)}</span>
            </span>
          </div>
          <div class="channel-shelf-controls">
            <button type="button"
              class="channel-shelf-scroll channel-shelf-scroll-prev"
              data-shelf-direction="-1"
              onclick="scrollVideoChannelShelf(this, -1)"
              aria-controls="${trackId}"
              aria-label="${escHtml(t('videos.channel.previousLabel', { channel: group.title }))}">
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button"
              class="channel-shelf-scroll channel-shelf-scroll-next"
              data-shelf-direction="1"
              onclick="scrollVideoChannelShelf(this, 1)"
              aria-controls="${trackId}"
              aria-label="${escHtml(t('videos.channel.nextLabel', { channel: group.title }))}">
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </header>
        <div class="channel-shelf-track"
          id="${trackId}"
          tabindex="0"
          aria-label="${escHtml(t('videos.channel.shelfLabel', { channel: group.title }))}"
          onscroll="syncVideoChannelShelfControls(this)">
          ${group.videos.map((video, videoIndex) => `
            <div class="channel-shelf-slot ${video.id === cardOptions.focusedVideoId ? 'channel-refresh-focus' : ''}" style="--channel-refresh-delay: ${Math.min(videoIndex, 8) * 45}ms">
              ${renderCard(video, false, {
                ...cardOptions,
                shelf: true
              })}
            </div>
          `).join('')}
        </div>
      </section>
    `
  }).join('')
}

function renderChannelShelfAvatar(group) {
  const title = String(group?.title || t('videos.search.youtube')).trim()
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'YT'
  const normalizedTitle = title
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
  const curatedChannel = CURATED_CHANNEL_CATALOG.find(channel => (
    channel.name
      .normalize('NFKD')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '') === normalizedTitle
  ))
  const sandboxChannel = IS_SANDBOX
    ? SANDBOX_CHANNEL_DEFINITIONS.find(channel => channel.id === group?.key)
    : null
  const avatarUrl = group?.imageUrl
    || sandboxChannel?.imageUrl
    || (group?.catalogId ? getCuratedChannelAvatarPath(group.catalogId) : '')
    || (curatedChannel ? getCuratedChannelAvatarPath(curatedChannel.id) : '')
  const avatarImage = avatarUrl
    ? `<img src="${escHtml(avatarUrl)}" alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer" onerror="this.hidden=true">`
    : ''
  const channelId = String(group?.key || '').trim()
  const channelUrl = YOUTUBE_CHANNEL_ID_RE.test(channelId)
    ? `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`
    : ''
  const avatarContent = `<span aria-hidden="true">${escHtml(initials)}</span>${avatarImage}`
  if (!channelUrl) {
    return `<span class="channel-shelf-avatar" aria-hidden="true">${avatarContent}</span>`
  }
  return `<a class="channel-shelf-avatar" href="${escHtml(channelUrl)}" target="_blank" rel="noopener noreferrer" draggable="false" aria-label="${escHtml(`${title} — YouTube`)}">${avatarContent}</a>`
}

function syncVideoChannelShelfControls(track) {
  if (!track) return
  if (activeVideoShelfPreview && track.contains(activeVideoShelfPreview)) {
    closeVideoShelfPreview(activeVideoShelfPreview, true)
  }
  const shelf = track.closest('.channel-shelf')
  const atStart = track.scrollLeft <= 2
  const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2
  const previousButton = shelf?.querySelector('[data-shelf-direction="-1"]')
  const nextButton = shelf?.querySelector('[data-shelf-direction="1"]')
  if (previousButton) previousButton.disabled = atStart
  if (nextButton) nextButton.disabled = atEnd
}

function scrollVideoChannelShelf(button, direction) {
  const shelf = button?.closest?.('.channel-shelf')
  const track = shelf?.querySelector('.channel-shelf-track')
  if (!track) return
  const firstSlot = track.querySelector('.channel-shelf-slot')
  const slotWidth = firstSlot?.getBoundingClientRect().width || 0
  const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0
  const cardPitch = slotWidth + gap
  const currentCardIndex = cardPitch > 0 ? Math.round(track.scrollLeft / cardPitch) : 0
  const targetCardIndex = Math.max(0, currentCardIndex + (direction < 0 ? -4 : 4))
  const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth)
  const targetLeft = cardPitch > 0
    ? Math.min(targetCardIndex * cardPitch, maxScrollLeft)
    : clampNumber(track.scrollLeft + ((direction < 0 ? -1 : 1) * track.clientWidth), 0, maxScrollLeft)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  track.scrollTo({
    left: targetLeft,
    behavior: reduceMotion ? 'auto' : 'smooth'
  })
}

let activeChannelShelfDrag = null
let activeChannelShelfDragPreview = null
let activeChannelShelfPointerId = null
let activeChannelShelfPointerSource = null
let activeChannelShelfDropTarget = null
let activeChannelShelfDropPosition = null
let pendingTouchChannelShelfDrag = null
let touchChannelShelfDragStartX = 0
let touchChannelShelfDragStartY = 0

function canReorderChannelShelves() {
  return window.matchMedia('(min-width: 641px) and (hover: hover) and (pointer: fine)').matches
}

function clearChannelShelfDropIndicators() {
  document.querySelectorAll('.channel-shelf.drag-over-before, .channel-shelf.drag-over-after').forEach(shelf => {
    shelf.classList.remove('drag-over-before', 'drag-over-after')
  })
}

function canUseTouchChannelShelfDrag(event) {
  return event?.pointerType !== 'mouse'
}

function startTouchChannelShelfDrag(event, dragTarget) {
  const shelf = dragTarget?.closest?.('.channel-shelf')
  if (!event || !shelf || !canUseTouchChannelShelfDrag(event)) return
  if (event.target?.closest?.('button, input, label, select, textarea')) return
  const targetLink = event.target?.closest?.('a')
  if (targetLink && !targetLink.classList.contains('channel-shelf-avatar')) return

  activeChannelShelfPointerId = event.pointerId
  activeChannelShelfPointerSource = dragTarget
  pendingTouchChannelShelfDrag = shelf
  touchChannelShelfDragStartX = event.clientX
  touchChannelShelfDragStartY = event.clientY
  dragTarget.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', moveTouchChannelShelfDrag, { passive: false })
  window.addEventListener('pointerup', finishTouchChannelShelfDrag)
  window.addEventListener('pointercancel', cancelTouchChannelShelfDrag)
}

function moveTouchChannelShelfDrag(event) {
  if (event.pointerId !== activeChannelShelfPointerId) return

  if (!activeChannelShelfDrag && pendingTouchChannelShelfDrag) {
    const distance = Math.hypot(
      event.clientX - touchChannelShelfDragStartX,
      event.clientY - touchChannelShelfDragStartY
    )
    if (distance < 8) return

    closeVideoShelfPreview(activeVideoShelfPreview, true)
    activeChannelShelfDrag = pendingTouchChannelShelfDrag
    pendingTouchChannelShelfDrag = null
    activeChannelShelfDrag.classList.add('is-dragging')
    document.body.classList.add('channel-shelf-dragging')
    createChannelShelfDragPreview(activeChannelShelfDrag)
    suppressChannelShelfIdentityClick(activeChannelShelfPointerSource)
  }
  if (!activeChannelShelfDrag) return

  event.preventDefault()
  positionTouchChannelShelfDragPreview(event)

  const edgeSize = 72
  if (event.clientY < edgeSize) {
    window.scrollBy(0, -12)
  } else if (event.clientY > window.innerHeight - edgeSize) {
    window.scrollBy(0, 12)
  }

  const shelf = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.channel-shelf')
  const dragGrid = activeChannelShelfDrag.closest('.video-grid')
  if (!shelf || shelf === activeChannelShelfDrag || shelf.closest('.video-grid') !== dragGrid) {
    activeChannelShelfDropTarget = null
    activeChannelShelfDropPosition = null
    clearChannelShelfDropIndicators()
    return
  }

  const position = getChannelShelfDropPosition(event, shelf)
  const indicatorClass = position === 'before' ? 'drag-over-before' : 'drag-over-after'
  if (shelf === activeChannelShelfDropTarget && position === activeChannelShelfDropPosition) return
  clearChannelShelfDropIndicators()
  shelf.classList.add(indicatorClass)
  activeChannelShelfDropTarget = shelf
  activeChannelShelfDropPosition = position
}

function finishTouchChannelShelfDrag(event) {
  if (event.pointerId !== activeChannelShelfPointerId) return
  const movedShelf = activeChannelShelfDrag
  if (movedShelf && activeChannelShelfDropTarget && activeChannelShelfDropPosition) {
    placeChannelShelf(movedShelf, activeChannelShelfDropTarget, activeChannelShelfDropPosition)
    saveChannelShelfOrder(movedShelf.closest('.video-grid'))
    movedShelf.classList.add('just-dropped')
    window.setTimeout(() => movedShelf.classList.remove('just-dropped'), 520)
  }
  finishChannelShelfDrag()
}

function cancelTouchChannelShelfDrag(event) {
  if (event.pointerId === activeChannelShelfPointerId) finishChannelShelfDrag()
}

function positionTouchChannelShelfDragPreview(event) {
  if (!activeChannelShelfDragPreview) return
  const previewRect = activeChannelShelfDragPreview.getBoundingClientRect()
  const viewportMargin = 12
  const left = clampNumber(
    event.clientX - 28,
    viewportMargin,
    Math.max(viewportMargin, window.innerWidth - previewRect.width - viewportMargin)
  )
  const top = clampNumber(
    event.clientY - (previewRect.height / 2),
    viewportMargin,
    Math.max(viewportMargin, window.innerHeight - previewRect.height - viewportMargin)
  )
  activeChannelShelfDragPreview.style.left = `${left}px`
  activeChannelShelfDragPreview.style.top = `${top}px`
}

function suppressChannelShelfIdentityClick(target) {
  if (!target) return
  const suppressClick = event => {
    event.preventDefault()
    event.stopPropagation()
  }
  target.addEventListener('click', suppressClick, { capture: true, once: true })
  window.setTimeout(() => target.removeEventListener('click', suppressClick, true), 500)
}

function createChannelShelfDragPreview(shelf) {
  activeChannelShelfDragPreview?.remove()
  const header = shelf.querySelector('.channel-shelf-header')?.cloneNode(true)
  if (!header) return null
  header.removeAttribute('draggable')
  header.removeAttribute('ondragstart')
  header.removeAttribute('ondragend')
  header.removeAttribute('title')

  const preview = document.createElement('div')
  preview.className = 'channel-shelf-drag-preview'
  const viewportMaxWidth = Math.max(240, window.innerWidth - 24)
  preview.style.width = `${Math.min(Math.max(shelf.getBoundingClientRect().width * 0.42, 280), 420, viewportMaxWidth)}px`
  preview.append(header)
  document.body.append(preview)
  activeChannelShelfDragPreview = preview
  return preview
}

function startChannelShelfDrag(event, dragTarget) {
  const shelf = dragTarget?.closest?.('.channel-shelf')
  if (!event || !shelf || !canReorderChannelShelves()) {
    event?.preventDefault()
    return
  }
  if (event.target?.closest?.('.channel-shelf-card, button, a, input, label, select, textarea')) {
    event.preventDefault()
    return
  }

  closeVideoShelfPreview(activeVideoShelfPreview, true)
  activeChannelShelfDrag = shelf
  shelf.classList.add('is-dragging')
  document.body.classList.add('channel-shelf-dragging')
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', shelf.dataset.channelKey || '')
  const dragPreview = createChannelShelfDragPreview(shelf)
  if (dragPreview) {
    event.dataTransfer.setDragImage(dragPreview, 28, dragPreview.offsetHeight / 2)
  }
}

function getChannelShelfDropPosition(event, shelf) {
  const rect = shelf.getBoundingClientRect()
  return event.clientY < rect.top + (rect.height / 2) ? 'before' : 'after'
}

function moveChannelShelfDrag(event, shelf) {
  if (!activeChannelShelfDrag || !shelf || shelf === activeChannelShelfDrag) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const position = getChannelShelfDropPosition(event, shelf)
  const indicatorClass = position === 'before' ? 'drag-over-before' : 'drag-over-after'
  if (shelf.classList.contains(indicatorClass)) return
  clearChannelShelfDropIndicators()
  shelf.classList.add(indicatorClass)
}

function leaveChannelShelfDrag(event, shelf) {
  if (!shelf || shelf.contains(event.relatedTarget)) return
  shelf.classList.remove('drag-over-before', 'drag-over-after')
}

function saveChannelShelfOrder(grid) {
  const visibleOrder = Array.from(grid?.querySelectorAll?.('.channel-shelf') || [])
    .map(shelf => shelf.dataset.channelKey)
    .filter(Boolean)
  if (!visibleOrder.length) return

  const state = loadState()
  if (!state?.config) return
  const visibleKeys = new Set(visibleOrder)
  const mergedOrder = normalizeChannelShelfOrder(state.config.channelShelfOrder)
  visibleOrder.forEach(key => {
    if (!mergedOrder.includes(key)) mergedOrder.push(key)
  })
  let visibleIndex = 0
  state.config.channelShelfOrder = mergedOrder.map(key => (
    visibleKeys.has(key) ? visibleOrder[visibleIndex++] : key
  ))
  saveState(state)
}

function placeChannelShelf(movedShelf, targetShelf, position) {
  if (position === 'before') {
    targetShelf.before(movedShelf)
  } else {
    targetShelf.after(movedShelf)
  }
}

function dropChannelShelf(event, shelf) {
  if (!activeChannelShelfDrag || !shelf || shelf === activeChannelShelfDrag) return
  event.preventDefault()
  const grid = shelf.closest('.video-grid')
  const movedShelf = activeChannelShelfDrag
  const position = getChannelShelfDropPosition(event, shelf)
  placeChannelShelf(movedShelf, shelf, position)
  saveChannelShelfOrder(grid)
  finishChannelShelfDrag()
  movedShelf.classList.add('just-dropped')
  window.setTimeout(() => movedShelf.classList.remove('just-dropped'), 520)
}

function finishChannelShelfDrag() {
  if (
    activeChannelShelfPointerId !== null
    && activeChannelShelfPointerSource?.hasPointerCapture?.(activeChannelShelfPointerId)
  ) {
    activeChannelShelfPointerSource?.releasePointerCapture?.(activeChannelShelfPointerId)
  }
  window.removeEventListener('pointermove', moveTouchChannelShelfDrag)
  window.removeEventListener('pointerup', finishTouchChannelShelfDrag)
  window.removeEventListener('pointercancel', cancelTouchChannelShelfDrag)
  activeChannelShelfDrag?.classList.remove('is-dragging')
  activeChannelShelfDrag = null
  activeChannelShelfPointerId = null
  activeChannelShelfPointerSource = null
  activeChannelShelfDropTarget = null
  activeChannelShelfDropPosition = null
  pendingTouchChannelShelfDrag = null
  touchChannelShelfDragStartX = 0
  touchChannelShelfDragStartY = 0
  activeChannelShelfDragPreview?.remove()
  activeChannelShelfDragPreview = null
  clearChannelShelfDropIndicators()
  document.body.classList.remove('channel-shelf-dragging')
}

let activeVideoShelfPreview = null
let videoShelfPreviewCleanupTimer = null
let videoShelfPreviewAnchorTimer = null

function usesTapVideoShelfPreview() {
  return window.matchMedia('(min-width: 641px) and (hover: none)').matches
}

function canUseVideoShelfPreview() {
  return !document.body.classList.contains('walkthrough-active')
    && (
      window.matchMedia('(min-width: 641px) and (hover: hover) and (pointer: fine)').matches
      || usesTapVideoShelfPreview()
    )
}

function isVideoShelfCardFullyVisible(card) {
  const slot = card?.closest?.('.channel-shelf-slot')
  const track = card?.closest?.('.channel-shelf-track')
  if (!slot || !track) return false

  const slotRect = slot.getBoundingClientRect()
  const trackRect = track.getBoundingClientRect()
  const edgeTolerance = 1
  return slotRect.left >= trackRect.left - edgeTolerance
    && slotRect.right <= trackRect.right + edgeTolerance
}

function positionVideoShelfPreview(card) {
  const slot = card?.closest?.('.channel-shelf-slot')
  if (!slot) return false

  const rect = slot.getBoundingClientRect()
  const viewportMargin = 12
  const maxPreviewSize = Math.max(
    rect.width,
    Math.min(
      315,
      window.innerWidth - (viewportMargin * 2),
      window.innerHeight - (viewportMargin * 2)
    )
  )
  const previewSize = Math.min(Math.max(rect.width * 1.25, 295), maxPreviewSize)
  const previewHeight = previewSize * 0.9
  const sourceLeft = rect.left - ((previewSize - rect.width) / 2)
  const sourceTop = rect.top - ((previewHeight - rect.height) / 2)
  const anchorToSource = card.classList.contains('watch-reminder-target')
  const targetLeft = anchorToSource
    ? sourceLeft
    : clampNumber(
      sourceLeft,
      viewportMargin,
      Math.max(viewportMargin, window.innerWidth - previewSize - viewportMargin)
    )
  const targetTop = anchorToSource
    ? sourceTop
    : clampNumber(
      sourceTop,
      viewportMargin,
      Math.max(viewportMargin, window.innerHeight - previewHeight - viewportMargin)
    )

  card.style.setProperty('--shelf-preview-origin-left', `${rect.left}px`)
  card.style.setProperty('--shelf-preview-origin-top', `${rect.top}px`)
  card.style.setProperty('--shelf-preview-origin-width', `${rect.width}px`)
  card.style.setProperty('--shelf-preview-origin-height', `${rect.height}px`)
  card.style.setProperty('--shelf-preview-left', `${targetLeft}px`)
  card.style.setProperty('--shelf-preview-top', `${targetTop}px`)
  card.style.setProperty('--shelf-preview-size', `${previewSize}px`)
  card.style.setProperty('--shelf-preview-height', `${previewHeight}px`)
  return true
}

function openVideoShelfPreview(card, force = false) {
  if (
    !card
    || !canUseVideoShelfPreview()
    || (activeVideoWatchReminderId && !force)
    || card.classList.contains('is-floating-preview')
    || (card.classList.contains('watch-reminder-target') && !force)
  ) return
  if (activeChannelShelfDrag) return
  if (!force && !isVideoShelfCardFullyVisible(card)) return
  if (activeVideoShelfPreview && activeVideoShelfPreview !== card) {
    closeVideoShelfPreview(activeVideoShelfPreview, true)
  }

  window.clearTimeout(videoShelfPreviewCleanupTimer)
  window.clearTimeout(videoShelfPreviewAnchorTimer)
  if (!positionVideoShelfPreview(card)) return
  card.classList.add('is-floating-preview')
  activeVideoShelfPreview = card
  card.getBoundingClientRect()
  requestAnimationFrame(() => {
    if (!card.classList.contains('is-floating-preview')) return
    if (!force && !card.matches(':hover') && !card.matches(':focus-within')) return
    card.classList.add('is-preview-armed')
    requestAnimationFrame(() => {
      if (!card.classList.contains('is-preview-armed')) return
      if (!force && !card.matches(':hover') && !card.matches(':focus-within')) return
      card.classList.add('is-previewing')
      if (card.classList.contains('watch-reminder-target')) {
        videoShelfPreviewAnchorTimer = window.setTimeout(() => {
          if (card.classList.contains('is-previewing')) card.classList.add('is-source-anchored')
        }, 220)
      }
    })
  })
}

function closeVideoShelfPreview(card, force = false) {
  if (!card?.classList.contains('is-floating-preview')) return
  if (!force && activeVideoWatchReminderId && card.dataset.videoId === activeVideoWatchReminderId) return
  if (!force && (card.matches(':hover') || card.matches(':focus-within'))) return

  const cleanup = () => {
    if (card.classList.contains('is-previewing')) return
    card.classList.remove('is-preview-armed', 'is-source-anchored')
    card.classList.remove('is-floating-preview')
    card.style.removeProperty('--shelf-preview-origin-left')
    card.style.removeProperty('--shelf-preview-origin-top')
    card.style.removeProperty('--shelf-preview-origin-width')
    card.style.removeProperty('--shelf-preview-origin-height')
    card.style.removeProperty('--shelf-preview-left')
    card.style.removeProperty('--shelf-preview-top')
    card.style.removeProperty('--shelf-preview-size')
    card.style.removeProperty('--shelf-preview-height')
    if (activeVideoShelfPreview === card) activeVideoShelfPreview = null
  }
  card.classList.remove('is-previewing')
  window.clearTimeout(videoShelfPreviewCleanupTimer)
  window.clearTimeout(videoShelfPreviewAnchorTimer)
  if (force) {
    cleanup()
    return
  }
  videoShelfPreviewCleanupTimer = window.setTimeout(cleanup, 220)
}

function closeVideoShelfPreviewAfterFocus(card) {
  requestAnimationFrame(() => closeVideoShelfPreview(card))
}

function openVideoShelfPreviewFromFocus(card) {
  if (usesTapVideoShelfPreview()) return
  openVideoShelfPreview(card)
}

function toggleVideoShelfPreviewOnTouch(event, card) {
  if (!usesTapVideoShelfPreview() || !card) return
  if (event?.target?.closest?.('button, input, label, select, textarea')) return
  if (card.classList.contains('is-previewing')) return

  event?.preventDefault()
  event?.stopPropagation()
  openVideoShelfPreview(card, true)
}

function closeVideoShelfPreviewOnOutsideClick(event) {
  if (!usesTapVideoShelfPreview() || !activeVideoShelfPreview) return
  if (activeVideoShelfPreview.contains(event.target)) return
  closeVideoShelfPreview(activeVideoShelfPreview, true)
}

function closeVideoShelfPreviewOnViewportChange() {
  const isActiveReminderPreview = Boolean(
    activeVideoWatchReminderId
    && activeVideoShelfPreview?.dataset.videoId === activeVideoWatchReminderId
  )
  if (isActiveReminderPreview) {
    positionVideoShelfPreview(activeVideoShelfPreview)
    return
  }
  closeVideoShelfPreview(activeVideoShelfPreview, true)
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
  btn.textContent = label
  btn.title = canUse ? `${titleVerb} (${count} available)` : emptyTitle
  if (!canUse) {
    wrap?.classList.remove('open')
    tooltip?.classList.add('hidden')
  }
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
    <div class="mobile-popover-header">
      <strong>${escHtml(queueTitle)}</strong>
      <button class="mobile-popover-close" type="button" onclick="closeHistoryActionPopovers(null, true)" title="${escHtml(t('settings.close'))}" aria-label="${escHtml(t('settings.close'))}">×</button>
    </div>
    <div class="undo-tooltip-title">${escHtml(queueTitle)}</div>
    <div class="undo-tooltip-scroll" onmousemove="handleHistoryActionScrollHover(event)" onmouseleave="stopHistoryActionAutoScroll()">
      ${indexedActions.map(entry => renderHistoryActionTooltipItem(entry, s, direction)).join('')}
    </div>
  `
}

function renderHistoryActionTooltipItem(entry, s, direction) {
  const { action, index } = entry
  if (action.type === 'channel-remove') {
    const channelName = action.channelName || action.before?.channel?.name || action.channelId || t('videos.channels.one')
    const actionText = direction === 'redo' ? t('undo.removeChannelAgain') : t('undo.restoreChannel')
    return `
      <button type="button" class="undo-tooltip-item undo-tooltip-action-btn" onclick="applyHistoryAction('${direction}', ${index})">
        <span class="undo-tooltip-video">${escHtml(channelName)}</span>
        <span class="undo-tooltip-action">${escHtml(actionText)}</span>
        <span class="undo-tooltip-time">${escHtml(formatHistoryActionTimestamp(action))}</span>
      </button>
    `
  }

  const video = s.videos?.[action.videoId]
  const title = video?.title || action.before?.video?.title || action.after?.video?.title || t('videos.search.untitled')
  const timestamp = formatHistoryActionTimestamp(action)
  if (action.type === 'manual-video-add') {
    const actionText = direction === 'redo'
      ? action.channelWasAdded
        ? t('undo.restoreAddedVideoAndChannel')
        : t('undo.restoreAddedVideo')
      : action.channelWasAdded
        ? t('undo.removeAddedVideoAndChannel')
        : t('undo.removeAddedVideo')
    return `
      <button type="button" class="undo-tooltip-item undo-tooltip-action-btn" onclick="applyHistoryAction('${direction}', ${index})">
        <span class="undo-tooltip-video">${escHtml(title)}</span>
        <span class="undo-tooltip-action">${escHtml(actionText)}</span>
        <span class="undo-tooltip-time">${escHtml(timestamp)}</span>
      </button>
    `
  }
  if (action.type === 'video-grid-remove') {
    const actionText = direction === 'redo' ? t('undo.removeVideoAgain') : t('undo.restoreVideo')
    return `
      <button type="button" class="undo-tooltip-item undo-tooltip-action-btn" onclick="applyHistoryAction('${direction}', ${index})">
        <span class="undo-tooltip-video">${escHtml(title)}</span>
        <span class="undo-tooltip-action">${escHtml(actionText)}</span>
        <span class="undo-tooltip-time">${escHtml(timestamp)}</span>
      </button>
    `
  }
  if (action.type === 'video-resume-time') {
    const fromTime = formatResumeTimestamp(
      direction === 'redo' ? action.before?.resumeAtSeconds : action.after?.resumeAtSeconds
    ) || '00:00:00'
    const toTime = formatResumeTimestamp(
      direction === 'redo' ? action.after?.resumeAtSeconds : action.before?.resumeAtSeconds
    ) || '00:00:00'
    const actionText = direction === 'redo'
      ? t('undo.continueAtChange', { from: fromTime, to: toTime })
      : t('undo.continueAtBack', { from: fromTime, to: toTime })
    return `
      <button type="button" class="undo-tooltip-item undo-tooltip-action-btn" onclick="applyHistoryAction('${direction}', ${index})">
        <span class="undo-tooltip-video">${escHtml(title)}</span>
        <span class="undo-tooltip-action">${escHtml(actionText)}</span>
        <span class="undo-tooltip-time">${escHtml(timestamp)}</span>
      </button>
    `
  }
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
  if (!isMobileLayout()) {
    stopHistoryActionAutoScroll()
    return
  }

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
  const popover = wrap?.querySelector('.undo-tooltip')
  if (!wrap || !popover) return
  const shouldOpen = popover.classList.contains('hidden')
  closeStatusFilterMenu()
  closeChannelFilterMenu()
  closeManualVideoPopover()
  closeHistoryVideoPopovers()
  closeHistoryPointsPopovers()
  closeHistoryPeriodPopovers()
  closeHistoryActionPopovers(wrap)
  wrap.classList.toggle('open', shouldOpen)
  popover.classList.toggle('hidden', !shouldOpen)
  btn.setAttribute('aria-expanded', String(shouldOpen))
  if (shouldOpen) {
    positionFilterMenuWithinViewport(popover)
    if (isMobileLayout()) window.setTimeout(() => popover.querySelector('.undo-tooltip-action-btn')?.focus(), 0)
  }
}

function closeHistoryActionPopovers(exceptWrap = null, restoreFocus = false) {
  stopHistoryActionAutoScroll()
  let focusButton = null
  document.querySelectorAll('.undo-action-wrap.open').forEach(wrap => {
    if (wrap === exceptWrap) return
    wrap.classList.remove('open')
    const btn = wrap.querySelector('.undo-btn')
    const popover = wrap.querySelector('.undo-tooltip')
    btn?.setAttribute('aria-expanded', 'false')
    popover?.classList.add('hidden')
    if (popover) {
      popover.style.left = ''
      popover.style.right = ''
    }
    if (!focusButton) focusButton = btn
  })
  if (restoreFocus && isMobileLayout()) window.setTimeout(() => focusButton?.focus(), 0)
}

function closeHistoryActionPopoversOnOutsideClick(event) {
  if (event.target.closest('.undo-action-wrap')) return
  closeHistoryActionPopovers()
}

function closeHistoryActionPopoversOnEscape(event) {
  if (event.key !== 'Escape') return
  if (!document.querySelector('.undo-action-wrap.open')) return
  closeHistoryActionPopovers(null, true)
}

function toggleLocaleMenu(event) {
  event.stopPropagation()
  const btn = document.getElementById('settingsLocaleBtn')
  const menu = document.getElementById('settingsLocaleMenu')
  if (!btn || !menu) return
  closeStatusFilterMenu()
  closeChannelFilterMenu()
  closeManualVideoPopover()
  closeHistoryPointsPopovers()
  closeHistoryActionPopovers()
  const isOpen = menu.classList.toggle('hidden') === false
  btn.setAttribute('aria-expanded', String(isOpen))
  if (isOpen) positionFilterMenuWithinViewport(menu)
}

function closeLocaleMenu() {
  const btn = document.getElementById('settingsLocaleBtn')
  const menu = document.getElementById('settingsLocaleMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
  menu.style.right = ''
  btn.setAttribute('aria-expanded', 'false')
}

function closeLocaleMenuOnOutsideClick(event) {
  if (event.target.closest('.settings-locale-picker')) return
  closeLocaleMenu()
}

function closeLocaleMenuOnEscape(event) {
  if (event.key !== 'Escape') return
  closeLocaleMenu()
}

function renderStatusFilterOptions(allVideos = [], channelFilters = null, includeShorts = true, removedChannelIds = new Set()) {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return

  const counts = getStatusFilterCounts(allVideos, channelFilters, includeShorts, removedChannelIds)
  document.querySelectorAll('[data-status-tab]').forEach(tab => {
    const status = tab.dataset.statusTab
    const isActive = selectedStatusFilter === status
    tab.classList.toggle('active', isActive)
    tab.setAttribute('aria-selected', String(isActive))
    tab.setAttribute('tabindex', isActive ? '0' : '-1')
    const count = tab.querySelector('.status-tab-count')
    if (count) count.textContent = String(counts[status] ?? 0)
  })
  btn.textContent = getStatusFilterLabel(selectedStatusFilter)
  menu.innerHTML = `
    <div class="mobile-popover-header">
      <strong>${escHtml(getStatusFilterLabel(selectedStatusFilter))}</strong>
      <button class="mobile-popover-close" type="button" onclick="closeStatusFilterMenu(true)" title="${escHtml(t('settings.close'))}" aria-label="${escHtml(t('settings.close'))}">×</button>
    </div>
  ` + STATUS_FILTERS.map(([value, label]) => `
    <label class="channel-filter-option status-filter-option">
      <input type="radio" name="statusFilter" data-status="${value}" ${selectedStatusFilter === value ? 'checked' : ''} onchange="setStatusFilter(this.dataset.status)">
      <span class="status-filter-label">${escHtml(t(label))}</span>
      <span class="status-filter-count">${counts[value] ?? 0}</span>
    </label>
  `).join('')
  if (!menu.classList.contains('hidden')) positionFilterMenuWithinViewport(menu)
}

function getStatusFilterCounts(allVideos = [], channelFilters = null, includeShorts = true, removedChannelIds = new Set()) {
  const selectedChannels = channelFilters || new Set()
  const matchesSelection = video => !channelFilters
    || matchesActiveChannelFilter(video, selectedChannels, removedChannelIds)
  const activeVideos = getVisibleActiveVideos(allVideos, includeShorts, {
    limitPerChannel: false
  }).filter(matchesSelection)
  const counts = Object.fromEntries(STATUS_FILTERS.map(([value]) => [value, 0]))

  activeVideos.forEach(video => {
    const status = getVideoStatus(video)
    if (status !== 'watched') counts[status] += 1
  })

  counts.all = activeVideos.length

  return counts
}

function getStatusFilterLabel(status) {
  if (status === 'all') return t('videos.status.all')
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

function closeStatusFilterMenu(restoreFocus = false) {
  const btn = document.getElementById('statusFilterBtn')
  const menu = document.getElementById('statusFilterMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
  menu.style.right = ''
  btn.setAttribute('aria-expanded', 'false')
  if (restoreFocus && isMobileLayout()) window.setTimeout(() => btn.focus(), 0)
}

function renderChannelFilterOptions(s) {
  const optionsWrap = document.getElementById('manualVideoChannelOptions')
  if (!optionsWrap) return

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
  const removableChannelIds = new Set([
    ...(s.config.channels || []).map(channel => channel.id),
    ...Object.values(s.videos || {})
      .filter(video => !isHiddenManualVideoChannelEntry(video))
      .map(video => video.channelId || video.channelTitle)
      .filter(Boolean)
  ])
  const allChannelsControl = entries.length
    ? `
      <div class="channel-filter-select-all" onclick="handleChannelFilterSelectAllClick(event)">
        <input type="checkbox"
          id="channelFilterSelectAll"
          ${selectedCount === entries.length ? 'checked' : ''}
          onchange="setAllChannelFilters(this.checked)"
          aria-label="${escHtml(t('videos.channels.all'))}">
        <span>${escHtml(t('videos.channels.all'))}</span>
      </div>
    `
    : ''
  const options = entries.length
    ? entries.map(([id, name]) => {
      const refreshLabel = formatChannelLastRefreshLabel(s, id)
      const refreshTitle = formatChannelLastRefreshTitle(s, id)
      const canRemove = removableChannelIds.has(id)
      return `
      <div class="channel-filter-option" data-channel-id="${escHtml(id)}" onclick="handleChannelFilterOptionClick(event, this.dataset.channelId)">
        <input type="checkbox" data-channel-id="${escHtml(id)}" ${selected.has(id) ? 'checked' : ''} onchange="setChannelFilter(this.dataset.channelId, this.checked)">
        <span class="channel-filter-label">${escHtml(name)}</span>
        <span class="channel-filter-refresh" title="${escHtml(refreshTitle)}">${escHtml(refreshLabel)}</span>
        ${canRemove ? `<button type="button" class="channel-filter-remove" data-channel-id="${escHtml(id)}" onclick="removeChannelFromFilter(event, this.dataset.channelId)" title="${escHtml(t('settings.remove'))}" aria-label="${escHtml(t('settings.remove'))}">×</button>` : ''}
      </div>
    `
    }).join('')
    : `<div class="channel-filter-empty">${escHtml(t('videos.channels.none'))}</div>`
  optionsWrap.innerHTML = `
    <div class="manual-video-channel-title">${escHtml(t('videos.channels.manage'))}</div>
    ${allChannelsControl}
    ${options}
  `
  const selectAllInput = document.getElementById('channelFilterSelectAll')
  if (selectAllInput) {
    selectAllInput.indeterminate = selectedCount > 0 && selectedCount < entries.length
  }
  optionsWrap.dataset.selectedCount = selectedCount
}

function refreshOpenChannelFilterTimestamps() {
  const popover = document.getElementById('manualVideoPopover')
  if (!popover || popover.classList.contains('hidden')) return
  renderChannelFilterOptions(loadState())
}

function startChannelRefreshLabelTicker() {
  clearInterval(startChannelRefreshLabelTicker._timer)
  startChannelRefreshLabelTicker._timer = setInterval(refreshOpenChannelFilterTimestamps, 30_000)
}

function getChannelFilterEntries(s) {
  const channels = new Map()
  const removedChannelIds = new Set(s.config?.removedChannelIds || [])
  s.config.channels.forEach(channel => {
    channels.set(channel.id, channel.name || channel.id)
  })
  Object.values(s.videos).forEach(video => {
    const key = video.channelId || video.channelTitle
    if (isHiddenManualVideoChannelEntry(video)) return
    if (key && removedChannelIds.has(key)) return
    if (key) channels.set(key, video.channelTitle || channels.get(key) || key)
  })
  return Array.from(channels.entries()).sort((a, b) => a[1].localeCompare(b[1]))
}

function isHiddenManualVideoChannelEntry(video) {
  return Boolean(video?.manuallyAdded && video?.source === 'manual' && isHiddenFromVideoGrid(video))
}

function getSelectedChannelFilters(s) {
  const ids = getChannelFilterEntries(s).map(([id]) => id)
  if (!selectedChannelFilters) return new Set(ids)
  return new Set(ids.filter(id => selectedChannelFilters.has(id)))
}

function getChannelFilterLabel(entries, selected, hasConfiguredChannels = true) {
  if (!hasConfiguredChannels) return t('videos.channels.add')
  if (!entries.length) return t('videos.channels.none')
  if (selected.size === entries.length) return t('videos.channels.manage')
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

function setAllChannelFilters(enabled) {
  const s = loadState()
  selectedChannelFilters = enabled
    ? new Set(getChannelFilterEntries(s).map(([id]) => id))
    : new Set()
  renderFeed(s)
}

function handleChannelFilterSelectAllClick(event) {
  if (event?.target?.matches?.('input')) return
  const checkbox = event.currentTarget?.querySelector?.('input[type="checkbox"]')
  if (!checkbox) return
  checkbox.checked = !checkbox.checked
  setAllChannelFilters(checkbox.checked)
}

function handleChannelFilterOptionClick(event, channelId) {
  if (event?.target?.closest?.('.channel-filter-remove')) return
  if (event?.altKey) {
    event.preventDefault()
    event.stopPropagation()
    selectOnlyChannelFilter(channelId)
    return
  }
  if (event?.target?.matches?.('input')) return
  const checkbox = event.currentTarget?.querySelector?.('input[type="checkbox"]')
  if (!checkbox) return
  checkbox.checked = !checkbox.checked
  setChannelFilter(channelId, checkbox.checked)
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

function closeChannelFilterMenu(restoreFocus = false) {
  const btn = document.getElementById('channelFilterBtn')
  const menu = document.getElementById('channelFilterMenu')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
  menu.style.right = ''
  btn.setAttribute('aria-expanded', 'false')
  if (restoreFocus && isMobileLayout()) window.setTimeout(() => btn.focus(), 0)
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

function closeManualVideoPopover(restoreFocus = false) {
  const btn = document.getElementById('manualVideoBtn')
  const menu = document.getElementById('manualVideoPopover')
  if (!btn || !menu) return
  menu.classList.add('hidden')
  menu.style.left = ''
  menu.style.right = ''
  btn.setAttribute('aria-expanded', 'false')
  if (restoreFocus && isMobileLayout()) window.setTimeout(() => btn.focus(), 0)
}

function positionFilterMenuWithinViewport(menu) {
  if (!menu || menu.classList.contains('hidden')) return

  if (isMobileLayout()) {
    menu.style.left = ''
    menu.style.right = ''
    return
  }

  menu.style.left = '0px'
  menu.style.right = 'auto'

  const margin = 12
  const parentRect = menu.parentElement?.getBoundingClientRect()
  const buttonRect = menu.parentElement?.querySelector?.('button')?.getBoundingClientRect()
  const menuWidth = menu.offsetWidth || 320

  if (!parentRect || !buttonRect) return

  const desiredLeft = Math.round(buttonRect.left - parentRect.left)
  const minLeft = Math.round(margin - parentRect.left)
  const maxLeft = Math.round(window.innerWidth - margin - menuWidth - parentRect.left)
  const clampedLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft))

  menu.style.left = `${clampedLeft}px`
}

function closeChannelFilterMenuOnOutsideClick(event) {
  const channelFilter = document.getElementById('channelFilter')
  const statusFilter = document.getElementById('statusFilter')
  if (channelFilter?.contains(event.target) || statusFilter?.contains(event.target)) return
  closeStatusFilterMenu()
  closeChannelFilterMenu()
}

function closeFilterMenusOnEscape(event) {
  if (event.key !== 'Escape') return
  const statusMenu = document.getElementById('statusFilterMenu')
  const channelMenu = document.getElementById('channelFilterMenu')
  if (statusMenu && !statusMenu.classList.contains('hidden')) {
    closeStatusFilterMenu(true)
  } else if (channelMenu && !channelMenu.classList.contains('hidden')) {
    closeChannelFilterMenu(true)
  }
}

function closeManualVideoPopoverOnOutsideClick(event) {
  if (event.target.closest('.manual-video')) return
  closeManualVideoPopover()
}

function closeManualVideoPopoverOnEscape(event) {
  if (event.key !== 'Escape') return
  if (document.getElementById('manualVideoPopover')?.classList.contains('hidden')) return
  closeManualVideoPopover(true)
}

function matchesChannelFilter(video, selectedChannelIds) {
  return selectedChannelIds.has(video.channelId) || selectedChannelIds.has(video.channelTitle)
}

function isSavedActiveVideo(video) {
  return ['partial', 'watch-later'].includes(getVideoStatus(video))
}

function matchesActiveChannelFilter(video, selectedChannelIds, removedChannelIds) {
  return matchesChannelFilter(video, selectedChannelIds)
    || (
      isSavedActiveVideo(video)
      && (
        removedChannelIds.has(video.channelId)
        || removedChannelIds.has(video.channelTitle)
      )
    )
}

function matchesWatchedChannelFilter(video, selectedChannelIds, removedChannelIds) {
  return matchesChannelFilter(video, selectedChannelIds)
    || removedChannelIds.has(video.channelId)
    || removedChannelIds.has(video.channelTitle)
}

function isHiddenShortVideo(video, includeShorts) {
  return !includeShorts && isShortDuration(video?.duration)
}

function getVisibleActiveVideos(videos, includeShorts = true, options = {}) {
  const limitPerChannel = options.limitPerChannel !== false
  const byChannel = new Map()

  const visibleVideos = videos
    .filter(v => getVideoStatus(v) !== 'watched')
    .filter(v => !isHiddenFromVideoGrid(v))
    .filter(v => !isHiddenShortVideo(v, includeShorts))
    .sort(compareActiveVideos)

  if (!limitPerChannel) return visibleVideos

  visibleVideos.forEach(v => {
    const key = getActiveVideoGroupKey(v)
    const channelVideos = byChannel.get(key) || []
    if (channelVideos.length < ACTIVE_VIDEOS_PER_CHANNEL) {
      channelVideos.push(v)
      byChannel.set(key, channelVideos)
    }
  })

  return Array.from(byChannel.values())
    .flat()
    .sort(compareActiveVideos)
}

function getActiveVideoGroupKey(video) {
  if (video?.manuallyAdded && video?.source === 'manual') {
    return `manual:${video.id || video.title || 'unknown'}`
  }
  return video?.channelId || video?.channelTitle || 'unknown'
}

function isHiddenFromVideoGrid(video) {
  return Boolean(video?.hiddenFromGrid)
}

function renderVideoActionIcon(type) {
  const paths = {
    watched: '<path d="M5 12.5l4 4L19 6.5"></path>',
    partial: '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>',
    'watch-later': '<path d="M6 4h12v16l-6-4-6 4V4Z"></path>'
  }
  return `<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[type] || ''}</svg>`
}

function renderCard(v, compact = false, options = {}) {
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
  const watchedText = compact
    ? t('videos.card.unmark')
    : (isWatched ? t('videos.status.watched') : t('videos.card.markWatched'))
  const watchedTextLabel = !compact && !isWatched
    ? `<span class="desktop-english-copy">Watched</span><span class="responsive-default-copy">${escHtml(watchedText)}</span>`
    : escHtml(watchedText)
  const watchedLabel = compact
    ? `<span class="watched-btn-text">${watchedTextLabel}</span>`
    : `${renderVideoActionIcon('watched')}<span class="watched-btn-text">${watchedTextLabel}</span>`
  const watchedAtLabel = compact && v.watchedAt ? formatWatchedAt(v.watchedAt) : ''
  const thumbnailUrl = compact
    ? String(v.thumbnail || '').replace(/\/hqdefault\.jpg(?=\?|$)/, '/mqdefault.jpg')
    : v.thumbnail
  const resumeAtValue = isPartial ? formatResumeTimestamp(v.resumeAtSeconds) : ''
  const uploadRibbon = compact || (options.shelf && isPartial)
    ? null
    : getVideoUploadRibbon(v, options.currentDateKey)
  const removeFromGridButton = !compact && !isWatched
    ? `<button type="button"
        class="video-grid-remove"
        data-video-id="${safeVideoId}"
        onclick="removeVideoFromGrid(event, this.dataset.videoId)"
        title="${escHtml(t('videos.card.removeFromGrid'))}"
        aria-label="${escHtml(t('videos.card.removeFromGrid'))}">×</button>`
    : ''
  const thumbnailContent = `
    <img src="${escHtml(thumbnailUrl)}" alt="" class="thumb" loading="lazy">
    ${uploadRibbon ? `<span class="video-upload-ribbon">${escHtml(uploadRibbon)}</span>` : ''}
    <span class="dur-badge">${formatDuration(v.duration)}</span>
  `
  const thumbnailLink = `<a href="${videoUrl}" target="_blank" rel="noopener" class="thumb-link" data-video-id="${safeVideoId}" aria-label="${escHtml(v.title)}" onclick="markVideoInProgressOnOpen(this.dataset.videoId)">${thumbnailContent}</a>`
  const shelfResumeTimeField = options.shelf && isPartial
    ? `
      <label class="resume-time-field thumbnail-resume-time-field">
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
    `
    : ''
  const shelfPriorityBadge = options.shelf && isPartial
    ? `<div class="channel-shelf-priority-badge partial-priority-badge">${renderVideoActionIcon('partial')}${escHtml(t('videos.card.resume'))}</div>`
    : options.shelf && isWatchLater
    ? `<div class="channel-shelf-priority-badge watch-later-priority-badge">${renderVideoActionIcon('watch-later')}${escHtml(t('videos.card.watchLater'))}</div>`
    : ''
  const shelfPreviewHandlers = options.shelf
    ? 'onclick="toggleVideoShelfPreviewOnTouch(event, this)" onmouseenter="openVideoShelfPreview(this)" onmouseleave="closeVideoShelfPreview(this)" onfocusin="openVideoShelfPreviewFromFocus(this)" onfocusout="closeVideoShelfPreviewAfterFocus(this)"'
    : ''
  return `
    <div class="video-card ${compact ? 'compact-card' : ''} ${options.shelf ? 'channel-shelf-card' : ''} status-${status}" data-video-id="${safeVideoId}" ${shelfPreviewHandlers}>
      ${removeFromGridButton}
      ${thumbnailLink}
      ${shelfResumeTimeField}
      ${shelfPriorityBadge}
      <div class="card-body">
        ${isPartial ? `<div class="card-status partial-status">${renderVideoActionIcon('partial')}${escHtml(t('videos.card.resume'))}</div>` : ''}
        ${isWatchLater ? `<div class="card-status watch-later-status">${renderVideoActionIcon('watch-later')}${escHtml(t('videos.card.watchLater'))}</div>` : ''}
        <div class="card-copy">
          <div class="card-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
          ${watchedAtLabel ? `<div class="card-watched-at">${escHtml(watchedAtLabel)}</div>` : ''}
          ${isPartial && !options.shelf ? `
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
          <button class="action-btn watched-btn ${isWatched ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${watchedNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            aria-label="${escHtml(isWatched ? t('videos.card.unmark') : t('videos.card.markWatchedTitle'))}"
            title="${escHtml(isWatched ? t('videos.card.unmark') : t('videos.card.markWatchedTitle'))}">
            ${watchedLabel}
          </button>
          <button class="action-btn partial-btn ${isPartial ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${partialNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            aria-label="${escHtml(isPartial ? t('videos.card.clear') : t('videos.card.markProgress'))}"
            title="${escHtml(isPartial ? t('videos.card.clear') : t('videos.card.markProgress'))}">${renderVideoActionIcon('partial')}</button>
          <button class="action-btn watch-later-btn ${isWatchLater ? 'active' : ''}"
            data-video-id="${safeVideoId}"
            data-status="${watchLaterNextStatus}"
            onclick="markVideo(this.dataset.videoId, this.dataset.status)"
            aria-label="${escHtml(isWatchLater ? t('videos.card.removeWatchLater') : t('videos.card.watchLater'))}"
            title="${escHtml(isWatchLater ? t('videos.card.removeWatchLater') : t('videos.card.watchLater'))}">${renderVideoActionIcon('watch-later')}</button>
        </div>
      </div>
    </div>
  `
}

function removeVideoFromGrid(event, videoId) {
  event?.preventDefault()
  event?.stopPropagation()

  const s = loadState()
  const video = s?.videos?.[videoId]
  if (!video) {
    showToast(t('toast.videoGone'), 'warn')
    return
  }

  const before = cloneVideoForHistoryAction(video)
  video.hiddenFromGrid = true
  video.hiddenFromGridAt = getCurrentAppTimestamp(s)
  pushUndoAction(s, {
    type: 'video-grid-remove',
    videoId,
    before: { video: before },
    after: { video: cloneVideoForHistoryAction(video) }
  })
  appendActivityLog(s, {
    actor: 'user',
    type: 'video-grid',
    status: 'success',
    title: t('log.videoRemovedFromGrid'),
    detail: `"${formatToastTitle(video.title)}"`,
    meta: { videoId }
  })
  saveState(s)
  renderAll(s)
  showToast(t('toast.videoRemovedFromGrid'), 'success')
}

// ════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast')
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
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
window.addEventListener('scroll', syncHeaderCompactState, { passive: true })
window.addEventListener('scroll', closeVideoShelfPreviewOnViewportChange, { passive: true })
window.addEventListener('resize', closeVideoShelfPreviewOnViewportChange, { passive: true })
window.addEventListener('resize', syncMobileAddButtonWidth, { passive: true })
window.addEventListener('resize', syncIntroTrailerStageScale, { passive: true })
document.addEventListener('visibilitychange', refreshOpenChannelFilterTimestamps)
document.addEventListener('visibilitychange', handleVideoWatchReminderVisibilityChange)
document.addEventListener('click', closeChannelFilterMenuOnOutsideClick)
document.addEventListener('click', closeHistoryVideoPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryPointsPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryPeriodPopoversOnOutsideClick)
document.addEventListener('click', closeHistoryActionPopoversOnOutsideClick)
document.addEventListener('click', closeManualVideoPopoverOnOutsideClick)
document.addEventListener('click', closeVideoSearchPopoverOnOutsideClick)
document.addEventListener('click', closeLocaleMenuOnOutsideClick)
document.addEventListener('click', closeVideoShelfPreviewOnOutsideClick)
document.addEventListener('click', closeIntroLocaleMenuOnOutsideClick)
document.addEventListener('click', closeOnboardingLocaleMenuOnOutsideClick)
document.addEventListener('click', hideHeatmapTooltipOnOutsideClick)
document.addEventListener('click', clearCityWaveformPreviewOnOutsideClick)
document.addEventListener('click', dismissVideoWatchReminderOnOutsideClick)
document.addEventListener('keydown', closeHistoryVideoPopoversOnEscape)
document.addEventListener('keydown', closeHistoryPointsPopoversOnEscape)
document.addEventListener('keydown', closeHistoryPeriodPopoversOnEscape)
document.addEventListener('keydown', closeHistoryActionPopoversOnEscape)
document.addEventListener('keydown', closeFilterMenusOnEscape)
document.addEventListener('keydown', closeManualVideoPopoverOnEscape)
document.addEventListener('keydown', closeVideoSearchPopoverOnEscape)
document.addEventListener('keydown', closeLocaleMenuOnEscape)
document.addEventListener('keydown', handleSettingsKeydown)
document.addEventListener('keydown', handleIntroTrailerKeydown)
if (!IS_SANDBOX) document.addEventListener('visibilitychange', refreshAnkiStatsOnVisible)
