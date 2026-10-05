# Production terrain-shadow cache — 2026-10-05

This implements the shadow-cache recommendation in [the performance investigation](report.md). It is a local implementation/build result, not public performance sign-off. Offscreen suspension, checkpoint storage, editor eligibility and cloud animation remain separate work.

## Change

`godot/tiny-swords/scripts/terrain_view.gd` retains source shadow/atlas images, one receiving mask and the current clipped textures/positions per view. Ordinary redraws issue the same drawing commands without rebuilding masks or textures. Empty results are cached too.

The cache compares cells, elevations, stair directions and casting height by value. A changed geometry replaces its results; it does not retain historical previews. Existing `rebuild_decorations` paths replace views on terrain edits, preview changes, undo and restore. Value comparison also covers in-place geometry changes and `_draw` substituting newly allocated proposed layouts after `update_inventory_preview_state` clears `proposed_terrain`. Source atlas images are bounded by the existing finite floor palette set and released with their view. No layout rules, bridge behavior, alpha clipping or draw/depth order changed.

## Focused validation

Godot 4.7.2 on the investigation's M3 Mac, using the native Compatibility renderer:

- `terrain_transform_preview.gd`: PASS, extended to compare retained shadow pixels through preview, repeated hover/redraw, commit, undo and saved-layout restore. Repeated hover retains texture instance IDs; commit matches preview pixels; undo and restore reproduce their earlier pixels.
- `terrain_shadow_water.gd`: PASS, zero changed water pixels, 92 shaded cliff-grass pixels and 170 shaded stair-grass pixels.
- `cliff_mixed_corner.gd`: PASS, zero mismatched pixels.
- `stair_cliff_stack.gd`: PASS.
- `terrain_shadow_edge.gd`: FAIL, 266/266 expected samples missing. A disposable copy with the pre-cache shadow-generation algorithm fails identically. Its rendered PNG and the production cache's PNG have identical SHA-256 `04e08d55190ff1b42bf51e6ca5f27d533ffb1de83e018ec7bd6b14e0ccf8a0e6`.
- `cliff_terrace_roots.gd`: FAIL, 2397/2409 mismatches and zero shaded seam pixels. The same pre-cache copy fails with the same counts. Existing terrain work/test expectations were preserved rather than expanded into this cache task.

The two older pixel checks therefore remain unresolved baseline limitations. The passing water/mixed-corner checks and identical edge render provide focused evidence that caching preserves the existing authored-alpha behavior, not proof that every historical terrain fixture is correct.

Godot import and the instrumented release export passed without parser errors. `node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords` completed successfully and rebuilt the integrated preview at `http://localhost:8037/`, with no parser/export errors in the build log.

## Measurements

[Recorded production measurements](shadow-cache-measurements.json) summarize the existing shadows diagnostic with **`shadow_cache: false` throughout**. Each fixture used production cache / removed-shadow control / production repeat, with fresh synthetic browser contexts, six-second startup warming, 10-second samples, DPR 2 and an instrumented release export. Other diagnostic work-removal flags stayed off. CPU is the sum of renderer process CPU-time deltas, as a percentage of one logical core.

| Fixture | Prior investigation baseline | Production cache | Removed-shadow control | Production repeat |
|---|---|---|---|---|
| Valid 66-tile terrace, three stairs | 95.7–95.9% CPU, about 14 fps | 28.6%, engine samples 57/60 fps | 28.1%, 59/60/61 fps | 26.9%, 60 fps |
| Ordinary seven-tile island, one stair | 54.2–56.5% CPU, about 60 fps | 22.5%, 58/60 fps | 23.6%, 58/60 fps | 21.0%, 60 fps |

Inclusive `draw_shadows` timing averaged 0.68–1.01 ms per second in the production samples, versus about 879 ms/s in the earlier terraced baseline. No receiving-mask generation calls occurred during warmed production samples. Remaining shadow drawing/geometry comparisons are small relative to the original hotspot; the control difference is within run variability. Baselines are from the completed investigation, not a freshly rerun uncached web export. These measurements establish improvement on this machine, not identical numbers on other devices.

The browser run still emitted the investigation's known cloud-copy frame-bound errors and blocked/missing-resource messages. That separate issue was left unchanged. No exhaustive rollout matrix, deployment, public enablement, or live learner trial was performed. Existing working-tree changes and learner data were preserved.

Raw production JSON, CPU profiles, source fingerprint, baseline comparison source and relevant logs remain in ignored `.cache/tiny-swords-perf`. Generated diagnostic projects, exports and the temporary runner were removed after measurement. Instrumentation was not copied into the integrated preview.
