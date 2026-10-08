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
	seed(0)
	var scene = load("res://previews/level_seven.tscn").instantiate()
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
		if tick < 40:
			check(chicken.position.is_equal_approx(start), "Wait two seconds before following")
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Following never enters pawn tile")
		if tick == 50:
			check(not chicken.position.is_equal_approx(start), "Following starts after two seconds")
		if tick == 100:
			check(chicken.position.x < corner.x and chicken.position.y > start.y, "Shortest route cuts across the pawn turn")
		saw_run = saw_run or chicken.texture == chicken.Art.CHICKEN_RUN
	check(saw_run, "Follow uses running animation")
	var separation: Vector2i = scene.layout.cell_at(chicken.position) - scene.layout.cell_at(scene.pawn.position)
	check(absi(separation.x) + absi(separation.y) >= 1 and not chicken.following, "Completed follow stops outside pawn tile")
	check(scene.layout.chickens[0] == chicken.position, "Follow updates persisted ground position")
	# A new pawn movement starts a fresh delay after the chicken has caught up.
	chicken.clear_following()
	scene.pawn.position += Vector2(4, 0)
	var caught_up: Vector2 = chicken.position
	chicken.advance(0.05, 112.05)
	check(chicken.follow_wait < Chicken.FOLLOW_DELAY and chicken.position == caught_up, "New movement restarts two-second delay")
	# The route detours around missing ground and never crosses the reserved pawn tile.
	chicken.clear_following()
	chicken.position = scene.layout.center(Vector2i(-2, 0))
	scene.pawn.position = scene.layout.center(Vector2i(2, 0))
	scene.layout.cells.erase(Vector2i.ZERO)
	var detour: Array[Vector2] = chicken.shortest_follow_route()
	check(not detour.is_empty(), "Find a follow route around missing ground")
	var route_start: Vector2 = chicken.position
	for point in detour:
		check(chicken.safe_follow_segment(route_start, point), "Every detour segment stays on terrain outside pawn tile")
		route_start = point
	if not detour.is_empty():
		var gap: Vector2i = scene.layout.cell_at(detour.back()) - scene.layout.cell_at(scene.pawn.position)
		check(absi(gap.x) + absi(gap.y) == 1, "Detour ends one tile before pawn")
	scene.layout.cells[Vector2i.ZERO] = "meadow"
	# Movement during escape is ignored, even if the pawn stops before settlement.
	chicken.clear_following()
	chicken.follow_wait = -1.0
	chicken.wandering = false
	chicken.position = scene.layout.center(Vector2i(-2, 0))
	scene.layout.chickens[0] = chicken.position
	scene.pawn.position = scene.layout.center(Vector2i(3, 0))
	chicken.previous_pawn_position = scene.pawn.position
	var escape_end: Vector2 = scene.layout.center(Vector2i(-2, 6))
	chicken.escape_route.assign([escape_end])
	chicken.tile_destinations.assign(chicken.escape_route)
	chicken.destination = escape_end
	chicken.fleeing = true
	chicken.updated_at = 112.05
	scene.pawn.position += Vector2(4, 0)
	for tick in 160:
		chicken.advance(0.05, 112.05 + (tick + 1) * 0.05)
		check(not chicken.following and chicken.follow_wait < 0.0, "Ignore pawn movement during escape and wait for new movement afterward")
		if tick == 45:
			check(chicken.fleeing and chicken.destination == escape_end, "Escape keeps priority")
	check(chicken.position == escape_end and not chicken.fleeing, "Chicken settles without chasing earlier pawn movement")
	# Only new movement after settlement starts the two-second delay.
	scene.pawn.position += Vector2(4, 0)
	for tick in 240:
		scene.pawn.position += Vector2(0.01, 0)
		chicken.advance(0.05, 120.05 + (tick + 1) * 0.05)
		if tick < 40:
			check(chicken.position == escape_end, "New movement after escape waits two seconds")
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Post-escape follow avoids pawn tile")
	var after_escape: Vector2i = scene.layout.cell_at(chicken.position) - scene.layout.cell_at(scene.pawn.position)
	check(absi(after_escape.x) + absi(after_escape.y) == 1, "Follow new pawn movement after escape settles")
	chicken.advance(1.0, 133.05)
	chicken.advance(0.0, 133.05)
	check(not chicken.following and chicken.follow_wait < 0.0, "Chicken finishes its last approach after pawn stops")
	var stopped_position: Vector2 = chicken.position
	chicken.advance(1.0, 134.05)
	check(chicken.position == stopped_position and not chicken.following, "Settled chicken stays beside immobile pawn")
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
	# Like sheep, chickens do not reserve an entire tile against pawn movement.
	chicken.clear_following()
	chicken.position = scene.layout.center(Vector2i.RIGHT)
	scene.layout.chickens[0] = chicken.position
	chicken.fleeing = false
	chicken.escape_route.clear()
	chicken.tile_destinations.clear()
	scene.pawn.position = scene.layout.center(Vector2i.ZERO) + Vector2(30, 0)
	scene.pawn.walk_to(chicken.position)
	scene.pawn._physics_process(0.1)
	check(scene.pawn.position.x > scene.layout.center(Vector2i.ZERO).x + 30, "Pawn continues into chicken tile without being blocked")
	var pawn_target: Vector2 = scene.pawn.destination
	for tick in 240:
		scene.pawn._physics_process(0.05)
		chicken.advance(0.05, 112.0 + (tick + 1) * 0.05)
	check(scene.pawn.position.is_equal_approx(pawn_target), "Pawn reaches clicked destination without waiting for chicken")
	check(not chicken.following, "Pawn movement during escape does not request later following")
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
	# A boxed-in chicken stays grounded while the pawn completes its walk.
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
	check(scene.pawn.position.is_equal_approx(scene.pawn.destination), "Pawn reaches destination even when chicken cannot escape")
	check(scene.layout.chickens.size() == 1 and not scene.pawn.carrying_chicken, "Boxed-in same-tile contact keeps the chicken grounded while carrying is disabled")
	scene.layout.cells.assign(saved_cells)
	# A short walk retains the delay and finishes following after the pawn stops.
	chicken.clear_following()
	chicken.follow_wait = -1.0
	chicken.wandering = false
	chicken.fleeing = false
	chicken.position = scene.layout.center(Vector2i(-2, 0))
	scene.layout.chickens[0] = chicken.position
	scene.pawn.position = scene.layout.center(Vector2i(2, 0))
	chicken.previous_pawn_position = scene.pawn.position
	chicken.updated_at = 133.95
	var short_walk_start: Vector2 = chicken.position
	scene.pawn.position += Vector2(4, 0)
	scene.pawn.destination = scene.pawn.position
	scene.pawn.set_physics_process(true)
	for tick in 160:
		chicken.advance(0.05, 134.0 + tick * 0.05)
		if tick > 0:
			check(not chicken.pawn_moving, "Retained follow completes while pawn is actually stopped")
		if tick < 39:
			check(chicken.position == short_walk_start, "Short walk still waits two seconds before follow")
	scene.pawn.set_physics_process(false)
	var short_walk_gap: Vector2i = scene.layout.cell_at(chicken.position) - scene.layout.cell_at(scene.pawn.position)
	check(absi(short_walk_gap.x) + absi(short_walk_gap.y) == 1, "Short walk follows to pawn after it stops")
	# A pawn reversing onto the chicken still triggers the original escape.
	scene.pawn.position = chicken.position
	chicken.advance(0.01, 133.01)
	check(chicken.fleeing and not chicken.following and not chicken.escape_route.is_empty(), "Pawn contact overrides following and runs away")
	scene.queue_free()
	await process_frame
	print("Chicken following checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
