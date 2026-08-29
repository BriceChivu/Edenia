import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

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
const SOAK_ENDED_AT = '2026-08-24T01:02:03.000Z'
const DEVELOPER_CANARY_OBSERVED_AT = '2026-08-24T02:02:03.000Z'
const SWITCH_OFF_OBSERVED_AT = '2026-08-24T03:02:03.000Z'
const OBSERVED_AT = '2026-08-24T04:02:03.000Z'
const SOAK_STARTED_AT = '2026-08-23T01:02:03.000Z'
const execFileAsync = promisify(execFile)
const DEVELOPER_CANARY_SCENARIOS = new Set([
  'profile-lifecycle',
  'profile-sync-conflict',
  'profile-failure-preservation',
  'profile-portability',
  'profile-recovery',
  'profile-start-over-undo',
  'legacy-final-gate'
])
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

const gateOffDeployment = createDeploymentEvidenceContext({
  ...deployment,
  gateState: {
    ...deployment.gateState,
    profileDataGate: 'off'
  }
})

function record(
  scenarioId,
  browserTarget = 'operator-cli',
  metadata = {},
  evidenceDeployment = deployment,
  observedAt = OBSERVED_AT
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
    observedAt,
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

function operationsMonitoringMetadata() {
  return {
    authAlert: 'actionable',
    externalAuthMonitor: 'five-minute-no-gap-over-ten',
    operatorNotification: 'down-and-up-received',
    authMonitorCanary: 'provider-failure-and-recovery',
    staleWatchdog: 'verified',
    weeklyRestore: 'verified',
    capacityEvidence: 'fresh',
    boundedCanaryDuringSoak: 'disabled',
    monitoringWindowStartUtc: SOAK_STARTED_AT,
    monitoringWindowEndUtc: SOAK_ENDED_AT,
    externalCheckCount: 289,
    aggregateRecordCount: 289,
    largestExternalGapSeconds: 300,
    largestAggregateGapSeconds: 300,
    providerUnavailableCount: 0,
    networkErrorCount: 0
  }
}

function completeRecords(evidenceDeployment = gateOffDeployment) {
  const developerCanaryEvidenceDeployment = createDeploymentEvidenceContext({
    ...evidenceDeployment,
    gateState: {
      ...evidenceDeployment.gateState,
      profileDataGate: 'developer-canary'
    }
  })
  const gateOffEvidenceDeployment = createDeploymentEvidenceContext({
    ...evidenceDeployment,
    gateState: {
      ...evidenceDeployment.gateState,
      profileDataGate: 'off'
    }
  })
  const addRecord = (scenarioId, browserTarget = 'operator-cli', metadata = {}) => {
    const scenarioDeployment = DEVELOPER_CANARY_SCENARIOS.has(scenarioId)
      ? developerCanaryEvidenceDeployment
      : ['operations-monitoring', 'switch-off-and-rerun'].includes(scenarioId)
        ? gateOffEvidenceDeployment
        : evidenceDeployment
    const observedAt = DEVELOPER_CANARY_SCENARIOS.has(scenarioId)
      ? DEVELOPER_CANARY_OBSERVED_AT
      : scenarioId === 'operations-monitoring'
        ? SOAK_ENDED_AT
        : scenarioId === 'switch-off-and-rerun'
          ? SWITCH_OFF_OBSERVED_AT
          : OBSERVED_AT
    return record(scenarioId, browserTarget, metadata, scenarioDeployment, observedAt)
  }
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
    addRecord('operations-monitoring', 'operator-cli', operationsMonitoringMetadata()),
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
    deployment: gateOffDeployment,
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
      deployment: gateOffDeployment,
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
    deployment: gateOffDeployment,
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
    deployment: gateOffDeployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  const nextDeployment = createDeploymentEvidenceContext({
    ...gateOffDeployment,
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
  assert.ok(plan.rerunScenarioIds.includes('operations-monitoring'))
  assert.ok(!plan.rerunScenarioIds.includes('database-security'))
  assert.ok(plan.retainScenarioIds.includes('database-security'))

  const gateChangedDeployment = createDeploymentEvidenceContext({
    ...gateOffDeployment,
    gateState: {
      ...gateOffDeployment.gateState,
      profileDataGate: 'developer-canary'
    }
  })
  const gatePlan = getCanaryRerunPlan({
    previousReport: previous,
    nextDeployment: gateChangedDeployment
  })
  assert.deepEqual(gatePlan.retainScenarioIds, ['operations-monitoring'])
})

test('the full staged sequence returns to a gate-off final report', () => {
  const report = createReleaseReadinessReport({
    deployment: gateOffDeployment,
    records: completeRecords(gateOffDeployment),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })

  const result = validateReleaseReadinessReport(report)
  const gatePlan = getCanaryRerunPlan({
    previousReport: { release: gateOffDeployment },
    nextDeployment: deployment
  })
  const returnPlan = getCanaryRerunPlan({
    previousReport: { release: deployment },
    nextDeployment: gateOffDeployment
  })

  assert.equal(result.valid, true)
  assert.deepEqual(gatePlan.retainScenarioIds, ['operations-monitoring'])
  assert.deepEqual(returnPlan.retainScenarioIds, [
    ...DEVELOPER_CANARY_SCENARIOS,
    'operations-monitoring'
  ])
  assert.ok(gatePlan.rerunScenarioIds.includes('switch-off-and-rerun'))
  assert.ok(returnPlan.rerunScenarioIds.includes('switch-off-and-rerun'))

  const monitoring = report.records.find(record => record.scenarioId === 'operations-monitoring')
  const profileLifecycle = report.records.find(record => record.scenarioId === 'profile-lifecycle')
  const switchOff = report.records.find(record => record.scenarioId === 'switch-off-and-rerun')
  assert.ok(Date.parse(monitoring.observedAt) < Date.parse(profileLifecycle.observedAt))
  assert.ok(Date.parse(profileLifecycle.observedAt) < Date.parse(switchOff.observedAt))
  assert.ok(Date.parse(switchOff.observedAt) < Date.parse(report.observedAt))

  const unsafeMixedGateReport = structuredClone(report)
  const databaseSecurity = unsafeMixedGateReport.records.find(
    record => record.scenarioId === 'database-security'
  )
  databaseSecurity.deployment = deployment
  databaseSecurity.gateState = deployment.gateState

  const unsafeResult = validateReleaseReadinessReport(unsafeMixedGateReport)
  assert.equal(unsafeResult.valid, false)
  assert.match(unsafeResult.errors.join('\n'), /different gate state|different deployment identity/i)

  const wrongProfileGateReport = structuredClone(report)
  const wrongGateProfileLifecycle = wrongProfileGateReport.records.find(
    record => record.scenarioId === 'profile-lifecycle'
  )
  wrongGateProfileLifecycle.deployment = gateOffDeployment
  wrongGateProfileLifecycle.gateState = gateOffDeployment.gateState

  const wrongProfileGateResult = validateReleaseReadinessReport(wrongProfileGateReport)
  assert.equal(wrongProfileGateResult.valid, false)
  assert.match(wrongProfileGateResult.errors.join('\n'), /profile-lifecycle.*developer-canary/i)

  const wrongPhaseOrderReport = structuredClone(report)
  const outOfOrderProfile = wrongPhaseOrderReport.records.find(
    record => record.scenarioId === 'profile-lifecycle'
  )
  outOfOrderProfile.observedAt = SOAK_ENDED_AT
  const wrongPhaseOrderResult = validateReleaseReadinessReport(wrongPhaseOrderReport)
  assert.equal(wrongPhaseOrderResult.valid, false)
  assert.match(wrongPhaseOrderResult.errors.join('\n'), /monitoring.*before.*developer-canary/i)

  const wrongMonitoringGateReport = structuredClone(report)
  const wrongGateMonitoring = wrongMonitoringGateReport.records.find(
    record => record.scenarioId === 'operations-monitoring'
  )
  wrongGateMonitoring.deployment = deployment
  wrongGateMonitoring.gateState = deployment.gateState

  const wrongMonitoringResult = validateReleaseReadinessReport(wrongMonitoringGateReport)
  assert.equal(wrongMonitoringResult.valid, false)
  assert.match(wrongMonitoringResult.errors.join('\n'), /operations-monitoring.*gate.*off/i)

  const wrongFinalGateReport = structuredClone(report)
  wrongFinalGateReport.release = deployment
  const wrongFinalGateResult = validateReleaseReadinessReport(wrongFinalGateReport)
  assert.equal(wrongFinalGateResult.valid, false)
  assert.match(wrongFinalGateResult.errors.join('\n'), /final.*report.*gate off/i)
})

test('monitoring soak enforces the 24-hour no-gap and no-provider-failure contract', async t => {
  const cases = [
    [
      'short window',
      metadata => { metadata.monitoringWindowStartUtc = '2026-08-23T02:02:03.000Z' },
      /at least 24 hours/i
    ],
    [
      'impossible calendar date',
      metadata => { metadata.monitoringWindowStartUtc = '2026-13-23T01:02:03.000Z' },
      /monitoring window start.*ISO timestamp in UTC/i
    ],
    [
      'external gap',
      metadata => { metadata.largestExternalGapSeconds = 601 },
      /external-check.*gap.*ten minutes/i
    ],
    [
      'aggregate gap',
      metadata => { metadata.largestAggregateGapSeconds = 601 },
      /aggregate.*gap.*ten minutes/i
    ],
    [
      'provider failure',
      metadata => { metadata.providerUnavailableCount = 1 },
      /providerUnavailableCount=0/i
    ],
    [
      'network failure',
      metadata => { metadata.networkErrorCount = 1 },
      /networkErrorCount=0/i
    ],
    [
      'enabled canary',
      metadata => { metadata.boundedCanaryDuringSoak = 'enabled' },
      /boundedCanaryDuringSoak=disabled/i
    ],
    [
      'missing checks',
      metadata => { metadata.externalCheckCount = 0 },
      /externalCheckCount.*positive integer/i
    ],
    [
      'one-check soak',
      metadata => {
        metadata.externalCheckCount = 1
        metadata.aggregateRecordCount = 1
      },
      /count.*inconsistent.*window.*largest gap/i
    ]
  ]

  for (const [name, mutate, expectedError] of cases) {
    await t.test(name, () => {
      const report = createReleaseReadinessReport({
        deployment: gateOffDeployment,
        records: completeRecords(),
        confidenceGaps: [],
        productOwnerApproval: 'requested',
        noKnownProgressLossOrOwnershipDefect: true,
        observedAt: OBSERVED_AT
      })
      const monitoring = report.records.find(
        record => record.scenarioId === 'operations-monitoring'
      )
      mutate(monitoring.metadata)

      const result = validateReleaseReadinessReport(report)
      assert.equal(result.valid, false)
      assert.match(result.errors.join('\n'), expectedError)
    })
  }
})

test('append records the developer-canary profile phase without changing the final gate', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'edenia-release-readiness-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const reportPath = join(directory, 'readiness.json')
  const outputPath = join(directory, 'readiness.next.json')
  const report = createReleaseReadinessReport({
    deployment: gateOffDeployment,
    records: completeRecords().filter(record => record.scenarioId !== 'profile-lifecycle'),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  await writeFile(reportPath, `${JSON.stringify(report)}\n`)

  await execFileAsync(process.execPath, [
    'scripts/release-readiness.mjs',
    'append',
    '--report', reportPath,
    '--output', outputPath,
    '--scenario', 'profile-lifecycle',
    '--target', 'fresh-chrome-paired-device',
    '--browser', 'Chrome',
    '--browser-version', '151.0.7922.34',
    '--os', 'macOS',
    '--os-version', '15.6',
    '--evidence-source', 'live-browser-canary',
    '--profile-data-gate', 'developer-canary',
    '--observedAt', DEVELOPER_CANARY_OBSERVED_AT,
    '--metadata', JSON.stringify({
      evidenceEnvironment: 'deployed-browser',
      progressLoss: false,
      ownershipLeak: false,
      offlineDays: 30,
      profileCount: 1,
      lifecycleSubflows: 'new-returning-reload-offline30-signout-shared-browser-isolation'
    })
  ])

  const nextReport = JSON.parse(await readFile(outputPath, 'utf8'))
  const profileLifecycle = nextReport.records.find(record => record.scenarioId === 'profile-lifecycle')
  assert.equal(nextReport.release.gateState.profileDataGate, 'off')
  assert.equal(profileLifecycle.gateState.profileDataGate, 'developer-canary')
  assert.equal(validateReleaseReadinessReport(nextReport).valid, true)
})

test('rerun reports retain only independent evidence with its original deployment identity', () => {
  const previous = createReleaseReadinessReport({
    deployment: gateOffDeployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  const nextDeployment = createDeploymentEvidenceContext({
    ...gateOffDeployment,
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
    deployment: gateOffDeployment,
    records: completeRecords(),
    confidenceGaps: [],
    productOwnerApproval: 'requested',
    noKnownProgressLossOrOwnershipDefect: true,
    observedAt: OBSERVED_AT
  })
  const otherHost = createDeploymentEvidenceContext({
    ...gateOffDeployment,
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
  for (const scenario of REQUIRED_SCENARIOS) {
    assert.equal(scenario.dependencies.includes('gate-state'), true)
  }
})
