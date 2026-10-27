# Animal position persistence and performance

The approved implementation restores safe animal positions without restoring
per-movement cloud work or making clean profile opening download a full profile.
Baseline is `1121d0ac6bbfa4ed34093ecfdf9e770a6be779ac` (snapshot 38). That
baseline intentionally did not persist wandering positions, so zero movement
writes is a missing feature, not a like-for-like performance target.

## Implementation

- Godot snapshot 39 stores authoritative safe contacts, retaining readers 1–38.
  Settled movements coalesce for five seconds with a fixed deadline. Gameplay
  edits save immediately. Failed browser acknowledgements retry the latest world.
- One bounded local island record and a small head reference keep positions
  outside the canonical profile. Warm animal/video checkpoints avoid immutable
  profile-body reads and writes. Binding and complete checked gameplay comparison
  prevent old positions crossing terrain changes, resets or ownership changes.
- Normal outgoing work piggybacks the checkpoint; roaming does not wake cloud
  sync. Explicit Sync captures and sends positions even when study is clean.
  Sync/export stop if the live capture fails. Closing-page capture is best effort.
- Every verified own receipt, including an upload sent before positions changed,
  rebinds newer compatible local positions before outbox retirement. Immutable
  sent candidates and lost-acknowledgement evidence remain protected.
- Conditional opening still validates the exact canonical accepted body. Only
  game restore, outgoing candidates and explicit exports compose local positions.
  No SQL, server cadence, retention or public account rollout changes.

An 8-pixel movement deadband suppressed only 1 of 61 observed candidates. It was
omitted: cadence coalescing provides the useful reduction without rounding valid
contacts or adding another comparison state.

## Native comparison

Godot 4.7.2, same Mac, five alternating version pairs, 100 warmup calls and
1,000 measured calls per operation per pair. Values below are medians of round
means in microseconds. Every generated snapshot and saved file restored.

| Animals | Operation | Before v38 | After v39 |
| --- | --- | ---: | ---: |
| 1 sheep + 1 chicken | Snapshot and JSON | 41.885 | 44.541 |
| 1 sheep + 1 chicken | JSON parse and restore | 117.912 | 94.211 |
| 1 sheep + 1 chicken | Native file save | 81.914 | 89.797 |
| 4 sheep + 4 chickens | Snapshot and JSON | 41.872 | 48.331 |
| 4 sheep + 4 chickens | JSON parse and restore | 145.424 | 163.288 |
| 4 sheep + 4 chickens | Native file save | 84.140 | 91.069 |

Serialized sizes are 894 → 929 bytes and 895 → 1,014 bytes. Restoring counts and
validating saved coordinates perform different work. Native file save includes
encoding and audit-file open/write/close, without an fsync guarantee; it is not
browser IndexedDB or real network latency.

Matched ten-minute real-actor traces produced 33 and 103 settled movement
callbacks. The baseline issued zero movement saves; version 39 issued 21 and
42 coalesced candidates, including one explicit final flush in the smaller case.
Ordinary candidates stayed at least five seconds apart.

## Browser storage comparison

Chromium native IndexedDB, admitted synthetic 500/2,500-video profiles, five
alternating rounds with 21 distinct acknowledged writes per round. The same
meaningful island payload is used on both repository implementations, isolating
the storage-path cost from snapshot-format differences measured above.

| Browser operation | Videos | Before median ms | After median ms |
| --- | ---: | ---: | ---: |
| Meaningful island save acknowledgement | 500 | 0.20 | 0.20 |
| Meaningful island save acknowledgement | 2,500 | 0.20 | 0.20 |
| Cold local repository opening, after with local positions | 500 | 4.1 | 4.2 |
| Cold local repository opening, after with local positions | 2,500 | 15.4 | 16.3 |

A new animal checkpoint costs 0.40 ms median (round medians 0.40–0.50 ms), writing
one small head and one complete island record: 2,625 encoded bytes in this fixture.
All 210 side-checkpoint acknowledgements were real writes, with zero immutable
body reads or writes. A forced canonical-position control costs 0.20 ms but would
change the accepted profile bytes and interfere with conditional opening. It
does not represent natural v38 behavior, which issued no roaming saves.

The complete run verified 840 write acknowledgements, 40 cold reopens, retained
before-images and study facts. Opening samples are small and overlap; no
whole-application loading speedup is inferred from these local-storage numbers.

## Cloud client comparison

The actual cloud adapter and portable serializer ran 40 trials with admitted
500/2,500-video fixtures, five alternating ordinary-study pairs per size, plus
study-with-positions and explicit-position-Sync trials. RPCs were intercepted with
a fixed 100 ms roundtrip and incremental batch application; no provider or
database was contacted. The complete resulting profile and accepted outbox
retirement were checked after every trial.

Ordinary typed study batches remain 581 bytes on both versions. Adding the
complete two-animal island makes the same request 1,562 bytes, an extra 981 bytes.
Explicit position-only Sync sends 1,044 bytes. Merely retaining a local checkpoint
produces no automatic request. RPC argument sizes, including identity/digests,
are 767, 1,748 and 1,230 bytes respectively.

Preparation and acknowledgement still process the full recovery candidate at a
safe opportunity; the movement-only storage path avoids that work. Ordinary
preparation medians were 100.39 → 106.61 ms (500 videos) and 397.45 → 407.57 ms
(2,500). Median paired preparation differences were +3.08/+11.29 ms; paired
acknowledgement differences were +5.81/+16.54 ms. Five-trial ranges overlap, so
these show small measured overhead with noise, not a speedup or zero cost. Fixed
mock latency and client bookkeeping cannot establish production database or
network latency. Earlier harness controls are retained separately, including a
discarded full-profile mock-server implementation and intermediate source pins.

## Correctness and release evidence

Tests cover real native movement/restore, carried and perched animals, safe house
contacts, coalescing and failed-ACK retries; actual Chromium/WebKit IndexedDB cold
reads, atomic failures, immutable-body counters, owner/reset/CAS fences and newer
positions during receipt installation; typed and full sync, interrupted receipts,
exact conditional opening and explicit export; and the full integrated game.

Review caught and fixed dropped save-cause options, startup saves that would make
clean reopening dirty, failed explicit captures continuing into Sync/export,
warm readback fetching the whole body, stale cross-tab checkpoint caches, and
unstamped older receipts losing newer positions. Two optional native test
failures also reproduced on the baseline: an unsupported shoreline fixture
expected no safe settling, and an old cutting fixture contradicted the documented
Terrain-menu pause. Corrected fixtures pass on both versions; gameplay was unchanged.

Detailed raw traces, source/artifact manifests, paired samples and logs are kept
outside the worktree in the task's `animal-position-implementation-2026-10-27`
audit directory. Browser phone projects are emulation; physical-device and real
authenticated production writes are outside this synthetic validation.
