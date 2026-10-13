extends SceneTree

var failures := 0
var completed := false
var cancelled_route: Array[Vector2] = []

func _initialize() -> void:
	run.call_deferred()

func check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)

func pending_route(world, start: Vector2, target: Vector2) -> void:
	cancelled_route = await world.bounded_tree_navigation_path(start, target)
	completed = true

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	world.preview_save_enabled = false
	world.camera_save_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	for child in world.asset_nodes:
		child.set_process(false)
	var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fps_island.json"))
	check(world.layout.restore(fixture), "Fixture restores")
	var start: Vector2 = world.layout.center(Vector2i.ZERO)
	var cases := 0
	var max_slice := 0.0
	var legacy_max := 0.0
	var optimized_max := 0.0
	var target := Vector2.ZERO
	for cell in world.layout.cells:
		var end: Vector2 = world.layout.center(cell)
		if not world.layout.walkable_point(end) or world.clear_segment(start, end):
			continue
		target = end
		var began := Time.get_ticks_usec()
		var baseline: Array[Vector2] = world.legacy_tree_navigation_path(start, end)
		legacy_max = maxf(legacy_max, (Time.get_ticks_usec() - began) / 1000.0)
		var search = world.ObstacleSearch.new(world, start, end, [], false, [])
		search.advance(Time.get_ticks_usec())
		check(search.expanded == 0, "Expired deadline performs no expansion")
		var work := 0.0
		while not search.done:
			began = Time.get_ticks_usec()
			search.advance(began + 2000)
			var elapsed := (Time.get_ticks_usec() - began) / 1000.0
			max_slice = maxf(max_slice, elapsed)
			work += elapsed

		optimized_max = maxf(optimized_max, work)
		check(search.result.is_empty() == baseline.is_empty(), "A* retains reachability")
		var previous := start
		for point in search.result:
			check(world.clear_segment(previous, point), "Original collision predicate validates every segment")
			previous = point
		if not search.result.is_empty():
			check(search.result.back().is_equal_approx(end), "Exact requested endpoint retained")
		cases += 1
	check(cases >= 7, "Blocked routes exercised")
	ProjectSettings.set_setting("gameplay/bounded_obstacle_search_enabled", true)
	var route: Array[Vector2] = await world.walking_route(start, world.layout.cell_at(target), target)
	check(not route.is_empty(), "Cooperative route completes across frames")
	# Force a yield before changing the request or geometry.
	world.navigation_frame = Engine.get_process_frames()
	world.navigation_spent_usec = 2000
	pending_route(world, start, target)
	world.movement_generation += 1
	while not completed:
		await process_frame
	check(cancelled_route.is_empty(), "Redirect cancels suspended search")
	completed = false
	world.navigation_frame = Engine.get_process_frames()
	world.navigation_spent_usec = 2000
	pending_route(world, start, target)
	world.layout.elevations[Vector2i.ZERO] = 1
	while not completed:
		await process_frame
	check(cancelled_route.is_empty(), "Layout mutation invalidates cached search")
	# Waiting or invalidated navigation cannot reserve logs at a remote pile.
	world.layout.log_piles[Vector2i(4, 0)] = 6
	world.pawn.position = start
	world.pawn.walk_to(start)
	world.construction.source = Vector2i(4, 0)
	world.construction.phase = world.construction.Phase.PICKUP
	world.navigation_pending = true
	world.construction._process(0)
	check(world.layout.house_bundle == 0, "Pending route cannot reserve remote logs")
	world.navigation_pending = false
	world.construction._process(0)
	check(world.layout.house_bundle == 0 and world.layout.log_piles[Vector2i(4, 0)] == 6, "Cancelled route preserves remote pile and inventory")
	world.pawn.position = world.layout.center(Vector2i(4, 0)) + Vector2(0.1, 0)
	world.pawn.walk_to(world.pawn.position)
	world.construction.phase = world.construction.Phase.PICKUP
	world.construction._process(0)
	check(world.layout.house_bundle == 6, "Arrival retains the existing 0.2px tolerance")
	# Ending the automatic motion must retire a pending route at the same origin.
	world.layout.restore(fixture)
	world.pawn.position = start
	world.pawn.walk_to(start)
	world.navigation_frame = Engine.get_process_frames()
	world.navigation_spent_usec = 2000
	world.walk_on_land(Vector2i(2, 2), world.layout.center(Vector2i(2, 2)))
	check(world.navigation_pending, "Motion stop fixture has a suspended route")
	var tester = root.get_node("FrameRateTest")
	tester.motion_world = world
	tester.motion_running = true
	tester.motion_start = start
	tester.motion_previous = start
	tester.receive_motion(["finish"])
	for frame in 100:
		await process_frame
	check(not world.navigation_pending and world.waypoints.is_empty() and world.pawn.destination.is_equal_approx(start), "Stopping motion cancels a route that could otherwise resume from the same origin")
	print("Bounded obstacle search: cases=", cases, " legacyMaxMs=", legacy_max, " optimizedMaxMs=", optimized_max, " sliceMaxMs=", max_slice, " failures=", failures)
	quit(0 if failures == 0 else 1)
