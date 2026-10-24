# Achievements — editable Godot draft

Local design review only. Completion state is simulated and resets each run.

## Run

From this worktree: `node scripts/preview-tiny-swords-achievements.mjs`.
Open http://localhost:8051/ for the actual Godot Web export.

In Godot, open `res://previews/achievements/preview.tscn` and press F6 to
run the same draft over the fresh island fixture. No learner saves are loaded.

## Edit

Open `res://previews/achievements/achievements_draft.tscn` in the 2D editor.
Select **AchievementsDraftUI**. Its Inspector exposes:

- **Preview Level**: controls grey locked rows.
- **Achievement Titles**: the six labels, in their displayed order.
- **Unlock Levels**: one threshold per row.
- **Completed**: six values, 0 = unfinished, 1 = green tick.
- **Start Open**: show the parchment immediately when running.

The `@tool` script updates these states in the editor. The title, rows,
checkmarks, close button, progress label and all nine parchment pieces are
ordinary editable nodes. Move or resize them in 2D, save, then run the island
fixture with F6. Re-run the command above to rebuild the browser version.

While running: change the level in the top-left draft controls; click any
available row to toggle its tick; **All done** previews completion;
**Reset** clears ticks. Close with ×, Escape or a backdrop click. The icon
immediately left of the cogwheel reopens the list.

## Assets and provisional rules

The exact supplied icon is the existing `Icons/Icon_11.png`. Its hit area is
45×45 and its icon width is 36, at the same bottom anchor as the real cogwheel.
The parchment is an unchanged copy of
`assets/tiny-swords/UI Elements/UI Elements/Banners/Banner.png`, assembled
from its nine atlas regions. Texture pixels retain nearest-neighbor filtering.

Tree cutting uses level 4, house building level 5, chicken pickup level 2,
and the black hole level 6, following current game rules. Ducks are random
terrain decorations with no separate level gate; the draft uses level 2.
Egg laying has no current gameplay implementation; its draft level is also 2.
Both thresholds are deliberately editable, pending design approval.

This draft does not record gameplay achievements, add persistence, change the
normal game entry point, or ship a production achievements feature.
