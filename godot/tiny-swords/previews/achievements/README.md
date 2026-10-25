# Achievements — real gameplay preview

The approved layout now lives in `res://scenes/achievements_ui.tscn` and is
controlled by `res://scripts/achievements_ui.gd`. Edit its ordinary Godot nodes
for spacing, artwork and typography. This is the same UI shipped in the game;
there are no simulated completion controls.

Run `node scripts/preview-tiny-swords-achievements.mjs` and open
http://localhost:8051/?internal_test=1. Optional `&locale=fr` (or `en`, `es`,
`zh-Hant`, `zh-Hans`) changes the preview language. This fresh sandbox discards
its island each run. In Godot, open `res://previews/achievements/preview.tscn`
and press F6 for the same fixture.

For real saved progress, use the ordinary Edenia integration with
`?internal_test=1`; Godot sends achievements through its existing island
snapshot and Edenia persists them with the learner profile. Public URLs,
unsupported flag values and `internal_test=2` do not expose or earn achievements.

Tree cutting completes on the final axe swing, house building on completed
construction, chicken pickup on a successful carry, rubber-duck discovery on
its natural terrain roll, and black-hole entry when the pawn is captured.
Egg laying is greyed out as “Coming soon” because that mechanic does not exist.
Earned progress is read-only. Close the parchment with Escape, its icon or an
outside click. The button follows the cogwheel's size, anchor and visibility.

Save version 36 retains a bounded dictionary of stable achievement IDs. Old
islands backfill only actions evidenced by their current saved objects/state;
history that leaves no evidence cannot be inferred. Undo keeps earned
achievements; full island/profile replacement restores that island's own ledger.

Focused check:
`Godot --headless --path godot/tiny-swords --script res://tests/achievements.gd`.
