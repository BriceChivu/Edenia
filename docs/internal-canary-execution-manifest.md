# Internal canary execution manifest

Plan: `internal-canary-codex-autonomous-2026-09-05-v4`. Setup issue: #290.
This document prepares later packet execution; reading it does not invoke another
ticket or grant hosted mutation authority. Packet 0 runs only the local commands
and read-only capability checks below. Its observed hosted handoff is
`developer-canary` with an owner configured; setup must not take over that gate.

## Identity, capabilities and evidence

The executor resolves the approved repository from the active issue, fetches
`origin/master`, and records `git rev-parse HEAD` and the remote base before each
run. The runner/recovery review identity is the exact commit named in the latest
independent Standards/Spec receipt for #290, not a branch name. Hash the bytes of
this manifest and every invoked source file. A changed procedure requires renewed
review and local rehearsal before live use.

Use only the existing GitHub operator session, linked Supabase CLI/operator
connection, approved Google provider configuration session, approved canary inbox,
and existing external monitor. Resolve the private project from the linked
operator configuration and compare it to the approved project before every call.
Resolve the designated owner privately from the approved gate handoff and verified
Auth identity; never infer it from a displayed email or change it to match a test.
Private identities, endpoint URLs, tokens and capability locations stay outside
tracker receipts. No new hosted account, audience, origin or provider is implied.

The prepared `Edenia Canary` native Chrome profile has independently persisted
storage and completed Google login setup. Installed Chrome, Safari, independent
Chrome contexts and private mode are required. Real iPhone and separate hardware
are optional. For guarded tests use Playwright only under the user's explicit
browser-test authorization, with disposable contexts, interception registered
before navigation, service workers blocked and WebSockets denied. The local
request-guard rehearsal is not the Packet 1 hosted-opening harness. Packet 1 owns
that harness and must bind its guards to its exact deployed client.

For every numeric subcase, retain private source material and a sanitized JSON
record in `.cache/canary-evidence/<run-id>/`. Encode records through
`scripts/canary-evidence.mjs`; keep the returned exact bytes and SHA-256. The record
schema supplies scenario/subcase, procedure/runner/candidate identities, actual
UTC bounds, browser/OS, gate, assertions, expected/observed counts, cleanup and
source hashes. Source kind must distinguish local synthetic, live browser,
deployed schema and operator metadata. Never relabel mocked provider success.

Retain sources and sanitized artifacts for at least 35 days after the top-level
receipt and through any unresolved review. The independent Codex reviewer uses
the same host's private artifact directory, verifies source hashes and inspects
only necessary source assertions. Copy sanitized results and review text into the
PR and canonical issue receipt for durable tracker access. A console transcript,
unsupported PASS assertion or inaccessible private task reference is insufficient.
Missing source evidence fails the row. Do not close the issue before that review.

## Common execution and recovery protocol

1. Re-read the invoked issue, current PR/deployment, gates and checkpoint. Use the
   same `CanaryExecutionStore` SQLite file for the parent and repairs. Acquire a
   unique executor for a 30-second lease and renew every 5 seconds. A healthy
   competing executor means no dispatch. Reconcile expired leases and remote
   outcomes first; expiration is not non-application.
2. Call `writeCheckpoint` with invocation, manifest/review/base/deployment,
   artifact hashes, soak cursors, recovery and heartbeat references. Persist
   operation intent before each operator/provider/profile change. Retain stable
   operation IDs across ambiguous-result reconciliation; never blindly retry.
3. Use the Codex desktop same-task heartbeat every five minutes to observe the
   checkpoint and authoritative monitor histories. The tested temporary heartbeat
   delivered a same-task wakeup and was deleted with cancellation verified. The
   heartbeat stays quiet unless an actionable failure, private input or top-level
   completion occurs. It cannot supply missing five-minute monitor observations.
4. Before a bounded live window, verify the host remains powered, awake and online,
   the scheduling application is running, and task notifications reach the owner.
   Run the separate `watch-canary-execution.mjs` process using the private reviewed
   configuration; require `armed` before dispatch. Use a deadline no longer than
   the scenario budget, never longer than one hour. The watchdog owns gate-off and
   monitor-disable containment on lease loss or deadline. No host-loss success is
   assumed. If availability cannot be established, do not open the live window.
5. Use `observeCanaryProfile` before and after each profile-affecting subcase.
   For read-only phases require valid head, identical complete head, generation,
   revision, retained versions and protected-state fingerprints. Record booleans
   only. For accepted mutation/recovery compare the declared revision/generation
   change, exact logical profile facts and preserved prior versions separately.
6. Register the exact provider method/URL and operation budget before each action.
   Profile RPCs use the privately verified project's `/rest/v1/rpc/<name>` endpoint.
   Validate owner-derived target, generation, accepted revision and operation ID
   in the body before forwarding. No arbitrary host, extra query or batch is
   permitted. All profile operations not named for that subcase have budget zero.
   Read-only SQL runs once before and once after each atomic phase; neither query
   grants a profile write. Any extra attempt fails the phase even if rejected.
7. Default atomic browser budget: five minutes, one deliberate UI action, no
   automatic retry, no required-case skips. Separate navigation/reload/retry into
   numeric subcases. A failed or timed-out request is reconciled through the
   operation ledger and invariant verifier before any repeat.
8. On wrong owner, unexpected write, progress/history loss, invalid head,
   uncontrolled retry, changed candidate or unknown result: block new browser
   dispatch, let the independent operator contain, and verify gate off / owner
   removed / bounded monitor disabled. Only execute the named recovery below.
   Keep evidence and protected history. Never repair by rewriting an old audit
   row, deleting a receipt or reducing a generation/revision.
9. A stopped/failed watchdog is reconciled using the exact procedure in
   `canary-execution-support.md`. Damaged stores are preserved, not replaced by
   blank ledgers. Unprovable remote outcomes remain an exceptional pause.
10. A derived repair starts only after safe containment and pending-outcome
    reconciliation. `suspendForRepair` records the parent phase/evidence;
    `resumeAfterRepair` requires its closure receipt and returns to preflight.
    Re-inspect delivery and apply the readiness rerun planner before live work.

For profile recovery, follow `auth-operations.md` “Serious profile recovery”:
use one recorded incident, the exact `RECOVER` target confirmation, reviewed
runtime values, `private.begin_learner_profile_recovery`, then
`private.list_learner_profile_operator_candidates`. Select the preflight verified
candidate, confirm `RESTORE` for that exact version, and call
`private.restore_learner_profile_from_operator_candidate` with one stable operation
ID. Require the self-scoped `verify_my_operator_recovery` browser result at gate
off, private logical-profile comparison, protected prior versions and exactly one
new accepted revision. A changed/unknown candidate or missing receipt means stop,
not candidate guessing. The local database runner rehearses missing-head restore
and an idempotent repeat. It never invokes this procedure against hosted state.

## Local capability entry points

Run these at the reviewed source identity with the repository-supported Node
version and locked dependencies. Every named file must exist at that identity.

```sh
node --test tests/contracts/canary-execution-store.test.mjs tests/contracts/canary-operation-guard.test.mjs tests/contracts/canary-evidence.test.mjs tests/contracts/canary-containment-operator.test.mjs
node scripts/rehearse-canary-browser-guard.mjs
node scripts/rehearse-canary-database.mjs
node --test tests/contracts/release-readiness.test.mjs
npm run test:ci
```

The database command creates its own target and accepts no target arguments. It
runs all twelve named pgTAP suites, the private profile verifier / operator restore
rehearsal and three independent containment cases, then checks removal of its
containers and volumes. Nonzero exit, skipped assertions or failed cleanup fail
capability acceptance. Preserve the receipt and its source/log hashes.

The installed-browser fixture procedure is in `canary-execution-support.md`.
Its expected states are distinct A/B local/session/cookie values across two
profiles, persistence on reload, all-empty cleanup, and empty storage after a new
private session. This is storage capability, not hosted account acceptance.

## Scenario coverage and execution boundaries

These IDs map to #196's v4-effective criteria. Common protocol, evidence,
zero-skip, timeout and recovery requirements apply to every row. Live subcases
execute only under the later named packet invocation. Local source references
supply rehearsal fixtures; they never convert mocked output into hosted proof.

| Scenario / criteria | Numbered subcases and required observations | Allowed profile operations / gate | Rehearsal and recovery |
| --- | --- | --- | --- |
| deployment-identity / AC-01 | 1: Run `npm run release:readiness -- inspect --url https://www.edenia.study/ --output deployment.json`; privately read the server gate. Require exact full SHA, asset version and runtime hash, then bind the observed gate. Repeat after each deployment/gate phase. | Zero profile calls; final off. Inspector fetches release/config assets, not the public learner page. | `tests/contracts/release-readiness.test.mjs`; no state cleanup. Identity mismatch invalidates dependent evidence. |
| browser-matrix / AC-02 | 1–4: required installed Chrome, Safari, independent Chrome and applicable private mode. On the exact internal route assert visible expected gate-off UI, version and isolated storage. Record optional hardware gap without PASS. | Zero profile mutations; final off. | Browser isolation fixture above. Close only disposable contexts/tabs; preserve user profiles. |
| auth-google / AC-03 | 1: official Google button, actual chooser/approved account, accepted Auth state. 2: product sign-out and verified signed-out state. | Zero profile writes; one accepted Auth exchange and one sign-out; final off. | `tests/e2e/account-auth-methods.spec.mjs`; local mocks labeled. Recover by sign-out and disposing the empty internal context. |
| auth-email-otp-turnstile / AC-03 | 1: actual accepted Turnstile, one OTP request, one independently observed delivery, same-device code completion. 2–5: missing, expired, replayed and invalid token: one attempt per case, zero deliveries independently checked in the approved inbox/provider evidence. | Zero profile writes; one OTP attempt per subcase; final off. | `docs/research/turnstile-auth-canary.md` request/enforcement contract. Retain failure labels; never fabricate a token or bypass a challenge. Clear disposable Auth state after sign-out. |
| auth-method-equivalence / AC-03 | 1: Google then email; 2: email then Google. Privately compare verified provider UUIDs in both directions and emit equality only. Sign out between methods. | Zero profile writes; two accepted Auth exchanges and two sign-outs per direction; final off. | Account Auth contracts and actual provider checks. Different identity fails; do not link/create another owner implicitly. |
| profile-lifecycle / AC-04 | 1: new-profile routing with retained history, distinct from first-ever account creation. 2: returning owner. 3: reload. 4–5: recorded client clock just before/at 30-day boundary. 6–7: local/global sign-out. 8: shared-browser foreign local identity fixture. Require correct gate, no cross-profile render/write and preserved study facts. | Developer-canary; one resolver per declared navigation; all writes zero except the separately declared onboarding phase. | `first_signed_in_profile.test.sql`, `learner-profile-reverification.test.mjs`, `learner-profile-owner-replacement.test.mjs`. Foreign identity is a synthetic local fixture, not a second provider-authenticated owner. Owner-bound missing-head fixture requires the additional integration described below. |
| profile-sync-conflict / AC-05 | 1: local-first save with network held. 2: one accepted revision from A propagated to independently persisted B. 3: both contexts start at same accepted revision and make competing edits. 4: inspect conflict, choose one side explicitly. Require no silent overwrite and protected rejected facts. | Developer-canary; one `commit_my_learner_profile` per submitted edit; one `read_my_learner_profile_conflict` and one `choose_my_learner_profile_conflict` for choice. | `tests/e2e/learner-profile-conflict.spec.mjs`, sync/conflict pgTAP. Reconcile recorded commits; restore the preflight known-good logical profile through protected operator recovery if needed. |
| profile-failure-preservation / AC-05 | 1: one rejected backup/commit, 2: oversized input, 3: corrupt envelope. Keep accepted head and local work; require visible retry feedback and no uncontrolled retry. Transport injection remains labeled. | Developer-canary; one attempt per negative phase, zero accepted writes. All other writes zero. | Cloud-persistence contracts and sync pgTAP. Remove only injected local transport/fixture state; any changed accepted head invokes protected recovery. |
| profile-portability / AC-05 | 1: product export, 2: import reviewed exact-target fixture, 3: reject malformed/oversize import, 4: rollback accepted import. Require source unchanged on failure, displaced version protected, expected logical profile restored. | Developer-canary; one `import_my_learner_profile`, one `read_my_learner_profile_import_backup`, one `rollback_my_learner_profile_import`; invalid input has zero accepted import. | `tests/e2e/learner-profile-import.spec.mjs`, import pgTAP. Private files remain local; rollback uses the recorded import receipt, never a guessed backup. |
| profile-recovery / AC-05 | 1: recoverable missing head; 2: unusable head; 3: reject foreign/untrusted local state. Require owner-bound trusted source, preserved displaced history and logical study facts. | Developer-canary; one list, one read and one `restore_my_learner_profile` for a declared protected recovery; all unrelated writes zero. | Recovery pgTAP and private verifier. Hosted injection requires exact-owner/current-head conditional fixture plus protected recovery, as described below. |
| profile-start-over-undo / AC-05 | 1: confirm exact-target Start over, 2: inspect latest reset, 3: Undo. Require generation advance, retained identity, protected old generation, logical facts restored and one accepted revision per operation. | Developer-canary; one `start_over_my_learner_profile`, one `read_my_latest_learner_profile_reset`, one `undo_my_learner_profile_start_over`. | Start-over pgTAP and UI contracts. Use recorded reset ID. If Undo cannot safely complete, contain and use the preflight operator candidate. |
| database-security / AC-06 | 1: authenticated ownership/RLS; 2: unsafe direct-write/grant denial; 3: operator-isolation denial. Assertions must reach ownership predicates, not merely `access_disabled`. | Final off externally. Synthetic identities and transaction-local gate changes must roll back in the same SQL session. Zero durable fixture writes. | Owner policies, first-profile and auth-operations pgTAP. Transaction-scoped deployed execution needs the isolation wrapper described below; never run the unmodified local bootstrap against hosted state. |
| database-fences-idempotency / AC-06 | 1–4: stale revision, corrupt envelope, cross-generation and duplicate operation. Require the named predicate and exact zero/one accepted result inside the rolled-back fixture transaction. | Final off externally; transaction-local synthetic fixture only; zero durable writes. | Sync, conflict, import, reset/recovery pgTAP. Any SQL error rolls back; independently verify external gate and durable state unchanged. |
| backup-retention-restore / AC-06,08 | 1: protected/history/capacity counts; 2: external archive metadata/checksum; 3: restore into a newly generated isolated database; 4: compare expected table counts/checksums and dispose only that target. | Final off; no production restore or cleanup. | `docs/learner-profile-operations.md`, existing disaster-backup workflow. Existing artifact metadata proves access only; a current external restore receipt is required during #196. |
| legacy-final-gate / AC-07 | 1: voluntary migration; 2: controlled deadline routing; 3: inherited-session confirmation; 4: cloud conflict; 5: failed first backup with preserved local town. Mark each synthetic legacy namespace and clock injection. | Developer-canary; one `migrate_my_accountless_profile` per deliberate migration attempt; no retry merely to dismiss UI. | Accountless migration browser tests and pgTAP. Preserve export before migration; restore accepted logical state through the recorded protected candidate if necessary. |
| emergency-rollback / AC-07,08 | 1: snapshot exact runtime flags; 2: apply only bounded accountless rollback for explicitly marked local legacy fixture; 3: prove unmarked/foreign state denied; 4: restore exact prior flags and inspect delivered bytes. | Final off; no public rollout. Runtime change invalidates affected evidence/soak. | `docs/auth-operations.md`, legacy migration tests. Roll back only recorded flags, then run readiness rerun planning. |
| operations-monitoring / AC-08 | 1: bounded failure and recovery canary produces real DOWN/UP notification; 2: disable and verify; 3: stale watchdog / external backup / capacity; 4: at least 24 hours of both five-minute external and aggregate records with no gap over ten minutes and no provider/network failure. | Off; zero profile writes; one monitor-enable and one disable before the soak. Soak has zero canary transitions. | `docs/auth-operations.md`, `scripts/check-auth-health.mjs`, freshness script and monitoring pgTAP. A missing authoritative record is a gap. Disable the canary on failure; restart the soak when required. |
| switch-off-and-rerun / AC-08,09,10 | 1: verified developer-to-off transition and owner removal; 2: bounded monitor disabled; 3: affected final-context reruns in runbook order; 4: criterion-by-criterion audit and explicit confidence gaps. | Final off; one conditional transition, never signed-in-public. | Readiness `plan-rerun` procedure in runbook. Use actual candidate/surface differences; never carry invalidated observations onto new bytes. |

## Packet-specific procedures

Packet 1 (`packet-1-profile-opening`, #286) records separate numeric phases for
synthetic deployed-client ready response, malformed bookkeeping, stale payload-free
bookkeeping, and the real valid-head opening. Each activation has its own reload
phase. The retry phase injects exactly one transport failure and permits exactly
one deliberate retry returning the unchanged actual resolver result. Every phase
has one expected resolver attempt; the deliberately failed attempt and live retry
are separate records. No sync, backup, conflict choice, import or reset is allowed.
The body must be the null-onboarding resolver request. Full pre/post private
head/version/protected-state comparisons are mandatory. A local mock cannot stand
in for the real successful response. Packet 1 supplies and reviews its hosted
harness before live use; Packet 0 tests access and interception mechanics only.

Packet 2 (`packet-2-provider-origins`, #291) starts at gate off with empty internal
app storage and the preflight private invariant snapshot. Inspect the current GIS
flow, nonce, runtime client selection and accepted audiences before applying its
deterministic provider decision. Preserve all existing production origins and
primary-client/secret placement. The production-client branch adds only
`http://localhost` and `http://localhost:8000`; the dedicated-client branch keeps
production origins unchanged and adds only its reviewed audience/local selection.
Never rotate a secret for an origin change. Record the exact prior configuration
privately and restore that exact delta on failure.

Provider-origin subcases: 1, official button on `http://localhost:8000/?internal_test=1`;
2, actual approved-account authentication and sign-out; 3, hosted internal-origin
production-client authentication/sign-out; 4, unrelated local port remains denied;
5, compare generation/revision/history unchanged after both accepted flows.
Record the actual FedCM or popup path, HTTP localhost referrer policy and applicable
COOP behavior using current official GIS documentation. Two successful Auth
exchanges, two sign-outs, zero learner-profile mutations; provider-negative port
has zero accepted Auth exchange. The preflight source and provider snapshots,
not invented example values, determine the exact rollback delta.

## Owner-bound head fixture

`injectCanaryHeadFixture(query, snapshot, kind)` in
`scripts/canary-head-fixture.mjs` prepares only `missing-head` or `unusable-head`.
It requires the private verifier's valid-head snapshot and exact current version,
an already protected restored current version with at least ten minutes remaining,
the designated developer-canary gate, and unchanged complete head-row fingerprint.
The SQL transaction locks gate/head/protection, uses one-second lock and five-second
statement timeouts, and changes exactly one head row. It never edits an immutable
version, receipt, Auth identity or another owner. A mismatch fails without injection.

Before fixture injection, retain the private snapshot/current-version ID and
operation intent durably, arm containment, and ensure the operator recovery
candidate is valid. If no protected restored current version exists, use the
reviewed operator recovery procedure at gate off with the known-good current
candidate to create one protected accepted revision. This is an explicit fixture
preparation operation under the later invoked scenario, not a Packet 0 action.
Count that restoration separately and include it in the gate/rerun plan. Do not
fabricate or directly insert a protection ledger record.

Invoke injection once. Verify the missing/unusable head and unchanged retained
versions/protected state before browser activation. For missing-head new routing,
observe the null-onboarding outcome without accepting a new blank profile. For
unusable-head recovery, record any actual resolver restoration as the declared
operation rather than calling it read-only. At exit, contain the gate and restore
only the recorded protected candidate through a fresh recorded recovery incident.
Require logical profile equality, every prior version preserved, a valid head,
expected new revision and the owner-scoped browser recovery verification. If
interrupted after injection, the watchdog only contains; the resumed executor
reconciles the fixture outcome and performs this same protected restoration.

The local database runner rehearses both fixtures, stale-head rejection,
retained/protected invariants, and all three independent containment failures
while a head is missing, followed by restoration of the recorded candidate.
This exercises recovery mechanics with synthetic data. It is not an actual
hosted fixture or a second provider-authenticated identity.

## Transaction-scoped deployed-schema probe

The exact reviewed entry point is
`supabase/tests/canary_deployed_schema.test.sql`. For #196 only, after read-only
preflight verifies the approved linked target and external gate off, run:

```sh
supabase test db supabase/tests/canary_deployed_schema.test.sql --linked
```

Run from the privately verified linked workdir at the reviewed source identity;
never supply a different connection string. The file opens one transaction,
locks/asserts the off/null-owner gate, refuses collisions with its two synthetic
fixture IDs, sets statement/lock timeouts, creates only those rolled-back fixture
users and a synthetic owner head, and changes the gate only within that transaction.
It executes 13 pgTAP assertions covering RLS, direct-write denial, operator grant
isolation, a real accepted commit, exact idempotent repeat, stale and cross-generation
conflicts, corrupt integrity denial and unchanged final counts. It always rolls
back; no synthetic Auth identity becomes durable or provider-authenticated.

Require `Files=1, Tests=13`, `Result: PASS`, no skipped/TODO assertion and exit zero.
An error/timeout fails evidence even when rollback succeeds. Re-read external gate,
absence of fixture owners, and the designated owner's invariant snapshot after
session termination. Require no change. A gate denial is not a substitute for any
of the actual predicate assertions. CI explicitly routes this file and runner
changes to database checks; the local rehearsal also runs it with unrelated
synthetic profile history already present.

## Remaining acceptance receipts

Before #290 closes, final review must bind the complete source/manifest, capability
checks, local logs and sanitized artifacts to the delivered SHA. The approved
isolated external-archive restoration procedure, host-availability/notification
receipt and current artifact access checks must be verified, not assumed from
older successful workflow runs. An unresolved required item keeps Packet 0 open;
it is not a passing scenario, a future manual owner check or optional-device gap.

## Lifecycle clock and foreign-local-state procedures

For the three boundary observations, use a disposable Chrome context containing
only the approved owner's already verified local profile. Install Playwright's
clock with `await page.clock.install({ time: new Date() })` before the initial
navigation. Complete exactly one real resolver activation, record the private
numeric `verifiedAt` from
`edenia_v1_internal_test_learner_profile_owner_verification_v1`, and verify its
owner matches the approved owner. Do not change that record to invent a successful
verification. Capture the private invariant snapshot and seal that activation's
guard before the offline subcases.

Call `await context.setOffline(true)`. Let the offline event settle, and use
`await page.clock.fastForward(delta)` where `delta` is
`verifiedAt + 2592000000 - 1 - await page.evaluate(() => Date.now())`.
Require a nonnegative delta; otherwise discard this context and start the fixture
again before any live operation. At this point require `#mainApp` visible and
`#learnerProfileAccessGate` hidden. Advance one millisecond: the exact inclusive
30-day boundary must remain active. Advance one further millisecond: require the
access gate visible and the main app hidden, with no rendered study facts and zero
profile requests. Record all three actual mocked-clock values, the real UTC
observation times, and the explicit clock/transport injection label. No synthetic
clock is submitted to the server. Use a separate fresh, real-clock context for the
ordinary reload scenario; never report these offline checks as provider aging.
Cleanup closes the entire disposable clock context, which removes its timer mocks
and injected offline state; verify the private server snapshot unchanged.

For shared-browser replacement, generate a synthetic local fixture from the
reviewed local build in an otherwise disposable preparation page using
`window.defaultState(4, [], 'light', [], 'en')`. Set all onboarding completion
fields as in `seedPrivateLearnerProfile` in the reviewed access browser test, and
set a single channel with ID `canary-foreign-local` and name
`CANARY FOREIGN LOCAL MARKER`. Generate fresh synthetic UUIDs for the foreign
owner/profile; privately assert the owner differs from the approved owner. This
creates no Auth account and contains no real learner's profile.

Use a separate authenticated approved-owner context whose internal app namespace
has been verified empty at gate off. Preserve its genuine Auth state; never seed
or replace an Auth session. Before its first developer-canary navigation, install
one `context.addInitScript` constrained to the exact internal origin and
`internal_test=1`. Require the target fixture keys absent, then write:

- `edenia_v1_internal_test`: the synthetic state bytes above;
- `edenia_v1_internal_test_learner_profile_access_v1`: JSON with `version:1`,
  `activationId:null`, `activatedAt:Date.now()`, the synthetic owner/profile,
  `generation:1`, and `revision:4`;
- `edenia_v1_internal_test_learner_profile_sync_v1`: JSON with `version:1`, the
  same synthetic owner/profile, `generation:1`, `acceptedRevision:4`,
  `pending:null` and `queued:null`.

The init script must use an in-context one-time marker so a reload does not seed
again. Refuse an existing fixture key rather than replacing it. Permit one real
approved-owner resolver attempt; every write has budget zero. Require zero
visible occurrences of `CANARY FOREIGN LOCAL MARKER` before and after resolution,
no foreign-owner operation, and either safe approved-owner activation or an
explicit replacement/recovery gate without foreign content. Record which branch
actually occurred. The foreign fixture is synthetic UI isolation evidence; the
transaction-scoped SQL separately proves actual server ownership predicates.
Cleanup disposes the whole context and verifies the approved owner's complete
server invariants unchanged. Never use a regular user browser namespace for this
fixture or describe it as a second real authenticated owner.

## OTP negative-request and delivery procedures

These are provider subcases, executed only during the invoked gate-off acceptance
phase with the approved recipient. Keep tokens and request bodies in transient
runner memory only. Do not persist a HAR, trace, screenshot of a code, raw request,
recipient, session or CAPTCHA token. The guard compares the exact private Auth
origin and `/auth/v1/otp`, method POST, approved recipient and one-attempt budget.
All profile operations have budget zero.

Before each subcase, privately record the approved inbox's latest message cursor
and real UTC time. The positive case establishes the actual approved Auth sender
and template headers. For ten minutes after each attempted request, query Gmail
across all folders (`in:anywhere`) for that exact sender, approved recipient and
UTC interval, using both new message IDs and the saved cursor to deduplicate.
Inspect only necessary header/template metadata; never retain the code or body.
Record counts and time bounds, not messages. A positive case requires one accepted
Auth request and exactly one matching inbox message. A negative case requires the
terminal CAPTCHA-specific rejection class plus zero independently observed matching
messages in that window. Label this as a bounded inbox delivery observation, not
an SMTP-provider receipt or an unlimited guarantee. A rate-limit/network error,
missing inbox access, ambiguous sender classification or delayed/unresolved request
is not proof of CAPTCHA rejection or zero delivery. It fails the case and requires
reconciliation. Run cases serially so cursors and windows do not overlap ambiguously.

1. **Positive and replay:** intercept the product's valid OTP POST after the real
   Turnstile widget succeeds. In the in-memory handler retain only the token and
   request fields needed for this exact recipient. Forward once through the guard,
   complete the actual same-device OTP, and verify one delivery. After the product
   cooldown, use a new one-attempt negative-case guard to submit the same consumed
   token in `gotrue_meta_security.captcha_token`. Require CAPTCHA rejection and the
   independent zero-delivery window. Erase the retained token in `finally`.
2. **Missing token:** construct the same approved-recipient OTP body but omit
   `gotrue_meta_security.captcha_token`; issue one guarded POST through the approved
   Auth channel. Require CAPTCHA rejection and zero delivery. Separately exercise
   the product's disabled/absent-token button and require zero client attempts;
   that client refusal is not the server rejection proof.
3. **Expired token:** obtain a fresh genuine widget token through a product OTP
   attempt intercepted before dispatch. Abort that acquisition request and record
   zero provider attempts. Keep the token only in memory for 301 real seconds,
   with the lease renewed and watchdog armed; do not advance a synthetic clock.
   This wait is its own phase. Then use a fresh five-minute, one-POST guard to
   submit the expired token once. Require CAPTCHA rejection and zero delivery;
   erase the token in `finally`. If interrupted, discard it rather than resuming
   an unknown acquisition/request.
4. **Invalid token:** issue one guarded approved-recipient OTP request with the
   literal synthetic token `canary-invalid-token`. Require the CAPTCHA-specific
   rejection and independent zero delivery. Do not use provider test credentials
   or change the production site key/secret.

Use a fresh widget state/token for each actual acquisition; never force Cloudflare
to choose an interactive or non-interactive mode. A private challenge is completed
through the approved user interaction when required, not bypassed. At the end,
sign out, dispose the empty app context, verify unchanged learner-profile state and
record that all transient tokens were discarded.

## External backup and host capability receipts

Use the existing weekly `learner-profile-disaster-backup.yml` workflow as the
isolated restoration runner. Its `Start isolated restore database`, `Restore dump
into isolated database`, and `Stop isolated restore database` steps are the
concrete restore and cleanup entry points. Packet 0 inspected a completed run and
its unexpired artifact; it neither downloads learner data nor dispatches the
workflow. The workflow also performs guarded retention, so do not trigger that
composite job merely to obtain setup evidence.

During #196, select a completed scheduled run whose workflow/migration source and
freshness satisfy the actual final candidate's evidence policy. If necessary,
observe the next scheduled run for at most seven days using the authorized task
heartbeat; do not manufacture a fresh restore from an old successful job. Read the
job's exact step outcomes and artifact metadata through GitHub. Privately download
that exact artifact ZIP via the artifact-ID API, compare its SHA-256 with the
GitHub artifact digest before opening it, and require its sole expected archive
member. Inspect that member with
`inspectCanaryBackupArchive` from `scripts/canary-backup-verifier.mjs`.
The inspector verifies archive membership, schema/data checksums and exact profile
COPY counts without executing SQL or extracting archive entries to disk.

Compare these expected head/version counts with the same workflow run's isolated
restore output and require restore/cleanup exit success. Verify archive creation
preceded that restoration and the restored file is the same archive variable in
the reviewed workflow source. Retain only hashes, counts, job/artifact identities,
UTC times and cleanup result in the public receipt. Raw archives remain in the
private evidence store for 35 days and are never attached to the PR or issue.
Checksum agreement alone does not authenticate an archive; the independently
retrieved GitHub digest and immutable reviewed workflow/run identity are required.
The archive-inspector local contract creates an actual synthetic tar archive and
proves changed data is rejected.

The independent watchdog runs on this Mac; the Codex desktop heartbeat resumes
this same task. The notification route is the Codex task inbox, with private
interaction demonstrated by the setup replies and scheduler wakeup recorded in
the Packet 0 receipt. This does not promise an OS push notification. Before each
bounded live interval, check `pmset -g batt`, confirm sufficient power/network and
run an owned `caffeinate -i` process for that interval. Stop only that owned process
on exit. Do not assume the laptop stays available for a 24-hour soak: the external
monitor supplies the continuous history, and resumption must reconstruct any
missed task observations from that history. If host availability for a live
mutation window cannot be established, keep the gate off and do not start it.
