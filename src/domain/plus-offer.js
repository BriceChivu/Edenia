import { PLUS_FEATURE_IDS } from './plus-access-policy.js'

export const PLUS_PLAN_IDS = Object.freeze({
  MONTHLY: 'monthly',
  ANNUAL: 'annual'
})

export const PLUS_BENEFITS = Object.freeze([
  Object.freeze({
    id: PLUS_FEATURE_IDS.COMPLETE_STUDY_HISTORY,
    titleKey: 'plus.benefit.history.title',
    bodyKey: 'plus.benefit.history.body'
  }),
  Object.freeze({
    id: PLUS_FEATURE_IDS.ALL_STUDY_INSIGHTS,
    titleKey: 'plus.benefit.insights.title',
    bodyKey: 'plus.benefit.insights.body'
  }),
  Object.freeze({
    id: PLUS_FEATURE_IDS.UNLIMITED_TRACKED_CHANNELS,
    titleKey: 'plus.benefit.channels.title',
    bodyKey: 'plus.benefit.channels.body'
  })
])

export const PLUS_PLANS = Object.freeze([
  Object.freeze({
    id: PLUS_PLAN_IDS.MONTHLY,
    titleKey: 'plus.plan.monthly.title',
    cadenceKey: 'plus.plan.monthly.cadence',
    recommended: false
  }),
  Object.freeze({
    id: PLUS_PLAN_IDS.ANNUAL,
    titleKey: 'plus.plan.annual.title',
    cadenceKey: 'plus.plan.annual.cadence',
    recommended: true
  })
])

const PLAN_IDS = new Set(Object.values(PLUS_PLAN_IDS))
const FEATURE_IDS = new Set(Object.values(PLUS_FEATURE_IDS))

export function normalizePlusPlanId(value, fallback = PLUS_PLAN_IDS.ANNUAL) {
  return PLAN_IDS.has(value) ? value : fallback
}

export function normalizePlusFeatureId(value) {
  return FEATURE_IDS.has(value) ? value : null
}

export function normalizePlusOffer(value) {
  if (!Array.isArray(value?.plans)) return Object.freeze([])
  const plans = []
  const seen = new Set()
  for (const plan of value.plans) {
    if (
      !PLAN_IDS.has(plan?.id)
      || seen.has(plan.id)
      || typeof plan.currency !== 'string'
      || !/^[a-z]{3}$/.test(plan.currency)
      || !Number.isSafeInteger(plan.unit_amount)
      || plan.unit_amount < 0
      || !['month', 'year'].includes(plan.interval)
      || !Number.isSafeInteger(plan.interval_count)
      || plan.interval_count < 1
    ) continue
    const expectedInterval = plan.id === PLUS_PLAN_IDS.MONTHLY
      ? 'month'
      : 'year'
    if (plan.interval !== expectedInterval) continue
    seen.add(plan.id)
    plans.push(Object.freeze({
      id: plan.id,
      currency: plan.currency,
      unitAmount: plan.unit_amount,
      interval: plan.interval,
      intervalCount: plan.interval_count
    }))
  }
  return Object.freeze(plans)
}

export function formatPlusPrice(plan, locale = 'en') {
  if (!plan) return ''
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: plan.currency.toUpperCase(),
      maximumFractionDigits: plan.unitAmount % 100 === 0 ? 0 : 2
    }).format(plan.unitAmount / 100)
  } catch {
    return ''
  }
}
