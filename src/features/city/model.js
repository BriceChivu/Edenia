import { clampNumber } from '../../core/numbers.js'

export const CITY_LEVELS = [
  { threshold: 0, labelKey: 'city.level.1', label: '🏠 Lonely house' },
  { threshold: 60, labelKey: 'city.level.2', label: '⛵ Your house got a fresh new look! Plus a boat!' },
  { threshold: 140, labelKey: 'city.level.3', label: '🏝️ Oh look! A tiny island! Cute.' },
  { threshold: 230, labelKey: 'city.level.4', label: 'Kids are gonna have fun now!' },
  { threshold: 320, labelKey: 'city.level.5', label: "Let's add a pool to chill" },
  { threshold: 400, labelKey: 'city.level.6', label: 'Oh! Some friends are coming to say hi...' },
  { threshold: 480, labelKey: 'city.level.7', label: 'You expanded your small island!' },
  { threshold: 570, labelKey: 'city.level.8', label: "That's a nice deckchair and some pretty flowers! 🌸" },
  { threshold: 680, labelKey: 'city.level.9', label: 'You built a cute house in the backyard' },
  { threshold: 800, labelKey: 'city.level.10', label: 'Oh wow! You got a neighbor! 🏠' },
  { threshold: 920, labelKey: 'city.level.11', label: 'The little purple house has a cute garden!' },
  { threshold: 1050, labelKey: 'city.level.12', label: 'Damn! A volcano appeared! I hope it won\'t erupt...' }
]

export const CITY_IMAGE_PATHS = [
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

export const CITY_IMAGE_WEBP_PATHS = [
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

export const CITY_IMAGE_SOURCES = CITY_IMAGE_PATHS.map((fallback, index) => ({
  primary: CITY_IMAGE_WEBP_PATHS[index],
  fallback
}))

export function getCityLevel(score) {
  return CITY_LEVELS[getCityLevelIndex(score)]
}

export function getCityLevelIndex(score) {
  let index = 0
  CITY_LEVELS.forEach((level, i) => {
    if (score >= level.threshold) index = i
  })
  return index
}

export function getCityScoreForLevelIndex(index) {
  return CITY_LEVELS[clampNumber(index, 0, CITY_LEVELS.length - 1)]?.threshold || 0
}

export function normalizeCityProgress(state) {
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
