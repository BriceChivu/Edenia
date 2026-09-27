# Local pixel-town evidence — 27 September 2026

This is local implementation evidence for [Build the complete internal pixel-town experience](https://github.com/BriceChivu/Edenia/issues/349). It is **not** full performance acceptance or hosted/owner acceptance. The build switch remains off. The outstanding gates below must remain visible when considering [Deploy and accept the internal pixel-town trial](https://github.com/BriceChivu/Edenia/issues/350).

## Reproduction and scope

Use the commands in [the authoring guide](../README.md). `verify-art.mjs` regenerates the four ordered stage-0-through-12 contact sheets and exact replay checks. `measure.mjs` defaults to short diagnostic windows; `--full` selects 30-second windows and `--long` selects a ten-minute visible run. `cold-start.mjs` applies 4 Mbit/s download and 150 ms RTT to fresh browser caches. `visibility-check.mjs` attempts a real minimized-window capture and fails rather than treating a synthetic event as proof.

The host is an Apple M3 MacBook Air with 8 GiB RAM, using Chromium 151.0.7922.34. Phone sizes are desktop emulation. External provider requests are stubbed. No physical Android or iPhone was tested.

## Captures

- `approved-reference.json`: stages 2 and 12 against the approved `238297c` prototype at three lights and three animation times, with zero differing pixels in all 18 comparisons.
- `art-checks.json` and `progression-*.png`: 52 stage/light combinations and 208 exact patch replays. The sheets run left-to-right, then top-to-bottom; the unused final cells are black.
- `tree-before-after.png`: one shared tree color edit propagates to its instances. Source-save and rendering contract tests separately protect unrelated flowers, houses, stage placements, smoke and learner facts.
- `catalog.png` and `workshop-layout.json`: developer gallery with bounded edits, source links and previews; Chromium and WebKit layouts at 320, 390, 430, 768 and 1440 pixels.
- `measurements.json`: five alternating repetitions of public/disabled, internal still and internal motion for each of stages 2/12 and 5/500 saved-video fixtures. These use short windows, not the complete prescribed comparison protocol. Fixture hashes are retained. Mounted cards vary with viewport and virtualizer state; 500 saved records do not mean 500 DOM cards. The action measure is a city-stage change followed by two animation frames, not Event Timing or compositor latency and not filter/video interaction proof.
- `longevity.json`: ten minutes visible with the mature town and 500 saved videos. Town update p95 was 0.5 ms; measured heap decreased by 220,704 bytes during idle. This is a historical pre-final-refinement capture; its Git field identifies the then-current HEAD, and the resource URLs identify the generated source-content hash. The working tree contained refinements, so the HEAD field alone is not a reproducible source snapshot. Do not count it as final-head longevity acceptance. The older post-cycle figure also predates restoring the initial stage before the ending heap sample.
- `cold-start.json`: five fresh-cache samples at each early/mature stage. Timing begins at navigation and waits for the selected still to decode; motion timing is also measured from navigation, not from module mount.
- `visibility.json`: **blocked**. On this macOS automation session, minimizing Chromium did not produce `document.hidden` within 30 seconds, including with its backgrounding-disable defaults removed. Headless focus changes likewise did not prove hidden state. Offscreen and disposal behavior passed browser checks, but real hidden-tab proof remains outstanding.

## Results and remaining gates

The 60 diagnostic runs completed with no town loading errors. Motion startup was 104–144 ms locally. Per-run town callback p95 was at most **0.6 ms**. The largest post-cycle retained heap increase was **921,796 bytes (0.88 MiB)** across all modes, below the 2 MiB limit. The conservative ready-scene decoded-pixel accounting, including four onboarding images, reached **14.96 MiB**, below the 16 MiB target and 64 MiB hard cap. This is accounting for owned surfaces, not an instrumented GPU-memory measurement.

The action-to-two-frames p95 ranges were 32.6–35.4 ms (public), 32.6–33.7 ms (internal still), and 32.7–33.7 ms (internal motion). These are diagnostics, not the required filter/video or compositor comparisons. Run resources identify artifact `e6bad6f987e02bdf`, before the final degraded-still resume guard; that guard only avoids scheduling when cadence is already zero.

The maximum patch dirty area is **35.07%** of the scene, exceeding the 25% soft target. The measured callback cost is low, but attributable paint/compositor evidence remains necessary. Cold timing and transfer values are recorded below after the final capture.

Final runtime cold-network samples displayed the selected still in **4.92–5.26 seconds from navigation**. This exceeds the 3-second soft target but stays below the 6-second hard limit. Total encoded experiment resources reached **490,324 bytes (0.47 MiB)**, below the 1 MiB target. This uses the final runtime content hash shown in the resource URLs; no physical-phone claim is made. Motion became active later, around 6.4–7.0 seconds from navigation; the runtime's six-second animation deadline starts at module preparation, not navigation.

The source-backed catalog save tests, 50 stage/light/remount cycles, stale fetch cancellation, missing/mixed assets, reduced motion, public isolation and onboarding visibility all pass. Required CI builds both the default public path and the enabled experiment. The ordinary route requests no experiment assets; catalog code is excluded from the published build.

Before declaring full performance acceptance, complete the prescribed 30-second comparison windows, filter/video interaction and compositor/attributable-paint traces, physical modest Android and iPhone runs, a final-source longevity run, and a real hidden-tab run. The runtime deliberately does not misattribute whole-page paint lag to the town; sustained-window adaptation needs trustworthy attribution and is not automatically active without it. Measured repeated >50 ms town callbacks can still reduce cadence. Hosted rollback timing and owner acceptance also remain pending.
