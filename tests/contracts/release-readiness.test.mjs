import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BROWSER_TARGETS,
  REQUIRED_SCENARIOS,
  createDeploymentEvidenceContext,
  createEvidenceRecord,
  createCanaryRerunReport,
  createReleaseReadinessReport,
  getCanaryRerunPlan,
  inspectDeployment,
  validateReleaseReadinessReport
} from '../../scripts/release-readiness.mjs'

const COMMIT = 'a'.repeat(40)
const NEXT_COMMIT = 'b'.repeat(40)
const THIRD_COMMIT = 'e'.repeat(40)
const CONFIG_HASH = 'c'.repeat(64)
const NEXT_CONFIG_HASH = 'd'.repeat(64)
const THIRD_CONFIG_HASH = 'f'.repeat(64)
const OBSERVED_AT = '2026-08-24T01:02:03.000Z'

const deployment = createDeploymentEvidenceContext({
  baseUrl: 'https://www.edenia.study/',
  deployedCommit: COMMIT,
  assetVersion: COMMIT.slice(0, 12),
  runtimeConfigSha256: CONFIG_HASH,
  gateState: {
    accountFeaturesRollout: 'internal',
    learnerProfileLifecycleEnabled: true,
    emergencyAccountlessRollbackEnabled: false,
    legacyProgressMigrationEnabled: true,
    profileDataGate: 'developer-canary'
  }
})

function record(
  scenarioId,
  browserTarget = 'operator-cli',
  metadata = {},
  evidenceDeployment = deployment
) {
  const operator = browserTarget === 'operator-cli'
  return createEvidenceRecord({
    scenarioId,
    deployment: evidenceDeployment,
    browserTarget,
    browser: operator ? 'psql' : 'Chrome',
    browserVersion: operator ? '16.0' : '151.0.7922.34',
    os: browserTarget === 'ios-safari' ? 'iOS' : 'macOS',
    osVersion: browserTarget === 'ios-safari' ? '18.6' : '15.6',
    evidenceSource: operator
      ? scenarioId === 'deployment-identity' ? 'release-inspector' : 'deployed-schema-canary'
      : 'live-browser-canary',
    observedAt: OBSERVED_AT,
    result: 'pass',
    metadata: {
      evidenceEnvironment: operator
        ? 'deployed-database'
        : 'deployed-browser',
      ...(browserTarget === 'private-browsing'
        ? { privateBrowsingApplicability: 'applicable' }
        : {}),
      ...metadata
    }
  })
}

function completeRecords(evidenceDeployment = deployment) {
  const addRecord = (scenarioId, browserTarget = 'operator-cli', metadata = {}) => (
    record(scenarioId, browserTarget, metadata, evidenceDeployment)
  )
  return [
    addRecord('deployment-identity'),
    ...BROWSER_TARGETS.map(target => addRecord('browser-matrix', target)),
    addRecord('auth-google', 'macos-chrome', {
      provider: 'google',
      providerOutcome: 'accepted'
    }),
    addRecord('auth-email-otp-turnstile', 'macos-safari', {
      provider: 'email',
      providerOutcome: 'accepted',
      turnstileOutcome: 'accepted',
      otpOutcome: 'verified',
      negativeCases: 'missing-expired-replay-invalid-zero-delivery',
      emailDeliveryCount: 1
    }),
    addRecord('auth-method-equivalence', 'fresh-chrome-paired-device', {
      providerPair: 'google-email',
      identityMatch: 'same_uuid',
      identityValueRecorded: false
    }),
    addRecord('profile-lifecycle', 'fresh-chrome-paired-device', {
      progressLoss: false,
      ownershipLeak: false,
      offlineDays: 30,
      profileCount: 1,
      lifecycleSubflows: 'new-returning-reload-offline30-signout-shared-browser-isolation'
    }),
    addRecord('profile-sync-conflict', 'fresh-chrome-paired-device', {
      progressLoss: false,
      conflictChoice: 'explicit',
      syncOrder: 'sequential'
    }),
    addRecord('profile-failure-preservation', 'macos-chrome', {
      progressLoss: false,
      failureCases: 'backup-oversize-corrupt-rejected-retry',
      preservedRevision: 7,
      rejectedWriteCount: 3
    }),
    addRecord('profile-portability', 'macos-safari', {
      importOutcome: 'accepted',
      exportOutcome: 'verified',
      displacedVersionProtected: true,
      sourceUnchangedOnFailure: true
    }),
    addRecord('profile-recovery', 'macos-chrome', {
      recoveryOutcome: 'accepted',
      protectedVersion: true,
      progressLoss: false
    }),
    addRecord('profile-start-over-undo', 'fresh-chrome-paired-device', {
      undoOutcome: 'accepted',
      generationAdvanced: true,
      progressLoss: false
    }),
    addRecord('database-security', 'operator-cli', {
      directWrite: 'denied',
      rlsIsolation: 'verified',
      unsafeOperatorAccess: 'denied',
      grants: 'verified'
    }),
    addRecord('database-fences-idempotency', 'operator-cli', {
      staleWrite: 'denied',
      corruptWrite: 'denied',
      duplicateOperation: 'idempotent',
      generationFence: 'verified'
    }),
    addRecord('backup-retention-restore', 'operator-cli', {
      restoreOutcome: 'exact',
      externalBackup: 'verified',
      exactRestore: 'verified',
      capacityEvidence: 'fresh',
      retainedVersionCount: 8
    }),
    addRecord('legacy-final-gate', 'macos-safari', {
      finalGate: 'verified',
      inheritedSession: 'confirmed',
      cloudConflict: 'explicit-choice',
      migrationVoluntary: true,
      firstBackupFailure: 'preserved-retry'
    }),
    addRecord('emergency-rollback', 'operator-cli', {
      rollbackOutcome: 'verified',
      accountlessProfilesMarkedLegacy: true
    }),
    addRecord('operations-monitoring', 'operator-cli', {
      authAlert: 'actionable',
      weeklyRestore: 'verified',
      capacityEvidence: 'fresh'
    }),
    addRecord('switch-off-and-rerun', 'macos-chrome', {
      switchOff: 'verified',
      rollbackTriggers: 'documented',
      affectedScenariosRerun: true,
      rerunPlanValidated: true
    })
  ]
}

test('release readiness requires complete deployment-bound evidence and keeps approval explicit', () => {
  const report = createReleaseReadinessReport({
    deployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })

  const result = validateReleaseReadinessReport(report)

  assert.equal(result.valid, true)
  assert.equal(result.evidenceComplete, true)
  assert.equal(result.decision, 'awaiting-product-owner-approval')
  assert.deepEqual(result.missingScenarios, [])
  assert.deepEqual(result.missingBrowserTargets, [])
})

test('release readiness rejects mixed deployment identity, unbound records, and sensitive evidence', () => {
  assert.throws(
    () => createEvidenceRecord({
      scenarioId: 'deployment-identity',
      deployment,
      browserTarget: 'operator-cli',
      browser: 'psql',
      browserVersion: '16.0',
      os: 'macOS',
      osVersion: '15.6',
      evidenceSource: 'release-inspector',
      observedAt: OBSERVED_AT,
      result: 'pass',
      metadata: { email: 'tester@example.com' }
    }),
    /sensitive evidence field|email/i
  )

  const report = createReleaseReadinessReport({
    deployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  report.records[0].deployment.deployedCommit = NEXT_COMMIT

  const result = validateReleaseReadinessReport(report)

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /deployment identity/i)
})

test('runtime changes produce a narrow rerun plan instead of discarding independent database evidence', () => {
  const previous = createReleaseReadinessReport({
    deployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  const nextDeployment = createDeploymentEvidenceContext({
    ...deployment,
    deployedCommit: NEXT_COMMIT,
    assetVersion: NEXT_COMMIT.slice(0, 12),
    runtimeConfigSha256: NEXT_CONFIG_HASH
  })

  const plan = getCanaryRerunPlan({
    previousReport: previous,
    nextDeployment,
    changedSurfaces: ['runtime-config']
  })

  assert.ok(plan.rerunScenarioIds.includes('auth-email-otp-turnstile'))
  assert.ok(plan.rerunScenarioIds.includes('legacy-final-gate'))
  assert.ok(!plan.rerunScenarioIds.includes('database-security'))
  assert.ok(plan.retainScenarioIds.includes('database-security'))

  const gateChangedDeployment = createDeploymentEvidenceContext({
    ...nextDeployment,
    gateState: {
      ...nextDeployment.gateState,
      profileDataGate: 'off'
    }
  })
  const gatePlan = getCanaryRerunPlan({
    previousReport: previous,
    nextDeployment: gateChangedDeployment
  })
  assert.deepEqual(gatePlan.retainScenarioIds, [])
})

test('rerun reports retain only independent evidence with its original deployment identity', () => {
  const previous = createReleaseReadinessReport({
    deployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  const nextDeployment = createDeploymentEvidenceContext({
    ...deployment,
    deployedCommit: NEXT_COMMIT,
    assetVersion: NEXT_COMMIT.slice(0, 12),
    runtimeConfigSha256: NEXT_CONFIG_HASH
  })
  const plan = getCanaryRerunPlan({
    previousReport: previous,
    nextDeployment,
    changedSurfaces: ['runtime-config']
  })
  const rerun = createCanaryRerunReport({
    previousReport: previous,
    nextDeployment,
    changedSurfaces: ['runtime-config'],
    records: completeRecords(nextDeployment).filter(record => (
      plan.rerunScenarioIds.includes(record.scenarioId)
    )),
    observedAt: OBSERVED_AT
  })

  const result = validateReleaseReadinessReport(rerun)

  assert.equal(result.valid, true)
  assert.ok(rerun.retainedRecords.some(record => record.scenarioId === 'database-security'))
  assert.equal(rerun.retainedRecords[0].deployment.deployedCommit, COMMIT)

  const thirdDeployment = createDeploymentEvidenceContext({
    ...nextDeployment,
    deployedCommit: THIRD_COMMIT,
    assetVersion: THIRD_COMMIT.slice(0, 12),
    runtimeConfigSha256: THIRD_CONFIG_HASH
  })
  const secondPlan = getCanaryRerunPlan({
    previousReport: rerun,
    nextDeployment: thirdDeployment,
    changedSurfaces: ['runtime-config']
  })
  const secondRerun = createCanaryRerunReport({
    previousReport: rerun,
    nextDeployment: thirdDeployment,
    changedSurfaces: ['runtime-config'],
    records: completeRecords(thirdDeployment).filter(record => (
      secondPlan.rerunScenarioIds.includes(record.scenarioId)
    )),
    observedAt: OBSERVED_AT
  })

  assert.equal(validateReleaseReadinessReport(secondRerun).valid, true)
  assert.ok(secondRerun.retainedRecords.some(record => record.scenarioId === 'database-security'))
})

test('deployment inspection binds the cache-busted runtime bytes to the public manifest', async () => {
  const runtimeConfig = 'window.EDENIA_CONFIG = {\n  "accountFeaturesRollout": "internal",\n  "learnerProfileLifecycleEnabled": true\n}\n'
  const runtimeConfigSha256 = await import('node:crypto').then(({ createHash }) => (
    createHash('sha256').update(runtimeConfig).digest('hex')
  ))
  const manifest = JSON.stringify({
    schemaVersion: 1,
    deployedCommit: COMMIT,
    assetVersion: COMMIT.slice(0, 12),
    runtimeConfigSha256
  })
  const calls = []
  const fetchImpl = async url => {
    calls.push(String(url))
    if (String(url).includes('/release.json')) {
      return new Response(manifest, { status: 200 })
    }
    return new Response(runtimeConfig, { status: 200 })
  }

  const inspected = await inspectDeployment({
    baseUrl: 'https://www.edenia.study/',
    fetchImpl,
    observedAt: OBSERVED_AT
  })

  assert.equal(inspected.deployedCommit, COMMIT)
  assert.equal(inspected.runtimeConfigSha256, runtimeConfigSha256)
  assert.equal(inspected.gateState.accountFeaturesRollout, 'internal')
  assert.ok(calls.some(url => /config\.local\.js\?v=/u.test(url)))
})

test('deployment URL and browser provenance are part of the evidence contract', () => {
  const report = createReleaseReadinessReport({
    deployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  const otherHost = createDeploymentEvidenceContext({
    ...deployment,
    baseUrl: 'https://preview.edenia.study/'
  })
  report.records[0].deployment = otherHost
  const result = validateReleaseReadinessReport(report)

  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /deployment identity/i)
  assert.throws(
    () => createEvidenceRecord({
      scenarioId: 'auth-google',
      deployment,
      browserTarget: 'macos-chrome',
      browser: 'Chrome',
      browserVersion: '',
      os: 'macOS',
      osVersion: '15.6',
      evidenceSource: 'live-browser-canary',
      observedAt: OBSERVED_AT,
      result: 'pass',
      metadata: {
        evidenceEnvironment: 'deployed-browser',
        provider: 'google',
        providerOutcome: 'accepted'
      }
    }),
    /browser, browser version, OS, and OS version/i
  )
})

test('required scenario catalog covers the release proof boundary', () => {
  assert.deepEqual(
    REQUIRED_SCENARIOS.map(scenario => scenario.id),
    [
      'deployment-identity',
      'browser-matrix',
      'auth-google',
      'auth-email-otp-turnstile',
      'auth-method-equivalence',
      'profile-lifecycle',
      'profile-sync-conflict',
      'profile-failure-preservation',
      'profile-portability',
      'profile-recovery',
      'profile-start-over-undo',
      'database-security',
      'database-fences-idempotency',
      'backup-retention-restore',
      'legacy-final-gate',
      'emergency-rollback',
      'operations-monitoring',
      'switch-off-and-rerun'
    ]
  )
})
