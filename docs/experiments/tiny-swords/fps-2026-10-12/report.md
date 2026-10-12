# Tiny Swords 30 FPS experiment — 2026-10-12

The internal_test=1 route defaults to an experimental 30 FPS rendering cap, testing whether 30 FPS gives laptop and phone hardware more rendering headroom. The default web policy still follows display refresh (`Engine.max_fps = 0`, RAF interval 1), usually 60 FPS; it was not a fixed 60 FPS cap.

## Try it on your island

Open `https://www.edenia.study/?internal_test=1` after this change deploys; that route now defaults to the 30 FPS test. This keeps the existing signed-in trial/profile route and adds only the rendering experiment. `tiny_swords_fps=60` starts the same test at 60 FPS. Removing the FPS parameter keeps internal_test=1 at 30 FPS. Ordinary routes retain their normal refresh-following policy; their FPS experiment remains explicitly opt-in. The rendering preference never enters an island snapshot, and the physics tick rate is unchanged. Animals keep their normal gameplay reactions to the moving pawn.

Use the 30 FPS / 60 FPS buttons to compare movement by eye. For measurements, finish loading, close modals, keep the same camera view and canvas size, and press **Compare (48s)**. Godot automatically walks the pawn back and forth along a reachable route at its ordinary 70 pixels/second speed, restarting from the same point during every warm-up and returning it to its starting point at completion/cancellation. Keep the page visible and avoid interacting during the comparison. Repeat with Terrain open to measure the builder while walking. Finish any active harvesting, construction, water action or chicken carry first; a comparison also needs a reachable walking destination. Each comparison warms up for two seconds and samples ten seconds in each of four rounds: **60, 30, 30, 60**. This order reduces first-run/order effects. It does not control thermal drift or random animal movement completely.

Press **Save report** to download the JSON. A report contains browser/device user agent, canvas dimensions, frame rates and timing summaries; it contains no profile, account or island data. Send the laptop and Pixel 7a reports back for an actual device comparison. A phone-size desktop viewport with CPU throttling cannot establish Pixel 7a performance.

If the island is covered/offscreen, the tab is hidden, or the canvas changes size, the current comparison is cancelled. Repeat it after returning to the island. Changing FPS manually also cancels a comparison.

## What is measured

- Actual engine frames, sampled at Emscripten's engine `preMainLoop` and `postMainLoop` boundaries, rather than the unrestricted browser RAF rate.
- Median, p95 and p99 frame intervals; a missed deadline is an interval exceeding 1.5 times that mode's budget (25 ms at 60 FPS; 50 ms at 30 FPS).
- Frames with gaps over 50 ms, including visible stalls over one second; these are measured rather than mistaken for background suspension.
- The automated runner also measures whole-page main-thread TaskDuration through Chrome DevTools, including host and same-origin Godot iframe work. Its four rounds include warm-ups and have up to 250 ms of phase-boundary uncertainty; GPU/other thread work is excluded.
- Synchronous engine-loop work per frame and total work milliseconds per second. This includes CPU work and rendering submission. It excludes asynchronous GPU completion, other page tasks, browser compositor work and battery/power consumption.

The work reduction is `100 × (1 − work_per_second_at_30 / work_per_second_at_60)`. A larger frame interval is expected at 30 FPS; compare missed deadlines relative to each mode's budget, and also inspect absolute stalls. A lower work value alone does not establish smoother gameplay.

## Implementation

Godot owns the experiment in `scripts/frame_rate_test.gd` and `scripts/frame_rate_test.js`. The bridge only transports the validated opt-in URL parameter into the game URL. Instrumentation and UI are installed only for exact `30` or `60` values.

The scheduler gates only the engine's RAF callback, keeping input/page RAF untouched. It estimates display refresh and uses integer display ticks when a 30/60 FPS target aligns with that display, avoiding fractional-refresh deadline drift; other displays use timestamp budgets. This caps 90/120/144 Hz displays too; merely using RAF divisor 2 would run at 60 FPS on a 120 Hz display. The existing Emscripten main-loop timing API remains in RAF mode. Generation checks discard pending callbacks on suspension, and the cap survives resume. No blocking `Engine.max_fps` limiter is used on the single-threaded web build. Physics remains at its existing 60 ticks per second.

Relevant primary references: [Emscripten main-loop timing](https://emscripten.org/docs/api_reference/emscripten.h.html#c.emscripten_set_main_loop_timing) and [Godot Engine timing](https://docs.godotengine.org/en/4.6/classes/class_engine.html).

## Repeat the automated measurement

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
node scripts/serve-static.mjs --host localhost --port 8047 --root _site
# In another terminal; run measurements sequentially with other benchmarks stopped:
node scripts/benchmark-tiny-swords-fps.mjs --chrome --output .cache/fps-desktop.json
node scripts/benchmark-tiny-swords-fps.mjs --chrome --phone --cpu-throttle 4 --output .cache/fps-phone-emulated.json
```

The runner seeds only localhost's isolated `internal_test=2` profile. It loads 1,000 real public videos captured from 11 Mandarin channels in Edenia's catalog through YouTube Data API, with actual IDs, titles, durations and thumbnail URLs. Public YouTube thumbnails load normally; other external traffic is blocked. The records are marked unwatched for a repeatable corpus; this is not the user's personal history or signed-in cloud sync workload. The normal feed determines which cards to render/lazily load; the benchmark does not force 1,000 simultaneous DOM cards. It verifies restoration of a synthetic level-ten island with 32 grass tiles, four animated trees, two chickens and two sheep, then measures pawn walking and Terrain-open walking scenarios in a headed browser. A movement-distance check rejects a run where the pawn did not actually walk. `--chrome` uses installed Chrome; omit it to use Playwright Chromium. `--headless` is available for CI/debugging, but its renderer must be checked before treating it as hardware evidence. `--sample-ms` can change the per-round duration. Regenerate the public metadata corpus with `node scripts/prepare-tiny-swords-fps-videos.mjs` using the existing YouTube runtime config or YOUTUBE_API_KEY; credentials are not stored in the corpus.

## Results

Mac15,13 / Apple M3, headed Chrome 155, Metal renderer, 1440×900 at DPR 2. The real-video profile retained all 1,000 videos and 11 channels; the normal feed initially rendered eight cards with seven thumbnails loaded. Each comparison moved the pawn approximately 3,365 pixels over 48 seconds.

| Scenario | Actual FPS 60 → 30 | Engine work ms/s 60 → 30 | Whole-page work ms/s 60 → 30 | Whole-page reduction | p95 frame interval 60 → 30 |
| --- | --- | --- | --- | --- | --- |
| Walking | 58.8 → 30.5 | 204.8 → 134.8 | 274.7 → 183.0 | 33.4% | 17.7 → 34.3 ms |
| Terrain + walking | 59.4 → 30.5 | 147.7 → 92.5 | 197.4 → 134.8 | 31.7% | 17.6 → 34.3 ms |

Absolute stalls over 50 ms did **not** disappear: walking had 9 in each mode, and Terrain had 4 at 60 FPS versus 5 at 30 FPS. The finding is reduced sustained work/headroom, not proof that all stutters are resolved. The isolated trial is warranted by the consistent roughly one-third whole-page reduction with the large real-video corpus and movement; a public default change is not supported by these measurements.

Physical Pixel 7a / Chrome results remain pending. The hosted internal trial runs on the user's actual profile and carrier connection for that next check. Raw reports are saved alongside this document.

The phone-style run used the same Apple M3/Chrome/Metal host, a 390×844 viewport at DPR 3, and **4× CDP CPU throttling**. It retained 1,000 videos/11 channels; the normal initial feed rendered five cards with two thumbnails loaded. This emulates layout, density and CPU pressure, not Pixel 7a hardware, GPU, memory or thermal behavior.

| Emulated scenario | Actual FPS 60 → 30 | Whole-page work ms/s 60 → 30 | Whole-page reduction | Missed deadlines 60 → 30 | Stalls >50 ms 60 → 30 |
| --- | --- | --- | --- | --- | --- |
| Walking | 49.3 → 26.1 | 675.2 → 450.0 | 33.3% | 4.65% → 4.55% | 19 → 24 |
| Terrain + walking | 56.7 → 28.7 | 366.8 → 215.2 | 41.3% | 1.23% → 1.39% | 4 → 8 |

Both emulated scenarios reduced sustained work, but they still missed frame deadlines and had more absolute >50 ms stalls at the lower rate. Lower work is useful headroom, not evidence that 30 FPS eliminates the observed frame drops. The Pixel 7a comparison is still needed before any wider rollout.

## Validation

The integrated preview was rebuilt from Godot source with the required build command, including its existing export/gameplay/progression/persistence checks. The focused Tiny Swords contract suite verifies refresh rates (including 59.94/60.1 Hz), fractional-refresh pacing, actual loop-work summaries, visible long stalls, opt-in/trial routing, and host suspension/resume. The integrated browser regression measures engine frames with real pawn movement and checks suspension/resume; the existing populated-island acceptance covers loading, controls and persistence. CI also runs the new regression on desktop and phone projects.
