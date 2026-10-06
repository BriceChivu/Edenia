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
	game.queue_free()
	await process_frame
	quit(1 if failures else 0)
