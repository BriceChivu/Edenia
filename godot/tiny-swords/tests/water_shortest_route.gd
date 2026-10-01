extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_one.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var start: Vector2 = level.layout.center(Vector2i(1, 1))
	level.pawn.position = start
	# The click is nearer the upper-right water tile, but reaching it by land
	# adds an unnecessary northward detour before the eastward jump.
	level.fall_into_water(start + Vector2(400, -70))
	var detour: bool = level.water_phase == level.WaterPhase.APPROACHING
	if detour:
		push_error("Water jump must use the shorter exit from the pawn's current shore")
	print("Shortest water route: ", "FAIL" if detour else "PASS")
	level.queue_free()
	quit(1 if detour else 0)
