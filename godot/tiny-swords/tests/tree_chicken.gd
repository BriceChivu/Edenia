extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	for kind in Layout.CHICKEN_TREE_VARIANTS:
		await run_tree(kind)
	if failures.is_empty(): print("Tree 1 and Tree 2 chicken checks passed")
	quit(0 if failures.is_empty() else 1)

func run_tree(kind: String) -> void:
	root.size = Vector2i(1152, 648)
	var scene = load("res://previews/level_five.tscn").instantiate()
	scene.set_script(load("res://tests/animal_checkpoint_world.gd"))
	scene.starting_level = 5
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.editing = false
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	var cell := Vector2i(1, 1)
	scene.layout.trees[cell] = Vector2.ZERO
	scene.layout.stock.tree -= 1
	scene.layout.tree_types[cell] = kind
	scene.layout.stock.chicken -= 1
	scene.layout.chicken_release_at = Time.get_unix_time_from_system() + 60
	scene.pawn.carrying_chicken = true
	scene.rebuild_decorations()
	var interaction = scene.tree_chicken
	var route: Array[Vector2] = interaction.route_to(cell)
	check(not route.is_empty(), "Tree has a reachable supported approach")
	check(interaction.eligible(cell), "Carried chicken can enter authored tree: " + kind)
	scene.layout.tree_types[cell] = "tree2"
	check(not interaction.eligible(cell), "Other tree types do not accept chicken")
	scene.layout.tree_types[cell] = kind
	scene.layout.tree_stumps[cell] = 100.0
	check(not interaction.eligible(cell), "Stump cannot accept chicken")
	scene.layout.tree_stumps.clear()
	var original_position: Vector2 = scene.pawn.position
	scene.pawn.position = scene.layout.tree_position(cell) + Vector2(150, 0)
	check(not interaction.transfer(cell, 100.0), "Cannot teleport chicken into distant tree")
	scene.pawn.position = original_position
	check(interaction.request(cell), "Click starts approach while preserving carried chicken")
	check(scene.pawn.carrying_chicken and scene.layout.tree_chickens.is_empty(), "Approach retains bird until arrival")
	scene.movement_generation += 1
	interaction.advance(99.0)
	check(interaction.target == interaction.NO_TREE and scene.layout.tree_chickens.is_empty(), "New movement cancels placement without losing chicken")
	check(interaction.request(cell), "Placement can be requested again after cancellation")
	scene.pawn.position = scene.waypoints.back() if not scene.waypoints.is_empty() else scene.pawn.destination
	scene.checkpoint_causes.clear()
	scene.queue_animal_checkpoint()
	interaction.advance(100.0)
	check(scene.layout.tree_chickens.has(cell) and not scene.pawn.carrying_chicken and scene.layout.chicken_release_at == 0, "Arrival places exactly one bird in tree")
	check(scene.checkpoint_causes == [false] and not scene.animal_checkpoint_pending, "Tree placement saves meaningful ownership immediately and absorbs pending roaming")
	await process_frame
	for tree in scene.tree_nodes:
		if tree.get_meta("cell") == cell:
			check(tree.texture.get_width() == 1536 and tree.texture.get_height() == 256 and tree.hframes == 8, "Occupied tree retains eight authored frames")
			check(tree.source_image == scene.TreeArt.sources[kind + "_chicken"], "Occupied tree uses supplied chicken artwork for hit testing")
	if "--capture" in OS.get_cmdline_user_args():
		scene.game_camera.position = scene.layout.tree_position(cell) - Vector2(0, 100)
		scene.game_camera.zoom = Vector2.ONE * 1.8
		await process_frame
		await RenderingServer.frame_post_draw
		var path := ProjectSettings.globalize_path("res://../../artifacts/tree-chicken/placed-" + kind + ".png")
		DirAccess.make_dir_recursive_absolute(path.get_base_dir())
		root.get_texture().get_image().save_png(path)
	check(not scene.harvesting.available(cell), "Occupied tree cannot be chopped")
	check(scene.layout.tree_swap_plan(cell).is_empty(), "Occupied tree cannot change to incompatible artwork")
	var saved: Dictionary = scene.layout.snapshot()
	check(saved.version == 40, "Position-bearing save version retains perched ownership")
	var restored = Layout.new()
	check(restored.restore(saved) and restored.tree_chickens.has(cell), "Reload conserves tree chicken")
	var bad: Dictionary = saved.duplicate(true)
	bad.tree_chickens.append([cell.x, cell.y])
	check(not Layout.new().restore(bad), "Reject duplicate tree chickens")
	bad = saved.duplicate(true)
	bad.tree_chickens[0] = [999, 999]
	check(not Layout.new().restore(bad), "Reject chicken on missing tree")
	bad = saved.duplicate(true)
	bad.chicken_release_at = 100
	check(not Layout.new().restore(bad), "Reject bird duplicated in pawn carry")
	scene.checkpoint_causes.clear()
	scene.queue_animal_checkpoint()
	check(interaction.transfer(cell, 200.0), "Chicken can be retrieved from tree")
	check(scene.checkpoint_causes == [false] and not scene.animal_checkpoint_pending, "Tree retrieval remains an immediate meaningful save")
	check(scene.pawn.carrying_chicken and scene.layout.tree_chickens.is_empty() and scene.layout.chicken_release_at == 260.0, "Retrieval restores normal carrying deadline")
	check(interaction.transfer(cell, 201.0), "Retrieved chicken can be placed again")
	check(not restored.edit(cell, "remove", Vector2i(999, 999)), "Retrieve chicken before collecting its tree")
	interaction.cancel()
	interaction.advance(10000000000.0)
	check(scene.layout.tree_chickens.has(cell) and scene.layout.chicken_release_at == 0, "Chicken stays indefinitely without timeout or next-day release")
	scene.layout.tree_chickens.clear()
	scene.layout.stock.chicken += 1
	var legacy: Dictionary = scene.layout.snapshot()
	legacy.version = 38
	legacy.chicken_count = legacy.chickens.size()
	legacy.sheep_count = legacy.sheep.size()
	legacy.erase("chickens")
	legacy.erase("sheep")
	legacy.erase("tree_chickens")
	check(Layout.new().restore(legacy), "Previous save version remains readable")
	scene.queue_free()
	await process_frame
