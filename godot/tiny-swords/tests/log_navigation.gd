extends SceneTree

var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(condition: bool, label: String) -> void:
	if not condition:
		failures += 1
		push_error(label)

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	var layout = world.layout
	layout.trees.clear()
	layout.cells.clear()
	layout.elevations.clear()
	var cell := Vector2i(1, 0)
	var center: Vector2 = layout.center(cell)
	for count in range(1, 7):
		layout.log_piles = {cell: count}
		for vertical in [false, true]:
			layout.cells.clear()
			var direction := Vector2i.DOWN if vertical else Vector2i.RIGHT
			for offset in [-1, 0, 1]:
				layout.cells[cell + direction * offset] = "meadow"
			check(not layout.walkable_point(center + Vector2(0, 16)), "Log %d blocks its ground footprint" % count)
			check(layout.walkable_point(center), "Log %d leaves delivery approach clear" % count)
			var start: Vector2 = layout.center(cell - direction)
			var target: Vector2 = layout.center(cell + direction)
			if not vertical:
				start.y += 16
				target.y += 16
			check(not world.clear_segment(start, target), "Direct route intersects log %d" % count)
			var route: Array[Vector2] = world.land_route(start, layout.cell_at(target), target)
			check(not route.is_empty() and route.back().is_equal_approx(target), "Single-tile corridor remains passable around log %d" % count)
			var previous := start
			for point in route:
				check(world.clear_segment(previous, point), "Every route segment avoids log %d" % count)
				previous = point
		# Isolate the tile so a route cannot bypass the rule on adjacent grass.
		layout.cells = {cell: "meadow"}
		var left_start := center + Vector2(-24, -16)
		var left_target := center + Vector2(-24, 24)
		var right_start := center + Vector2(24, -16)
		var right_target := center + Vector2(24, 24)
		check(world.clear_segment(left_start, left_target), "Left passage stays open for %d logs" % count)
		check(world.clear_segment(right_start, right_target) == (count < 3), "Right passage closes only for three or more logs")
		var side_route: Array[Vector2] = world.land_route(right_start, cell, right_target)
		check(not side_route.is_empty() and side_route.back().is_equal_approx(right_target), "Right-side click remains reachable around %d logs" % count)
		if count >= 3:
			var passes_left := false
			for point in side_route:
				if point.x < center.x - 23:
					passes_left = true
			check(passes_left, "Three or more logs route the pawn around the left side")
	print("Log navigation checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
