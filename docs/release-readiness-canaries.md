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

Initialize a report:

```sh
npm run release:readiness -- init \
  --deployment deployment.json \
  --profile-data-gate developer-canary \
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
  --metadata '{"evidenceEnvironment":"deployed-browser","provider":"email","providerOutcome":"accepted","turnstileOutcome":"accepted","otpOutcome":"verified","emailDeliveryCount":1}'
```

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
| `operations-monitoring` | The independent five-minute Auth monitor has no gap over ten minutes in a 24-hour window; the provider-failure canary delivers real DOWN and UP notifications; the stale-record watchdog, weekly external-backup restoration, capacity evidence, and rollback triggers are verified. |
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
