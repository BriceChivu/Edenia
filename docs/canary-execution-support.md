# Canary execution support

These modules implement local Packet 0 mechanics. They do not enable unattended
hosted execution. The live browser interception adapter, independently operating
containment mechanism, verified recovery procedures, and complete scenario
manifest remain prerequisites for Packet 0 acceptance.

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
read/reconciliation bookkeeping but reject new operation intent. Derived repair
suspension/resumption and complete deployment/checkpoint metadata integration
are not implemented by this module yet.

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
