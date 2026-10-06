export function deriveRuntimeEnvironment(locationLike) {
  const urlParams = new URLSearchParams(locationLike.search)
  const internalTestMode = ['1', '2'].includes(urlParams.get('internal_test'))
    ? urlParams.get('internal_test') : null
  const isLegacyMigrationTest = locationLike.origin === 'http://localhost:8000'
    && locationLike.pathname === '/'
    && locationLike.hash === ''
    && locationLike.search === '?legacy_migration_test=1'
  return {
    isSandbox: locationLike.origin === 'http://localhost:8001'
      && urlParams.get('sandbox') === '1',
    isInternalTest: urlParams.get('internal_test') === '1',
    internalTestMode,
    isTinySwordsTester: internalTestMode === '2',
    isLocalhost: ['localhost', '127.0.0.1', '::1'].includes(
      locationLike.hostname
    ),
    isLocalFeedbackTest: locationLike.origin === 'http://localhost:8000',
    isLegacyMigrationTest
  }
}

// The localhost preview remains an explicit developer environment. Mode 2
// selects the new page even while mounting is disabled, retaining tester data.
export function deriveTinySwordsExperience(locationLike) {
  const environment = deriveRuntimeEnvironment(locationLike)
  return !environment.isSandbox && (environment.isTinySwordsTester
    || (environment.isLocalhost && locationLike.port === '8037'
      && environment.internalTestMode === null
      && !new URLSearchParams(locationLike.search).has('internal_test')))
}

export function deriveTinySwordsEnabled(locationLike, config) {
  return deriveTinySwordsExperience(locationLike) && config?.tinySwordsEnabled === true
}

export function deriveLearnerProfileAccessVisualTest(locationLike) {
  const urlParams = new URLSearchParams(locationLike.search)
  const profileAccessTest = urlParams.getAll('profile_access_test')
  if (
    !['localhost', '127.0.0.1', '::1'].includes(locationLike.hostname)
    || urlParams.getAll('internal_test').length !== 1
    || urlParams.get('internal_test') !== '1'
    || profileAccessTest.length !== 1
    || profileAccessTest[0] !== 'recovering'
  ) return null
  return 'recovering'
}

export function deriveStudyGuidanceEnabled(
  runtimeEnvironment,
  releaseEnabled = false
) {
  return runtimeEnvironment?.isInternalTest === true || releaseEnabled === true
}
