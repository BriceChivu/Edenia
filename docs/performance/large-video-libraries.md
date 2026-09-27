# Large video libraries (#338)

## Behavior

Saved library records and progress are unchanged. Channel shelves render only the
selected format and a horizontal window with three cards of overscan on each side.
Shelves farther than 300 CSS pixels outside the viewport release their cards.
Spacers preserve the full horizontal scroll extent. Watched and Removed mount no
cards while collapsed; expanded collections retain their grid geometry and render
only nearby rows. Focused cards, active shelf previews, and an in-flight target
reveal are retained independently of the ordinary window.

Full-library search, Continue watching, Study History, and added-video reveals
materialize their target before scrolling. Keyboard entry and traversal can mount
unrendered cards. Native browser Find covers only mounted content. The embedded
player is outside the shelf window and retains its session during card eviction.

## Measurement conditions

Measured locally on 2026-09-27 on the investigation Mac (Apple M3, arm64), using
Playwright 1.62.0 / Chromium 151.0.7922.34 headless, one worker, device scale factor 1, no CPU/network
throttling. Desktop viewport: 1440×900. Touch phone viewport: 390×844. Both use the
public application path. External traffic is mocked by the repository network
fixture; no learner data or hosted services are used.

The synthetic library contains 7,000 saved videos: 20 channels with 300 active
videos each (240 Videos and 60 Shorts), 500 Watched, and 500 Removed. A browsing run
visits channels 0, 8, 19, 8, 0, with eleven horizontal offsets forward and backward
in each shelf and four format switches per visit. Separate cases traverse expanded
collections in both directions and repeatedly change status/favorite state.

Timings run from the DOM click through two animation frames (`performance.now`).
They include synchronous handler work, resulting layout/render work, and frame
scheduling. They are not production INP measurements. Performance limits are
reported rather than asserted as timing thresholds in CI.

## Results

[Raw samples](large-video-libraries.measurements.json) retain the per-interaction
timings and mounted-card counts for the representative runs below.

| Measurement | Before | After |
| --- | --- | --- |
| Mounted cards at initial load | 7,000 | 0 when feed is below viewport |
| Desktop cards during prolonged browsing | 7,000 retained | 32–60 |
| Phone cards during prolonged browsing | 7,000 retained | 15–34 |
| Desktop status filter, four samples | 834–1,122 ms | 36–53 ms |
| Desktop favorite toggle, four samples | 887–1,228 ms | 139–163 ms |
| Phone status filter, four samples | 795–1,011 ms | 31–39 ms |
| Phone favorite toggle, four samples | 1,105–1,459 ms | 128–141 ms |
| Desktop format switches, twenty samples | See baseline note below | 25–35 ms |
| Phone format switches, twenty samples | See baseline note below | 21–43 ms |

Mounted-card counts return to the same range on the return trip; they do not grow
with browsing history. Expanded collections are separately checked to remain below
180 total mounted cards, including nearby shelves. All 7,000 saved records remain
present after browsing and repeated filter/card changes. Adding a new video
increases the saved library; it does not replace older records.

The old renderer was compiled from `140972f280787557f7135cc1a0216a786e962e01`
with the same esbuild/Terser options and injected into the same browser fixture.
The status/favorite measurements above use that comparable run. The initial
baseline format-only run measured 50–83 ms desktop and 132–183 ms phone (four
samples each); format switching already avoided rebuilding the complete feed,
so it was less expensive than status/favorite interactions.

The issue's observed **3,264 ms** interaction was not reproduced in this synthetic
fixture. The comparable old-renderer samples above were slower than the new ones,
but should not be presented as a replay of that original observation. New ordinary
interactions in the representative samples meet the below-200 ms target. A later
repeat against a frozen copy of the staged build, while other local work was
active, measured desktop favorite toggles at 196–283 ms and status filters at
52–65 ms. Other repeat layouts reached 389 ms for favorite toggles. The raw file
also retains the complete repeat. The below-200 ms target is not universal under
contention; persistence and non-feed UI work remain relevant.

## Residual work and limits

The complete library still participates in sorting/filtering/search and local
state persistence. Favorite actions remain materially slower than format switches
because they save state and refresh other UI. This change bounds card/DOM work;
it does not make all work independent of saved-library size. Shelf headers remain
mounted, so unusually high channel counts can still add layout work. Compact grid
row sizing follows the current fixed-height compact card presentation and is
remeasured on resize. Very large libraries beyond the 7,000-video fixture and
real-device Safari performance were not benchmarked here.

## Reproduction

Run the synthetic browser suite with the normal build:

```sh
npm run build
npx playwright test tests/e2e/large-video-library.spec.mjs \
  --project=desktop-standard --project=phone-standard
```

Tests print card-count and timing samples and attach JSON measurements to the
Playwright report. For baseline measurements, compile the historical `src/app.js`
with the unchanged imported modules using the options in `scripts/build-site.mjs`,
write the minified classic-script bundle outside the checkout, then run:

```sh
EDENIA_LIBRARY_BASELINE_BUNDLE=/tmp/edenia-338-baseline.js \
  npx playwright test tests/e2e/large-video-library.spec.mjs \
  --project=desktop-standard --project=phone-standard \
  --grep 'status and card'
```

The baseline option replaces only the app bundle via a mocked route; it does not
modify source, generated output, or production configuration. The initial baseline
run exceeded the old test's 30-second overall timeout after recording its samples;
the measurement test now allows 90 seconds so a baseline rerun can finish.

## Validation

The full contract run exercised 1,681 tests. Five assertions tied to eager DOM
rendering were updated; their reruns passed. The final focused contract run passed
all 37 checks. All 139 shared-function tests and the repository's function type
checks passed.

The full browser matrix was run, followed by targeted reruns for deferred-card
test setup and installation of the missing WebKit binary. All 17 WebKit storage
checks passed. The final frozen-build run exercised the library in six viewport
sizes: 62 passed, nine viewport-inapplicable cases skipped, and one overall timeout
under heavy local load. That timeout case passed alone in 1.6 seconds. This covers
scrolling in both directions, format/status filters, target reveals, keyboard
boundaries, native wheel/touch gestures, player continuity, and persisted state.

After the concurrent quota change landed separately, the combined build passed
37 focused contracts and five desktop/phone browser smoke checks (one
inapplicable touch-preview case skipped). This final smoke measured status
changes at 32–43 ms and favorite toggles at 130–152 ms; raw samples are retained.

Standards and Spec reviews have no remaining findings. Tests use synthetic local
profiles and mocked external services; this is local evidence, not a hosted
learner-session or real-device performance result.
