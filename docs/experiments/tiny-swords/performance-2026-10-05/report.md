# Tiny Swords performance investigation — 2026-10-05

The original Tiny Swords baseline was not ready for public performance sign-off. A confirmed per-frame shadow-generation hotspot consumed almost one renderer core on a 66-tile terraced island, reducing it to about 14 fps. A diagnostic cache restored 60 fps and reduced CPU to about 28%. The baseline export also added sustained rendering work while the island was offscreen in a visible Edenia tab. Island checkpoints became noticeable main-thread operations as the learner's video library grew. Editing had a separate confirmed hotspot: rebuilding the inventory's eligibility scan every frame. Implementation follow-ups below describe subsequent fixes; physical-device performance sign-off remains open.

The original Mac lag cannot be attributed entirely to Tiny Swords. This 8 GiB Mac was already swapping heavily, with little free disk space. The original preview's roughly one-core CPU consumption did not recur on every fresh island. Public hosting will change download delivery; it will not remove these client-side runtime costs.

The original investigation changed only diagnostic helpers and documentation; at that stage the shadow cache and cloud-copy fixes were diagnostic proposals. It did not optimize gameplay, overwrite the existing export, alter learner data, deploy, or publicly enable Tiny Swords. Later implementation work changed shared Godot rendering and the local integration and rebuilt the preview. Instrumentation and experimental work-removal flags remain confined to generated `.cache/tiny-swords-perf` copies.

Current implementation status: terrain shadows, offscreen suspension, editor
eligibility, cloud sheet correctness, static terrain/foam separation, cloud mask
dirtiness and shared visual revisions, resize-driven bridge width, immediate
camera commands, and the web pixel-ratio policy are implemented. Independent
island checkpoints are implemented for the opt-in accountless IndexedDB path;
legacy localStorage and signed-in storage retain their existing behavior.
The asynchronous RAF divisor is configurable and defaults to one display frame.
Physical iOS/Android, sustained video playback, real 30-minute/two-hour suspension,
and battery/thermal validation remain open. No rollout flags or deployment changed.

## Evidence and reproducibility

- [Recorded measurements](measurements.json): process CPU-time deltas, browser metrics, engine counters, per-second inclusive script timings, synthetic save timings, memory cycles, source fingerprints and file sizes.
- [CPU-profile summaries](profile-summary.json): sampled self-time percentages and relevant call stacks. Raw `.cpuprofile` files remain locally under `.cache/tiny-swords-perf`.
- [Runnable diagnostic loop](../../../../scripts/diagnostics/tiny-swords-performance/README.md): preparation, suites, background-tab protocol and cleanup.

The tested source was commit `b162a75f0359afd0107d51716c306f8302856c91` **plus the existing working-tree changes**, not that commit alone. The original `_site` release export was dated 15:18 Taipei time. Instrumented copies were rebuilt from the working tree; hashes in the measurements identify the important files. There is no hot-reload development framework in this comparison: it serves the generated app and Godot release WASM.

Environment: Apple M3 MacBook Air (`Mac15,13`), 8 logical CPUs, 8 GiB RAM; macOS 26.7; Godot 4.7.2 (`ed1daf0bf`); clean Chrome for Testing 151.0.7922.34 and the installed Playwright desktop WebKit port. The original everyday Chrome was version 154, with extensions and a different saved island; it was not reused for the isolated tests. No Windows, Android, physical iOS, Firefox, Intel Mac, or low-memory mobile hardware measurements were available.

At investigation start, swap usage was 8,855 MiB and available disk space about 7.7 GiB. Later swap usage was 9,671 MiB. The machine was on AC power when checked near the end (battery charging). Compression and swap counters rose during the investigation. Consequently, frame tails, resident memory, initialization and wall times are observations of this pressured machine, not universal user estimates. These OS observations do not establish that the game caused all swapping.

The automated suites used isolated browser contexts, no extensions, synthetic accountless profiles, 1440×1000 parent viewports, usually DPR 2, and a roughly 1054×454 CSS-pixel island. External requests were blocked; there was no actual video playback, thumbnail downloading, Anki service or learner account traffic. Large-library fixtures contain 300 videos per channel, fresh synthetic metadata and no accumulated study history. Real thumbnail decoding, playback, watch history and API refreshes can add cost.

Unless stated otherwise, each sample lasted 10 seconds after at least six seconds of warming; initial baseline warming was eight seconds. Most causal comparisons use baseline/probe/baseline repeats. CPU is **percentage of one logical core**, from cumulative process CPU seconds divided by wall seconds. Sum the dedicated browser's renderer processes to include same-origin parent/frame work. GPU columns are **GPU-process CPU**, not hardware GPU utilization or shader execution time. Browser rAF counts describe callbacks, not necessarily game frames; engine FPS is reported separately when instrumented. These distinctions matter: a 30-fps game can coexist with a 60-fps parent rAF loop.

Instrumentation includes inclusive wall timers and bounded engine telemetry at approximately 1 Hz. Web time resolution is coarse; small individual calls are not precisely resolved. Nested timers must not be added together. Browser profiles are sampled, mostly contain stripped WASM function numbers, and are not source-level GDScript flame graphs. Work-removal probes deliberately alter visuals or behavior and establish attribution; they are not production-ready fixes.

The original diagnostic helpers passed Python/JavaScript syntax checks, Godot import and release export, and owning-generator fixture validation. Recorded source and original-export fingerprints remained unchanged during that investigation. The original offscreen budget gate failed as documented below; the implementation follow-up passed a corrected matched-profiler gate. Generated diagnostic projects, export binaries and disposable browser profiles were removed; raw measured evidence was retained locally. The ordinary preview was rebuilt with the implementation changes.

## Integrated preview, parent and game comparisons

| Scenario | Renderer CPU, one core | GPU-process CPU | Frame observation |
|---|---:|---:|---|
| Edenia without iframe, empty synthetic library | 3.1–7.2% | 1.8–1.9% | Parent rAF about 60/s |
| Unmodified integrated fresh level-one island | 14.6–22.7% | 15.4–20.6% | Parent rAF fluctuated about 51–60/s |
| Unmodified game export alone, fresh island, full window | 15.1–16.9% | 11.1–12.0% | About 30 rAF/s; larger canvas, not a matched-size comparison |
| Game in a minimal parent, 100 flat tiles, matched CSS size | 25.2% | 14.6% | About 60 rAF/s |
| Instrumented integrated 100-tile idle, repeated uncapped runs | 25.4–27.1% | roughly 18–19% | Engine about 60 fps |
| Integrated 100-tile island fully offscreen, visible tab | 23.3% | 12.7% | Engine about 60 fps |
| Instrumented integrated 400 flat tiles | 37.1% | 16.2% | Engine about 60 fps |
| Ordinary level-ten fixture: 36 flat tiles, two trees, one sheep/chicken | 26.7% idle / 28.2% editing | 20.9% / 17.7% | Mostly 60 fps; a few 55-fps editor samples |
| Seeded playground fixture: 66 tiles, three stairs, one tree, sheep/chicken | 96.1% idle / 97.9% editing | 5.5% / 5.7% | About 14 fps |

The minimal-parent game comparison retains the integration script so gameplay and layout restoration are identical. Separate bridge suppression changed CPU only modestly; this is not an export with the adapter compiled out. The earlier full-window game-alone comparison has a different canvas and frame rate and must not be used to estimate an exact parent overhead.

The 100- and 400-tile islands and seeded 66-tile terrace use valid **playground grants**. The 36-tile flat level-ten and seven-tile level-two stair fixtures use ordinary progression inventory. The 66-tile fixture was generated by Godot’s existing playground generator with seed `20261005`, then valid sheep/chicken placements were restored through Godot validation.

The 100- and 400-tile stress islands exceed the current ordinary study-progression inventory and are stress cases, not estimates of the typical public island. They contain 9/36 trees and one sheep and chicken. Current terrain bounds contain at most 37×20 cells; increasing those bounds or inventory would require renewed scaling tests. Raised pieces and shadows can add work beyond a flat island of the same tile count.

The initial `integrated-offscreen` baseline was only partly offscreen: its bottom remained visible. It is excluded as evidence of full offscreen behavior. Later tests appended a disposable spacer and verified the iframe's entire rectangle was above the viewport. This fixes the geometry rather than relying on a scroll amount alone.

An explicit reproducible budget gate compares a fully offscreen iframe with the same synthetic parent after removing that iframe:

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=gate --assert-budgets
```

The recorded invocation failed its five-percent excess-CPU budget: **23.8% total renderer CPU − 3.6% paired parent control = 20.2% excess**. This is an investigation regression signal, not a claim that the issue was fixed. The paired parent control also avoids treating all Edenia CPU as game CPU.

Implementation follow-up: the gate now disables CPU profiling in both samples;
the earlier profiled-island/unprofiled-control comparison included unmatched
measurement overhead. The rebuilt preview measured **4.2% total renderer CPU −
3.5% paired parent control = 0.7% excess**, passing the five-percent gate and the
proposed two-percent target in this sample. The same iframe resumed WebGL
presentation and suspended again successfully. This synthetic visible-tab result
does not certify physical phones, video playback or long background intervals.

## True background tabs

A separate **normal browser launch** used no Playwright anti-throttling launch flags. All CDP sessions were detached before both 15-second OS samples. A ready level-one game ran inside a minimal local wrapper. Visibility events were recorded in the page, then read after sampling. The page changed from `visible` to `hidden`; its rAF counter rose only from 909 to 916 during the transition/background interval.

| Minimal game page | Renderer CPU | GPU-process CPU |
|---|---:|---:|
| Foreground, debugger detached | 18.6% | 23.7% |
| Background tab, debugger detached | 0.8% | 0.4% |

This confirms normal background throttling for this browser and small game. It does **not** certify the full Edenia parent in all browsers, an active media tab, mobile suspension, or a 30-minute hidden interval. Fully offscreen content in a **visible** tab is a separate condition and remained expensive. The originating background experiment, whose page still reported `visible`, is inconclusive and is not used here.

Several early diagnostic background attempts were invalid: the temporary server supplied an incorrect MIME type for `/`, causing Chrome to download HTML rather than navigate. Another launch was sampled before the game was ready. Those results were discarded. The corrected run asserted game readiness and the visibility transition; task-created downloads and browsers were cleaned up.

## Confirmed script and rendering costs

### Editor eligibility work

At 100 tiles, opening inventory raised renderer CPU to 40.5–41.7%. Temporarily bypassing `update_inventory_preview` reduced it to 26.1%, while maintaining roughly 60 engine fps. Re-enabling it restored the higher load. Inclusive timings place about **188–209 ms of work per second** in `inventory_changes`, almost all of the root preview-update cost. This scan ran repeatedly even when the pointer and terrain were unchanged.

The code iterates houses, trees and ground every frame, computes candidate elevation and validity, and rebuilds the list of possible transformations. It also invalidates `terrain.proposed_terrain` and resets object visibility each preview update. Cache eligibility against a layout revision and relevant actor/UI state; perform pointer hit-testing only when pointer/camera state changes. Invalidate on edits, undo, restore, actor occupancy, construction, collapse and selected-tool changes. Preserve the existing cursor/preview/placement rule agreement; do not cache solely by mouse coordinates.

Owning source: `godot/tiny-swords/scripts/level_two_preview.gd`, especially `inventory_changes`, `update_inventory_preview_state` and `update_inventory_preview`.

Implementation follow-up (2026-10-05): eligibility now reuses the last scan until
the relevant layout records or actor occupancy change. Layout inputs are compared
each update and copied only when changed, so direct construction, harvesting,
undo and restore mutations invalidate the cache without requiring every writer
to emit a signal. Pawn position is retained for house contact rules. Pointer
previews reuse their state until the pointer, camera, rules, UI, artwork generation
or relevant animated silhouette changes; stationary terrain previews retain their
proposed layout. Clicks still validate against the live placement rules.

The new `--suite=inventory` paired control forces cache misses while retaining
the same choices and visuals. In its repeated 100-tile samples, renderer CPU fell
from **45.9% to 26.6% of one logical core**, full eligibility scans went from
**205.7 ms/s at 59.6 calls/s to zero calls** in the warmed unchanged sample, and
inclusive preview work fell from **221.4 to 6.2 ms/s**. Cheap input comparisons
remain. Engine FPS stayed mostly at 60. The first uncached sample was higher
(65.4% CPU, 306.4 ms/s scan work); the first cached sample was 26.9% CPU with
6.2 ms/s preview work, so the repeated pair is the steadier comparison.
`copy_frames` was enabled throughout these diagnostic samples to hold the
separate cloud-mask issue constant, and no new console errors accumulated during
the samples. Evidence is retained in `.cache/tiny-swords-perf/inventory.json`
and its CPU profiles. These are instrumented desktop stress measurements, not
physical mobile performance claims. Native eligibility, terrain-preview and
outline-render checks passed, including six outline fixtures with zero pixel
mismatches.

### Per-frame shadow generation: dominant terraced-island cost

The flat-island tests understated this issue. A valid seeded 66-tile island with three stairs ran at roughly **14 fps and 96% renderer CPU while idle**. Repeated probes isolated the cause to `terrain_view.gd::draw_shadows`, not the Edenia parent, bridge, editor scan or animal routing.

| Shadow probe, uncapped | 66-tile terraced island | Seven-tile ordinary level-two island with one stair |
|---|---|---|
| Baseline | 95.7% CPU, about 14 fps | 56.5% CPU, about 60 fps |
| Shadow generation removed | 28.7%, returns to 60 fps | 24.1%, about 60 fps |
| Unchanged shadow textures reused | 28.4%, returns to 60 fps | 24.5%, about 60 fps |
| Baseline restored | 95.9%, about 14 fps | 54.2%, about 60 fps |

Inclusive timers in the terraced baseline recorded about **879 ms/s in `draw_shadows`**, including **694 ms/s in `shadow_receivers`** and **647 ms/s in `add_shadow_receiver`**. These timers are nested, not additive. The receiving-mask builder reads the terrain atlas and inserts per-pixel grass coordinates into a dictionary across the island. The shadow generator then visits 128×128 pixels for each caster and creates new `ImageTexture`s. All this is repeated on ordinary frame redraws even when terrain and shadows are unchanged. The CPU profile also contains GPU `readPixels` self-time (about 5.1% in the first terraced idle profile), consistent with repeated texture image retrieval; it is not evidence of GPU shader saturation.

The temporary cache retained the first shadow draw commands/textures per view and reused them on the stationary island. The shadows were still drawn; this is stronger evidence than merely hiding them. It has **no layout or preview invalidation** and is therefore unsuitable for shipping. A real Godot fix should cache receiving masks, clipped shadow images and source atlas reads against geometry/elevation revisions; invalidate on terrain changes, stairs, restore/undo and preview substitution; bound retained textures and preserve authored shoreline alpha/cliff support rules. Make static shadow regeneration independent of foam/hover frame redraw. Existing cliff/terrace render checks plus new edit/undo/preview checks are needed before accepting it.

This workload reproduces nearly the original one-core symptom without adding a frame cap. The original saved island was not profiled or inspected, so matching the symptom does not prove that it had this exact terrain. It does establish a realistic current gameplay path that can produce that load before public rollout.

### Terrain redraw

The uncapped matched-FPS probe reduced renderer CPU from 27.0% to 21.4% when terrain processing/redraw was stopped. Returning to baseline restored 27.0%. Redrawing at 5 Hz reduced CPU to 23.4%. The baseline terrain `_draw` timers were roughly 50–70 ms/s in these runs; the 5-Hz probe reduced that work substantially.

`terrain_view.gd` queues redraw each process frame. The base draw sorts keys and traverses all cells multiple times, even though foam advances at 5 fps and most terrain is static. Raised surfaces, backing and shadows have additional view instances. Separate static terrain from animated foam/editor overlays, retain sorted geometry until the layout changes, and redraw animated portions when their frame changes. The 5-Hz probe freezes or delays other terrain/overlay updates too; applying it wholesale would break hover responsiveness and is not the proposed implementation.

Implementation follow-up: static surfaces retain their canvas draw commands and
sorted base geometry until layout geometry or editor inputs change. Foam now has
a separate canvas item behind the grass and redraws at its authored 5-fps phase.
Editor overlays follow pointer, rules and silhouette changes independently. Cloud
masks compare their own candidate set/camera/visual revisions, render on changes
and the following frame needed for queued canvas commands, then retain their
texture. Source visual revisions are shared across clouds at each pre-draw
boundary; each cloud still owns its depth ordering and mask.

The 100-tile `remaining` suite compared forced per-frame redraws with caching at
matched 60-fps cadence: renderer CPU was **27.1% versus 23.5%**, with **23.4%** in
the cached repeat. Static terrain draw work was about **55 ms/s** in the control
and absent from unchanged cached samples. Forcing only masks while leaving
terrain cached used 24.7% CPU. GPU-process measurements varied (about 17–21%) and
do not establish dominant GPU savings. Native terrain-preview, stationary-cache,
cloud depth and six exact outline-render fixtures passed.

### Cloud depth masks and recurring errors

There are seven cloud depth viewports; six were active in these samples. Their logical mask size was 1152×496, independent of DPR in the desktop tests, and their active mode was `UPDATE_ALWAYS`. Each mask scans world children, synchronizes duplicate visuals and may queue terrain-copy redraws. Measured synchronization cost was roughly 31–45 ms/s. Disabling masks or throttling synchronization did not establish a dominant GPU saving; total CPU/GPU differences were small and varied.

The 5-Hz mask probe reduced synchronization timers to about 5 ms/s **but left active viewports in UPDATE_ALWAYS**. It therefore did not test dirty-only GPU rendering. A future shared depth buffer, dirty updates and culling should be tested against correct cloud depth ordering rather than justified by these numbers alone.

A definite correctness issue was reproduced in native and web runs: `cloud_visual.gd::sync_visual` copies a `Sprite2D`'s texture and frame but not its `hframes`/`vframes`. Copies created with six frames reject grazing frames 6–11. Native backtraces locate the error in that method; browser samples recorded thousands of console emissions over a short run. A diagnostic copy that synchronized sheet dimensions before the frame eliminated new errors during the probe. This is a confirmed fix candidate, although it did not remove most runtime load. Because it mutates existing copies, turning the flag off does not fully restore their initial state; use fresh copies for rigorous repeats.

Proposed Godot change:

```gdscript
copy.hframes = source.hframes
copy.vframes = source.vframes
copy.frame = source.frame
```

Place these assignments in the Sprite2D branch and cover idle/grazing/run transitions in the cloud occluder regression check. These assignments were not applied to source gameplay in this investigation.

Implementation follow-up (2026-10-05): the shared Godot `sync_visual` now copies
both sheet dimensions before assigning the frame. The expanded `cloud_depth.gd`
check keeps the same occluder across all idle (6), grazing (12), running (4),
and returning idle frames, plus a two-row sheet. It reproduced the dimension
mismatch and out-of-range errors before the fix, then passed without errors
afterward. The existing rendered overlap checks also passed at all four viewport
sizes. The integrated preview rebuilt with no script/import errors. A fresh
Chromium context restored the 66-tile terrace with one sheep and chicken and ran
for 15 seconds after readiness with **zero console/page errors**; evidence is in
`.cache/tiny-swords-perf/cloud-sheet-web.json` and the native before/after logs.
The diagnostic-only `copy_frames` flag is retired because ordinary and
instrumented exports now share the fix. This resolves the confirmed error spam;
it does not establish a large CPU/GPU improvement or a dirty-only mask renderer.

### Engine/browser work and frame caps

The browser profiles contain substantial WebGL `getParameter` work. Its stack reaches Emscripten `blitOffscreenFramebuffer` / `_emscripten_webgl_do_commit_frame`, distinguishing engine/browser frame presentation from Edenia layout work. In initial idle profiles `getParameter` accounted for about 4.5–6.2% of sampled wall time. This is evidence of presentation overhead, not a complete attribution of GPU time or proof that a particular shader dominates.

**Do not ship `Engine.max_fps` as a simple web power optimization based on these results.** The default project has no explicit cap. In repeated diagnostic runs, caps at 60/30/10 fps drove renderer CPU to roughly 83/100/100%, although the actual game FPS fell as requested. A profiled 10-fps run spent **77.4%** of sampled self time in `_emscripten_get_now` and **15.9%** in `now`: clock-reading busy work dominated rather than terrain or navigation. An earlier 30-fps sample appeared cheaper because the surrounding frame cadence differed; the repeated tests invalidate a blanket recommendation from that one result.

Implementation follow-up: `web_rendering_policy.gd` uses a guarded RAF-divisor
hook in the current single-threaded export, keeping `Engine.max_fps` at zero.
Divisor two produced steady 30-fps engine samples at 24.3% renderer CPU in the
100-tile test, without the earlier near-one-core spin. This did not improve CPU
over the cached 60-fps samples, so the game default remains divisor one; lower
cadence is an option for further device testing, not a promised power saving.

Godot 4.7's frame-delay source calls `delay_usec` for the target-FPS delay; the Unix implementation uses `nanosleep`, and the web OS inherits this path unless using proxy-to-pthread. The profile and cap intervention confirm spinning in this export. The exact stripped WASM symbol responsible for the wait was not resolved, so the detailed libc implementation is an inference, not a symbolized result. See [Godot web OS](https://raw.githubusercontent.com/godotengine/godot/4.7-stable/platform/web/os_web.cpp), [frame delay](https://raw.githubusercontent.com/godotengine/godot/4.7-stable/core/os/os.cpp), and [Unix delay](https://raw.githubusercontent.com/godotengine/godot/4.7-stable/drivers/unix/os_unix.cpp).

A native Godot comparison at 60 fps measured about 19.8% process CPU for 100-tile idle and 37.1% for editing, with the same inventory hotspot. The fresh native sample was 18.5% but includes five seconds of startup/warming in its CPU window, so it is not a clean warmed comparison. Native CPU includes its driver work and cannot be directly compared with just Chrome's renderer process. It shows that the editor cost exists in shared Godot logic rather than solely in the browser adapter.

### Bridge/layout reads

Bridge CSS-width reads cost roughly 1–2 ms/s in the timed runs; suppressing them or most bridge work did not produce a large repeatable saving. Browser layout counts did not show a per-frame forced-layout storm in the warmed idle samples. The current synchronous `getBoundingClientRect` read is an avoidable integration dependency, but it is **not the measured main cause**.

Cache the CSS width through a resize notification and keep transport event-driven where practical. Preserve six-CSS-pixel drag thresholds and existing scroll coordination. This belongs in integration; gameplay rules and policies remain in the Godot project.

Implementation follow-up: the browser adapter publishes canvas width from a
ResizeObserver; the bridge recomputes the six-CSS-pixel threshold on that event
and Godot viewport-size changes. Host camera commands call the bridge immediately,
with the existing startup queue retained. Width is no longer read from DOM layout
on every game frame. Study-level reconciliation and telemetry retain their
existing bounded polling.

## Large video libraries and island checkpoints

These tests answer the additional concern about many channels with hundreds of videos. They exercised the real `edeniaTinySwordsPersistence.save` adapter using an isolated accountless profile and eight acknowledged small island changes per fixture.

| Library | Durable profile characters after normalization | Warm island-save calls | First call | Result |
|---|---:|---:|---:|---|
| No channels/videos | small profile | 0.7–2.4 ms | 33 ms | All acknowledged |
| 10 channels × 300 = 3,000 videos | 1,232,235 | 36.5–48.8 ms | 185 ms | All acknowledged |
| 30 × 300 = 9,000 videos | 2,437,956 | 92.4–119.7 ms | 312 ms | All acknowledged; all 9,000 records retained |
| 60 × 300 = 18,000 videos | 3,899,286 | 180.5–194.6 ms | 317 ms | All acknowledged; 60 channels and all 18,000 records retained |
| 100 × 300 = 30,000 videos | No durable large fixture | Not measured | Seed save 134 ms, rejected | Ordinary save returned false; prior empty synthetic profile remained |

Profile characters are not total on-disk bytes or a universal browser quota. The successful 18,000-video fixture used the ordinary save path, which budgets replaceable metadata first. An earlier direct 7.4 MB raw localStorage seed failed; that harness failure does **not** mean canonical 18,000-video profiles cannot save. The 30,000-video attempt was through the ordinary save path and genuinely rejected on this browser. These fixtures have no real watch history, descriptions, thumbnails or backup history, so they are not a maximum-capacity guarantee.

The initial 9,000-video input was approximately 3.7 MB. Metadata budgeting reduced it to about 2.4 million characters without deleting video records, confirmed by count checks. Only eight video cards were mounted in the initial 3,000-/9,000-video DOM samples, with 1,318/1,818 total DOM elements respectively. Existing lazy rendering helps. It does not eliminate full-profile normalization, cloning, metadata budgeting or persistence.

Idle with the 18,000-video library remained around 23.4% renderer CPU and 60 engine fps. A warmed scroll sample was 25.4%. These are steady samples after loading, not sustained interactive scroll p95 or a video-playing workload. The save phase recorded long tasks reaching hundreds of milliseconds; they include interleaved game/parent/background work and must not all be attributed to a single save. The save profile specifically includes `loadState`, video-progress/organization normalization, JSON cloning and GC.

Source cause: `src/state/tiny-swords-island.js` checks the durable predecessor and calls `saveState` with backups/analytics disabled. `src/state/store.js` still reads/parses/normalizes or serializes the entire profile; `src/app.js::saveState` also builds portable profile snapshots. The adapter repeatedly reads durable/current state to enforce save identity. Skipping backups correctly avoids another large copy, but does not make island updates independent of library size. Simply moving the same full-profile computation to asynchronous IndexedDB would not remove all main-thread work.

Checkpoint frequency is event-driven rather than a periodic whole-profile write every frame. Animal movement completion, cutting state transitions, construction and edits invoke saves. Wandering normally begins after 10–15 cycles of 3.6 seconds; following/escape may finish more often. Multiple actors or rapid edits can therefore make expensive profile writes frequent. The 0.2-second bridge poll is not itself a save every 0.2 seconds.

Before rollout, decouple high-frequency island checkpoints from whole-library normalization and cloning. An incremental repository or dedicated island record must retain profile identity/generation, trusted-predecessor/CAS checks, replacement fencing, acknowledgment, export/import, recovery/backups and cross-tab behavior. Coalesce redundant checkpoints while preserving action durability. Do not introduce an unversioned parallel localStorage island key or weaken predecessor validation for speed.

### Checkpoint implementation follow-up

The accountless, opted-in IndexedDB path now stores a small versioned head and
immutable profile body, sharing the existing revision sequence and write queue.
The first island save splits the legacy record in one transaction. Warm saves
read/write only the head, verify durable readback, and check the exact access fence.
Ordinary profile saves rebase independent local study changes against the latest
island and atomically replace body/head. Imports and resets fence previous frames;
an event arriving during acknowledgment is retained until the frame can remount.
Exports and recovery backups still read a complete profile containing the latest
island. The original localStorage and signed-in lifecycle paths remain in place;
**rollout flags have not changed**, so their checkpoint costs are not fixed by this
implementation. No public enabling or deployment occurred.

The isolated `checkpoints` diagnostic uses the real Edenia adapter, opts into
IndexedDB in a disposable context and removes the game iframe to isolate persistence.
It retains the same 300-videos-per-channel fixture recipe and ordinary profile
normalization on seed. This is a persistence comparison, not a frame-time benchmark.
Twenty acknowledged warm calls per fixture produced:

| Videos | Retained channels/videos | First split | Warm median | Warm maximum |
|---|---:|---:|---:|---:|
| 0 | 0 / 0 | 2.9 ms | 0.3 ms | 0.7 ms |
| 18,000 | 60 / 18,000 | 38.4 ms | 0.3 ms | 0.9 ms |
| 30,000 | 100 / 30,000 | 31.2 ms | 0.3 ms | 0.8 ms |

The first split remains proportional to library size. The 30,000-video profile
contained 5,847,788 JSON characters and saved successfully through IndexedDB.
Raw samples remain in `.cache/tiny-swords-perf/checkpoints.json`; the coarse browser
clock and short synthetic run do not establish a universal latency guarantee.

Focused browser checks passed in Chromium and desktop WebKit for reload, queued
study rebases, import/reset, quota and readback failures, lost fences, preservation
of newer writers, and UI export/import with a durable recovery backup. A separate
20-call instrumented storage check saw only `active` head reads/writes (about 1.6 KB)
for empty and 30,000-video libraries, including refreshes from another repository;
favorite/watch-history facts were retained. The real `checkpoint-game` smoke check
passed Godot acknowledgment, a study save retaining the current iframe, and durable
island/study restoration after reload. Fifteen focused Node contracts passed, the
existing Chromium profile-storage suite passed, and the local integrated preview
was rebuilt successfully.

## Memory, allocations and startup

WASM memory was measured by retaining the exported WebAssembly.Memory from instantiation; JS-heap metrics alone miss it. A populated 100-tile game initially used about **55.4 MiB** of WASM linear memory. Repeated build/tree cycles grew it to **66.5 MiB** and then plateaued across the measured cycles. Growth can reflect allocator high-water capacity rather than retained live objects; it is not by itself proof of a leak.

Sixty repeated tree cycles and thirty edge-tree/editor reopen cycles were run. In the latter, outline cache entries grew from 8 to 32 as variants/poses warmed, then stayed at 32; resource count stayed at 202; node/object counts stabilized with cloud-copy variations; sampled orphan count was zero. Engine-reported video memory grew during warming and then plateaued, around 145 MiB in that sequence. This does **not** certify a multi-hour session, all offset/terrain variants, undo/recovery churn or mobile memory stability. The static outline cache is keyed by texture instance and region; more distinct generated/clipped textures still warrant a longer retention test.

Renderer RSS observations ranged roughly 136–377 MiB across contexts, with separate GPU/browser processes. On macOS under compression, RSS is neither total renderer footprint nor private live heap; do not compare it directly with the original Chrome Task Manager's 650–740 MB reading. JS heap in small game samples was often around 13–25 MiB and around 24 MiB with the 18,000-video library. GC and process/context timing affect these snapshots. Engine `MEMORY_STATIC` returned zero on web and was not used as a total-memory estimate.

At DPR 2 the main canvas was 2108×908 versus 1054×454 at DPR 1: four times the pixels. Matched cloud-suite samples showed engine video-memory estimates around 126–138 MiB versus 115 MiB, respectively, and similar 60-fps CPU on this M3. The masks stayed at logical resolution. This disproves neither mobile fill-rate risk nor the benefit of a resolution cap; a strong desktop and a memory estimate are not a GPU saturation test.

Desktop WebKit loaded the fresh game and ran mostly at 60 fps with occasional lower engine samples. A corrected 393×852 touch/viewport emulation at DPR 3 produced a 1179×1362 game canvas, 60-fps samples and roughly 167 MiB engine video-memory estimate. This runs on the Mac's hardware and desktop WebKit; it is not an iPhone result. An initial emulation lacked a parent viewport meta tag and produced a 980-CSS-pixel layout; that run was replaced and excluded.

Implementation follow-up: the shared Godot web policy caps the engine pixel ratio
at two while preserving `canvas_items` scaling and fractional input. The repeat
WebKit phone-size/DPR-3 case produced a **786×908** backing canvas, steady 60-fps
samples, no errors and a 159.7-MiB engine video-memory estimate. The backing pixel
count is 56% lower than the original DPR-3 case; total memory is not reduced by
that same percentage because textures, engine and browser allocations remain.
Desktop DPR-2 stayed at 2108×908 with mostly 60 fps. A Chromium device-harness
check verified resize publication, five-CSS-pixel movement without panning,
seven-pixel movement with panning, and immediate host camera commands.

The 1,000-action tree edit/undo stress run retained the original terrain, tree
variants, stock and wood. After the 200-action warmup and queued-free flush, all
samples retained **177 nodes, 1,856 objects, 201 resources, zero orphan nodes**
and **58,064,896 bytes (55.4 MiB) of WASM capacity**, including the final sample.
This is a short synthetic action stress check, not a 30-minute soak or proof of
physical-mobile memory safety. Native sheep catch-up for simulated 60.37,
1,800.37 and 7,200.37 seconds matched continuous playback. Actual browser loop
suspension/resume preserved construction reservation/completion and cutting's
clock/final-swing/log award in the `offscreen-actions` suite. Real hour-long
suspension and video playback remain distinct open checks.

| Existing release file | Raw | Gzip, local estimate | Brotli quality 6, local estimate |
|---|---:|---:|---:|
| WASM | 39,514,754 bytes | 10,114,291 | 8,182,023 |
| Asset PCK | 2,287,360 | 1,962,794 | 1,732,009 |
| Engine JavaScript | 279,815 | 68,740 | 65,276 |

The local HTTP server served uncompressed files. Typical local resource transfer durations were milliseconds to a few hundred milliseconds; readiness after page load was often around 1.6–2.1 seconds in later runs. These are neither cold-device startup nor public-network results. Brotli estimates total about 10 MB before the Edenia app, images and other traffic. At 10 Mb/s, transmission alone would be about eight seconds for those game files, excluding latency and compilation; this is an arithmetic scenario, not a network measurement.

Require compression, immutable content-versioned caching, correct WASM MIME and lazy startup when the island is needed. Consider a trimmed web export template only after correctness/compatibility testing. There is no evidence here that a public host by itself will reduce runtime CPU. Godot's [web export requirements and limitations](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) also make real mobile/WebKit verification necessary. The current export is single-threaded; enabling threads is not a demonstrated solution and requires cross-origin isolation/embedding review.

Implementation follow-up: the integration builder now writes Brotli/gzip
WASM/PCK/JavaScript variants alongside the ordinary export; the static server
negotiates current variants and retains the original MIME type. A transport
contract checked decoded bytes, encoding quality preferences and HEAD lengths;
the real WASM response retained `application/wasm`. Brotli WASM/PCK total about
9.5 MiB. Fresh Chromium contexts became ready in 1.1–1.6 seconds on local delivery
at DPR 1/2/3 with no errors. The phone-size 10-Mb/s, 100-ms-latency compressed
probe took **9.8 seconds** from navigation to readiness. This misses the proposed
five-second slow-start target; compression alone cannot close the download and
compilation gate. These are Mac and network-emulation measurements. Physical
startup, lazy public loading, hosting cache configuration and a trimmed engine
template remain unvalidated. The device harness and reproducible suites live in
the diagnostic README; condensed evidence is in
[implementation-measurements.json](implementation-measurements.json).

## Prioritized recommendations and rollout gates

| Priority | Work | Evidence / tradeoff |
|---|---|---|
| P0 | Cache receiving masks and clipped terrain shadows; stop per-frame image/texture regeneration | About 96% → 28% CPU and 14 → 60 fps on the terrace; about 55% → 25% on an ordinary one-stair island. Proper geometry/preview invalidation is essential. |
| P0 | Suspend unnecessary island presentation while fully outside the visible study viewport; resume reliably | About 20 percentage points of excess renderer CPU remained offscreen. Host reports intersection/visibility; Godot owns the policy and elapsed-time rules. Avoid unloading the iframe on each scroll. |
| P0 | Make island checkpoint cost independent of large video libraries, with acknowledgment/coalescing | Warm save cost rose from about 1 ms to about 185 ms at 18,000 videos. Preserve data ownership and replacement/predecessor checks. Treat quota failure as a storage gate, not an animation optimization. |
| P1 | Cache editor eligibility and terrain geometry; update animated foam by frame change | Editor bypass removed roughly 15 CPU points; terrain work-removal about 6. Preserve valid previews and responsive pointer/actor occupancy. |
| P1 | Fix cloud occluder sheet dimensions and eliminate runtime error spam | Reproduced native backtrace and zero new errors with the diagnostic copy fix. Small change with a direct animation-transition test. |
| P1 | Validate mobile memory/startup and choose a rendering-resolution policy | Approximately 55–67 MiB WASM plus substantial textures/render targets and browser overhead. Desktop touch emulation cannot certify mobile. |
| P2 | Optimize cloud masks if matched visual/GPU tests justify it | Synchronization costs measured; dominant GPU benefit not established. Sharing/dirtiness may affect depth ordering. |
| P2 | Resize-driven bridge width caching and event-driven transport | Small measured idle cost; useful cleanup, not a main performance fix. |
| P2 | Test a browser-compatible frame scheduler if lower animation cadence is desired | Engine.max_fps spun in this single-threaded export. Do not reduce rendering frequency through a blocking wait. |

Rendering suspension must retain the documented background semantics: cutting countdown/minimum duration and final swing boundary, tree regrowth deadlines, construction reservation/20-second clock, sheep grazing/movement and delayed chicken following. Pausing the scene tree alone is not proven to stop engine presentation. Disabling rendering may enter a frame-delay path; measure it for busy waiting. The host should communicate visibility/intersection as an integration fact, with the game deciding how to catch up. Persist safely before a true teardown, coalesce resume checkpoints, and avoid a burst of whole-profile saves. Long hidden-time catch-up was inspected in source but not causally timed for hour-long gaps here.

The following are **proposed acceptance criteria**, not claims that all existing builds pass:

| Gate | Suggested measurable requirement |
|---|---|
| Visible normal island | 60 fps on representative desktop; at least 30 fps on supported physical mobile; p95 frame interval ≤33 ms desktop / ≤50 ms mobile during movement, cutting, construction and editing |
| Offscreen visible study page | Within one second, game-induced renderer CPU ≤2% of one core, ≤1 presentation/s or fully suspended; no continued expensive GPU submission; compare against the paired no-game page |
| True background tab/app | Near-zero game CPU (≤1% over 60-second samples), no console errors; test normal browsers with debugger disconnected and with active video playback separately |
| Input/study responsiveness | p95 input latency <100 ms, no repeated >50 ms main-thread tasks due to island checkpoints; record ten minutes including scrolling and playback |
| Checkpoint scale | p95 parent main-thread checkpoint work <16 ms, acknowledged persistence <100 ms across 0/3k/9k/18k/30k-video libraries; retained study facts and island identity verified; a storage failure must preserve prior data |
| Memory retention | No monotonic live-resource/node/heap growth after warmup across 1,000 mixed edits/undo/restore actions and a 30-minute run; plateau within 10% after GC-aware comparisons; no mobile tab reload/termination |
| Startup | No game download/compilation blocking first study interaction; needed game ready within five seconds on a named supported device/network/cache condition; record cold and warm separately |
| Resume correctness | 1 minute / 30 minutes / 2 hours hidden: clocks, final swing, reservations, animals, persistence and cross-tab replacement remain correct; catch-up does not produce a long task or save storm |
| Coverage | Chrome/Edge and Firefox on ordinary desktop hardware; Safari macOS; actual iPhone/iPad WebKit; Android Chrome with 4 GiB-class hardware; DPR 1/2/3; plugged-in and battery; current normal island and deliberately larger/terraced/house-heavy fixtures |

The original baseline failed the terraced-island frame-rate, offscreen and large-library checkpoint targets on this Mac. Implementation follow-ups address the measured hotspots but do not establish universal mobile performance or public readiness. Physical-device battery/thermal/GPU counters, Firefox/Windows/Android, real video playback, a full parent-page normal-background trial, physical cold startup, hour-long suspension, and multi-hour retention remain unverified. The compressed 10-Mb/s startup probe still exceeded five seconds. These are explicit rollout work items, not reasons to discard the confirmed findings.
