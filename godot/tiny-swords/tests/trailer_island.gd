extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var trailer = load("res://previews/trailer_island.tscn").instantiate()
	root.add_child(trailer)
	trailer.set_process(false)
	var game = trailer.game
	game.pawn.set_physics_process(false)
	check(not game.shark.visible and not game.shark.is_processing(), "No gameplay shark in the trailer")
	var layout = game.layout
	check(layout.cells.size() == 2, "Start with only the two permanent grass tiles")
	check(not game.preview_save_enabled and not game.camera_save_enabled, "Never load or save learner worlds")
	var target = trailer.target_tree
	var cloud = game.get_node("Clouds/WestCloud")
	var cloud_position: Vector2 = cloud.position
	var cloud_speed: float = cloud.drift_speed
	var tree_time: float = target.elapsed
	var water_time: float = game.terrain.elapsed
	for level in range(1, 11):
		trailer.elapsed = float(level) * trailer.TERRAIN_INTERVAL
		trailer.generate_terrain(level)
		check(layout.chickens.is_empty(), "No chickens at any trailer level")
		check(layout.sheep.size() == (0 if level < 5 else 1 if level < 8 else 2), "Sheep rewards follow levels five and eight")
		check(layout.houses.size() == (0 if level < 5 else 1), "Houses start at level five")
		check(layout.height_at(trailer.START) == 0 and layout.height_at(trailer.TARGET) == 0, "Permanent tiles stay fixed")
		check(trailer.target_tree == target and not target.is_queued_for_deletion(), "Keep the target tree instance")
		check(is_equal_approx(target.elapsed, tree_time), "Terrain changes never advance or reset the target tree clock")
		check(is_equal_approx(game.terrain.elapsed, water_time), "Terrain changes never advance or reset water ripples")
		check(cloud.position == cloud_position and is_equal_approx(cloud.drift_speed, cloud_speed), "Terrain changes never move or accelerate clouds")
		for item in layout.decorations.values():
			check(item.kind != "shark", "No sharks in the trailer")
		for tree in game.tree_nodes:
			if tree != target:
				check(is_equal_approx(tree.elapsed, trailer.elapsed), "New trees inherit ordinary presentation time")
	# Background actors advance at their own rates, independent of terrain updates.
	cloud._process(0.1)
	target._process(0.1)
	game.terrain._process(0.1)
	check(is_equal_approx(cloud.position.x, cloud_position.x + cloud_speed * 0.1), "Clouds retain their normal drift speed")
	check(is_equal_approx(target.elapsed, tree_time + 0.1), "Target tree advances by normal elapsed seconds")
	check(is_equal_approx(game.terrain.elapsed, water_time + 0.1), "Ripples advance by normal elapsed seconds")
	trailer.free()
	print("Trailer progression and independent animation clocks: %s" % ("PASS" if failures.is_empty() else "FAIL"))
	quit(0 if failures.is_empty() else 1)
