extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.trees.clear()
	scene.layout.cells.clear()
	scene.layout.stair_directions.clear()
	for cell in [Vector2i.ZERO, Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
		scene.layout.cells[cell] = "meadow"
	scene.layout.sheep.assign([scene.layout.center(Vector2i.ZERO)])
	scene.rebuild_decorations()
	var sheep = scene.asset_nodes[0]
	sheep.set_process(false)
	scene.editing = false
	scene.pawn.position = scene.layout.center(Vector2i(8, 8))
	sheep.previous_pawn_position = scene.pawn.position
	var origin: Vector2 = sheep.position
	var cycle: float = sheep.IDLE_SECONDS + sheep.GRASS_SECONDS
	var seen := {}
	for attempt in 100:
		var target: Vector2 = sheep.adjacent_grass_target()
		check(scene.layout.cell_at(target) in scene.layout.STEPS, "Wander target is cardinally adjacent grass")
		seen[scene.layout.cell_at(target)] = true
		sheep.reset_grazing()
		check(sheep.grazing_target >= 10 and sheep.grazing_target <= 15, "Grazing threshold is 10 through 15")
	check(seen.size() == 4, "Random selection reaches every eligible neighbor")
	for count in [10, 15]:
		sheep.position = origin
		scene.layout.sheep[0] = origin
		sheep.reset_grazing()
		sheep.grazing_target = count
		sheep.updated_at = 100.0
		sheep.advance(cycle * (count - 1), 100.0)
		check(sheep.grazing_cycles == count - 1 and not sheep.fleeing, "Complete grass loops count without early wandering")
		sheep.advance(cycle - 0.01, 100.0)
		check(not sheep.fleeing and sheep.texture == sheep.Art.SHEEP_GRASS, "Last grazing animation finishes before movement")
		sheep.advance(0.011, 100.0)
		check(sheep.fleeing and sheep.texture == sheep.Art.SHEEP_RUN, "Threshold starts adjacent movement")
		sheep.advance(1.0, 100.0)
		check(not sheep.fleeing and scene.layout.cell_at(sheep.position) in scene.layout.STEPS, "Wandering reaches adjacent tile and returns to rest")
	# A single resumed frame must account for multiple grazing/movement cycles.
	seed(12345)
	sheep.position = origin
	scene.layout.sheep[0] = origin
	sheep.reset_grazing()
	sheep.updated_at = 100.0
	for tick in 1200:
		sheep.advance(0.1, 100.0)
	var active_position: Vector2 = sheep.position
	var active_cycles: int = sheep.grazing_cycles
	var active_target: int = sheep.grazing_target
	var active_rest: float = sheep.resting_time
	seed(12345)
	sheep.position = origin
	scene.layout.sheep[0] = origin
	sheep.fleeing = false
	sheep.escape_route.clear()
	sheep.reset_grazing()
	sheep.updated_at = 100.0
	sheep.advance(0.016, 220.0)
	check(sheep.position.distance_to(active_position) < 0.001 and sheep.grazing_cycles == active_cycles and sheep.grazing_target == active_target and absf(sheep.resting_time - active_rest) < 0.001, "Two-minute background catch-up matches continuous playback")
	for hidden_seconds in [60.37, 1800.37, 7200.37]:
		var states: Array = []
		for suspended in [false, true]:
			seed(12345)
			sheep.position = origin
			scene.layout.sheep[0] = origin
			sheep.fleeing = false
			sheep.escape_route.clear()
			sheep.tile_destinations.clear()
			sheep.reset_grazing()
			sheep.updated_at = 100.0
			if suspended:
				sheep.advance(0.016, 100.0 + hidden_seconds)
			else:
				var remaining: float = hidden_seconds
				while remaining > 0:
					var step := minf(0.1, remaining)
					sheep.advance(step, 100.0)
					remaining -= step
			states.append([sheep.position, sheep.grazing_cycles, sheep.grazing_target, sheep.resting_time])
		check(states[0][0].distance_to(states[1][0]) < 0.001 and states[0][1] == states[1][1] and states[0][2] == states[1][2] and absf(states[0][3] - states[1][3]) < 0.001, "Long clock catch-up matches continuous grazing: %s seconds" % hidden_seconds)
	# Building counts grazing but defers wandering until gameplay resumes.
	sheep.position = origin
	scene.layout.sheep[0] = origin
	sheep.fleeing = false
	sheep.escape_route.clear()
	sheep.reset_grazing()
	sheep.grazing_target = 10
	scene.editing = true
	sheep.updated_at = 100.0
	sheep.advance(0.016, 150.0)
	check(sheep.position == origin and sheep.grazing_cycles == 10, "Building counts cycles without moving")
	scene.editing = false
	sheep.advance(0.01, 150.0)
	check(sheep.fleeing, "Completed grazing can move when building closes")
	# Sheep may wander through bushes and rocks without removing them.
	sheep.position = origin
	scene.layout.sheep[0] = origin
	scene.layout.flora[Vector2i.LEFT] = 1
	scene.layout.decorations[Vector2i.RIGHT] = {"kind": "land_rock", "variant": 1}
	var decorated_neighbors := {}
	for attempt in 100:
		decorated_neighbors[scene.layout.cell_at(sheep.adjacent_grass_target())] = true
	check(decorated_neighbors.has(Vector2i.LEFT) and decorated_neighbors.has(Vector2i.RIGHT), "Wandering can enter both bush and rock tiles")
	check(scene.layout.flora.has(Vector2i.LEFT) and scene.layout.decorations.has(Vector2i.RIGHT), "Sheep movement preserves bushes and rocks")
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	# Water, disconnected higher ground and the pawn cannot become wander targets.
	sheep.position = origin
	scene.layout.sheep[0] = origin
	sheep.fleeing = false
	sheep.escape_route.clear()
	scene.layout.cells.erase(Vector2i.LEFT)
	scene.layout.elevations[Vector2i.RIGHT] = 1
	scene.layout.log_piles[Vector2i.UP] = 1
	scene.pawn.position = scene.layout.center(Vector2i.DOWN)
	check(scene.layout.cell_at(sheep.adjacent_grass_target()) == Vector2i.UP, "Wandering can use safe ground in the log tile")
	scene.layout.cells.erase(Vector2i.UP)
	scene.layout.log_piles.clear()
	check(sheep.adjacent_grass_target() == origin, "No target across water, height or pawn")
	sheep.reset_grazing()
	sheep.grazing_target = 10
	sheep.advance(cycle * 10 + 0.01, 150.0)
	check(not sheep.fleeing and sheep.position == origin, "Trapped sheep stays safely on its grass")
	scene.queue_free()
	await process_frame
	print("Sheep grazing checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
