# Feed updates that keep the learner's place (#339)

## Behavior

Feed rendering reconciles channels by their stable channel key and cards by video
ID. Unchanged shelves keep their tracks and mounted cards. Changed shelves retain
unchanged cards, replace changed card content, and update bounded spacer geometry.
Watched and Removed collections use the same identity/nearest-neighbor policy.
The complete saved library remains the source of ordering and counts.

A focused card is the horizontal anchor; otherwise the first visible card is the
anchor. If it leaves the current view, the nearest surviving item from the prior
ordering takes its place (next item wins equal distances). Offsets clamp at the
start/end of a collection. An emptied shelf hands focus to the nearest remaining
shelf or the feed's empty state. Existing priority, publication, Favorites, and
channel ordering still apply; anchoring never freezes the previous order.

Viewport restoration surrounds dashboard/feed updates, including channel moves
caused by incoming uploads. Player sessions retain their source position without
coupling playback ownership to transient cards. Close, completion, and rewatch
completion restore the source or a surviving neighbor. Local actions restore the
affected record and history metadata after a failed save, leaving the same action
available for retry. This does not change storage schema or remote sync behavior.

## Verification

All libraries and network traffic in browser verification are synthetic/mocked.
The large-library fixture retains 7,000 records across 20 channels and exercises
both formats, filters, long scrolling, collections, search, keyboard/touch,
Favorites, Watch later, watched status, undo/redo, persistence failure/retry,
incoming uploads, and playback ownership. Additional small-fixture tests cover
actual removal menus, the final-card empty state, Favorites publication ordering,
and translated accessible labels on retained cards.

The initial phone regression reproduced an 8,000-pixel horizontal jump and
replacement of every shelf. The new checks require the same shelf and track
objects to survive, retain a sibling card, and preserve anchor position within
2 pixels (except documented edge clamping). Collection checks retain card objects
through unrelated updates. Timings include the synchronous action/persistence
plus two animation frames, on an unthrottled Mac15,13 with Chromium. They are not
production latency promises; other browser work on the machine can affect them.

Reproduce from a checkout containing only this issue's change:

```sh
npm test
npx playwright test tests/e2e/large-video-library.spec.mjs tests/e2e/feed-update-focus.spec.mjs tests/e2e/video-organization.spec.mjs tests/e2e/channel-video-format-toggle.spec.mjs
```

Verification used a temporary Playwright config with an isolated local server and
output directory because another task was editing/building the shared checkout.
Viewport sizes, input capabilities, synthetic fixtures, and browser settings were
unchanged. No generated bundles or browser snapshots are committed.

## Performance limits

The update path still computes full-library selectors and performs synchronous
profile persistence. It avoids replacing unrelated shelf DOM; it does not claim
constant-time state writes. Initial before/after favorite samples were about
205 ms / 142 ms on phone and 144 ms on desktop after the fix. Concurrent browser
work produced 308–482 ms samples. Final samples and mounted-card counts are saved
alongside this report in `feed-update-anchors.measurements.json`.

| Layout | Mounted cards while browsing | Favorite samples (ms) | Deep favorite (ms) | Anchor shift |
| --- | --- | --- | --- | --- |
| desktop-wide | 32–68 | 165.1–207.9 | 150.6 | 0 px |
| desktop-standard | 32–60 | 141.8–184.8 | 145.3 | 0 px |
| tablet-portrait | 21–74 | 190.9–224.7 | 241.8 | 0 px |
| tablet-landscape | 32–68 | 157.1–205.4 | 178.9 | 0 px |
| phone-standard | 15–34 | 156.6–197.7 | 228.3 | 0 px |
| phone-small | 15–34 | 157.7–187.3 | 186.7 | 0 px |

The 200 ms reference target is not met by every sample. Full-library persistence
and selectors remain measurable costs even though unrelated shelf DOM is retained.

The isolated `npm test` run passes 1,685 contracts, 139 function tests, and all
configured Deno type checks. The six-layout browser sweep covers 246 cases:
152 passed, 93 viewport-inapplicable/explicitly skipped cases, and one format
selector regression found and repaired before the focused final rerun.

The final rebuilt-source rerun passes 37 browser cases across all six layouts
(5 inapplicable skips), including the repaired format selector, exact action focus,
locale updates, empty-player return, and track/sibling-card retention. Every deep
anchor sample has zero horizontal movement. Both Standards and Spec reviews have
no remaining findings. This is local verification; nothing was pushed or deployed.
