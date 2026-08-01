import {
  formatPlusPrice,
  normalizePlusFeatureId,
  PLUS_BENEFITS,
  PLUS_PLANS
} from '../../domain/plus-offer.js'

const CONTEXT_KEYS = Object.freeze({
  'complete-study-history': 'history',
  'all-study-insights': 'insights',
  'unlimited-tracked-channels': 'channels'
})

function element(documentLike, tag, className, text = '') {
  const node = documentLike.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export function renderPlusOffer(root, {
  t,
  locale,
  selectedPlan,
  offerPlans = [],
  offerState = 'idle',
  featureId = null
}) {
  if (!root?.querySelector || typeof t !== 'function') return false
  const context = CONTEXT_KEYS[normalizePlusFeatureId(featureId)] || 'generic'
  const title = root.querySelector('[data-plus-context-title]')
  const body = root.querySelector('[data-plus-context-body]')
  if (title) title.textContent = t(`plus.context.${context}.title`)
  if (body) body.textContent = t(`plus.context.${context}.body`)

  const benefits = root.querySelector('[data-plus-benefits]')
  if (benefits) {
    const documentLike = benefits.ownerDocument
    const fragment = documentLike.createDocumentFragment()
    PLUS_BENEFITS.forEach(benefit => {
      const item = element(documentLike, 'li', 'plus-benefit')
      const icon = element(documentLike, 'span', 'plus-benefit-icon', '✓')
      icon.setAttribute('aria-hidden', 'true')
      const copy = element(documentLike, 'span', 'plus-benefit-copy')
      copy.append(
        element(documentLike, 'strong', '', t(benefit.titleKey)),
        element(documentLike, 'span', '', t(benefit.bodyKey))
      )
      item.append(icon, copy)
      fragment.append(item)
    })
    benefits.replaceChildren(fragment)
  }

  const plans = root.querySelector('[data-plus-plans]')
  if (plans) {
    const documentLike = plans.ownerDocument
    const prices = new Map(offerPlans.map(plan => [plan.id, plan]))
    const fragment = documentLike.createDocumentFragment()
    PLUS_PLANS.forEach(plan => {
      const control = element(documentLike, 'button', 'plus-plan')
      control.type = 'button'
      control.dataset.plusAction = 'select-plan'
      control.dataset.planId = plan.id
      control.setAttribute('aria-pressed', String(plan.id === selectedPlan))
      if (plan.recommended) {
        control.append(element(
          documentLike,
          'span',
          'plus-plan-badge',
          t('plus.plan.recommended')
        ))
      }
      control.append(element(documentLike, 'strong', 'plus-plan-title', t(plan.titleKey)))
      const publicPrice = prices.get(plan.id)
      const priceText = publicPrice
        ? formatPlusPrice(publicPrice, locale)
        : offerState === 'loading'
          ? t('plus.plan.priceLoading')
          : t('plus.plan.priceUnavailable')
      control.append(element(documentLike, 'span', 'plus-plan-price', priceText))
      control.append(element(documentLike, 'span', 'plus-plan-cadence', t(plan.cadenceKey)))
      fragment.append(control)
    })
    plans.replaceChildren(fragment)
  }
  return true
}
