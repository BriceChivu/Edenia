extends SceneTree

const Chicken = preload("res://scripts/chicken_visual.gd")
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
	for node in scene.asset_nodes:
		node.set_process(false)
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	scene.layout.stair_directions.clear()
	scene.layout.trees.clear()
	scene.layout.log_piles.clear()
	scene.layout.houses.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.sheep.clear()
	for x in range(-2, 7):
		for y in range(-2, 7):
			scene.layout.cells[Vector2i(x, y)] = "meadow"
	var start: Vector2 = scene.layout.center(Vector2i(-1, 0))
	scene.layout.chickens.assign([start])
	scene.pawn.position = scene.layout.center(Vector2i.ZERO)
	var chicken = Chicken.new()
	chicken.world = scene
	scene.get_node("World").add_child(chicken)
	chicken.set_process(false)
	chicken.updated_at = 100.0
	scene.editing = false
	var corner: Vector2 = scene.layout.center(Vector2i(3, 0))
	var finish: Vector2 = scene.layout.center(Vector2i(3, 3))
	var saw_run := false
	for tick in 240:
		var target: Vector2 = corner if tick < 55 else finish
		scene.pawn.position = scene.pawn.position.move_toward(target, scene.pawn.speed * 0.05)
		chicken.advance(0.05, 100.0 + (tick + 1) * 0.05)
		if tick < 60:
			check(chicken.position.is_equal_approx(start), "Wait three seconds before following")
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Following never enters pawn tile")
		check(absf(chicken.position.y - start.y) < 0.01 or absf(chicken.position.x - corner.x) < 0.01, "Replay corner instead of cutting diagonally")
		saw_run = saw_run or chicken.texture == chicken.Art.CHICKEN_RUN
	check(saw_run, "Follow uses running animation")
	check(scene.layout.cell_at(chicken.position) == Vector2i(3, 2), "Stop on grass tile immediately before stationary pawn")
	check(scene.layout.chickens[0] == chicken.position, "Follow updates persisted ground position")
	# An existing wander/escape route must react when the pawn blocks its next tile.
	chicken.clear_following()
	chicken.wandering = false
	chicken.position = scene.layout.center(Vector2i.ZERO) + Vector2(30, 0)
	scene.layout.chickens[0] = chicken.position
	scene.pawn.position = scene.layout.center(Vector2i.RIGHT)
	chicken.previous_pawn_position = scene.pawn.position
	chicken.escape_route.assign([scene.layout.center(Vector2i(2, 0))])
	chicken.tile_destinations.assign(chicken.escape_route)
	chicken.destination = chicken.escape_route[0]
	chicken.fleeing = true
	chicken.advance(0.1, 112.0)
	check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Escape route never enters a newly occupied pawn tile")
	# The pawn must give a chicken time to leave before entering its tile.
	chicken.clear_following()
	chicken.position = scene.layout.center(Vector2i.RIGHT)
	scene.layout.chickens[0] = chicken.position
	chicken.fleeing = false
	chicken.escape_route.clear()
	chicken.tile_destinations.clear()
	scene.pawn.position = scene.layout.center(Vector2i.ZERO) + Vector2(30, 0)
	scene.pawn.walk_to(chicken.position)
	scene.pawn._physics_process(0.1)
	check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Pawn waits before entering the chicken tile")
	check(chicken.fleeing, "Pawn approach starts escape before contact")
	var pawn_target: Vector2 = scene.pawn.destination
	for tick in 120:
		scene.pawn._physics_process(0.05)
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "No overlap after pawn physics step")
		chicken.advance(0.05, 112.0 + (tick + 1) * 0.05)
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "No overlap after chicken movement step")
	check(scene.pawn.position.is_equal_approx(pawn_target), "Pawn resumes and reaches its destination after chicken clears tile")
	# Catch-up frames must check every route leg, including a blocked later leg.
	chicken.clear_following()
	chicken.wandering = false
	chicken.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.chickens[0] = chicken.position
	scene.pawn.position = scene.layout.center(Vector2i(2, 0))
	chicken.previous_pawn_position = scene.pawn.position
	chicken.escape_route.assign([scene.layout.center(Vector2i.RIGHT), scene.layout.center(Vector2i(3, 0))])
	chicken.tile_destinations.assign(chicken.escape_route)
	chicken.destination = chicken.escape_route[0]
	chicken.fleeing = true
	chicken.advance(4.0, 122.0)
	check(scene.layout.cell_at(chicken.position) == Vector2i.RIGHT and not chicken.fleeing, "Catch-up stops before crossing pawn tile on later route leg")
	# Entering build mode must not settle a blocked route onto the pawn.
	chicken.escape_route.assign([scene.pawn.position])
	chicken.tile_destinations.assign(chicken.escape_route)
	chicken.destination = scene.pawn.position
	chicken.fleeing = true
	scene.editing = true
	chicken.advance(0.01, 122.01)
	check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Build-mode settling stays outside pawn tile")
	scene.editing = false
	# A boxed-in chicken keeps its tile reserved rather than allowing overlap.
	var saved_cells: Dictionary = scene.layout.cells.duplicate()
	scene.layout.cells.clear()
	scene.layout.cells[Vector2i.ZERO] = "meadow"
	scene.layout.cells[Vector2i.RIGHT] = "meadow"
	chicken.position = scene.layout.center(Vector2i.RIGHT)
	scene.layout.chickens[0] = chicken.position
	chicken.fleeing = false
	scene.pawn.position = scene.layout.center(Vector2i.ZERO)
	scene.pawn.walk_to(chicken.position)
	for tick in 20:
		scene.pawn._physics_process(0.5)
		chicken.advance(0.5, 123.0 + tick * 0.5)
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "No overlap when chicken cannot escape")
	scene.layout.cells.assign(saved_cells)
	# A pawn reversing onto the chicken still triggers the original escape.
	scene.pawn.position = chicken.position
	chicken.advance(0.01, 133.01)
	check(chicken.fleeing and not chicken.following and not chicken.escape_route.is_empty(), "Pawn contact overrides trail and runs away")
	scene.queue_free()
	await process_frame
	print("Chicken following checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
