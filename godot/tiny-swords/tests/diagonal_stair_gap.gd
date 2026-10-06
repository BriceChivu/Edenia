extends SceneTree
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.island_start_enabled = false
	level.preview_save_enabled = false
	root.add_child(level)
	await process_frame
	var l = level.layout
	l.cells = {Vector2i(0,0): "meadow", Vector2i(1,1): "meadow", Vector2i(1,0): "stairs", Vector2i(0,1): "stairs"}
	l.elevations.clear()
	l.trees.clear()
	l.stair_directions = {Vector2i(1,0): Vector2i.RIGHT, Vector2i(0,1): Vector2i.LEFT}
	var a: Vector2 = l.center(Vector2i(0,0))
	var b: Vector2 = l.center(Vector2i(1,1))
	check(not l.path(l.cell_at(a), l.cell_at(b)).is_empty(), "Diagonal stair gap has a route")
	check(level.clear_segment(a,b) and level.clear_segment(b,a), "Diagonal stair gap permits direct passage both ways")
	level.pawn.set_physics_process(false)
	for target in [b,a]:
		level.pawn.position = a if target == b else b
		level.pawn.walk_to(level.pawn.position)
		level.walk_on_land(l.cell_at(target), target)
		for tick in range(240):
			level.pawn._physics_process(1.0/60.0)
			level._process(0)
		check(level.pawn.position.distance_to(target) < 1, "Pawn reaches destination through diagonal gap")
	l.trees[Vector2i(-4,-4)] = true
	check(not level.tree_navigation_path(a,b).is_empty(), "Tree navigation also finds the diagonal gap")
	l.trees.clear()
	l.stair_directions[Vector2i(1,0)] = Vector2i.LEFT
	check(not level.clear_segment(a,b), "Raised stair corner remains blocked")
	l.stair_directions[Vector2i(1,0)] = Vector2i.RIGHT
	l.elevations[Vector2i(1,1)] = 64
	check(not level.clear_segment(a,b), "Different floor heights remain blocked")
	l.elevations.clear()
	l.cells.erase(Vector2i(1,0))
	check(not level.clear_segment(a,b), "Missing terrain does not allow corner crossing")
	print("Diagonal stair gap: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
