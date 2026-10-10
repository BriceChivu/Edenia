# Tiny Swords performance investigation — 2026-10-09

## Scope

The user reports dropped frames on a Mac and Pixel 7a. Preserve native resolution; resolution reduction is a last resort. Compare static **original** Tiny Swords cloud PNGs positioned at the left/right background, without drift, separated/recomposed layers, shadow shaders or depth masks. Include inventory first/warm opening, pointer motion and edit/undo activity. This investigation uses synthetic learner profiles and islands; no existing learner data is read or changed. Production is not changed.

Source baseline: `de914ac95d86dad0760f23b32b3c3840138ef4d6` on current `origin/master` at investigation start, isolated in `codex/tiny-swords-performance-research`. Game source remains unchanged. Controlled work-removal probes exist only in generated Godot copies. These are attribution experiments, not validated changes to game rules.

## Environment and interpretation

Apple M3 MacBook Air (`Mac15,13`), 8 GiB RAM, macOS 26.7; Godot 4.7.2 official (`ed1daf0bf`); Node 24.10.0 and Playwright 1.62.0. Chromium uses ANGLE/Metal on Apple M3, not a software GPU. The Mac is on battery (71% at initial capture), with about 5.4 GiB swap in use and other ordinary applications running. Before/after controls are therefore essential. Run only one browser benchmark suite at a time; no builds run during measured windows.

All game canvases keep native DPR: desktop DPR 2 at 2108×908 and responsive phone-layout DPR 3 at 1041×672 in the initial integrated samples. Phone layout is **Mac hardware emulation**, not Pixel performance. CPU slowdown is Chrome's synthetic scheduling stress, not a calibrated Pixel 7a model. CPU is dedicated browser renderer-process CPU as a percentage of one logical core, including the synthetic parent. GPU-process CPU is not GPU hardware utilization.

Parent requestAnimationFrame p95/p99 and a 16-ms timer measure stalls shared with the game. Instrumented probes additionally capture actual Godot FPS/process-frame intervals, inclusive GDScript timers, draw-call/resource counters and errors. Parent RAF alone does not prove the game draws every frame; distinguish it from engine telemetry. Inclusive parent/child timers must not be added.

No JS CPU profiler or per-WebGL-call timing wrappers run in the research suites. Earlier generic instrumentation silently imposed DPR 2; the research preparer explicitly restores the actual default `max_pixel_ratio=0.0`. A later plain-export crossover removes aggregate GDScript timing instrumentation as a confirmation of the cloud comparison.

## Feedback loop

The diagnostic pacing budget is parent RAF p99 ≤25 ms and maximum parent timer interval ≤100 ms after warmup. This is a practical 60-Hz stutter gate, not a universal product/device guarantee.

```sh
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-baseline --seconds=10 --repeat=1 --cpu=8 --sides=99 --layouts=desktop --assert-budgets
```

Already run: **exit 1**, `FRAME_PACING FAIL: 2/2 samples exceeded p99 25ms or timer maximum 100ms`. Idle p95/p99 were **49.5/50.8 ms**; inventory p99 was **33.4 ms**. Both retained the same native 2108×908 backing canvas. This reproduces missed frames under constrained scheduling, not the cause of the user's real devices.

Unthrottled current-source baseline: all **8/8** desktop/phone-layout idle/inventory samples passed, p99 about 17.6–17.7 ms, renderer CPU roughly 18–22% of one core and zero console errors. The 4× stress run passed seven samples and had one 166-ms timer interval. Its p99 frame cadence stayed mostly smooth; 8× is the sharper stress case. Early setup attempts with missing platform dependencies and an incorrect inventory-close click were excluded; the retained baseline uses verified open/closed state and Escape to close.

## Hypotheses tested

1. If cloud depth maintenance/rendering is costly, disabling the masks should reduce CPU and draw calls; the user's no-mask static design should retain that gain with visible clouds.
2. If redundant per-frame logic is significant, isolating tree uniform submission, terrain ordering, stationary pawn checks, animals and bridge work should produce repeatable matched savings.
3. If recycling contributes occasional stalls, a fixed cloud-recycle command should expose long frames, and precomputed metadata should remove them while preserving geometry.
4. If inventory has another bottleneck, cold/warm opening, sustained pointer previews and edit/undo should reveal it even when clouds are absent.

## Results

The retained evidence covers **174 measured browser windows**, serially run,
plus real-renderer cloud-depth, 48-case cloud-geometry, tree-clipping and 72-case
tree-texture parity checks. Retained measured windows contain zero game console
errors. Failed preparation/parse-error attempts are excluded. Raw JSON preserves
before/on/after controls and run variation rather than just the best sample.

### Original stationary background clouds

The diagnostic draws four **original pack PNGs**, including their painted
shadows, behind the island and above the ocean. Variants 1/3/6/8 sit initially at
the left/right corners. These sprites are world anchored: camera pan/zoom moves
them with the background. All other animation and native pixel density remain.
Animated-cloud processing is stopped, mask callbacks disconnected and mask
viewports disabled. Simply stopping drift would leave those mask callbacks alive.

The strongest confirmation uses a plain export without aggregate GDScript timing
wrappers, three animated/static/animated comparisons, **25 seconds per window**:

| Comparison | Animated controls, renderer CPU | Static CPU | Relative reduction | Static draw calls | Engine FPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 22.73% | 18.47% | 18.7% | 36 | 60 |
| 2 | 21.53% | 15.70% | 27.1% | 36 | 60 |
| 3 | 21.04% | 14.91% | 29.1% | 36 | 60 |

Animated controls used roughly 98–100 draws/frame: static mode removes about
**63% of draw calls**. This is a count of draw submissions, not a GPU-time estimate.
Parent p99 stayed about 17.7 ms in both modes; the unthrottled baseline was already
smooth. Thus the measured result is more CPU headroom, not proof that the user's
reported dropped frames are fixed. See `clouds-plain-long.json` and
`cloud-summary.json`.

Short plain-export runs varied: one comparison saved about 1%, another 20%.
Longer repeated windows provide stronger evidence. Two native-DPR-3 phone-layout
comparisons saved about 24–35%, but still used the M3, not a Pixel. An 8× CPU-stress
plain-export comparison was smooth in **all** modes, despite the earlier baseline
stress failure. This scheduling stress is not a stable physical-device regression
test, and cannot establish a before-failing/after-passing cloud fix.

### Other work-removal controls

Two instrumented before/on/after comparisons per probe retained native resolution
and actual 60-FPS engine cadence. These percentages are exploratory, with timing
wrapper overhead and ordinary machine variability:

| Probe | Relative CPU reduction, two repetitions | Interpretation |
| --- | ---: | --- |
| Stop cloud mask maintenance | 25.6%, 15.3% | Useful attribution; stale masks are visually wrong when actors move |
| Stop cloud drift only | 3.6%, 5.0% | Most cloud cost remains when masks keep running |
| Avoid unchanged tree uniform submissions | −1.0%, 5.4% | No consistent meaningful win established |
| Stop terrain depth ordering | 6.9%, 1.4% | Smaller opportunity; blunt removal breaks depth behavior |
| Skip stationary pawn collision checks | −9.0%, 0.3% | No win established; animal separation makes this unsafe |
| Stop tree animation processing | 4.8%, 16.7% | Inconsistent, with a visible downgrade |
| Stop animal processing | 0.7%, 2.3% | Small; keep gameplay behavior |
| Stop bridge processing | −5.2%, −3.8% | No win established |

Static original-cloud instrumented probes saved 15.9% and 12.0%; use the longer
plain-export results above as the confirmation. Full data: `probes-native.json`
and `probe-summary.json`. Inclusive baseline timers recorded approximately
39 ms/second in cloud-mask updates (420 calls/second), 16 ms/second rebuilding
copied terrain draw commands, and 12 ms/second reading visual snapshots. These
timers overlap and must not be summed.

### Preserve cloud visuals: retain unchanged copied terrain

A diagnostic reuse token avoids synchronizing/redrawing an unchanged copied
subtree when a different actor invalidates a mask. Three comparisons saved
11.1%, −1.2%, and 9.0% renderer CPU. Masks still rendered around 96–98 draws/frame,
and recursive input detection remained. The real rendered cloud-depth regression
passed with the cache enabled. This is a smaller, variable opportunity; explicit
source-owned revisions and better candidate/mask coverage are stronger next
designs than piling more recursive snapshots onto the current path.

The cache's current token covers supported sprites, polygons, transforms, tree
bend and terrain drawing revisions, but not arbitrary in-place resource mutation
or child-topology synchronization. See the primary-source audit before production
implementation. Data: `mask-copy-cache-native.json` and summary. The existing
follow-up mask draw remains required because canvas redraws are deferred.

### Preserve cloud visuals: precompute geometry metadata

The runtime reads texture images to compute painted-cloud centroids, shadow
offsets and used widths when selecting/recycling variants. The prototype bakes
the same values offline and uses lookups. It passed **exact geometry equality in
48 cases**: eight variants, three altitudes and both mirror states, including
ground anchor, body scale and shadow placement. This preserves authored pixels
and animation; it addresses occasional transitions rather than per-frame masks.

Two runtime/cached/runtime comparisons forced three single-cloud variant changes
per seven-second window. Cached maximum parent timer intervals were about
21.4/21.6 ms versus 28–38 ms in the runtime controls. Engine frame maxima were
19.2–19.5 ms cached and 19.2–23.3 ms runtime; all modes stayed near 60 FPS.
The short test supports removing readback and pixel scans, but does not establish
a large average CPU win or quantify natural recycling frequency on a Pixel.
Full data: `cloud-recycle.json`. Before shipping, make metadata regeneration and
fingerprints part of the Godot asset pipeline so artwork edits cannot leave stale
geometry.

### Inventory

Current `refresh()` hides the normal cloud group and the rare visitor in editing
mode. Static background sprites remain visible in the proposed composition.
Consequently, an inventory CPU improvement cannot be attributed to removal of
the same visible mask passes as idle mode. Short plain-export pointer-motion
comparisons saved about 11–13%, but require the separate inventory controls below.

Two instrumented moving-pointer inventory comparisons did **not** establish
sustained savings: static original-cloud CPU changes were +8.3% and −14.7%
relative reductions. Static mode added roughly four background draws (about
59 versus 55), because ordinary inventory already hides clouds. Removing preview
calculations, outlines or mask-copy synchronization also produced no consistent
CPU benefit. All these windows remained near 60 FPS, without errors. Keep the
inventory UI/animations: these data do not support degrading them to fix idle
cloud cost. See `inventory-probes.json` and `inventory-probe-summary.json`.

On the 100-tile stress island, first opening and two warm openings produced parent
p99 of 18.6 ms; maximum timer intervals were 62.2/21.8/44.0 ms, with zero errors.
The first eligibility build took about 10.7 ms and ran once; warm openings reused
it. The earlier runtime-outline stall was not reproduced: outlines are already
precomputed in current source.

Three artificial bursts of 20 tree changes plus 20 undo operations produced
maximum timer intervals of 1082/1052/1045 ms. Engine frame maxima corroborated
the stalls (1071/1041/1033 ms), although aggregate p99 remained 18.6 ms. This is
why p99 alone is insufficient for isolated edit stalls. Each burst performed
40 decoration rebuilds, taking 952–979 ms in total, while snapshots took only
about 6 ms. Terrain, stock and resources were retained after all 120 operations.
This deliberately exceeds normal input speed; individual edit comparisons are
recorded separately before drawing conclusions about normal gameplay.

**Individual edit/undo pairs confirm a preserving-visuals opportunity.** On the
same stress island, each window performs one valid tree-variant edit and one undo
in the same frame. The original path calls `TreeArt.texture_at` 18 times, repeating
clipping work even for the unchanged trees. It consumed roughly 56–85 ms of the
59–87 ms spent rebuilding decorations. This directly attributes most of the
measured edit cost to tree texture generation in this fixture.

An exact-input cache retains at most 16 textures, keyed by variant, stump status,
exact offset and sorted receiving-ground cells. It reuses the existing algorithm
and displayed texture/picking behavior; all original animations remain.

| Edit + undo comparison | Original parent timer maxima | Cached maximum | Original engine frame maxima | Cached engine maximum |
| --- | ---: | ---: | ---: | ---: |
| First cache fill | 111.0 / 84.8 ms | 54.1 ms | 97.5 / 79.3 ms | 40.7 ms |
| Warm 1 | 87.7 / 84.9 ms | 25.9 ms | 78.7 / 77.7 ms | 18.8 ms |
| Warm 2 | 87.1 / 92.4 ms | 27.4 ms | 75.9 / 78.5 ms | 19.6 ms |
| Warm 3 | 88.5 / 86.7 ms | 22.2 ms | 82.7 / 70.0 ms | 18.9 ms |

Warm cached rebuilds took **2.5–3.3 ms total**, with texture lookups accounting for
0.1–0.3 ms. This is a repeatable improvement in frame tails, stronger evidence
than a small average CPU change. These are **two actions in one frame**, not an
estimate for every single placement or island. Static clouds alone left edit
stalls roughly 87–92 ms and did not consistently improve them.

Real-renderer validation passed the clipping regression (15 placements × all
eight frames, plus shared grass/water/stair/elevation boundaries) and **exact
texture-byte parity/reuse/bound checks in 72 cases** spanning all four tree
variants, stumps, offsets and ground neighborhoods. The generated clipping test
adapts an older ghost-equals-planted assumption to today's replacement-tree
preview, checking its pixels against the uncached replacement path. The original
planted body/shadow checks remain intact. Setup/parse-error runs were excluded.

This is a diagnostic prototype, not yet a production cache. Production needs a
byte budget and eviction policy appropriate to free-position previews, artwork
revision invalidation, real-pointer picking and physical-device acceptance.
Retaining unchanged terrain/actors is a separate, unmeasured way to remove the
remaining reconstruction. Data: `inventory-single-tree-cache.json`,
`inventory-single-static.json`, and `inventory-single-summary.json`.

## Recommended next steps

1. Implement bounded exact tree-texture reuse in the owning Godot module first:
   it has a clear inventory frame-tail benefit without visual degradation.
2. Use the original static background clouds as the first visual tradeoff if
   desired: the repeated native-resolution idle comparison shows meaningful CPU
   headroom. Validate camera extremes and phone layout before making it default.
3. Bake animated-cloud metadata to avoid runtime readbacks/scans. Pursue explicit
   visual revisions and conservative mask culling for a larger preserving-cloud
   architecture change; the simple copy cache showed only a variable smaller gain.
4. Measure a physical Pixel with alternating native-resolution idle/editing runs
   and real video playback. The prepared cloud-switch device page collects engine
   counters/errors and exports JSON. Pixel/thermal/GPU results are not yet available.

No measured result requires reducing canvas resolution, disabling all trees or
animals, or removing inventory previews/outlines. Those removal controls did not
establish a consistent useful saving in the tested current scene.

## Primary-source research

See [primary-source-research.md](primary-source-research.md) for pinned Godot implementation references and remaining options: explicit revisions, cropped/equivalent masks, offline cloud metadata, material batching, physics/event scheduling and engine presentation/threading. The source audit distinguishes already-shipped terrain/outline/cache fixes from current opportunities.

## Reproduction and artifacts

The native integration was rebuilt successfully with:

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
```

The local npm configuration selected Linux optional binaries on macOS; a task-local `npm ci --os=darwin --cpu=arm64` corrected the dependencies without changing package manifests/lockfiles or the shared checkout. Preparation, import, export and suite commands are documented in the diagnostic README. Generated projects/exports/raw CPU profiles are ignored under `.cache/tiny-swords-perf`. Committed aggregate JSON is synthetic, with no learner history or credentials.

## Limits

Physical Pixel 7a/iOS, OS thermal/battery/GPU counters, existing user-island composition and real hosted video playback remain distinct acceptance checks. A smooth or improved M3 sample cannot certify them. Static background composition loses drifting/depth-aware clouds and the rare foreground visitor; it keeps original artwork, native resolution and all non-cloud animation. Mask viewports/copies are disabled/disconnected but retained during same-page crossover so the original mode can be restored; memory measurements therefore do not estimate the smaller production scene achievable by omitting those nodes entirely.
