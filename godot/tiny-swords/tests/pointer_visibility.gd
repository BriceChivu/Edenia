extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if ok:
		print("PASS: " + message)
	else:
		failures += 1
		push_error(message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game = load("res://scenes/level_two_preview.tscn").instantiate()
	game.island_start_enabled = false
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	root.add_child(game)
	game.touch_device = false
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(576, 248)
	game._input(motion)
	game.update_cursor()
	check(game.pointer.visible, "Game cursor appears inside the active window")
	game.get_window().mouse_exited.emit()
	check(not game.pointer.visible, "Leaving the window immediately removes the game cursor")
	game._input(motion)
	game.update_cursor()
	game.get_window().focus_exited.emit()
	game.update_cursor()
	check(not game.pointer.visible, "Losing focus removes the game cursor while macOS owns the pointer")
	game._input(motion)
	game.update_cursor()
	check(not game.pointer.visible, "Mouse motion in an inactive native window cannot draw a second pointer")
	game.get_window().focus_entered.emit()
	game._input(motion)
	game.update_cursor()
	check(game.pointer.visible, "Returning focus restores the game cursor")
	game.editing = true
	game.selected = "ground"
	game.terrain.valid = true
	game.update_cursor()
	check(game.pointer.visible and game.pointer.texture == game.UI_CURSOR, "Placement keeps the mouse pointer visible")
	var previous: Vector2 = game.pointer.position
	motion.position += Vector2(0.5, 0.25)
	game._input(motion)
	game.update_cursor()
	check((game.pointer.position - previous).is_equal_approx(Vector2(0.5, 0.25)), "Placement pointer moves freely within a grid cell")
	if DisplayServer.get_name() != "headless":
		check(Input.mouse_mode == Input.MOUSE_MODE_HIDDEN, "Returning focus hides the system pointer")
	game.touch_device = true
	game.update_cursor()
	check(not game.pointer.visible, "Touch devices hide the cursor even after mouse motion")
	var initial_zoom: float = game.game_camera.zoom.x
	game.camera_command("in")
	check(is_equal_approx(game.game_camera.zoom.x, initial_zoom), "Touch devices ignore zoom button commands")
	var first := InputEventScreenTouch.new()
	first.index = 0
	first.position = Vector2(400, 248)
	first.pressed = true
	game._input(first)
	var second := InputEventScreenTouch.new()
	second.index = 1
	second.position = Vector2(600, 248)
	second.pressed = true
	game._input(second)
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = Vector2(700, 248)
	game._input(drag)
	check(game.game_camera.zoom.x > initial_zoom, "Spreading two fingers zooms in")
	drag.position = Vector2(500, 248)
	game._input(drag)
	check(game.game_camera.zoom.x < initial_zoom, "Bringing two fingers together zooms out")
	drag.position = Vector2(4000, 248)
	game._input(drag)
	check(is_equal_approx(game.game_camera.zoom.x, 3.0), "Touch pinch zoom reaches the increased 3x upper limit")
	drag.position = Vector2(401, 248)
	game._input(drag)
	check(is_equal_approx(game.game_camera.zoom.x, preload("res://scripts/cloud_visual.gd").MIN_VIEW_ZOOM), "Pinch zoom respects the lower limit")
	first.pressed = false
	second.pressed = false
	game._input(first)
	game._input(second)
	check(game.world_pointer_down == null and game.pinch_gesture, "Lifting fingers after a pinch does not leave a pending world click")
	game.update_cursor()
	check(not game.pointer.visible, "Pinch gestures keep every game cursor hidden")
	game.camera_save_enabled = true
	game.camera_save_path = "user://touch_zoom_test.json"
	game.game_camera.zoom = Vector2.ONE * 3.0
	game.save_camera_view()
	game.game_camera.zoom = Vector2.ONE
	game.load_camera_view()
	check(is_equal_approx(game.game_camera.zoom.x, 3.0), "Saved touch zoom restores beyond the desktop limit")
	game.touch_device = false
	game.load_camera_view()
	check(is_equal_approx(game.game_camera.zoom.x, 1.5), "Desktop restore keeps its existing zoom limit")
	DirAccess.remove_absolute(game.camera_save_path)
	game.queue_free()
	await process_frame
	quit(1 if failures else 0)
