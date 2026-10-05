extends SceneTree

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
	var game = load(ProjectSettings.get_setting("application/run/main_scene")).instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	root.add_child(game)
	game.game_camera.force_update_scroll()
	check(is_equal_approx(game.game_camera.zoom.x, 0.8), "Default view is 20 percent farther out")
	var camera_start: Vector2 = game.game_camera.position
	check(camera_start == game.pawn.position + Vector2(0, -32.0 - game.ground_height(game.pawn.position)), "Initial view centers on the visible pawn")
	var pawn_start: Vector2 = game.pawn.position
	var layout_start: Dictionary = game.layout.snapshot()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = Vector2(576, 248)
	game._unhandled_input(press)
	var motion := InputEventMouseMotion.new()
	motion.position = press.position + Vector2(30, 20)
	game._input(motion)
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = motion.position
	game._input(release)
	check(game.game_camera.position.x < camera_start.x and game.game_camera.position.y < camera_start.y, "Mouse dragging pans both camera axes")
	check(game.pawn.position == pawn_start and game.layout.snapshot() == layout_start, "Dragging does not move pawn or edit land")
	game.camera_command("out")
	check(is_equal_approx(game.game_camera.zoom.x, 0.7), "Zoom out uses shared camera rules")
	for i in range(20):
		game.camera_command("in")
	check(is_equal_approx(game.game_camera.zoom.x, 1.5), "Zoom in respects maximum")
	game.editing = true
	game.selected = "remove"
	game.terrain.valid = true
	game.update_cursor()
	check(game.pointer.scale == Vector2.ONE * 1.5 and game.build_cursor_size == Vector2i(71, 71), "Zoom in scales the whole pickup cursor to match the grid")
	for i in range(20):
		game.camera_command("out")
	check(is_equal_approx(game.game_camera.zoom.x, 0.5), "Zoom out respects minimum")
	game.update_cursor()
	check(game.pointer.scale == Vector2.ONE * 0.5 and game.build_cursor_size == Vector2i(71, 71), "Zoom out scales the whole pickup cursor to match the grid")
	check(game.pointer.position + Vector2(35.5, 35.5) * game.pointer.scale == game.pointer_position, "Scaled pickup cursor stays centered on the pointer")
	game.editing = false
	game.selected = "ground"
	game.update_cursor()
	check(game.pointer.scale == Vector2.ONE, "Walking cursor retains its original scale after pickup")
	game.camera_command("reset")
	check(game.game_camera.position == camera_start and is_equal_approx(game.game_camera.zoom.x, 0.8), "Reset restores shared camera defaults")
	game.pawn.position = Vector2(1600, 300)
	game.camera_command("reset")
	check(game.game_camera.position == game.pawn.position + Vector2(0, -32.0 - game.ground_height(game.pawn.position)), "Default view centers on the current pawn beyond pan bounds")
	game.pawn.position = pawn_start
	game.camera_command("reset")
	if not OS.has_feature("web"):
		game.camera_save_path = "user://camera_view_test.json"
		game.camera_save_enabled = true
		game.game_camera.position = Vector2(1200, 420)
		game.game_camera.zoom = Vector2.ONE * 1.2
		game.save_camera_view()
		game.game_camera.position = Vector2.ZERO
		game.game_camera.zoom = Vector2.ONE
		game.load_camera_view()
		check(game.game_camera.position == Vector2(1200, 420) and is_equal_approx(game.game_camera.zoom.x, 1.2), "Saved camera position and zoom survive reloading storage")
		game.camera_save_enabled = false
		DirAccess.remove_absolute(game.camera_save_path)
		game.camera_command("reset")
	game.ui.max_preview_level = 2
	game.unlock_level(2)
	game.ui.celebration.queue_free()
	game.ui.celebration = null
	game.refresh()
	var before_animation_build: Dictionary = game.layout.snapshot()
	for phase in [game.WaterPhase.APPROACHING, game.WaterPhase.FALLING, game.WaterPhase.SPLASH, game.WaterPhase.WAITING, game.WaterPhase.RESPAWNING]:
		game.water_phase = phase
		game._process(0.01)
		check(not game.ui.launch.disabled, "Build launcher stays enabled during water phase %s" % phase)
		game.ui.launch.pressed.emit()
		check(game.editing and game.water_phase == phase, "Build mode opens without interrupting water phase %s" % phase)
		game.ui.buttons.ground.pressed.emit()
		var cell := Vector2i(2, 0)
		var point: Vector2 = game.layout.center(cell)
		game.update_inventory_preview(point)
		check(game.terrain.valid, "Placement preview remains valid during water animation")
		check(game.apply_edit(cell), "Direct inventory edits work during water animation")
		game.undo()
		check(game.history.is_empty() and game.layout.snapshot() == before_animation_build, "Undo works during water animation")
		var water_press := InputEventMouseButton.new()
		water_press.pressed = true
		water_press.button_index = MOUSE_BUTTON_LEFT
		water_press.position = game.get_global_transform_with_canvas() * point
		game._unhandled_input(water_press)
		var water_release := InputEventMouseButton.new()
		water_release.button_index = MOUSE_BUTTON_LEFT
		water_release.position = water_press.position
		game._input(water_release)
		check(game.layout.cells.has(cell), "Inventory clicks edit terrain during water phase %s" % phase)
		game.undo()
		game.toggle_editing()
	check(game.layout.snapshot() == before_animation_build, "Opening build mode during animation does not edit terrain")
	game.water_phase = game.WaterPhase.READY
	game.layout.cells[Vector2i(0, 0)] = "high_meadow"
	game.layout.elevations[Vector2i(0, 0)] = 64
	game.pawn.position = game.layout.center(Vector2i(0, 0))
	game.pawn.walk_to(game.pawn.position)
	game.fall_into_water(Vector2(400, 208))
	check(game.water_phase == game.WaterPhase.READY and game.pawn.destination == game.pawn.position, "High ground cannot initiate a water jump")
	game.layout.cells[Vector2i(0, 0)] = "meadow"
	game.layout.elevations[Vector2i(0, 0)] = 0
	game.fall_into_water(Vector2(400, 208))
	check(game.water_phase != game.WaterPhase.READY, "Ground-level shore still permits water jumps")
	var grid_size: Vector2i = game.layout.MAX_CELL - game.layout.MIN_CELL + Vector2i.ONE
	check(grid_size == Vector2i(37, 20) and grid_size.x * grid_size.y == 740, "Build grid contains 740 squares with five added columns at each horizontal edge")
	check(game.layout.in_bounds(Vector2i(-17, -9)) and game.layout.in_bounds(Vector2i(19, 10)), "Expanded grid admits both new boundary corners")
	check(not game.layout.in_bounds(Vector2i(-18, -9)) and not game.layout.in_bounds(Vector2i(20, 10)) and not game.layout.in_bounds(Vector2i(0, -10)) and not game.layout.in_bounds(Vector2i(0, 11)), "Expanded grid still rejects outside squares")
	game.refresh()
	check(game.ui.buttons.ground.visible and game.ui.buttons.stairs.visible and game.ui.buttons.tree.visible and game.ui.buttons.tree.get_node("Remaining").text == "×0", "Level two shows ground, stairs and an empty tree slot hint")
	var stocked: Dictionary = game.layout.snapshot()
	game.layout.stock.meadow = 0
	game.layout.stock.gold = 0
	game.refresh()
	check(game.ui.buttons.ground.visible and not game.ui.buttons.ground.disabled, "Empty ground inventory remains selectable for free transformations")
	check(is_equal_approx(game.ui.buttons.ground.get_theme_color("icon_normal_color").a, 0.25), "Depleted ground icon stays at 25 percent opacity")
	game.layout.stock.stairs = 0
	game.refresh()
	check(not game.ui.buttons.stairs.disabled and is_equal_approx(game.ui.buttons.stairs.get_theme_color("icon_normal_color").a, 0.25), "Empty stair inventory remains selectable for direction switching at 25 percent opacity")
	game.layout.restore(stocked)
	game.water_phase = game.WaterPhase.READY
	game.ui.max_preview_level = 3
	game.unlock_level(3)
	check(game.ui.buttons.tree.visible and game.layout.stock.tree == 1, "Level three reveals pine and credits its existing reward")
	game.selected = "tree"
	game.editing = true
	check(game.apply_edit(Vector2i(1, 0)), "Place last tree item")
	check(game.editing and not game.ui.buttons.tree.disabled, "Empty tree inventory retains cycling tool")
	var tree_before: String = game.layout.tree_types[Vector2i(1, 0)]
	var before_cycle: Dictionary = game.layout.snapshot()
	check(game.apply_edit(Vector2i(1, 0)), "Click existing tree to cycle")
	check(game.layout.tree_types[Vector2i(1, 0)] != tree_before and game.layout.stock.tree == 0, "Click changes tree appearance without spending items")
	game.undo()
	check(game.layout.snapshot() == before_cycle, "Undo restores previous tree appearance and inventory")
	var sprite := game.tree_nodes[0] as Sprite2D
	var pixels := sprite.texture.get_image()
	var canopy_hit := false
	for y in range(20, 130):
		for x in range(40, 150):
			if pixels.get_pixel(x, y).a > 0.95:
				var point: Vector2 = sprite.to_global(Vector2(x, y) - Vector2(pixels.get_width() / 16.0, pixels.get_height() / 2.0) + sprite.offset)
				canopy_hit = game.clicked_cell(point) == Vector2i(1, 0)
				break
		if canopy_hit: break
	check(canopy_hit, "Clicking tree canopy targets its owning tile")
	game.layout.flora_rng.seed = 4004
	for attempt in range(8):
		game.apply_edit(Vector2i(1, 0)) # Cycle does not spend stock.
		game.selected = "remove"
		game.apply_edit(Vector2i(1, 0))
		game.selected = "tree"
		game.refresh()
		game.terrain.hover = Vector2i(1, 0)
		game.terrain.preview_position = game.layout.center(Vector2i(1, 0)) - Vector2(0, game.layout.height_at(Vector2i(1, 0)))
		var preview: Image = game.terrain.clipped_tree_preview_texture().get_image()
		check(game.apply_edit(Vector2i(1, 0)), "Previewed tree can be placed")
		var placed: Image = game.tree_nodes[0].texture.get_image()
		check(preview.get_size() == placed.get_size() and preview.get_data() == placed.get_data(), "Tree preview pixels match actual placement")
	var scroll_zoom: Vector2 = game.game_camera.zoom
	var before_scroll: Dictionary = game.layout.snapshot()
	for entry in [[MOUSE_BUTTON_WHEEL_DOWN, Vector2.DOWN], [MOUSE_BUTTON_WHEEL_UP, Vector2.UP], [MOUSE_BUTTON_WHEEL_RIGHT, Vector2.RIGHT], [MOUSE_BUTTON_WHEEL_LEFT, Vector2.LEFT]]:
		var camera_before_scroll: Vector2 = game.game_camera.position
		var wheel := InputEventMouseButton.new()
		wheel.pressed = true
		wheel.button_index = entry[0]
		game._input(wheel)
		check(game.game_camera.position == camera_before_scroll, "Wheel direction %s leaves the camera unchanged" % entry[0])
	check(game.game_camera.zoom == scroll_zoom and game.layout.snapshot() == before_scroll, "Scrolling never zooms or edits terrain")
	var before_pan: Vector2 = game.game_camera.position
	var gesture := InputEventPanGesture.new()
	gesture.delta = Vector2(1, 2)
	game._input(gesture)
	check(game.game_camera.position == before_pan and game.game_camera.zoom == scroll_zoom, "Trackpad gestures leave the camera unchanged")
	var animated = load("res://scripts/environment_sprite.gd").new()
	animated.hframes = 8
	animated.phase = -3.4
	animated._process(0.0)
	check(animated.frame >= 0 and animated.frame < 8, "Decorations at negative grid coordinates use valid animation frames")
	animated.free()
	game.queue_free()
	await process_frame
	print("Native gameplay checks: %s failures" % failures)
	quit(1 if failures else 0)
