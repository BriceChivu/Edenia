import {
  getReminderUnsubscribeApiUrl,
  getReminderUnsubscribeCopy,
  parseReminderUnsubscribeLocation,
  submitReminderUnsubscribe,
} from './integrations/reminder-unsubscribe-page.js'

const root = document.querySelector('[data-reminder-unsubscribe-root]')
const title = root?.querySelector('[data-reminder-unsubscribe-title]')
const body = root?.querySelector('[data-reminder-unsubscribe-body]')
const form = root?.querySelector('[data-reminder-unsubscribe-form]')
const button = root?.querySelector('[data-reminder-unsubscribe-submit]')
const feedback = root?.querySelector('[data-reminder-unsubscribe-feedback]')
const back = root?.querySelector('[data-reminder-unsubscribe-back]')

function setPageCopy(copy, titleValue, bodyValue) {
  document.title = `${titleValue} · Edenia`
  title.textContent = titleValue
  body.textContent = bodyValue
  back.textContent = copy.back
}

function redactCapability(locale) {
  const nextUrl = new URL(window.location.href)
  nextUrl.search = ''
  nextUrl.searchParams.set('lang', locale)
  nextUrl.hash = ''
  window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}`)
}

if (root && title && body && form && button && feedback && back) {
  const link = parseReminderUnsubscribeLocation(window.location)
  const copy = getReminderUnsubscribeCopy(link.locale)
  document.documentElement.lang = link.locale
  redactCapability(link.locale)

  if (!link.valid) {
    setPageCopy(copy, copy.invalidTitle, copy.invalidBody)
  } else {
    const endpointUrl = getReminderUnsubscribeApiUrl(window)
    if (!endpointUrl) {
      setPageCopy(copy, copy.confirmTitle, copy.confirmBody)
      feedback.textContent = copy.unavailable
    } else {
      setPageCopy(copy, copy.confirmTitle, copy.confirmBody)
      button.textContent = copy.confirmButton
      form.hidden = false

      form.addEventListener('submit', async event => {
        event.preventDefault()
        button.disabled = true
        button.textContent = copy.submitting
        form.setAttribute('aria-busy', 'true')
        feedback.textContent = ''

        const result = await submitReminderUnsubscribe({
          fetchImpl: window.fetch.bind(window),
          endpointUrl,
          token: link.token,
          locale: link.locale,
        })
        form.removeAttribute('aria-busy')

        if (result === 'unsubscribed') {
          form.hidden = true
          setPageCopy(copy, copy.successTitle, copy.successBody)
          return
        }
        if (result === 'already_unsubscribed') {
          form.hidden = true
          setPageCopy(copy, copy.alreadyTitle, copy.alreadyBody)
          return
        }
        if (result === 'invalid') {
          form.hidden = true
          setPageCopy(copy, copy.invalidTitle, copy.invalidBody)
          return
        }

        button.disabled = false
        button.textContent = copy.retryButton
        feedback.textContent = copy.unavailable
      })
    }
  }
}
