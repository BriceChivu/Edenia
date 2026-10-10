# Production tree-texture reuse — 2026-10-10

Implemented the improvement selected after the [performance investigation](../performance-2026-10-09/report.md): reuse clipped tree textures during inventory edits. Resolution, animation, cloud rendering and the original pixel-clipping algorithm are unchanged. This is local implementation and preview evidence; it has not been merged or deployed.

## Implementation

`TreeArt.texture_at` retains the generated texture by exact tree variant, stump flag, offset and sorted relative receiving-ground cells. Equivalent receiving sets share textures regardless of insertion order; terrain/elevation changes select the corresponding new clipping, and undo can retrieve the previous texture. Hits preserve the texture-owned opacity bitmap used for picking as well as avoiding another pixel sweep and GPU texture upload.

The LRU retains at most 16 entries and 16 MiB of generated RGBA texels. Imported textures already shared by Godot count as zero additional texels. This limit is not a measurement of total GPU/process memory: renderer overhead, opacity bitmaps, existing source images and live scene references are outside it. Exact offsets are retained without quantization. Source texture `changed` signals invalidate cached source images, shadow lists and derived textures.

## Actual integrated UI measurements

M3 MacBook Air, 8 GiB, macOS 26.7; Godot 4.7.2; Playwright Chromium with ANGLE Metal. Serial runs, CPU throttle 1, fresh disposable browser profiles, no external requests. A synthetic 100-tile island contains nine trees. The **ordinary canonical game export** is used, without the diagnostic Perf autoload or cache flags.

The test opens inventory, clicks the original pine at (2,2), waits for the changed variant to be saved, clicks the real Undo button, and verifies the exact durable terrain, tree offsets/types, stock and resources are restored. Each condition has one 3-second opening window and five 3-second edit/undo windows. The first pair is reported separately; the remaining four are warmed samples. Twenty actual UI edit/undo pairs across the four runs passed; all 24 windows have zero recorded console errors.

Metric: maximum delay between the parent's 16 ms timers in each window. This measures event-loop stalls associated with edits; it is not a direct GPU frame-time measurement. Parent rAF p99 remained approximately 17.7–17.8 ms in both builds, so p99 alone hides these isolated hitches.

| Layout | Canvas pixels, before and after | Warm median maximum pause before | After | Reduction |
| --- | --- | ---: | ---: | ---: |
| Desktop, DPR 2 | 2108 × 908 | 70.1 ms | 36.2 ms | 48% |
| Phone layout on Mac, DPR 3 | 1041 × 672 | 58.2 ms | 35.3 ms | 39% |

Desktop warm ranges were 65.9–74.8 ms before and 27.4–41.0 ms after. Phone-layout warm ranges were 57.3–61.4 ms before and 32.1–38.8 ms after.

First edit/undo: desktop 105.5 → 93.9 ms; phone layout 107.9 → 90.8 ms. Inventory opening: desktop 72.6 → 87.1 ms, phone layout 69.5 → 61.0 ms. These single cold observations do not establish an opening-speed improvement. The cache mainly helps repeated texture inputs; new placements/variants can still miss. Warm edits also remain above a 16.7 ms frame budget in some windows. This change reduces a verified source of inventory pauses; it does not establish that all dropped frames are fixed, nor an idle CPU reduction.

No physical Pixel 7a was available. Phone dimensions/DPR on the Mac do not prove phone performance, thermals, or battery behavior.

Raw data: [desktop before](ui-before-desktop.json), [desktop after](ui-after-desktop.json), [phone layout before](ui-before-phone-layout.json), [phone layout after](ui-after-phone-layout.json). Rendered inventory: [desktop](inventory-cache.png), [phone layout](inventory-phone-cache.png).

## Regression and render checks

Before implementing the cache, the new real-game `tree_texture_reuse.gd` failed on unchanged inventory rebuild and undo/re-placement generating different clipped texture resources. It now passes.

- Exact original-versus-cached pixels: 72 combinations of all four variants/stumps, offsets and receiving-ground shapes.
- Receiving-cell order equivalence, terrain-change clipping, exact fractional offsets, byte/entry eviction bounds, recently used texture survival, and artwork-change invalidation passed.
- Native shadow clipping: 15 placements at three elevations, all eight animation frames passed. The old test fixture was corrected to preview a **new placement** of the same variant; hovering an occupied tree intentionally previews its next replacement variant. Runtime preview behavior was preserved.
- Native tree swap/picking, cut reaction rendering, harvesting and inventory pause checks passed.
- The integration build passed export contract, 35 inventory outline assets, native gameplay/camera/input checks, animal checkpoint saves and progression checks.
- The older `tree_cursor_placement.gd` fails its placement fixture and then indexes an empty tree list. The exact same failures were reproduced with the original `tree_art.gd` in an isolated baseline copy. It is a pre-existing test failure, not introduced or repaired by this cache change.

## Reproduction and identities

```sh
/Applications/Godot.app/Contents/MacOS/Godot --path godot/tiny-swords --script res://tests/tree_texture_reuse.gd
/Applications/Godot.app/Contents/MacOS/Godot --path godot/tiny-swords --script res://tests/tree_shadow_clipping.gd
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory-ui --site=PATH_TO_BEFORE_SITE --seconds=3 --repeat=5
node scripts/diagnostics/tiny-swords-performance/run.mjs --suite=research-inventory-ui --seconds=3 --repeat=5
# Repeat the two browser commands with --mobile for native DPR 3 phone layout.
```

The before site was cloned from the untouched normal integration before rebuilding. Source before: research commit `e2c1735e`, gameplay tree-art identical to `de914ac9`. Before tree-art SHA-256: `df1991b4f71787252e3db6448dd6687bb09ef34ce6092cdb96f56fa4f72d241e`. After tree-art SHA-256: `8701da5fa1f4671d56fb81cac7300fe3164d6263bee44455b9034df49b26ebf3`.

Measured before game release: `5aa34385bee48d7345472399fd815c151ad0b485b4e11b0106798aa349ab1d88`. Measured after game release: `7eaad78141ca294ccfcc04dd96d1427f32889ea3546b304edf52b9a784d780da`.

The diagnostic preparer now delegates its enabled tree probe to the canonical cache and uses the unchanged clipping routine for explicit false. It does not add a second prototype cache around production. Historical research data remains in the October 9 folder.
