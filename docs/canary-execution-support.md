# Canary execution support

These modules implement local Packet 0 mechanics. They do not enable unattended
hosted execution. The local browser interception and independent containment rehearsals below
are implemented. The complete scenario manifest and reviewed hosted fixture/
recovery integration remain prerequisites for Packet 0 acceptance.

Run the focused local contracts with the repository-supported Node version:

```sh
node --test tests/contracts/canary-execution-store.test.mjs tests/contracts/canary-operation-guard.test.mjs tests/contracts/canary-evidence.test.mjs
```

## Execution store

`scripts/canary-execution-store.mjs` exports `CanaryExecutionStore`. Use one local
SQLite file shared by every executor for the parent and its derived repairs.
The file must live on this runner's local filesystem, not a network filesystem or
separate per-process copies. SQLite `BEGIN IMMEDIATE` makes acquisition and
operation-intent changes atomic across connections. The database uses private
file permissions. This is coordination between trusted runners, not a security
boundary against another process running as the same OS user.

Initialize with the verified candidate SHA, observed gate, and phase. Each lease
acquisition uses a new opaque executor reference; never reuse one after release.
Lease duration is 1–60 seconds. Callers supply trusted nonnegative integer wall
clock milliseconds, renew before expiry, and must stop dispatch when renewal
fails. A timestamp parameter exists for deterministic rehearsal, not for callers
to extend an expired lease by supplying an old time.

Before dispatch, persist `beginOperation` with the exact candidate, gate and
stable operation ID. Record `finishOperation` only after an independent verifier
establishes `completed` or `not-applied`, with its evidence SHA-256. A timeout is
an ambiguous outcome, not proof of non-application. The store never performs the
remote operation or verifies the supplied observation.

Expired leases cannot be acquired directly. `reconcileExpired` requires proof
that the prior executor stopped, an independently observed candidate/gate, an
unambiguous pending outcome, and evidence hash. Completed operations cannot be
replayed. Proven non-application permits retry; a changed candidate/gate resets
the phase to preflight and requires evidence revalidation. Stop and contain when
an outcome cannot be established. The caller must account for operations still
in flight remotely even after its local executor stops.

`advancePhase` persists an evidence hash and enforces the normal phase order.
Skipping `waiting-soak` requires the explicit `skipSoak` argument and a receipt
establishing the selected ticket's no-soak branch. Closed checkpoints permit
read/reconciliation bookkeeping but reject new operation intent. `writeCheckpoint`
persists bounded plan/invocation, manifest/review/base/deployment, artifact, soak,
cursor, recovery and heartbeat metadata. `checkpoint` combines it with the
current phase, lease, watchdog, pending operation and repair ledger.

After verified containment and remote-outcome reconciliation, acquire a fresh
lease at gate off and use `suspendForRepair` to retain the parent phase and
safe-state evidence hash. The parent cannot dispatch while suspended. The derived
repair uses the same coordination store and cannot create a second live executor.
`resumeAfterRepair` requires the verified closure receipt and new candidate,
then always returns the parent to preflight for deployment/rerun inspection.

## Operation guard

`scripts/canary-operation-guard.mjs` exports `createCanaryOperationGuard`. Supply
exact method/URL rules and expected request counts. The guard refuses unexpected
operations, counts above budget, cancellation, timeout, clock reversal, and all
dispatch after sealing. One violation keeps the guard failed. `finish` reports
only opaque operation names and counts; it requires every expected count.

This is a policy evaluator, not network interception. The reviewed browser
adapter must call it before every dispatch, stop on false, prevent worker or
alternate-transport bypasses, and distinguish attempted requests from accepted
server operations and actual mail deliveries. URL/method matching does not
validate owner or payload: scenario-specific target/body verification is also
required before a live mutation. A request-count match is never delivery proof.

## Reviewer-safe evidence

`scripts/canary-evidence.mjs` exports `encodeCanaryEvidence`. It rejects unknown
fields and free-text payloads, accepts enumerated assertion/operation classes,
and preserves failed observations. It returns the exact JSON bytes and SHA-256.
The envelope identifies the run, numeric subcase, procedure hash, runner/source
SHA, candidate, gate, browser/OS versions, timestamps, counts, cleanup and source
hashes. Synthetic evidence remains explicitly synthetic.

Retain private source material separately in the approved evidence store. The
encoder does not upload artifacts, select access policy, verify source hashes
against that private material, or attest that an observation happened. The final
manifest must supply retention and an independent reviewer retrieval mechanism.
Never place secrets, user identifiers, sessions, raw profiles, or private
endpoints in public PR/issue receipts. Hash validation alone is not evidence
provenance verification.

## Remaining integration boundary

The focused suites exercise synthetic local mechanics and rejection paths.
They do not count as current desktop-browser access, deployed database checks,
provider authentication, live profile recovery, emergency containment, or a
completed scenario. Keep #290 open until the remaining manifest, adapters,
recoveries, capability checks and full acceptance audit are delivered and
independently reviewed. Do not use these modules to justify any live operation
before those prerequisites are met.

## Disposable database rehearsal

Run `node scripts/rehearse-canary-database.mjs` with Docker running and the
repository's Supabase CLI available. The command accepts no target arguments.
It creates a uniquely named local project and a private run directory under
`.cache/canary-database`, boots an empty database, applies each repository
migration inside an explicit transaction, then runs the twelve named
profile/auth/owner-isolation/transfer pgTAP suites plus the thirteen-assertion
transaction-scoped deployed-schema probe. This avoids the standalone
`db start` migration path's missing transaction around the existing founding
member `LOCK TABLE` statement. It does not change that product migration.

Every query runs either through `--local` with the new workdir or through the
exact generated Docker container name. The command never links a project,
accepts a connection URL, resets an existing stack, or changes hosted state.
On normal exit, failure or a handled SIGINT/SIGTERM it stops its own project
without retaining database volumes and checks resource removal. Keep the run
directory's private logs and structured receipt for review; the console reports
counts and cleanup status. A failed or interrupted run cannot report complete.
An OS kill or machine loss still needs independent containment/reconciliation;
this command is not the independent live watchdog.

## Installed-browser isolation rehearsal

Serve only the fixture directory, on a separate loopback origin:

```sh
node scripts/serve-static.mjs --host localhost --port 4177 --root tests/fixtures/canary-capability
```

Using native/approved browser controls, open `http://localhost:4177/` in two
independent Chrome profiles. Verify each initially reports empty local, session
and cookie markers. Store context B in the isolated profile and context A in
the regular profile. Reload both and verify each retains its own three values.
Use Clear rehearsal markers in both; require all three values to report empty.
In Chrome private mode, store a marker, close the entire disposable private
session, reopen private mode and verify all three markers are empty. Repeat a
store/clear interaction in installed Safari. Close only the rehearsal tabs and
stop the fixture server. Preserve user browsing windows and the prepared canary
profile. All values are synthetic and confined to one named fixture key.

Record actual installed browser/OS versions, the fixture content hash, native
profile identity, observed marker states, cleanup and UTC time. This proves
local browser capability; it does not assert hosted authentication, sync or
provider delivery results. Do not navigate a hosted learner surface while
Packet 0 observes an already-enabled profile gate.

## Installed-Chrome request interception rehearsal

With the explicit authorization to use Playwright for guarded browser tests,
run `node scripts/rehearse-canary-browser-guard.mjs`. It launches the installed
Chrome channel in disposable headless contexts and starts its own loopback
server. It never loads an existing Chrome profile or accepts a remote target.
Interception is registered before navigation, service workers are blocked, and
WebSockets are denied. One scenario reaches its exact request budget. Another
attempts a forbidden POST and then an otherwise-allowed POST; both must be
stopped before dispatch, and the server independently counts zero forbidden
requests. All contexts, the browser and the loopback listener are closed.

The structured console result reports the observed Chrome version and synthetic
request counts. This proves the exercised fetch interception paths, not every
possible browser transport or an authenticated hosted workflow. Scenario-specific
body/owner verification and the final hosted profile-opening harness remain
separate requirements.

## Independent containment

`watch-canary-execution.mjs` runs as a separate process from the executor. Start
it with one private configuration file after acquiring the exclusive execution
lease; require its `armed` acknowledgement before permitting a live action:

```sh
node scripts/watch-canary-execution.mjs "$PRIVATE_WATCHDOG_CONFIG"
```

The configuration contains `mode`, `workdir`, `projectRef`, `expectedOwner`,
`candidate`, `executor`, `store`, and an absolute millisecond `deadline` no more
than one hour ahead. `linked` uses the existing authenticated Supabase CLI,
checks the linked project reference before every command, conditionally changes
only the matching developer gate to off, removes the designated owner, and sets
`EDENIA_AUTH_MONITOR_CANARY_ENABLED=false`. It verifies the gate and the flag's
SHA-256 digest afterward. A different owner, public gate, or ambiguous off state
is refused. No credential is extracted or copied. Packet 0 never invokes the
linked adapter's mutations.

`local-rehearsal` accepts only the uniquely named disposable project generated
by the database runner, uses the same gate-containment function against that
actual Postgres database, and models the Edge Function secret in a private local
file. This substitution is explicit: it tests the control flow, not hosted
Management API write permissions. The linked CLI's read path and command shape
are capability-checked separately; later packet preflight must revalidate the
secure operator capability before arming.

The watchdog atomically claims containment, polls the durable lease every
250 milliseconds, and triggers on executor replacement, expiry, candidate
change, terminal closure, its hard deadline, a reversed wall clock, or loss of
store readability. Its hard deadline also uses a monotonic elapsed-time bound.
It revokes dispatch before containment when the store remains writable. If the
store becomes unreadable after arming, it still performs exact-owner operator
containment and reports the checkpoint failure distinctly. Failed or unknown
operator outcomes are not automatically retried. Preserve the journal and
operator evidence and reconcile before another executor or watchdog takes over.

This process must remain running on an awake, network-connected host for the
bounded canary interval. The task heartbeat observes its health; it is not the
containment process. Host loss, network loss or watchdog failure cannot be
represented as successful containment. Do not arm a hosted scenario without
verified host availability and a notification path. An actual live recovery
must also reconcile in-flight operations and protected profile state; gate-off
alone does not prove those operations never committed.

The disposable database runner includes independent-process rehearsals for
executor SIGKILL, hard deadline, and an unreadable execution store. They verify
actual local gate-off, the modeled monitor-off state and unchanged profile row
counts. The profile recovery/Start-over/import pgTAP suites separately exercise
logical progress and protected history; empty rehearsal row counts do not
substitute for those assertions.


### Watchdog reconciliation and damaged checkpoints

An armed, containing or failed watchdog fences acquisition, lease replacement
and release. Dispatch and renewal also check containment and its deadline.
`beginContainment` must match both its recorded reference and executor. A stale
watchdog must exit without an operator call. Only SQLite I/O, corruption,
not-a-database or cannot-open errors permit the already-armed process to perform
its exact-owner fallback; locks and coordination rejections do not.

For a writable journal with an interrupted/failed watchdog, first stop and verify
termination of that watchdog and the old executor. Privately establish that all
remote requests are terminal, read the actual gate and monitor, and contain if
needed. An off observation alone does not prove that an earlier queued request
cannot arrive later. Retain the operator evidence hash. Only then call
`reconcileContainment(reference, now, { previousWatchdogStopped: true,
terminalRemoteOutcomesVerified: true, gate: 'off', monitorDisabled: true,
evidenceHash })`. Reconcile each pending operation with `reconcileExpired`
separately before acquiring a unique replacement executor.

If SQLite itself is damaged, do not replace it with a blank store or treat missing
intent as proof of non-application. Stop all owned executor/watchdog processes,
preserve the damaged file and private operator results, and keep the hosted gate
off and monitor disabled. Recover the last intact private checkpoint and operation
receipts into a new local store only after independently reconciling every remote
outcome and marking all possibly completed operations non-repeatable. If that
history or a terminal remote outcome cannot be proved, keep the execution paused
for operator reconciliation. The local corrupted-store rehearsal verifies safe
containment, not automatic recovery of destroyed evidence.

### Private profile verifier

`observeCanaryProfile(query, owner)` in `scripts/canary-profile-verifier.mjs`
uses the verified operator's read-only SQL channel and the privately confirmed
owner. It checks head/version identity, generation/revision, byte length, digest
and envelope validity, and fingerprints the complete head, logical profile and
each retained version and protection record. `compareCanaryProfiles(before, after)` returns booleans
only. Keep snapshots private; never print their owner or fingerprints into a
public receipt. A valid digest inside a single row is not a pre/post comparison.
For a read-only scenario require all unchanged predicates; recovery may advance
revision and add a version, but requires logical profile equality and every prior
version and protection record preserved. These predicates do not authorize a recovery or prove that a
previously unrecorded historical protection deadline was correct.

The complete scenario mapping, concrete clock/storage/OTP procedures, linked
schema probe and archive provenance procedure are in
`docs/internal-canary-execution-manifest.md`. Its acceptance receipts remain
separate from the procedures; do not infer live PASS from a prepared command.
