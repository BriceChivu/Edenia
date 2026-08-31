import { SUPPORTED_LOCALES } from '../i18n/index.js'

const ONBOARDING_PROFILE_DRAFT_VERSION = 1

function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.includes(value)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeNullableTimestamp(value) {
  if (typeof value !== 'string' || !value) return null
  return Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString()
}

function normalizeNullableChoice(value, maxLength = 64) {
  const choice = typeof value === 'string' ? value.trim() : ''
  return choice && choice.length <= maxLength ? choice : null
}

function normalizeChoiceList(value) {
  const choices = Array.isArray(value) ? value : []
  return [...new Set(
    choices.map(choice => normalizeNullableChoice(choice, 100))
  )].filter(Boolean).slice(0, 5)
}

function normalizeDraft(value, { fallbackLocale, now }) {
  const draft = isRecord(value) ? value : {}
  const createdAt = normalizeNullableTimestamp(draft.createdAt) || now()
  return {
    version: ONBOARDING_PROFILE_DRAFT_VERSION,
    locale: isSupportedLocale(draft.locale)
      ? draft.locale
      : fallbackLocale,
    introSeenAt: normalizeNullableTimestamp(draft.introSeenAt),
    accountStepReachedAt: normalizeNullableTimestamp(
      draft.accountStepReachedAt
    ),
    languageId: normalizeNullableChoice(draft.languageId),
    levelId: normalizeNullableChoice(draft.levelId),
    selectedChannelCatalogIds: normalizeChoiceList(
      draft.selectedChannelCatalogIds
    ),
    createdAt,
    updatedAt: normalizeNullableTimestamp(draft.updatedAt) || createdAt
  }
}

export function createOnboardingProfileDraftStore({
  createDefaultState,
  fallbackLocale,
  now = () => new Date().toISOString(),
  storage,
  storageKey
}) {
  if (
    typeof createDefaultState !== 'function'
    || typeof now !== 'function'
    || !isSupportedLocale(fallbackLocale)
    || typeof storage?.getItem !== 'function'
    || typeof storage?.setItem !== 'function'
    || typeof storage?.removeItem !== 'function'
    || typeof storageKey !== 'string'
    || !storageKey
  ) {
    throw new TypeError('Onboarding profile draft storage requires adapters')
  }

  function persist(draft) {
    try {
      storage.setItem(storageKey, JSON.stringify(draft))
      return true
    } catch {
      return false
    }
  }

  function loadOrCreateDraft() {
    let value = null
    try {
      value = JSON.parse(storage.getItem(storageKey) || 'null')
    } catch {}
    const draft = normalizeDraft(value, { fallbackLocale, now })
    if (!persist(draft)) return null
    return draft
  }

  function readWorkingState() {
    const draft = loadOrCreateDraft()
    if (!draft) return null
    const state = createDefaultState(draft.locale)
    state.config.locale = draft.locale
    state.learnerProfile.languages = [draft.languageId].filter(Boolean)
    state.learnerProfile.level = draft.levelId
    state.learnerProfile.selectedChannelCatalogIds =
      draft.selectedChannelCatalogIds.slice()
    state.onboarding.introSeenAt = draft.introSeenAt
    state.onboarding.accountStepReachedAt = draft.accountStepReachedAt
    return state
  }

  function saveWorkingState(state) {
    const current = loadOrCreateDraft()
    if (!current || !isRecord(state)) return false
    const updatedAt = now()
    return persist(normalizeDraft({
      ...current,
      locale: state.config?.locale,
      introSeenAt: state.onboarding?.introSeenAt,
      accountStepReachedAt: state.onboarding?.accountStepReachedAt,
      languageId: state.learnerProfile?.languages?.[0],
      levelId: state.learnerProfile?.level,
      selectedChannelCatalogIds:
        state.learnerProfile?.selectedChannelCatalogIds,
      updatedAt
    }, { fallbackLocale, now }))
  }

  function clear() {
    try {
      storage.removeItem(storageKey)
      return storage.getItem(storageKey) === null
    } catch {
      return false
    }
  }

  function hasDraft() {
    try {
      return storage.getItem(storageKey) !== null
    } catch {
      return false
    }
  }

  return Object.freeze({
    clear,
    hasDraft,
    loadOrCreateDraft,
    readWorkingState,
    saveWorkingState
  })
}
