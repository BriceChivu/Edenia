# Tiny Swords tree-cut animation: reference audit and reproduction plan

Inspected **2026-10-03** against the working checkout before the scale adjustment below. The animation audit itself changed no gameplay. The requested result is the website's repeated axe/tree reaction **followed by Edenia's existing disappearance, dust and matching stump**, which the user explicitly wants to retain.

## Findings

The missing visual is the **tree's reaction to each axe strike**. The local pack already supplies the exact pawn poses and the four trees, but its eight-frame tree atlases contain ambient movement only. The website adds an impact bend and an opposite rebound. Godot currently plays the ambient frames at half the reference rate and has no impact deformation.

The reference demonstrator is **Tree3.png**, named **`tree2` in Godot**. The website displays the other three trees moving ambiently, but nobody chops them in this GIF. Matching the visible Tree3 strike can be measured directly; applying that same motion to the other shapes is an adaptation whose exactness cannot be verified against unseen reference animations.

## Primary reference and inspection method

- [Pixel Frog's Tiny Swords page](https://pixelfrog-assets.itch.io/tiny-swords), specifically its “Pawn and Resources” image, matches the supplied screenshot.
- The page embeds [Pawn and Resources_03.gif](https://raw.githubusercontent.com/Adriano-97/pixelImages/refs/heads/main/Pawn%20and%20Resources_03.gif).
- Decoded GIF: **1600×896**, **24 frames**, **100 ms each**, **2.4 seconds per loop**. SHA-256: `3e4ae658b1a7487d45fbbbe861bd8d2b1c0d1b0e01183eb0a8c095752d762458`.
- All 24 decoded frames were inspected in a contact sheet. Exact RGB template comparison identifies the pawn atlas poses and the tree's ambient-frame sequence. Additional row comparisons and preliminary rotation fits measure the deformation; they do not establish the author's original transform formula.
- The website documents animation speed as **10 fps / 100 ms**; local Aseprite frame durations independently agree.
- Local reference, measurements, scripts and six actual Godot captures are retained in the ignored [artifacts/tree-cut-audit](../../../artifacts/tree-cut-audit/) folder. The Godot captures use a fresh F6 scene with the real tree and pawn renderers, deterministically frozen at each of the six axe poses; they do not alter a saved island.

![All 24 website frames, cropped to the chopping demonstration](../../../artifacts/tree-cut-audit/tree-sheet.png)

## Frame-by-frame sequence

All indexes below are **zero-based**. The GIF begins partway through a swing. Pawn opaque pixels match the existing `Pawn_Interact Axe.png` exactly at native size, with atlas origin **(790,183)** in the GIF. Undeformed Tree3 atlas pixels align at **(835,147)**. The corresponding canvas centers differ by **45 horizontal pixels**; Godot's default approach is **44 scene pixels**, so spacing is already close.

| GIF frame | Time (ms) | Pawn atlas pose | Tree3 ambient frame | Tree response |
| --- | ---: | ---: | ---: | --- |
| 0 | 0 | 4 | 6 | Ordinary ambient pose; pawn follow-through |
| 1 | 100 | 5 | 7 | Ordinary ambient pose; pawn recovery |
| 2 | 200 | 0 | 0 | Ordinary ambient pose; start next swing |
| 3 | 300 | 1 | 1 | Ordinary ambient pose; wind-up |
| 4 | 400 | 2 | 2 | Impact: crown bends away from the pawn |
| 5 | 500 | 3 | 3 | Opposite rebound |
| 6 | 600 | 4 | 4 | Ordinary ambient pose |
| 7 | 700 | 5 | 5 | Ordinary ambient pose |
| 8 | 800 | 0 | 6 | Ordinary ambient pose |
| 9 | 900 | 1 | 7 | Ordinary ambient pose |
| 10 | 1000 | 2 | 0 | Impact, stronger than frame 4 |
| 11 | 1100 | 3 | 1 | Opposite rebound |
| 12 | 1200 | 4 | 2 | Ordinary ambient pose |
| 13 | 1300 | 5 | 3 | Ordinary ambient pose |
| 14 | 1400 | 0 | 4 | Ordinary ambient pose |
| 15 | 1500 | 1 | 5 | Ordinary ambient pose |
| 16 | 1600 | 2 | 6 | Impact, smaller than frame 10 |
| 17 | 1700 | 3 | 7 | Opposite rebound |
| 18 | 1800 | 4 | 0 | Ordinary ambient pose |
| 19 | 1900 | 5 | 1 | Ordinary ambient pose |
| 20 | 2000 | 0 | 2 | Ordinary ambient pose |
| 21 | 2100 | 1 | 3 | Ordinary ambient pose |
| 22 | 2200 | 2 | 4 | Impact, strongest visible strike |
| 23 | 2300 | 3 | 5 | Opposite rebound, then GIF loops |

The six-pose swing takes **600 ms**. The eight-pose ambient tree cycle takes **800 ms**. Their phases realign every **2.4 seconds**. Repeating only one six-frame tree reaction would lose the reference's relationship between ambient frames and four successive hits.

The reaction starts on **pawn pose 2 (the third pose)**, with the white axe swipe already included in that pawn sprite; rebound is **pose 3 (the fourth pose)**. The current harvesting code calls the fourth pose its contact pose, which should not be used as the reaction timing when matching the website. There is currently no tree-hit event tied to either pose.

Near the upper crown, row matching estimates rightward impact displacement of approximately **4 / 9 / 3 / 12 native pixels** over the four hits, followed by leftward rebound of approximately **4 / 5 / 3 / 4 pixels**. These are sampled row displacements, not a complete transform specification. Preliminary simple rotation fits leave visible pixel differences. The data supports varying hit strength in this particular loop; it does **not** prove that the website uses randomness or a particular rotation, shear or squash formula.

![Website sequence reordered into the six pawn poses](../../../artifacts/tree-cut-audit/reference-six-poses.png)

The tree stays standing throughout. There is no demonstrated completed harvest, falling trunk, wood-chip burst, disappearance or stump conversion to reproduce from this GIF. Edenia's completion effect is an explicitly retained continuation.

## Discrepancies and available assets

| Aspect | Website | Current Godot | Required work |
| --- | --- | --- | --- |
| Axe artwork and speed | Six available poses, 10 fps | Same poses, 10 fps | Reuse unchanged |
| Ambient tree speed | Eight poses, 10 fps | Eight poses, 5 fps | Give trees a 10 fps clock without changing other environmental animations |
| Hit timing | Reaction on pawn pose 2; rebound on pose 3 | Tree has no hit response | Synchronize target-tree reaction with axe phase |
| Tree motion | Bend away, opposite rebound, varying strength across four hits | Only independent ambient sway | Add a measured 24-tick reaction sequence |
| Tree/pawn proportions | Both original assets rendered at native relative size | Trees scaled 0.8; pawn scaled 1.0 | Use equal scene scale for strict proportion matching, with anchored tree placement |
| Ground anchor/shadow | Tree remains planted while upper shape reacts | Roots/shadow are part of flattened atlas; shadow clipping exists | Keep root and ground-shadow behavior during deformation |
| Completion | Not shown | 200 ms fade, two dust effects, matching stump | Retain as the user's addition after the final full swing |

Sources for current behavior: [tree construction](../../../godot/tiny-swords/scripts/level_two_preview.gd#L714), [tree artwork and scale](../../../godot/tiny-swords/scripts/tree_art.gd), [environment playback](../../../godot/tiny-swords/scripts/environment_sprite.gd), [pawn playback](../../../godot/tiny-swords/scripts/pawn.gd), [harvesting](../../../godot/tiny-swords/scripts/tree_harvesting.gd), [completion visual](../../../godot/tiny-swords/scripts/tree_cut_effect.gd). The 0.8-versus-1.0 ratio is independent of camera zoom. Matching proportions with the existing full-sized pawn means using tree scale **1.0**, then recalculating artwork offsets to keep the same roots planted. This would enlarge the trees and deserves visual checking in the existing island layout.

### All four trees

| Godot kind | Asset / appearance | Frame dimensions | Stump | Reference status / reproduction work |
| --- | --- | --- | --- | --- |
| `tree` | Tree1.png / dark pine | 192×256 | Stump 1.png | Ambient animation shown. Adapt Tree3's measured normalized bend to this broad, layered crown and its trunk attachment. |
| `tree2` | Tree3.png / large pale-trunk leafy tree | 192×192 | Stump 3.png | Actual chopping reference. Fit and verify all 24 observed poses directly. |
| `tree3` | Tree2.png / tall light pine | 192×256 | Stump 2.png | Ambient animation shown. Adapt the same timing and angular motion around this taller crown's own attachment; check its tip and lower branches. |
| `tree4` | Tree4.png / small yellow-orange leafy tree | 192×192 | Stump 4.png | Ambient animation shown. Adapt the same normalized motion to the shorter crown and pale trunk; do not blindly copy large-tree pixel displacement. |

Every atlas contains **eight ambient frames**. Every stump is already available. Local [`Trees.aseprite`](../../../godot/tiny-swords/Tiny%20Swords%20%28Free%20Pack%29/Terrain/Resources/Wood/Trees/Trees.aseprite) contains **36 frames**, each 100 ms, with separate **Top**, **Base** and **Shadow** layers for all four variants. Its tags cover the four eight-frame trees and four single-frame stumps only. There are **no hidden hit, cut, damage or fall animations**.

The separate source layers supply the pixels needed to create the missing reaction. Tree3/Tree4 exports crop 64 transparent rows from the Aseprite canvas; account for this when calculating pivots. Tree3 exported PNG frames 2–7 also contain one or two opaque pixels absent from the Aseprite composite; preserve the PNG version's pixels when making strictly matching derived assets. The other three tree atlases match their source composites across all eight frames.

`Pawn.aseprite` has exactly the available six `Interact Axe` poses (frames 115–120), including the white swipe. `Particle FX.aseprite` supplies the already-exported Dust 1/2 and other fire/explosion/water effects; it has no wood-chip or tree-hit tag. **No new pawn, stump, dust or conceptual tree artwork is needed. The missing item is a hit-response animation.**

## Concrete implementation plan

1. **Create a deterministic reference fixture.** Start the pawn at pose 0 and Tree3 at ambient frame 0, which corresponds to GIF frame 2. Retain 24 ticks at 100 ms and four measured reactions, wrapping the reference table accordingly. Use the GIF crops as the comparison target, with background/pawn/overlapping-object pixels masked out of tree comparisons. Keep evidence media ignored rather than adding copies of pack media to Git.
2. **Build the missing response for Tree3 first.** Export Top/Base/Shadow layers into a derived Godot asset folder, preserving original pack files. Fit rotation/shear/vertical deformation and pivot position against every impact and rebound frame. Keep roots planted and the ground shadow clipped; allow upper trunk pixels to follow the crown so a canopy-only rotation cannot open a seam. Treat the measured 4/9/3/12 offsets as fit constraints, not ready-to-use final tween values. If a transform cannot reproduce the silhouette and interior pixel placement, author/bake corrected reaction frames from the source layers and palette. Prefer verified discrete 100 ms poses for exact reference playback; an arbitrary smooth tween would invent intervening motion.
3. **Resolve proportion matching in the fixture.** Use the pawn and trees at equal scale, initially 1.0, to match the source GIF. Place each tree by its root pivot rather than by atlas center. Then check the larger tree rendering on existing island placements, elevated tiles and shorelines. Preserve navigation and depth anchors while updating visual bounds, previews, picking and shadow clipping where needed. Do not conflate the tree/pawn scale issue with camera zoom.
4. **Add one Godot-owned tree visual controller.** Use a dedicated tree script/controller rather than changing the 5 fps default for bushes, rocks and other `environment_sprite.gd` users. Drive both ambient frame and reaction from an explicit 100 ms clock. During cutting, derive the target's 24-tick phase from the active axe swing phase; the non-target trees continue ambient playback. A frame-change-only event is insufficient for suspended-frame catch-up; compute the pose from elapsed phase and clear transient deformation on cancellation. Mirror the reaction direction when chopping from the right. The website demonstrates left-side chopping only; the mirrored behavior is an intentional adaptation.
5. **Apply the same motion rules to every variant.** Use each tree's own trunk/crown pivot, height and source-frame size from the table above. Tree3 is the exact measured reference. The other three get the same timing, normalized bend/rebound and four-hit strength sequence, with silhouettes checked separately. If exact first-party animations for those variants become available, replace the adapted measurements with direct fits; the currently embedded GIF cannot certify their unseen poses.
6. **Keep harvesting and the user's completion.** Keep the current 10-second minimum cutting time, one-log yield, saved progress, regrowth and final-animation-boundary completion. After the final full swing, retain the 200 ms tree fade, simultaneous Dust 1/2 and the correctly matched stump. If tree visuals become layered or deformed, update `tree_cut_effect.gd` to capture the composed current tree pose so the fade does not snap back to a flattened idle pose. Avoid double shadows during the transition.
7. **Verify the result before calling it exact.** Capture all 24 Tree3 poses at native pixel scale and inspect overlays/differences against the GIF, reporting any residual mismatch rather than declaring a generic shake exact. For all four trees, check both chopping sides, shoreline reduced reach, elevated roots, crown/trunk continuity, shadow clipping, depth behind trunks, cancellation/resumption, background catch-up, and the final strike → fade → stump sequence. Existing harvesting/elevation/pickup checks cover the behavioral regressions. Update the completion capture fixture, which currently pauses the pawn and advances the timer without triggering the newly required animation-loop boundary. Finally rebuild the integrated preview with `node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords` and inspect the browser result.

All implementation belongs in [godot/tiny-swords](../../../godot/tiny-swords/), following the [game ownership rule](../../../godot/tiny-swords/README.md#game-ownership-and-edenia-integration). No bridge change is needed for this animation.

## Outcome of this investigation

The supplied pack is sufficient to supply the art. The exact missing response is not already exported or hidden in Aseprite, so implementation needs measured deformation or derived reaction frames. Tree3 can be directly matched to the website; the other three can faithfully apply the same motion but cannot be certified pixel-identical to animations the website does not show. The existing disappearance and stump addition stays part of the intended result.

## Follow-up: full-size tree preview

After reviewing the findings, the user requested a 100% size preview. `TreeArt.SCALE` is now **1.0** for all four trees and their stumps; placement ghosts use that same constant, and elevation compensation divides by the current scale instead of a hard-coded 0.8. Planted node anchors and the existing gameplay placement/navigation footprint remain unchanged for this visual comparison. The table above records the original 80% state.

![Actual Godot comparison of 80% and 100% tree scale, with the same full-size pawn](../../../artifacts/tree-cut-audit/tree-scale-comparison.png)

The scale adjustment was implemented first. The follow-up below adds the previously missing strike response.

## Follow-up: implemented strike response

The user reported that the cut animation was still missing. A native rendering regression fixture reproduced that absence for all four tree variants and both chopping sides (eight failures). The new Godot-owned `tree_visual.gd` now plays ambient tree frames at 10 fps, synchronizes the target tree to the six visible axe poses and swing count, bends at pose 2 and rebounds at pose 3. Four measured rotation strengths repeat over the 24-tick reference cycle. A shader samples the opaque body around its own root pivot while preserving the clipped partial-alpha ground shadow. Right-side chopping mirrors the motion. Pointer targeting uses the same inverse transform so the bent crown remains selectable.

`tree_cut_effect.gd` clones the reaction material when taking its completion snapshot, preserving the shown pose throughout the existing 200 ms fade and dust/stump transition. The stale completion capture fixture now emits the required final-swing boundary. Harvest duration, yield, queueing and regrowth behavior are preserved from the checkout at implementation time.

The new render check covers actual crown movement, reversed direction, rebound, recovery and cancellation for all four variants. The existing harvesting, cutting-queue, elevation and shadow checks also pass, as does the integrated preview build. Native animation capture: [tree-cut-reaction.gif](../../../artifacts/tree-cut-audit/tree-cut-reaction.gif).

This is a **close reproduction using the measured rotation**, not a claim of pixel-exact matching. The earlier rotation fits retain pixel differences from the website; the three unchopped variants remain adaptations of the observed Tree3 motion.
