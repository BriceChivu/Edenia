extends SceneTree

const Terrain = preload("res://scripts/playground_terrain.gd")
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
	else:
		print("PASS: " + message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	for level in [2, 3, 5, 7, 10]:
		for seed_value in range(12):
			var layout = Terrain.generate(Terrain.fresh(level), seed_value)
			var source = Terrain.fresh(level)
			check(layout.playground_grants == source.playground_grants, "Random terrain adds no inventory grants")
			check(layout.cells.size() + layout.ground_count() + 2 * int(layout.stock.stairs) == source.cells.size() + source.ground_count() + 2 * int(source.stock.stairs), "Random terrain conserves available ground and stair tiles")
			var restored = Layout.new()
			check(restored.restore(layout.snapshot()), "Generated level %s / seed %s survives restore" % [level, seed_value])
			check(Terrain.generate(Terrain.fresh(level), seed_value).snapshot() == layout.snapshot(), "Seed %s reproduces the terrain at level %s" % [seed_value, level])
			check(layout.cells.size() >= 5 and layout.level == level, "Generated island has usable land and retains level")
			var valid_cliffs := true
			for cell: Vector2i in layout.cells:
				valid_cliffs = valid_cliffs and layout.in_bounds(cell) and layout.height_at(cell) <= layout.height_at(cell + Vector2i.DOWN) + Layout.SIZE
			check(valid_cliffs, "Generated cliffs have a receiving terrace")
			var forged: Dictionary = layout.snapshot()
			forged.stock.meadow += 1
			check(not restored.restore(forged), "Extra stock still requires matching grant accounting")
			forged = layout.snapshot()
			forged.version = 24
			forged["playground_grants"] = {"ground": -1}
			check(not restored.restore(forged), "Negative testing grants are rejected")
			if level < 10:
				layout.unlock(level + 1)
				check(restored.restore(layout.snapshot()), "Ordinary upgrades preserve testing grant accounting")
	var game = load("res://scenes/level_two_preview.tscn").instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	root.add_child(game)
	check(game.playground == null, "Ordinary game does not mount testing controls")
	game.free()
	game = load("res://scenes/level_two_preview.tscn").instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	game.playground_enabled = true
	root.add_child(game)
	game.set_process(false)
	var tools = game.playground
	check(not game.ui.root.has_node("UpgradeButton") and not game.ui.launch.visible, "Level one has no legacy level button")
	var initial: Dictionary = game.layout.snapshot()
	check(not tools.run_action("terrain"), "Random terrain requires building unlock")
	game.playground_ready = false
	check(not tools.run_action("level"), "Controls wait for accepted island restore")
	game.playground_ready = true
	check(tools.run_action("level") and game.layout.level == 2, "Level button runs the normal reward upgrade")
	check(game.ui.celebration != null and not tools.run_action("level"), "Repeated clicks cannot bypass a celebration")
	game.ui.celebration.free()
	game.ui.celebration = null
	game.refresh()
	check(tools.run_action("restore") and game.layout.snapshot() == initial, "Automatic checkpoint restores level and inventory exactly")
	for level in range(2, 8): game.layout.unlock(level)
	game.refresh()
	check(tools.run_action("checkpoint"), "Explicit checkpoint saves current island")
	var checkpoint: Dictionary = game.layout.snapshot()
	var durable_checkpoint: Dictionary = JSON.parse_string(JSON.stringify(game.saved_snapshot()))
	check(durable_checkpoint.has("playground_checkpoint"), "Saved island includes its checkpoint for reload")
	var available_ground: int = game.layout.cells.size() + game.layout.ground_count() + 2 * int(game.layout.stock.stairs)
	check(tools.run_action("terrain", 42), "Random terrain button replaces the island")
	check(game.layout.cells.size() + game.layout.ground_count() + 2 * int(game.layout.stock.stairs) == available_ground, "Button uses current inventory without free supplies")
	var first_random: Dictionary = game.layout.snapshot()
	check(tools.run_action("terrain", 43), "Random terrain can regenerate an island with depleted stock")
	check(game.layout.snapshot() != first_random, "Another seed replaces the previous random island")
	check(game.layout.cells.size() + game.layout.ground_count() + 2 * int(game.layout.stock.stairs) == available_ground, "Regeneration retains the owned tile budget")
	check(game.layout.stair_directions.size() > 0, "Random island includes valid stair terraces")
	check(game.land_route(game.pawn.position, Vector2i(1, 0), game.layout.center(Vector2i(1, 0))).size() > 0, "Generated island has a reachable walking route")
	check(tools.run_action("supplies") and game.layout.stock.chicken > 1 and game.layout.stock.sheep > 1, "Supplies include unlocked animals")
	check(tools.run_action("house") and game.layout.house_bundle == 6 and game.selected == "house", "House logs enter normal placement workflow")
	var restored = Layout.new()
	check(restored.restore(game.layout.snapshot()) and restored.resources.wood == 6, "House logs survive save validation without duplicating wood")
	check(not tools.run_action("house"), "Reserved house bundle cannot be duplicated")
	check(tools.run_action("restore") and game.layout.snapshot() == checkpoint and not game.pawn.hammering, "Restore clears actions and returns exact checkpoint")
	var reloaded = load("res://scenes/level_two_preview.tscn").instantiate()
	reloaded.preview_save_enabled = false
	reloaded.camera_save_enabled = false
	reloaded.playground_enabled = true
	root.add_child(reloaded)
	check(reloaded.restore_saved_layout(durable_checkpoint), "Reload accepts checkpoint-bearing island")
	check(reloaded.playground.run_action("supplies"), "Reloaded island can change independently")
	check(reloaded.playground.run_action("restore") and reloaded.layout.snapshot() == checkpoint, "Checkpoint survives serialization and a new game instance")
	reloaded.free()
	var unlocked: Dictionary = game.layout.snapshot()
	check(tools.run_action("previous") and tools.current_level() == 6, "Level minus selects the previous popup level")
	check(game.layout.snapshot() == unlocked and game.layout.level == 7, "Going back preserves terrain, rewards and animal unlocks")
	check(tools.run_action("level") and tools.current_level() == 7 and game.ui.celebration != null, "Level plus replays the already unlocked popup")
	check(game.ui.celebration.get_node("Title").text == "LEVEL 7", "Replay shows the selected level's popup title")
	check(game.layout.snapshot() == unlocked, "Replaying a popup cannot duplicate inventory rewards")
	game.ui.celebration.free()
	game.ui.celebration = null
	game.refresh()
	for step in range(6): tools.run_action("previous")
	check(tools.current_level() == 1 and not tools.run_action("previous"), "Level minus stops at level one")
	check(game.layout.snapshot() == unlocked, "Repeated step backs retain every unlocked item")
	check(tools.run_action("level") and tools.current_level() == 2 and game.ui.celebration != null, "A high-level island can replay the level-two popup")
	check(game.ui.celebration.get_node("Title").text == "LEVEL 2", "Level-two replay uses the level-two reward scene")
	check(game.layout.snapshot() == unlocked, "Level-two replay preserves higher-level inventory")
	game.ui.celebration.free()
	game.ui.celebration = null
	game.refresh()
	check(tools.run_action("fresh") and game.layout.level == 1 and tools.current_level() == 1, "Fresh island returns to level one")
	var fresh_start = Layout.new()
	fresh_start.restore(Terrain.fresh(1).snapshot())
	var fresh_snapshot: Dictionary = game.layout.snapshot()
	var expected_snapshot: Dictionary = fresh_start.snapshot()
	# The next tree variant is randomly selected for each new island.
	fresh_snapshot.erase("next_tree_variant")
	expected_snapshot.erase("next_tree_variant")
	check(fresh_snapshot == expected_snapshot, "Fresh island clears inventory, resources, placements and unlocks")
	check(game.history.is_empty() and not game.editing and game.selected.is_empty(), "Fresh island clears editing and undo state")
	check(game.pawn.position == game.layout.center(game.layout.spawn_cell()), "Fresh island returns the pawn to its starting position")
	game.apply_study_level(3)
	check(game.layout.level == 1 and game.ui.celebration == null, "Fresh start ignores previously earned study levels")
	var fresh_saved: Dictionary = JSON.parse_string(JSON.stringify(game.saved_snapshot()))
	game.playground_manual_progression = false
	check(game.restore_saved_layout(fresh_saved), "Fresh start survives save and restore")
	game.apply_study_level(3)
	check(game.layout.level == 1 and game.ui.celebration == null, "Reloaded fresh start ignores existing study levels")
	check(tools.run_action("level") and game.layout.level == 2, "Fresh start still allows manual Playground upgrades")
	game.ui.celebration.free()
	game.ui.celebration = null
	check(tools.run_action("terrain", 42) and game.playground_manual_progression, "Random terrain preserves manual fresh-start progression")
	check(tools.run_action("checkpoint"), "Manual fresh start can save a checkpoint")
	check(tools.run_action("restore") and game.playground_manual_progression, "Manual progression survives checkpoint restore")
	tools.load_checkpoint(durable_checkpoint.playground_checkpoint)
	check(tools.run_action("restore") and not game.playground_manual_progression, "Restoring the earlier checkpoint restores study sync")
	game.layout.level = 10
	check(not tools.run_action("level"), "Level button stops at maximum level")
	game.free()
	await process_frame
	print("Playground checks: %s failures" % failures)
	quit(1 if failures else 0)
