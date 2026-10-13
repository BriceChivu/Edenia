# Tiny Swords stalls at 60 FPS

Experiment: #453. Gate: measured improvements with the real application and isolated profiles, then internal-test deployment. The internal default returns to **60 FPS**. Public URLs without an explicit FPS experiment retain their existing rendering and replay policy.

## Workload and measurement

The browser benchmark uses installed Chrome 155 on an Apple Silicon Mac, headed and using Metal. Phone emulation uses 390×844, DPR 3 and 4× CPU throttling; it is not a physical Pixel 7a or a measurement of its carrier connection. Audio runs after a trusted canvas gesture. The real application restores the same 32-tile level-10 island, four trees, two chickens and two sheep. The pawn walks continuously, with continuous mouse movement over the island and terrain editing in the second scenario.

The library contains 1000 real public video records from `tests/fixtures/tiny-swords-fps-videos.json`, including actual IDs, titles, durations and thumbnail URLs. The ordinary virtualized feed is warmed with real CDN thumbnails before returning to the island. This is not 1000 mounted players or concurrent YouTube playback. Two hundred synthetic watch histories and study updates every six seconds exercise persistence without touching a learner's profile.

`--cloud-sync` runs the actual signed-in application, ownership and handoff checks, portable-profile preparation, hashing, IndexedDB persistence, network-write coalescing and accepted receipts. Only authentication/server responses and transport are simulated: 500 ms latency, 1 Mbps upload and 2 Mbps download. These are explicit assumptions, not observed carrier speeds. Each full run requires at least two accepted simulated commits. No real cloud writes or quota changes occur.

Encoding comparisons use the same browser at **60/60/60/60 FPS**, with synchronous/asynchronous/asynchronous/synchronous replay encoding. Each round has two seconds of warm-up and five seconds of measured frames. An isolated local recording stub exercises the existing mirror without loading PostHog or sending analytics. Both variants use the same image dimensions, quality and capture cadence. Whole-page main-thread work comes from CDP `Performance.TaskDuration`; it includes host and same-origin game tasks, excludes GPU and other threads, includes warm-ups and has up to 250 ms phase-boundary uncertainty. Frame percentiles exclude warm-ups. Faster rendering can increase measured engine-loop work because more frames complete; whole-page work is the relevant comparison.

## Encoding results at 60 FPS

| Environment / scene | Main-thread work reduction | Actual FPS, sync → async | p95 frame interval, sync → async | Gaps over 50 ms, sync → async |
| --- | ---: | ---: | ---: | ---: |
| Phone emulation, walking | 19.2% | 43.6 → 53.2 | 74.4 → 22.3 ms | 37 → 15 |
| Phone emulation, terrain | 26.3% | 48.2 → 53.9 | 34.2 → 32.2 ms | 23 → 4 |
| Laptop, walking | 12.1% | 55.9 → 59.6 | 31.8 → 18.9 ms | 3 → 2 |
| Laptop, terrain | 26.4% | 57.1 → 58.9 | 31.3 → 18.9 ms | 3 → 2 |

The phone run includes CPU profiling in both encoding variants. It recorded 763 and 830 mouse moves across the scenes, eight synthetic study updates and three accepted simulated cloud commits. The gains support the gated encoder change. They do not establish a steady 60 FPS on the physical phone.

Internal-test analytics are disabled by the existing privacy gate. Consequently async mirror encoding alone does **not** explain or fix the ordinary internal-test route's reported lag. It is active when that mirror is explicitly exercised; production replay remains synchronous pending its own rollout validation.

## Navigation and remaining stalls

The native fixture exercises seven reachable or unreachable blocked destinations against the original collision checks. The final build measured a worst legacy synchronous search of 50.659 ms, accelerated total search work of 32.165 ms, and a largest incremental search slice of 2.026 ms. Time slicing spreads the work across frames; total route preparation can take longer in wall time. The two-millisecond deadline is cooperative: a collision primitive can overrun it.

The gate checks matching reachability, exact endpoints, every original segment predicate, expired deadlines, completion across frames, cancellation on redirect or layout change, and prevention of remote log reservation while navigation is pending or cancelled. Existing log, tree, stair and chicken checks also passed with the new planner enabled.

The blocked-route browser comparison also ran at 60 FPS with real video records, mouse movement and successful simulated cloud syncs. Its largest synchronous route calls were 134.2/133.1 ms for walking/terrain; the new search's largest recorded slices were 2.7/2.8 ms. New searches used at most 17.5/16.6 ms of search work and took up to 254.7/132.4 ms of wall time while yielding. The pawn waits for its route during that preparation.

| Blocked scene | Actual FPS, legacy → bounded | Gaps over 50 ms, legacy → bounded | Page main-thread work, legacy → bounded |
| --- | ---: | ---: | ---: |
| Walking | 49.0 → 49.6 | 45 → 42 | 564.6 → 564.8 ms/s |
| Terrain | 52.5 → 56.3 | 18 → 10 | 327.4 → 319.2 ms/s |

This establishes a large reduction in individual navigation blocks, with a clearer overall frame gain in terrain. Walking's sustained main-thread cost did not improve in these separate runs; other host/game work remains material. The navigation change is not presented as a universal average-FPS improvement.

Ordinary walking and its smoothing yield within a shared frame budget. Construction previews and animal queries remain accelerated synchronous calls because previews temporarily substitute the world layout. Some click paths also perform synchronous reachability preflight. These remain potential stall sources, and this change does not claim to eliminate all pathfinding stalls.

## Public versus internal route investigation

Both deployed URLs were verified to use `site-entry.js?v=ecd09f50d4bc-p1-g1` before this experiment. The internal route forces the signed-in learner-profile lifecycle and cloud machinery on; ordinary public account features and that lifecycle are disabled. They also use separate local profile namespaces, so a learner's actual island and history can differ. The previous internal default of 30 FPS was another visible difference; this release restores 60 FPS.

Matched phone-emulation runs used the same island, 1000-video library, 200 synthetic study histories, mouse input, local persistence, progress cadence, CPU profiling and fixed 60 FPS. Both used replay **off**, matching the internal privacy policy and removing encoder work as a route confound. The internal run additionally used the full simulated cloud pipeline.

| Scene / route | Actual FPS | Page main-thread work | Gaps over 50 ms in 20 sampled seconds |
| --- | ---: | ---: | ---: |
| Walking, public | 56.8 | 472.4 ms/s | 10 |
| Walking, internal | 53.2 | 519.3 ms/s | 33 |
| Terrain, public | 57.6 | 298.7 ms/s | 8 |
| Terrain, internal | 55.5 | 297.7 ms/s | 10 |

The internal walking run used about 10% more main-thread work and had more stalls. Terrain did not show higher sustained main-thread work in this run, although its frame rate was slightly lower. Separate fresh-browser runs and moving animals retain variability; this is evidence for additional signed-in work, not proof of every aspect of the physical Pixel's persistent slowdown. The actual phone's profile, island, GPU and thermal state still require its capture.

The internal 60 FPS CPU profile without replay sampled the following inclusive times over approximately 28 seconds per scene:

| Function | Walking | Terrain |
| --- | ---: | ---: |
| `preparePortableLearnerProfileEnvelope` | 1647 ms | 760 ms |
| `sha256Base64UrlSync` | 760 ms | 411 ms |
| `canonicalizeJson` | 589 ms | 371 ms |
| `captureProfileChanges` | 186 ms | 190 ms |
| `portableProfileChangeDigest` | 196 ms | 198 ms |

These inclusive values overlap and must not be added. The matched public profile also prepares envelopes for local persistence, but sampled only 540/462 ms in that operation and no change-journal capture/digest calls. Separately, in the encoding comparison, the synchronous encoder used about 1497/1742 ms of sampled self time during the control rounds. The cloud profile preparation is measured host work; its presence supports investigating the signed-in route rather than assuming network latency alone freezes rendering.

The next useful fixes are to reuse normalized study data and digests when only the island checkpoint changes, avoid repeated full-profile preparation during coalesced writes, and make remaining serialization/hashing yield or run off the main thread. Implementing those requires preserving owner/generation fences, dirty-change detection, accepted receipts and recovery behavior. No sync cadence, database retention or profile protection is weakened in this experiment.

## Pixel evidence capture

On `?internal_test=1`, open **FPS test → Lag capture**. Start **Log lag** for the lowest-overhead diagnosis, or **Record clip** for the game canvas plus timings. The menu closes; tap **Mark lag** after a noticeable stutter. Reopen the menu, **Stop capture**, then **Save lag report** and optionally **Save clip**. Attach the JSON and video together when reporting the symptom.

Logging lasts up to three minutes; clips last up to 60 seconds with a 16 MB soft limit. Reports include engine frame intervals, loop work, supported host/game long tasks, bounded-search timing, sync-status transitions, local persistence timestamps, lag markers, release path and browser/network estimates. They exclude profile payloads and credentials. Clips capture only the game, without microphone. Files are downloaded locally with no automatic upload. Hidden/offscreen gameplay stops capture. Recording itself adds load, so compare it with Log lag alone; Android's screen recorder is a fallback when the browser encoder is unsupported.

## Reproduction and evidence

Build the source-owned integration and serve it on port 8053. For public-route comparison, include `EDENIA_TINY_SWORDS_PUBLIC_ENABLED=true` in the build environment.

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
node scripts/serve-static.mjs --port 8053 --root _site
node scripts/benchmark-tiny-swords-fps.mjs --url http://localhost:8053/ --chrome --phone --cpu-throttle 4 --indexed-db --sample-ms 5000 --cloud-sync --replay async --replay-abba --fixed-fps 60 --profile-cpu --output .cache/stalls/paired-replay-60-phone.json
```

Omit `--phone --cpu-throttle 4 --profile-cpu` for the laptop comparison. Use `--replay off` for the ordinary internal privacy policy. Use `--route public --study-profile --progress --replay off` for the same accountless fixture. Use `--obstacle-routes --hard-route --replay off` for a blocked walking route and add `--legacy-navigation` for its control. `--fixed-fps 30` retains the optional older comparison. Benchmark contexts are disposable and seeding is restricted to localhost.

Raw JSON, CPU profiles, rendered screenshots, local playable clip and validation logs are retained outside the managed worktree in `Edenia-audits/tiny-swords-stalls-2026-10-13/` so branch cleanup does not discard the evidence. Local browser tests decode a real captured clip and verify changing nonblank pixels; they also download a JSON report after blocked-route motion and verify capture stops when gameplay is suspended. Physical Pixel retesting remains open.

Validation before submission: source-owned integration builds completed; all **2170** contract tests passed with the ordinary CI packaging; the FPS/capture and production-replay browser checks passed in both desktop and phone layouts (**4 tests**). The public packaging was separately built for matched-route benchmarks. Required CI and hosted release verification are deployment gates.
