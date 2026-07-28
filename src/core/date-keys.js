export const ANKI_DAY_START_HOUR = 4

export function isValidTimestamp(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

export function setLocalTime(date, hour, minute) {
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

export function getWeekStart(from = new Date()) {
  const date = new Date(from)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  date.setHours(0, 0, 0, 0)
  return date
}

export function toDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getAnkiDateKey(from = new Date()) {
  const date = new Date(from)
  if (date.getHours() < ANKI_DAY_START_HOUR) date.setDate(date.getDate() - 1)
  return toDateKey(date)
}

export function getCurrentAnkiDateKey() {
  return getAnkiDateKey(new Date())
}

export function dateKeyToLocalDate(dateKey) {
  return new Date(`${dateKey}T00:00:00`)
}

export function getPreviousDateKey(dateKey) {
  const date = dateKeyToLocalDate(dateKey)
  date.setDate(date.getDate() - 1)
  return toDateKey(date)
}

export function getDaysBetweenDateKeys(previousKey, nextKey) {
  return Math.round(
    (dateKeyToLocalDate(nextKey) - dateKeyToLocalDate(previousKey))
      / 86_400_000
  )
}

export function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function daysBetweenDateKeys(fromKey, toKey) {
  const from = new Date(`${fromKey}T00:00:00`)
  const to = new Date(`${toKey}T00:00:00`)
  return Math.round((to - from) / 86_400_000)
}
