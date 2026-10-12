# Tiny Swords FPS and frame-stall experiment — 2026-10-12

`internal_test=1` defaults to an experimental 30 FPS mode and a safe direct-walking optimization. Ordinary routes retain their existing settings. The earlier rendering policy followed display refresh (often 60 FPS, potentially 90/120 Hz), rather than imposing a fixed 60 FPS limit.

## Try it on your actual profile

Open [the internal trial](https://www.edenia.study/?internal_test=1) after deployment. Tap **FPS test** in the top-left corner of the island to open its controls. Switch between 30/60 FPS for a visual comparison; `&tiny_swords_fps=60` also starts the trial at 60 FPS. Both control rates use the safe direct-route optimization. Removing the FPS parameter keeps this internal route at 30 FPS. Other routes remain opt-in for this experiment.

After the island has loaded, finish harvesting/construction/water/chicken-carry actions and close host modals. Press **Compare (48s)**. Godot walks the pawn back and forth along a reachable route at its ordinary 70 pixels/second speed. Each round restarts from the same point during warm-up; completion/cancellation returns the pawn to its starting position. Animals retain their normal reactions to movement. No inventory is spent by the test, and rendering preferences never enter an island snapshot. Physics and action clocks retain their original rate.

The four rounds run **60, 30, 30, 60 FPS**, with two seconds of warm-up and ten seconds of sampling each. Keep the page visible, keep canvas size/camera fixed, and avoid interacting. Repeat with Terrain open to measure the builder. The order reduces first-run bias but does not control thermal drift, random animal movement or other processes completely.

Use **Save report** for the JSON. It contains user agent, canvas dimensions, frame/work summaries, movement distance, timestamped stalls, browser long-task attribution and slow pawn-route timings. It contains no account credentials, learner profile or island snapshot. Send the laptop/Pixel reports back to identify what remains on the real device. Covered/offscreen/hidden/resized comparisons cancel; visible long stalls over one second remain in the measurements.

## Measurements and limits

- Engine frames are sampled at actual Emscripten `preMainLoop`/`postMainLoop` boundaries, not the unrestricted browser RAF rate.
- p50/p95/p99 intervals and missed deadlines are recorded. A missed deadline exceeds 1.5× the selected frame budget: 25 ms at 60 FPS or 50 ms at 30 FPS. Absolute gaps over 50 ms are also retained.
- Synchronous engine-loop work includes CPU and rendering submission, but excludes asynchronous GPU completion, host tasks and other threads. Stall records also retain the preceding engine call's work, which is needed to attribute the gap correctly.
- The automated runner measures whole-page main-thread TaskDuration through CDP, including host and same-origin game iframe tasks. It excludes **initial route-selection/test setup**, includes per-round warm-ups, and has up to 250 ms of phase-boundary uncertainty. GPU/other threads and battery/power are not measured.
- Work reduction is `100 × (1 − work_per_second_at_30 / work_per_second_at_60)`. Lower work does not itself establish smoother gameplay; 30 FPS necessarily has a longer normal frame interval.

The full application loads **1,000 real public YouTube videos from 11 Mandarin channels** in Edenia's catalog, with actual IDs/titles/durations/thumbnails. Public thumbnail images load normally; other external traffic is blocked. Records are marked unwatched for repeatability. This is not the user's personal viewing history or signed-in cloud-sync workload. The normal feed controls card/lazy-image mounting; 1,000 simultaneous DOM cards are not forced. IndexedDB profile/backups are enabled as in production.

The synthetic level-ten island has 32 grass tiles, four animated trees, two chickens and two sheep. The runner verifies complete restoration and real pawn movement. It sends a trusted canvas gesture before measurement, matching normal gameplay and unlocking the engine's Web Audio context. Both final scenarios recorded audio **running**. These measurements supersede earlier exploratory reports that charged initial test setup to the first 60 FPS round or retained a large empty test-panel background after closing its controls. The final run uses the corrected compact menu, leaving the island visible.

## Final 30-versus-60 results, with the direct-route optimization

Mac15,13 / Apple M3, headed Chrome 155, Metal renderer; desktop 1440×900 at DPR 2. The normal initial feed mounted eight cards with seven loaded thumbnails. These are local laptop measurements, not a device-independent performance promise.

| Scenario | Actual FPS 60 → 30 | Whole-page work ms/s 60 → 30 | Work reduction | p95 frame interval 60 → 30 |
| --- | --- | --- | --- | --- |
| Walking | 60.0 → 30.0 | 181.0 → 127.6 | 29.5% | 18.4 → 50.0 ms |
| Terrain + walking | 58.8 → 30.1 | 127.6 → 84.7 | 33.7% | 18.6 → 50.0 ms |

Phone-style emulation on the **same M3 GPU/host**: 390×844 at DPR 3 with **4× CDP CPU throttling**. The initial normal feed mounted five cards with two loaded thumbnails. This does not emulate Pixel 7a GPU, memory, thermal or carrier behavior.

| Scenario | Actual FPS 60 → 30 | Whole-page work ms/s 60 → 30 | Work reduction | p95 frame interval 60 → 30 |
| --- | --- | --- | --- | --- |
| Walking | 58.4 → 30.0 | 496.7 → 281.8 | 43.3% | 19.0 → 49.4 ms |
| Terrain + walking | 59.3 → 30.0 | 274.3 → 175.3 | 36.1% | 18.5 → 49.4 ms |

Some 30 FPS p95 intervals still approach 50 ms, and occasional longer gaps remain. Lower sustained work is established more clearly than universal frame-pacing improvement. Physical Pixel 7a/Chrome acceptance remains pending; the hosted trial runs on the user's actual profile and connection. A public default change is not supported by these measurements.

## Long-stall diagnosis and the implemented fix

A matched, profiled phone-style run used 1,000 real videos, IndexedDB, pawn movement and 4× CPU throttling. Browser attribution identified the game iframe, not a video-feed update, for the largest pauses. For example, a 294.6 ms gap followed a 287.4 ms engine call. CPU samples showed repeated script execution; a source-owned timer then identified **pawn route calculation** as 222–286 ms of the large sampled gaps.

`land_route()` performed the eight-pixel fine-grid search whenever any tree/log/house existed anywhere on the island. It did so even for a clear straight walk. The trial now checks the existing **whole-segment** collision predicate first and returns the direct destination when it is safe. Blocked routes keep the existing fine-grid search. This preserves the same boot/terrain/tree/log/house/stair safety checks; it does not skip obstacle validation.

| Matched profiled scenario | Gaps >100 ms before → after | Largest gap before → after |
| --- | --- | --- |
| Walking | 4 → 0 | 269.2 → 53.8 ms |
| Terrain + walking | 4 → 0 | 326.4 → 51.1 ms |

The matched experiment removed all eight reproduced large **route-related** gaps. Longer final runs still have other gaps, which must not be presented as fixed. Before/after raw reports are `navigation-before.json` and `navigation-after.json`; CPU profiles are preserved in the local audit artifacts.

## Next fixes, in priority order

1. **Blocked-route search:** replace or deepen the fine-grid breadth-first search with a target-directed A* planner and per-search collision/contact caching. Keep the exact segment predicate and terrain/feet tests. If worst-case searches still exceed the frame budget, process them in bounded batches with cancellation on movement/layout changes. The direct-path fix is implemented; these further planner changes are suggestions, not deployed changes.
2. **Residual engine/browser work:** profile actual Pixel stalls using the included attribution/preceding-engine-work records. Chromium's synchronous framebuffer-copy `getParameter` calls were visible in the CPU trace (~1.1 seconds across a 28-second audio-suspended diagnostic), but this is not proof they caused a particular remaining long gap. Check CPU execution, GPU synchronization and allocation/GC separately before changing rendering quality.
3. **Web Audio:** a short audio-suspended diagnostic had no >100 ms gaps, but it differed in duration/profiling from the longer final runs; this does not establish audio as the cause. Keep normal audio behavior unchanged. The CLI offers a bounded explicit audio-suspension probe for matched follow-up testing. The production trial does not disable audio.
4. If real-device evidence points to pixel/GPU pressure, compare the existing Godot `edenia/web/max_pixel_ratio` diagnostic cap with native density. A 3×→2× cap reduces pixel count by 56%, but affects sharpness and is not currently applied. Do not substitute desktop CPU throttling for this physical GPU test.

## Implementation and validation

Godot owns the experiment/UI/movement/rendering policy. The bridge transports only the selected FPS parameter. Native RAF divisors are calibrated to display refresh; timestamp gating handles non-integer ratios. The native limiter avoids blocking `Engine.max_fps` on the single-threaded web template. Calibration refreshes periodically and after visibility resume. Parent long-task observers are released when the iframe retires to avoid retaining an engine instance.

`gameplay/direct_walk_routes_enabled` defaults to false and is enabled by the Godot FPS experiment. Native/editor previews can enable that same setting. No ordinary route is changed by default.

Validation includes the required integrated rebuild/export/gameplay/progression checks, 66 Tiny Swords contracts, direct-route equivalence/contact regression, log navigation, behind-tree navigation, diagonal stairs, stair-floor routes and chicken-following checks with the optimization enabled. The separate sheep object-navigation diagnostic failed identically with the flag disabled/enabled; it was not changed or used as a passing check. Browser coverage exercises pawn movement, FPS caps, suspend/resume, loading, controls and persistence. CI includes the new regression on desktop and phone projects.

## Repeat

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
node scripts/serve-static.mjs --host localhost --port 8047 --root _site
# In another terminal, sequentially with other benchmarks stopped:
node scripts/benchmark-tiny-swords-fps.mjs --chrome --indexed-db --output .cache/fps-desktop.json
node scripts/benchmark-tiny-swords-fps.mjs --chrome --phone --cpu-throttle 4 --indexed-db --output .cache/fps-phone.json
# Optional, explicit diagnostic (normal trial audio is unchanged):
node scripts/benchmark-tiny-swords-fps.mjs --chrome --phone --cpu-throttle 4 --indexed-db --profile-cpu --suspend-audio --sample-ms 5000 --output .cache/fps-audio-probe.json
```

The runner seeds only localhost's isolated `internal_test=2` profile. `--chrome` uses installed Chrome; omit it for Playwright Chromium. `--headless` is available for debugging, but check the renderer before calling it hardware evidence. Regenerate the public metadata corpus with `node scripts/prepare-tiny-swords-fps-videos.mjs`, using the existing YouTube runtime config or YOUTUBE_API_KEY; no credentials are stored in the corpus.

Primary runtime references: [Emscripten main-loop timing](https://emscripten.org/docs/api_reference/emscripten.h.html#c.emscripten_set_main_loop_timing), [Godot Engine timing](https://docs.godotengine.org/en/4.6/classes/class_engine.html).
