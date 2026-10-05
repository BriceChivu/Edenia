# Tiny Swords performance diagnostics

Run from the Edenia repository root. These helpers use an existing `_site` local
Tiny Swords integration export, fresh disposable browser profiles, and synthetic
learner profiles. They serve read-only build files on ports 8047–8049 and adjust
both localhost guards in HTTP responses. They never read the existing browser's
learner data or modify `_site`, game source, or the ordinary preview on 8037.
External requests are blocked in the automated integrated tests. Background and
WebKit runs use a minimal local game wrapper with no remote app services.

Requirements: repository Node dependencies including Playwright browser binaries,
Python 3, and the existing Godot 4.7 export installation. No dependencies are
installed by these helpers. Run browser suites **one at a time**; keep other
workload and power/display conditions recorded. Ignore comparisons with different
engine frame rates unless explicitly normalized. Chromium's GPU-process CPU time
is not GPU utilization, JS heap excludes WASM, and macOS RSS excludes compressed
pages. These are investigation tools, not universal device benchmarks.

For an uninstrumented repro and an explicit failure signal:

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=gate --assert-budgets
```

It warms the real integrated export, measures foreground and fully offscreen
execution, removes the iframe for a paired parent-page control, and fails if
excess offscreen renderer CPU exceeds five percent of one logical core. The gate
also checks that suspended WebGL presentation stops and the same frame resumes
and suspends again. Without `--assert-budgets`, it records the CPU result without
failing its budget.

Prepare a separate instrumented Godot copy and export:

```sh
python3 scripts/diagnostics/tiny-swords-performance/prepare.py
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --editor --import
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --script "$PWD/scripts/diagnostics/tiny-swords-performance/generate-fixtures.gd" -- "$PWD/.cache/tiny-swords-perf"
mkdir -p .cache/tiny-swords-perf/export3
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --export-release Web "$PWD/.cache/tiny-swords-perf/export3/index.html"
node scripts/diagnostics/tiny-swords-performance/patch-export.mjs
```

Check the import/export logs for parser errors before measuring. Godot can finish
an import with script errors. The diagnostic copy adds aggregate inclusive wall
timings, engine FPS/node/resource/render-memory counters, and controlled flags.
It never exports over the existing preview. `terrain-stop`, `mask-stop`,
`preview_stop`, `shadow-stop`, and animation-stop probes deliberately remove work or change
visuals; they establish attribution and are not ready-to-ship optimizations.
`mask_hz` throttles mask synchronization but leaves UPDATE_ALWAYS rendering in
place. `copy_frames` mutates existing mask-copy dimensions; disabling the flag
is not a complete reset of copies, so use a fresh context for rigorous repeats.
`shadow_cache` reuses the initial shadow textures without layout/preview invalidation: it is valid only as a static-island diagnostic and is not a shippable cache.
WASM instantiation and GL query wrappers also add measurement overhead.

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=baseline
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=causal
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=inventory
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=cloud
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=shadows
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=caps
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=growth
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=library
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=checkpoints
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=checkpoint-game
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=actions
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=offscreen-actions
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=memory
node scripts/diagnostics/tiny-swords-performance/background.mjs
node scripts/diagnostics/tiny-swords-performance/webkit.mjs
```

The 100-/400-tile islands use valid playground grants and exceed the current
study-progression inventory. `library` uses 300 synthetic videos per channel,
fresh metadata, no actual thumbnails/playback and no study history. It writes
through the ordinary save path so metadata budgeting runs before storage.
Verify retained channel/video counts, not only input sizes. Island save timing
covers the real persistence adapter, with eight acknowledged calls per fixture;
it intentionally changes synthetic stock, so it measures transport/persistence
and does not certify gameplay-valid rewards.

`checkpoints` overrides runtime config only in its fresh synthetic browser contexts
to opt into IndexedDB. It uses the real Edenia persistence adapter without a game
iframe, measures the first split separately from 20 warm acknowledged checkpoints,
and verifies retained counts for empty, 18,000- and 30,000-video profiles. Its small
diagnostic island changes test transport, not gameplay validity. Results are stored
in `.cache/tiny-swords-perf/checkpoints.json`. The ordinary `library` suite retains
the default storage configuration. `checkpoint-game` uses the real uninstrumented
Godot export with the same isolated IndexedDB opt-in and checks save acknowledgment,
a study save without remount, and island/study retention after reload. Neither suite
changes the repository's rollout flags or the user's browser profile.

`inventory` opens editing on the 100-tile stress island and alternates two pairs
of 10-second uncached/cached samples. `inventory_uncached` forces eligibility and
preview cache misses without changing the available choices or rendered preview.
The diagnostic `copy_frames` fix stays enabled for every sample to hold that
separate cloud-mask issue constant. Warmed unchanged samples should have no calls
to `build_inventory_changes`; compare the repeated CPU and inclusive preview
timings in `.cache/tiny-swords-perf/inventory.json` and retain both pairs to show
run-to-run variation. This suite measures the instrumented game wrapper.

`background` launches normal Chrome for Testing without Playwright's launch-time
anti-throttling flags. It disconnects all CDP sessions and samples OS cumulative
CPU time for 15 seconds in each state. It verifies a ready game and a recorded
visibility transition. It tests the game wrapper, not the whole Edenia parent.
It uses a task-owned `normal-profile` and closes its browser; no existing Chrome
session is controlled. `webkit` is desktop WebKit plus a viewport/touch emulation,
not physical iOS. Its results overwrite `.cache/tiny-swords-perf/webkit.json`.

Results and CPU profiles are ignored under `.cache/tiny-swords-perf`. Profile
files can be opened in browser DevTools. Timings are inclusive: do not add a
root timer to its nested timers. Keep the collected evidence, then remove the
generated Godot project, exports and `normal-profile` when finished. Do not copy
instrumented exports into `_site` or a deployment. The report and recorded
measurements for 2026-10-05 live under
`docs/experiments/tiny-swords/performance-2026-10-05/`.
