extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	var layout = world.layout
	layout.cells.clear()
	layout.elevations.clear()
	layout.trees.clear()
	for x in range(4):
		for y in range(3):
			layout.cells[Vector2i(x, y)] = "meadow"
	layout.trees[Vector2i(1, 1)] = 1
	world.pawn.position = layout.center(Vector2i(3, 1))
	world.pawn.walk_to(world.pawn.position)
	var began := Time.get_ticks_usec()
	world.fall_into_water(world.pawn.position + Vector2(160, 0))
	var elapsed_ms := (Time.get_ticks_usec() - began) / 1000.0
	print("Water click blocking time: %.2f ms" % elapsed_ms)
	var failed: bool = elapsed_ms > 16.0 or world.water_phase != world.WaterPhase.FALLING
	if failed:
		push_error("Water click at the shore must start falling within one frame")
	world.queue_free()
	quit(1 if failed else 0)
