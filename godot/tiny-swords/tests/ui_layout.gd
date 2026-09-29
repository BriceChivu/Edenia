extends SceneTree
var failures := 0
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.preview_save_enabled = false
	root.add_child(level)
	level.layout.unlock()
	level.toggle_editing()
	for window_size in [Vector2i(390, 250), Vector2i(1152, 496)]:
		root.size = window_size
		await create_timer(0.2).timeout
		level.ui.refresh(true, "meadow", false)
		await process_frame
		level.update_cursor()
		if level.pointer.scale != Vector2.ONE:
			failures += 1
			push_error("Cursor proportions match native scene at every frame width")
		var panel = level.ui.panel
		var bounds := Rect2(Vector2.ZERO, root.get_visible_rect().size / level.ui.root.scale)
		if not bounds.encloses(Rect2(panel.position, panel.size)):
			failures += 1
			push_error("Inventory must remain inside the town frame")
		for button in level.ui.buttons.values():
			if button.size.y < 32 or not button.is_visible_in_tree():
				failures += 1
				push_error("Inventory tools remain visible and usable")
	print("Builder UI layout: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
