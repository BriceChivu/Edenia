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
	level.preview_save_enabled = false
	root.add_child(level)
	await process_frame
	var l = level.layout
	# Adjacent ramps with the same slope share a continuous side edge.
	l.cells = {Vector2i(-1,0): "meadow", Vector2i(0,0): "stairs", Vector2i(1,0): "high_gold", Vector2i(-1,1): "meadow", Vector2i(0,1): "stairs", Vector2i(1,1): "high_gold"}
	l.elevations.clear()
	l.stair_directions = {Vector2i(0,0): Vector2i.RIGHT, Vector2i(0,1): Vector2i.RIGHT}
	l.trees.clear()
	l.flora.clear()
	var start: Vector2 = l.center(Vector2i(0,0))
	var target: Vector2 = l.center(Vector2i(0,1))
	check(level.clear_segment(start, target), "Adjoining ramps allow direct sideways crossing")
	check(l.can_cross(Vector2i(0,0), Vector2i(0,1)) and l.can_cross(Vector2i(0,1), Vector2i(0,0)), "Ramp side connection works both ways")
	l.elevations[Vector2i(0,1)] = 64
	check(not level.clear_segment(start, target), "Different ramp elevations remain blocked")
	l.elevations.clear()
	l.stair_directions[Vector2i(0,1)] = Vector2i.LEFT
	check(not level.clear_segment(start + Vector2(16,0), target + Vector2(16,0)), "Opposite slopes cannot open a mismatched side edge")
	l.stair_directions[Vector2i(0,1)] = Vector2i.RIGHT
	l.cells[Vector2i(0,1)] = "meadow"
	check(not level.clear_segment(start, target), "Ordinary grass cannot enter a stair side")
	l.cells[Vector2i(0,1)] = "stairs"
	level.pawn.set_physics_process(false)
	for destination in [target, start]:
		level.pawn.position = start if destination == target else target
		level.pawn.walk_to(level.pawn.position)
		level.walk_on_land(l.cell_at(destination), destination)
		check(level.pawn.destination.distance_to(destination) < 1 and level.waypoints.is_empty(), "Pawn chooses direct crossing without a detour")
		for tick in range(240):
			level.pawn._physics_process(1.0 / 60.0)
			level._process(0)
		check(level.pawn.position.distance_to(destination) < 1, "Actual pawn crosses shallow strip in both directions")
	for direction in [Vector2i.LEFT, Vector2i.RIGHT]:
		l.stair_directions[Vector2i(0,0)] = direction
		l.stair_directions[Vector2i(0,1)] = direction
		for offset in [-20, 0, 20]:
			var a := start + Vector2(offset, 0)
			var b := target + Vector2(offset, 0)
			check(level.clear_segment(a, b) and is_equal_approx(level.ground_height(a), level.ground_height(b)), "Either ramp orientation crosses sideways at a continuous height")
	print("Shallow stair crossing: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
