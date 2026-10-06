extends SceneTree

const Chicken = preload("res://scripts/chicken_visual.gd")
var failures: Array[String] = []

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	seed(0)
	var scene = preload("res://previews/level_seven.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	for node in scene.asset_nodes:
		node.set_process(false)
	for collection in [scene.layout.cells, scene.layout.elevations, scene.layout.stair_directions, scene.layout.trees, scene.layout.log_piles, scene.layout.houses, scene.layout.flora, scene.layout.decorations, scene.layout.sheep]:
		collection.clear()
	for x in range(-3, 5):
		for y in range(-3, 5):
			scene.layout.cells[Vector2i(x, y)] = "meadow"
	scene.layout.chickens.assign([scene.layout.center(Vector2i(-2, 0)), scene.layout.center(Vector2i(-2, -1))])
	scene.pawn.position = scene.layout.center(Vector2i(2, 0))
	scene.editing = false
	var chickens: Array = []
	for index in 2:
		var chicken = Chicken.new()
		chicken.world = scene
		chicken.chicken_index = index
		scene.get_node("World").add_child(chicken)
		chicken.set_process(false)
		chicken.updated_at = 100.0
		chickens.append(chicken)
	scene.pawn.position += Vector2(1, 0)
	for tick in 240:
		for chicken in chickens:
			chicken.advance(0.05, 100.0 + (tick + 1) * 0.05)
		if chickens[0].position.distance_to(chickens[1].position) < 32.0 - 0.01:
			failures.append("Following chickens overlap at tick %d" % tick)
			break
	for chicken in chickens:
		if chicken.position.distance_to(scene.pawn.position) > scene.layout.SIZE * 1.5:
			failures.append("Both chickens should reach nearby free resting positions")
	# Exercise repeated wandering and a pawn-triggered escape, including routes
	# that become obstructed after the other chicken moves.
	for tick in 240:
		if tick == 120:
			scene.pawn.position = chickens[0].position
		for chicken in chickens:
			if tick % 40 == 0:
				chicken.grazing_cycles = chicken.grazing_target
			chicken.advance(0.05, 112.0 + (tick + 1) * 0.05)
		if chickens[0].position.distance_to(chickens[1].position) < 32.0 - 0.01:
			failures.append("Wandering or escaping chickens overlap")
			break
	scene.pawn.position = scene.layout.center(Vector2i(2, 0))
	# Restored older layouts can begin with both chickens at the same point.
	var overlap: Vector2 = scene.layout.center(Vector2i.ZERO)
	for chicken in chickens:
		chicken.clear_following()
		chicken.follow_wait = -1.0
		chicken.fleeing = false
		chicken.wandering = false
		chicken.position = overlap
		chicken.destination = overlap
		chicken.previous_pawn_position = scene.pawn.position
		chicken.updated_at = 124.0
		scene.layout.chickens[chicken.chicken_index] = overlap
	for tick in 80:
		for chicken in chickens:
			chicken.advance(0.05, 124.0 + (tick + 1) * 0.05)
	if chickens[0].position.distance_to(chickens[1].position) < 32.0:
		failures.append("Restored overlapping chickens separate onto free ground")
	# A suspended frame must not skip over another chicken on the route.
	var moving = chickens[0]
	var resting = chickens[1]
	moving.position = scene.layout.center(Vector2i(-2, 0))
	resting.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.chickens.assign([moving.position, resting.position])
	var target: Vector2 = scene.layout.center(Vector2i(1, 0))
	moving.escape_route.assign([target])
	moving.tile_destinations.assign([target])
	moving.destination = target
	moving.fleeing = true
	moving.advance(4.0, 132.0)
	if moving.position.x >= resting.position.x - 32.0:
		failures.append("Catch-up movement must not cross a resting chicken")
	# Closing movement for editing must not snap onto an occupied destination.
	moving.escape_route.assign([resting.position])
	moving.tile_destinations.assign([resting.position])
	moving.destination = resting.position
	moving.fleeing = true
	scene.editing = true
	moving.advance(0.01, 132.01)
	if moving.position.distance_to(resting.position) < 32.0:
		failures.append("Build-mode settling must retain chicken spacing")
	scene.queue_free()
	await process_frame
	for failure in failures:
		push_error(failure)
	print("Chicken spacing checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
