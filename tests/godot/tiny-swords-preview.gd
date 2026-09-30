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
	game.queue_free()
	await process_frame
	print("Native gameplay checks: %s failures" % failures)
	quit(1 if failures else 0)
