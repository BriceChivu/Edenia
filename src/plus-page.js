import { deriveRuntimeEnvironment } from './core/runtime-environment.js'
import { deriveAccountFeaturesEnabled } from './core/account-feature-rollout.js'
import { deriveStorageKeys } from './core/storage-keys.js'
import {
  createPlusAccessPolicy,
  PLUS_ENTITLEMENT_STATES
} from './domain/plus-access-policy.js'
import {
  normalizePlusFeatureId,
  normalizePlusPlanId
} from './domain/plus-offer.js'
import { bindPlusUpgradeActions } from './features/plus/upgrade-actions.js'
import { renderPlusUpgradeExperience } from './features/plus/upgrade-presenter.js'
import {
  createPlusAuthController,
  PLUS_ACCOUNT_SESSION_STATES
} from './integrations/plus-auth-controller.js'
import { createPlusBillingController } from './integrations/plus-billing-controller.js'
import {
  getPlusCheckoutEnabled,
  getAccountFeaturesRollout,
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseRuntimeConfig
} from './integrations/runtime-config.js'
import { createEdeniaSupabaseClient } from './integrations/supabase-client.js'
import {
  getBrowserDefaultLocale,
  getCurrentLocale,
  getLocaleLabel,
  normalizeLocale,
  setCurrentLocale,
  SUPPORTED_LOCALES,
  t
} from './i18n/runtime.js'
import { createPlusEntitlementCache } from './state/plus-entitlement-cache.js'

const root = document.getElementById('plusPage')
const runtimeEnvironment = deriveRuntimeEnvironment(window.location)
const accountFeaturesEnabled = deriveAccountFeaturesEnabled(
  runtimeEnvironment,
  getAccountFeaturesRollout()
)
const storageKeys = deriveStorageKeys(runtimeEnvironment)
const checkoutEnabled = getPlusCheckoutEnabled()
const policy = createPlusAccessPolicy({
  plusCheckoutEnabled: checkoutEnabled,
  entitlementState: PLUS_ENTITLEMENT_STATES.LOADING
})
const params = new URLSearchParams(window.location.search)
let featureId = normalizePlusFeatureId(params.get('feature'))
let transientFeedback = params.get('checkout_cancelled') === '1'
  ? 'checkout-cancelled'
  : params.get('billing_return') === '1'
    ? 'billing-returned'
    : null
let accountController = null
let billingController = null
let accountState = {
  sessionState: PLUS_ACCOUNT_SESSION_STATES.UNAVAILABLE,
  entitlementState: PLUS_ENTITLEMENT_STATES.UNAVAILABLE,
  userId: null,
  email: '',
  subscriptionStatus: null,
  busyAction: null,
  feedback: null,
  feedbackEmail: ''
}
let billingState = {
  selectedPlan: normalizePlusPlanId(params.get('plan')),
  offerState: 'unavailable',
  plans: [],
  busyAction: null,
  feedback: null
}

function storedLocale() {
  try {
    const state = JSON.parse(localStorage.getItem(storageKeys.storageKey) || 'null')
    return state?.config?.locale
      ? normalizeLocale(state.config.locale)
      : getBrowserDefaultLocale()
  } catch {
    return getBrowserDefaultLocale()
  }
}

function applyTranslations() {
  const locale = getCurrentLocale()
  document.documentElement.lang = locale
  document.title = t('plus.page.title')
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder))
  })
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel))
  })
  const localeSelect = document.getElementById('plusLocaleSelect')
  if (localeSelect) {
    localeSelect.replaceChildren(...SUPPORTED_LOCALES.map(optionLocale => {
      const option = document.createElement('option')
      option.value = optionLocale
      option.textContent = getLocaleLabel(optionLocale)
      option.selected = optionLocale === locale
      return option
    }))
  }
}

function render() {
  applyTranslations()
  renderPlusUpgradeExperience(root, {
    accountState,
    billingState,
    checkoutEnabled: policy.checkoutEnabled,
    featureId,
    locale: getCurrentLocale(),
    transientFeedback,
    t
  })
}

function clearReturnParams() {
  const url = new URL(window.location.href)
  for (const key of ['checkout_cancelled', 'billing_return']) {
    url.searchParams.delete(key)
  }
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`
  )
}

function initializeControllers() {
  if (!hasSupabaseRuntimeConfig()) {
    render()
    return
  }
  const client = createEdeniaSupabaseClient({
    url: getSupabaseUrl(),
    publishableKey: getSupabasePublishableKey(),
    storageKey: storageKeys.plusAuthStorageKey
  })
  accountController = createPlusAuthController({
    client,
    entitlementCache: createPlusEntitlementCache({
      storage: localStorage,
      storageKey: storageKeys.plusEntitlementCacheKey
    }),
    location: window.location,
    history: window.history,
    onStateChange(state) {
      accountState = state
      render()
    },
    onEntitlementChange() {}
  })
  billingController = createPlusBillingController({
    client,
    checkoutEnabled,
    location: { assign: url => window.location.assign(url) },
    onStateChange(state) {
      billingState = state
      render()
    }
  })
  billingController.selectPlan(billingState.selectedPlan)
  void billingController.loadOffer()
  void accountController.initialize().then(() => {
    if (params.get('billing_return') === '1') void accountController.refresh()
    clearReturnParams()
  })
}

if (!accountFeaturesEnabled) {
  window.location.replace('../')
} else {
  root.hidden = false
  setCurrentLocale(normalizeLocale(params.get('locale') || storedLocale()))
  bindPlusUpgradeActions(root, {
    close() { window.location.assign('../') },
    selectPlan(plan) {
      transientFeedback = null
      if (billingController) {
        billingController.selectPlan(plan)
        return
      }
      billingState = {
        ...billingState,
        selectedPlan: normalizePlusPlanId(plan)
      }
      render()
    },
    startCheckout() {
      transientFeedback = null
      return billingController?.startCheckout()
    },
    startUpgradeSignIn(email) {
      transientFeedback = null
      return accountController?.startUpgradeSignIn(
        email,
        billingState.selectedPlan
      )
    },
    restore(email) {
      transientFeedback = null
      return accountController?.restore(email)
    },
    refresh() {
      transientFeedback = null
      return accountController?.refresh()
    },
    openBillingPortal() {
      transientFeedback = null
      return billingController?.openBillingPortal()
    },
    signOut() {
      transientFeedback = null
      return accountController?.signOut()
    }
  })
  document.getElementById('plusLocaleSelect')?.addEventListener('change', event => {
    setCurrentLocale(normalizeLocale(event.currentTarget.value))
    render()
  })
  render()
  initializeControllers()
}
