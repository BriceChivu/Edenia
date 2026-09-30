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
	var game = load("res://scenes/xp_preview.tscn").instantiate()
	root.add_child(game)
	game.study_camera.force_update_scroll()
	check(is_equal_approx(game.study_camera.zoom.x, 0.8), "Default view is 20 percent farther out")
	var camera_start: Vector2 = game.study_camera.position
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
	check(game.study_camera.position.x < camera_start.x and game.study_camera.position.y < camera_start.y, "Mouse dragging pans both camera axes")
	check(game.pawn.position == pawn_start and game.layout.snapshot() == layout_start, "Dragging does not move pawn or edit land")
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
		var blocked_press := InputEventMouseButton.new()
		blocked_press.pressed = true
		blocked_press.button_index = MOUSE_BUTTON_LEFT
		blocked_press.position = Vector2(672, 208)
		game._unhandled_input(blocked_press)
		var blocked_release := InputEventMouseButton.new()
		blocked_release.button_index = MOUSE_BUTTON_LEFT
		blocked_release.position = blocked_press.position
		game._input(blocked_release)
		check(game.layout.snapshot() == before_animation_build, "Terrain edits wait safely during water phase %s" % phase)
		game.toggle_editing()
	check(game.layout.snapshot() == before_animation_build, "Opening build mode during animation does not edit terrain")
	game.water_phase = game.WaterPhase.READY
	game.layout.cells[Vector2i(0, 0)] = "high_meadow"
	game.pawn.position = game.layout.center(Vector2i(0, 0))
	game.pawn.walk_to(game.pawn.position)
	game.fall_into_water(Vector2(400, 208))
	check(game.water_phase == game.WaterPhase.READY and game.pawn.destination == game.pawn.position, "High ground cannot initiate a water jump")
	game.layout.cells[Vector2i(0, 0)] = "meadow"
	game.fall_into_water(Vector2(400, 208))
	check(game.water_phase != game.WaterPhase.READY, "Ground-level shore still permits water jumps")
	var grid_size: Vector2i = game.layout.MAX_CELL - game.layout.MIN_CELL + Vector2i.ONE
	check(grid_size == Vector2i(27, 10) and grid_size.x * grid_size.y == 270, "Build grid contains exactly 270 squares, three times the previous 90")
	check(game.layout.in_bounds(Vector2i(-12, -4)) and game.layout.in_bounds(Vector2i(14, 5)), "Expanded grid admits both new boundary corners")
	check(not game.layout.in_bounds(Vector2i(-13, -4)) and not game.layout.in_bounds(Vector2i(15, 5)), "Expanded grid still rejects outside squares")
	game.refresh()
	check(game.ui.buttons.ground.visible and game.ui.buttons.stairs.visible and not game.ui.buttons.tree.visible, "Level two shows ground and stairs, with no locked pine button")
	var stocked: Dictionary = game.layout.snapshot()
	game.layout.stock.meadow = 0
	game.layout.stock.gold = 0
	game.refresh()
	check(game.ui.buttons.ground.visible and game.ui.buttons.ground.disabled, "Unlocked empty inventory remains visible and disabled")
	game.layout.restore(stocked)
	game.water_phase = game.WaterPhase.READY
	game.ui.max_preview_level = 3
	game.unlock_level(3)
	check(game.ui.buttons.tree.visible and game.layout.stock.tree == 1, "Level three reveals pine and credits its existing reward")
	var scroll_zoom: Vector2 = game.study_camera.zoom
	var before_scroll: Dictionary = game.layout.snapshot()
	for entry in [[MOUSE_BUTTON_WHEEL_DOWN, Vector2.DOWN], [MOUSE_BUTTON_WHEEL_UP, Vector2.UP], [MOUSE_BUTTON_WHEEL_RIGHT, Vector2.RIGHT], [MOUSE_BUTTON_WHEEL_LEFT, Vector2.LEFT]]:
		var camera_before_scroll: Vector2 = game.study_camera.position
		var wheel := InputEventMouseButton.new()
		wheel.pressed = true
		wheel.button_index = entry[0]
		game._input(wheel)
		check(game.study_camera.position == camera_before_scroll, "Wheel direction %s leaves the camera unchanged" % entry[0])
	check(game.study_camera.zoom == scroll_zoom and game.layout.snapshot() == before_scroll, "Scrolling never zooms or edits terrain")
	var before_pan: Vector2 = game.study_camera.position
	var gesture := InputEventPanGesture.new()
	gesture.delta = Vector2(1, 2)
	game._input(gesture)
	check(game.study_camera.position == before_pan and game.study_camera.zoom == scroll_zoom, "Trackpad gestures leave the camera unchanged")
	for cloud in game.get_node("Clouds").get_children():
		for height in [0.0, 0.3, 0.7, 1.0]:
			cloud.set_altitude(height)
			check(cloud.z_index == 5 and not cloud.z_as_relative, "Cloud body stays above raised terrain at altitude %s" % height)
			check(cloud.shadow_sprite.z_index == -10 and not cloud.shadow_sprite.z_as_relative, "Cloud shadow keeps its separate world layer")
	game.queue_free()
	await process_frame
	print("Native gameplay checks: %s failures" % failures)
	quit(1 if failures else 0)
