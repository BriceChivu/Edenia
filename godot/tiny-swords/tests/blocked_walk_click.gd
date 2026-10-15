extends SceneTree

var failures := 0
var checks := 0

func check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(label)

func _initialize() -> void:
	run.call_deferred()

func click_walk(world, start: Vector2, target: Vector2) -> Array[Vector2]:
	world.pawn.position = start
	world.pawn.walk_to(start)
	world.waypoints.clear()
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = world.get_global_transform_with_canvas() * target
	world._unhandled_input(click)
	var release: InputEventMouseButton = click.duplicate()
	release.pressed = false
	world._input(release)
	while world.navigation_pending:
		await process_frame
	var route: Array[Vector2] = [world.pawn.destination]
	route.append_array(world.waypoints)
	var previous := start
	for point in route:
		check(world.clear_segment(previous, point), "Every movement segment respects the protected contact areas")
		previous = point
	return route

func run() -> void:
	var world = load("res://previews/level_five.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	world.harvesting.set_process(false)
	world.editing = false
	world.refresh()
	var l = world.layout
	l.cells.clear()
	l.elevations.clear()
	l.flora.clear()
	l.decorations.clear()
	for cell in [Vector2i(0, 1), Vector2i(1, 1)]:
		l.cells[cell] = "meadow"
	var rock := Vector2i(0, 1)
	var center: Vector2 = l.center(rock)
	var start := center + Vector2(70, 0)
	for bounded in [false, true]:
		ProjectSettings.set_setting("gameplay/bounded_obstacle_search_enabled", bounded)
		for variant in range(1, 5):
			l.decorations[rock] = {"kind":"land_rock", "variant":variant}
			world.rebuild_decorations()
			var patch: PackedVector2Array = l.rock_footprint(rock)
			var target := center + Vector2(18, 18)
			if variant != 1:
				target = Vector2.ZERO
				for point in patch:
					target += point / patch.size()
			check(not l.walkable_point(target), "Repro click overlaps the rock's protected foot contact")
			var route: Array[Vector2] = await click_walk(world, start, target)
			var endpoint: Vector2 = route.back()
			check(endpoint != start, "Click beside rock moves pawn toward closest safe position")
			check(l.walkable_point(endpoint), "Fallback destination stays outside the protected face")
			# A one-pixel independent reference bounds distance without mirroring
			# the geometric projection or navigation implementation.
			var reference := INF
			for y in range(-25, 26):
				for x in range(-25, 56):
					var point := center + Vector2(x, y)
					if l.walkable_point(point):
						reference = minf(reference, point.distance_to(target))
			check(endpoint.distance_to(target) <= reference + 0.25, "Closest approach matches or improves the independent pixel reference")
			# Reachable clicks keep their precise destination, including grass
			# in the blue area behind the rock rather than its tile center.
			var blue := center - Vector2(0, 20)
			route = await click_walk(world, start, blue)
			check(route.back().is_equal_approx(blue), "Reachable grass behind rock retains the exact click")
			# Action navigation must not mistake a closest approach for arrival.
			check(world.land_route(start, rock, target).is_empty(), "Strict action routes still reject blocked endpoints")
		# Clicking a disconnected but visible grass tile approaches the shore
		# of the pawn's connected island instead of silently doing nothing.
		l.decorations.clear()
		l.cells[Vector2i(4, 1)] = "meadow"
		var unreachable: Vector2 = l.center(Vector2i(4, 1))
		var route: Array[Vector2] = await click_walk(world, start, unreachable)
		check(l.cell_at(route.back()) == Vector2i(1,1) and route.back().x > start.x, "Unreachable click approaches from connected grass")
		check(absf(route.back().x - (l.ORIGIN.x + 128 - 7)) < 0.25, "Disconnected target stops at the safe shoreline foot margin")
		l.cells.erase(Vector2i(4,1))
		var edge := center + Vector2(-31, 0)
		route = await click_walk(world, start, edge)
		check(route.back().distance_to(center + Vector2(-25,0)) < 0.25, "Blocked shore click approaches its nearest safe point")
	# A newer ordinary click cancels a nearest-approach search while it yields.
	var distant: Vector2 = l.center(Vector2i(1,1)) + Vector2(20, 15)
	world.pawn.position = start
	world.pawn.walk_to(start)
	world.waypoints.clear()
	world.navigation_frame = Engine.get_process_frames()
	world.navigation_spent_usec = world.NAVIGATION_BUDGET_USEC
	world.walk_on_land(Vector2i(4,1), l.center(Vector2i(4,1)), true)
	check(world.navigation_pending, "Closest-approach search yields when its frame budget is spent")
	world.walk_on_land(l.cell_at(distant), distant, true)
	await process_frame
	await process_frame
	check(not world.navigation_pending and world.pawn.destination.is_equal_approx(distant), "New click wins over a pending closest-approach route")
	world.queue_free()
	await process_frame
	print("Blocked walking click: ", checks, " checks; failures=", failures)
	quit(0 if failures == 0 else 1)
