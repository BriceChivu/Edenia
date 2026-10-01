# Tiny Swords — local island builder preview

## Run a specific level in Godot

Open `project.godot`, then find **res://previews/** in the FileSystem dock.
Double-click a scene below and use **Run Current Scene (F6)** (Fn+F6 if your
Mac uses the function keys for system controls):

| Scene | Starts with |
| --- | --- |
| `previews/level_one.tscn` | Fresh level-one island and pawn; building/unlock control hidden. |
| `previews/level_one_to_two.tscn` | Fresh level one. Click **Try level 2** to run the real unlock, rewards and animated ribbon, then **Start building**. |
| `previews/level_two.tscn` | Fresh intermediate level two: three ground tiles and one stair bundle; toolbar open. |
| `previews/level_two_to_three.tscn` | Fresh level two. Build if desired, choose **Done**, then **Try level 3** to run the real second upgrade on that same island. |
| `previews/level_three.tscn` | Fresh level three with all active cumulative rewards; toolbar open, no transition required. |
| `previews/bridge_level_three.tscn` | Retained bridge sandbox; the bridge experiment is currently disabled. |

These are thin inherited scenes using the same world, movement and builder code.
Every F6 run starts fresh: these entries neither load nor save native or browser
preview layouts. Changes made while testing are discarded when you stop the run.
Each transition grants its own rewards only once per run. Existing saved layouts remain intact.

**F5 / Play Project** still runs the existing persistent local preview described
below; use **F6** to test whichever named scene you opened.

## Persistent local preview

Open `project.godot` in Godot 4.7, then **F5 / Play Project**.
The default scene is now `scenes/level_two_preview.tscn`, which inherits the preserved
level-one environment. **Try level 2**, then **Try level 3** (outside build mode),
simulate the two local upgrades using the same reward and celebration code:

| Upgrade | Newly granted inventory | Item count |
| --- | --- | --- |
| Level 1 → 2 | 3 ground tiles + 1 stair bundle | 4 |
| Level 2 → 3 | 3 ground tiles + 1 stair bundle + 1 pine tree | 5 |

The active inventory grants nine items: six ground tiles,
two stair bundles and one tree. Each stair bundle includes its upper landing;
that landing is not an additional inventory item. Upgrades preserve every
placement, decoration and the pawn position. There is no island reset. Undo
history starts a new editing session after an upgrade so it cannot revoke rewards.
The progression level is independent of terrain height: terrain floors are created by stairs.

The inventory has only Ground, Stairs, and Pine: grass starts at water level and art follows elevation.
Ground uses all five palettes by elevation: atlas colors 3, 1, 2, 4, 5, then repeats.
The base is green, followed by gold and teal. Stairs use their upper landing’s palette. A stair placed next to
any ground floor creates a landing one floor higher at its high end in the same action.
Each stair bundle includes its upper tile and uses no ground inventory. If it
replaces an existing upper tile, that plain tile returns to inventory. Picking
up a stair collects its bundled landing too; first move the pawn and any tree
off that landing. If another staircase uses the landing as its foot, pick up
that dependent staircase first; collecting a bundle cannot remove another
staircase’s lower connection. Opposite stair ramps may share an upper landing
at the same height. Hovering automatically chooses the valid direction. Picking up either ramp keeps the
shared landing; picking up the final ramp collects it. Save version 10 preserves
shared landings and their inventory accounting while accepting older layouts.
While holding Ground, the first click on an empty square places grass at water
level. Clicking that grass again raises it to the next valid extension of nearby
higher ground. Hovering previews the next click; cursor proximity does not choose
the height. If no higher extension is available, the tile stays unchanged.
Floor two requires a receiving floor-one terrace: two vertically stacked cliffs
are forbidden. Raising existing grass spends no inventory; stair endpoints retain
their required heights. Colors are not player choices.
Legacy layouts keep the migration where flat grass whose visible top directly adjoins the back of a level-one platform
continues that platform: its base moves down one grid square and its height
becomes 64px, preserving the top's screen position. Saved layouts use the same
rule until repeated-click building is used; inventory and plants are preserved,
and stair endpoints stay protected. New placements then retain their water-level
height across saves until explicitly raised. Repeated clicks also recognize
visible joins: grass touching the back of a terrace can move its base forward
one square and rise one floor, preserving its visible top, plants, and inventory.
If that destination already contains ground at the same height, fully hidden
under the receiving terrace, the two ground tiles combine and one spare tile
returns to inventory. Existing objects are preserved; conflicting objects keep
the merge unavailable. The next click can extend an upper platform when its
receiving terrace permits it.
**Terrain** expands left into a compact strip at the same bottom-right anchor.
Sizing follows the [official UI showcase](https://pixelfrog-assets.itch.io/tiny-swords):
its 1600px source image displays at 920 CSS pixels on the desktop page (0.575×).
The supplied 1840px screenshot is an enlarged capture, not logical game dimensions.
Action icons use that reference scale with nearest-neighbor sampling.
The blue launcher and panel use native-scale assembled nine-slice artwork;
fixed 16px corners retain the source pixels and the middle/edges tile to fit. Pickup uses a compact four-corner icon; the collapsed
control is 110×32 displayed pixels; the expanded strip is 180×44 with five 32×32
hit targets, at both desktop and phone widths. It remains anchored 14px from the
right and bottom. Celebration buttons and game cursors retain their existing scale.

Ground, stairs and pine are image-only choices, with no title or individual
button backgrounds. Small bottom-right ×N counters show remaining ground, stairs
and pine. A small underline marks selection; faded artwork is unavailable.
The four-corner Cursor 04 icon picks up, and the orange back arrow undoes. A small
cross at the top-right (24×24 hit target) or Escape exits building and returns to walking. All controls retain accessible names; item counts remain in their accessible
names and inventory state. Selecting a tool keeps the strip open.

Using the last available placeable item closes the strip and returns to walking.
Using up only one item type does not close it. Reopening an empty inventory lets you
pick up terrain or undo the final placement; that automatic close preserves undo.
An ordinary new build session starts fresh undo history. Cursor 01 is used on build
controls, Cursor 04 for valid pickup, Cursor 03 for unavailable edits, and Cursor 02
for walking. Unavailable targets show Cursor 03 alone, without a red outline or
red placement preview. Valid placement shows its terrain preview without a cursor overlay.
Stair-bundle pickup widens Cursor 04 horizontally across two squares toward the
upper landing, retaining its original corner pixels and one-square height.
Hovering or clicking any of the three screen-grid squares—the ramp, the upper
landing, or the cliff face below the landing—selects the same bundle. The pickup
outline follows that three-square footprint in either orientation and at each floor;
a tree on the landing is still picked up separately first.
The pointer moves freely. Terrain placement and pickup use grid cells; pine
placement keeps the cursor position within the chosen square. The trunk anchor
stays 15.2 scene pixels inside the left edge and 17.6 inside the right edge,
so the outermost trunk/root pixels across all eight animation frames can touch
the square boundary but cannot cross it. Its vertical range runs
from the square's center to 28 scene pixels below it, keeping the visible roots
on the grass while allowing planting near the bottom, with one tree per square.
Invalid edge positions and positions overlapping the pawn cannot be placed.
The moving preview and placed tree share the same artwork anchor; navigation
and Y sorting follow the placed trunk. The movement obstacle follows the visible
roots, so the pawn can walk onto the grass immediately below them, including
near a square's front edge. Trees coexist with existing foliage and
land decorations; planting or picking up a tree preserves bushes and rocks.
Save version 13 preserves tree offsets and moves overflowing trunks from
versions 9–12 just inside the horizontal boundaries. Unsafe upward placements
from versions 9–11 still move down to the center. Earlier saves keep their original centered anchors. Pickup still selects the
owner square, and undo restores the exact offset.

Focused check: `Godot --headless --path godot/tiny-swords --script res://tests/tree_cursor_placement.gd`.

The pawn's current tile cannot be removed. The original bush tile can be
collected after the pawn moves away; respawn then uses another safe tile. Only the tree
trunk blocks movement; the space in front remains walkable. Paths use a finer
grid around trunks, and Y sorting draws the pawn in front when appropriate; disconnected ground becomes reachable when joined. Paths are simplified
across clear ground, keep a foot margin around water and tree trunks, and climb only along stair ramps. Raised ground is one 64px step above flat
ground; a horizontal stair square starts beside flat land and points toward
an existing or automatically created raised landing. Stairs orient automatically. Pick up stairs before their
supporting land. No third floor is offered.

The grid renderer selects the guide’s sixteen complete 64×64 ground pieces
according to neighbors, including the dedicated narrow and isolated pieces;
shore foam, automatic shadows, and land-facing versus water-facing cliffs follow
the editable layout. Foam frames are staggered between cells. Paper and button nine-slice
patches and ribbon segments are assembled from the pack's separated source pieces.
Medieval Sharp is inherited by all game UI text. Original PNGs are not edited. Five terrain colors remain available in source art;
the automatic level-two palette uses green and gold.

Layout and reward state save only to the preview browser's local storage (or
`user://builder_preview.json` in native Godot). This is a local design prototype,
not a learning-progress unlock or profile-sync implementation. The existing Edenia
level bar is unchanged. No production paths or study data are modified.

 Left-click the main
island to move the blue pawn using **Cursor 02**. Click water to make the pawn
walk to the shore, fall in with a splash, wait one second after the splash,
then fade back onto the main island. Clicks
on the decorative small islet are ignored; clicks during the fall/respawn are
ignored to prevent overlapping sequences. **F8** stops a game launched from the editor.

```sh
/Applications/Godot.app/Contents/MacOS/Godot --editor --path /Users/brice/.codex/worktrees/6a72/Edenia/godot/tiny-swords
```

## Composition and editable files

- `scenes/level_one.tscn`: native editable nodes for a 2×2 grass island, one small
  islet with a land rock, one bush, one leafy tuft, two water rocks, and six regular clouds plus one rare passing cloud. No buildings,
  trees, ships, or additional units. The blue pawn is restored at the user's
  latest request; the earlier environment-only revision is superseded.
- `scenes/pawn.tscn` and `scripts/pawn.gd`: reusable idle/run animation and movement.
- `scenes/pawn_playground.tscn`: the original four-tile playground, preserved for reuse.
- `scripts/level_one.gd`: Cursor 02, main-island walking, and the water fall/respawn sequence.
- `scenes/water_splash.tscn`: the original nine-frame `Water Splash.png`, played
  once on impact at the source pack’s documented 10 fps. The shared `scripts/water_fall.gd` profile uses the original six run poses at
  100 ms intervals, measured from the confirmed Particle FX reference; both
  the fixed scene and editable previews call the same fall/splash/respawn implementation.
- `World` uses Y sorting: foliage is anchored at its base so it covers the pawn
  when he moves behind it, and the pawn draws in front when he moves below it.
- `scripts/environment_sprite.gd`: gently staggered foam, rock, and foliage frames.
- `scripts/cloud.gd`: six clouds moving slowly at individual speeds. Size, height, and speed
  vary when they return from off-screen. Paths stay above/below the main island.
- `assets/clouds/`: eight bare cloud PNGs and eight matching cloud-shaped shadow
  PNGs at native 576×256 canvas size. Original Tiny Swords cloud sheets are preserved.
  Shadows retain their original RGB (36, 42, 59), alpha (85/255), and base spacing.
  Increasing altitude moves shadows farther away, fades their opacity multiplier
  from 0.48 to a visible minimum of 0.18, and flattens their height from 72% to 12%, preserving the ground anchor.
  A square-root curve makes both changes pronounced even at low altitude.
- `scripts/cloud_visual.gd` and `shaders/cloud_layer.gdshader`: render the separate
  cloud and shadow textures. Cloud bodies use the user-annotated shadow line for ground depth
  (native texture Y for variants 01–08: 146, 148, 134, 134, 149, 144, 131, 126): trees,
  pawns and raised terrain with a greater ground Y occlude them. Altitude changes
  size, shadow offset and opacity, without overriding this order.
- `scripts/rare_cloud.gd`: a rare foreground cloud first enters after 4–7 minutes,
  then waits 6–10 minutes after leaving before another pass. Each pass varies in
  height, scale, direction, and speed.

- `Tiny Swords (Free Pack)/`: canonical artwork inside the Godot resource root;
  scenes, scripts and exports load the original pack files directly via `res://`.
  Custom cloud layers live in `assets/clouds/`; there is no dependency on Downloads or Desktop.
- `fonts/MedievalSharp.ttf`: the existing non-pack UI font, preserved separately.
  There is no separate flower asset in either downloaded pack; `Bushe4.png` is
  the supplied leafy tuft used for that detail. No invented flower art or mixed
  pack versions. Bush/rock/cloud artwork includes its supplied shading; island
  shadows and shoreline foam sit behind the grass.

The logical view is **1152×496**, matching Edenia's wide town rectangle. Godot's
`expand` stretch mode preserves the composition and reveals additional water
at different aspect ratios instead of drawing black bars. A broad water layer
extends beyond the scene. Source images retain their original names and bytes;
Downloads remain untouched. Generated `.godot` files are ignored.

## Local Edenia preview

From the repository root:

```sh
node scripts/preview-tiny-swords.mjs
```

Open **http://localhost:4183/**. This rebuilds Edenia, exports Godot for Web, and
patches only disposable `_site/index.html` to embed the game in the town image
container. The normal build/deployment does not invoke the preview script. The
header, study controls, and video section use the unchanged Edenia app. There
is no progress/data bridge. A fresh localhost browser profile has an empty feed;
this preview does not copy the live site's profile or API settings.

The preview is selected by hostname/port, not a query flag: onboarding removes
query parameters. A normal build removes the HTML patch. Generated Web files
stay in ignored `_site`. The export uses official Godot 4.7.2 single-threaded Web
templates; `GODOT_BIN` may override the default macOS executable.

After Godot edits, with the preview server already running, update only the game:

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --export-release Web
```

Refresh Edenia to load the new export.

## Game ownership and Edenia integration

All Tiny Swords game changes must be implemented in the Godot project at
`godot/tiny-swords/`. Godot owns all game mechanics, rules, interactions, visuals,
and in-game UI. Native and Edenia-integrated previews must share that implementation.

The Edenia bridge is restricted to specific areas that require Edenia integration:
passing claimed study progress into the game, exchanging layout data with Edenia
persistence, forwarding host camera commands, browser telemetry, and coordinating
browser input with Edenia page scrolling. The bridge translates data and commands;
Godot determines their gameplay effects. Any additional bridge responsibility must
have a concrete Edenia integration requirement.

Implement gameplay fixes and features in the Godot source, not in bridge scripts,
browser adapters, export builders, or generated exports. Rebuild the integrated
preview from that source after changes.

## Rebuild the integrated XP preview

The study-integrated preview at **http://localhost:8037/** uses `xp_bridge.gd`
from the repository’s `scripts/` directory. All gameplay lives in this Godot
project: terrain and inventory rules, water safeguards, build locking, click/drag
handling, camera bounds and zoom, and the 27×10 build grid. Native and integrated
previews run the same code. The bridge only adapts claimed study levels, layout
persistence, camera commands and browser telemetry; wheel forwarding belongs to
the browser adapter so it scrolls Edenia. Rebuild it from the repository root:

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
```

The builder recreates its disposable `.cache/tiny-swords-xp/project` from this
source, adds the study adapter, and checks the configured main scene and shared
gameplay suite before exporting. It never patches gameplay or grid dimensions.
Directly exporting the base Godot project into `_site/tiny-swords-xp-game`
replaces the study adapter and browser message/scroll hooks.
Use the integration builder for every update to that preview, then refresh.
The direct export command above applies to the separate base preview on port 4183.

## Checks

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/environment.gd
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/movement.gd
node scripts/verify-tiny-swords-preview.mjs
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/builder.gd
node scripts/verify-tiny-swords-builder.mjs
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/ui_layout.gd
```

Environment checks cover composition, animated foam/rocks, cloud drift, continuous
cloud coverage, and the wide-view settings. Movement checks use viewport mouse
events for arrival, redirection, facing, run-frame advancement, return to idle,
edge clamping, ignored islet clicks, falling into water, splash-frame advancement,
respawning, input locking during the sequence, and bush depth ordering. The browser check verifies root
URL/refresh, unchanged video UI, successful Web loading, and water-colored pixels
at both canvas edges at desktop and phone sizes. Screenshots are saved under
`test-results/tiny-swords-preview/`. Responsive browser checks are not physical
phone verification. Nothing is deployed.

Water interaction reference: the Particle FX animation on
https://pixelfrog-assets.itch.io/tiny-swords was inspected frame by frame. The
pawn stays upright through a short hop, then sinks and fades as the splash grows.
The one-second pause after the splash is the user-requested addition.

Builder checks cover one-time rewards, inventory conservation, pickup, undo,
JSON persistence, tree blocking, raised-ground travel, direct clear routes, smooth
elevation changes, and falling/respawning after edits. Browser checks cover the
celebration, inventory, placement, persistence through refresh, and phone rendering.

Terrain reference: https://pixelfrog-assets.itch.io/tiny-swords/devlog/1138989/tilemap-guide
Font identification by the creator: https://itch.io/t/6847515/font
Font source: https://github.com/google/fonts/tree/main/ofl/medievalsharp

Preview save version 3 migrates older layouts in place, adding one meadow
piece and two stairs once. It preserves placements and elevations, applying the automatic palette.
Version 3 also saves each stair direction. New stairs always have an upper landing.
Cloud size, shadow offset, and shadow opacity share one altitude value.
Cloud layering follows shadow ground Y independently of altitude.
The pointer is rendered by Godot with the native pointer hidden inside its canvas.
Cursors 01–03 retain their original 64px dimensions; Cursor 04 is assembled
to span one 64px grid square, then scales as a whole with the camera zoom
so its corners match the visible grid square corners. All cursors use scene
coordinates with no browser-specific enlargement, matching native Godot.
The pointer moves freely rather than snapping.

A new movement click cancels a water approach until the actual step-off begins.
Font weight is slightly strengthened to match the reference lettering. Cloud
variants retain their native relative sizes, with no common minimum width. All
eight original Clouds_01–08 images cycle through the regular cloud lanes off-screen.
Small and medium artwork stays at exactly native 1× scale and low altitude; only
the two large source images can become high foreground clouds, ranging from 1×
to 1.35×. Native means one source pixel per Godot scene unit; fitting the complete
viewport into Edenia still scales the entire scene together.
Matching shadows preserve the source spacing and move farther down with altitude.

Terrain joins follow the guide’s illustrated stair connections: the high landing
opens both its walkable rim and cliff, joined cliff faces use center pieces,
and stairs share the gold upper-floor atlas. The base floor uses the distinct
green third palette. Water rocks render below all player-built terrain.
The grid square directly below stairs (positive Y) may contain water, ground,
or another stair. Ground there can be picked up or replaced independently.
Ramps with water directly below use only the bottom 16px of the custom native-size
64×128 artwork at `assets/terrain/stair-ramp-water.png`, mirrored for rightward
climbs. The rest of the ramp retains its original palette-specific atlas artwork.
Grass and shadows continue into the 16px side joins wherever adjacent ground
receives the ramp; its bottom edge opens onto water. Ramps above ground or another
stair retain their original artwork. Placement previews use the same rule.

Elevated-ground shadows retain the guide's 128×128 sprite at native size,
centered on each 64×64 walkable tile and shifted exactly 64px downward.
Neighboring sprites overlap by 64px. Each elevation has a separate shadow
layer above the receiving floor and below characters and the casting floor.
Every solid support tier casts its footprint, including tiers underneath
higher platforms and raised stair bases. The sloped ramp adds no extra tier.

New ground has a 12.5% chance of a small decorative bush or leafy tuft, using
the pack’s existing plant sprites. Plants do not block removal or movement;
their choices persist in save version 6. Existing saves retain their plants and
receive the ground refund for previously paid stair landings once. Splashes draw above water and below solid terrain, water rocks, trees and
the pawn, so foreground shores cover overlapping splash pixels.

Cloud shadows retain the original PNG offset at minimum altitude. Higher clouds
only move their shadow farther downward and reduce its opacity.

Stair endpoints require ground at the low end and ground exactly one floor higher at the high
end. Raised terrain and stairs are Y-sorted with lower-ground characters; upper
characters render on the upper surface and return to lower depth on descent.
The build grid and placement highlight render separately above both surfaces.

## Confirmed water-fall reference

Source: [Particle FX_07.gif](https://raw.githubusercontent.com/Adriano-97/pixelImages/refs/heads/main/Particle%20FX_07.gif),
linked from the [Tiny Swords page](https://pixelfrog-assets.itch.io/tiny-swords).
The original GIF contains 32 frames at 100 ms each. User confirmed this reference.

The six opaque run poses match the imported PNG pixels exactly at native scale.
Relative to the preceding idle position, horizontal offsets are 3, 6, 15, 26,
43 and 53 pixels; vertical offsets are 0, 0, 1, -7, -7 and -1 pixels.
Splash starts at 0.5 seconds, during run pose six, centered 69 pixels outward and
3 pixels downward from the starting position. Its nine frames run at 10 fps.
The pawn covers the first two splash frames, sinks/fades at 0.6 seconds, and is
invisible at 0.7 seconds. The final visible opacity is approximated as 0.7;
GIF palette/compositing prevents claiming a pixel-identical translucent frame.
The reference's textured backdrop is not copied into the game's water.

The rightward, flat-ground reference is mirrored/adapted for other directions
and elevated shores. The requested one-second pause **after** splash completion
is retained, followed by the existing 0.25-second respawn fade. This deliberately
waits longer than the demonstration GIF. Original PNGs remain unchanged.

Focused check: `Godot --headless --path godot/tiny-swords --script tests/water_reference.gd`.
Actual rendered comparison frames: run `tests/capture_water_reference.gd` with a
renderer (without `--headless`); it uses the shared pose implementation and writes
to `test-results/tiny-swords-reference/godot/` without loading or saving a layout.

Water-click handoff: a pawn already on the chosen shoreline tile starts the
fall from its current position, instead of walking backward to the tile center.
Distant approaches still use pathfinding and remain cancellable by a newer click.
`tests/water_handoff.gd` checks immediate outward starts in all four directions.

The GIF's 100 ms cadence applies to sprite poses, not world-position updates.
Motion now interpolates between the measured key positions on every render
frame. `tests/water_pacing.gd` records actual playback without screenshot reads
and rejects sustained position holds during the jump; the original stepped
implementation held position for 12 rendered frames in native playback.

## Progression save compatibility

Save version 6 records an explicit level (1, 2 or 3). Each upgrade has an explicit
target and can be granted only once, in order. Locked version 1–5 saves remain
level one. Previously unlocked saves map to level three because they already
earned the full reward set: inventory, placements, trees and foliage are retained,
with no new progression grant. Earlier stair-landing compatibility migrations
still run where needed. Reloading a migrated save does not grant rewards again.
The existing native save path and browser key remain unchanged. Fresh editor
previews never load or write either save; the normal persistent preview still does.

`tests/progression.gd` covers both grants, retries, reloads, legacy migrations,
and placement preservation. `tests/preview_entries.gd` runs all five editor
entry points twice and checks real transitions plus save isolation.

## Edit the level-up popup visually

Open `res://scenes/level_up_popup.tscn` and select **2D**. Move and resize
**Paper**, **Ribbon**, **Title**, **Message**, and **BuildButton** directly;
edit text and Theme Overrides in the Inspector. Keep these node names so the
upgrade code can find them. The root's size defines the popup's layout bounds
and responsive fit. Artwork and button/paper styles are saved scene resources,
so their appearance is visible while editing, without running the game.

Title, Message, and BuildButton text are the level-two copy. Select the root
**LevelUpPopup** to edit the exported **Level three text** fields. Both upgrades
use this same visual layout. To test the animated popup and button behavior,
run `previews/level_one_to_two.tscn` or `previews/level_two_to_three.tscn` with
**F6**, then click **Try level 2** or **Try level 3**. Running the popup alone
shows the static design; its button is connected by the gameplay scene.

Shared gameplay regression checks (disable preview saves):

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/gameplay.gd
/Applications/Godot.app/Contents/MacOS/Godot --headless --path .cache/tiny-swords-xp/project --script res://tests/gameplay.gd
```

High ground and stair ramps cannot initiate water falls; flat shore can.
Water respawns choose uniformly among all grass tiles without trees, including
disconnected islands and every elevation; stair ramps are excluded. The pawn's
height and drawing depth match the chosen floor. `tests/random_respawn.gd`
checks selection and a complete water fall onto higher ground.

Inventory may open throughout the fall, but edits and undo wait until respawn. Depleted
ground retains 25% icon opacity while remaining selectable for free terrain
transformations; other depleted items remain disabled. Wheel and trackpad
scrolling leave the game camera unchanged; dragging pans without a gameplay click.

At a tall plateau’s front edge, two vertically adjoining high-ground tiles
form a terrace: the front tile is one floor lower, exposing the upper tile’s
grass-facing cliff above its own grass surface and single shoreline cliff.
Ground placement and save loading apply this rule without spending inventory;
stair endpoints retain their required elevations. `tests/cliff_stack.gd` checks
the four rendered squares from the reference image.

Raised grass-facing cliff and stair roots use backing from their receiving
floor, drawn before that floor’s shadows and characters. Shore foam stays
visible only through water-facing edges. `tests/cliff_terrace_roots.gd` checks
both stair orientations against the original atlas pixels.

An elevated staircase cannot be placed above an exposed cliff. The ground
directly in front of both its base and its bundled landing must reach the ramp’s
lower-end height, leaving at most one cliff beneath the landing. Flat stairs
still allow water underneath. Preview and placement
share this rule; `tests/stair_cliff_stack.gd` checks both directions and heights.

## Editing the Terrain UI in Godot

Open `res://scenes/terrain_ui.tscn` in the 2D editor. `TerrainButton` is the
collapsed launcher; `TerrainButton2/Tools` contains `GroundButton`, `StairsButton`,
`TreeButton`, `PickupButton`, and `UndoButton`. `CloseButton` sits above the panel.
The scene shows all tools for editing; gameplay controls their visibility,
counts, availability, selected underline, and launcher label.

Edit icons, AtlasTexture regions, fonts, Theme Overrides, positions,
minimum sizes, and anchor offsets in the Inspector. The bottom/right anchors
keep the UI positioned across viewport sizes. Runtime code scales the root for
the display but does not replace authored button sizes, icons, or backgrounds.
The assembled blue nine-slice textures and pickup icon are in `res://ui/terrain/`;
original pack images remain untouched. Normal and hover share a StyleBox resource;
use Make Unique when you want different styling for one state or control.
Save the scene and run the main game to test interactions; the UI scene alone
is a visual editing canvas. Rebuild the integrated preview after saving changes.

`TerrainButton2` is a Button and `Tools` is a plain Control, so each inside button
can be dragged freely in the 2D editor. Hidden tools retain their authored space.

`Tools/TallIconsClip` clips the stairs and pine at the inner top edge of the
Terrain frame. Their buttons remain freely positioned inside that Control;
other tools and the world sprites are unaffected.

Repeated-click grass elevation regression check:

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/grass_hover_options.gd
```

Visible terrace extension regression check:

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/visible_ground_extension.gd
```

## Paused soft bridge experiment

The bridge is disabled by `ENABLED = false` in `scripts/bridge_rules.gd`.
Its PNGs, level-three sandbox, placement/crossing implementation and tests
remain available for later work. While disabled, the bridge tool is hidden,
placement and crossing are unavailable, and saved bridges are not rendered.
Inactive bridges do not restrict terrain editing. If their supports change,
they return to the reserved bridge inventory; otherwise their saved placement
is preserved. The visible level-three rewards remain unchanged.

To resume the trial, switch that flag to `true`, then run
**previews/bridge_level_three.tscn** with **F6**. It starts with equally high
banks across two water squares, using the real builder and movement code.
The sandbox does not read or save your layout.

Focused checks: `res://tests/bridges_disabled.gd` verifies the default disabled
state; `res://tests/bridges.gd` opts into the experiment for its feature checks.
