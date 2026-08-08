export function deriveRuntimeEnvironment(locationLike) {
  const urlParams = new URLSearchParams(locationLike.search)
  return {
    isSandbox: locationLike.origin === 'http://localhost:8001'
      && urlParams.get('sandbox') === '1',
    isInternalTest: urlParams.get('internal_test') === '1',
    isLocalhost: ['localhost', '127.0.0.1', '::1'].includes(
      locationLike.hostname
    ),
    isLocalFeedbackTest: locationLike.origin === 'http://localhost:8000'
  }
}

export function deriveVideoOrganizationEnabled(
  runtimeEnvironment,
  releaseEnabled = false
) {
  return runtimeEnvironment?.isInternalTest === true || releaseEnabled === true
}

export function deriveChannelVideoFormatToggleEnabled(
  runtimeEnvironment,
  releaseEnabled = false
) {
  return runtimeEnvironment?.isInternalTest === true || releaseEnabled === true
}

export function deriveStudyGuidanceEnabled(
  runtimeEnvironment,
  releaseEnabled = false
) {
  return runtimeEnvironment?.isInternalTest === true || releaseEnabled === true
}
