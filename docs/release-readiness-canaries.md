# Release-readiness canaries

Issue #196 uses one report format for the final mandatory-account decision. A
passing source test, `internal_test=1`, or a local browser is not production
proof. Each record must point to the exact deployed commit and the exact
cache-busted runtime-config bytes that the browser used.

## Capture the deployment identity

Run this against the candidate URL after the Pages deployment finishes:

```sh
npm run release:readiness -- inspect \
  --url https://www.edenia.study/ \
  --output deployment.json
```

The inspector fetches `release.json` with a cache-busting query, then fetches
`config.local.js?v=<asset version>`. It records the full source SHA, twelve
character asset version, SHA-256 of the exact runtime-config response, UTC
inspection time, and non-secret runtime gates. It never prints the YouTube key,
Supabase URL or key, Turnstile site key, email address, UUID, session, token, or
profile data.

The inspector and validator do not execute Google, Turnstile, email, browser,
Supabase, or backup operations. They are the evidence boundary around a live
operator canary. Append a record only after the named live operation has
completed. Browser records must use `live-browser-canary`; deployed database
records must use `deployed-schema-canary`; the deployment identity record uses
`release-inspector`. Local contract or mocked browser results must never be
labelled as one of those sources.

Before creating a report, replace the inspector's
`profileDataGate: "unknown"` with the observed server gate state. Use one of
`off`, `developer-canary`, or `signed-in-public`. The browser cannot prove this
server value. Read it from the approved operator surface and keep it out of
the report if it contains anything beyond the gate state.

## Collect the gate phases in order

The Mandatory Auth-monitoring soak and the Internal canary use the same Pages
candidate but different server profile-data gate states. Keep those phases
separate and retain the exact state on every record:

1. Prepare and deploy the final Internal canary runtime with
   `accountFeaturesRollout: "internal"` and the learner-profile lifecycle
   enabled. Keep the server profile-data gate `off`. This runtime change needs
   separate product-owner approval and is not performed by the evidence tool.
2. Inspect that exact candidate, then observe the Independent Auth monitor for
   at least 24 continuous hours. Restart the soak after any deployment,
   runtime-config change, unexplained external-check or aggregate-record gap
   over ten minutes, `provider_unavailable`, or `network_error` outcome.
3. After the soak passes, obtain separate approval to set only the server
   profile-data gate to `developer-canary` for the exact tester. Do not deploy
   new Pages bytes or change runtime configuration between the soak and the
   Internal canary.
4. Inspect the candidate again. The deployed commit, asset version, and
   runtime-config hash must match the gate-off soak candidate exactly. Collect
   the `profile-lifecycle`, `profile-sync-conflict`,
   `profile-failure-preservation`, `profile-portability`, `profile-recovery`,
   `profile-start-over-undo`, and `legacy-final-gate` records in this
   `developer-canary` phase.
5. Return the server profile-data gate to `off`, run
   `switch-off-and-rerun`, and collect or rerun every scenario the gate plan
   marks as affected. Keep the bounded Auth-monitor canary disabled.
6. Inspect the final gate-off candidate again. Its deployed commit, asset
   version, and runtime-config hash must still match both earlier phases.
7. Initialize the final report with the gate-off deployment context. Append
   each developer-canary record with `--profile-data-gate developer-canary` and
   each gate-off record with `--profile-data-gate off`. The flag records an
   observed evidence phase; it never changes the server gate.

The seven named profile scenarios are fixed to `developer-canary`.
`operations-monitoring` and `switch-off-and-rerun` are fixed to `off`. Every
other scenario must match the final report's gate-off context. The validator
rejects a final report whose release gate is not `off`, a phase-bound record at
the wrong gate, and every other arbitrary mixed-gate record. A planned
off-to-developer-canary transition retains the completed monitoring soak. The
return to off retains that same soak and the seven developer-canary profile
records, but always reruns `switch-off-and-rerun` and the affected
final-context scenarios. Record times must also prove that the soak finished
before developer-canary evidence, developer-canary evidence finished before
switch-off, and final-context evidence did not predate switch-off.

Initialize a report:

```sh
npm run release:readiness -- init \
  --deployment deployment.json \
  --profile-data-gate off \
  --output readiness.json
```

The initial report is blocked until the required records exist. Append one
sanitized record at a time. `--metadata` accepts only bounded scalar values
from the allowlist in `scripts/release-readiness.mjs`:

```sh
npm run release:readiness -- append \
  --report readiness.json \
  --output readiness.next.json \
  --scenario auth-email-otp-turnstile \
  --target macos-safari \
  --browser "Safari current" \
  --browser-version "26.0" \
  --os "macOS current" \
  --os-version "26.0" \
  --evidence-source live-browser-canary \
  --observedAt 2026-08-24T01:02:03.000Z \
  --metadata '{"evidenceEnvironment":"deployed-browser","provider":"email","providerOutcome":"accepted","turnstileOutcome":"accepted","otpOutcome":"verified","negativeCases":"missing-expired-replay-invalid-zero-delivery","emailDeliveryCount":1}'
```

For each of the seven developer-canary profile scenarios, add
`--profile-data-gate developer-canary` to the append command. Review the
generated record to confirm its gate is `developer-canary` while the report's
final release gate remains `off`.

Append the completed gate-off monitoring phase to the final report:

```sh
npm run release:readiness -- append \
  --report readiness.json \
  --output readiness.next.json \
  --scenario operations-monitoring \
  --target operator-cli \
  --browser "psql" \
  --browser-version "17.0" \
  --os "macOS" \
  --os-version "26.5" \
  --evidence-source deployed-schema-canary \
  --profile-data-gate off \
  --observedAt 2026-08-30T01:27:10.000Z \
  --metadata '{"evidenceEnvironment":"deployed-database","authAlert":"actionable","externalAuthMonitor":"five-minute-no-gap-over-ten","operatorNotification":"down-and-up-received","authMonitorCanary":"provider-failure-and-recovery","staleWatchdog":"verified","weeklyRestore":"verified","capacityEvidence":"fresh","boundedCanaryDuringSoak":"disabled","monitoringWindowStartUtc":"2026-08-29T01:27:10.000Z","monitoringWindowEndUtc":"2026-08-30T01:27:10.000Z","externalCheckCount":289,"aggregateRecordCount":289,"largestExternalGapSeconds":300,"largestAggregateGapSeconds":300,"providerUnavailableCount":0,"networkErrorCount":0}'
```

Use measured values, not the example counts or gaps. The monitoring window end
must equal the evidence `observedAt` time. The bounds are the first and last
included observation times, and each count includes both boundary
observations. Both counts must be positive and mathematically sufficient for
the reported window and largest gap, both largest gaps must be positive and no
more than 600 seconds, and both failure counts must be zero. Review the
generated file before moving it into the next report position.

Review the generated file, then move it into the next report position. Do not
put credentials, addresses, UUIDs, raw provider responses, profile envelopes,
screenshots with account details, or authentication values in the report.

## Required evidence

The validator requires a passing record for every scenario below. A record may
contain bounded revision, generation, hash, byte, or count metadata, but those
values are not a substitute for the observed behavior.

| Scenario | What the canary must demonstrate |
| --- | --- |
| `deployment-identity` | The candidate serves the expected full SHA and runtime-config hash. |
| `browser-matrix` | Current macOS Chrome, current macOS Safari, current iPhone Safari, a fresh Chrome profile paired with another device, and the applicable private-browsing smoke. |
| `auth-google` | The official Google button completes a live ID-token sign-in. |
| `auth-email-otp-turnstile` | A live same-device email code completes with Turnstile accepted and exactly one delivery. Missing, expired, replayed, and invalid-token results remain rejected with zero deliveries. |
| `auth-method-equivalence` | Google and email for the approved verified address resolve to the same Supabase UUID. Record only `identityMatch: "same_uuid"` and `identityValueRecorded: false`. |
| `profile-lifecycle` | New and returning routing, reload, the exact 30-day offline boundary, local and global sign-out, shared-browser replacement, and no cross-profile leakage. |
| `profile-sync-conflict` | Local-first saving, sequential two-device sync, competing revisions, and explicit conflict choice without progress loss. |
| `profile-failure-preservation` | Failed backup, oversized or corrupt input, rejected writes, and retries preserve the last accepted local and cloud revisions. |
| `profile-portability` | Export and import validate the portable profile, protect the displaced version, and leave the source unchanged on failure. |
| `profile-recovery` | Missing-head recovery uses only trusted owner-bound local or protected versions and preserves the displaced head. |
| `profile-start-over-undo` | Start over advances the generation, keeps identity, protects the old generation, and Undo restores it as a new accepted revision. |
| `database-security` | Auth-derived ownership, RLS, grants, direct unsafe-write denial, and operator-table isolation hold against the deployed schema. |
| `database-fences-idempotency` | Stale, corrupt, duplicate, and cross-generation writes are denied or idempotent as specified. |
| `backup-retention-restore` | Protected backup creation, eight-version retention, capacity evidence, and an external restore rehearsal produce exact bounded counts and hashes. |
| `legacy-final-gate` | Voluntary migration, final-gate routing, inherited-session confirmation, cloud conflict, and first-backup failure behave safely. |
| `emergency-rollback` | The server-controlled accountless rollback path restores only explicitly marked legacy profiles and does not weaken owner isolation. |
| `operations-monitoring` | With the server profile-data gate off and the bounded canary disabled, the independent five-minute Auth monitor has no external-check or aggregate-record gap over ten minutes and no provider/network failure in a 24-hour window. The record includes sanitized UTC bounds, positive external/aggregate counts, both largest gaps, and zero failure counts. The earlier provider-failure canary delivers real DOWN and UP notifications; the stale-record watchdog, weekly external-backup restoration, capacity evidence, and rollback triggers are also verified. |
| `switch-off-and-rerun` | Switch-off behavior and the emergency rollback exercise pass, with affected scenarios rerun after each changed deployment or runtime gate. |

The database and operator records use `operator-cli` as their browser target,
with the actual operator client and OS version still recorded. Every record
carries UTC time, gate state, deployment URL, deployment SHA, asset version,
runtime-config hash, browser version, OS version, and an evidence source. For
the private-browsing target, record
`privateBrowsingApplicability: "applicable"` or
`privateBrowsingApplicability: "not-applicable"` with the reason kept outside
the sanitized report.

## Validate the report

Validate the report against the exact candidate again immediately before the
cutover decision:

```sh
npm run release:readiness -- validate \
  --report readiness.json \
  --url https://www.edenia.study/ \
  --output readiness-result.json
```

The command fails if a record points to another commit, asset version, or
runtime-config hash. It also fails for missing browsers, failed scenarios,
unknown server-gate state, unsafe evidence, or a non-empty confidence-gap
list. After reviewing all passing records and confirming there is no known
progress-loss or ownership defect, make that assertion explicit:

```sh
npm run release:readiness -- confirm-no-known-defect \
  --report readiness.json \
  --output readiness.confirmed.json
```

A complete report with no product-owner decision returns
`awaiting-product-owner-approval`. The tool never treats completion as
approval.

When a candidate changes, use the pure `getCanaryRerunPlan` function exported
by `scripts/release-readiness.mjs`, then use
`createCanaryRerunReport` to carry forward only independent passing records.
Pass `runtime-config`, `auth-provider`, `database`, `operations`, or
`gate-state` as the changed surface. A changed non-secret gate is also detected
from the deployment contexts. Retained records keep their original exact deployment context
inside `retainedRecords`; newly affected scenarios must be appended with the
new deployment context. Validation rejects retained evidence for a changed
surface, and rejects a report whose current release URL does not match the
candidate inspected with `--url`.

The off-to-developer-canary gate transition retains the completed gate-off
`operations-monitoring` record. The developer-canary-to-off transition retains
that same monitoring record and the seven developer-canary profile records.
`switch-off-and-rerun` always reruns after the transition it proves, and every
other scenario depends on the report's current gate. An artifact or
runtime-config change restarts the gate-off soak and invalidates every scenario
with that dependency; do not manually copy records onto the changed candidate.
Retention eligibility does not replace the required chronological collection
order; the validator checks that order from each record's UTC observation time.

The same dependency plan is available without importing JavaScript:

```sh
npm run release:readiness -- plan-rerun \
  --previous-report readiness.json \
  --deployment next-deployment.json \
  --changed-surfaces runtime-config,auth-provider \
  --output rerun-plan.json
```

## Rollback boundary

Leave the server profile-data gate off and request product-owner direction if
any record shows ownership exposure, wrong-profile rendering, an unsafe
accepted write, silent overwrite, missing backup, integrity mismatch,
uncontrolled retry, wrong-target cleanup, or a browser that cannot resolve the
recorded head. The report should contain the sanitized failure and confidence
gap, not an account identifier or a copy of the affected profile.
