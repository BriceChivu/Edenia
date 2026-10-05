extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.construction.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	var site := Vector2i(1, 1)
	for square in [Vector2i(0, 2), Vector2i(1, 2), Vector2i(2, 1), Vector2i(2, 2)]:
		check(scene.layout.edit(square, "ground", Vector2i(-10, -10), 0), "Fixture adds foundation and lower work tile")
	scene.layout.manual_ground_elevation = true
	for square in scene.layout.house_cells(site):
		scene.layout.cells[square] = "high_meadow"
		scene.layout.elevations[square] = 64
	scene.layout.resources.wood = 6
	scene.layout.house_bundle = 6
	var lower: Vector2 = scene.layout.center(site) + Vector2(-49, 68)
	scene.pawn.position = lower
	scene.pawn.walk_to(lower)
	check(scene.construction.placement_plan(site).is_empty(), "Lower-floor worker cannot build an unreachable elevated house")
	for requested in [Vector2.ZERO, Vector2(-32, -32), Vector2(32, 32)]:
		var offset: Vector2 = scene.layout.house_placement_offset(requested)
		scene.pawn.position = scene.layout.center(site) + Vector2(-20, 0)
		scene.pawn.walk_to(scene.pawn.position)
		var plan: Dictionary = scene.construction.placement_plan(site, offset)
		check(not plan.is_empty(), "Elevated house remains reachable at pointer offset %s" % offset)
		if not plan.is_empty():
			check(plan.layout.height_at(plan.layout.cell_at(plan.route.back())) == plan.layout.height_at(site), "Work destination shares the house floor")
	scene.pawn.position = scene.layout.center(site) + Vector2(-20, 0)
	scene.pawn.walk_to(scene.pawn.position)
	check(scene.construction.build(site, Vector2.ZERO), "Same-floor approach starts construction")
	scene.pawn.position = scene.waypoints.back() if not scene.waypoints.is_empty() else scene.pawn.destination
	scene.waypoints.clear()
	scene.pawn.walk_to(scene.pawn.position)
	scene.construction._process(0)
	check(scene.pawn.hammering and scene.ground_height(scene.pawn.position) == scene.layout.height_at(site), "Hammering starts on the house floor")
	scene.layout.house_build.pawn_x = lower.x
	scene.layout.house_build.pawn_y = lower.y
	scene.construction.phase = scene.construction.Phase.READY
	scene.construction.resume_build()
	check(scene.pawn.hammering and scene.ground_height(scene.pawn.position) == scene.layout.height_at(site), "Legacy saved worker resumes on the house floor")
	check(scene.layout.house_build.pawn_x == scene.pawn.position.x and scene.layout.house_build.pawn_y == scene.pawn.position.y, "Corrected worker position is retained in construction save")
	scene.queue_free()
	await process_frame
	print("House worker floor checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
