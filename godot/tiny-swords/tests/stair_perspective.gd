extends SceneTree
var failures := 0
func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.island_start_enabled = false
	level.preview_save_enabled = false
	root.add_child(level)
	await process_frame
	var l = level.layout
	l.cells = {Vector2i(0,0): "meadow", Vector2i(1,0): "stairs", Vector2i(2,0): "high_gold", Vector2i(2,-1): "meadow"}
	l.stair_directions = {Vector2i(1,0): Vector2i.RIGHT}
	l.trees.clear()
	l.flora.clear()
	check(not level.clear_segment(l.center(Vector2i(2,-1)), l.center(Vector2i(2,0))), "A lower-ground route cannot cross the back cliff")
	check(l.path(Vector2i(0,0), Vector2i(2,0)) == [Vector2i(1,0), Vector2i(2,0)], "Ascending requires the stair")
	check(l.path(Vector2i(2,0), Vector2i(0,0)) == [Vector2i(1,0), Vector2i(0,0)], "Descending requires the stair")
	l.cells[Vector2i(2,0)] = "meadow"
	check(not l.can_cross(Vector2i(1,0), Vector2i(2,0)), "Stair high end cannot connect to lower ground")
	l.cells[Vector2i(2,0)] = "high_gold"
	level.rebuild_decorations()
	check(level.get_node("World").get_children().any(func(node): return node is Node2D and node.has_meta("terrain_occluder")), "Raised ground and stairs participate in world depth sorting")
	level.pawn.set_physics_process(false)
	level.pawn.position = l.center(Vector2i(0,0))
	level.pawn.walk_to(level.pawn.position)
	for destination in [Vector2i(2,0), Vector2i(0,0)]:
		level.walk_on_land(destination, l.center(destination))
		var previous: Vector2i = l.cell_at(level.pawn.position)
		var visited_stairs := false
		for tick in range(240):
			level.pawn._physics_process(1.0 / 60.0)
			level._process(0)
			var current: Vector2i = l.cell_at(level.pawn.position)
			if current != previous:
				check(l.can_cross(previous, current), "Actual pawn route never crosses a cliff or stair side")
			visited_stairs = visited_stairs or current == Vector2i(1,0)
			previous = current
		check(visited_stairs and level.pawn.position.distance_to(l.center(destination)) < 1, "Pawn completes both directions through the stair")
		check(level.pawn.z_index == (1 if destination.x == 2 else 0), "Pawn returns to lower-ground depth after descending")
	var pieces: Array = level.get_node("World").get_children().filter(func(node): return node.has_meta("terrain_occluder"))
	for surface in pieces:
		check(surface.z_index == 0, "Terrain shares the receiving floor depth; pixel tests cover the moving stair edge")
	print("Stair perspective: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
