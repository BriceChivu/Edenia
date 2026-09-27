import { deriveStorageKeys } from '../../core/storage-keys.js'

// Read only ownership bookkeeping. Never open or normalize the retained profile
// while authentication is unavailable. Ambiguous metadata stays recoverable.
export function shouldHoldPausedInternalProfile({
  location, accountFeaturesEnabled, readStorage
}) {
  if (new URLSearchParams(location.search).get('internal_test') !== '1'
    || accountFeaturesEnabled) return false
  const keys = deriveStorageKeys({ isSandbox: false, isInternalTest: true })
  try {
    for (const key of [keys.accountAuthStorageKey,
      keys.accountStudySyncOwnerKey, keys.learnerProfileOwnerVerificationKey,
      keys.learnerProfileSyncKey, keys.accountlessProfileMigrationKey]) {
      if (readStorage(key) !== null) return true
    }
    const raw = readStorage(keys.learnerProfileAccessKey)
    if (raw === null) return false
    const record = JSON.parse(raw)
    return !(record?.version === 1
      && record.ownerId === null
      && record.profileId === `accountless:${keys.storageKey}`
      && record.replacement === undefined)
  } catch {
    return true
  }
}

export function showPausedInternalProfile(document) {
  const show = () => {
    const main = document.createElement('main')
    main.id = 'internalAuthPaused'
    main.className = 'app-container'
    const heading = document.createElement('h1')
    heading.textContent = 'Authentication testing is paused'
    const explanation = document.createElement('p')
    explanation.textContent = 'Your saved internal profile is preserved on this browser. It will not be opened or changed while authentication is paused.'
    const instruction = document.createElement('p')
    instruction.textContent = 'To try the internal town, open this address in a separate browser profile. Keep this browser’s saved data for recovery when authentication testing resumes.'
    const link = document.createElement('a')
    link.href = '/'
    link.textContent = 'Open public Edenia'
    main.append(heading, explanation, instruction, link)
    document.body.replaceChildren(main)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show, { once: true })
  } else show()
}
