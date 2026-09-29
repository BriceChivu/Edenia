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
		if panel.size.y > 44.1 or panel.size.x > 214.1 or absf(panel.position.x + panel.size.x - level.ui.launch.position.x - level.ui.launch.size.x) > 0.1:
			failures += 1
			push_error("Compact strip shares the collapsed button's right edge")
		for button in level.ui.buttons.values() + level.ui.action_buttons + [level.ui.done_button]:
			if button.text != "" or button.accessibility_name == "" or not button.get_theme_stylebox("normal") is StyleBoxEmpty:
				failures += 1
				push_error("Toolbar choices have artwork and accessible names without text or chrome")
		if not level.ui.buttons.tree.disabled:
			failures += 1
			push_error("Unavailable level-two tree remains disabled")
	var button_style = level.ui.launch.get_theme_stylebox("normal")
	if button_style.texture.get_width() > 100 or button_style.axis_stretch_horizontal != StyleBoxTexture.AXIS_STRETCH_MODE_TILE:
		failures += 1
		push_error("Button artwork matches the reference display scale and repeats to fit labels")
	level.ui.done_button.pressed.emit()
	if level.editing or level.ui.panel.visible or not level.ui.launch.visible or level.ui.action_buttons.size() != 2:
		failures += 1
		push_error("Exit icon closes the toolbar and returns to walking")
	print("Builder UI layout: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
