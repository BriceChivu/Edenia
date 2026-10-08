# Mandatory sign-in background refresh continuation — 2026-10-09

This continues #177's admitted-owner `internal_test=1` trial from deployed
`40f04c4e9613f6ff98a89c0276748ce5c3a0689b` (#408). Public mandatory entry and
accountless migration cutover remain outside scope.

## Reproduction

Chrome and macOS Safari opened the same town on #408. The cloud head remained
unchanged for more than three idle minutes. Chrome subsequently displayed a
protected conflict when its automatic Anki refresh completed. Both conflict
exports downloaded. Each retained all 1,665 video records; their only profile
differences were background activity history, Anki's observation timestamp and
an ambient chicken pose. Study counters and the videos were identical.

An unchanged successful Anki poll always replaced the observation time and
appended diagnostic history. Automatic feed refreshes likewise appended history
even when provider results left the portable profile unchanged. These writes
could attempt a whole-profile commit against another browser's advanced head.
They did not represent new Study facts.

## Repair

For an existing Anki day, compare the signed-in automatic result with the current
portable profile while retaining its prior observation time. An identical result
saves only locally without adding history. Device resume baselines and current
status still update locally. A new day or changed counters/XP provenance retain
normal persistence; the first observation's watermark must remain available so
the next review earns XP. Manual and accountless diagnostics retain their behavior.

For automatic signed-in feed refreshes, compare the latest profile before and
after applying provider results, before appending history. Unchanged results save
cooldown/failure backoff locally. New videos or changed portable metadata remain
cloud eligible. Channel metadata is also compared before provider hydration so
a mutation through a shared object cannot disguise a changed name/image.

Anki polling now captures its originating profile operation. Success and failure
responses that arrive after profile retirement cannot synchronize Study facts,
replace the current status cache, or write diagnostics against another profile.
The retirement regression also failed before this repair.

No conflict choice, server merge, schema change or island-field reconciliation
was added. Existing protected choices and activation fences remain in force.

## Validation checkpoint

- New Anki/feed unchanged-result regressions failed before their repairs.
- Focused contracts cover unchanged polls, imported observation timestamps,
  due-card changes, local resume baselines, genuine reviews/XP, first-observation
  watermarks, manual/accountless behavior, changed videos/channel images,
  failure backoff and retired responses.
- The completed normal build and all 20 generated-asset checks pass. An earlier
  broad check ran before generated assets existed and is not a passing receipt.
- The browser regression passes: unchanged network Anki polls do not commit
  against an advanced cloud head; a new review syncs once with XP, survives reload,
  and repeated polls do not change the accepted head. Other namespaces survive.
- The initial CI exposed an incorrect new test expectation on touch/phone
  devices, where AnkiConnect is deliberately unavailable. The case now verifies
  no requests/writes and retained imported progress on those devices, while
  desktop input still exercises real review synchronization.
- Two existing IndexedDB cases captured their baseline before startup's scoring
  migration finished. The failure traces differ only in scoring version (1 to 7),
  not Study facts. They now await that durable opening boundary before injecting
  write failures; strict durable equality after the failed action is retained.
- All 1,898 client contracts pass. Final CI is pending. Hosted acceptance follows
  deployment; this checkpoint does not claim that the continuation is complete.

The prior hosted global sign-out check revoked all admitted-owner server sessions
and kept Safari locked through reload. Chrome rejected the revoked refresh token;
explicitly triggering Edenia's usual reverification path retired its cached
session and kept it locked through reload. This did not wait for natural access
JWT expiry or claim instantaneous remote access-token invalidation.

Safari email sign-in still awaits the pending action-time CAPTCHA confirmation.
Private supplied files, identities, screenshot proofs and diagnostics remain
outside the repository.
