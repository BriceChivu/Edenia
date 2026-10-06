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

const CHICKEN_SPACING := 32.0

func clear_of_chickens(start: Vector2, target: Vector2) -> bool:
	for index in world.layout.chickens.size():
		if index == chicken_index:
			continue
		var other: Vector2 = world.layout.chickens[index]
		# Chickens on different floors can share ground-plane coordinates.
		if absf(world.ground_height(other) - world.ground_height(start)) > 1.0:
			continue
		var closest := Geometry2D.get_closest_point_to_segment(other, start, target)
		var distance := start.distance_to(other)
		if distance < CHICKEN_SPACING - 0.01:
			# Older layouts may already overlap. Allow movement out of contact,
			# but never a segment that first takes the chicken deeper into it.
			if closest.distance_to(other) < distance - 0.01 or target.distance_to(other) <= distance:
				return false
		elif closest.distance_to(other) < CHICKEN_SPACING - 0.01:
			return false
	return true

func tile_target(cell: Vector2i) -> Vector2:
	var center: Vector2 = world.layout.center(cell)
	for offset in [Vector2.ZERO, Vector2(0, 24), Vector2(0, -24), Vector2(-24, 0), Vector2(24, 0), Vector2(-24, 24), Vector2(24, 24), Vector2(-24, -24), Vector2(24, -24)]:
		var target: Vector2 = center + offset
		if not world.layout.walkable_point(target, true):
			continue
		var available := true
		for index in world.layout.chickens.size():
			if index != chicken_index:
				var other: Vector2 = world.layout.chickens[index]
				if absf(world.ground_height(other) - world.ground_height(target)) <= 1.0 and target.distance_to(other) < CHICKEN_SPACING:
					available = false
		if available:
			return target
	return Vector2.INF

func separate_chickens() -> void:
	# Resolve pre-existing overlap one chicken at a time, leaving the first
	# chicken settled so the pair does not continually chase each other away.
	for index in range(chicken_index):
		var other: Vector2 = world.layout.chickens[index]
		if absf(world.ground_height(other) - world.ground_height(position)) > 1.0 or position.distance_to(other) >= CHICKEN_SPACING:
			continue
		for step in world.layout.STEPS:
			var cell: Vector2i = world.layout.cell_at(position) + step
			if cell == world.layout.cell_at(world.pawn.position):
				continue
			var route := route_to_tile(position, cell)
			if route.is_empty():
				continue
			escape_route.assign(route)
			tile_destinations.assign([route.back()])
			destination = route[0]
			fleeing = true
			reset_grazing()
			face_destination()
			return

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

const FOLLOW_DELAY := 2.0
var follow_wait := -1.0
var follow_target_cell := Vector2i(999, 999)
var following := false
var pawn_moving := false
var wandering := false

func try_wandering() -> void:
	# Keep the existing wandering cycle while the pawn is stationary.
	if not pawn_moving and not following and follow_wait < 0.0:
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
	follow_target_cell = Vector2i(999, 999)

func segment_enters_cell(start: Vector2, target: Vector2, cell: Vector2i) -> bool:
	var layout = world.layout
	if layout.cell_at(start) == cell or layout.cell_at(target) == cell:
		return true
	var corner: Vector2 = layout.center(cell) - Vector2.ONE * layout.SIZE / 2.0
	var corners := [corner, corner + Vector2(layout.SIZE, 0), corner + Vector2.ONE * layout.SIZE, corner + Vector2(0, layout.SIZE)]
	for index in 4:
		if Geometry2D.segment_intersects_segment(start, target, corners[index], corners[(index + 1) % 4]) != null:
			return true
	return false

func safe_follow_segment(start: Vector2, target: Vector2) -> bool:
	return clear_of_chickens(start, target) and not segment_enters_cell(start, target, world.layout.cell_at(world.pawn.position)) and world.clear_segment(start, target, true)

func movement_segment_allowed(start: Vector2, target: Vector2) -> bool:
	if not clear_of_chickens(start, target):
		return false
	if house_fleeing:
		return true
	# Legacy saves or an externally restored pawn can begin on this tile.
	# Permit an escape from that origin; normal movement never enters it.
	if world.layout.cell_at(start) == world.layout.cell_at(world.pawn.position):
		return world.clear_segment(start, target, true)
	return safe_follow_segment(start, target)

func route_to_tile(start: Vector2, cell: Vector2i) -> Array[Vector2]:
	var route := super.route_to_tile(start, cell)
	for point in route:
		if not movement_segment_allowed(start, point):
			return []
		start = point
	return route

func shortest_follow_route() -> Array[Vector2]:
	var layout = world.layout
	var pawn_cell: Vector2i = layout.cell_at(world.pawn.position)
	var targets: Array[Vector2] = []
	for step in layout.STEPS:
		var cell: Vector2i = pawn_cell + step
		if cell == layout.cell_at(position):
			return []
		if layout.cells.get(cell) == "stairs":
			continue
		var target := tile_target(cell)
		if target.is_finite():
			targets.append(target)
	if targets.is_empty():
		return []
	var nearest := targets[0]
	for target in targets:
		if position.distance_squared_to(target) < position.distance_squared_to(nearest):
			nearest = target
	if safe_follow_segment(position, nearest):
		return [nearest]
	# A* uses actual segment lengths, including diagonal steps. The pawn's
	# entire tile is excluded during the search, rather than rejecting a
	# completed route that could have gone around it.
	var source := Vector2i(((position - layout.ORIGIN) / 8.0).floor())
	var frontier: Array[Vector2i] = [source]
	var previous: Dictionary = {source: source}
	var costs: Dictionary = {source: 0.0}
	var scores: Dictionary = {source: follow_distance(position, targets)}
	var best_cost := INF
	var best_node := source
	var best_target := Vector2.INF
	while not frontier.is_empty():
		var selected := 0
		for index in range(1, frontier.size()):
			if float(scores[frontier[index]]) < float(scores[frontier[selected]]):
				selected = index
		var current: Vector2i = frontier[selected]
		frontier.remove_at(selected)
		if float(scores[current]) >= best_cost:
			break
		var point: Vector2 = position if current == source else layout.ORIGIN + Vector2(current) * 8.0
		for target in targets:
			var cost: float = float(costs[current]) + point.distance_to(target)
			if cost < best_cost and safe_follow_segment(point, target):
				best_cost = cost
				best_node = current
				best_target = target
		for step in layout.NAV_STEPS:
			var next: Vector2i = current + step
			var next_point: Vector2 = layout.ORIGIN + Vector2(next) * 8.0
			var cost: float = float(costs[current]) + point.distance_to(next_point)
			if cost >= float(costs.get(next, INF)) or not safe_follow_segment(point, next_point):
				continue
			costs[next] = cost
			scores[next] = cost + follow_distance(next_point, targets)
			previous[next] = current
			if not frontier.has(next):
				frontier.append(next)
	var route: Array[Vector2] = []
	if not best_target.is_finite():
		return route
	while best_node != source:
		route.push_front(layout.ORIGIN + Vector2(best_node) * 8.0)
		best_node = previous[best_node]
	route.append(best_target)
	# Remove unnecessary navigation samples so open ground takes a direct route.
	var start := position
	var smoothed: Array[Vector2] = []
	while not route.is_empty():
		var furthest := 0
		for index in route.size():
			if safe_follow_segment(start, route[index]):
				furthest = index
		start = route[furthest]
		smoothed.append(start)
		route = route.slice(furthest + 1)
	return smoothed

func follow_distance(point: Vector2, targets: Array[Vector2]) -> float:
	var distance := INF
	for target in targets:
		distance = minf(distance, point.distance_to(target))
	return distance

func follow_pawn() -> void:
	var pawn_cell: Vector2i = world.layout.cell_at(world.pawn.position)
	if following and fleeing and pawn_cell == follow_target_cell:
		return
	var route := shortest_follow_route()
	clear_following()
	follow_target_cell = pawn_cell
	if route.is_empty():
		if not pawn_moving:
			follow_wait = -1.0
		return
	escape_route.assign(route)
	tile_destinations.assign([route.back()])
	destination = route[0]
	following = true
	fleeing = true
	reset_grazing()
	face_destination()

func advance(delta: float, now: float) -> void:
	if chicken_index >= animal_positions().size():
		return
	pawn_moving = not world.pawn.position.is_equal_approx(previous_pawn_position)
	# Render frames can occur between physics steps. Keep a real walking
	# action active across those frames rather than repeatedly restarting delay.
	if world.pawn.is_physics_processing() and not world.pawn.chopping and not world.pawn.hammering:
		pawn_moving = pawn_moving or world.pawn.position.distance_to(world.pawn.destination) > 0.1
	var elapsed := maxf(delta, maxf(0.0, now - updated_at))
	# Ignore pawn movement throughout escape. Once settled, only a new pawn
	# movement starts the follow delay; no movement request or path is retained.
	var escaping := fleeing and not following and not wandering
	if escaping:
		follow_wait = -1.0
	elif not pawn_moving and follow_wait < 0.0:
		clear_following()
	elif pawn_moving and follow_wait < 0.0:
		follow_wait = 0.0
	var previous_wait := follow_wait
	if follow_wait >= 0.0:
		follow_wait += elapsed
	if house_fleeing:
		super.advance(delta, now)
		return
	if wandering and (pawn_moving or not fleeing):
		if fleeing:
			following = true
			clear_following()
		wandering = false
	var can_move: bool = not world.editing and world.water_phase == world.WaterPhase.READY
	if not can_move:
		clear_following()
		follow_wait = -1.0
	else:
		if following and not fleeing:
			following = false
		if world.layout.cell_at(world.pawn.position) == world.layout.cell_at(position):
			clear_following()
			follow_wait = -1.0
		elif following:
			var start := position
			for point in escape_route:
				if not safe_follow_segment(start, point):
					clear_following()
					break
				start = point
		if not fleeing and world.layout.cell_at(world.pawn.position) != world.layout.cell_at(position):
			avoid_sheep()
			if not fleeing:
				separate_chickens()
		if (not fleeing or following) and follow_wait >= FOLLOW_DELAY:
			follow_pawn()
			if previous_wait < FOLLOW_DELAY and following:
				# Catch-up only spends the time after the initial delay walking.
				elapsed = follow_wait - FOLLOW_DELAY
				updated_at = now - elapsed
				delta = elapsed
	super.advance(delta, now)
