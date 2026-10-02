extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_four.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var cell := Vector2i(1, 0)
	level.layout.cells[Vector2i(1, -1)] = "grass"
	level.layout.cells[cell] = "grass"
	level.layout.elevations[cell] = 0
	level.layout.trees[cell] = Vector2.ZERO
	level.layout.tree_types[cell] = "tree"
	level.rebuild_decorations()
	var target: Vector2 = level.layout.tree_position(cell) - Vector2(0, 26)
	assert(level.layout.walkable_point(target))
	var route: Array[Vector2] = level.land_route(level.layout.center(Vector2i.ZERO), level.layout.cell_at(target), target)
	assert(not route.is_empty() and route.back().is_equal_approx(target), "Click just behind trunk must preserve its walking target")
	assert(level.tree_at(target) == level.Harvesting.NO_TREE, "Ground behind trunk must allow walking instead of harvesting")
	var anchor: Vector2 = level.layout.tree_position(cell)
	assert(not level.layout.walkable_point(anchor - Vector2(0, 14)), "Trunk itself still blocks movement")
	for side in [-12.0, 12.0]:
		var beside := anchor + Vector2(side, -14)
		assert(level.layout.walkable_point(beside), "Ground close to either side of trunk must be reachable")
		var side_route: Array[Vector2] = level.land_route(level.layout.center(Vector2i.ZERO), cell, beside)
		assert(not side_route.is_empty() and side_route.back().is_equal_approx(beside))
	print("PASS: Ground just behind trunk remains clickable and reachable")
	quit()
