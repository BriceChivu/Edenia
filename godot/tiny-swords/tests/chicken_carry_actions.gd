extends SceneTree

const Fall = preload("res://scripts/water_fall.gd")
var failures: Array[String] = []
func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func hold(world) -> void:
	world.layout.chickens.clear()
	world.layout.stock.chicken = 0
	world.layout.chicken_release_at = Time.get_unix_time_from_system() + 60.0
	world.pawn.carrying_chicken = true
	world.chicken_carry.released_cell = Vector2i(999, 999)
func click(world, point: Vector2) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = world.get_global_transform_with_canvas() * point
	world.handle_world_click(event)
func run() -> void:
	var world = load("res://previews/level_five.tscn").instantiate()
	world.camera_save_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.construction.set_process(false)
	world.pawn.set_physics_process(false)
	for node in world.asset_nodes:
		node.set_process(false)
	world.editing = false
	world.pawn.position = world.layout.center(Vector2i.ZERO)
	world.pawn.walk_to(world.pawn.position)
	world.layout.flora.clear()
	world.layout.decorations.clear()
	var tree := Vector2i(1, 0)
	check(world.layout.edit(tree, "tree", Vector2i.ZERO), "Place action-test tree")
	hold(world)
	check(not world.harvesting.start(Vector2i(10, 10)) and world.pawn.carrying_chicken, "Invalid tree action retains chicken")
	check(world.harvesting.start(tree), "Tree action starts while carrying chicken")
	check(not world.pawn.carrying_chicken and world.layout.chickens.size() == 1 and world.pawn.axe_equipped, "Accepted tree action immediately puts down chicken before equipping axe")
	world.harvesting.cancel()
	world.pawn.position = world.layout.center(Vector2i.ZERO)
	world.pawn.walk_to(world.pawn.position)
	var pile := Vector2i(0, 1)
	world.layout.log_piles[pile] = 2
	world.layout.resources.wood = 2
	world.rebuild_decorations()
	hold(world)
	click(world, world.layout.center(pile) + Vector2(-6.5, 6))
	check(world.log_pickup == pile and not world.pawn.carrying_chicken, "Log pickup command puts down chicken at action start")
	check(world.layout.chickens.size() == 1 and world.layout.carried_wood == 0 and world.layout.log_piles[pile] == 2, "Chicken is grounded while log pickup still waits for arrival")
	world.log_pickup = Vector2i(999, 999)
	world.waypoints.clear()
	world.pawn.walk_to(world.pawn.position)
	world.layout.log_piles[pile] = 6
	world.layout.resources.wood = 6
	hold(world)
	check(world.construction.pickup(pile) and not world.pawn.carrying_chicken, "House log-bundle pickup also puts down chicken immediately")
	world.construction.phase = world.construction.Phase.READY
	world.waypoints.clear()
	world.pawn.position = world.layout.center(Vector2i.ZERO)
	world.pawn.walk_to(world.pawn.position)
	# A delivery must not be blocked by the chicken's newly chosen resting tile.
	world.layout.log_piles.clear()
	world.layout.carried_wood = 1
	world.layout.resources.wood = 1
	hold(world)
	var delivery := Vector2i(0, 1)
	click(world, world.layout.center(delivery))
	check(world.log_delivery == delivery and not world.pawn.carrying_chicken, "Log delivery begins by putting down chicken")
	check(world.layout.chicken_at(delivery) < 0, "Put-down keeps the delivery destination clear")
	while not world.waypoints.is_empty():
		world.pawn.position = world.pawn.destination
		world.pawn.walk_to(world.waypoints.pop_front())
	world.pawn.position = world.pawn.destination
	world._process(0.0)
	check(world.layout.log_piles.get(delivery) == 1 and world.layout.carried_wood == 0, "The action that releases a chicken can complete")
	# Pickup still works on a tiny island where the bird must share the log tile.
	var saved_cells: Dictionary = world.layout.cells.duplicate()
	world.layout.cells.clear()
	world.layout.cells[Vector2i.ZERO] = "meadow"
	world.layout.trees.clear()
	world.layout.log_piles.clear()
	world.layout.log_piles[Vector2i.ZERO] = 1
	world.rebuild_decorations()
	world.pawn.position = world.layout.center(Vector2i.ZERO) + Vector2(-20, -18)
	world.pawn.walk_to(world.pawn.position)
	hold(world)
	click(world, world.layout.center(Vector2i.ZERO) + Vector2(0, 6))
	check(world.log_pickup == Vector2i.ZERO and not world.pawn.carrying_chicken, "One-tile log pickup releases the chicken on safe space in the same tile")
	world.log_pickup = Vector2i(999, 999)
	world.waypoints.clear()
	world.layout.cells.assign(saved_cells)
	world.layout.log_piles.clear()
	world.pawn.position = world.layout.center(Vector2i.ZERO)
	world.pawn.walk_to(world.pawn.position)
	hold(world)
	var start: Vector2 = world.pawn.position
	for frame in 8:
		Fall.apply_pose(world.pawn, frame, start, Vector2.LEFT, 64.0)
		check(world.pawn.sprite.animation == "chicken_run" and world.pawn.carrying_chicken, "Every water-fall pose retains the chicken")
		check(world.pawn.sprite.flip_h and is_equal_approx(world.pawn.sprite.modulate.a, Fall.OPACITY[frame]), "Chicken shares pawn facing and sinking opacity")
	world.pawn.position = start
	world.pawn.sprite.modulate.a = 1.0
	world.layout.chicken_release_at = Time.get_unix_time_from_system() + 0.05
	world.perform_water_fall(start, Vector2.RIGHT, 0.0, start, 0.0)
	await world.splash_started
	world.chicken_carry.advance(Time.get_unix_time_from_system())
	check(world.pawn.carrying_chicken and world.layout.chickens.is_empty(), "Deadline expiring in water keeps chicken on the pawn")
	await world.respawned
	check(world.pawn.carrying_chicken and world.pawn.sprite.animation == "chicken_idle", "Respawn reveals pawn with chicken still attached")
	world.chicken_carry.advance(Time.get_unix_time_from_system())
	check(not world.pawn.carrying_chicken and world.layout.chickens.size() == 1, "Expired carry releases safely after returning to land")
	world.queue_free()
	await process_frame
	print("Chicken carry action/water checks: ", "PASS" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)
