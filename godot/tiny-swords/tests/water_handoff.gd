extends SceneTree
var failures := 0
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var level = load("res://previews/level_one.tscn").instantiate()
	root.add_child(level)
	await process_frame
	for case in [[Vector2i(1,0), Vector2.RIGHT], [Vector2i(0,0), Vector2.LEFT], [Vector2i(0,0), Vector2.UP], [Vector2i(0,1), Vector2.DOWN]]:
		var direction: Vector2 = case[1]
		var start: Vector2 = level.layout.center(case[0]) + direction * 20
		level.pawn.position = start
		level.pawn.walk_to(start - direction * 20)
		var minimum_progress := 0.0
		var began := Time.get_ticks_msec()
		level.fall_into_water(start + direction * 160)
		while level.water_phase == level.WaterPhase.APPROACHING:
			await physics_frame
			minimum_progress = minf(minimum_progress, (level.pawn.position - start).dot(direction))
		var elapsed := Time.get_ticks_msec() - began
		print("Water handoff ", direction, ": backward distance=", -minimum_progress, "px; approach delay=", elapsed, "ms")
		if minimum_progress < -0.1 or elapsed > 50:
			failures += 1
			push_error("Pawn already at the shore must not backtrack or wait before the fall")
		if not level.waypoints.is_empty() or level.pawn.is_physics_processing():
			failures += 1
			push_error("Old walking route is stopped before the fall")
		await level.respawned
	print("Water handoff checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
