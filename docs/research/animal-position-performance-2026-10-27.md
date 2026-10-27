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
| Cold local repository opening, after with local positions | 500 | 4.0 | 4.3 |
| Cold local repository opening, after with local positions | 2,500 | 15.9 | 16.4 |

A new animal checkpoint costs 0.40/0.50 ms median at 500/2,500 videos (round
medians 0.40–0.50 ms), writing
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
preparation medians were 103.02 → 104.53 ms (500 videos) and 404.46 → 397.83 ms
(2,500). Median paired preparation differences were +0.32/−2.84 ms; paired
acknowledgement differences were +3.06/−5.34 ms. Five-trial ranges overlap, so
these do not establish a speedup, regression or zero cost. Fixed
mock latency and client bookkeeping cannot establish production database or
network latency. Earlier harness controls are retained separately, including a
discarded full-profile mock-server implementation and intermediate source pins.

## Whole-application opening comparison

Frozen public/game-enabled builds of baseline `1121d0ac` and implementation
`532807c0` ran five alternating pairs per cohort, in fresh Chromium contexts.
Returning cases used the real SDK with locally fulfilled conditional-opening
responses, fixed 500 ms latency and native clocks; the combined case also used
an expired synthetic Google session, five backup banks and fourfold CPU slowdown.
The after pose cases retained a separate newer local checkpoint while the exact
canonical accepted profile remained unchanged. No provider request was dispatched.

| Cohort | Before usable median ms | After usable median ms | Before / after range ms |
| --- | ---: | ---: | --- |
| Returning, 500 videos | 672.8 | 674.7 | 671.5–700.7 / 660.3–680.3 |
| Returning, 2,500 videos | 890.0 | 911.4 | 874.5–899.6 / 886.1–930.8 |
| Combined 2,500-video stress case | 3,375.1 | 3,394.7 | 3,337.6–3,491.2 / 3,283.9–3,469.0 |
| Cold opening with real game, 500 videos | 748.0 | 735.9 | See retained raw samples |

The normal returning cohorts never painted the progress-loading notice. In the
combined stress case its painted duration was 1,173.8 → 1,217.2 ms median, with
overlapping ranges. Cold-game first draw was 2,465.9 → 2,431.4 ms median
(2,267.4–2,773.1 / 2,397.7–2,580.2 ms); all ten initial native migrations
received durable acknowledgements. All thirty returning cases received the
conditional `profile_unchanged` result and preserved study/configuration facts.

An additional twenty openings matched both versions' already-split immutable
body/head storage before measurement. This removes the first side checkpoint's
storage-layout conversion as a confound. Medians were 678.7 → 675.0 ms at 500
videos (645.0–693.3 / 661.0–695.6), and 915.3 → 926.8 ms at 2,500
(887.1–923.6 / 894.3–1,011.8). All twenty retained exact canonical content and
received `profile_unchanged`; newer positions were exposed only in the game view.

These sixty final observations establish compatibility with the existing fast
opening path, not a loading speedup or a precise zero-cost bound. Original
unmatched-layout samples and four pilot observations are retained separately.
Cold-game results include download, engine startup and scene work; they must not
be presented as repository-read latency.

## Active-game comparison

The same frozen builds ran five alternating before/after pairs per profile size,
with the real Godot game, native animation-frame clocks, a five-second warmup and
fifteen-second observation windows. Real mouse walking caused animal following;
the fixture had no loose/carried wood to prevent walking clicks becoming
construction or pickup actions. CPU rate was 1, mock RPC latency 100 ms, and
typed record delivery was disabled symmetrically to isolate movement. No study
edit was made; ordinary typed delivery was measured separately above.

| Profile | Before parent throughput FPS, median (range) | After parent throughput FPS, median (range) | Before / after median p99 frame ms |
| --- | --- | --- | --- |
| 500 videos | 58.79 (50.91–59.80) | 59.33 (58.60–59.80) | 23.59 / 21.94 |
| 2,500 videos | 55.93 (49.53–59.67) | 56.00 (30.70–59.80) | 54.91 / 54.26 |

All twenty original observations are retained. One after/2,500 sample hit the
initial recorder's overly strict prohibition on any backend-shaped request:
existing session re-verification made three locally fulfilled auth/metadata
requests, but no progress commit. Its parent/child worst frame gaps were
1,010.8/995.1 ms, and input commands were delayed. The slowdown began before
its position checkpoint; this does not establish causality. Existing auth and
entitlement handlers are unchanged. A before sample also had a roughly 562 ms
parent gap. No frame-tail improvement or absence of regression is claimed.

That sample passed canonical equality and native/storage guards but stopped
before the final portable-fact hash check. The post-measurement validator was
narrowed to allow only the three known successful auth/metadata routes, and the
remaining five original observations resumed after a browser-process restart.
One explicitly additional replicate completed the omitted integrity checks; it
does not replace the slow sample. Timed input and in-page probe bytes are
identical across segments. Request phase labels span the input routine and
therefore do not establish that every metadata request fell inside the exact
fifteen-second frame interval.

Across all twenty-one observations, eleven actual animal-record writes received
durable acknowledgements, with zero immutable-body I/O, zero instrumented
whole-profile operations and zero progress commits during the active routine.
Twenty observations have full final fact-hash admission; the original slow
observation has the explicitly limited admission above. All-sample tail reporting
retains its stall and all late inputs. Pilots, the failed strict receipt, browser
segment boundaries and source hashes remain in the external audit directory.

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

The independent Standards review found no documented-standard breach; its minor
stamp-reader naming finding was clarified. The Spec review found one recovery
blocker with two paths: semantic rejections could activate recovery, and genuine
storage failures could omit separately saved positions. Typed rejection handling
and a shared checked recovery-snapshot policy fixed both. Full-application tests
failed on the earlier build and pass in Chromium/WebKit after the fix, including
live Godot capture/export while the primary database is retired. Recovery
receipts, cold replay, explicit Sync and promotion retain the complete latest
island, while concurrent terrain/pose rebases require the whole-island resolver.

Detailed raw traces, source/artifact manifests, paired samples and logs are kept
outside the worktree in the task's `animal-position-implementation-2026-10-27`
audit directory. Browser phone projects are emulation; physical-device and real
authenticated production writes are outside this synthetic validation.

Rollback must retain the v39 Godot reader and Edenia's checkpoint-head,
animal-record and optional stamped-outbox readers. Reverting the complete old
client can ignore newer local positions or reject a stamped pending upload.
