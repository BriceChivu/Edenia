# Tiny Swords — local island builder preview

Open `project.godot` in Godot 4.7, then **F5 / Play Project**.
The default scene is now `scenes/level_two_preview.tscn`, which inherits the preserved
level-one environment. **Try level 2** simulates the unlock locally: a celebratory
ribbon grants exactly five terrain pieces (meadow, golden, teal, raised meadow,
raised golden) and one pine tree. **Start building** opens the paper inventory.
Choose an item: the inventory automatically folds away. Click a grid square. **Pick up** returns a tree first, then the
ground on a second click; terrain retains its color and elevation in inventory.
**Fold** hides the inventory while keeping the selected tool active, so every
square remains accessible. **Inventory** reopens it; **Done** resumes walking. Cursor 01 is used on build
controls, Cursor 04 with full-size corner pieces moved inward to fit one tile for valid edits, Cursor 03 for unavailable edits, and Cursor 02
for ordinary movement.
**Undo** reverses changes made during the current editing session.

The home tile and pawn's current tile cannot be removed or planted. Trees block
movement; disconnected ground becomes reachable when joined. Paths are simplified
across clear ground, keep a foot margin around water and tree cells, and blend
height changes at raised edges. Raised tiles use a gentle automatic step-up for
this prototype; separate stairs and climbing animations are not implemented.

The grid renderer assembles original atlas quarters according to neighbors;
shore foam and cliffs follow the editable layout. Paper and button nine-slice
patches and ribbon segments are assembled from the pack's separated source pieces.
Original PNGs are not edited. Five terrain colors remain available in source art;
the starter reward uses three of them.

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
  once on impact at the source pack’s documented 10 fps. No dedicated falling frames were found in the supplied pawn
  exports or its editable source tags, so the existing pawn art is animated in a small upright hop off the edge
  and faded into the splash rather than introducing a different character.
- `World` uses Y sorting: foliage is anchored at its base so it covers the pawn
  when he moves behind it, and the pawn draws in front when he moves below it.
- `scripts/environment_sprite.gd`: gently staggered foam, rock, and foliage frames.
- `scripts/cloud.gd`: six clouds moving slowly at individual speeds. Size, height, and speed
  vary when they return from off-screen. Paths stay above/below the main island.
- `scripts/cloud_visual.gd` and `shaders/cloud_layer.gdshader`: separate original
  cloud and shadow pixels at render time. Low clouds draw behind foliage; high
  clouds draw above it, with larger shadow offsets and lower opacity.
- `scripts/rare_cloud.gd`: a small foreground cloud first enters after 4–7 minutes,
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
