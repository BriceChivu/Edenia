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

## Native-resolution research — 2026-10-09

### Production tree-cache validation — 2026-10-10

`research-inventory-ui` uses the ordinary integrated export with no gameplay
instrumentation. It opens inventory, clicks the pine at (2,2) on a 100-tile
synthetic island, then clicks the actual Undo button. Every pair must persist
the changed variant and restore the exact terrain, trees, stock and resources.
Compare separate builds serially; retain the JSON after each run before the next
run overwrites it. `--mobile` uses DPR 3 phone layout on the Mac, not a real phone.

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory-ui --site=PATH_TO_BASELINE_SITE --seconds=3 --repeat=5
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory-ui --seconds=3 --repeat=5
```

For fresh diagnostic exports, `tree_texture_cache` now defaults to the canonical
production cache. An explicit false bypasses it through the unchanged clipping
routine, and `research-inventory-actions` sets false/true/false explicitly. The
historical prototype remains supported for source without the production cache.
Do not reuse an old generated export to validate current production code.

The `research-*` suites retain the current default native pixel density. They
disable per-WebGL-call timing and the JS CPU profiler. The diagnostic preparer
also adapts the older inventory-cloud probe to the current rare-cloud property;
run it before measuring the research suites. Do not compare an old generated
export that imposed a DPR-2 cap with the native-density export.

Rebuild the ordinary integration first:

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
python3 scripts/diagnostics/tiny-swords-performance/prepare-research.py
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --editor --import
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --script "$PWD/scripts/diagnostics/tiny-swords-performance/generate-fixtures.gd" -- "$PWD/.cache/tiny-swords-perf"
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --script "$PWD/scripts/diagnostics/tiny-swords-performance/bake-cloud-metadata.gd" -- "$PWD/.cache/tiny-swords-perf/cloud-metadata.json"
python3 scripts/diagnostics/tiny-swords-performance/prepare-research.py
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --editor --import
/Applications/Godot.app/Contents/MacOS/Godot --path .cache/tiny-swords-perf/project --script res://tests/research_cloud_depth.gd
/Applications/Godot.app/Contents/MacOS/Godot --path .cache/tiny-swords-perf/project --script res://tests/research_cloud_metadata.gd
/Applications/Godot.app/Contents/MacOS/Godot --path .cache/tiny-swords-perf/project --script res://tests/research_tree_shadow_clipping.gd
/Applications/Godot.app/Contents/MacOS/Godot --path .cache/tiny-swords-perf/project --script res://tests/research_tree_texture_parity.gd
mkdir -p .cache/tiny-swords-perf/export3
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --export-release Web "$PWD/.cache/tiny-swords-perf/export3/index.html"
node scripts/diagnostics/tiny-swords-performance/patch-export.mjs
```

Check every import/export log for parser errors. The metadata bake is optional
for static-cloud tests, required for `research-recycle`. Native depth checks need
a real renderer; headless rendering cannot validate their pixels. Generated
metadata is a diagnostic snapshot, not a shipped asset pipeline.

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-baseline --seconds=8 --repeat=1 --assert-budgets
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-probes --seconds=10 --repeat=2
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory --seconds=8 --repeat=3
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-probes --inventory --probes=static_original_clouds,preview_stop,outlines_stop,mask_copy_cache --seconds=12 --repeat=2
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-recycle --seconds=7 --repeat=2
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory-actions --edit-probe=static_original_clouds --seconds=3 --repeat=4
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory-actions --edit-probe=tree_texture_cache --seconds=3 --repeat=4
```

`research-inventory` records the first opening and subsequent warm openings on a
100-tile stress island, then measures three bursts of 20 tree changes plus undo
and checks terrain/stock/resource retention. A burst deliberately exceeds normal
human input speed. `research-recycle` forces three single-cloud variant changes
per window, alternating runtime/cached/runtime metadata; it isolates transition
cost and does not estimate the natural rate of those events.

`research-inventory-actions` compares individual tree changes plus undo (two
operations in one frame) in before/on/after windows. `tree_texture_cache` retains
at most 16 textures, keyed by exact kind/stump/offset/sorted receiving-ground
cells, without changing clipping pixels. Run the generated
`res://tests/research_tree_shadow_clipping.gd` in a real renderer first; it enables
that probe in the existing grass-edge/elevation/stair clipping regression.
The generated test adapts old ghost-equals-planted assertions to the current
replacement-tree preview and compares those pixels with the uncached clipping
path. Planted-body/shadow assertions remain intact.
This entry-count bound is a diagnostic limit, not a production memory budget.

For confirmation without aggregate GDScript timing wrappers:

```sh
python3 scripts/diagnostics/tiny-swords-performance/prepare-plain-research.py
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/plain-project --editor --import
mkdir -p .cache/tiny-swords-perf/export4
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/plain-project --export-release Web "$PWD/.cache/tiny-swords-perf/export4/index.html"
node scripts/diagnostics/tiny-swords-performance/patch-export.mjs --export-dir=export4
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-plain --plain-cloud-probe --instrument-dir=export4 --seconds=25 --repeat=3
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-plain --plain-cloud-probe --instrument-dir=export4 --inventory --seconds=12 --repeat=2
node scripts/diagnostics/tiny-swords-performance/device.mjs --cloud-research --host=0.0.0.0 --port=8051
```

The plain export samples lightweight engine counters once a second and polls its
cloud switch five times a second. Static mode uses the original pack cloud PNGs
with painted shadows, four world-anchored sprites initially placed at left/right
corners. It stops drift and disconnects/disables mask work, retaining mask nodes
only so same-page animated/static/animated controls can restore the original.
It changes cloud composition/depth and preserves all other visuals and resolution.
The device page offers the same switch and downloads measurements. Enter device
and power conditions; compare at least three 60-second alternating windows while
idle and while editing. Mac phone-layout and CPU slowdown remain synthetic tests,
not measurements of a physical Pixel.

Use `summarize-research.mjs <result.json>...` for matched CPU/control summaries.
Preserve each suite's JSON before running it again. See the [research report](../../../docs/experiments/tiny-swords/performance-2026-10-09/report.md)
for measured outcomes and interpretation.

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
Gate CPU samples disable the JS CPU profiler in both the island and no-island
control; the baseline suite enables it in both. Keep profiler overhead matched
when comparing excess CPU. The earlier gate used a profiled island and an
unprofiled control, so its CPU delta is not a matched comparison.

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
place. The earlier diagnostic `copy_frames` probe is retired: sheet dimensions
are now synchronized in the shared Godot source, including uninstrumented builds.
`shadow_cache` reuses the initial shadow textures without layout/preview invalidation: it is valid only as a static-island diagnostic and is not a shippable cache.
WASM instantiation and GL query wrappers also add measurement overhead.

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=baseline
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=causal
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=inventory
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=remaining
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=soak
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=startup
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
The shared cloud sheet fix is present in every sample. Warmed unchanged samples should have no calls
to `build_inventory_changes`; compare the repeated CPU and inclusive preview
timings in `.cache/tiny-swords-perf/inventory.json` and retain both pairs to show
run-to-run variation. This suite measures the instrumented game wrapper.

`remaining` compares forced terrain/mask redraws, cached rendering, forced masks
alone, asynchronous RAF divisor two, and a cached repeat. The forced modes retain
the rendered choices and visuals. The default game keeps divisor one; the
30-fps mode is not an established CPU saving. `soak` performs 1,000 successful
tree edits/undo operations, flushes queued frees, checks retained terrain/stock,
and rejects more than 10% growth in nodes/resources/objects after warmup. WASM
capacity and error counts are retained in `soak-cycles.json`; capacity is not
equivalent to live memory. This is a short action stress test, not a 30-minute run.

`startup` uses fresh uninstrumented contexts at DPR 1/2/3, including phone-size
touch emulation and a cold 10-Mb/s, 100-ms-latency network probe. It records total
navigation-to-ready time, resource transfer timings and the actual backing canvas.
It exercises explicit Brotli WASM/PCK delivery, including worker decoding on a
host without Content-Encoding headers. Worker asset requests are included in the
startup transfer measurements. Use `--gzip` to force the HTTP gzip fallback,
`--plain` for uncompressed delivery, or `--slow-only` to run only the cold
10-Mb/s probe. The startup server paces encoded response bytes through a shared
10-Mb/s budget with 100-ms response latency, including worker requests (CDP page
throttling does not cover those requests). This remains a Mac/browser/network-emulation
measurement, not startup on a physical phone or production hosting.
The integration builder prepares `.br`/`.gz` variants. The ordinary static server
also negotiates those variants with original MIME types and `Vary: Accept-Encoding`;
restart an already-running server to load the updated serving code. Neither
compression artifacts nor this diagnostic helper configure a public host.

For real suspension intervals, `offscreen-actions` accepts `--hidden-ms=60000`,
`--hidden-ms=1800000` or `--hidden-ms=7200000` for the construction/reservation
check. Keep the browser running for the actual requested interval. Native
`sheep_grazing.gd` separately compares continuous playback with simulated
one-minute, 30-minute and two-hour clock jumps; clock simulation does not replace
actual app/tab suspension or physical-device coverage.

To collect physical-device evidence after preparing the instrumented export:

```sh
node scripts/diagnostics/tiny-swords-performance/device.mjs --host=0.0.0.0 --port=8051
```

Open the computer's LAN address on the device. Without `--host`, this helper
binds only to loopback. It serves only the disposable game export and synthetic
terraced fixture. Record device/OS/browser and power conditions, run the default
cadence and optional divisor two, pan/zoom/edit, scroll fully offscreen, switch
apps, and resume after 1/30/120 minutes. Download its JSON measurements. Inspect
visible frame pacing, startup, engine/WASM memory estimates, errors, retained
island state, and actual OS tab termination; use OS tools for total footprint,
battery/thermal/GPU measurements. Repeat with real video playback in the normal
integration and supported physical iPhone/iPad and low-memory Android hardware.
Those last checks cannot be certified by the Mac's viewport emulation. Stop the
server when finished; it does not expose learner data or deployment controls.

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

## Inventory opening investigation — 2026-10-06

Before implementation, the reproducible stall occurred on the first inventory
opening after loading the game. `inventory_outline.gd::texture_for` reads sprite images, scans their pixels,
and uploads newly generated silhouette borders inside terrain drawing. The cache
grew from zero to 25 entries during that opening. Warm openings and pointer
movement did not consistently reproduce sustained page lag.

Matched eight-second runs in fresh installed Chrome contexts measured both the
parent page's animation frames and a 16-ms timer. The tested local island had 26
tiles, three trees, a house, a chicken and a sheep. Only its game snapshot was
used in isolated synthetic profiles; learner history was excluded. The existing
user game was suspended during automated comparisons.

| Cold opening condition | Parent RAF p99 | Longest parent timer interval | Maximum terrain draw | Renderer CPU, one core |
| --- | ---: | ---: | ---: | ---: |
| Runtime outlines | 116.3 ms | 309.4 ms | 155.5 ms | 35.4% |
| Precomputed outlines | 18.7 ms | 43.9 ms | 1.0 ms | 27.3% |
| Runtime outlines, repeat | 100.1 ms | 274.6 ms | 130.1 ms | 34.5% |
| Clouds hidden and paused | 100.0 ms | 279.9 ms | 131.9 ms | 28.9% |
| Precomputed outlines, repeat | 18.7 ms | 49.7 ms | 1.3 ms | 27.6% |

Hiding clouds did not remove the stall. Earlier warm comparisons did not show a
repeatable CPU improvement from hiding them either. The canonical cloud-removal
change was reverted and the normal integrated preview rebuilt. Clouds remain
visible during inventory editing.

The successful prototype generates 35 unique border PNGs before browser playback
using the original outline function (32 tree poses and three house textures).
Decoded PNG pixels are checked byte-for-byte against the original borders.
The diagnostic export preloads these textures and uses the same existing drawing
positions, colors and mirroring. Runtime and prototype conditions use the same
export with one flag changed, so added resources and profiler overhead are matched.
This table records the diagnostic prototype phase. The implementation below
now replaces runtime generation in the ordinary game.

**Recommended fix:** make outline generation part of Godot asset preparation and
bundle the borders or an atlas. Keep regeneration tied to source artwork, outline
width and alpha rules; verify every tree pose, house facing and inventory preview.
This keeps the current visuals while removing first-use pixel scans and readback
from gameplay. Spreading generation over several frames is a fallback, but retains
the work and needs an explicit visual policy while borders are unavailable.

Do not hide clouds to address this particular stall. Treat backing resolution,
mask cadence and scene rebuilds as separate measured hypotheses if sustained lag
remains after outline generation is removed. Old WebGL warnings and the machine's
heavy memory pressure were observed, but their causes were not established here.

Aggregate evidence and exact diagnostic source/export hashes are saved in
`docs/experiments/tiny-swords/performance-2026-10-06/inventory-measurements.json`.
These are instrumented Mac measurements, not physical-device or production
acceptance. The Mac had 8 GiB RAM and about 10.8 GiB swap in use; the investigation
does not establish what caused that memory pressure. GPU-process CPU is not GPU
utilization. Initial exploratory samples with an overly broad timing window were
discarded; the table uses bounded in-page captures with reliable CPU windows.

### Reproduce the cold-opening gate

The original prototype has been replaced by canonical Godot assets and an offline
baker. Prepare a disposable copy with the old generation algorithm available as
an explicit counterfactual (normal exports exclude the offline tools):

```sh
python3 scripts/diagnostics/tiny-swords-performance/prepare.py --runtime-outlines
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --editor --import
mkdir -p .cache/tiny-swords-perf/export3
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-perf/project --export-release Web "$PWD/.cache/tiny-swords-perf/export3/index.html"
node scripts/diagnostics/tiny-swords-performance/patch-export.mjs

node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=inventory-lag --cold-only --chrome --profile --assert-budgets --cold-probe=runtime_outlines --tag=runtime-control
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=inventory-lag --cold-only --chrome --profile --assert-budgets --tag=fixed
```

Both runs use the same export; the control flag restores the exact original
scanning algorithm. Generate the synthetic terraced fixture using the earlier
fixture command if it is not already present.

Default input is the generated synthetic terraced fixture (`--side=99`). Optional
`--island=PATH` accepts a game-only island JSON, never a full learner export. Keep
personal fixtures ignored and local. Optional `--site=PATH` serves a stable copy
of `_site` when another task is rebuilding the ordinary preview. The recorded
comparison used `--side=97 --island=.cache/tiny-swords-perf/user-island.json
--site=.cache/tiny-swords-perf/inventory-site` in each command.

The gate fails on parent RAF p99 above 50 ms, parent timer maximum above 100 ms,
or parent timer p95 above 50 ms. Both baseline runs and the cloud-removal control
returned exit 1 (`INVENTORY_LAG REPRODUCED`); both prototype runs returned exit 0
(`INVENTORY_LAG NOT_REPRODUCED`). These are diagnostic thresholds for this symptom,
not guarantees for every device. Without `--cold-only`, the suite also compares
warm pointer movement, clouds, previews, outlines, masks and pixel ratio.

### Canonical implementation

`godot/tiny-swords/scripts/inventory_outline.gd` now performs an imported-texture
lookup. `tools/inventory_outline_baker.gd` preserves the original scanning rules,
and `tools/generate_inventory_outlines.gd` writes the 35 PNGs, import settings and
lookup with source fingerprints. Import alpha-border correction is disabled to
preserve even transparent RGB pixels. Offline tools are excluded from ordinary
Web exports.

`tests/inventory_outline_assets.gd` exercised the runtime call before and after
the change: 35 failures with runtime generation, then zero failures with imported
assets. It checks every pose/unique facing against the original pixel data and
rejects changed source fingerprints. The integration builder runs this check
before exporting. Existing inventory-change checks and rendered mirrored-house
checks also pass. The integrated preview was rebuilt from canonical source.

Implementation browser measurements are stored separately in
`docs/experiments/tiny-swords/performance-2026-10-06/implementation-measurements.json`.
The original prototype results remain historical evidence in
`inventory-measurements.json`.

| Implemented comparison (two runs each) | Parent RAF p99 | Longest parent timer interval | Maximum terrain draw |
| --- | ---: | ---: | ---: |
| Original runtime generation control | 116.4–116.7 ms | 332.1–386.1 ms | 169.4–198.7 ms |
| Canonical imported-border lookup | 17.7 ms | 41.3–48.7 ms | 1.1–1.3 ms |

Both controls failed the cold-opening gate; both fixed runs passed. Each observed
inventory open, had zero console errors and a reliable CPU window. The rebuilt
ordinary export was loaded in the existing Chrome tab and inventory opened:
imported borders and clouds were visible, with the saved island retained.
