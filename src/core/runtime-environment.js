export function deriveRuntimeEnvironment(locationLike) {
  const urlParams = new URLSearchParams(locationLike.search)
  const internalTestMode = urlParams.get('internal_test') === '2'
    ? urlParams.get('internal_test') : null
  const isLegacyMigrationTest = locationLike.origin === 'http://localhost:8000'
    && locationLike.pathname === '/'
    && locationLike.hash === ''
    && locationLike.search === '?legacy_migration_test=1'
  return {
    isSandbox: locationLike.origin === 'http://localhost:8001'
      && urlParams.get('sandbox') === '1',
    internalTestMode,
    isTinySwordsTester: internalTestMode === '2',
    isLocalhost: ['localhost', '127.0.0.1', '::1'].includes(
      locationLike.hostname
    ),
    isLocalFeedbackTest: locationLike.origin === 'http://localhost:8000',
    isLegacyMigrationTest
  }
}

// Page selection and engine availability are separate. Disabling the engine
// must retain the island dashboard and its profile semantics after release.
export function deriveTinySwordsExperience(locationLike, publicEnabled = false) {
  const environment = deriveRuntimeEnvironment(locationLike)
  return !environment.isSandbox && (publicEnabled === true || environment.isTinySwordsTester
    || (environment.isLocalhost && locationLike.port === '8037'
      && environment.internalTestMode === null
      && !new URLSearchParams(locationLike.search).has('internal_test')))
}

export function deriveTinySwordsEnabled(locationLike, config) {
  return deriveTinySwordsExperience(locationLike, config?.tinySwordsPublicEnabled) && config?.tinySwordsEnabled === true
}

export function deriveLearnerProfileAccessVisualTest(locationLike) {
  const urlParams = new URLSearchParams(locationLike.search)
  const profileAccessTest = urlParams.getAll('profile_access_test')
  if (
    !['localhost', '127.0.0.1', '::1'].includes(locationLike.hostname)
    || profileAccessTest.length !== 1
    || profileAccessTest[0] !== 'recovering'
  ) return null
  return 'recovering'
}

export function deriveStudyGuidanceEnabled(
  releaseEnabled = false
) {
  return releaseEnabled === true
}
