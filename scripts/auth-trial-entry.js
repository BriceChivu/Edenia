import { deriveTinySwordsEnabled } from '../src/core/runtime-environment.js'
import { getAuthTrialEnabled } from '../src/integrations/runtime-config.js'
import { getBrowserDefaultLocale, setCurrentLocale, t } from '../src/i18n/runtime.js'

// A disabled trial never initializes profile storage or Auth, even with a
// retained owned profile. Re-enabling opens those bytes through the lifecycle.
if (getAuthTrialEnabled()) {
  window.edeniaTinySwordsEnabled = deriveTinySwordsEnabled(window.location, window.EDENIA_CONFIG)
  const appUrl = document.currentScript.src.replace('auth-trial-entry.js', 'app.js')
  const parent = document.createElement('script')
  parent.src = document.currentScript.dataset.gameParent
  // Install ownership listeners before the app can park its inactive UI. No
  // iframe is created until the lifecycle supplies an active profile.
  parent.addEventListener('load', () => {
    const script = document.createElement('script')
    script.src = appUrl
    document.head.append(script)
  }, { once: true })
  document.head.append(parent)
} else {
  setCurrentLocale(getBrowserDefaultLocale())
  document.documentElement.lang = getBrowserDefaultLocale()
  const main = document.createElement('main')
  main.id = 'authTrialUnavailable'
  main.className = 'profile-access-gate'
  main.style.cssText = 'max-width:36rem;margin:15vh auto;padding:2rem;text-align:center'
  const title = document.createElement('h1')
  title.textContent = t('authTrial.unavailable.title')
  const message = document.createElement('p')
  message.textContent = t('authTrial.unavailable.body')
  main.append(title, message)
  document.body.replaceChildren(main)
}
