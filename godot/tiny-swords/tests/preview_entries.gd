extends SceneTree
var failures := 0
func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var save_path := "user://builder_preview.json"
	var existed := FileAccess.file_exists(save_path)
	var before := FileAccess.get_file_as_bytes(save_path) if existed else PackedByteArray()
	var base = load("res://scenes/level_two_preview.tscn").instantiate()
	check(base.preview_save_enabled, "Existing persistent preview keeps its save behavior")
	base.free()
	for entry in ["level_one", "level_one_to_two", "level_two", "level_two_to_three", "level_three", "level_three_to_four", "level_four"]:
		for iteration in range(2):
			var scene = load("res://previews/%s.tscn" % entry).instantiate()
			root.add_child(scene)
			await process_frame
			var initial_level := 1 if entry in ["level_one", "level_one_to_two"] else (4 if entry == "level_four" else (3 if entry in ["level_three", "level_three_to_four"] else 2))
			check(not scene.preview_save_enabled, "Test entry disables persistence before startup")
			check(scene.layout.cells.size() == 5 and scene.layout.trees.is_empty(), "Every run starts with the original island")
			check(scene.pawn.position == scene.layout.center(scene.layout.HOME), "Pawn starts at home")
			check(scene.layout.level == initial_level and scene.ui.celebration == null, "Expected initial level without a startup celebration: " + entry)
			check(scene.editing == (entry in ["level_two", "level_three", "level_four"]), "Direct unlocked previews open ready to build")
			check(scene.ui.upgrade.visible == (entry in ["level_two_to_three", "level_three_to_four"]), "Only second-transition entry offers Try level 3")
			if entry == "level_one":
				check(not scene.ui.launch.visible, "Pure level one exposes no upgrade")
			if initial_level >= 2:
				check(scene.apply_edit(Vector2i(2,0)), "Shared editing works before upgrade")
			var cells: Dictionary = scene.layout.cells.duplicate()
			var stock: Dictionary = scene.layout.stock.duplicate()
			var position: Vector2 = scene.pawn.position
			if entry in ["level_one_to_two", "level_two_to_three", "level_three_to_four"]:
				var target := initial_level + 1
				if target == 2: scene.ui.launch.pressed.emit()
				else: scene.ui.upgrade.pressed.emit()
				check(scene.layout.level == target and scene.ui.celebration != null, "Transition invokes real upgrade and ribbon")
				check(scene.layout.cells == cells and scene.pawn.position == position, "Transition preserves placements and pawn")
				if target == 4:
					var popup = scene.ui.celebration
					check(popup.get_node("Title").text == "LEVEL 4" and not popup.get_node("StairsButton").visible, "Level four displays its own title and rewards")
					check(popup.get_node("PineReward").visible and is_equal_approx(popup.get_node("AxeReward").rotation_degrees, 0.0), "Tree and unrotated axe appear on shared popup")
					check(scene.ui.buttons.tree.visible and scene.ui.buttons.tree.get_node("Remaining").text == "×2", "All trees share the level-three inventory icon")
				var granted: Dictionary = scene.layout.stock.duplicate()
				scene.unlock_level(target)
				check(scene.layout.stock == granted, "Repeated UI event grants nothing")
				scene.ui.celebration.get_node("BuildButton").pressed.emit()
				check(scene.editing and scene.ui.panel.visible and scene.ui.celebration == null, "Real celebration action opens inventory")
				# A pre-upgrade undo snapshot must not revoke rewards or recreate them.
				scene.undo()
				check(scene.layout.level == target and scene.layout.stock == granted, "Undo cannot revert progression")
			scene.save_layout()
			scene.queue_free()
			await process_frame
	check(FileAccess.file_exists(save_path) == existed, "No preview save created or removed")
	if existed:
		check(FileAccess.get_file_as_bytes(save_path) == before, "Existing preview save remains byte-for-byte unchanged")
	print("Preview entry checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
