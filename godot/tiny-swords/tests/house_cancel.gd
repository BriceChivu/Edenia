extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func arrive(game) -> void:
	game.pawn.position = game.pawn.destination if game.waypoints.is_empty() else game.waypoints.back()
	game.waypoints.clear()
	game.pawn.walk_to(game.pawn.position)
	game.construction._process(0.0)

func run() -> void:
	for scenario in ["placement", "approach", "reload", "legacy_reload", "empty_pack"]:
		var game = preload("res://previews/level_five.tscn").instantiate()
		game.camera_save_enabled = false
		root.add_child(game)
		await process_frame
		game.layout.flora.clear()
		game.layout.decorations.clear()
		var carried := 0 if scenario == "empty_pack" else 2
		game.layout.resources.wood = 6 + carried
		game.layout.carried_wood = carried
		var source := Vector2i(0, 1)
		game.layout.log_piles[source] = 6
		game.editing = false
		check(game.construction.pickup(source), scenario + ": pickup starts")
		arrive(game)
		check(game.layout.house_bundle == 6 and not game.layout.log_piles.has(source), scenario + ": six logs reserved")
		check(game.house_placement_active() and not game.ui.panel.visible and game.pawn.visible, scenario + ": placement keeps inventory closed and pawn visible")
		if scenario == "placement":
			game.toggle_editing()
			check(game.editing and game.ui.panel.visible and not game.house_placement_active(), "Manual inventory pauses house preview")
			game.selected = "ground"
			game.toggle_editing()
			check(game.house_placement_active() and game.selected == "house" and not game.ui.panel.visible and game.pawn.visible, "Closing inventory resumes house placement")
		if scenario == "approach":
			check(game.construction.build(Vector2i(1, 1)), "House approach starts")
		elif scenario in ["reload", "legacy_reload"]:
			var saved = JSON.parse_string(JSON.stringify(game.layout.snapshot()))
			if scenario == "legacy_reload":
				saved.version = 28
				saved.erase("house_bundle_source")
			check(game.restore_saved_layout(saved), "Carrying save restores")
		if scenario in ["reload", "legacy_reload"]:
			check(game.house_placement_active() and not game.ui.panel.visible and game.pawn.visible, scenario + ": reload restores placement without inventory")
		var escape := InputEventKey.new()
		escape.keycode = KEY_ESCAPE
		escape.pressed = true
		game._input(escape)
		check(not game.editing and game.construction.busy(), scenario + ": Escape sends pawn back")
		var returned: Vector2i = game.construction.source
		if scenario != "legacy_reload":
			check(returned == source, scenario + ": return route ends at original pile")
		check(game.layout.house_bundle == 6 and not game.layout.log_piles.has(returned), scenario + ": keeps carrying until arrival")
		game._input(escape)
		arrive(game)
		check(game.layout.log_piles.get(returned, 0) == 6 and game.layout.house_bundle == 0, scenario + ": six-log pyramid restored")
		check(game.layout.resources.wood == 6 + carried and game.layout.carried_wood == carried and game.layout.houses.is_empty(), scenario + ": other logs preserved and no house built")
		check(game.pawn.carrying_wood == (carried > 0), scenario + ": carrying animation matches remaining logs")
		check(game.construction.phase == game.construction.Phase.READY and not game.pawn.hammering, scenario + ": construction cancelled")
		game._input(escape)
		check(game.layout.log_piles.get(returned, 0) == 6 and game.layout.resources.wood == 6 + carried, scenario + ": repeated Escape cannot duplicate logs")
		game.queue_free()
		await process_frame
	print("House cancellation checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
