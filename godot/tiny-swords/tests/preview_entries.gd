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
	for entry in ["level_one", "level_one_to_two", "level_two"]:
		for iteration in range(2):
			var scene = load("res://previews/%s.tscn" % entry).instantiate()
			root.add_child(scene)
			await process_frame
			check(not scene.preview_save_enabled, "Test entry disables persistence before startup")
			check(scene.layout.cells.size() == 5 and scene.layout.trees.is_empty(), "Every run starts with the original island")
			check(scene.pawn.position == scene.layout.center(scene.layout.HOME), "Pawn starts at home")
			if entry == "level_two":
				check(scene.layout.unlocked and scene.editing and scene.ui.panel.visible and scene.ui.celebration == null, "Direct level two is ready to build without a ribbon")
			else:
				check(not scene.layout.unlocked and not scene.editing and scene.layout.ground_count() == 0, "Level one starts locked without rewards")
				check(scene.ui.launch.visible == (entry == "level_one_to_two"), "Only transition entry exposes Try level 2")
			if entry == "level_one_to_two":
				scene.ui.launch.pressed.emit()
				check(scene.layout.unlocked and scene.ui.celebration != null, "Try level 2 invokes real unlock and ribbon")
				var granted: Dictionary = scene.layout.stock.duplicate()
				scene.unlock_level_two()
				check(scene.layout.stock == granted, "Transition rewards cannot be granted twice")
				for child in scene.ui.celebration.get_children():
					if child is Button and child.text == "Start building":
						child.pressed.emit()
						break
				check(scene.editing and scene.ui.panel.visible and scene.ui.celebration == null, "Real Start building control opens inventory")
			if scene.layout.unlocked:
				check(scene.layout.ground_count() == 6 and scene.layout.stock.stairs == 2 and scene.layout.stock.tree == 1, "Shared level-two rewards are exact")
				check(scene.apply_edit(Vector2i(2,0)), "Normal shared terrain editing works in test entry")
			scene.save_layout()
			scene.queue_free()
			await process_frame
	check(FileAccess.file_exists(save_path) == existed, "No preview save created or removed")
	if existed:
		check(FileAccess.get_file_as_bytes(save_path) == before, "Existing preview save remains byte-for-byte unchanged")
	print("Preview entry checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
