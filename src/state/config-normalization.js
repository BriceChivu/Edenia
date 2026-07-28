import { clampNumber } from '../core/numbers.js'

export const DEFAULT_THEME = 'light'

const THEMES = ['light', 'dark']
const MIN_WEEKLY_GOAL_HOURS = 1
const MAX_WEEKLY_GOAL_HOURS = 99

export function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : DEFAULT_THEME
}

export function normalizeWeeklyGoalHours(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 4
  return clampNumber(parsed, MIN_WEEKLY_GOAL_HOURS, MAX_WEEKLY_GOAL_HOURS)
}

export function normalizeIncludeShorts(value) {
  return value !== false
}

export function normalizeAnkiEnabled(value) {
  return value !== false
}

export function normalizeAnkiCount(value) {
  const count = Math.floor(Number(value) || 0)
  return Math.max(0, count)
}
