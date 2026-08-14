export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

const TURNSTILE_SCRIPT_ID = 'edenia-cloudflare-turnstile'
const TURNSTILE_TOKEN_LIFETIME_MS = 300_000
const TURNSTILE_TOKEN_MAX_LENGTH = 2048

function getTurnstileApi(target) {
  const api = target?.turnstile
  if (
    typeof api?.render !== 'function'
    || typeof api?.reset !== 'function'
    || typeof api?.remove !== 'function'
  ) return null
  return api
}

export function createTurnstileScriptLoader({
  document: documentLike = document,
  target = window
} = {}) {
  let scriptPromise = null

  return function loadTurnstileScript() {
    const existingApi = getTurnstileApi(target)
    if (existingApi) return Promise.resolve(existingApi)
    if (scriptPromise) return scriptPromise
    if (!documentLike?.createElement || !documentLike?.head?.appendChild) {
      return Promise.reject(new Error('Turnstile is unavailable'))
    }

    scriptPromise = new Promise((resolve, reject) => {
      const existingScript = documentLike.getElementById?.(
        TURNSTILE_SCRIPT_ID
      )
      const script = existingScript || documentLike.createElement('script')
      const handleLoad = () => {
        const api = getTurnstileApi(target)
        if (api) resolve(api)
        else reject(new Error('Turnstile is unavailable'))
      }
      const handleError = () => reject(new Error('Turnstile is unavailable'))
      script.addEventListener?.('load', handleLoad, { once: true })
      script.addEventListener?.('error', handleError, { once: true })
      if (!existingScript) {
        script.id = TURNSTILE_SCRIPT_ID
        script.src = TURNSTILE_SCRIPT_URL
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

function normalizeOptions(options = {}) {
  const language = String(options.language || 'auto').trim() || 'auto'
  const theme = ['light', 'dark', 'auto'].includes(options.theme)
    ? options.theme
    : 'auto'
  return Object.freeze({ language, theme })
}

export function createTurnstileController({
  loadScript = createTurnstileScriptLoader({ document, target: window }),
  now = () => Date.now(),
  onStatusChange = () => {},
  siteKey,
  turnstileTarget = window
}) {
  const normalizedSiteKey = String(siteKey || '').trim()
  if (
    !normalizedSiteKey
    || typeof loadScript !== 'function'
    || typeof now !== 'function'
    || typeof onStatusChange !== 'function'
  ) {
    throw new TypeError('Turnstile requires a site key and callbacks')
  }

  const mounts = new Map()
  let destroyed = false

  function publish(status, element) {
    if (destroyed) return
    try { onStatusChange(status, element) } catch {}
  }

  function clearToken(record) {
    if (!record) return
    record.token = ''
    record.tokenIssuedAt = 0
  }

  function removeDisconnectedMounts(api) {
    for (const [element, record] of mounts) {
      if (element.isConnected !== false) continue
      try { api.remove(record.widgetId) } catch {}
      mounts.delete(element)
    }
  }

  async function mount(element, options = {}) {
    if (!element || typeof element !== 'object' || destroyed) return false
    const normalizedOptions = normalizeOptions(options)
    const existing = mounts.get(element)
    if (
      existing
      && existing.options.language === normalizedOptions.language
      && existing.options.theme === normalizedOptions.theme
    ) return true

    publish('loading', element)
    let api
    try {
      api = await loadScript()
    } catch {
      publish('unavailable', element)
      return false
    }
    if (destroyed) return false
    removeDisconnectedMounts(api)
    if (existing) {
      try { api.remove(existing.widgetId) } catch {}
      mounts.delete(element)
    }

    const record = {
      options: normalizedOptions,
      token: '',
      tokenIssuedAt: 0,
      widgetId: null
    }
    let widgetId
    try {
      widgetId = api.render(element, {
        appearance: 'interaction-only',
        callback(token) {
          if (destroyed || mounts.get(element) !== record) return
          const normalizedToken = String(token || '').trim()
          if (
            !normalizedToken
            || normalizedToken.length > TURNSTILE_TOKEN_MAX_LENGTH
          ) {
            clearToken(record)
            publish('error', element)
            return
          }
          record.token = normalizedToken
          record.tokenIssuedAt = now()
          publish('ready', element)
        },
        'error-callback'() {
          clearToken(record)
          publish('error', element)
        },
        'expired-callback'() {
          clearToken(record)
          publish('expired', element)
        },
        language: normalizedOptions.language,
        'response-field': false,
        sitekey: normalizedSiteKey,
        size: 'flexible',
        theme: normalizedOptions.theme,
        'timeout-callback'() {
          clearToken(record)
          publish('expired', element)
        },
        'unsupported-callback'() {
          clearToken(record)
          publish('unavailable', element)
        }
      })
    } catch {
      publish('unavailable', element)
      return false
    }
    record.widgetId = widgetId
    mounts.set(element, record)
    publish('pending', element)
    return true
  }

  function consumeToken(element) {
    const record = mounts.get(element)
    if (!record?.token) return null
    const token = record.token
    const tokenAge = now() - record.tokenIssuedAt
    const valid = token.length <= TURNSTILE_TOKEN_MAX_LENGTH
      && tokenAge >= 0
      && tokenAge < TURNSTILE_TOKEN_LIFETIME_MS
    clearToken(record)
    if (!valid) {
      reset(element)
      return null
    }
    publish('consumed', element)
    return token
  }

  function reset(element) {
    const record = mounts.get(element)
    if (!record) return false
    clearToken(record)
    const api = getTurnstileApi(turnstileTarget)
    try {
      api?.reset(record.widgetId)
      publish('pending', element)
      return Boolean(api)
    } catch {
      publish('error', element)
      return false
    }
  }

  function destroy() {
    if (destroyed) return
    const api = getTurnstileApi(turnstileTarget)
    for (const record of mounts.values()) {
      clearToken(record)
      try { api?.remove(record.widgetId) } catch {}
    }
    mounts.clear()
    destroyed = true
  }

  return Object.freeze({
    consumeToken,
    destroy,
    mount,
    reset
  })
}
