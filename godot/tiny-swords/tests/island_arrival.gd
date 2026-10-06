extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var game = load("res://scenes/level_two_preview.tscn").instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	game.playground_enabled = true
	root.add_child(game)
	var arrival = game.arrival
	arrival.set_process(false)
	var initial: Dictionary = game.saved_snapshot()
	check(not initial.island_started, "Fresh island retains its pending Start in saves")
	check(game.get_node("Water").visible and game.get_node("Clouds").visible, "Ocean and clouds remain visible")
	check(not game.terrain.visible and not game.get_node("World").visible and not game.get_node("WaterRocks").visible, "No terrain, pawn, plants or rocks before Start")
	check(arrival.button.visible and arrival.button.text == "Start", "Fresh island has the Start button")
	check(not game.ui.root.visible and not game.playground.root.visible, "Gameplay controls stay hidden before arrival")
	game.apply_study_level(2)
	game.unlock_level(2)
	game.toggle_editing()
	check(game.layout.level == 1 and not game.editing, "Claims and game controls cannot interrupt arrival")
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = Vector2(400, 208)
	game._unhandled_input(press)
	game.handle_world_click(press)
	check(game.world_pointer_down == null and game.water_phase == game.WaterPhase.READY, "World input cannot trigger an invisible pawn")
	game.playground_ready = false
	arrival.button.pressed.emit()
	check(not game.island_started, "Start waits for profile restore")
	game.playground_ready = true
	arrival.button.pressed.emit()
	check(game.terrain.visible and game.get_node("World").visible and not game.pawn.visible, "Start reveals level-one terrain without the pawn")
	check(game.saved_snapshot().island_started and not arrival.button.visible, "Start is saved and its button disappears")
	arrival._process(0.99)
	arrival.button.pressed.emit()
	check(arrival.effect == null and not game.pawn.visible, "Pawn waits a full second and repeated Start cannot reset the timer")
	arrival._process(0.01)
	check(arrival.effect != null and not game.pawn.visible, "Dust begins one second after terrain")
	var effect = arrival.effect
	effect.set_process(false)
	check(effect.dust.size() == 2 and effect.dust[0].hframes == 8 and effect.dust[1].hframes == 10, "Arrival plays both tree-cut dust atlases")
	check(effect.position == game.pawn.position and effect.z_index > game.pawn.z_index, "Dust covers the pawn at its spawn")
	arrival._process(0.2)
	check(game.pawn.visible and game.pawn.modulate.a > 0 and game.pawn.modulate.a < 1, "Pawn emerges inside the dust")
	check(not game.pawn.is_physics_processing(), "Pawn cannot walk during arrival")
	effect.advance(1.01)
	await process_frame
	await process_frame
	arrival._process(0)
	check(not arrival.blocks_gameplay() and game.pawn.visible and game.pawn.is_physics_processing(), "Pawn can play after dust completes")
	check(game.restore_saved_layout(initial) and arrival.button.visible and not game.terrain.visible, "Reload before Start retains ocean-only presentation")
	var started: Dictionary = initial.duplicate(true)
	started.island_started = true
	check(game.restore_saved_layout(started) and not arrival.blocks_gameplay() and game.pawn.visible, "Reload after Start resumes the island")
	started.erase("island_started")
	check(game.restore_saved_layout(started) and not arrival.blocks_gameplay(), "Existing saves skip the new arrival")
	started.island_started = "invalid"
	check(not game.restore_saved_layout(started) and not arrival.blocks_gameplay(), "Malformed arrival state is rejected without changing presentation")
	game.free()
	print("Island arrival: %s failures" % failures)
	quit(1 if failures else 0)
