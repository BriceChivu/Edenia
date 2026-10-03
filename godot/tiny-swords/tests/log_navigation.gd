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
		# Room on both sides must accommodate the pawn's boots, not just its anchor.
		layout.cells.clear()
		for x in range(-1, 2):
			for y in range(-1, 2):
				layout.cells[cell + Vector2i(x, y)] = "meadow"
		check(not layout.walkable_point(center + Vector2(0, 16)), "Log %d blocks its contact patch" % count)
		check(layout.walkable_point(center), "Log %d leaves delivery approach clear" % count)
		for direction in [Vector2i.RIGHT, Vector2i.DOWN]:
			var start: Vector2 = layout.center(cell - direction)
			var target: Vector2 = layout.center(cell + direction)
			if direction == Vector2i.RIGHT:
				start.y += 16
				target.y += 16
			check(not world.clear_segment(start, target), "Direct route intersects log %d" % count)
			var route: Array[Vector2] = world.land_route(start, layout.cell_at(target), target)
			check(not route.is_empty() and route.back().is_equal_approx(target), "Route goes around log %d when both feet fit" % count)
			var previous := start
			for point in route:
				check(world.clear_segment(previous, point), "Every route segment avoids log %d with both feet" % count)
				previous = point
		var patch: PackedVector2Array = layout.log_footprint(cell)
		var left_probe := Vector2(patch[0].x - 19, patch[0].y)
		var right_probe := Vector2(patch[2].x + 19, patch[2].y)
		check(not Geometry2D.is_point_in_polygon(left_probe, patch) and not layout.walkable_point(left_probe), "Right boot cannot enter the left contact edge")
		check(not Geometry2D.is_point_in_polygon(right_probe, patch) and not layout.walkable_point(right_probe), "Left boot cannot enter the right contact edge")
		check(world.clear_segment(center + Vector2(-64, 0), center + Vector2(64, 0)), "Grass behind the contact patch stays accessible")
		# The boot sweep must catch a brief diagonal corner intersection between
		# the ordinary four-pixel terrain samples.
		var corner := patch[0] + Vector2(-20, 1)
		check(not world.clear_segment(corner + Vector2(-1, 1), corner + Vector2(1, -1)), "Swept feet cannot cut a footprint corner")
		layout.cells = {cell: "meadow", cell + Vector2i.LEFT: "meadow"}
		var left_start := center + Vector2(-24, -16)
		var left_target := center + Vector2(-24, 24)
		var left_route: Array[Vector2] = world.land_route(left_start, cell, left_target)
		check(not left_route.is_empty() and left_route.back().is_equal_approx(left_target), "Left-side passage stays reachable for %d logs using adjacent grass" % count)
		var previous := left_start
		var uses_left_grass := false
		for point in left_route:
			check(world.clear_segment(previous, point), "Left passage keeps both soles outside the contact patch")
			if point.x < center.x - 32:
				uses_left_grass = true
			previous = point
		check(uses_left_grass, "Left passage routes around the physical footprint")
	print("Log navigation checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
