# Tiny Swords — local island builder preview

## Run a specific level in Godot

Open `project.godot`, then find **res://previews/** in the FileSystem dock.
Double-click a scene below and use **Run Current Scene (F6)** (Fn+F6 if your
Mac uses the function keys for system controls):

| Scene | Starts with |
| --- | --- |
| `previews/level_one.tscn` | Fresh level-one island and pawn; building/unlock control hidden. |
| `previews/level_one_to_two.tscn` | Fresh level one. Click **Try level 2** to run the real unlock, rewards and animated ribbon, then **Start building**. |
| `previews/level_two.tscn` | Fresh intermediate level two: three ground tiles and one stair bundle; inventory open. |
| `previews/level_two_to_three.tscn` | Fresh level two. Build if desired, choose **Done**, then **Try level 3** to run the real second upgrade on that same island. |
| `previews/level_three.tscn` | Fresh level three with all cumulative rewards; inventory open, no transition required. |

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

Cumulatively this is exactly the former nine-item unlock: six ground tiles,
two stair bundles and one tree. Each stair bundle includes its upper landing;
that landing is not an additional inventory item. Upgrades preserve every
placement, decoration and the pawn position. There is no island reset. Undo
history starts a new editing session after an upgrade so it cannot revoke rewards.
The progression level is independent of terrain height: no third terrain floor is added.

The inventory has only Ground, Stairs, and Pine: height and art are automatic.
Flat ground is green; the first elevated floor is gold. A stair placed next to
flat ground creates a raised landing at its high end in the same action.
Each stair bundle includes its upper tile and uses no ground inventory. If it
replaces an existing upper tile, that plain tile returns to inventory. Picking
up a stair collects its bundled landing too; first move the pawn and any tree
off that landing. An upper landing cannot belong to two stair bundles.
Ground beside an upper floor extends that floor. Colors are not player choices. **Start building** opens the paper inventory.
Choose an item: the inventory automatically folds away. Click a grid square. **Pick up** returns a tree first, then the
ground on a second click; collected ground returns to the shared inventory.
The top-right caret hides the inventory while keeping the selected tool active, so every
square remains accessible. **Inventory** reopens it; **Done** resumes walking. Cursor 01 is used on build
controls, Cursor 04 with full-size corner pieces moved inward for valid edits, Cursor 03 for unavailable edits, and Cursor 02
for ordinary movement. The cursor follows the mouse freely; a separate subtle
grid highlight indicates the target tile. Only placement and pickup snap to cells.
**Undo** reverses changes made during the current editing session.

The pawn's current tile cannot be removed. The original bush tile can be
collected after the pawn moves away; respawn then uses another safe tile. Only the tree
trunk blocks movement; the space in front remains walkable. Paths use a finer
grid around trunks, and Y sorting draws the pawn in front when appropriate; disconnected ground becomes reachable when joined. Paths are simplified
across clear ground, keep a foot margin around water and tree trunks, and climb only along stair ramps. Raised ground is one 64px step above flat
ground; a horizontal stair square starts beside flat land and points toward
an existing or automatically created raised landing. Stairs orient automatically. Pick up stairs before their
supporting land. No third floor is offered.

The grid renderer assembles original atlas quarters according to neighbors;
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
  islet, two bushes, one leafy tuft, two water rocks, and six regular clouds plus one rare passing cloud. No buildings,
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
- `scripts/cloud_visual.gd` and `shaders/cloud_layer.gdshader`: separate original
  cloud and shadow pixels at render time. Low clouds draw behind foliage; high
  clouds draw above it, with larger shadow offsets and lower opacity.
- `scripts/rare_cloud.gd`: a rare foreground cloud first enters after 4–7 minutes,
  then waits 6–10 minutes after leaving before another pass. Each pass varies in
  height, scale, direction, and speed.
- `shaders/water.gdshader`: subtle animated reflected-light ripples only along the
  outer sides, fading to clear water across the central half, over the pack's
  original turquoise water tile. No separate reflection image was available.
- `art/environment/`: unchanged Free Pack PNG copies from `assets/tiny-swords`.
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
Cloud size, layering, shadow offset, and shadow opacity share one altitude value.
The pointer is rendered by Godot with the native pointer hidden inside its canvas.
Cursors 01–03 retain their original 64px dimensions; Cursor 04 has unscaled
corner pieces separated to span one 64px grid square. All cursors use scene
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

New ground has a 12.5% chance of a small decorative bush or leafy tuft, using
the pack’s existing plant sprites. Plants do not block removal or movement;
their choices persist in save version 6. Existing saves retain their plants and
receive the ground refund for previously paid stair landings once. Splashes
share the World Y-sort layer with trees and the pawn, so foreground trees
occlude splashes behind them.

Cloud shadows retain the original PNG offset at minimum altitude. Higher clouds
only move their shadow farther downward and reduce its opacity.

Stair endpoints require flat ground at the low end and raised ground at the high
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
