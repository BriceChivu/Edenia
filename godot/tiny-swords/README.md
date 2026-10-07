# Tiny Swords — local island builder preview

## Run a specific level in Godot

Open `project.godot`, then find **res://previews/** in the FileSystem dock.
Double-click a scene below and use **Run Current Scene (F6)** (Fn+F6 if your
Mac uses the function keys for system controls):

| Scene | Starts with |
| --- | --- |
| `previews/level_one.tscn` | Fresh level-one island and pawn; building/unlock control hidden. |
| `previews/level_one_to_two.tscn` | Fresh level one. Click **Playground → Level +1** to run the real unlock, rewards and animated ribbon, then **Start building**. |
| `previews/level_two.tscn` | Fresh intermediate level two: three ground tiles, one stair bundle and one chicken; toolbar open. |
| `previews/level_two_to_three.tscn` | Fresh level two. Build if desired, choose **Done**, then **Playground → Level +1** to run the real second upgrade on that same island. |
| `previews/level_three_to_four.tscn` | Fresh level three. Choose **Playground → Level +1** to preview the next popup. |
| `previews/level_four.tscn` | Fresh level four with one additional shared tree item and three additional grass tiles. |
| `previews/level_three.tscn` | Fresh level three with all active cumulative rewards; toolbar open, no transition required. |
| `previews/bridge_level_three.tscn` | Retained bridge sandbox; the bridge experiment is currently disabled. |

These are thin inherited scenes using the same world, movement and builder code.
Every F6 run starts fresh: these entries neither load nor save native or browser
preview layouts. Changes made while testing are discarded when you stop the run.
Each transition grants its own rewards only once per run. Existing saved layouts remain intact.

**F5 / Play Project** still runs the existing persistent local preview described
below; use **F6** to test whichever named scene you opened.

## Persistent local preview

Fresh islands show only ocean and clouds with a centered **Start** button using
the level-up confirmation artwork. Start reveals the level-one terrain immediately;
one second later the shared tree-cut dust animation reveals the pawn. Walking,
building and study-level celebrations wait until the dust finishes. The versioned
island snapshot also carries `island_started`: pending islands retain Start across
reloads, while started islands and older saved islands resume directly. Fresh F6
level previews remain ready for gameplay. Focused check: `res://tests/island_arrival.gd`.

Open `project.godot` in Godot 4.7, then **F5 / Play Project**.
The default scene is now `scenes/level_two_preview.tscn`, which inherits the preserved
level-one environment. **Playground → Level +1**, then **Playground → Level +1** (outside build mode),
simulate the two local upgrades using the same reward and celebration code:

| Upgrade | Newly granted inventory | Item count |
| --- | --- | --- |
| Level 1 → 2 | 3 ground tiles + 1 stair bundle + 1 chicken | 5 |
| Level 2 → 3 | 3 ground tiles + 1 stair bundle + 1 pine tree | 5 |
| Level 3 → 4 | 3 ground tiles + 1 tree | 4 |

Godot owns XP thresholds **0 / 15 / 45 / 90 / 150 / 225 / 315 / 420 / 540 / 675**.
The existing curve is `15 × level × (level − 1) / 2` total XP: each upgrade costs
15 XP more than the previous one. Levels six through ten each grant three new
grass tiles; level six also grants a third tree, level seven grants a second chicken, and level eight grants a second sheep and a fourth tree. They share the grass reward popup. Save version 32 adds the level-eight tree once to existing level-eight-or-higher islands. Fresh editor scenes
`previews/level_six.tscn` through `previews/level_ten.tscn` start at those levels;
choose **Done**, then **Playground → Level +1** to preview the next upgrade.
Its editable popup is `scenes/level_four_popup.tscn`, including `assets/ui/axe_level_up.png`.
The axe unlocks tree cutting at level four; the inventory rewards are the three grass tiles and shared tree.
The level-three tree icon represents all four tree atlases. Each placement randomly
chooses a variant in advance, so the hover preview matches the placed tree.
After placement, the next preview randomly chooses one of the other three types.
The pending variant stays fixed until a successful placement and is saved with
the layout, including undo. Clicking a placed tree while the inventory is open cycles through
all four variants for free, skipping variants whose roots would overlap a house.
Hover and click choose the same next fitting variant. The tool stays available even with zero tree stock.
Saves and undo retain the chosen variant. Picking it up returns one
shared tree item. Save version 15 also migrates the earlier separate tree inventory.

From level four, hovering a standing tree outside build mode shows `Tool_02`.
Click it to briefly equip `Pawn_Idle Axe`, approach with `Pawn_Run Axe`, and
cut with `Pawn_Interact Axe`. Every tree needs 10 seconds of active cutting and gives one log.
These timers are minimums: cutting finishes only when the current axe swing ends.
The tree stays standing and wood is awarded at that animation boundary; regrowth
also starts then, including after returning from a suspended preview.
Standing trees animate at 10 fps. Each axe swipe bends the targeted tree away
from the pawn on the third pose, then rebounds on the fourth. Four alternating
strike strengths repeat with the eight ambient tree poses every 2.4 seconds;
right-side chopping mirrors the reaction. Roots stay anchored and the clipped
ground shadow does not rotate. The motion uses the website's measured rotation
as a close reproduction; it is not certified pixel-identical to its GIF.
Completed trees fade out over 0.2 seconds while Dust_01 and Dust_02 play once
at the trunk, revealing their matching static Stump PNG. Every tree regrows after
five minutes, including time while the preview
is closed. The same variant returns at its planted position.

Switching tabs or apps continues the cutting countdown; suspended frames catch up
when the preview resumes. Clicking another standing tree queues it after the current
tree, in click order; repeated clicks do not add duplicates or restart cutting.
The pawn cuts queued trees automatically and accumulates their logs. Removed or
unreachable queued trees are skipped. Walking elsewhere cancels the queue and
pauses cutting; clicking the tree resumes its saved progress. Opening Terrain pauses the current axe action and its countdown, preserving
the target, queued trees and partial work. Closing Terrain resumes the same action;
time spent in inventory does not count toward cutting. The pending queue lasts for the current preview session. Partly cut standing trees can be picked up, discarding their cutting progress
without awarding wood. They cannot be cycled; stumps cannot be picked up or
cycled until the tree completes regrowth. Save version 17 retains carried wood and deposited log piles, as well as cutting progress,
regrowth deadlines and `resources.wood`, independently of the build inventory.
The inventory UI is unchanged. Fresh F6 previews still discard their state.

After cutting, the pawn uses the pack’s Wood idle/run PNGs while carrying the
harvest. Click grass free of trees, stumps, bushes, rocks and
other decorations to deliver the harvest; logs appear only after arrival.
Existing piles fill up to six logs, arranged bottom-up in rows of three, two
and one. Any remaining carried logs are delivered automatically to the nearest
reachable grass tile with room and no decorations; if none is available, the
pawn keeps them. A two-log pile is centered side by side.
A new click or opening Terrain cancels delivery without losing the carried logs. Carrying and piles
persist across reloads; ground with logs cannot be collected or built over.
Logs block the annotated parallelogram where their bottom row contacts the grass.
Navigation reserves the ground contact of both soles across walking poses and checks
the entire movement segment. Raised boot artwork does not add ground padding,
so reachable grass along the left side stays accessible. The pile sorts from the contact patch's bottom edge on its left
side and top edge on its right side, with a continuous depth transition between
them. Upper rows do not enlarge the footprint; depth changes keep the artwork fixed.
Focused checks: `res://tests/log_navigation.gd` and `res://tests/log_contact_depth.gd`.
Focused check: `res://tests/log_delivery.gd`.
Focused check: `Godot --headless --path godot/tiny-swords --script res://tests/tree_harvesting.gd`.

The active inventory grants ten items: six ground tiles,
two stair bundles, one tree and one chicken. Each stair bundle includes its upper landing;
that landing is not an additional inventory item. Upgrades preserve every
placement, decoration and the pawn position. There is no island reset. Undo
history starts a new editing session after an upgrade so it cannot revoke rewards.
The progression level is independent of terrain height: terrain floors are created by stairs.

Solid terrain reserves its ground contact on every floor. Movement checks the
feet against neighbouring floor heights, including stair slopes; an actor's
anchor staying on grass does not let its feet penetrate a cliff. Trees, logs,
and house foundations use the same terrain-contact boundary for their roots
and bases. Terrain edits preserve neighbouring contacts, and animals recheck
terrain while executing routes, including house displacement. Older saved
contacts that protrude into a cliff settle within the same owning tile; an
item with no safe fit returns to inventory. Existing valid contacts stay fixed.
Focused check: `res://tests/terrain_solid_contacts.gd` (both directions, three
receiving elevations, movement, placement in both orders, and save/load).


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
The collapsed launcher uses the pack’s cogwheel PNG (`Icons/Icon_10.png`) at 36px wide without a button background.
The expanded panel uses native-scale assembled nine-slice artwork;
fixed 16px corners retain the source pixels and the middle/edges tile to fit. Pickup uses a compact four-corner icon; the collapsed
control is a 45×45 icon button anchored 4px from the right and bottom; the expanded strip is 180×44 with five 32×32
hit targets, at both desktop and phone widths. The expanded strip remains anchored 14px from the
right and bottom. Celebration buttons and game cursors retain their existing scale.

Ground, stairs and pine are image-only choices, with no title or individual
button backgrounds. Small bottom-right ×N counters show remaining ground, stairs
and pine. Opening the inventory clears tool selection. A small underline marks a tool only
after it is chosen; faded artwork is unavailable. While the inventory is open with no tool selected,
objects with a valid next change have a soft white two-pixel outline: tree types,
house facings, staircase directions, and grass elevations. Hovering previews that
next change at the existing anchor, hiding the hovered tree or house's outline;
clicking applies it without selecting an
inventory button. Selecting any tool hides these outlines and uses its normal
preview. Pickup retains its own preview. Protected objects do not offer
a change, and closing the inventory removes the outlines and previews.

Tree and house silhouette borders are imported assets, including all eight tree
poses and the three unique house textures. Inventory drawing loads them without
reading sprite pixels or generating textures on first use. Native and Web previews
use the same borders and preserve the existing positions, tint and mirroring.
After changing source artwork or border rules, regenerate and import them:

```sh
godot --headless --path godot/tiny-swords --script res://tools/generate_inventory_outlines.gd
godot --headless --path godot/tiny-swords --editor --import
godot --headless --path godot/tiny-swords --script res://tests/inventory_outline_assets.gd
```

Run these commands from the repository root with Godot 4.7.2 (or use the full
path to that executable). Commit the generated PNGs, import settings and
`scripts/inventory_outline_assets.gd`. The integration build checks source
fingerprints and compares every imported border against the original algorithm;
stale or changed borders fail the build. Offline tools are excluded from Web
exports. Clouds and their shadows are hidden while the inventory is open,
including the rare passing cloud, and return when the inventory closes. The pawn
also hides while the inventory is open and returns when it closes; its current
movement and work continue.

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
Tree and house previews follow the pointer freely, like the grass preview.
Clicking a tree clamps its planted anchor to these safe root margins; clicking
a house uses the selected grid footprint. Water, protected squares,
stairs, and positions overlapping the pawn remain unavailable.
The moving preview and placed tree share the same artwork anchor; navigation
and Y sorting follow the placed trunk. The movement obstacle follows the visible
roots, so the pawn can walk onto the grass immediately below them, including
near a square's front edge. Trees can share house foundation tiles when their root contact polygon clears
the house’s current ground contact polygon; canopy and roof overlap is allowed.
Tree variant changes and house rotations must also keep those contacts clear.
Collect trees from a house’s free foundation grass before picking up that house.
Trees coexist with existing foliage and
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
an existing or automatically created raised landing. Stairs orient automatically. With the Stairs tool selected, click an existing staircase
to reverse it when both endpoints are clear and terrain supports the opposite direction.
Reversing swaps the foot and landing heights without spending inventory. Pick up stairs before their
supporting land. No third floor is offered.

The grid renderer selects the guide’s sixteen complete 64×64 ground pieces
according to neighbors, including the dedicated narrow and isolated pieces;
shore foam, automatic shadows, and land-facing versus water-facing cliffs follow
the editable layout. Foam frames are staggered between cells. Paper and button nine-slice
patches and ribbon segments are assembled from the pack's separated source pieces.
Medieval Sharp is inherited by Latin game UI text; Chinese uses bundled Noto subsets. Original PNGs are not edited. Five terrain colors remain available in source art;
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
  Mask copies synchronize the current sprite sheet dimensions before its frame,
  including sheep transitions between idle, grazing and running sheets.
  Visual revisions are shared between clouds at pre-draw; each cloud retains its
  own candidate set and depth texture. Changed masks render again on the following
  frame to include queued canvas redraws, then sleep until their inputs change.
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
patches only disposable `_site/index.html` to embed the game in the island
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
persistence, forwarding host camera commands, browser telemetry, relaying host
viewport/page visibility, and coordinating browser input with Edenia page scrolling.
The bridge translates data and commands;
Godot determines their gameplay effects. Any additional bridge responsibility must
have a concrete Edenia integration requirement.

Implement gameplay fixes and features in the Godot source, not in bridge scripts,
browser adapters, export builders, or generated exports. Rebuild the integrated
preview from that source after changes.

### Web asset delivery

The integrated builder publishes the unchanged engine binary at
`tiny-swords-engine/<engine-sha256>/index.wasm`, independently of the game's
release directory. Pack, UI, locale and adapter changes retain that URL; changing
the engine bytes changes it. The decoder has its own content hash too. The local
server marks those immutable directories cacheable; GitHub Pages uses its own
HTTP cache policy and can revalidate the same engine URL across game releases.
The worker also keeps one validated opaque compressed engine in its own
`edenia-tiny-swords-engine-v1` Cache API cache (about 7 MB). Older engine entries
are evicted after a successful replacement. Storage failures leave loading usable;
learner profiles and backups never enter this disposable cache.

Engine and pack have quality-11 Brotli artifacts. The integration requests their
explicit `.br` URLs, so GitHub Pages does not need custom Content-Encoding headers.
A bounded streaming worker decodes them with native Brotli when available, or the
pinned `brotli-dec-wasm` decoder otherwise. Godot still initializes the engine,
loads the pack and owns gameplay. Missing compressed files or decoder support
fall back to the ordinary HTTP-compressed URLs. Invalid/truncated streams report
startup failure through the existing retry surface; accepted restoration still
gates writes. Learner-profile fields and their storage keys stay unchanged. The decoder's MIT
notice is included in every release. Coverage: `tiny-swords-delivery.spec.mjs` and
`tests/contracts/tiny-swords-delivery.test.mjs` at the repository root.

The exported Godot download callback forwards byte progress to Edenia's loading
bar. The fill grows only from left to right and never animates back and forth.
It starts empty, follows completed download bytes, and holds at 99% during
preparation until Godot accepts the saved-island restoration. Only accepted
restoration completes the bar. The visible copy is “Preparing your island...”
with no time estimate. Retry resets progress; failure hides the bar.
No gameplay or restore decisions move into the host UI.

## Island persistence in the local Edenia integration

The explicit localhost:8037 build stores Godot's versioned snapshot in the active
learner profile's `tinySwordsIsland` field. Portable export/import and existing
backup restore and reset/Undo carry it with study state. New or imported profiles
without an island start fresh using their retained study progression. Native F5
saves and fresh F6 preview behavior remain as described above.

Edenia is the only durable writer for this integration. Godot acknowledges restore
acceptance; Edenia acknowledges each save only after profile persistence succeeds.
A rejected restore blocks island saves and retains the original input. Edenia bounds
transport to 512 KiB and leaves gameplay validation and save migrations to Godot.
Animal checkpoints skip whole-profile backups and analytics. Camera settings remain
local to the device; selection, action queues and game undo history are transient.

Accountless profiles already using Edenia's opt-in IndexedDB repository write
island checkpoints through a small versioned profile head. The first checkpoint
splits the stored profile into that head and an immutable body; subsequent island
writes and cross-tab island refreshes touch only the head. Ordinary profile saves
update both atomically. Full reads, portable exports and recovery backups compose
the latest island into the profile. Checkpoints share the profile revision queue,
durable readback and access fences; failed acknowledgments restore only their exact
head and retain newer writers. The legacy localStorage and signed-in lifecycle
paths retain their existing behavior and costs; storage rollout flags are unchanged.

Import, backup restore and reset replace the iframe, clearing transient actions.
Study-history Undo can lower current XP, but never revokes an already claimed
level, inventory reward or placement. Reset starts a new island and clears claims;
explicit import and backup restore replace both from the chosen profile. Anki
counter rollbacks retain earned XP. Legacy study facts remain preserved and
unmarked for new XP; old `townEconomy` data stays intact without granting logs or
game rewards.

The site build generates all ten host thresholds from Godot before profile
normalization. The integration reads claimed progress from durable application
state. A failed claim save publishes no new level. Godot catches up sequentially
from the saved island level, ignoring the sandbox's manual-progression flag for
active profile claims. Each unlock's single Godot celebration waits for Edenia's
durable island-save acknowledgment; failed saves retry while the game is running.

Messages must come from that frame and its current session; each save also checks
that the active and durable island still match the frame's predecessor. Another
tab's island change replaces this tab's frame rather than combining islands.
Only a legacy integrated developer snapshot can transfer into an older profile
that has never stored an island field, and its source is removed only after an
accepted restore and successful profile save. Reset profiles explicitly store
`null`, preventing legacy preview data from resurrecting an island.

The host reports whether the island intersects the viewport and whether the page
is visible. Godot suspends its web engine loop and audio while fully offscreen,
keeping the scene and elapsed-time action clocks alive for resume. Partial visibility resumes
the same iframe. The single-threaded web runtime pause/resume and keepalive hooks
must be verified with the offscreen diagnostic gate after engine upgrades.

The ordinary site build now includes the integrated export, with game mounting
disabled by default. Auth remains paused; deployment and public enablement are
deferred. See the reproducible build instructions below.

## Reproducible export and production build preparation

From the repository root, use Node from `.nvmrc` and official **Godot 4.7.2**
with its matching single-threaded Web export templates. Linux x64 CI and Pages
builds run the shared checksum-verified installer:

```sh
npm ci
npm run setup:godot
npm run build
```

On macOS, an existing official Godot 4.7.2 installation with matching templates
works automatically at `/Applications/Godot.app/Contents/MacOS/Godot`, or set
`GODOT_BIN` to the executable. The builder rejects a different engine version.
CI imports a fresh copy without `.godot`; no Downloads/Desktop paths are needed.
Only the official Linux editor and the two matching Web templates are installed.

`npm run build` packages both experiences with **game mounting off**. Ordinary
visits, `internal_test=1`, unsupported values and sandbox retain the existing
production town, timeline, onboarding and scoring. The checked-in source overlay
in `compat/production/` preserves that implementation; builds require no Git
history. Page selection runs before either experience's markup is parsed, so
ordinary visits request no game adapter, iframe, engine, WASM or asset pack.

### Mode 2 tester release

The tester link is `https://www.edenia.study/?internal_test=2`. This is an
unadvertised mode: anyone who knows the URL can use it. It introduces no login
flow, and internal Auth stays paused. Mode 2 does not activate mode 1 account
experiments, even if the account rollout control is set to internal or public.

Set `EDENIA_TINY_SWORDS_ENABLED=true` for a tester-capable build (or
`tinySwordsEnabled: true` in local runtime config). The same switch is read by
`npm run build:production`. For a future Pages release, set the repository
variable `EDENIA_TINY_SWORDS_ENABLED` to `true`; unset or `false` disables game
mounting. The workflow defaults to off. This implementation does not deploy or
change that repository variable. The control applies only to mode 2 and the
existing dedicated localhost:8037 developer preview, never ordinary visitors.
Playground remains restricted to its existing developer origin.

Onboarding, URL cleanup and refresh retain `internal_test=2`. Mode 2 stores its
learner profile and island under `edenia_v1_internal_test_2`, its config cookie
under `edenia_config_internal_test_2`, and its caches/drafts/backups under the
same mode-specific namespace. IndexedDB profile and backup databases are
separate too. Availability does not affect these keys. No other mode's profile,
legacy developer island or legacy-origin progress migrates automatically.
Use Settings → Export sync file in the source mode, then Settings → Import sync
file in mode 2 to seed the tester's portable profile deliberately.

Remove `internal_test=2` from the URL or open `https://www.edenia.study/` to return
to normal Edenia. Each mode resumes its own progress. Disabling the switch keeps
the tester's study UI usable and displays unavailable-island feedback; saved
islands remain intact. Re-enable and refresh to restore the same island. A
public Tiny Swords rollout requires a separate release decision.

The generated directory is `_site/tiny-swords-game/<sha256>/`. Parent adapter,
iframe HTML/transport, engine JS/WASM, game PCK, cursor and notices share a hash
of their actual delivery bytes. The parent resolves assets relative to its own
script URL; engine assets resolve beside the iframe. Old cached releases cannot
load new assets under their old URLs. A removed old release can fail to load,
so the unavailable-island surface stays visible without reviving the town
snapshot timeline. The existing root `release.json` still identifies Edenia's
app/config release; game `release.json` records its own version and engine pin.

Locally validate the intended project-site base path with disposable browser
profiles (the fixtures include a populated island):

```sh
EDENIA_TINY_SWORDS_ENABLED=true npm run build
EDENIA_TEST_TINY_SWORDS=true EDENIA_TEST_NORMAL_PORT=4174 EDENIA_TEST_BASE_PATH=/Edenia/ \
  npx playwright test experience-tiny-swords.spec.mjs tiny-swords-release.spec.mjs tiny-swords-tester-mode.spec.mjs tiny-swords-dashboard.spec.mjs tiny-swords-copy.spec.mjs tiny-swords-page-scroll.spec.mjs tiny-swords-acceptance.spec.mjs \
  --project=desktop-standard --project=phone-standard
```

The required CI job uses these commands against the real export. An absent game
frame fails; only the unrelated ordinary browser suite excludes these flows.
The release smoke verifies JS/WASM/PCK and notice paths, matching version URLs,
and disable/re-enable without losing the existing island or study facts.
Persistence/progression flows reuse #375/#376 coverage, including delayed startup,
failed claim writes, reloads, profile replacement and rejected snapshots.

For the local fallback, set `EDENIA_TINY_SWORDS_ENABLED=false` and rebuild, or
set `tinySwordsEnabled: false` in your ignored local config when using `npm run dev`.
Refresh the same browser origin: study features remain usable, the saved island
is retained, and the game area displays “Island is currently unavailable.”
Re-enable the same control and refresh to restore that island. The control changes
presentation only; it does not clear profiles, claims, island data or backups.
The automated smoke tests this exact sequence locally without any hosted writes.

The raw `assets/tiny-swords` directory is excluded from hosting. The game's
`notices/` directory carries engine/third-party licenses, the MedievalSharp and Noto OFLs,
and [asset provenance](../../assets/tiny-swords/README.md). Tests, editor preview
entries and obsolete raw chicken reference frames are excluded from the PCK.

## Rebuild the integrated XP preview

At **http://localhost:8037/**, the plain **Playground** button at the top-right
opens local testing controls implemented in Godot. **Level +1** runs the normal
upgrade and reward popup without watching a video; it changes only the game level,
not study XP. **Random terrain** replaces the island with seeded connected land,
valid stair terraces and unlocked trees/animals using owned placed pieces plus
remaining inventory. Houses return their logs, and harvested wood is retained.
The seed appears in the panel. It grants no extra items and leaves items in
inventory when no valid placement fits. **+ Supplies** adds
grass, stairs and any unlocked trees/animals. **6 house logs** reserves a bundle
and opens the normal house placement workflow from level five. **Fresh island**
returns to level one with starting terrain and pawn position, clearing inventory,
resources, placements and unlocks. Fresh islands use manual Playground level
control instead of automatically reapplying study levels, including after reload.
The saved checkpoint remains available for explicit restore.

**Level −1** selects the previous level for popup testing, down to level one.
The island and all unlocked items/abilities stay intact. **Level +1** then replays
the matching real popup without granting those rewards again. Levels above the
highest unlock still grant their normal rewards. This popup preview selection
lasts until reload and is included in saved checkpoints.

The first test action automatically captures a checkpoint. **Save checkpoint**
replaces it explicitly, and **Restore checkpoint** returns the island, inventory,
level and pawn to that point. Checkpoints persist through refresh and localhost restarts in the existing local
profile save, including the pawn position and popup preview selection. Controls wait for successful profile restore and
pause during upgrades, construction and water falls. They are enabled only by the
local integration on port 8037 and are absent from normal game builds.
Testing supplies and random terrain use version-24 snapshots with an explicit
extra-item ledger, so save validation retains inventory accounting after reload,
upgrades and undo. Ordinary snapshots retain their existing version.

Focused check: `Godot --headless --path godot/tiny-swords --script res://tests/playground.gd`.

At `http://localhost:8037/`, map edits save immediately in browser storage.
Refreshing retains terrain, decorations, tree variants, inventory, harvested wood,
cutting progress, regrowth deadlines and the saved preview level, even if the
host study level is lower. Camera position and zoom also persist. These saves
belong to this browser and origin; fresh F6 scenes remain disposable.

The study-integrated preview at **http://localhost:8037/** uses `xp_bridge.gd`
from the repository’s `scripts/` directory. All gameplay lives in this Godot
project: terrain and inventory rules, water safeguards, build locking, click/drag
handling, camera bounds and zoom, and the 37×20 build grid. Native and integrated
previews run the same code. The bridge only adapts claimed study levels, layout
persistence, camera commands and browser telemetry; wheel forwarding belongs to
the browser adapter so it scrolls Edenia. Rebuild it from the repository root:

```sh
node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
```

The command rebuilds the complete site. Its shared exporter recreates disposable
`.cache/tiny-swords-xp/project` from this source, adds the study adapter, and checks
the configured main scene, shared gameplay suite and progression before exporting. It never patches gameplay or grid dimensions.
It also prepares Brotli/gzip WASM, asset-pack and engine-script variants. The
static server negotiates current compressed variants while retaining the
original MIME type. GitHub Pages may serve the originals; no compressed-only
URLs or special response headers are required by this single-threaded export.
Directly exporting the base Godot project bypasses the study adapter and browser
message/scroll hooks; keep it separate from the versioned integrated directory.
Use the integration builder for every update to that preview, then refresh.
The direct export command above applies to the separate base preview on port 4183.

## Checks

Terrain retains static draw commands and sorted base cells until geometry changes;
foam is a separate canvas item advancing at the authored 5 fps. Editor overlays
still follow pointer and eligibility changes. Cloud-depth, terrain-transform and
outline-render checks cover retained geometry and visible depth/preview behavior.

The shared Godot web rendering policy limits the backing canvas to a pixel ratio
of two while retaining `canvas_items` scaling and fractional pointer movement.
Native rendering is unchanged. Project settings `edenia/web/max_pixel_ratio`
and `edenia/web/frame_interval` default to `2.0` and `1`; the latter is an
asynchronous RAF divisor for the current single-threaded export, with guarded
fallback for unsupported templates. Divisor two is available for testing but
showed no clear CPU saving on the M3. Keep `Engine.max_fps` at zero on web.
Physical-device startup, battery, memory and long suspension checks remain
required; the runnable protocol is in
`scripts/diagnostics/tiny-swords-performance/README.md` at the repository root.

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless --path godot/tiny-swords --script res://tests/environment.gd
/Applications/Godot.app/Contents/MacOS/Godot --path godot/tiny-swords --script res://tests/cloud_depth.gd
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
The pointer moves freely rather than snapping, and remains visible during placement
alongside the grid-aligned terrain preview.
Leaving the game window or losing focus immediately hides the drawn cursor.
Inactive native windows leave the pointer to macOS; returning focus restores
the hidden system pointer and the game cursor. Web canvases still support
hovering without keyboard focus.
Focused check: `Godot --path godot/tiny-swords --script res://tests/pointer_visibility.gd`
(also runs headless, except for the system-pointer assertion).

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
Staircase depth follows its sloped back grass edge at the pawn’s X position.
Off-ramp pawns behind that edge are covered; those in front remain visible,
as do pawns walking on the ramp. Solid landings sort at their near edge so a
lower-floor pawn approaching an adjacent tree stays behind the cliff rather than
appearing on its upper grass. The real tree-cutting route is covered by
`res://tests/tree_approach_cliff_depth.gd`. Pixel regression: `res://tests/stair_edge_depth.gd` (run with a renderer).
The build grid and placement highlight render separately above both surfaces.
TerrainDepth orders each pawn, sheep and chicken against every overlapping ramp
and raised ground piece. Ramp ordering preserves the adjoining cliff relation,
including after restoration or edits change tile insertion order. This prevents
lower-floor animals behind a landing from appearing on its upper surface.
Checks: `res://tests/terrain_depth_order.gd` and
`res://tests/stair_floor_routes.gd` run headless; `res://tests/animal_terrain_depth.gd`
runs with a renderer and covers both ramp/landing insertion orders.

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
**Paper**, **Ribbon**, **Title**, and **BuildButton** directly;
edit artwork and Theme Overrides in the Inspector. Keep these node names so the
upgrade code can find them. The root's size defines the popup's layout bounds
and responsive fit. Artwork and button/paper styles are saved scene resources,
so their appearance is visible while editing, without running the game.

Runtime Title and BuildButton text come from `i18n/` through `GameCopy`. Reward
icons share this visual layout across levels. Phone fitting scales the paper and
keeps title/confirmation text readable. To test the animated popup and button behavior,
run `previews/level_one_to_two.tscn` or `previews/level_two_to_three.tscn` with
**F6**, then click **Playground → Level +1** or **Playground → Level +1**. Running the popup alone
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

Inventory stays usable while the pawn walks, builds a house, cuts a tree, or falls
in water. Tool selection, placement, pickup, transformations, and undo remain
available. Unrelated edits preserve ongoing work; removing or undoing its target
ends that work. Respawn rechecks its chosen tile after inventory edits. Depleted
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
directly in front of its lower entrance, ramp and bundled landing must reach the
ramp’s lower-end height, leaving at most one cliff beneath the landing. Reversal
checks its new lower entrance too. Supporting grass cannot be picked up or lowered
while the staircase needs it. Flat stairs still allow water underneath. Preview
and placement share this rule; `tests/stair_cliff_stack.gd` checks both directions,
heights, reversal and support edits.

## Editing the Terrain UI in Godot

Open `res://scenes/terrain_ui.tscn` in the 2D editor. `TerrainButton` is the
collapsed launcher; `TerrainButton2/Tools` contains `GroundButton`, `StairsButton`,
`TreeButton`, `PickupButton`, and `UndoButton`. `CloseButton` sits above the panel.
The scene shows all tools for editing; gameplay controls their visibility,
counts, availability, selected underline, and launcher tooltip/accessibility name.

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

## Level five: sheep and houses

Level five grants **3 grass tiles**, **1 placeable sheep**, and the **House** capability.
Sheep may be placed on grass at either end of stairs; the ramp itself stays unavailable for placement.
It uses the continuing XP curve: **150 total XP** (60 after level four).
Open `previews/level_four_to_five.tscn` for the reward transition or
`previews/level_five.tscn` for a fresh build session.

Sheep and chickens start with separate animation phases. Each additional animal
has a slightly longer idle interval, and its idle/run clock continues through
movement and grazing resets so pairs do not animate in lockstep.
Trees use stable per-cell offsets for their ambient loops; axe reactions still
follow the pawn's cutting poses.
The sheep alternates a base 2.4 seconds of idle with one complete 1.2-second
`Sheep_Grass.png` grazing animation. After a random 10–15 complete grazing
animations, it tries to walk to a random reachable adjacent grass tile,
passing through bushes and rocks and using connected stair ramps between
elevations. Trees, log piles, and houses block their ground contact areas;
the surrounding ground remains usable even within an occupied tile. Sheep
route around these contacts and avoid the pawn’s tile.
If no tile is eligible, it stays and starts another random grazing count.
Elapsed clock time counts grazing and movement while the Tiny Swords viewport
is hidden or another browser tab is active; suspended frames catch up on return.
Building still pauses movement, retaining completed grazing until it closes.
Focused checks: `res://tests/sheep_grazing.gd` and
`res://tests/sheep_object_navigation.gd`.
When the pawn enters its grass tile, it runs opposite the pawn's approach,
choosing a safe route of 3–5 tile steps. Routes can use stairs and turn
around obstacles; the initial step prefers the direction opposite the approach.
If only two or one tiles are available in that direction, it uses that distance.
It tries sideways routes next and only runs toward the approach when no other
escape is available, then returns to idle. It stays
on the island; with no safe escape tile it waits. Sheep movement pauses while
building. Pick up the sheep to return its one inventory item.

Each new house costs **6 harvested logs**. Clicking a full six-log pyramid
sends the pawn to it. Only on arrival does the pyramid disappear instantly;
one carried log represents the reserved six-log bundle. House placement keeps
the inventory closed and the pawn visible, using the same free pointer preview
and foundation checks. Opening inventory manually pauses this preview; closing
it resumes choosing the site. Press **Escape** while
choosing a house site or carrying the bundle toward it to cancel: the pawn walks
back and restores the six-log pyramid at its original location. Save version 29
retains that location across reloads. Older saves without an origin, or an origin
removed or blocked by terrain edits, use nearby reachable clear grass.
Focused check: `res://tests/house_cancel.gd`. The pawn keeps the
log while the user chooses a house preview position and while approaching it.
On arrival at a reachable site, the side-view house appears at **50% opacity**.
The pawn uses the original three-frame `Pawn_Interact Hammer.png` at **10 fps**,
repeating for **20 seconds**. Every impact briefly widens and compresses the
house about its fixed base; recovery restores its shape. Opacity increases
linearly to **100% at 20 seconds**. The pawn works beside the front-left door,
using the website's 81px horizontal / 68px vertical offset when the ground
allows it, with a closer approach on narrow foundations. Both soles must stay
on grass at the house's floor level; a reachable lower terrace cannot serve as
the work spot. Older construction saves move the worker onto that same floor
when resumed. `tests/house_worker_floor.gd` checks elevated work spots and reloads.
The impact transform
is measured from the website GIF; its rasterization is a close reproduction,
not certified pixel-identical. Reserved logs and the construction clock survive
reloads. Undo returns the reserved bundle without duplicating a ground pile.
Houses stay outside the inventory. Click a placed house while the inventory is open
to cycle front, side, back, and opposite-side views for free. Pick up a house
to return its six logs as a pyramid on the nearest clear surviving grass tile
outside that house’s free foundation. Pickup is unavailable if no such tile exists. The pawn never blocks pickup:
if it occupies a collected item, its foundation, or the refunded logs tile, it
respawns on nearby surviving walkable ground. Ground and stair pickup also move
the pawn when needed, clear its previous walking route, and keep at least one
grass tile on the island. Focused check: `res://tests/pickup_pawn_relocation.gd`.
Pick up that pyramid to rebuild the house. Hovering a full pyramid shows `Icon_01.png`.
New houses follow the pointer freely, without snapping or clamping. The foundation
covers the grass tiles beneath every facing’s ground contacts at the chosen position,
all at one floor level. Moving across a tile edge can require additional foundation
grass, without moving the house. Missing-grass previews align with the actual
foundation grid. Save version 27 retains the exact free position; earlier saved
offsets keep their legacy foundation correction.
Houses retain the exact preview position;
construction, rotation, contacts, saves and undo retain that offset.
Houses occupy
a foundation on grass or water, usually 2×2 tiles and enlarged as needed for free placement. Up to four missing foundation squares become grass automatically for free per house;
any additional squares consume meadow grass from inventory. All added foundation
tiles use the house’s floor elevation and the corresponding raised grass artwork;
reload repairs the base artwork used by earlier elevated house foundations. Placement is
valid only when the pawn can reach a work spot beside the house on its floor.
If the preferred positions in front of the door are blocked, Godot searches
nearby positions beside it, keeping both soles on that same floor and outside
object contacts. Preview and construction use the same plan.
Focused check: `res://tests/house_work_spots.gd`.
Pickup removes the free tiles created by that house; existing grass and any
foundation tiles paid from inventory stay in place. Save version 30 records each
house’s free tiles, including during the approach. Older saves retain their terrain
because they did not record which house created each free tile. Existing grass stays in place;
bushes and rocks disappear only when their ground anchors lie under the house contact polygon.
Sheep and chickens run to reachable free grass, or return to inventory when trapped.
Stairs require clear foundations. Trees, other houses, logs, and the
pawn block placement where their ground contacts overlap the annotated house
contact polygon. Front, side, back, and mirrored side views share the same
PNG-coordinate contact definitions across colors. Rotation also checks contacts.
Pawn and sheep navigation block these polygons, leaving surrounding foundation
grass walkable; all foundation tiles remain protected while placed.
Focused contact check: `res://tests/house_contacts.gd`.

Save version **19** preserves sheep positions, house facings, and reclaimed
houses, and free foundation grass; older layouts retain their existing state. Undo restores construction
costs and physical log piles. Level rewards remain idempotent.
Focused check: `res://tests/level_five.gd`.

## Level two chicken

Level two grants three grass tiles, one stair bundle and one chicken. Select Chicken in the inventory
to place it on free grass; Pick up returns it to inventory. The CHICKEN4.0 animation
sheets in `assets/chicken/` use 128×128 cells at 10 fps: six idle frames, twelve eating
frames, and four run frames. The chicken alternates 2.4 seconds of idle with a complete
1.2-second pecking sequence. Two seconds after the pawn starts moving, it follows the shortest reachable
route to a grass tile beside the pawn, updating its route as the pawn changes tiles.
It stops one tile before the pawn and its routes avoid the pawn’s current tile.
Stopping the pawn retains the follow delay and lets the chicken finish approaching the adjacent tile. The chicken never blocks pawn movement; entering its tile triggers escape, like the sheep. Escape takes priority: pawn
movement during escape is ignored, and only new movement after the chicken settles
can start another two-second follow delay. Random wandering after 10–15 grazing cycles remains active while the
pawn is stationary. Pawn contact interrupts following and triggers escape over 3–5 safe tile steps,
including shorter and sideways fallbacks. It follows the same paths through bushes,
rocks and connected stairs, avoiding tree, log and house contact footprints.
If the pawn shares the chicken's tile and floor and no safe first step leads away
or sideways, the pawn picks it up. The original Wood carrying poses now have
chicken idle/run sheets composed from the existing pawn and chicken pixels; the
chicken retains its 59.5% scale. The pawn carries one chicken for one minute,
then puts it on nearby reachable grass, using the same tile on a tiny island.
It waits for a safe landing if the pawn is on a ramp without room. A bird put down
on the pawn's tile cannot be picked up again until the pawn leaves that tile.
Save version 31 retains the carried bird and wall-clock deadline through reloads
and background suspension. Carrying pauses axe work and keeps wood intact;
house work pauses while carrying, preserving reserved logs and started work. Focused check: `res://tests/chicken_carry.gd`.
Starting a valid log pickup/delivery, tree-cutting or house action puts the bird
down immediately, before the pawn equips its tool or approaches the target.
Unreachable actions and ordinary walking retain the bird. Water falls use the
same chicken-carrying frames, so it shares the pawn's fall, fade and respawn.
An expired carry deadline waits until the pawn returns to land before put-down.
Focused action/water check: `res://tests/chicken_carry_actions.gd`.
Regenerate the composite sheets with `tools/generate_chicken_carry.py` (Pillow).

When a sheep enters its grass tile, the chicken moves one reachable adjacent grass
tile away, avoiding tiles occupied by sheep or the pawn. If none is available, it waits.
Building pauses movement at the current step's safe destination. Background time
catches up on return. The sprite retains 59.5% scale, a rounded ground shadow, and a fixed foot
baseline. `assets/chicken.png` is its new first idle frame for inventory, placement,
and the level-two reward. Save version 22 retains the chicken's exact ground-plane
position; versions 20–21 migrate their stored grass cells to positions. Earlier
Save version 25 adds the level-two chicken to existing level-two-or-higher islands once.
Level seven grants another chicken, for two chickens in total.
Chickens keep 32 pixels of ground-contact spacing on the same floor while following,
wandering and escaping, and choose separate resting spots. Older overlapping positions
separate when movement resumes. `tests/chicken_spacing.gd` covers these interactions.
Level eight grants another sheep, for two sheep in total. Save version 26 adds this
reward once to existing level-eight-or-higher islands.
Focused checks: `res://tests/chicken.gd`, `res://tests/chicken_animation.gd`,
and `res://tests/chicken_following.gd`.

Generated scenery (rocks, bushes, flowers and water decorations) never blocks
placement or free terrain transformations. Sheep and chickens share grass with
existing scenery, preserving it during placement and pickup. Conflicting scenery is cleared by
committed edits; previews use the same rules. Player-built objects retain their
normal protection. Focused check: `res://tests/scenery_placement.gd`.


## Edenia dashboard and focus

Edenia's island surface reports loading, slow startup and startup/restore failures.
Study History and the feed remain usable. Retry recreates the iframe without
replacing saved work; accepted Godot restoration still gates every island write.
The XP bar below the game shows the claimed study level, next unlock and the
final tenth level from the generated Godot progression table. Study corrections
can lower current XP while claimed levels remain intact.

Visible Edenia modal dialogs and walkthroughs make the iframe and its host camera
buttons inert. Edenia relays the hidden presentation state through the existing
visibility bridge; Godot owns suspension and resume. Closing an overlay resumes
the same frame. The focused dashboard smoke verifies pointer, keyboard and camera
blocking alongside engine failure/retry and durable data preservation.

## Rendering and display density

Pixel-art textures retain their authored nearest-neighbor filtering. Start,
inventory, reward and Playground UI roots enable scale-aware font oversampling,
so readable text is rasterized at its displayed size rather than enlarging small
glyph images when the UI compensates for narrow screens. Descendant controls,
including fitted reward popups and localized fonts, inherit this policy.

The Web canvas uses the browser's native display density by default.
`edenia/web/max_pixel_ratio=0.0` disables the former 2× cap; a positive value
enables an explicit cap for performance diagnostics. Moving from 2× to 3× density
renders 2.25 times as many canvas pixels. Physical-device memory and frame-pacing
checks remain separate from desktop viewport emulation.

## Browser input and motion preferences

Tab navigates the Godot buttons. Escape cancels house placement or closes Terrain;
when no such action is pending, Escape returns keyboard focus to Edenia's Reset
view button. Host and Godot controls show visible focus borders. Study level and XP remain readable in Edenia's DOM outside the canvas. Browser
accessibility snapshots do not expose the canvas's Godot button labels; this is
not evidence of screen-reader-accessible building.

The integration relays `prefers-reduced-motion` at startup and on live changes.
Godot freezes decorative cloud drift, hides the foreground cloud, omits reward
sparks/fades and hides arrival dust while retaining the existing arrival and
gameplay clocks. The preference never enters an island snapshot. Normal effects
remain the default in the native preview. Covered and offscreen suspension keeps
using the existing visibility policy.

Issue #380 evidence and the pending physical-device checklist are recorded in
`docs/experiments/tiny-swords/acceptance-2026-10-06/report.md` at the repository root.

## Trailer, walkthrough and locale

The current Edenia loop is study → XP → claim Level up → Godot unlock → building.
A new minute watched earns 1 XP; each new Anki review after the daily baseline earns
1 XP. Legacy study facts and Study History calculations retain their existing policy.
Ten levels use the Godot progression table above. From level two, Terrain opens the
inventory; select an item and place it, then close the panel to return to walking.
The old town snapshot timeline is retired; Study History remains available.

The entire trailer is one island slide saying “Study and build your own island”. Its
19-second animation is rendered by `previews/trailer_island.tscn` using the
canonical game terrain, pawn, tree-harvesting and cloud scripts. The pawn crosses
a fixed grass strip to a fixed tree at normal speed. Surrounding randomly generated
islands change every 0.21 seconds while the pawn approaches, growing from two
grass tiles through the ten study levels. Additional trees and terraces arrive
from level three, followed by the level-five sheep and house, and another sheep
at level eight. Rocks, bushes and ducks enrich the growing island; chickens and
sharks are absent. Water ripples, foliage and animal animations
retain their ordinary clocks across terrain changes.
Clouds and the target tree retain their instances and ordinary animation clocks.
The final island holds while the pawn performs its normal ten-second cut.

Run **F6** on that scene to preview it without reading or writing saves. Regenerate
the desktop and square phone MP4s and populated-island posters with
`node scripts/build-tiny-swords-trailer.mjs` (desktop Godot and FFmpeg required).
Media writes to `images/tiny-swords-trailer/` at 2304×992 on desktop and
1280×1280 on phones, with wider camera framing and normal browser scaling.
The website plays the muted video
only on the island slide, restarts it when returning, and pauses it on exit or Skip.
Reduced motion shows the poster. Settings replay and the short host walkthrough
preserve completed general onboarding. Walkthroughs point at the island surface
and keep the game/camera controls inert beneath the overlay.

Edenia sends its current locale at game readiness and on language changes. The bridge
only transports that presentation preference. Godot's `GameCopy` owns English,
Traditional/Simplified Chinese, Spanish and French strings, live UI refresh and fonts.
Locale changes never replace the iframe or modify an island save. Chinese UI uses
bundled subset fonts; update their glyph subsets when changing the Godot catalogs.
See `fonts/README.md` for provenance and regeneration. Validate with the integrated
export contract and `tiny-swords-copy.spec.mjs`, then rebuild the integrated preview.

Chicken placement uses the same grass rules as sheep, including grass at both ends of stairs. The ramp itself and occupied tiles remain unavailable. Focused check: `res://tests/chicken_stair_placement.gd`.
## Ambient ocean shark

One shark uses the supplied `assets/shark/shark.png` and roams continuously in
open water in native and integrated scenes. Moving ripples reuse the sixteen-frame
water-rock animation at 5 fps, with rock pixels removed by a palette shader.
Its full sprite and ripple ring keep six pixels
of clearance from land, the complete visible cliff column, stairs and the
original water rocks. Every swimming step checks the whole route; terrain
edits, previews, undo and restoration move a covered shark to clear water.
Swimming freezes with reduced motion. This ambient animal does not consume
inventory or enter island saves. Focused check: `res://tests/shark_water.gd`.
