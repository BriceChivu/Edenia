# Saved island conflict previews — throwaway draft

Question: do images of the two saved Tiny Swords islands make a whole-profile
conflict easier to recognize without obscuring the study differences?

Provisional verdict: yes. Prefer **Visual first**, with two equally sized images
above the existing difference table. **Island row** preserves the current table
hierarchy; **On demand** reduces the initial cost and height. No design has been
selected by the user yet. This branch contains only a draft, not a release.

Run `npm run prototype:island-conflict`, then open
`http://localhost:4173/prototype/island-conflict/?variant=visual`.
Other variants are `row` and `demand`. Arrow buttons and keyboard arrows change
the layout. All actions are local demonstrations; no profile or account is read
or changed. The example statistics follow the supplied screenshot.

The images are **synthetic level-four islands**, rendered by the canonical Godot
scenes using seeds 41 and 93. They are not the learner's actual device/cloud saves.
Both use the same framing and scale; clouds, cursors, and controls are hidden.
The capture tool disables native layout/camera persistence and game processing.

## Production constraints

- Render the exact two frozen `tinySwordsIsland` copies held by the conflict.
  Bind every result to conflict identity, side, canonical island hash, and renderer
  version. Drop late results after conflict replacement, choice, or owner change.
- Godot owns restoration, world visuals, framing, and capture. The Edenia bridge
  may carry snapshots and image results for this concrete comparison requirement.
  Do not recreate the world renderer in JavaScript.
- Add an explicit read-only capture mode. The ordinary integration startup calls
  `apply_study_level()` and then `save_layout()` after its first draw; merely
  disabling clicks or hiding two ordinary iframes is insufficient. Prevent study
  claim application, progression, harvesting, construction, checkpoint writes,
  autosave, and source mutation. Restoration may normalize only a disposable copy.
- Prefer one short-lived renderer that captures both copies sequentially and then
  releases its resources. Do not keep two animated game instances running. Measure
  startup time and memory on Safari and phones before choosing automatic versus
  on-demand generation. Cached engine delivery does not remove runtime memory cost.
- Make image availability optional. Keep comparison, exports, and explicit choice
  usable if rendering is slow, unsupported, interrupted, or the save is too old.
  Show "No saved island" separately from "Preview unavailable"; never replace a
  failed restoration with an apparently valid fresh island.
- Do not add thumbnails to every autosave or portable profile as the first design.
  They can be derived for this screen, avoiding payload/storage growth and stale
  image synchronization. If cached later, bind caches to the exact save and owner,
  invalidate on sign-out/owner switch, and exclude images from analytics/public URLs.
- Matching camera, scale, bounds, lighting, and animation state reduce visual bias.
  Fit both complete islands using shared bounds; never zoom each separately to fill
  its frame. Visible islands may look identical despite differing hidden inventory,
  timers, or data. Preserve the actual island-diff result and textual comparisons.
- Choosing a version chooses its whole learner profile. A screenshot is a recognition
  aid, not proof that a version has more study progress or should be recommended.
  Preserve protection/export behavior and the explicit confirmation step.

## Draft verification

Captured both 800 × 480 images with Godot 4.7.2. Inspected shared framing for clipped
terrain. Checked desktop and 320px content layouts in Chromium, image loading,
variant navigation, enlargement, whole-profile confirmation, cancellation, and
preview failure states. This does not verify a production read-only renderer or
actual learner snapshots. No integrated game or production UI was changed.
