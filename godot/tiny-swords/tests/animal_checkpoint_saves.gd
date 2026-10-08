extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = load("res://previews/level_seven.tscn").instantiate()
	scene.set_script(load("res://tests/animal_checkpoint_world.gd"))
	scene.starting_level = 7
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	for animal in scene.asset_nodes:
		animal.set_process(false)
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	scene.layout.stair_directions.clear()
	scene.layout.trees.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	for x in range(-6, 7):
		scene.layout.cells[Vector2i(x, 0)] = "meadow"
	var origin: Vector2 = scene.layout.center(Vector2i.ZERO)
	scene.layout.sheep.assign([origin])
	scene.layout.chickens.assign([origin])
	scene.pawn.position = scene.layout.center(Vector2i(8, 8))
	scene.editing = false
	for script in [load("res://scripts/sheep_visual.gd"), load("res://scripts/chicken_visual.gd")]:
		var animal = script.new()
		animal.world = scene
		scene.get_node("World").add_child(animal)
		animal.set_process(false)
		animal.previous_pawn_position = scene.pawn.position
		animal.updated_at = 100.0
		animal.position = origin
		animal.destination = scene.layout.center(Vector2i.RIGHT)
		animal.fleeing = true
		animal.escape_route.assign([animal.destination])
		animal.tile_destinations.assign([animal.destination])
		scene.checkpoint_causes.clear()
		animal.advance(1.0, 100.0)
		check(not animal.fleeing and animal.position == animal.destination, "Animal reaches saved resting point")
		check(scene.checkpoint_causes == [true], "Finished animal movement is classified as an ambient checkpoint")
		animal.position = origin
		animal.destination = scene.layout.center(Vector2i.RIGHT)
		animal.fleeing = true
		animal.escape_route.assign([animal.destination])
		animal.tile_destinations.assign([animal.destination])
		scene.editing = true
		scene.checkpoint_causes.clear()
		animal.advance(0.01, 100.0)
		check(scene.checkpoint_causes == [true], "Settling movement for editing remains an animal checkpoint")
		scene.editing = false
		animal.queue_free()
		await process_frame
	scene.checkpoint_causes.clear()
	scene.save_layout()
	check(scene.checkpoint_causes == [false], "Ordinary gameplay saves keep the default cloud-eligible cause")
	scene.queue_free()
	await process_frame
	print("Animal checkpoint save checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
