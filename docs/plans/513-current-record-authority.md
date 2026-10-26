# Changed-record progress sync for issue #513

This records the chosen implementation following PR #514's cosmetic-save,
gameplay-deferral and startup-maintenance release. The subsequent amendment adds
the current-record authority, typed delivery, small local checkpoints and a
measured five-second target for the existing restricted authentication trial.
Full-envelope delivery remains the supported path for unsupported/low-frequency
edits and recovery operations.

## Why the transport cannot change independently

Today `learner_profile_heads.current_version_id` references an immutable complete
portable profile. The resolver also requires that version's generation and
revision to equal the head. Advancing the head to revision 107 while its snapshot
remains at 100 would make ordinary opening classify the head as unusable and
attempt predecessor recovery. Mutating the referenced version instead would
change copies already protected by conflict, reset and import receipts.

The owning sources are
[`create_first_signed_in_profile.sql`](../../supabase/migrations/20260820220116_create_first_signed_in_profile.sql),
[`allow_empty_verified_owner_onboarding.sql`](../../supabase/migrations/20260901110000_allow_empty_verified_owner_onboarding.sql),
[`resolve_divergent_learner_profiles.sql`](../../supabase/migrations/20260821154351_resolve_divergent_learner_profiles.sql)
and [`bounded_profile_handoff.sql`](../../supabase/migrations/20261012132414_bounded_profile_handoff.sql).
A small request passed to the existing commit would still validate and insert a
complete historical version. It would not satisfy the intended storage saving.

## One authority, with less frequent recovery snapshots

Use the existing owner/profile/generation/revision head as the sole authority.
Add one owner-scoped current-record table for the existing typed units: video
personal fields and metadata, Anki days, settings/channel membership, island and
coupled progression/economy. Do not create another independently advancing head
or an event ledger. Keep an explicit snapshot revision on the existing head so
its recovery pointer can lag safely. Initialize current records from the valid
existing envelope atomically under the existing owner write lock.

A typed commit must validate explicit supported operations, deletion intent,
payload bounds and coupled invariants, then update the selected current records,
head revision and immutable operation receipt in one transaction. Missing fields
mean unchanged. A stale generation or replacement boundary cannot be rebased by
upload arrival time. Unsupported operations retain a full-envelope path through
the same authority. Reuse the existing schema/study-fact validation; extracting
unit validation must preserve the cross-unit checks rather than merely checking
JSON shape.

At revision 107 with snapshot 100, opening and portable export assemble revision
107 from the authoritative current records, validate it, and return its complete
portable envelope. They must never return snapshot 100 labelled as revision 107.
Create ordinary recovery snapshots at approximately the existing 30-second
cadence and before an operation needs to protect a current version. Snapshotting
does not advance the accepted revision. There is no acknowledgement until the
current records themselves are durable.

## Compatibility boundaries to adapt together

Sixteen current `learner_profile_rpc` functions directly use heads or versions.
`open_my_learner_profile` additionally delegates to the resolver. The following
boundaries must use the same current-record reader or materialize an exact
immutable current copy under the existing owner lock before retaining its ID:

| Boundary | Existing RPCs |
| --- | --- |
| Opening | `resolve_my_learner_profile`, `open_my_learner_profile` |
| Delivery and receipt | `commit_my_learner_profile`, `commit_my_learner_profile_handoff`, `read_my_learner_profile_write_receipt` |
| Protected conflict | `read_my_learner_profile_conflict`, `choose_my_learner_profile_conflict` |
| Reset and Undo | `start_over_my_learner_profile`, `read_my_latest_learner_profile_reset`, `undo_my_learner_profile_start_over` |
| Recovery | `list_my_learner_profile_recovery_candidates`, `read_my_learner_profile_recovery_candidate`, `restore_my_learner_profile` |
| Import and rollback | `import_my_learner_profile`, `read_my_learner_profile_import_backup`, `rollback_my_learner_profile_import` |
| Initial attachment | `migrate_my_accountless_profile` |

Trusted-predecessor and operator recovery must distinguish a corrupt current
record from a lagging snapshot, remain within generation boundaries, and retain
displaced acknowledged records before replacement. Initial creation, explicit
replacement and reset install the new current records atomically. A protected
version ID must always name immutable complete content.

Retention and capacity reporting must include the current-record table and keep
the current authority plus protected copies. Cleanup cannot discard accepted
records because their latest ordinary recovery snapshot is older. Browser
portable export uses the assembled envelope. Separately audit the account export:
the present service export still includes `state_backups`, and does not yet
include the current learner-profile head/version; do not assume that endpoint
already supplies the latest portable profile.

Old full-envelope writers must acquire the same lock, compare against the same
current revision and replacement boundary, and update the same authority. If
their safety cannot be preserved, reject them with an explicit upgrade outcome
before a write or conflict snapshot. Never leave an old RPC accepting writes
against snapshot 100 while current records are at 107. Old readers must receive
a complete current envelope or a deliberate upgrade outcome.

Keep an exact request digest and accepted result per operation. Retain at least
the existing practical retry window when evaluating five-second delivery; the
existing 256-receipt count alone reduces it from about 128 to 21 minutes. A retry
whose receipt is gone must compare its original base revision and cannot be
applied again as a fresh operation. Return a stale/unknown-receipt result and use
the existing protected reconciliation with the retained local candidate; never
infer duplicate XP or resource deltas from a missing receipt.

## Release order and rollback

1. Implement and locally verify the authority/read/protection seam at the existing
   cadence before changing the client transport. Cover revision 107/snapshot 100,
   owner isolation, invalid operations, exact retry/input mismatch, reset fences,
   protected-copy retention, latest read/export and old-client behavior.
2. Deploy compatible server readers and writers with typed acceptance disabled.
   Keep the restricted tester admission. Existing full-envelope operations must
   remain readable and pending local edits must remain deliverable.
3. Enable typed delivery only for the existing restricted internal-test route.
   Persist the dirty units and pending identity with the local checkpoint where
   feasible; preserve the existing fallback, immutable sent request, newer queued
   edit and receipt/install fences. Migrate pending envelopes without dropping
   their candidate or receipt identity.
4. Measure one video checkpoint, Anki batch and meaningful island change. Evaluate
   five-second delivery last, changing client and server cadence together only if
   preparation, database work and total traffic justify it. Active visible game
   input or pawn work still has precedence over video playback and all automatic
   timers.
5. To roll transport back, stop typed acceptance under the owner lock, materialize
   every newer accepted current revision as a valid complete envelope, and return
   to full-envelope delivery through the compatible server authority. Preserve
   unsent candidates and existing receipts. Keep the upgraded Godot snapshot
   reader: rolling back transport cannot make an older game understand a newer
   durable island format. Do not drop the current-record table or revert to an
   older server resolver while any accepted update exists only there.

## Short baseline

On October 26, the fixture already used by
[`cloud-profile-save.mjs`](../../scripts/diagnostics/cloud-profile-save.mjs), with
500 retained videos, produced 543,836 canonical envelope bytes. The first complete
video record was 1,067 bytes: 451 bytes of personal fields and 617 bytes of display
metadata when serialized separately. One cold
`createPortableLearnerProfileEnvelope` call took 89.4 ms on the local machine.
These are synthetic JSON/preparation measurements, not HTTP or server latency;
the fixture has long titles and differs from the plan's earlier illustrative
404 KB fixture. No payload or cadence reduction is claimed by the independent
release slices.

The small four-animal native fixture's durable island JSON decreased from 966
to 896 bytes. Its two completed/settled movement checkpoints previously requested
two ambient saves and now request zero; meaningful edits still request saves.
This measures the targeted persistence reduction, not an FPS improvement.

The original SQL inserted one complete version per accepted commit; its exact
retry created neither another revision nor another version. The baseline app
canonicalized portable content before saving and after acknowledgement, and
ordinary IndexedDB saves serialized the complete body. Those costs remain on
the generic fallback, while the new warm checkpoint bypasses them.

The baseline fixture's app-level checkpoint work was sampled in five runs:
median portable normalization/canonicalization was 5.0 ms before the save and
4.9 ms after acknowledgement; JSON serialization of the 322,655-byte browser
body was 0.35 ms. The roughly 10.25 ms combined CPU excludes IndexedDB,
lifecycle bookkeeping and network/server time. This release moves opening
maintenance off the display path; the subsequent record checkpoint removes those
normal video scans and body writes.

## Implementation and verification

The current-record relation and snapshot/materialization boundaries are in
`supabase/migrations/20261026110156_current_profile_record_authority.sql`.
Changed units are selected by `src/domain/learner-profile-records.js`; the existing
cloud adapter retains its durable full recovery candidate and immutable request
identity. Local video/day overlays reuse the IndexedDB head/body and recovery
base. The 128 KiB overlay bound uses a complete durable fallback, without
truncating progress. Necessary exceptional fallback work can still run during
gameplay; ordinary checkpoint and cloud work follow the quiet gate.

On the same 500-video server fixture, the existing rollback-only diagnostic
(`--videos=500 --records=true`) measured 543,836 full-envelope bytes versus 581
recurring batch bytes. Full acceptance was 76.8 ms and exact full retry 71.1 ms;
record initialization was 110.2 ms once, warm acceptance 6.3 ms, exact record retry
1.8 ms, a due recovery snapshot 118.8 ms, and complete read 41.6 ms. Two warm
record accepts created no historical versions; a due snapshot created one.
At five seconds this models 12 commit requests/minute versus two full commits,
roughly 7 KB/minute versus 1.09 MB/minute of payload, and approximately twice the
database function time per minute after periodic snapshots. Typed commits fold
the head check into conditional acceptance; full delivery retains its preflight.
These are local synthetic function measurements, not production latency claims.

The warm local 500-video fixture retained a 411,904-byte conservative UTF-16 body
and wrote one 1,556-byte head for video/day/diagnostic units, with zero body writes;
commit plus readback was 1.1 ms in that run. The separate app CPU baseline above
was roughly 10.25 ms and excluded database work; these are not paired end-to-end
timings or a speedup ratio. The head also carries the island, so its size grows
with a large island.

A separate 502-video real-game browser comparison measured 379,182 request bytes
for full delivery and 773 for one video record. Both deferred uploads during held
Godot input, then delivered at quiet time. An isolated short trace showed 16.7 ms
median frames in both paths, 17.5/17.4 ms p95, and no recorded main-thread long
tasks. An earlier concurrent-browser run had an outlier; it was not reproduced
in the isolated comparison. No FPS improvement is claimed. The record case also
verified a second-device edit and a cold reload with transport disabled.

Focused checks cover owner isolation, rejected/oversized batches, atomic coupled
edits, exact retry/mismatch and receipt expiry, snapshot lag, current full exports,
old writers, reset/import/recovery/protected retention, account deletion, dirty
reopen, aborted local transactions, older acknowledgements, mixed transport,
channel intent and restricted flag rollback. Required CI additionally runs the
existing repository suites before release. Production rollout is server-first;
the client flag remains restricted to exact `internal_test=1`.
