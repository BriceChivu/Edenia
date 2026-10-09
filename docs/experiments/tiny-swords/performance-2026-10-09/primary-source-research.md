# Tiny Swords: preserve-resolution performance research — 2026-10-09

## Scope and evidence

The user reports dropped frames on a Mac and a Pixel 7a and wants resolution reduction treated as a last resort. This note researches alternatives; it does not claim that an unmeasured source-level opportunity explains the current symptom. Browser benchmarks are recorded separately. No game, bridge, export, hosting or browser settings were changed for this research.

Local source inspected at `de914ac95d86dad0760f23b32b3c3840138ef4d6`: `CONTEXT.md`, the game README ownership rule, project/export settings, visual/terrain/actor scripts, shaders and existing performance evidence. The available ADR concerns profile recovery and does not set rendering policy. Game changes belong in `godot/tiny-swords/`; Edenia transports presentation commands and persistence data. Engine implementation references below are pinned to **Godot 4.7.2 stable**, matching this project's official single-threaded Web templates. Live documentation and Emscripten `main` are supporting descriptions, not proof of the exact bundled Emscripten revision.

## Recommended experiment order

**User steering:** the user explicitly proposed stationary clouds printed at the left/right as background, with no depth mask. This is now the first visual simplification to compare. It preserves native resolution and existing cloud artwork while deliberately replacing drifting/depth-aware clouds; no-mask rendering is an architectural saving to test, not a measured result of this research. The wider fidelity-preserving options remain useful independently.

| Priority | Candidate | What can be retained | Evidence status |
| --- | --- | --- | --- |
| First user-proposed control | Stationary left/right background clouds, no masks | Native backing resolution and authored cloud pixels | Removes mask render passes, copies, polling, drift and recycling; visual depth/composition intentionally changes |
| 1 | Avoid unchanged tree shader updates, terrain ordering scans and log-depth updates | Native backing resolution, current animation frames, motion and gameplay timing | Redundant work exists in current source; size of improvement needs matched measurements |
| 1 | Replace cloud recursive visual polling with explicit visual/geometry revisions; cull irrelevant masks | Cloud count, opacity, ordering and animation cadence | Current masks already render on dirtiness; revision detection and candidate scans still run every frame |
| 1 | Precompute cloud metadata used at variant selection/recycling | Exact pixels, centroid placement, mirroring and altitude | Current code scans images; engine source confirms exported Web texture reads involve GPU readback |
| 2 | Crop mask coverage or share masks with identical inputs | Native canvas resolution and authored mask sampling density | Architectural inference; prove depth/transparency equivalence before accepting |
| 2 | Share materials/atlas textures where render order permits | All authored textures and poses | Engine batches by material identity and texture state; benefit depends on actual draw-call count |
| 3 | Investigate single-threaded frame-presentation overhead with a custom engine template | Native resolution and 60-Hz movement | Engine/Emscripten sources support extra presentation work; not a stock project option |
| 3 | Isolated threaded-export experiment | Current game visuals | Official feature; site-wide isolation, video/embed/auth integration and device testing required |
| Fallback | Lower decorative cadence/cloud count, or lower game render cadence | Resolution and gameplay can remain | Explicit visible compromise; test only after preserving-fidelity options |

There is no universal expected percentage saving. Prefer improvements that reduce p95/p99 frame time or remove long stalls on the same device and fixture, rather than improvements that only lower an average CPU number.

## 1. Stop doing work whose result is unchanged

### Tree poses and shader parameters

`scripts/tree_visual.gd::_process` calls `update_pose` each render frame. Ambient artwork advances at 10 authored poses per second. During most idle frames the bend angle remains zero, yet `set_shader_parameter("bend_angle", bend_angle)` runs again. In the engine, `ShaderMaterial::set_shader_parameter` forwards an existing parameter assignment without an equality check, and GLES3 material storage queues a uniform/texture update. The queued list coalesces assignments within a frame, but does not make an unchanged assignment free. [ShaderMaterial implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/resources/material.cpp), [GLES3 material storage](https://github.com/godotengine/godot/blob/4.7.2-stable/drivers/gles3/storage/material_storage.cpp).

**Inference/proposal:** retain the elapsed clock and exactly the same pose selection, but submit a new bend angle only when it differs. A pose scheduler can update ambient state at actual frame boundaries instead of executing the full routine every render frame; keep pawn `frame_changed` reactions and harvesting-phase changes immediate. This preserves the present 10-fps authored animation instead of reducing its frame count or speed.

Do not claim that repeating `Sprite2D.frame` regenerates geometry every time: its setter already returns when the frame is unchanged. Removing that GDScript call may still reduce dispatch overhead, but the uniform setter is the stronger specific opportunity. [Sprite2D implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/2d/sprite_2d.cpp).

### Terrain order, log piles and stationary pawn

Current-source opportunities, not measured conclusions:

- `terrain_depth.gd` builds arrays and stable-sorts all world children every process frame when ramps exist, before comparing inputs. Cache membership and terrain constraints on geometry generation; update actor ordering when actor position/depth changes. Moving-actor sorting remains necessary, including ramp/cliff constraints.
- `log_pile.gd` recomputes depth and rewrites child sprite positions each frame even when the pawn X and resulting shift are unchanged. Cache relevant pawn/layout inputs; return immediately for zero shift.
- The stationary pawn still calls `tile_step_allowed(destination)` each physics tick. Avoiding this call requires noticing animal/contact changes: a moving chicken/sheep can need separation even while the pawn is idle. A blunt stationary early-return would risk changing behavior.

Godot provides local/global transform notifications, `visibility_changed`, and sprite frame signals for event-driven invalidation. Not every material or custom gameplay state change has a suitable built-in signal, so owning Godot modules should maintain explicit revisions and mark them on their actual mutation paths. [CanvasItem API](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html).

Correctness cases: restore, undo, pickup, house rotation/construction, tree bend/harvest/regrowth, idle/grazing/run sheet transitions, terrain previews and camera motion. Keep a broad input-comparison mode available in diagnostics while establishing revision coverage.

## 2. Cloud masks: improve the remaining work

### User-proposed stationary background clouds

The user specifically requests the **original pack PNGs**, including their painted shadows, rather than the recomposed body/shadow assets in `assets/clouds/`. The diagnostic uses `CloudVisual.ORIGINAL_VARIANTS` directly; no bitmap regeneration or canvas downscaling is necessary. Putting the clouds in a Godot background layer below island objects establishes ordering without rendering duplicate occluders to SubViewports. The SubViewport mechanism exists to render independent rectangular scene regions, so omitting those nodes removes that work rather than merely freezing their visual output. [SubViewport API](https://docs.godotengine.org/en/stable/classes/class_subviewport.html).

**Diagnostic design:** compare (a) the current complete scene, (b) identical frozen cloud poses with current masks retained, (c) identical frozen poses drawn behind world objects with masks removed, and (d) the intended left/right static background composition with masks removed. This separates the cost of drift/recycling, mask maintenance/rendering and changed screen coverage. Freeze the seed, island, camera and native backing size; keep all other animations. A “hide clouds” probe establishes their removable ceiling but does not measure the intended static design.

Stop mask `frame_pre_draw` callbacks and avoid constructing SubViewports/copies in the static variant. Setting `use_depth_mask=false` alone leaves input detection, copies and draw scheduling alive. Likewise pausing cloud `_process` alone does not stop the separate pre-draw callback. These distinctions follow directly from `cloud_visual.gd::setup_depth_mask` and `update_depth_mask_frame`.

Static sprites still render/composite each presented game frame, so the effect will not be CPU/GPU-free. The expected saving is eliminated duplicate-scene/mask work and lifecycle/readback events; the amount depends on visible overlap and current cache behavior. Native pixel density and game movement remain unchanged. The simplification deliberately loses drift, the rare foreground visitor and clouds passing in front of island objects. Test whether retaining painted cloud shadows fits the new composition, rather than removing them inadvertently.

“Background” needs a product decision on camera behavior: world-anchored clouds move on screen with panning/zoom, while a CanvasLayer-style screen background stays fixed. Both are supported Godot presentation designs, but have different camera/framing results. The diagnostic can demonstrate the user's fixed left/right design without changing gameplay. Test expanded phone aspect ratios, camera extremes and central-island overlap before turning it into a default.

### What is already implemented

`cloud_visual.gd` starts each SubViewport disabled and requests `UPDATE_ONCE` when camera/candidates/visual inputs change. It also requests a follow-up draw to pick up queued canvas redraws. Shared recursive snapshots prevent every cloud from re-reading each visual independently within a pre-draw boundary. Calling this an `UPDATE_ALWAYS` system, or recommending dirty-only masks as a new fix, would describe the old implementation.

Godot's `UPDATE_ONCE` renders once then becomes disabled; `UPDATE_WHEN_VISIBLE` has different semantics and does not mean “render only when scene inputs changed.” The current mechanism is supported by both the public API and the engine viewport implementation. [SubViewport API](https://docs.godotengine.org/en/stable/classes/class_subviewport.html), [viewport rendering source](https://github.com/godotengine/godot/blob/4.7.2-stable/servers/rendering/renderer_viewport.cpp).

### Revision detection and spatial culling

Each cloud still scans `World` children and compares recursively constructed arrays at every `frame_pre_draw`. A cloud checks `is_visible_in_tree`, which describes hierarchy visibility, not whether its painted body intersects the camera. A cloud offscreen in an expanded scene can therefore maintain a full mask even when the renderer culls its body.

**Inference/proposal:** maintain one world registry with visual revisions updated by the actual source changes, plus one geometry/camera revision. Determine candidate membership from ground-depth changes or registered-object changes. Check a conservative body bounding box against the camera before producing a depth mask, and check candidate screen bounds against the mask coverage. Hidden/offscreen render work may stop while simulation clocks continue.

`VisibleOnScreenEnabler2D` can disable processing when a region leaves view, but is unsafe as a blanket solution for current animals/clouds: their clocks, drift, harvesting/regrowth deadlines and catch-up behavior have gameplay/presentation contracts. Use it for isolated decorative visual work, or separate simulation from drawing and recompute the visual phase on re-entry. [VisibleOnScreenEnabler2D API](https://docs.godotengine.org/en/stable/classes/class_visibleonscreenenabler2d.html).

### Crop at the same pixel density

Current masks cover the logical viewport (1152×496 in a wide baseline), rather than the small region a particular cloud samples. Cropping a mask to a padded cloud/island overlap at the **same logical pixel density** differs from downscaling the game: it omits unrelated pixels. Existing mask UV math already contains axes/origin/size, which gives a possible seam for a crop transform.

**Inference/proposal:** first test a fixed padded island rectangle or stable tiled mask region. Resizing/moving a tightly fitted viewport every drift frame can cause new allocations or redraws and defeat the existing cache. Clamp/gate samples outside the retained region to zero alpha, preserve pixel alignment under fractional camera zoom, and render enough padding for animation, bent trees and future positions. Inspect mask area, actual update count, draw calls and frame tails independently.

### Share only equivalent masks; one alpha union is insufficient

Each cloud selects candidates with `item.global_position.y > shadow_ground_position().y`. Clouds at different depths therefore need different occluder sets. Sharing a common union-alpha mask would hide pixels behind objects that should be behind a particular cloud.

**Inference/proposal:** share a mask only when candidate identity/revisions and camera/region inputs match. A larger redesign could store ground-depth information and compare each cloud's depth in its shader, but one topmost-depth number is not automatically equivalent to compositing all partially transparent occluders above each depth threshold. Current sprite shadows/alpha, terrain and moving actors require explicit equivalence tests. Static terrain and dynamic actors could also use separate retained masks, composing alpha as `1 - (1 - static_alpha) * (1 - dynamic_alpha)`; test renderer alpha rounding and overlap order against the current output.

This is a correctness-sensitive architecture experiment, not a recommendation to remove masks or reduce cloud opacity.

## 3. Remove cloud recycle/startup image scans and readbacks

`cloud_visual.gd::set_variant` obtains the original 576×256 image and loops through its pixels to derive cloud/shadow centroids. `set_altitude` obtains an image to find used width; `next_variant(large_only)` also reads used width. These are startup/recycle events, not every drift frame, but can cause occasional dropped frames even if idle average CPU looks healthy.

In an exported release, `CompressedTexture2D.get_image` delegates to the rendering server. The GLES/Web read path creates a temporary texture/framebuffer, draws a copy, calls `glReadPixels`, then deletes both. The editor-only image cache does not make the release path a cached file read. [CompressedTexture2D source](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/resources/compressed_texture.cpp), [GLES texture readback source](https://github.com/godotengine/godot/blob/4.7.2-stable/drivers/gles3/storage/texture_storage.cpp).

**Inference/proposal:** precompute eight variants' centroids and used rectangles with a Godot offline tool or generated source metadata, fingerprinting their source images. Selection/recycling then becomes a tiny lookup while preserving original cloud/shadow alignment and altitude behavior exactly. The successful imported inventory-outline strategy in this repo is an existing precedent for removing first-use scans; it is already shipped for outlines, not yet for this cloud metadata.

If startup tree/contact pixel reads also show up in profiles, retained/prepared alpha bitmasks are another option. Balance saved readback time against additional asset size and retained memory. Do not reintroduce per-frame image reads to diagnose the final rendered output.

## 4. Batching and material reuse without changing the art

The 4.7.2 Compatibility canvas renderer opens a new batch when the material RID changes, even if two materials use the same shader. Texture/clip/blend/command state also affects batching. Current code creates a unique reaction material per tree and separate cloud/shadow materials per cloud. [Compatibility canvas source](https://github.com/godotengine/godot/blob/4.7.2-stable/drivers/gles3/rasterizer_canvas_gles3.cpp).

**Inference/proposal:** share each tree-variant material for common frame-size/root parameters and use per-instance scalar bend state. Godot supports CanvasItem instance parameters; scalar/vector values work, while textures/arrays cannot become per-instance uniforms. This means a tree material experiment is more direct than sharing all cloud materials, whose mask samplers differ. [Shader language instance-uniform constraints](https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/shading_language.html), [GLES canvas instance data](https://github.com/godotengine/godot/blob/4.7.2-stable/drivers/gles3/shaders/canvas.glsl).

Important local consequence: `cloud_visual.gd::sync_visual` copies a source material, but does not currently copy CanvasItem instance parameter values. `visual_inputs` only explicitly records `bend_angle`. Any migration must synchronize the tree's bend instance parameter into its depth-mask copy, or visible tree pixels and occlusion diverge.

Do not reorder alpha-blended objects merely to group textures: the game depends on terrain, root and actor depth ordering. Do not replace the whole world with one MultiMesh as a shortcut. MultiMesh draws efficiently, but treats instances together for visibility and does not automatically reproduce this world's individual ordered interactions. It is a candidate for same-depth static decoration chunks after draw-call attribution. [MultiMesh optimization guidance](https://docs.godotengine.org/en/stable/tutorials/performance/using_multimesh.html).

## 5. Frame presentation has costs beyond the scene

Godot creates its WebGL2 context with antialiasing disabled and explicit swap control enabled. Its Web build links Emscripten offscreen-framebuffer support. Those source choices explain why an otherwise light scene can still execute frame-commit work. [Web context creation](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/web/display_server_web.cpp), [Web build flags](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/web/detect.py).

Emscripten documents explicit swap control and its intermediate-framebuffer/OffscreenCanvas paths. Its current blit implementation queries prior GL state, then blits/copies the offscreen frame and restores state. This matches the category of `blitOffscreenFramebuffer/getParameter` work recorded in this repo's earlier profiles. It is **not** proof that the GPU shader is saturated. [Emscripten WebGL context API](https://emscripten.org/docs/api_reference/html5.h.html#webgl-context), [Emscripten blit source](https://github.com/emscripten-core/emscripten/blob/main/src/lib/libwebgl.js).

The first-party WebGL optimization guidance recommends avoiding runtime GL queries/readbacks, unnecessary framebuffer mutation, resource creation/deletion and excess state changes; it also supports texture atlases, instancing and tighter culling. These are mechanisms to investigate, not guaranteed gains for every browser/driver. [Emscripten WebGL optimization guidance](https://emscripten.org/docs/optimizing/Optimizing-WebGL.html).

**Inference/proposal:** if current profiles still assign a large share to presentation after scene optimization, a custom **Godot engine** template could compare implicit presentation against the official explicit path. This is not a bridge monkey-patch: verify engine swap semantics, resizing, screenshot behavior, visibility pause/resume, WebKit fallback and context restoration. Keep official templates as a fallback and measure native-resolution equivalence. Removing queries without knowing the driver's current state can corrupt rendering.

`powerPreference` is only a context-creation hint, not a performance guarantee. Antialiasing is already disabled at context creation. PNG/Brotli/pack-size changes primarily help startup/download; no evidence here makes them a sustained frame-rate fix.

## 6. Threaded Web export: test separately from mainline hosting

The project currently exports with `variant/thread_support=false`. Godot's threaded export enables SharedArrayBuffer-backed threading and requires secure delivery plus cross-origin isolation (or its documented PWA workaround). It is not a switch that automatically parallelizes all GDScript work. Single-threaded export remains the documented default for broad embedding compatibility. [Godot Web export requirements](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

The top-level document and ancestor iframe chain must meet isolation requirements; isolating only the game response inside an ordinary nonisolated Edenia page is insufficient. COOP also changes opener communication, and COEP affects cross-origin resources/frames. [Chromium cross-origin isolation guidance](https://web.dev/articles/coop-coep).

Edenia's study-video iframe and authentication flows therefore belong in an integration experiment before a hosting migration. Chromium's `iframe credentialless` can exempt a third-party iframe from COEP embedding restrictions, but gives it an ephemeral cookie/storage partition that disappears with the top-level document. It is a deliberate product-behavior change to evaluate, not a silent drop-in solution. This 2023 explainer is used for behavior, not current cross-browser support claims. [Chromium credentialless iframe design](https://developer.chrome.com/blog/iframe-credentialless).

**Proposed isolated test:** serve official threaded and single-threaded templates locally with the required headers, use the same fixture and native backing size, and compare game-frame tails while parent DOM/video work is active. Validate `crossOriginIsolated` and actual worker/render behavior; then test current physical Android Chrome and Safari. Preserve a nonthreaded fallback. Only investigate hosting changes after that comparison demonstrates a meaningful benefit.

## 7. Physics cadence and animation fidelity

Godot's default physics cadence is 60 ticks/s. Lowering it decreases physics work, but can reduce responsiveness/accuracy; interpolation can smooth display between ticks. The engine limits catch-up steps, so a lower render rate does not simply halve physics work. [Engine physics settings](https://docs.godotengine.org/en/stable/classes/class_engine.html), [2D interpolation behavior](https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/2d_and_3d_physics_interpolation.html).

Tiny Swords mixes pawn physics ticks with animal/render-process movement, per-frame depth ordering and wall-clock harvesting/construction. **Inference:** reducing physics cadence is lower priority than removing redundant stationary work. A 30-Hz experiment needs feet/segment collision, stair traversal, animal separation, hammer/axe pose boundaries and render-depth checks; adding interpolation only to the pawn could mismatch collision, sprite/depth and animal positions.

The existing Web `web_rendering_policy.gd` intentionally leaves `Engine.max_fps=0` and uses an asynchronous requestAnimationFrame divisor. Previous local evidence found the ordinary max-FPS limiter busy-waiting and found no clear CPU gain from divisor two on the M3. Do not repeat it as a confirmed solution. A divisor is relative to actual display callback cadence, so measure engine frames and frame intervals rather than assuming divisor two always means exactly 30 fps.

## 8. What the earlier fixes already establish

The [2026-10-05 report](../performance-2026-10-05/report.md) documents implemented shadow caching, static terrain/5-Hz foam separation, cached inventory eligibility, dirty cloud rendering and offscreen suspension. The [2026-10-06 diagnostic documentation](../../../../scripts/diagnostics/tiny-swords-performance/README.md#inventory-opening-investigation--2026-10-06) documents canonical imported outlines eliminating the former cold inventory-opening scan. Large-library checkpoint coalescing/storage work is also recorded in the earlier report. These are prior measurements, not today's physical-device acceptance.

The game README's older Checks paragraph still mentions a 2× default cap. Actual `project.godot` sets `web/max_pixel_ratio=0.0`, and the later Rendering and display density section correctly describes native density. Research recommendations use the current source setting and retain it.

The parent investigation also discovered that the old diagnostic harness forced a default DPR cap of two even though the shipped game uses native density. That harness mismatch must be corrected before drawing conclusions about the present game. Old DPR-2 results remain valid for their stated canvas size, but are not a native-density baseline.

## 9. Required measurements and practical limits

Keep native backing resolution, texture filtering, island fixture and authored animation cadence fixed for the primary comparisons. Separately record:

1. Parent/iframe callback intervals, actual engine frame intervals, p95/p99 and long-frame counts; mean FPS can hide noticeable bursts.
2. CPU inclusive timings for mask input detection versus copy synchronization versus draw execution; do not add nested timers.
3. Actual mask update counts/area and main/SubViewport draw-call counts; lower script CPU alone does not prove lower GPU work.
4. Browser profile stacks, renderer-process CPU, GPU-process CPU and memory. GPU-process CPU is not hardware GPU utilization.
5. Cold startup, first editing, sustained idle, walking/cutting/house work, camera drag/zoom, background/resume, cloud recycling and study-video playback.
6. Normal and terraced/large islands; battery power and warmed sustained physical-device runs, with repeatable A/B/A or randomized pairs.

Chrome's performance panel distinguishes dropped/partially presented frames and exposes main-thread tasks; physical Android Chrome can be inspected with USB remote debugging. Emulated phone viewport/DPR on a Mac does not reproduce Pixel GPU, thermal or scheduler behavior. These first-party tools support the measurement method, not a claim that such device runs occurred. [Chrome Performance reference](https://developer.chrome.com/docs/devtools/performance/reference), [Android remote debugging](https://developer.chrome.com/docs/devtools/remote-debugging).

No physical Pixel measurement, custom engine presentation build, threaded-export benchmark or exact-pixel cropped/shared mask prototype was run by this research subtask. Their benefits remain unproven. Use the accompanying current benchmark findings to decide which preserving-fidelity implementation deserves the next experiment.

## 10. Follow-up audit: retain unchanged cloud occluder copies

The parent investigation added a disposable `mask_copy_cache` control in `prepare-research.py`: each copy retains `[item.global_transform, visual_inputs(item)]`, and equal tokens skip `sync_visual`, transform/z assignments and the explicit TerrainPiece `queue_redraw`. The original all-copy path remains available in the same export. This research inspected that diagnostic and canonical source, without building or modifying canonical gameplay.

### Why retained terrain draw commands are valid

An unchanged CanvasItem's draw commands are remembered; another frame rendering that item does not need another GDScript `_draw` call. `queue_redraw` schedules a deferred redraw. The engine clears/rebuilds commands in its redraw callback, while the rendering server stores texture-rectangle commands on the canvas item. Thus drawing a changed pawn into a SubViewport does not require rebuilding an unrelated terrain piece's command list. It does still rasterize that piece when the mask viewport is updated. [Custom drawing retention contract](https://docs.godotengine.org/en/stable/tutorials/2d/custom_drawing_in_2d.html), [CanvasItem redraw implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/canvas_item.cpp), [canvas command allocation/clear implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/servers/rendering/renderer_canvas_cull.cpp).

`TerrainPiece.draw_contents` draws in local/world-grid coordinates and does not use camera dimensions. Its `draw_set_transform(-position)` makes root transform part of the retained geometry's inputs; the token includes global transform, so changed root placement is not skipped. A camera-only mask transform/size change can reuse unchanged local draw commands. Keep the existing follow-up `depth_draw_pending` render because redraw callbacks remain deferred: recording a copy token is not proof that newly queued drawing commands have already been rendered.

### Current token coverage

Within the existing supported visual families, the token is a reasonable **conservative reuse test**:

| Input changed | How the token sees it | Existing synchronization effect |
| --- | --- | --- |
| Root/global or descendant/local transform | Explicit root global transform; recursive Node2D transform inputs | Copy transform setters; root copy receives global transform |
| Visibility or tint/fade | Recursive visible/modulate/self_modulate | Includes construction opacity and tree fade |
| Sprite sheet, grid, pose, offset, flip, center or region | Recursive Sprite2D input list | Grid is set before frame, preserving larger grazing-sheet poses |
| AnimatedSprite animation/frame/resource identity | Recursive AnimatedSprite2D input list | Updates same resource/animation/frame/offset/flip/center |
| Polygon vertices/color/texture | Recursive Polygon2D input list | Existing guarded setters preserve unchanged mesh geometry |
| Tree bend | Special `bend_angle` input | Copy shares current ShaderMaterial; bend invalidates mask rendering |
| Terrain shape/piece/height/preview geometry | `refresh_drawing()` then `drawing_revision` | Explicit redraw when drawing inputs changed |
| Candidate addition/removal | Existing per-cloud candidate dictionary and copy lifecycle | Newly constructed copy has no prior token; removed candidates are freed |

During pre-draw, `visual_inputs` returns the already-shared `[instance_id, revision]` snapshot. The extra diagnostic token read therefore reuses that frame's snapshot rather than traversing the entire subtree again. Outside pre-draw (for direct tests), it returns the recursive inputs themselves. Deep duplication retains input arrays instead of aliases to later-mutated arrays.

The cache does not change the existing per-mask invalidation or its render schedule. It mainly removes copying/rebuilding other candidates when one actor changes. It should not be advertised as eliminating all mask GPU work, nor does it eliminate initial world scanning/recursive snapshot construction.

### Boundaries and missing invalidation

These are important existing-model limits, not automatically new regressions caused by the equality check:

- **In-place resource mutation:** the input list stores material/texture/SpriteFrames references, not their content revisions. Changing a shared material uniform reaches source and copy, but may fail to mark a sleeping mask dirty. Replacing a resource is detected; mutating it in place may not be. A future production revision system needs owning-resource change events or explicit visual revisions.
- **Child topology:** recursive inputs notice child identity/order changes, but current `sync_visual` only synchronizes `min(source_count, copy_count)` children. It cannot insert/remove/reorder copies. Rebuild the copied subtree when topology changes, or document fixed topology. Current game rebuilds many placed objects by replacing their root nodes, which the candidate lifecycle catches.
- **Instance uniforms or other CanvasItem state:** shader instance parameters, parent-material policy, texture filter/repeat, light/visibility masks and inherited ancestor appearance are not fully fingerprinted or synchronized. Current gameplay does not mutate most of these. In particular a later shared-tree-material optimization must add bend instance-parameter synchronization and invalidation.
- **Custom drawing beyond TerrainPiece:** a custom `_draw` based on unlisted time/external state could redraw while its token stays unchanged. Do not treat this token as a general CanvasItem pixel-equivalence hash. Current generic copies are sprites/polygons; TerrainPiece has its explicit drawing revision.
- **Terrain identity/configuration:** initial copies receive `layout` and `piece`; ongoing sync reassigns layout, but does not reassign piece or render/editor/shadow/backing configuration. Existing World candidates are raised/stair pieces and are rebuilt when geometry structure changes. If a future caller repurposes a TerrainPiece in place, synchronize its drawing configuration or recreate the copy. Equal geometry with a replaced layout object can safely retain commands; subsequent actual geometry changes must still update the revision and layout.

### Validation before accepting the optimization

Run current `tests/cloud_depth.gd` in cache-on and original modes, including rendered marker overlap, mirrored clouds, viewport changes and sheet transitions. Add a focused rendered comparison where a moving pawn repeatedly dirties the mask while terrain remains stationary: copied terrain `_draw` counts should stop increasing after initial preparation, while masks/pawn motion remain visually identical. Exercise geometry edits/previews, undo/restore, moving logs/house construction opacity, tree reaction/fade/regrowth and candidate threshold crossings. Camera drag/zoom/resize must redraw the mask using retained copies, with no one-frame stale occlusion. Verify at least one changed child and one newly replaced root.

Use simultaneous timing/draw counters to distinguish saved GDScript draw-command work from unchanged SubViewport rasterization. An equal screenshot alone does not prove lower cost, and lower CPU alone does not prove invalidation correctness.

## 11. Narrow inventory follow-up: edit/undo rebuilds and pixel picking

### Attribute inventory costs to the current mode

Canonical `level_two_preview.gd::refresh` sets `$Clouds.visible = not editing` and `$PassingCloud.inventory_hidden = editing`. The cloud mask candidate loop therefore has no visible source candidates during inventory; completed masks become disabled. A static-cloud variant can show a different background in that mode, but an inventory CPU difference cannot automatically be credited to eliminating active depth-mask passes that canonical inventory already suppresses. Check actual mask-update/draw counters separately from scanning, scene rebuilds and adding/removing static sprites.

The parent reports a stress control with 20 tree edits plus 20 undo actions on a 100-tile island. That is a burst workload, not evidence that one ordinary placement always takes a second. Keep total batch duration, individual action time, deferred terrain-draw time and parent frame stalls separate. This subtask inspected source only; it did not independently reproduce those measurements.

### Source-confirmed broad rebuild

Both `apply_edit` and `undo` unconditionally call `rebuild_decorations`. The latter removes/recreates terrain shadow/backing views and raised terrain occluders, flora/decorations, log piles/shadows, houses, animals and every tree. A tree-only edit can therefore invalidate unrelated terrain caches, reconstruct animal visuals/materials and create new GPU resources. `queue_free` defers deletion, so a tight batch can temporarily accumulate old and new objects until the event loop catches up. These mechanisms exist in source; timing attribution still needs the generated-copy inclusive timer and renderer profiles.

`TreeArt.sources` and `TreeArt.shadows` already retain source images and partial-alpha pixel lists for each variant/stump. However `TreeArt.texture_at` traverses the shadow-pixel list every call to re-evaluate clipping. When any shadow pixel falls off receiving grass it duplicates the atlas image, clears clipped pixels and constructs a fresh `ImageTexture`; that result is not retained by a placement/ground-input cache. Rebuilding identical clipped trees can therefore repeat CPU clipping, texture upload/allocation and later alpha-cache preparation. This is separate from the already-imported inventory borders.

### Preserve-visuals implementation candidates

These are proposals for Godot-owned work, in priority order:

1. **Skip unrelated categories for object-only edits.** Retain terrain shadow/backing/raised-piece nodes when terrain cells/elevations/stair configuration are unchanged. A tree cycle or placement needs tree/contact/preview invalidation, not reconstructing identical terrain draw resources. Keep full rebuild as a correctness fallback for restore and complex geometry edits until coverage is established.
2. **Reconcile visual nodes by stable keys.** Retain unchanged trees/decorations by cell and kind, terrain views by layer/cell, houses/logs by cell and animals by a stable identity. Apply new layout references and changed transform/art inputs explicitly. Preserve node animation clocks, tree reaction material state, harvesting/construction links, animal routes and displacement behavior; blindly retaining an animal by array index across pickup/undo can attach the wrong state.
3. **Cache exact generated tree textures and picking data.** Key by variant, stump flag, exact placement offset and canonicalized receiving-ground neighborhood (currently a 5×5 same-floor set). Retain the created texture and its CPU alpha/picking data. Reuse across unchanged rebuilds/undo; bound the cache because free-position previews and repeated edits can create many offsets. Include artwork/scale/clipping-policy revisions if resources can change.
4. **Use already-retained CPU pixels for picking.** Build the picking bitmap when the clipped image is already in CPU memory, or retain the exact generated alpha image. This avoids uploading a new texture only to read it back on the first pointer hit. A second lookup for the original atlas and clipped ground shadows can also work, but must reproduce current alpha threshold and frame/flip/offset/region mapping exactly.

Do not move clipping/picking/rebuild behavior into Edenia or the export builder: the game ownership rule applies. Offline art preparation is a Godot asset tool where inputs are fixed; runtime free-offset/terrain clipping remains game logic. Lower backing resolution is unnecessary for these candidates.

### What `Sprite2D.is_pixel_opaque` actually caches

Sprite2D maps its local point to source texture coordinates, accounting for the selected sprite frame/region, offset and mirroring, then delegates to the Texture2D's opacity query. It does not necessarily read back pixels on every call. [Sprite2D source](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/2d/sprite_2d.cpp).

Both imported `CompressedTexture2D` and generated `ImageTexture` lazily create an `alpha_cache`: the first query obtains an image and builds a bitmap; later queries read a cached bit. The cache belongs to the **texture resource**, so recreating only a node with the same imported texture retains a warmed cache. A fresh clipped ImageTexture starts with no cache; changing its image clears the cache. Its `get_image` calls the rendering server, so creation from an Image does not establish a permanent CPU image store. [CompressedTexture2D alpha cache](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/resources/compressed_texture.cpp), [ImageTexture alpha cache and image access](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/resources/image_texture.cpp).

The bitmap builds from alpha with strict `alpha > threshold`, with a default threshold of 0.1. Retaining the unbent tree's current picking behavior therefore means reproducing that threshold on the **clipped displayed texture**, not replacing it with opaque-body `alpha > 0.99` or a rectangular hit area. [Bitmap threshold implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/resources/bit_map.cpp), [default C++ threshold](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/resources/bit_map.h).

The Web/GLES renderer image-read path described in section 3 uses temporary resources and `glReadPixels`; consequently first picking of fresh generated tree textures is a synchronization risk. In `tree_visual.gd`, zero bend delegates to Sprite2D opacity; nonzero bend already samples `TreeArt.sources[kind]` for rotated opaque body pixels, while its shadow branch also consults texture opacity. Do not assume a new CPU picker can ignore clipping or the authored ground shadow. [Renderer texture readback implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/drivers/gles3/storage/texture_storage.cpp).

A separate current-source issue: `log_at` calls `LOG_TEXTURE.get_image().get_pixelv` directly for sprite bounds hits. That explicit `get_image` bypasses the opacity bitmap cache and can repeat readback while the pointer lies over logs. Retain one CPU log image/alpha representation or reuse a correct cached picker, preserving its existing alpha >0.1 and sprite mapping. Measure cursor-over-logs independently; do not attribute it to a tree-edit batch without matching profiles.

### Minimum causal checks

For the next preserving-fidelity prototype, compare original versus retained-node/generated-texture-cache mode with identical edit locations/order and native density. Count newly created textures, first-opacity-cache image reads, clipped atlases and rebuilt terrain/actor nodes; retain timing for layout edit/restore, rebuild, save and deferred drawing separately. Check unbent/bent and mirrored picking, every tree variant/frame/stump, edge-clipped shadows, placement offsets, undo/restore and stable animation poses. Terrain geometry changes must still invalidate receiving-ground clipping; unaffected animation and animal state must survive an object-only edit. Keep the static-cloud simplification and edit-cache experiment as separate controls.
