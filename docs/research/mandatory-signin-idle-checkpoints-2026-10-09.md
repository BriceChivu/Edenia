# Mandatory sign-in idle-island conflict continuation — 2026-10-09

This continues #177’s selected-owner `internal_test=1` trial from deployed
`dddcb0c9ef9efdbcc7d67b20e2794f79f5c0f4d0` ([#407](https://github.com/BriceChivu/Edenia/pull/407)).
Public mandatory entry and accountless migration cutover remain outside scope.

## Reproduction and repair

Two independently authenticated, idle hosted browsers produced a protected
conflict whose only island difference was the chicken’s resting position.
The conflict UI hid the learner profile and paused saves. Both device/cloud
exports downloaded successfully. A cloud choice first failed because Chrome
reported `ERR_CONNECTION_CLOSED`; the database still showed the conflict open.
Retry refreshed the comparison after the cloud head changed. Confirming that
fresh comparison then reopened the town and reached Up to date. No automatic
choice or island merge was introduced.

Godot now classifies the sheep/chicken resting checkpoints it owns. Native
persistence still saves the same whole layout. The bridge carries that cause;
Edenia acknowledges a durable local write without marking it for cloud upload.
The latest complete island is included by the next gameplay or study save and
by portable exports. Coalescing keeps any queued gameplay edit cloud eligible
when a later animal checkpoint replaces its snapshot.

A small local marker binds the exact canonical profile content to its owner,
profile, generation and accepted cloud revision. It is created only under the
current activation, with no pending/queued/dirty work and unchanged study facts.
It excludes envelope export time from its content hash. Refresh can retain the
marked local snapshot even while local identity metadata lags an accepted cloud
receipt; the browser reproduced accepted revision 2 with local metadata still
at revision 1. An unmarked change retains the existing opening safeguards.
Changed study facts, malformed/mismatched markers and newer cloud heads cannot
use this marker to suppress synchronization. Edenia treats island content as
opaque and does not combine game fields.

## Validation checkpoint

- The new adapter/protocol regressions failed before the repair; 278 focused
  cloud/lifecycle/island contracts now pass.
- Real portable envelopes with changing export timestamps cover marker stability,
  delayed local identity, owner/profile/generation/revision mismatch, malformed
  storage, additional study changes, pending work and a newer cloud head.
- `animal_checkpoint_saves.gd` exercises actual sheep/chicken movement and resting
  saves; its clean native run passes. The integrated builder runs this gate.
- The real Godot trial browser case passes: durable local checkpoint, unchanged
  cloud revision through refresh, opaque export, whole-island gameplay upload,
  reload and retained namespaces. Its first fixture position was blocked by a
  tree; Godot correctly rejected that restoration. The passing fixture uses
  valid ground.
- The required integrated preview rebuild completed. Full client contracts and
  final CI are being completed; this checkpoint does not claim final acceptance.

Actual macOS Safari Google sign-in/local logout/reload evidence is retained from
this continuation. Safari email CAPTCHA confirmation and the final independent
session/global-logout cycle remain pending. Private supplied-file replays,
identities, screenshots and diagnostics stay outside the repository.
