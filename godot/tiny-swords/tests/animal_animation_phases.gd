extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = preload("res://previews/level_seven.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.editing = true
	scene.layout.sheep.assign([scene.layout.center(Vector2i.ZERO), scene.layout.center(Vector2i.RIGHT)])
	scene.layout.chickens.assign([scene.layout.center(Vector2i.LEFT), scene.layout.center(Vector2i.UP)])
	scene.layout.trees.clear()
	for cell in [Vector2i(2, 0), Vector2i(3, 0), Vector2i(2, 1), Vector2i(-2, -1)]:
		scene.layout.cells[cell] = "meadow"
		scene.layout.trees[cell] = true
		scene.layout.tree_types[cell] = "tree"
	scene.rebuild_decorations()
	var tree_phases := {}
	for tree in scene.tree_nodes:
		tree.set_process(false)
		tree_phases[tree.get_meta("cell")] = tree.elapsed
	var tree_frames := {}
	for tick in 80:
		tree_frames.clear()
		for tree in scene.tree_nodes:
			tree._process(0.1)
			tree_frames[tree.frame] = true
		check(tree_frames.size() > 1, "Trees keep separate ambient phases across repeated loops")
	scene.rebuild_decorations()
	for tree in scene.tree_nodes:
		tree.set_process(false)
		check(is_equal_approx(tree.elapsed, tree_phases[tree.get_meta("cell")]), "Tree phase remains stable after rebuilding")
	var pairs := {}
	for animal in scene.asset_nodes:
		if not animal is Sprite2D or not animal.get_script() in [preload("res://scripts/sheep_visual.gd"), preload("res://scripts/chicken_visual.gd")]:
			continue
		animal.set_process(false)
		animal.updated_at = 100.0
		var kind: String = "chicken" if animal.get_script() == preload("res://scripts/chicken_visual.gd") else "sheep"
		if not pairs.has(kind):
			pairs[kind] = []
		pairs[kind].append(animal)
	for kind in ["sheep", "chicken"]:
		var animals: Array = pairs[kind]
		check(animals.size() == 2, kind + " pair exists")
		check(animals[0].frame != animals[1].frame, kind + " starts with different visible frames")
		var different_frames := 0
		var different_actions := 0
		# Cover many loops, including a shared movement/settling reset halfway through.
		for tick in 1200:
			if tick == 600:
				for animal in animals:
					animal.reset_grazing()
			for animal in animals:
				animal.advance(0.1, 100.0)
			if animals[0].texture != animals[1].texture:
				different_actions += 1
			if animals[0].texture != animals[1].texture or animals[0].frame != animals[1].frame:
				different_frames += 1
		check(different_frames > 900, kind + " animations stay independently phased through repeated loops and resets")
		check(different_actions > 200, kind + " eating schedules stay staggered")
		# Running uses the same independent clock, even when both start together.
		for animal in animals:
			animal.house_fleeing = true
			animal.fleeing = true
			animal.destination = animal.position + Vector2(100, 0)
			animal.escape_route.assign([animal.destination])
			animal.advance(0.01, 100.0)
		check(animals[0].frame != animals[1].frame, kind + " simultaneous runs keep different phases")
	scene.queue_free()
	await process_frame
	print("Animal animation phase checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
