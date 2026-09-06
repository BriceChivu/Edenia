import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import {
  normalizeAssetVersion,
  normalizeReleaseCommit,
  sha256Hex,
  validateReleaseManifest
} from './release-manifest.mjs'

export const RELEASE_READINESS_SCHEMA_VERSION = 1
export const REQUIRED_BROWSER_TARGETS = Object.freeze([
  'macos-chrome',
  'macos-safari',
  'fresh-chrome-isolated-context',
  'private-browsing'
])
export const OPTIONAL_BROWSER_TARGETS = Object.freeze([
  'ios-safari',
  'fresh-chrome-paired-device'
])
export const BROWSER_TARGETS = Object.freeze([
  ...REQUIRED_BROWSER_TARGETS,
  ...OPTIONAL_BROWSER_TARGETS
])
// Only this absence-of-coverage statement is non-blocking. Defects and every
// other confidence gap retain their existing blocking semantics.
export const OPTIONAL_DEVICE_CONFIDENCE_GAP =
  'Optional iPhone Safari and separate physical-device coverage was not performed.'

const OPERATOR_TARGET = 'operator-cli'
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/u
const VERSION_PATTERN = /^\d+(?:\.\d+){0,4}$/u
const BASE_URL_PROTOCOLS = new Set(['http:', 'https:'])
const RESULT_VALUES = new Set(['pass', 'fail', 'blocked'])
const EVIDENCE_SOURCE_VALUES = new Set([
  'live-browser-canary',
  'deployed-schema-canary',
  'release-inspector'
])
const CANARY_SURFACES = new Set([
  'artifact',
  'runtime-config',
  'auth-provider',
  'database',
  'operations',
  'gate-state'
])
const PRODUCT_OWNER_APPROVAL_VALUES = new Set([
  'requested',
  'approved',
  'rejected'
])
const RUNTIME_ROLLOUT_VALUES = new Set(['off', 'internal', 'public'])
const PROFILE_DATA_GATE_VALUES = new Set([
  'unknown',
  'off',
  'developer-canary',
  'signed-in-public'
])

const SAFE_METADATA_KEYS = new Set([
  'accountlessProfilesMarkedLegacy',
  'affectedScenariosRerun',
  'aggregateRecordCount',
  'alertAction',
  'authAlert',
  'authMonitorCanary',
  'boundedCanaryDuringSoak',
  'capacityEvidence',
  'byteCount',
  'cloudConflict',
  'conflictChoice',
  'corruptWrite',
  'directWrite',
  'duplicateOperation',
  'emailDeliveryCount',
  'evidenceEnvironment',
  'privateBrowsingApplicability',
  'privateBrowsingNotApplicableReason',
  'externalBackup',
  'externalAuthMonitor',
  'externalCheckCount',
  'exactRestore',
  'failureCases',
  'finalGate',
  'generationAdvanced',
  'generationFence',
  'generation',
  'grants',
  'identityMatch',
  'identityValueRecorded',
  'importOutcome',
  'inheritedSession',
  'largestAggregateGapSeconds',
  'largestExternalGapSeconds',
  'monitoringWindowEndUtc',
  'monitoringWindowStartUtc',
  'networkErrorCount',
  'otpOutcome',
  'ownershipLeak',
  'offlineDays',
  'operatorNotification',
  'preservedRevision',
  'profileCount',
  'payloadBytes',
  'payloadSha256',
  'progressLoss',
  'protectedVersion',
  'provider',
  'providerOutcome',
  'providerPair',
  'providerUnavailableCount',
  'negativeCases',
  'recoveryOutcome',
  'rejectedWriteCount',
  'remainingHeadCount',
  'remainingVersionCount',
  'restoreOutcome',
  'retainedVersionCount',
  'revision',
  'recordCount',
  'rollbackOutcome',
  'rollbackTriggers',
  'rlsIsolation',
  'serverOperation',
  'staleWatchdog',
  'staleWrite',
  'syncOrder',
  'switchOff',
  'sourceUnchangedOnFailure',
  'displacedVersionProtected',
  'lifecycleSubflows',
  'migrationVoluntary',
  'firstBackupFailure',
  'rerunPlanValidated',
  'turnstileOutcome',
  'undoOutcome',
  'unsafeOperatorAccess',
  'weeklyRestore',
  'exportOutcome'
])

const SCENARIO_DEPENDENCIES = Object.freeze({
  'deployment-identity': ['artifact', 'runtime-config'],
  'browser-matrix': ['artifact', 'runtime-config'],
  'auth-google': ['artifact', 'runtime-config', 'auth-provider'],
  'auth-email-otp-turnstile': ['artifact', 'runtime-config', 'auth-provider'],
  'auth-method-equivalence': ['artifact', 'runtime-config', 'auth-provider'],
  'profile-lifecycle': ['artifact', 'runtime-config', 'database'],
  'profile-sync-conflict': ['artifact', 'runtime-config', 'database'],
  'profile-failure-preservation': ['artifact', 'runtime-config', 'database'],
  'profile-portability': ['artifact', 'runtime-config', 'database'],
  'profile-recovery': ['artifact', 'runtime-config', 'database'],
  'profile-start-over-undo': ['artifact', 'runtime-config', 'database'],
  'database-security': ['database'],
  'database-fences-idempotency': ['database'],
  'backup-retention-restore': ['database', 'operations'],
  'legacy-final-gate': ['artifact', 'runtime-config', 'database'],
  'emergency-rollback': ['artifact', 'runtime-config', 'database', 'operations'],
  'operations-monitoring': ['artifact', 'runtime-config', 'database', 'operations'],
  'switch-off-and-rerun': ['artifact', 'runtime-config', 'operations']
})

const REQUIRED_PROFILE_DATA_GATE_BY_SCENARIO = Object.freeze({
  'profile-lifecycle': 'developer-canary',
  'profile-sync-conflict': 'developer-canary',
  'profile-failure-preservation': 'developer-canary',
  'profile-portability': 'developer-canary',
  'profile-recovery': 'developer-canary',
  'profile-start-over-undo': 'developer-canary',
  'legacy-final-gate': 'developer-canary',
  'operations-monitoring': 'off',
  'switch-off-and-rerun': 'off'
})

export const REQUIRED_SCENARIOS = Object.freeze([
  ...Object.entries(SCENARIO_DEPENDENCIES).map(([id, dependencies]) => ({
    id,
    requiredBrowserTargets: id === 'browser-matrix' ? REQUIRED_BROWSER_TARGETS : [],
    dependencies: [...dependencies, 'gate-state']
  }))
])

const SCENARIO_METADATA_REQUIREMENTS = Object.freeze({
  'browser-matrix': {
    evidenceEnvironment: 'deployed-browser'
  },
  'auth-google': {
    evidenceEnvironment: 'deployed-browser',
    provider: 'google',
    providerOutcome: 'accepted'
  },
  'auth-email-otp-turnstile': {
    evidenceEnvironment: 'deployed-browser',
    provider: 'email',
    providerOutcome: 'accepted',
    turnstileOutcome: 'accepted',
    otpOutcome: 'verified',
    negativeCases: 'missing-expired-replay-invalid-zero-delivery',
    emailDeliveryCount: 1
  },
  'auth-method-equivalence': {
    evidenceEnvironment: 'deployed-browser',
    providerPair: 'google-email',
    identityMatch: 'same_uuid',
    identityValueRecorded: false
  },
  'profile-lifecycle': {
    evidenceEnvironment: 'deployed-browser',
    progressLoss: false,
    ownershipLeak: false,
    offlineDays: 30,
    profileCount: 1,
    lifecycleSubflows: 'new-returning-reload-offline30-signout-shared-browser-isolation'
  },
  'profile-sync-conflict': {
    evidenceEnvironment: 'deployed-browser',
    progressLoss: false,
    conflictChoice: 'explicit',
    syncOrder: 'sequential'
  },
  'profile-failure-preservation': {
    evidenceEnvironment: 'deployed-browser',
    progressLoss: false,
    failureCases: 'backup-oversize-corrupt-rejected-retry'
  },
  'profile-portability': {
    evidenceEnvironment: 'deployed-browser',
    importOutcome: 'accepted',
    exportOutcome: 'verified',
    displacedVersionProtected: true,
    sourceUnchangedOnFailure: true
  },
  'profile-recovery': {
    evidenceEnvironment: 'deployed-browser',
    recoveryOutcome: 'accepted',
    protectedVersion: true,
    progressLoss: false
  },
  'profile-start-over-undo': {
    evidenceEnvironment: 'deployed-browser',
    undoOutcome: 'accepted',
    generationAdvanced: true,
    progressLoss: false
  },
  'database-security': {
    evidenceEnvironment: 'deployed-database',
    directWrite: 'denied',
    rlsIsolation: 'verified',
    unsafeOperatorAccess: 'denied',
    grants: 'verified'
  },
  'database-fences-idempotency': {
    evidenceEnvironment: 'deployed-database',
    staleWrite: 'denied',
    corruptWrite: 'denied',
    duplicateOperation: 'idempotent',
    generationFence: 'verified'
  },
  'backup-retention-restore': {
    evidenceEnvironment: 'deployed-database',
    restoreOutcome: 'exact',
    externalBackup: 'verified',
    exactRestore: 'verified',
    retainedVersionCount: 8,
    capacityEvidence: 'fresh'
  },
  'legacy-final-gate': {
    evidenceEnvironment: 'deployed-browser',
    finalGate: 'verified',
    inheritedSession: 'confirmed',
    cloudConflict: 'explicit-choice',
    migrationVoluntary: true,
    firstBackupFailure: 'preserved-retry'
  },
  'emergency-rollback': {
    evidenceEnvironment: 'deployed-database',
    rollbackOutcome: 'verified',
    accountlessProfilesMarkedLegacy: true
  },
  'operations-monitoring': {
    evidenceEnvironment: 'deployed-database',
    authAlert: 'actionable',
    externalAuthMonitor: 'five-minute-no-gap-over-ten',
    operatorNotification: 'down-and-up-received',
    authMonitorCanary: 'provider-failure-and-recovery',
    staleWatchdog: 'verified',
    weeklyRestore: 'verified',
    capacityEvidence: 'fresh',
    boundedCanaryDuringSoak: 'disabled',
    providerUnavailableCount: 0,
    networkErrorCount: 0
  },
  'switch-off-and-rerun': {
    evidenceEnvironment: 'deployed-browser',
    switchOff: 'verified',
    rollbackTriggers: 'documented',
    affectedScenariosRerun: true,
    rerunPlanValidated: true
  }
})

const PRIVATE_BROWSING_APPLICABILITY_KEY = 'privateBrowsingApplicability'

function requiredScenario(scenarioId) {
  return REQUIRED_SCENARIOS.find(scenario => scenario.id === scenarioId)
}

function normalizeBaseUrl(value) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('Deployment URL must be an absolute HTTP(S) URL')
  }
  if (!BASE_URL_PROTOCOLS.has(url.protocol) || url.username || url.password) {
    throw new Error('Deployment URL must be an absolute HTTP(S) URL without credentials')
  }
  url.search = ''
  url.hash = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}

function normalizeUtcTimestamp(value, label = 'Observed time') {
  const timestamp = String(value || '').trim()
  const parsedTimestamp = Date.parse(timestamp)
  if (
    !UTC_TIMESTAMP_PATTERN.test(timestamp)
    || !Number.isFinite(parsedTimestamp)
    || new Date(parsedTimestamp).toISOString() !== timestamp
  ) {
    throw new Error(`${label} must be an ISO timestamp in UTC`)
  }
  return timestamp
}

function normalizeGateState(gateState = {}) {
  const allowedKeys = new Set([
    'accountFeaturesRollout',
    'learnerProfileLifecycleEnabled',
    'emergencyAccountlessRollbackEnabled',
    'legacyProgressMigrationEnabled',
    'profileDataGate'
  ])
  for (const key of Object.keys(gateState || {})) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown gate state field: ${key}`)
  }
  const normalized = {
    accountFeaturesRollout: String(gateState.accountFeaturesRollout || '').trim(),
    learnerProfileLifecycleEnabled: gateState.learnerProfileLifecycleEnabled,
    emergencyAccountlessRollbackEnabled: gateState.emergencyAccountlessRollbackEnabled,
    legacyProgressMigrationEnabled: gateState.legacyProgressMigrationEnabled,
    profileDataGate: String(gateState.profileDataGate || '').trim()
  }
  if (!RUNTIME_ROLLOUT_VALUES.has(normalized.accountFeaturesRollout)) {
    throw new Error('Account rollout gate is invalid')
  }
  for (const [key, value] of Object.entries(normalized)) {
    if (key === 'accountFeaturesRollout' || key === 'profileDataGate') continue
    if (typeof value !== 'boolean') throw new Error(`${key} gate must be boolean`)
  }
  if (!PROFILE_DATA_GATE_VALUES.has(normalized.profileDataGate)) {
    throw new Error('Profile-data gate is invalid')
  }
  return normalized
}

function assertSafeText(value, label) {
  if (typeof value !== 'string' || value.length > 280) {
    throw new Error(`${label} must be a bounded string`)
  }
  if (
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u.test(value)
    || /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/iu.test(value)
    || /(?:bearer\s+|sk_(?:live|test)_|service_role|eyJ[A-Za-z0-9_-]+\.)/iu.test(value)
  ) {
    throw new Error(`${label} contains sensitive evidence`)
  }
}

function assertVersionText(value, label) {
  assertSafeText(value, label)
  if (!VERSION_PATTERN.test(value)) throw new Error(`${label} must be a numeric version`)
}

function assertSafeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Evidence metadata must be an object')
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) {
      throw new Error(`Sensitive evidence field or unsupported field: ${key}`)
    }
    if (
      typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'boolean'
    ) {
      throw new Error(`Evidence metadata ${key} must be scalar`)
    }
    if (typeof value === 'string') assertSafeText(value, `Evidence metadata ${key}`)
    if (key === 'payloadSha256' && !HEX_SHA256_PATTERN.test(value)) {
      throw new Error(`Evidence metadata ${key} must be a SHA-256 hex digest`)
    }
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`Evidence metadata ${key} must be a non-negative integer`)
    }
  }
}

function normalizeCanarySurfaces(changedSurfaces = []) {
  if (!Array.isArray(changedSurfaces)) throw new Error('Changed canary surfaces must be an array')
  const surfaces = [...new Set(changedSurfaces)]
  for (const surface of surfaces) {
    if (!CANARY_SURFACES.has(surface)) throw new Error(`Unknown canary surface: ${surface}`)
  }
  return surfaces
}

function validateEvidenceSource(scenarioId, browserTarget, evidenceSource) {
  if (!EVIDENCE_SOURCE_VALUES.has(evidenceSource)) {
    throw new Error(`Evidence source is invalid for ${scenarioId}`)
  }
  const expectedEnvironment = SCENARIO_METADATA_REQUIREMENTS[scenarioId]?.evidenceEnvironment
  if (expectedEnvironment === 'deployed-browser' && browserTarget === OPERATOR_TARGET) {
    throw new Error(`${scenarioId} requires a deployed browser canary`)
  }
  if (expectedEnvironment === 'deployed-database' && browserTarget !== OPERATOR_TARGET) {
    throw new Error(`${scenarioId} requires a deployed schema canary`)
  }
  if (expectedEnvironment === 'deployed-browser' && evidenceSource !== 'live-browser-canary') {
    throw new Error(`${scenarioId} requires live browser evidence`)
  }
  if (expectedEnvironment === 'deployed-database' && evidenceSource !== 'deployed-schema-canary') {
    throw new Error(`${scenarioId} requires deployed schema evidence`)
  }
  if (!expectedEnvironment && scenarioId === 'deployment-identity' && evidenceSource !== 'release-inspector') {
    throw new Error(`${scenarioId} requires release inspection evidence`)
  }
  if (!expectedEnvironment && evidenceSource === 'release-inspector' && browserTarget !== OPERATOR_TARGET) {
    throw new Error(`${scenarioId} release inspection requires operator-cli`)
  }
}

function serializeDeploymentIdentity(deployment, gateState) {
  return [
    deployment.baseUrl,
    deployment.deployedCommit,
    deployment.assetVersion,
    deployment.runtimeConfigSha256,
    JSON.stringify(gateState)
  ].join('|')
}

function deploymentIdentity(deployment) {
  return serializeDeploymentIdentity(deployment, deployment.gateState)
}

function deploymentIdentityWithoutProfileDataGate(deployment) {
  const runtimeGateState = { ...deployment.gateState }
  delete runtimeGateState.profileDataGate
  return serializeDeploymentIdentity(deployment, runtimeGateState)
}

function normalizeDeployment(deployment) {
  if (!deployment || typeof deployment !== 'object') {
    throw new Error('Deployment evidence context is required')
  }
  const allowedKeys = new Set([
    'baseUrl',
    'deployedCommit',
    'assetVersion',
    'runtimeConfigSha256',
    'gateState',
    'observedAt'
  ])
  for (const key of Object.keys(deployment)) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown deployment field: ${key}`)
  }
  const normalized = {
    baseUrl: normalizeBaseUrl(deployment.baseUrl),
    deployedCommit: normalizeReleaseCommit(deployment.deployedCommit),
    assetVersion: normalizeAssetVersion(deployment.assetVersion),
    runtimeConfigSha256: String(deployment.runtimeConfigSha256 || '').trim(),
    gateState: normalizeGateState(deployment.gateState)
  }
  if (!HEX_SHA256_PATTERN.test(normalized.runtimeConfigSha256)) {
    throw new Error('Runtime config hash must be a SHA-256 hex digest')
  }
  return normalized
}

export function createDeploymentEvidenceContext(deployment) {
  return normalizeDeployment(deployment)
}

export function createEvidenceRecord({
  scenarioId,
  deployment,
  browserTarget,
  browser,
  browserVersion,
  os,
  osVersion,
  evidenceSource,
  observedAt,
  result,
  metadata = {}
} = {}) {
  if (!requiredScenario(scenarioId)) throw new Error(`Unknown canary scenario: ${scenarioId}`)
  const normalizedDeployment = normalizeDeployment(deployment)
  if (![...BROWSER_TARGETS, OPERATOR_TARGET].includes(browserTarget)) {
    throw new Error(`Unknown browser target: ${browserTarget}`)
  }
  if (
    !String(browser || '').trim()
    || !String(browserVersion || '').trim()
    || !String(os || '').trim()
    || !String(osVersion || '').trim()
  ) {
    throw new Error('Evidence records require browser, browser version, OS, and OS version')
  }
  assertSafeText(String(browser).trim(), 'Evidence browser')
  assertVersionText(String(browserVersion).trim(), 'Evidence browser version')
  assertSafeText(String(os).trim(), 'Evidence OS')
  assertVersionText(String(osVersion).trim(), 'Evidence OS version')
  validateEvidenceSource(scenarioId, browserTarget, evidenceSource)
  if (!RESULT_VALUES.has(result)) throw new Error(`Invalid evidence result: ${result}`)
  assertSafeMetadata(metadata)

  return {
    schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
    scenarioId,
    deployment: normalizedDeployment,
    observedAt: normalizeUtcTimestamp(observedAt),
    browserTarget,
    browser: String(browser).trim(),
    browserVersion: String(browserVersion).trim(),
    os: String(os).trim(),
    osVersion: String(osVersion).trim(),
    evidenceSource,
    result,
    gateState: normalizedDeployment.gateState,
    metadata: { ...metadata }
  }
}

export function createReleaseReadinessReport({
  deployment,
  records = [],
  retainedRecords = [],
  retentionPlans = [],
  confidenceGaps = [],
  productOwnerApproval = 'requested',
  noKnownProgressLossOrOwnershipDefect = false,
  observedAt
} = {}) {
  const normalizedDeployment = normalizeDeployment(deployment)
  normalizeUtcTimestamp(observedAt)
  if (!Array.isArray(records)) throw new Error('Release evidence records must be an array')
  if (!Array.isArray(retainedRecords)) throw new Error('Retained evidence records must be an array')
  if (!Array.isArray(retentionPlans)) throw new Error('Retention plans must be an array')
  if (!Array.isArray(confidenceGaps)) throw new Error('Confidence gaps must be an array')
  if (!PRODUCT_OWNER_APPROVAL_VALUES.has(productOwnerApproval)) {
    throw new Error('Product-owner approval status is invalid')
  }
  if (typeof noKnownProgressLossOrOwnershipDefect !== 'boolean') {
    throw new Error('No-known-defect confirmation must be boolean')
  }
  for (const gap of confidenceGaps) assertSafeText(gap, 'Confidence gap')
  const normalizedRetentionPlans = retentionPlans.map(retentionPlan => {
    if (!retentionPlan || typeof retentionPlan !== 'object' || Array.isArray(retentionPlan)) {
      throw new Error('Retention plan must be an object')
    }
    return {
      sourceDeployment: normalizeDeployment(retentionPlan.sourceDeployment),
      changedSurfaces: normalizeCanarySurfaces(retentionPlan.changedSurfaces)
    }
  })
  return {
    schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
    observedAt,
    release: normalizedDeployment,
    records: records.map(record => ({ ...record })),
    retainedRecords: retainedRecords.map(record => ({ ...record })),
    retentionPlans: normalizedRetentionPlans,
    confidenceGaps: [...confidenceGaps],
    productOwnerApproval,
    noKnownProgressLossOrOwnershipDefect
  }
}

function validateRecord(record, expectedDeployment, errors) {
  if (!record || typeof record !== 'object') {
    errors.push('Evidence record must be an object')
    return
  }
  const allowedKeys = new Set([
    'schemaVersion',
    'scenarioId',
    'deployment',
    'observedAt',
    'browserTarget',
    'browser',
    'browserVersion',
    'os',
    'osVersion',
    'evidenceSource',
    'result',
    'gateState',
    'metadata'
  ])
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Evidence record ${record.scenarioId || '(unknown)'} has an unknown field`)
    }
  }
  if (record.schemaVersion !== RELEASE_READINESS_SCHEMA_VERSION) {
    errors.push(`Evidence record ${record.scenarioId || '(unknown)'} has an unsupported schema`)
  }
  if (!requiredScenario(record.scenarioId)) {
    errors.push(`Unknown canary scenario: ${record.scenarioId}`)
  }
  try {
    normalizeUtcTimestamp(record.observedAt, `Evidence record ${record.scenarioId} time`)
  } catch (error) {
    errors.push(error.message)
  }
  if (![...BROWSER_TARGETS, OPERATOR_TARGET].includes(record.browserTarget)) {
    errors.push(`Evidence record ${record.scenarioId} has an unknown browser target`)
  }
  if (
    !String(record.browser || '').trim()
    || !String(record.browserVersion || '').trim()
    || !String(record.os || '').trim()
    || !String(record.osVersion || '').trim()
  ) {
    errors.push(`Evidence record ${record.scenarioId} is missing browser or OS version`)
  } else {
    try {
      assertSafeText(String(record.browser).trim(), 'Evidence browser')
      assertVersionText(String(record.browserVersion).trim(), 'Evidence browser version')
      assertSafeText(String(record.os).trim(), 'Evidence OS')
      assertVersionText(String(record.osVersion).trim(), 'Evidence OS version')
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (!RESULT_VALUES.has(record.result)) {
    errors.push(`Evidence record ${record.scenarioId} has an invalid result`)
  }
  try {
    assertSafeMetadata(record.metadata)
    normalizeGateState(record.gateState)
    validateEvidenceSource(record.scenarioId, record.browserTarget, record.evidenceSource)
  } catch (error) {
    errors.push(error.message)
  }
  try {
    const recordDeployment = normalizeDeployment(record.deployment)
    if (
      deploymentIdentityWithoutProfileDataGate(recordDeployment)
      !== deploymentIdentityWithoutProfileDataGate(expectedDeployment)
    ) {
      errors.push(`Evidence record ${record.scenarioId} has a different deployment identity`)
    }
    const requiredProfileDataGate = REQUIRED_PROFILE_DATA_GATE_BY_SCENARIO[record.scenarioId]
    const expectedProfileDataGate = requiredProfileDataGate
      || expectedDeployment.gateState.profileDataGate
    if (recordDeployment.gateState.profileDataGate !== expectedProfileDataGate) {
      errors.push(requiredProfileDataGate
        ? `Evidence record ${record.scenarioId} must use profile-data gate ${requiredProfileDataGate}`
        : `Evidence record ${record.scenarioId} has a different gate state`)
    }
    if (
      record.gateState
      && JSON.stringify(record.gateState) !== JSON.stringify(recordDeployment.gateState)
    ) {
      errors.push(`Evidence record ${record.scenarioId} gate state does not match its deployment`)
    }
  } catch (error) {
    errors.push(`Evidence record ${record.scenarioId} deployment is invalid: ${error.message}`)
  }
}

function validateScenarioMetadata(record, errors) {
  if (!record || typeof record !== 'object') return
  const requirements = SCENARIO_METADATA_REQUIREMENTS[record.scenarioId]
  if (record.result !== 'pass' || !requirements) return
  for (const [key, expected] of Object.entries(requirements)) {
    if (record.metadata?.[key] !== expected) {
      errors.push(`Evidence record ${record.scenarioId} does not prove ${key}=${expected}`)
    }
  }
  if (record.scenarioId === 'browser-matrix' && record.browserTarget === 'private-browsing') {
    const applicability = record.metadata?.[PRIVATE_BROWSING_APPLICABILITY_KEY]
    if (!['applicable', 'not-applicable'].includes(applicability)) {
      errors.push('Private-browsing evidence must state whether the smoke is applicable')
    }
    if (applicability === 'not-applicable') {
      try {
        assertSafeText(
          record.metadata?.privateBrowsingNotApplicableReason,
          'Private-browsing not-applicable reason'
        )
      } catch (error) {
        errors.push(error.message)
      }
    }
  }
  if (record.scenarioId === 'operations-monitoring' && record.result === 'pass') {
    let monitoringWindowSeconds
    try {
      const windowStart = normalizeUtcTimestamp(
        record.metadata?.monitoringWindowStartUtc,
        'Operations monitoring window start'
      )
      const windowEnd = normalizeUtcTimestamp(
        record.metadata?.monitoringWindowEndUtc,
        'Operations monitoring window end'
      )
      monitoringWindowSeconds = (Date.parse(windowEnd) - Date.parse(windowStart)) / 1000
      if (monitoringWindowSeconds < 24 * 60 * 60) {
        errors.push('Operations monitoring window must cover at least 24 hours')
      }
      if (windowEnd !== record.observedAt) {
        errors.push('Operations monitoring window end must match the evidence observation time')
      }
    } catch (error) {
      errors.push(error.message)
    }
    for (const key of ['externalCheckCount', 'aggregateRecordCount']) {
      if (!Number.isSafeInteger(record.metadata?.[key]) || record.metadata[key] <= 0) {
        errors.push(`Operations monitoring ${key} must be a positive integer`)
      }
    }
    for (const [key, label] of [
      ['largestExternalGapSeconds', 'external-check'],
      ['largestAggregateGapSeconds', 'aggregate']
    ]) {
      if (
        !Number.isSafeInteger(record.metadata?.[key])
        || record.metadata[key] <= 0
        || record.metadata[key] > 600
      ) {
        errors.push(`Operations monitoring ${label} gap must be positive and no more than ten minutes`)
      }
    }
    for (const [countKey, gapKey, label] of [
      ['externalCheckCount', 'largestExternalGapSeconds', 'external-check'],
      ['aggregateRecordCount', 'largestAggregateGapSeconds', 'aggregate']
    ]) {
      const count = record.metadata?.[countKey]
      const largestGapSeconds = record.metadata?.[gapKey]
      if (
        Number.isFinite(monitoringWindowSeconds)
        && Number.isSafeInteger(count)
        && count > 0
        && Number.isSafeInteger(largestGapSeconds)
        && largestGapSeconds > 0
        && largestGapSeconds <= 600
        && count < Math.ceil(monitoringWindowSeconds / largestGapSeconds) + 1
      ) {
        errors.push(
          `Operations monitoring ${label} count is inconsistent with its window and largest gap`
        )
      }
    }
  }
}

function validateGatePhaseOrder(records, release, reportObservedAt, errors) {
  const candidateIdentity = deploymentIdentityWithoutProfileDataGate(release)
  const candidateRecords = records.filter(record => {
    try {
      return deploymentIdentityWithoutProfileDataGate(
        normalizeDeployment(record.deployment)
      ) === candidateIdentity
    } catch {
      return false
    }
  })
  const recordTimes = scenarioIds => candidateRecords
    .filter(record => scenarioIds.has(record.scenarioId))
    .map(record => Date.parse(record.observedAt))
    .filter(Number.isFinite)
  const monitoringTimes = recordTimes(new Set(['operations-monitoring']))
  const developerCanaryTimes = recordTimes(new Set(
    Object.entries(REQUIRED_PROFILE_DATA_GATE_BY_SCENARIO)
      .filter(([, gate]) => gate === 'developer-canary')
      .map(([scenarioId]) => scenarioId)
  ))
  const switchOffTimes = recordTimes(new Set(['switch-off-and-rerun']))
  const finalContextTimes = candidateRecords
    .filter(record => !Object.hasOwn(REQUIRED_PROFILE_DATA_GATE_BY_SCENARIO, record.scenarioId))
    .map(record => Date.parse(record.observedAt))
    .filter(Number.isFinite)

  const latestMonitoring = Math.max(...monitoringTimes)
  const earliestDeveloperCanary = Math.min(...developerCanaryTimes)
  const latestDeveloperCanary = Math.max(...developerCanaryTimes)
  const earliestSwitchOff = Math.min(...switchOffTimes)
  const latestSwitchOff = Math.max(...switchOffTimes)
  const earliestFinalContext = Math.min(...finalContextTimes)
  const latestCandidateEvidence = Math.max(
    ...candidateRecords.map(record => Date.parse(record.observedAt)).filter(Number.isFinite)
  )

  if (monitoringTimes.length && developerCanaryTimes.length && latestMonitoring >= earliestDeveloperCanary) {
    errors.push('Operations monitoring must finish before developer-canary profile evidence starts')
  }
  if (developerCanaryTimes.length && switchOffTimes.length && latestDeveloperCanary >= earliestSwitchOff) {
    errors.push('Developer-canary profile evidence must finish before the final switch-off')
  }
  if (switchOffTimes.length && finalContextTimes.length && latestSwitchOff > earliestFinalContext) {
    errors.push('Final gate-off evidence must not predate the final switch-off')
  }
  if (Number.isFinite(latestCandidateEvidence) && latestCandidateEvidence > Date.parse(reportObservedAt)) {
    errors.push('Final report observation time must not predate candidate evidence')
  }
}

export function validateReleaseReadinessReport(report) {
  const errors = []
  if (!report || typeof report !== 'object') {
    return {
      valid: false,
      evidenceComplete: false,
      decision: 'blocked',
      errors: ['Release readiness report must be an object'],
      missingScenarios: REQUIRED_SCENARIOS.map(scenario => scenario.id),
      missingBrowserTargets: [...REQUIRED_BROWSER_TARGETS]
    }
  }
  if (report.schemaVersion !== RELEASE_READINESS_SCHEMA_VERSION) {
    errors.push('Release readiness report schema version is unsupported')
  }
  const allowedKeys = new Set([
    'schemaVersion',
    'observedAt',
    'release',
    'records',
    'retainedRecords',
    'retentionPlans',
    'confidenceGaps',
    'productOwnerApproval',
    'noKnownProgressLossOrOwnershipDefect'
  ])
  for (const key of Object.keys(report)) {
    if (!allowedKeys.has(key)) errors.push(`Unknown report field: ${key}`)
  }
  let release
  try {
    release = normalizeDeployment(report.release)
  } catch (error) {
    errors.push(`Release deployment is invalid: ${error.message}`)
  }
  try {
    normalizeUtcTimestamp(report.observedAt, 'Report observed time')
  } catch (error) {
    errors.push(error.message)
  }
  if (!PRODUCT_OWNER_APPROVAL_VALUES.has(report.productOwnerApproval)) {
    errors.push('Product-owner approval status is invalid')
  }
  if (report.noKnownProgressLossOrOwnershipDefect !== true) {
    errors.push('Final report must confirm no known progress-loss or ownership defect')
  }
  const confidenceGaps = Array.isArray(report.confidenceGaps)
    ? report.confidenceGaps
    : []
  for (const gap of confidenceGaps) {
    try { assertSafeText(gap, 'Confidence gap') } catch (error) { errors.push(error.message) }
  }
  if (!Array.isArray(report.records)) errors.push('Release evidence records must be an array')
  if (!Array.isArray(report.retainedRecords)) errors.push('Retained evidence records must be an array')
  if (!Array.isArray(report.retentionPlans)) errors.push('Retention plans must be an array')

  const records = Array.isArray(report.records) ? report.records : []
  const retainedRecords = Array.isArray(report.retainedRecords) ? report.retainedRecords : []
  const retentionPlans = Array.isArray(report.retentionPlans) ? report.retentionPlans : []
  if (release) {
    if (release.gateState.profileDataGate === 'unknown') {
      errors.push('Profile-data server gate must be recorded before readiness can be claimed')
    }
    if (release.gateState.profileDataGate !== 'off') {
      errors.push('Final release-readiness report must use profile-data gate off')
    }
    for (const record of records) {
      validateRecord(record, release, errors)
      validateScenarioMetadata(record, errors)
    }
    if (retainedRecords.length && !retentionPlans.length) {
      errors.push('Retained evidence requires a retention plan')
    }
    const normalizedRetentionPlans = []
    for (const retentionPlan of retentionPlans) {
      try {
        const sourceDeployment = normalizeDeployment(retentionPlan.sourceDeployment)
        const changedSurfaces = normalizeCanarySurfaces(retentionPlan.changedSurfaces)
        normalizedRetentionPlans.push({
          sourceDeployment,
          changedSurfaces,
          rerunPlan: getCanaryRerunPlan({
            previousReport: { release: sourceDeployment },
            nextDeployment: release,
            changedSurfaces
          })
        })
      } catch (error) {
        errors.push(`Retention plan is invalid: ${error.message}`)
      }
    }
    for (const record of retainedRecords) {
      const matchingPlans = normalizedRetentionPlans.filter(plan => (
        deploymentIdentity(plan.sourceDeployment) === deploymentIdentity(record.deployment)
      ))
      if (!matchingPlans.length) {
        errors.push(`Retained evidence ${record.scenarioId} has no matching retention plan`)
        continue
      }
      const sourceDeployment = matchingPlans[0].sourceDeployment
      validateRecord(record, sourceDeployment, errors)
      validateScenarioMetadata(record, errors)
      if (!matchingPlans.some(plan => plan.rerunPlan.retainScenarioIds.includes(record.scenarioId))) {
        errors.push(`Retained evidence ${record.scenarioId} depends on a changed surface`)
      }
    }
  }

  const passRecords = [...records, ...retainedRecords].filter(record => record?.result === 'pass')
  if (release) {
    validateGatePhaseOrder(passRecords, release, report.observedAt, errors)
  }
  const missingScenarios = REQUIRED_SCENARIOS
    .filter(scenario => !passRecords.some(record => record.scenarioId === scenario.id))
    .map(scenario => scenario.id)
  const missingBrowserTargets = REQUIRED_BROWSER_TARGETS.filter(target => {
    const targetRecords = passRecords.filter(
      record => record.scenarioId === 'browser-matrix' && record.browserTarget === target
    )
    if (target !== 'private-browsing') return targetRecords.length === 0
    return !targetRecords.some(record => [
      'applicable',
      'not-applicable'
    ].includes(record.metadata?.[PRIVATE_BROWSING_APPLICABILITY_KEY]))
  })
  if (missingScenarios.length) errors.push(`Missing canary scenarios: ${missingScenarios.join(', ')}`)
  if (missingBrowserTargets.length) errors.push(`Missing browser targets: ${missingBrowserTargets.join(', ')}`)

  const evidenceComplete = errors.length === 0
    && missingScenarios.length === 0
    && missingBrowserTargets.length === 0
    && confidenceGaps.every(gap => gap === OPTIONAL_DEVICE_CONFIDENCE_GAP)
  const decision = !evidenceComplete
    ? 'blocked'
    : report.productOwnerApproval === 'approved'
      ? 'approved'
      : report.productOwnerApproval === 'rejected'
        ? 'rejected'
        : 'awaiting-product-owner-approval'

  return {
    valid: evidenceComplete,
    evidenceComplete,
    decision,
    errors: [...new Set(errors)],
    missingScenarios,
    missingBrowserTargets
  }
}

export function getCanaryRerunPlan({
  previousReport,
  nextDeployment,
  changedSurfaces = []
} = {}) {
  const previousRelease = previousReport?.release
  const next = normalizeDeployment(nextDeployment)
  const surfaces = new Set(normalizeCanarySurfaces(changedSurfaces))
  if (
    previousRelease
    && (
      previousRelease.baseUrl !== next.baseUrl
      || previousRelease.deployedCommit !== next.deployedCommit
      || previousRelease.assetVersion !== next.assetVersion
    )
  ) surfaces.add('artifact')
  if (previousRelease?.runtimeConfigSha256 !== next.runtimeConfigSha256) {
    surfaces.add('runtime-config')
  }
  if (
    previousRelease
    && JSON.stringify(previousRelease.gateState) !== JSON.stringify(next.gateState)
  ) surfaces.add('gate-state')

  const rerunScenarioIds = []
  const retainScenarioIds = []
  for (const scenario of REQUIRED_SCENARIOS) {
    const requiredProfileDataGate = REQUIRED_PROFILE_DATA_GATE_BY_SCENARIO[scenario.id]
    const gateChangeRequiresRerun = surfaces.has('gate-state')
      && scenario.id !== 'operations-monitoring'
      && (
        scenario.id === 'switch-off-and-rerun'
        || !requiredProfileDataGate
        || previousRelease?.gateState?.profileDataGate !== requiredProfileDataGate
      )
    const otherChangeRequiresRerun = scenario.dependencies.some(
      dependency => dependency !== 'gate-state' && surfaces.has(dependency)
    )
    if (gateChangeRequiresRerun || otherChangeRequiresRerun) {
      rerunScenarioIds.push(scenario.id)
    } else {
      retainScenarioIds.push(scenario.id)
    }
  }
  return {
    changedSurfaces: [...surfaces],
    rerunScenarioIds,
    retainScenarioIds
  }
}

export function createCanaryRerunReport({
  previousReport,
  nextDeployment,
  changedSurfaces = [],
  records = [],
  observedAt,
  productOwnerApproval = 'requested'
} = {}) {
  const previousResult = validateReleaseReadinessReport(previousReport)
  if (!previousResult.valid) {
    throw new Error('Cannot carry forward evidence from an incomplete report')
  }
  const next = createDeploymentEvidenceContext(nextDeployment)
  const plan = getCanaryRerunPlan({ previousReport, nextDeployment: next, changedSurfaces })
  const previousEvidence = [
    ...(previousReport.records || []),
    ...(previousReport.retainedRecords || [])
  ]
  const retainedRecords = previousEvidence.filter(record => {
    if (record.result !== 'pass') return false
    const sourcePlan = getCanaryRerunPlan({
      previousReport: { release: record.deployment },
      nextDeployment: next,
      changedSurfaces: plan.changedSurfaces
    })
    return sourcePlan.retainScenarioIds.includes(record.scenarioId)
  })
  const retentionPlans = []
  for (const record of retainedRecords) {
    const sourceDeployment = createDeploymentEvidenceContext(record.deployment)
    const identity = deploymentIdentity(sourceDeployment)
    if (!retentionPlans.some(plan => deploymentIdentity(plan.sourceDeployment) === identity)) {
      retentionPlans.push({
        sourceDeployment,
        changedSurfaces: plan.changedSurfaces
      })
    }
  }
  return createReleaseReadinessReport({
    deployment: next,
    records,
    retainedRecords,
    retentionPlans,
    confidenceGaps: [],
    productOwnerApproval,
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt
  })
}

function parseRuntimeConfigSource(source) {
  const match = String(source).match(/^window\.EDENIA_CONFIG = (\{[\s\S]*\})\n?$/u)
  if (!match) throw new Error('Runtime config did not contain one EDENIA_CONFIG object')
  try {
    const config = JSON.parse(match[1])
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Runtime config must be an object')
    }
    return config
  } catch (error) {
    throw new Error(`Runtime config is invalid: ${error.message}`)
  }
}

function publicGateState(config) {
  const rollout = String(config.accountFeaturesRollout || 'off').trim()
  if (!RUNTIME_ROLLOUT_VALUES.has(rollout)) throw new Error('Runtime account rollout gate is invalid')
  return normalizeGateState({
    accountFeaturesRollout: rollout,
    learnerProfileLifecycleEnabled: config.learnerProfileLifecycleEnabled === true,
    emergencyAccountlessRollbackEnabled: config.emergencyAccountlessRollbackEnabled === true,
    legacyProgressMigrationEnabled: config.legacyProgressMigrationEnabled === true,
    profileDataGate: 'unknown'
  })
}

async function fetchText(fetchImpl, url, label) {
  const response = await fetchImpl(url, { cache: 'no-store' })
  if (!response?.ok) throw new Error(`${label} request failed with status ${response?.status ?? 'unknown'}`)
  return response.text()
}

export async function inspectDeployment({
  baseUrl,
  fetchImpl = globalThis.fetch,
  observedAt
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Deployment inspection requires fetch')
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const cacheBust = encodeURIComponent(String(observedAt || Date.now()))
  const manifestSource = await fetchText(
    fetchImpl,
    `${normalizedBaseUrl}release.json?canary=${cacheBust}`,
    'Release manifest'
  )
  let manifest
  try {
    manifest = validateReleaseManifest(JSON.parse(manifestSource))
  } catch (error) {
    throw new Error(`Deployed release manifest is invalid: ${error.message}`)
  }
  const runtimeConfigSource = await fetchText(
    fetchImpl,
    `${normalizedBaseUrl}config.local.js?v=${encodeURIComponent(manifest.assetVersion)}`,
    'Runtime config'
  )
  const runtimeConfigSha256 = sha256Hex(runtimeConfigSource)
  if (runtimeConfigSha256 !== manifest.runtimeConfigSha256) {
    throw new Error('Deployed runtime config does not match the release manifest')
  }
  const config = parseRuntimeConfigSource(runtimeConfigSource)
  const inspectedAt = normalizeUtcTimestamp(
    observedAt || new Date().toISOString(),
    'Inspection time'
  )
  return {
    baseUrl: normalizedBaseUrl,
    observedAt: inspectedAt,
    deployedCommit: manifest.deployedCommit,
    assetVersion: manifest.assetVersion,
    runtimeConfigSha256,
    gateState: publicGateState(config)
  }
}

function parseFlags(argv) {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag?.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    flags[flag.slice(2)] = value
    index += 1
  }
  return flags
}

async function writeJsonOutput(value, outputPath) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`
  if (outputPath) await writeFile(outputPath, serialized)
  else process.stdout.write(serialized)
}

async function runCli(argv) {
  const [command, ...rest] = argv
  const flags = parseFlags(rest)
  if (command === 'inspect') {
    const inspected = await inspectDeployment({ baseUrl: flags.url })
    await writeJsonOutput(inspected, flags.output)
    return
  }
  if (command === 'plan-rerun') {
    if (!flags['previous-report'] || !flags.deployment || !flags.output) {
      throw new Error('plan-rerun requires --previous-report, --deployment, and --output')
    }
    const previousReport = JSON.parse(await readFile(flags['previous-report'], 'utf8'))
    const nextDeployment = JSON.parse(await readFile(flags.deployment, 'utf8'))
    const changedSurfaces = flags['changed-surfaces']
      ? flags['changed-surfaces'].split(',').map(surface => surface.trim()).filter(Boolean)
      : []
    await writeJsonOutput(getCanaryRerunPlan({
      previousReport,
      nextDeployment,
      changedSurfaces
    }), flags.output)
    return
  }
  if (command === 'validate') {
    if (!flags.report || !flags.url) throw new Error('validate requires --report and --url')
    const report = JSON.parse(await readFile(flags.report, 'utf8'))
    const expectedDeployment = await inspectDeployment({ baseUrl: flags.url })
    const result = validateReleaseReadinessReport(report)
    const expectedReportDeployment = expectedDeployment && report.release
      ? {
          ...expectedDeployment,
          gateState: {
            ...expectedDeployment.gateState,
            profileDataGate: report.release.gateState?.profileDataGate
          }
        }
      : undefined
    const deploymentMatches = deploymentIdentity(report.release) === deploymentIdentity(expectedReportDeployment)
    const output = { ...result, deploymentMatches }
    await writeJsonOutput(output, flags.output)
    if (!result.valid || !deploymentMatches) process.exitCode = 1
    return
  }
  if (command === 'init') {
    if (!flags.deployment || !flags.output) throw new Error('init requires --deployment and --output')
    const inspectedDeployment = JSON.parse(await readFile(flags.deployment, 'utf8'))
    const deployment = createDeploymentEvidenceContext({
      ...inspectedDeployment,
      gateState: {
        ...inspectedDeployment.gateState,
        profileDataGate: flags['profile-data-gate']
          || inspectedDeployment.gateState?.profileDataGate
      }
    })
    const report = createReleaseReadinessReport({
      deployment,
      records: [],
      confidenceGaps: ['Required canary evidence has not been collected.'],
      productOwnerApproval: 'requested',
      observedAt: new Date().toISOString()
    })
    await writeJsonOutput(report, flags.output)
    return
  }
  if (command === 'append') {
    if (!flags.report || !flags.output || !flags.scenario || !flags.target) {
      throw new Error('append requires --report, --output, --scenario, and --target')
    }
    const report = JSON.parse(await readFile(flags.report, 'utf8'))
    let metadata = {}
    if (flags.metadata) {
      metadata = JSON.parse(flags.metadata)
    }
    const evidenceDeployment = flags['profile-data-gate']
      ? createDeploymentEvidenceContext({
          ...report.release,
          gateState: {
            ...report.release.gateState,
            profileDataGate: flags['profile-data-gate']
          }
        })
      : report.release
    const evidence = createEvidenceRecord({
      scenarioId: flags.scenario,
      deployment: evidenceDeployment,
      browserTarget: flags.target,
      browser: flags.browser,
      browserVersion: flags['browser-version'],
      os: flags.os,
      osVersion: flags['os-version'],
      evidenceSource: flags['evidence-source'],
      observedAt: flags.observedAt || new Date().toISOString(),
      result: flags.result || 'pass',
      metadata
    })
    const nextReport = createReleaseReadinessReport({
      deployment: report.release,
      records: [...(report.records || []), evidence],
      retainedRecords: report.retainedRecords || [],
      retentionPlans: report.retentionPlans || [],
      confidenceGaps: report.confidenceGaps || [],
      productOwnerApproval: report.productOwnerApproval || 'requested',
      noKnownProgressLossOrOwnershipDefect: report.noKnownProgressLossOrOwnershipDefect === true,
      observedAt: report.observedAt
    })
    await writeJsonOutput(nextReport, flags.output)
    return
  }
  if (command === 'confirm-no-known-defect') {
    if (!flags.report || !flags.output) {
      throw new Error('confirm-no-known-defect requires --report and --output')
    }
    const report = JSON.parse(await readFile(flags.report, 'utf8'))
    const confirmedReport = createReleaseReadinessReport({
      deployment: report.release,
      records: report.records || [],
      retainedRecords: report.retainedRecords || [],
      retentionPlans: report.retentionPlans || [],
      confidenceGaps: report.confidenceGaps || [],
      productOwnerApproval: report.productOwnerApproval || 'requested',
      noKnownProgressLossOrOwnershipDefect: true,
      observedAt: report.observedAt
    })
    await writeJsonOutput(confirmedReport, flags.output)
    return
  }
  throw new Error('Usage: release-readiness.mjs <inspect|plan-rerun|init|append|validate|confirm-no-known-defect> ...')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
