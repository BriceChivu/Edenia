export const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

const GOOGLE_IDENTITY_SCRIPT_ID = 'edenia-google-identity-services'
const NONCE_BYTE_LENGTH = 32

function getGoogleIdentityApi(target) {
  const api = target?.google?.accounts?.id
  if (
    typeof api?.initialize !== 'function'
    || typeof api?.renderButton !== 'function'
    || typeof api?.prompt !== 'function'
    || typeof api?.cancel !== 'function'
    || typeof api?.disableAutoSelect !== 'function'
  ) return null
  return api
}

export function createGoogleIdentityServicesScriptLoader({
  document: documentLike = document,
  target = window
} = {}) {
  let scriptPromise = null

  return function loadGoogleIdentityServicesScript() {
    const existingApi = getGoogleIdentityApi(target)
    if (existingApi) return Promise.resolve(existingApi)
    if (scriptPromise) return scriptPromise
    if (!documentLike?.createElement || !documentLike?.head?.appendChild) {
      return Promise.reject(new Error('Google Identity Services is unavailable'))
    }

    scriptPromise = new Promise((resolve, reject) => {
      const existingScript = documentLike.getElementById?.(
        GOOGLE_IDENTITY_SCRIPT_ID
      )
      const script = existingScript || documentLike.createElement('script')
      const handleLoad = () => {
        const api = getGoogleIdentityApi(target)
        if (api) resolve(api)
        else reject(new Error('Google Identity Services is unavailable'))
      }
      const handleError = () => reject(
        new Error('Google Identity Services is unavailable')
      )

      script.addEventListener?.('load', handleLoad, { once: true })
      script.addEventListener?.('error', handleError, { once: true })
      if (!existingScript) {
        script.id = GOOGLE_IDENTITY_SCRIPT_ID
        script.src = GOOGLE_IDENTITY_SCRIPT_URL
        script.async = true
        script.defer = true
        script.crossOrigin = 'anonymous'
        documentLike.head.appendChild(script)
      }
    }).catch(error => {
      scriptPromise = null
      throw error
    })
    return scriptPromise
  }
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

async function createNonce(cryptoLike) {
  if (
    typeof cryptoLike?.getRandomValues !== 'function'
    || typeof cryptoLike?.subtle?.digest !== 'function'
  ) throw new Error('Secure nonce generation is unavailable')

  const randomBytes = new Uint8Array(NONCE_BYTE_LENGTH)
  cryptoLike.getRandomValues(randomBytes)
  const raw = bytesToBase64Url(randomBytes)
  const digest = await cryptoLike.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw)
  )
  return {
    raw,
    hashed: bytesToBase64Url(new Uint8Array(digest))
  }
}

function normalizeButtonOptions(options = {}) {
  const requestedWidth = Number(options.width)
  return Object.freeze({
    locale: String(options.locale || 'en').trim() || 'en',
    width: Number.isFinite(requestedWidth)
      ? Math.max(200, Math.min(400, Math.round(requestedWidth)))
      : 320
  })
}

export function createGoogleIdentityServicesController({
  clientId,
  crypto: cryptoLike = globalThis.crypto,
  exchangeCredential,
  googleTarget = window,
  loadScript = createGoogleIdentityServicesScriptLoader({
    document,
    target: googleTarget
  }),
  onStatusChange = () => {}
}) {
  const normalizedClientId = String(clientId || '').trim()
  if (
    !normalizedClientId
    || typeof exchangeCredential !== 'function'
    || typeof loadScript !== 'function'
    || typeof onStatusChange !== 'function'
  ) {
    throw new TypeError(
      'Google Identity Services requires a client ID and callbacks'
    )
  }

  const mounts = new Map()
  let destroyed = false
  let opportunity = null
  let opportunitySequence = 0
  let opportunityPromise = null
  let promptOpportunityId = null
  let promptAutoSelectEnabled = false

  function publish(status, details) {
    if (destroyed) return
    try { onStatusChange(status, details) } catch {}
  }

  function cancelPrompt() {
    const api = getGoogleIdentityApi(googleTarget)
    try { api?.cancel() } catch {}
    promptOpportunityId = null
  }

  function initializeOpportunity(api, candidate) {
    api.initialize({
      auto_select: candidate.autoSelect,
      callback(response) {
        return consumeCredential(candidate.id, response?.credential)
      },
      cancel_on_tap_outside: true,
      client_id: normalizedClientId,
      context: 'signin',
      nonce: candidate.hashedNonce,
      ux_mode: 'popup'
    })
  }

  async function ensureOpportunity({ autoSelect = false } = {}) {
    if (destroyed) return null
    const requestedAutoSelect = autoSelect === true || promptAutoSelectEnabled
    if (opportunity && !opportunity.consumed) {
      if (requestedAutoSelect && !opportunity.autoSelect) {
        cancelPrompt()
        opportunity.rawNonce = ''
        opportunity.hashedNonce = ''
        opportunity.consumed = true
        opportunity = null
        for (const mount of mounts.values()) {
          mount.renderedOpportunityId = null
        }
      } else {
        const api = await loadScript()
        if (destroyed) return null
        return { api, candidate: opportunity }
      }
    }
    if (opportunityPromise) {
      const ready = await opportunityPromise
      if (
        requestedAutoSelect
        && ready?.candidate
        && !ready.candidate.autoSelect
      ) return ensureOpportunity({ autoSelect: true })
      return ready
    }

    publish('loading')
    let failureStage = 'script'
    let initializedCandidate = null
    opportunityPromise = (async () => {
      const [apiResult, nonceResult] = await Promise.allSettled([
        loadScript(),
        createNonce(cryptoLike)
      ])
      if (apiResult.status === 'rejected') throw apiResult.reason
      if (nonceResult.status === 'rejected') {
        failureStage = 'nonce'
        throw nonceResult.reason
      }
      const api = apiResult.value
      const nonce = nonceResult.value
      if (destroyed) return null
      const candidate = {
        autoSelect: requestedAutoSelect,
        consumed: false,
        hashedNonce: nonce.hashed,
        id: ++opportunitySequence,
        rawNonce: nonce.raw
      }
      opportunity = candidate
      initializedCandidate = candidate
      failureStage = 'initialize'
      initializeOpportunity(api, candidate)
      publish('ready')
      return { api, candidate }
    })().catch(() => {
      if (initializedCandidate && opportunity === initializedCandidate) {
        initializedCandidate.rawNonce = ''
        initializedCandidate.hashedNonce = ''
        initializedCandidate.consumed = true
        opportunity = null
        for (const mount of mounts.values()) {
          mount.renderedOpportunityId = null
        }
      }
      if (!destroyed) publish('unavailable', { stage: failureStage })
      return null
    }).finally(() => {
      opportunityPromise = null
    })
    return opportunityPromise
  }

  function renderMount(api, candidate, element, options) {
    const mount = mounts.get(element)
    if (!mount || mount.renderedOpportunityId === candidate.id) return
    element.replaceChildren?.()
    api.renderButton(element, {
      locale: options.locale,
      logo_alignment: 'left',
      shape: 'rectangular',
      size: 'large',
      text: 'continue_with',
      theme: 'outline',
      type: 'standard',
      width: options.width
    })
    mount.renderedOpportunityId = candidate.id
  }

  async function renderAllMounts() {
    const ready = await ensureOpportunity()
    if (!ready || destroyed) return false
    for (const [element, mount] of mounts) {
      renderMount(ready.api, ready.candidate, element, mount.options)
    }
    return true
  }

  async function consumeCredential(opportunityId, credential) {
    const candidate = opportunity
    if (
      destroyed
      || !candidate
      || candidate.id !== opportunityId
      || candidate.consumed
      || typeof credential !== 'string'
      || !credential.trim()
    ) return false

    candidate.consumed = true
    cancelPrompt()
    publish('exchanging')
    let success = false
    try {
      success = await exchangeCredential({
        nonce: candidate.rawNonce,
        token: credential
      }) === true
    } catch {}
    candidate.rawNonce = ''
    candidate.hashedNonce = ''
    if (opportunity === candidate) opportunity = null
    if (destroyed) return success
    publish(success ? 'complete' : 'error')
    if (!success) await renderAllMounts()
    return success
  }

  async function mountButton(element, options = {}) {
    if (!element || typeof element !== 'object') return false
    const normalizedOptions = normalizeButtonOptions(options)
    const existing = mounts.get(element)
    const optionsUnchanged = existing
      && existing.options.locale === normalizedOptions.locale
      && existing.options.width === normalizedOptions.width
    mounts.set(element, {
      options: normalizedOptions,
      renderedOpportunityId: optionsUnchanged
        ? existing.renderedOpportunityId
        : null
    })
    const ready = await ensureOpportunity()
    if (!ready || destroyed || !mounts.has(element)) return false
    renderMount(ready.api, ready.candidate, element, normalizedOptions)
    return true
  }

  async function synchronizePrompt({ eligible, autoSelect = false } = {}) {
    if (!eligible) {
      promptAutoSelectEnabled = false
      cancelPrompt()
      return false
    }
    promptAutoSelectEnabled = autoSelect === true
    const ready = await ensureOpportunity({ autoSelect })
    if (!ready || destroyed) return false
    for (const [element, mount] of mounts) {
      renderMount(ready.api, ready.candidate, element, mount.options)
    }
    if (promptOpportunityId === ready.candidate.id) return true
    promptOpportunityId = ready.candidate.id
    try {
      ready.api.prompt()
      return true
    } catch {
      promptOpportunityId = null
      publish('error')
      return false
    }
  }

  function prepareForExplicitSignOut() {
    promptAutoSelectEnabled = false
    cancelPrompt()
    const api = getGoogleIdentityApi(googleTarget)
    try { api?.disableAutoSelect() } catch {}
    if (opportunity) {
      opportunity.rawNonce = ''
      opportunity.hashedNonce = ''
      opportunity.consumed = true
      opportunity = null
    }
  }

  function destroy() {
    if (destroyed) return
    prepareForExplicitSignOut()
    destroyed = true
    mounts.clear()
    opportunitySequence += 1
  }

  return Object.freeze({
    destroy,
    mountButton,
    prepareForExplicitSignOut,
    synchronizePrompt
  })
}
