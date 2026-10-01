extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var game = load("res://previews/level_one.tscn").instantiate()
	root.add_child(game)
	var layout = game.layout
	var upper := Vector2i(8, 0)
	var blocked := Vector2i(9, 0)
	var ramp := Vector2i(10, 0)
	layout.cells[upper] = "high_meadow"
	layout.elevations[upper] = 192
	layout.cells[blocked] = "high_meadow"
	layout.trees[blocked] = true
	layout.cells[ramp] = "stairs"
	seed(12345)
	var seen := {}
	for i in range(256):
		var cell: Vector2i = layout.random_respawn_cell()
		check(layout.cells.has(cell) and cell != blocked and cell != ramp, "Respawn chooses unblocked grass")
		seen[cell] = true
	check(seen.has(Vector2i.ZERO), "Ground-level grass can be selected")
	check(seen.has(Vector2i(3, 2)), "Disconnected grass can be selected")
	check(seen.has(upper), "Higher grass can be selected")
	# Select a reproducible roll for an actual flat-shore fall onto high ground.
	layout.cells = {Vector2i.ZERO: "meadow", upper: "high_meadow"}
	layout.trees = {}
	var chosen_seed := 0
	while true:
		seed(chosen_seed)
		if layout.random_respawn_cell() == upper:
			break
		chosen_seed += 1
	seed(chosen_seed)
	var start: Vector2 = layout.center(Vector2i.ZERO)
	game.pawn.position = start
	game.fall_into_water(start + Vector2(0, -200))
	await game.respawned
	check(game.pawn.position == layout.center(upper), "Water fall uses the random grass selection")
	check(game.pawn.sprite.position.y == -224 and game.pawn.z_index == 3, "Respawn restores the selected floor height and depth")
	game.queue_free()
	await process_frame
	print("Random respawn checks: %s failures" % failures)
	quit(1 if failures else 0)
