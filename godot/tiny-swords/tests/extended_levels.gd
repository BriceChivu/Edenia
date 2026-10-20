extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var layout = preload("res://scripts/terrain_layout.gd").new()
	for target in range(2, 8):
		check(layout.unlock(target), "Unlock before level eight")
	check(layout.stock.stairs == 3, "Level six grants the third staircase")
	check(layout.stock.tree == 3, "Level six grants the third tree")
	check(layout.stock.sheep == 1, "First sheep is granted at level five")
	check(layout.edit(Vector2i(1, 0), "sheep", Vector2i.ZERO), "Place first sheep before level eight")
	check(layout.unlock(8) and layout.stock.sheep == 1 and layout.sheep.size() == 1, "Level eight grants a second sheep")
	check(layout.stock.tree == 4, "Level eight grants the fourth tree")
	check(not layout.unlock(8) and layout.stock.sheep == 1, "Level-eight reward cannot repeat")
	var restored = preload("res://scripts/terrain_layout.gd").new()
	check(restored.restore(layout.snapshot()) and restored.sheep == layout.sheep and restored.stock.sheep == 1, "Two sheep persist across reload")
	for version in [17, 24, 25, 27]:
		var legacy := layout.snapshot()
		legacy.version = version
		legacy.stock.stairs -= 1
		legacy.stock.tree -= 2
		legacy.stock.sheep = 0 if version in [24, 25] else 1
		if version < 25:
			legacy.stock.chicken -= 1
		if version == 24:
			legacy.playground_grants = {}
		check(restored.restore(legacy) and restored.stock.sheep + restored.sheep.size() == 2, "Older saves receive level-eight sheep: v%s" % version)
		check(restored.restore(restored.snapshot()) and restored.stock.sheep + restored.sheep.size() == 2, "Sheep migration runs once")
		check(restored.stock.tree == 4, "Legacy tree migrations run once")
	for version in [28, 29, 30, 31]:
		var legacy := layout.snapshot()
		legacy.version = version
		legacy.stock.stairs -= 1
		legacy.stock.tree -= 1
		check(restored.restore(legacy) and restored.stock.tree == 4, "Existing islands receive the level-eight tree: v%s" % version)
		check(restored.restore(restored.snapshot()) and restored.stock.tree == 4, "Level-eight tree migration runs once")
	# Versions 32 and 33 are the immediately preceding save formats. Preserve
	# placed stairs, grant the new bundle only from level six, and resave once.
	for target in range(1, 11):
		var current = preload("res://scripts/terrain_layout.gd").new()
		for next_level in range(2, target + 1):
			current.unlock(next_level)
		if target >= 2:
			check(current.edit(Vector2i(2, 1), "ground", Vector2i.ZERO), "Prepare existing staircase support")
			check(current.edit(Vector2i(2, 0), "stairs", Vector2i.ZERO), "Place existing staircase before migration")
		for version in [32, 33]:
			var legacy := current.snapshot()
			legacy.version = version
			if target >= 6:
				legacy.stock.stairs -= 1
			check(restored.restore(legacy), "Restore level %s from version %s" % [target, version])
			check(restored.stock == current.stock and restored.cells == current.cells and restored.stair_directions == current.stair_directions, "Migration retains placements and restores exactly the earned inventory")
			var migrated: Dictionary = JSON.parse_string(JSON.stringify(restored.snapshot()))
			check(restored.restore(migrated) and restored.stock == current.stock and restored.cells == current.cells and restored.stair_directions == current.stair_directions, "Staircase migration survives JSON reload without duplication")
		if target == 5:
			check(restored.unlock(6) and restored.stock.stairs == current.stock.stairs + 1, "Migrated level five receives its staircase on reaching six")
		if target >= 6:
			var extra_stair := current.snapshot()
			extra_stair.stock.stairs += 1
			check(not restored.restore(extra_stair), "Reject duplicate staircase inventory")
	var extra_tree := layout.snapshot()
	extra_tree.stock.tree += 1
	check(not restored.restore(extra_tree), "Duplicate trees rejected")
	var forged := layout.snapshot()
	forged.stock.sheep += 1
	check(not restored.restore(forged), "Duplicate sheep rejected")
	for entry in ["six", "seven", "eight", "nine", "ten"]:
		var world = load("res://previews/level_%s.tscn" % entry).instantiate()
		root.add_child(world)
		var target: int = ["six", "seven", "eight", "nine", "ten"].find(entry) + 6
		check(world.layout.level == target, "Fresh scene starts at level %s" % target)
		world.ui.celebrate()
		var popup: Control = world.ui.celebration
		check(popup.get_node("Title").text == root.get_node("GameCopy").text("level", {"level": target}), "Correct reward title")
		check(popup.get_node("GroundCount").text == "+3", "Three grass reward")
		for hidden in ["StairsButton", "StairsCount", "PineReward", "PineCount"]:
			check(popup.get_node(hidden).visible == (target == 6 or (target in [7, 8] and hidden in ["PineReward", "PineCount"])), "Only granted rewards shown")
		if target == 6:
			check(popup.get_node("StairsCount").text == "+1" and popup.get_node("StairsButton").position.x == 194 and popup.get_node("PineReward").position.x == 290, "Level six shows the staircase and tree in separate reward columns")
		check(popup.get_node("TreeReward").visible == (target == 8) and popup.get_node("TreeCount").visible == (target == 8), "Extra tree reward shown only at level eight")
		popup.get_node("BuildButton").pressed.emit()
		check(world.ui.celebration == null and not world.editing, "Confirmation closes popup and toggles editing")
		world.queue_free()
		await process_frame
	print("Extended level scene checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
