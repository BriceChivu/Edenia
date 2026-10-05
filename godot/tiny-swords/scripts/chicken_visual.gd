extends "res://scripts/sheep_visual.gd"

var chicken_index: int:
	get:
		return sheep_index
	set(value):
		sheep_index = value

func _ready() -> void:
	idle_texture = Art.CHICKEN_IDLE
	grass_texture = Art.CHICKEN_EATING
	run_texture = Art.CHICKEN_RUN
	art_scale = Art.CHICKEN_SCALE
	art_offset = Art.CHICKEN_OFFSET
	faces_left = true
	super._ready()

func animal_positions() -> Array[Vector2]:
	return world.layout.chickens

func avoid_sheep() -> void:
	var layout = world.layout
	var origin: Vector2i = layout.cell_at(position)
	var nearby: Array[Vector2] = []
	for sheep_position in layout.sheep:
		if layout.cell_at(sheep_position) == origin:
			nearby.append(sheep_position)
	if nearby.is_empty():
		return
	var best_route: Array[Vector2] = []
	var best_distance := -1.0
	for step in layout.STEPS:
		var cell: Vector2i = origin + step
		if not layout.asset_ground_free(cell, true) or layout.cells.get(cell) == "stairs":
			continue
		if cell == layout.cell_at(world.pawn.position):
			continue
		var occupied := false
		for sheep_position in layout.sheep:
			if layout.cell_at(sheep_position) == cell:
				occupied = true
		if occupied:
			continue
		var route := route_to_tile(position, cell)
		if route.is_empty():
			continue
		var distance := INF
		for sheep_position in nearby:
			distance = minf(distance, route.back().distance_squared_to(sheep_position))
		if distance > best_distance:
			best_distance = distance
			best_route = route
	if not best_route.is_empty():
		escape_route = best_route
		tile_destinations.assign([best_route.back()])
		destination = escape_route[0]
		fleeing = true
		reset_grazing()
		face_destination()

const FOLLOW_DELAY := 3.0
var pawn_trail: Array[Dictionary] = []
var trail_time := 0.0
var trail_position := Vector2.INF
var following := false
var pawn_moving := false
var wandering := false

func try_wandering() -> void:
	# Keep the existing wandering cycle while the pawn is stationary.
	if not pawn_moving and not following:
		super.try_wandering()
		wandering = fleeing

func movement_speed() -> float:
	return world.pawn.speed if following else super.movement_speed()

func clear_following() -> void:
	if following:
		fleeing = false
		escape_route.clear()
		tile_destinations.clear()
		destination = position
	following = false

func safe_follow_segment(start: Vector2, target: Vector2) -> bool:
	var pawn_cell: Vector2i = world.layout.cell_at(world.pawn.position)
	var samples := maxi(1, ceili(start.distance_to(target) / 4.0))
	for index in range(samples + 1):
		if world.layout.cell_at(start.lerp(target, float(index) / samples)) == pawn_cell:
			return false
	return world.clear_segment(start, target, true)

func follow_pawn() -> void:
	while not pawn_trail.is_empty():
		var sample: Dictionary = pawn_trail[0]
		if trail_time - float(sample.time) < FOLLOW_DELAY:
			return
		var target: Vector2 = sample.point
		var start: Vector2 = escape_route.back() if following and not escape_route.is_empty() else position
		# Retain the final tile's samples until the pawn leaves it. The chicken
		# never follows into the pawn's tile, even after the delay has expired.
		if world.layout.cell_at(target) == world.layout.cell_at(world.pawn.position):
			return
		if start.is_equal_approx(target):
			pawn_trail.pop_front()
			continue
		var route: Array[Vector2] = []
		if safe_follow_segment(start, target):
			route.append(target)
		else:
			route = world.tree_navigation_path(start, target, [], true)
			for point in route:
				if not safe_follow_segment(start, point):
					return
				start = point
		if route.is_empty():
			return
		pawn_trail.pop_front()
		escape_route.append_array(route)
		tile_destinations.append(target)
		if not following:
			destination = escape_route[0]
			following = true
			fleeing = true
			reset_grazing()
			face_destination()

func advance(delta: float, now: float) -> void:
	if chicken_index >= animal_positions().size():
		return
	pawn_moving = not world.pawn.position.is_equal_approx(previous_pawn_position)
	trail_time += maxf(delta, maxf(0.0, now - updated_at))
	if wandering and (pawn_moving or not fleeing):
		if fleeing:
			following = true
			clear_following()
		wandering = false
	var can_move: bool = not world.editing and world.water_phase == world.WaterPhase.READY
	if not can_move:
		clear_following()
		pawn_trail.clear()
		trail_position = Vector2.INF
	else:
		if following and not fleeing:
			following = false
		if world.layout.cell_at(world.pawn.position) == world.layout.cell_at(position):
			# Pawn contact takes precedence, including during a following run.
			clear_following()
			pawn_trail.clear()
			trail_position = Vector2.INF
		elif following:
			var start := position
			for point in escape_route:
				if not safe_follow_segment(start, point):
					clear_following()
					break
				start = point
		if not fleeing and world.layout.cell_at(world.pawn.position) != world.layout.cell_at(position):
			avoid_sheep()
		if not fleeing or following:
			if world.layout.walkable_point(world.pawn.position, true) and not trail_position.is_equal_approx(world.pawn.position):
				trail_position = world.pawn.position
				pawn_trail.append({"time": trail_time, "point": trail_position})
			follow_pawn()
		else:
			# Restart the trail after an escape, without replaying a stale route.
			pawn_trail.clear()
			trail_position = Vector2.INF
	super.advance(delta, now)
