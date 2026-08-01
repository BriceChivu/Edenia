import {
  PLUS_ENTITLEMENT_STATES
} from '../domain/plus-access-policy.js'
import { readPlusEntitlement } from '../domain/plus-entitlement.js'

export const PLUS_ACCOUNT_SESSION_STATES = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  SIGNED_IN: 'signed-in',
  UNAVAILABLE: 'unavailable'
})

export const PLUS_ACCOUNT_FEEDBACK = Object.freeze({
  CHECKOUT_ERROR: 'checkout-error',
  CHECKOUT_PENDING: 'checkout-pending',
  CHECKOUT_RESTORED: 'checkout-restored',
  INVALID_EMAIL: 'invalid-email',
  REFRESH_ERROR: 'refresh-error',
  SIGN_IN_ERROR: 'sign-in-error',
  SIGN_IN_LINK_SENT: 'sign-in-link-sent',
  SIGN_OUT_ERROR: 'sign-out-error'
})

const AUTH_REFRESH_EVENTS = new Set([
  'SIGNED_IN',
  'TOKEN_REFRESHED',
  'USER_UPDATED'
])
const STABLE_ENTITLEMENT_STATES = new Set([
  PLUS_ENTITLEMENT_STATES.FREE,
  PLUS_ENTITLEMENT_STATES.PLUS,
  PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CHECKOUT_SESSION_PATTERN = /^cs_[A-Za-z0-9_]+$/

function getSessionUser(session) {
  const user = session?.user
  if (!user?.id) return null
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : ''
  }
}

function getCheckoutSessionId(locationLike) {
  const params = new URLSearchParams(locationLike?.search || '')
  const sessionId = params.get('session_id') || ''
  if (params.get('upgrade_success') !== '1') return null
  if (sessionId.length > 255 || !CHECKOUT_SESSION_PATTERN.test(sessionId)) {
    return null
  }
  return sessionId
}

function getPasswordlessRedirectUrl(locationLike) {
  const url = new URL(locationLike.href)
  url.searchParams.delete('upgrade_success')
  url.searchParams.delete('session_id')
  url.hash = ''
  return url.toString()
}

function clearCheckoutParams(locationLike, historyLike) {
  const url = new URL(locationLike.href)
  url.searchParams.delete('upgrade_success')
  url.searchParams.delete('session_id')
  historyLike.replaceState(
    historyLike.state,
    '',
    `${url.pathname}${url.search}${url.hash}`
  )
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  return email
}

export function createPlusAuthController({
  client,
  entitlementCache,
  location: locationLike,
  history: historyLike,
  onStateChange,
  onEntitlementChange,
  readEntitlement = readPlusEntitlement,
  schedule = callback => setTimeout(callback, 0),
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  checkoutRetryCount = 1,
  checkoutRetryDelayMs = 2000
}) {
  if (!client?.auth || !client?.functions) {
    throw new TypeError('Plus auth controller requires a Supabase client')
  }
  if (
    !entitlementCache
    || typeof entitlementCache.read !== 'function'
    || typeof entitlementCache.write !== 'function'
  ) {
    throw new TypeError('Plus auth controller requires an entitlement cache')
  }
  if (!locationLike?.href || typeof historyLike?.replaceState !== 'function') {
    throw new TypeError('Plus auth controller requires browser location and history')
  }
  if (
    typeof onStateChange !== 'function'
    || typeof onEntitlementChange !== 'function'
  ) {
    throw new TypeError('Plus auth controller requires state callbacks')
  }

  let currentState = Object.freeze({
    sessionState: PLUS_ACCOUNT_SESSION_STATES.LOADING,
    entitlementState: PLUS_ENTITLEMENT_STATES.LOADING,
    userId: null,
    email: '',
    subscriptionStatus: null,
    plan: null,
    currentPeriodEnd: null,
    pastDueSince: null,
    updatedAt: null,
    usingCachedEntitlement: false,
    busyAction: null,
    feedback: null,
    feedbackEmail: ''
  })
  let initializedPromise = null
  let authSubscription = null
  let sessionRequestId = 0
  let destroyed = false
  let restoringCheckout = false

  function publish(patch) {
    if (destroyed) return currentState
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  function publishEntitlement(entitlementState) {
    onEntitlementChange(entitlementState)
  }

  async function synchronizeSession(session, {
    busyAction = null,
    feedback = null,
    feedbackEmail = ''
  } = {}) {
    const requestId = ++sessionRequestId
    const user = getSessionUser(session)
    if (!user) {
      publish({
        sessionState: PLUS_ACCOUNT_SESSION_STATES.SIGNED_OUT,
        entitlementState: PLUS_ENTITLEMENT_STATES.FREE,
        userId: null,
        email: '',
        subscriptionStatus: null,
        plan: null,
        currentPeriodEnd: null,
        pastDueSince: null,
        updatedAt: null,
        usingCachedEntitlement: false,
        busyAction: null,
        feedback,
        feedbackEmail
      })
      publishEntitlement(PLUS_ENTITLEMENT_STATES.FREE)
      return currentState
    }

    const isSameUser = currentState.userId === user.id
    const pendingEntitlementState = isSameUser
      && STABLE_ENTITLEMENT_STATES.has(currentState.entitlementState)
      ? currentState.entitlementState
      : PLUS_ENTITLEMENT_STATES.LOADING
    publish({
      sessionState: PLUS_ACCOUNT_SESSION_STATES.SIGNED_IN,
      entitlementState: pendingEntitlementState,
      userId: user.id,
      email: user.email,
      subscriptionStatus: isSameUser ? currentState.subscriptionStatus : null,
      plan: isSameUser ? currentState.plan : null,
      currentPeriodEnd: isSameUser ? currentState.currentPeriodEnd : null,
      pastDueSince: isSameUser ? currentState.pastDueSince : null,
      updatedAt: isSameUser ? currentState.updatedAt : null,
      usingCachedEntitlement: false,
      busyAction,
      feedback,
      feedbackEmail
    })
    publishEntitlement(pendingEntitlementState)

    try {
      const entitlement = await readEntitlement(client, user.id)
      if (destroyed || requestId !== sessionRequestId) return currentState
      entitlementCache.write(user.id, entitlement)
      publish({
        sessionState: PLUS_ACCOUNT_SESSION_STATES.SIGNED_IN,
        ...entitlement,
        userId: user.id,
        email: user.email,
        usingCachedEntitlement: false,
        busyAction: null,
        feedback,
        feedbackEmail
      })
      publishEntitlement(entitlement.entitlementState)
    } catch {
      if (destroyed || requestId !== sessionRequestId) return currentState
      const cachedEntitlement = entitlementCache.read(user.id)
      if (cachedEntitlement) {
        publish({
          sessionState: PLUS_ACCOUNT_SESSION_STATES.SIGNED_IN,
          ...cachedEntitlement,
          userId: user.id,
          email: user.email,
          usingCachedEntitlement: true,
          busyAction: null,
          feedback,
          feedbackEmail
        })
        publishEntitlement(cachedEntitlement.entitlementState)
      } else {
        publish({
          sessionState: PLUS_ACCOUNT_SESSION_STATES.SIGNED_IN,
          entitlementState: PLUS_ENTITLEMENT_STATES.UNAVAILABLE,
          userId: user.id,
          email: user.email,
          subscriptionStatus: null,
          plan: null,
          currentPeriodEnd: null,
          pastDueSince: null,
          updatedAt: null,
          usingCachedEntitlement: false,
          busyAction: null,
          feedback: feedback || PLUS_ACCOUNT_FEEDBACK.REFRESH_ERROR,
          feedbackEmail
        })
        publishEntitlement(PLUS_ENTITLEMENT_STATES.UNAVAILABLE)
      }
    }
    return currentState
  }

  async function getCurrentSession() {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    return data?.session || null
  }

  async function restoreCheckoutSession(sessionId) {
    publish({
      sessionState: PLUS_ACCOUNT_SESSION_STATES.LOADING,
      entitlementState: PLUS_ENTITLEMENT_STATES.LOADING,
      busyAction: 'checkout',
      feedback: null
    })

    for (let attempt = 0; attempt <= checkoutRetryCount; attempt += 1) {
      const { data, error } = await client.functions.invoke(
        'link-checkout-session',
        { body: { session_id: sessionId } }
      )
      if (error) throw error
      if (data?.pending === true) {
        if (attempt < checkoutRetryCount) {
          await wait(checkoutRetryDelayMs)
          continue
        }
        return { feedback: PLUS_ACCOUNT_FEEDBACK.CHECKOUT_PENDING }
      }
      if (!data?.token_hash || !data?.user_id) {
        throw new Error('Checkout linking returned an invalid response')
      }

      let authData
      let authError
      restoringCheckout = true
      try {
        const result = await client.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'email'
        })
        authData = result.data
        authError = result.error
      } finally {
        restoringCheckout = false
      }
      if (authError) throw authError
      const verifiedUser = authData?.user || authData?.session?.user
      if (!verifiedUser?.id || verifiedUser.id !== data.user_id) {
        try { await client.auth.signOut({ scope: 'local' }) } catch {}
        throw new Error('Checkout linking authenticated the wrong account')
      }

      clearCheckoutParams(locationLike, historyLike)
      await synchronizeSession(authData.session, {
        feedback: PLUS_ACCOUNT_FEEDBACK.CHECKOUT_RESTORED
      })
      return { restored: true }
    }

    return { feedback: PLUS_ACCOUNT_FEEDBACK.CHECKOUT_PENDING }
  }

  async function initializeOnce() {
    const authListener = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_IN' && restoringCheckout) return
      if (!AUTH_REFRESH_EVENTS.has(event) && event !== 'SIGNED_OUT') return
      schedule(() => {
        if (!destroyed) void synchronizeSession(session)
      })
    })
    authSubscription = authListener?.data?.subscription || null

    const checkoutSessionId = getCheckoutSessionId(locationLike)
    if (checkoutSessionId) {
      try {
        const result = await restoreCheckoutSession(checkoutSessionId)
        if (result.restored) return currentState
        const session = await getCurrentSession()
        return synchronizeSession(session, { feedback: result.feedback })
      } catch {
        const session = await getCurrentSession().catch(() => null)
        return synchronizeSession(session, {
          feedback: PLUS_ACCOUNT_FEEDBACK.CHECKOUT_ERROR
        })
      }
    }

    try {
      return synchronizeSession(await getCurrentSession())
    } catch {
      publish({
        sessionState: PLUS_ACCOUNT_SESSION_STATES.UNAVAILABLE,
        entitlementState: PLUS_ENTITLEMENT_STATES.UNAVAILABLE,
        subscriptionStatus: null,
        plan: null,
        currentPeriodEnd: null,
        pastDueSince: null,
        updatedAt: null,
        usingCachedEntitlement: false,
        busyAction: null,
        feedback: PLUS_ACCOUNT_FEEDBACK.REFRESH_ERROR
      })
      publishEntitlement(PLUS_ENTITLEMENT_STATES.UNAVAILABLE)
      return currentState
    }
  }

  function initialize() {
    if (!initializedPromise) initializedPromise = initializeOnce()
    return initializedPromise
  }

  async function restore(emailValue) {
    const email = normalizeEmail(emailValue)
    if (!email) {
      publish({
        busyAction: null,
        feedback: PLUS_ACCOUNT_FEEDBACK.INVALID_EMAIL,
        feedbackEmail: ''
      })
      return false
    }

    publish({
      busyAction: 'restore',
      feedback: null,
      feedbackEmail: ''
    })
    let signInResult
    try {
      signInResult = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getPasswordlessRedirectUrl(locationLike),
          shouldCreateUser: false
        }
      })
    } catch {}
    if (!signInResult || signInResult.error) {
      publish({
        busyAction: null,
        feedback: PLUS_ACCOUNT_FEEDBACK.SIGN_IN_ERROR,
        feedbackEmail: ''
      })
      return false
    }
    publish({
      busyAction: null,
      feedback: PLUS_ACCOUNT_FEEDBACK.SIGN_IN_LINK_SENT,
      feedbackEmail: email
    })
    return true
  }

  async function refresh() {
    publish({ busyAction: 'refresh', feedback: null, feedbackEmail: '' })
    try {
      const session = await getCurrentSession()
      return synchronizeSession(session, { busyAction: 'refresh' })
    } catch {
      publish({
        sessionState: PLUS_ACCOUNT_SESSION_STATES.UNAVAILABLE,
        entitlementState: PLUS_ENTITLEMENT_STATES.UNAVAILABLE,
        subscriptionStatus: null,
        plan: null,
        currentPeriodEnd: null,
        pastDueSince: null,
        updatedAt: null,
        usingCachedEntitlement: false,
        busyAction: null,
        feedback: PLUS_ACCOUNT_FEEDBACK.REFRESH_ERROR
      })
      publishEntitlement(PLUS_ENTITLEMENT_STATES.UNAVAILABLE)
      return currentState
    }
  }

  async function signOut() {
    publish({ busyAction: 'sign-out', feedback: null, feedbackEmail: '' })
    let signOutResult
    try {
      signOutResult = await client.auth.signOut({ scope: 'local' })
    } catch {}
    if (!signOutResult || signOutResult.error) {
      publish({
        busyAction: null,
        feedback: PLUS_ACCOUNT_FEEDBACK.SIGN_OUT_ERROR
      })
      return false
    }
    await synchronizeSession(null)
    return true
  }

  function destroy() {
    destroyed = true
    authSubscription?.unsubscribe?.()
    authSubscription = null
  }

  return Object.freeze({
    destroy,
    getState: () => currentState,
    initialize,
    refresh,
    restore,
    signOut
  })
}
