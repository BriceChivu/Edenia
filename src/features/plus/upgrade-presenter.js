import { PLUS_ENTITLEMENT_STATES } from '../../domain/plus-access-policy.js'
import { PLUS_ACCOUNT_FEEDBACK } from '../../integrations/plus-auth-controller.js'
import {
  PLUS_BILLING_FEEDBACK,
  PLUS_BILLING_OFFER_STATES
} from '../../integrations/plus-billing-controller.js'
import { renderPlusOffer } from './upgrade-view.js'

const FEEDBACK_KEYS = Object.freeze({
  [PLUS_ACCOUNT_FEEDBACK.CHECKOUT_ERROR]: 'settings.plusAccount.feedback.checkoutError',
  [PLUS_ACCOUNT_FEEDBACK.CHECKOUT_PENDING]: 'plus.feedback.checkoutPending',
  [PLUS_ACCOUNT_FEEDBACK.CHECKOUT_RESTORED]: 'settings.plusAccount.feedback.checkoutRestored',
  [PLUS_ACCOUNT_FEEDBACK.INVALID_EMAIL]: 'settings.plusAccount.feedback.invalidEmail',
  [PLUS_ACCOUNT_FEEDBACK.REFRESH_ERROR]: 'settings.plusAccount.feedback.refreshError',
  [PLUS_ACCOUNT_FEEDBACK.SIGN_IN_ERROR]: 'settings.plusAccount.feedback.signInError',
  [PLUS_ACCOUNT_FEEDBACK.SIGN_IN_LINK_SENT]: 'settings.plusAccount.feedback.linkSent',
  [PLUS_ACCOUNT_FEEDBACK.UPGRADE_LINK_SENT]: 'plus.feedback.upgradeLinkSent',
  [PLUS_ACCOUNT_FEEDBACK.SIGN_OUT_ERROR]: 'settings.plusAccount.feedback.signOutError',
  [PLUS_BILLING_FEEDBACK.BILLING_ACCOUNT_NOT_FOUND]: 'plus.feedback.billingMissing',
  [PLUS_BILLING_FEEDBACK.CHECKOUT_CANCELLED]: 'plus.feedback.checkoutCancelled',
  [PLUS_BILLING_FEEDBACK.CHECKOUT_DISABLED]: 'plus.action.checkoutDisabled',
  [PLUS_BILLING_FEEDBACK.CHECKOUT_ERROR]: 'plus.feedback.checkoutError',
  [PLUS_BILLING_FEEDBACK.CHECKOUT_LOGIN_REQUIRED]: 'plus.feedback.checkoutLogin',
  [PLUS_BILLING_FEEDBACK.OFFER_UNAVAILABLE]: 'plus.feedback.offerUnavailable',
  [PLUS_BILLING_FEEDBACK.PORTAL_ERROR]: 'plus.feedback.portalError',
  [PLUS_BILLING_FEEDBACK.RATE_LIMITED]: 'plus.feedback.rateLimited',
  [PLUS_BILLING_FEEDBACK.SUBSCRIPTION_EXISTS]: 'plus.feedback.subscriptionExists',
  'billing-returned': 'plus.feedback.billingReturned'
})

function accountSummaryKey(accountState) {
  if (accountState?.entitlementState === PLUS_ENTITLEMENT_STATES.PLUS) {
    return 'plus.account.active'
  }
  if (accountState?.entitlementState === PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM) {
    return 'plus.account.paymentProblem'
  }
  if (accountState?.userId) return 'plus.account.free'
  return null
}

export function renderPlusUpgradeExperience(root, {
  accountState,
  billingState,
  checkoutEnabled,
  featureId,
  locale,
  transientFeedback = null,
  t
}) {
  if (!root?.querySelector || typeof t !== 'function') return false
  renderPlusOffer(root, {
    t,
    locale,
    selectedPlan: billingState?.selectedPlan || 'annual',
    offerPlans: billingState?.plans || [],
    offerState: billingState?.offerState || PLUS_BILLING_OFFER_STATES.IDLE,
    featureId
  })

  const signedIn = Boolean(accountState?.userId)
  const hasSubscription = Boolean(accountState?.subscriptionStatus)
  const hasPlus = [
    PLUS_ENTITLEMENT_STATES.PLUS,
    PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
  ].includes(accountState?.entitlementState)
  const busyAction = accountState?.busyAction || billingState?.busyAction || null

  root.querySelector('[data-plus-action="upgrade-sign-in"]')
    ?.classList.toggle('hidden', signedIn)
  root.querySelector('[data-plus-signed-in]')
    ?.classList.toggle('hidden', !signedIn)
  const signedInLabel = root.querySelector('[data-plus-signed-in-label]')
  if (signedInLabel) {
    signedInLabel.textContent = signedIn
      ? t('plus.account.signedInAs', { email: accountState.email || '' })
      : ''
  }

  const summary = root.querySelector('[data-plus-account-summary]')
  const summaryKey = accountSummaryKey(accountState)
  if (summary) summary.textContent = summaryKey ? t(summaryKey) : ''

  const manage = root.querySelector('[data-plus-manage-billing]')
  manage?.classList.toggle('hidden', !signedIn || !hasSubscription)
  if (manage) {
    manage.disabled = Boolean(busyAction)
    manage.textContent = t(
      billingState?.busyAction === 'create-billing-portal'
        ? 'plus.account.managing'
        : 'plus.account.manage'
    )
  }

  const checkout = root.querySelector('[data-plus-checkout]')
  if (checkout) {
    checkout.classList.toggle('hidden', hasPlus)
    checkout.disabled = Boolean(
      busyAction
      || !signedIn
      || checkoutEnabled !== true
      || billingState?.offerState !== PLUS_BILLING_OFFER_STATES.READY
    )
    checkout.textContent = t(
      checkoutEnabled !== true
        ? 'plus.action.checkoutDisabled'
        : billingState?.busyAction === 'create-checkout-session'
          ? 'plus.action.checkoutBusy'
          : 'plus.action.checkout'
    )
  }

  const email = root.querySelector('[data-plus-email]')
  if (email) email.disabled = Boolean(accountState?.busyAction)
  const signInSubmit = root.querySelector('[data-plus-sign-in-submit]')
  if (signInSubmit) {
    signInSubmit.disabled = Boolean(accountState?.busyAction)
    signInSubmit.textContent = t(
      accountState?.busyAction === 'upgrade-sign-in'
        ? 'plus.auth.sending'
        : 'plus.auth.continue'
    )
  }

  const feedbackCode = transientFeedback
    || billingState?.feedback
    || accountState?.feedback
  const feedback = root.querySelector('[data-plus-feedback]')
  const feedbackKey = FEEDBACK_KEYS[feedbackCode]
  if (feedback) {
    feedback.classList.toggle('hidden', !feedbackKey)
    feedback.textContent = feedbackKey
      ? t(feedbackKey, { email: accountState?.feedbackEmail || '' })
      : ''
  }
  root.setAttribute('aria-busy', String(Boolean(busyAction)))
  return true
}
