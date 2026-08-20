const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function readResolutionRow(data) {
  if (Array.isArray(data) && data.length !== 1) return null
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null
}

function normalizePositiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

export function createLearnerProfileCloudPersistenceAdapter({
  clearOnboardingDraft,
  createOnboardingEnvelope,
  getClient,
  importEnvelope,
  readOnboardingState,
  verifyEnvelope
}) {
  if (
    typeof clearOnboardingDraft !== 'function'
    || typeof createOnboardingEnvelope !== 'function'
    || typeof getClient !== 'function'
    || typeof importEnvelope !== 'function'
    || typeof readOnboardingState !== 'function'
    || typeof verifyEnvelope !== 'function'
  ) {
    throw new TypeError('Learner-profile cloud persistence requires adapters')
  }

  async function resolve({ authentication, connectivity, localProfile, purpose }) {
    if (connectivity?.status !== 'online') {
      return { status: 'waiting-cloud' }
    }
    if (purpose === 'link-accountless-profile') {
      return { status: 'migrating' }
    }

    let onboardingEnvelope = null
    if (localProfile?.status === 'empty') {
      const onboardingState = readOnboardingState()
      if (onboardingState) {
        onboardingEnvelope = await createOnboardingEnvelope(onboardingState)
      }
    }

    const { data, error } = await getClient().rpc(
      'resolve_my_learner_profile',
      { p_onboarding_profile: onboardingEnvelope }
    )
    if (error) return { status: 'recovering' }

    const row = readResolutionRow(data)
    if (!row) return { status: 'recovering' }
    if (row.status === 'access_disabled') return { status: 'locked' }
    if (row.status === 'onboarding_required') {
      return { status: 'waiting-authentication' }
    }
    if (row.status === 'recovery_required') return { status: 'recovering' }
    if (row.status === 'verified_account_required') {
      return { status: 'waiting-authentication' }
    }
    if (row.status !== 'profile_ready') return { status: 'recovering' }
    if (typeof row.created !== 'boolean') return { status: 'recovering' }

    const profileId = String(row.profile_id || '')
    const generation = normalizePositiveInteger(row.generation)
    const revision = normalizePositiveInteger(row.revision)
    if (!UUID_PATTERN.test(profileId) || !generation || !revision) {
      return { status: 'recovering' }
    }
    if (row.created && (generation !== 1 || revision !== 1)) {
      return { status: 'recovering' }
    }
    const envelope = await verifyEnvelope(row.envelope)
    const profile = envelope ? importEnvelope(envelope) : null
    if (!profile) return { status: 'recovering' }

    return {
      created: row.created === true,
      finalize() {
        return row.created === true ? clearOnboardingDraft() : true
      },
      generation,
      ownerId: authentication.userId,
      profile,
      profileId,
      revision,
      status: 'activate'
    }
  }

  return Object.freeze({
    resolve,
    save: async () => ({ status: 'waiting' })
  })
}
