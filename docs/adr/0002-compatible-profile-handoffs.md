# Combine compatible changes during device handoff

Status: Accepted on October 12, 2026 for the existing restricted authentication trial, following the user's approved device-handoff plan.

Phone → computer → phone use is sequential for the learner but can produce divergent snapshots when a browser suspends pending uploads. Within a verified owner, profile lineage and generation, reconcile an exact accepted receipt or combine compatible changes from a verified local base before demanding a whole-profile choice. This revises issue #177's prohibition on automatic profile combination and qualifies ADR 0001's conflict outcome: incompatible meaningful changes, unknown ancestry, and intentional replacement boundaries retain the protected conflict flow.

Keep immediate local persistence and the existing 30-second cloud cadence. A final session-boundary upload is best effort, with a server-enforced allowance of one early flush per profile per five minutes. Keep ordinary history retention and protected records intact; do not introduce an unbounded cloud event ledger. A local change record stores only changed before-values, is owner/generation/revision bound through its durable operation, and is limited to 128 KiB. A second bounded before-value journal bridges interrupted local installation without duplicating a profile. Damaged, oversized or missing evidence leaves the original candidate recoverable and uses the protected resolver.

October 20 performance refinement, superseding the October 14 ten-second opportunity bound within the same authentication trial: automatic preparation, delivery and expensive receipt processing wait until the learner stops using Tiny Swords. Five seconds without game input or pawn work, an offscreen island, actual video playback, or a hidden page provide an opportunity. Continuous play has no forced deadline; explicit Sync now overrides the gate, including asynchronous base loading and an already-waiting response. The server cadence, retry limits and session-flush allowance remain unchanged.

Local island checkpoints commit a small IndexedDB head under the existing activation, owner, generation and revision fences. The same transaction retains the pre-edit island and a reference to the immutable profile body. A full-profile write preserves that body before replacing it. This durable before-image allows even the first cloud candidate, and edits during an in-flight request, to wait without losing reconciliation evidence. Deferred preparation reads only the latest acknowledged local profile. Receipt handling captures newer durable edits before retiring the immutable sent candidate. Abrupt-close recovery reconstructs and validates the accepted base before replacing its journal. Failed transactions cannot advance the island or its before-image. If primary storage fails, the guarded recovery workspace durably retains the before-image before acknowledging its fallback save; this exceptional path may perform full-profile work to protect progress. An abrupt browser shutdown can still prevent cloud delivery, but acknowledged local progress and its recovery evidence remain durable. Existing keys and head formats remain readable; bounded optional before-image records are added inside existing profile/recovery storage. No cloud schema, quota policy, retention or public-account rollout change accompanies this refinement.

Study observations use explicit identity and monotonic rules: watch facts reconcile by observation time without resurrecting removed baseline facts, Anki observations take maxima, and compatible one-sided preferences retain both devices' intent. Dated resume positions remain paired with their playback timestamps; unknown or tied observations require a protected choice. Currency and purchase receipts stay coupled and validated. Godot declares ambient animal position arrays and the gameplay identity of each island snapshot; Edenia accepts only the checked Godot-owned transport manifest and still compares every other field. Animal-only differences do not enqueue another full-profile upload. Conflicting game edits remain whole-island choices.

Imports, restores, Undo, explicit conflict choices and reset boundaries must not be inferred away by timestamp or pruned history. Two scalar values on each current head retain the session-flush allowance and latest replacement boundary. Existing old clients continue using their original commit API; the server budget described here applies to the new trial protocol. Adoption does not enable public mandatory accounts or change Free-tier retention.

October 26 refinement (issue #513): visible active gameplay and recent island
input take precedence over simultaneous video playback. Automatic head-response
processing also waits if gameplay resumes during the read. A session-boundary
event does not force deferred full-profile preparation while the island remains
active; an actually hidden page remains a best-effort opportunity, and explicit
Sync keeps its override. Durable local checkpoints and their recovery evidence
remain available if the browser closes before delivery.

Godot snapshot version 38 stores animal counts and carrying/riding relationships
without wandering coordinates, and derives valid animal and construction-worker
locations from terrain when loading. Wandering alone requests no save. Readers
retain versions 1–37, including the previous checked ambient-motion declaration.
Transport rollback must retain the upgraded game reader; an older reader rejects
version 38 and the existing bridge restore gate prevents it from overwriting the
retained island. This is one shared native/browser durable format, not a browser
projection of gameplay state.

Returning-profile display no longer waits for its maintenance save or search
cache compaction. Those tasks wait until after first display and a safe gameplay
opportunity, with current activation checks. Recovery-journal and backup-store
initialization remain before opening because they may contain recovery evidence.
Owner verification and activation policy are unchanged.

This independent release retains full-envelope delivery, the 30-second cadence,
complete historical versions and existing receipt/retention limits. Changed-record
transport and five-second delivery remain open: changing the snapshot-backed
authority affects opening, replacement and recovery together. The concrete next
slice and compatibility boundaries are recorded in
[the issue #513 authority design](../plans/513-current-record-authority.md).

October 26 changed-record amendment, restricted to the same authentication trial:
the existing head revision is the sole accepted-state authority. When
`records_active` is true, its immutable snapshot pointer may lag that revision.
One private current-record relation stores current sections, video records and
Anki days. A typed commit checks the owner, generation and exact base revision
under the existing owner lock, validates changed units and coupled sections,
then atomically advances records, head and the immutable request receipt. Missing
fields are unchanged; deletion is explicit. Ordinary video updates reuse cached
display metadata. Island and related progression/economy changes share a batch.

Complete reads/exports return every accepted update. Existing writer and
protection boundaries materialize the exact current revision before operating;
full-envelope writes replace records through the same head. Historical versions
remain immutable, including conflict/reset/import copies. Normal typed delivery
creates recovery snapshots approximately every 30 seconds, on the next accepted
write, and on demand before reads/protection. Invalid bounded current content is
retained before the existing same-generation predecessor fallback; transient
materialization failures preserve the transaction for retry.

The measured restricted target is five seconds for dirty typed study updates;
unsupported/full-envelope edits retain the 30-second path. Typed commits include
the conditional head check, avoiding a separate preflight read. Continuous dirty
input coalesces without restarting its delivery clock, and active gameplay still
defers preparation, delivery, receipt processing and installation indefinitely.
The server cadence is independently tunable between five and 30 seconds.
Keep the newest 2,048 receipts plus typed receipts within three hours, using
write-path pruning that does not interfere with account deletion. An evicted
receipt never authorizes reapplying a stale base revision.

Mutation-time video/day hints enter the existing local checkpoint path. The
IndexedDB head adds bounded raw record overlays while retaining its immutable
body and exact pre-edit head/body reference in the same transaction. Warm
checkpoints avoid whole-profile scans, normalization, body rewrites and derived
history/analytics work. Full saves compact overlays after preserving the recovery
base. A 128 KiB overlay bound or storage failure uses the existing full durable
fallback, including during play when necessary to protect progress. The head
still contains the durable island, so its write size is not just the video size.

The outbox keeps its complete recovery candidate and bounded before-values;
normal typed transport selects explicit dirty units instead of diffing the video
library. Full recovery-envelope preparation/hashing remains at safe opportunities.
Diagnostic activity stays local during typed delivery and activity-only edits
do not wake cloud sync. Exports retain local history. Proven compatible channel
membership, per-channel formats and shelf-order observations combine; ambiguous
removal/edit intent and cyclic order choices retain protected comparison.

`learnerProfileRecordSyncEnabled` controls creation only, requires exact
`internal_test=1` and enabled account features, and defaults false. Disabling it
retains the upgraded local/outbox readers and routes already-created typed
requests by their durable format through acknowledgement. It does not discard a
sent request or resubmit it under a new transport after an uncertain response.
Rollback retains the compatible server authority and the v38 Godot reader.
