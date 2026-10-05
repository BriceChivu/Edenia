extends SceneTree

var failures := 0

func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	for action in ["walking", "building", "cutting", "falling", "splash", "waiting", "respawning"]:
		var game = load("res://previews/level_five.tscn").instantiate()
		game.camera_save_enabled = false
		root.add_child(game)
		await process_frame
		game.editing = false
		game.refresh()
		game.pawn.walk_to(game.pawn.position + Vector2(16, 0))
		if action == "building":
			game.construction.phase = game.construction.Phase.HAMMERING
			game.pawn.hammering = true
		elif action == "cutting":
			game.harvesting.phase = game.harvesting.Phase.CUTTING
			game.pawn.chopping = true
		elif action in ["falling", "splash", "waiting", "respawning"]:
			game.water_phase = {"falling": game.WaterPhase.FALLING, "splash": game.WaterPhase.SPLASH, "waiting": game.WaterPhase.WAITING, "respawning": game.WaterPhase.RESPAWNING}[action]
		game.ui.launch.pressed.emit()
		check(game.editing and game.ui.panel.visible, action + ": inventory opens")
		game.ui.buttons.ground.pressed.emit()
		check(game.selected == "ground", action + ": tool selection works")
		var cell := Vector2i(-1, 0)
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = true
		click.position = game.get_global_transform_with_canvas() * game.layout.center(cell)
		game.world_pointer_down = click
		var release := click.duplicate()
		release.pressed = false
		game._input(release)
		check(game.layout.cells.has(cell), action + ": world inventory click places grass")
		game.ui.undo_button.pressed.emit()
		check(not game.layout.cells.has(cell), action + ": undo works")
		game.ui.done_button.pressed.emit()
		check(not game.editing, action + ": inventory closes")
		game.queue_free()
		await process_frame
	await check_real_construction()
	await check_real_cutting()
	await check_fall_respawn()
	print("Inventory during actions: %s failures" % failures)
	quit(1 if failures else 0)

func check_real_construction() -> void:
	var game = load("res://previews/level_five.tscn").instantiate()
	game.camera_save_enabled = false
	root.add_child(game)
	await process_frame
	game.layout.resources.wood = 6
	game.layout.house_bundle = 6
	check(game.construction.build(Vector2i(1, 1)), "Real house approach starts")
	game.toggle_editing()
	game.ui.buttons.ground.pressed.emit()
	check(game.apply_edit(Vector2i(-1, 0)) and game.construction.phase == game.construction.Phase.APPROACHING, "Editing preserves real house approach")
	game.pawn.position = game.pawn.destination if game.waypoints.is_empty() else game.waypoints.back()
	game.waypoints.clear()
	game.pawn.walk_to(game.pawn.position)
	game.construction._process(0)
	check(game.pawn.hammering, "Real hammering starts")
	check(game.apply_edit(Vector2i(-2, 0)) and game.pawn.hammering, "Editing preserves real hammering")
	game.undo()
	check(game.pawn.hammering and not game.layout.house_build.is_empty(), "Unrelated undo preserves construction")
	game.construction.advance_build(game.construction.build_started_at + 20)
	check(not game.pawn.hammering and game.layout.houses.has(Vector2i(1, 1)), "Construction completes with inventory open")
	game.queue_free()
	await process_frame

func check_real_cutting() -> void:
	var game = load("res://previews/level_five.tscn").instantiate()
	game.camera_save_enabled = false
	root.add_child(game)
	await process_frame
	var tree := Vector2i(0, 1)
	game.layout.trees[tree] = true
	game.layout.tree_types[tree] = "tree"
	game.rebuild_decorations()
	check(game.harvesting.start(tree), "Real tree cutting starts")
	game.harvesting.advance(1, Time.get_unix_time_from_system())
	game.pawn.position = game.pawn.destination if game.waypoints.is_empty() else game.waypoints.back()
	game.waypoints.clear()
	game.pawn.walk_to(game.pawn.position)
	game.harvesting.advance(0, Time.get_unix_time_from_system())
	game.editing = false
	game.toggle_editing()
	game.ui.buttons.ground.pressed.emit()
	check(game.apply_edit(Vector2i(-1, 0)) and game.pawn.chopping, "Editing preserves real tree cutting")
	game.undo()
	check(game.pawn.chopping, "Unrelated undo preserves cutting")
	game.harvesting.advance(11, Time.get_unix_time_from_system() + 11)
	game.harvesting._on_axe_swing_finished()
	check(game.layout.tree_stumps.has(tree) and game.layout.carried_wood == 1, "Cutting finishes with inventory open")
	game.queue_free()
	await process_frame

func check_fall_respawn() -> void:
	var game = load("res://previews/level_five.tscn").instantiate()
	game.camera_save_enabled = false
	root.add_child(game)
	await process_frame
	var spawn := Vector2i(3, 2)
	game.perform_water_fall(game.pawn.position, Vector2.UP, 0, game.layout.center(spawn), 0)
	game.editing = false
	game.toggle_editing()
	game.ui.action_buttons[0].pressed.emit()
	check(game.apply_edit(spawn), "Remove planned respawn tile during actual fall")
	await game.respawned
	check(game.layout.cells.has(game.layout.cell_at(game.pawn.position)), "Fall rechecks edited respawn terrain")
	check(game.editing, "Inventory remains open after actual respawn")
	game.queue_free()
	await process_frame
