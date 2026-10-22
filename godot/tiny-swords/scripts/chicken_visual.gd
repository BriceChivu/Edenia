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
	run_frames = 6
	art_scale = Art.CHICKEN_SCALE
	art_offset = Art.CHICKEN_OFFSET
	faces_left = true
	super._ready()

func animal_positions() -> Array[Vector2]:
	return world.layout.chickens

func bush_depth_offset(bush: Sprite2D) -> float:
	return BushContact.depth_offset(self, bush, true)

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

# Escape may turn sideways, but a first step back toward the pawn is not away.
var choosing_escape := false
func escape_target() -> Vector2:
	choosing_escape = true
	var target := super.escape_target()
	choosing_escape = false
	return target

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
	if follow_search != null and OS.has_feature("web"):
		var details := {"workMs": follow_search_work / 1000.0, "wallMs": (Time.get_ticks_usec() - follow_search_started) / 1000.0, "cancelled": not follow_search.done}
		JavaScriptBridge.eval("window.edeniaLagCapture?.probe('chicken-follow', %s, %s); window.edeniaFrameTest?.recordProbe('chicken-follow', %s, Date.now(), %s)" % [follow_search_max_slice / 1000.0, JSON.stringify(details), follow_search_max_slice / 1000.0, JSON.stringify(details)])
	follow_search = null
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
		return world.terrain_clear_segment(start, target, true)
	# Legacy saves or an externally restored pawn can begin on this tile.
	# Permit an escape from that origin; normal movement never enters it.
	if world.layout.cell_at(start) == world.layout.cell_at(world.pawn.position):
		return world.clear_segment(start, target, true)
	return safe_follow_segment(start, target)

func route_to_tile(start: Vector2, cell: Vector2i) -> Array[Vector2]:
	if choosing_escape and world.layout.cell_at(start) == world.layout.cell_at(position):
		var away: Vector2 = (position - world.pawn.position).normalized()
		if away == Vector2.ZERO:
			away = approach_direction.normalized()
		if Vector2(cell - world.layout.cell_at(start)).dot(away) < -0.01:
			return []
	var route := super.route_to_tile(start, cell)
	for point in route:
		if not movement_segment_allowed(start, point):
			return []
		start = point
	return route

func follow_targets() -> Array[Vector2]:
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
	return targets

func new_follow_search():
	var targets := follow_targets()
	if targets.is_empty():
		return null
	return preload("res://scripts/chicken_follow_search.gd").new(self, targets)

func shortest_follow_route() -> Array[Vector2]:
	var search = new_follow_search()
	if search == null:
		return []
	while not search.done:
		search.advance(Time.get_ticks_usec() + 1000000)
	return search.result

var follow_search
var follow_search_geometry := 0
var follow_search_cell := Vector2i.ZERO
var follow_search_started := 0
var follow_search_work := 0
var follow_search_max_slice := 0

func follow_distance(point: Vector2, targets: Array[Vector2]) -> float:
	var distance := INF
	for target in targets:
		distance = minf(distance, point.distance_to(target))
	return distance

func follow_pawn() -> void:
	var pawn_cell: Vector2i = world.layout.cell_at(world.pawn.position)
	if following and fleeing and pawn_cell == follow_target_cell:
		return
	var route: Array[Vector2] = []
	if bool(ProjectSettings.get_setting("gameplay/bounded_obstacle_search_enabled", false)):
		var began := Time.get_ticks_usec()
		var geometry: int = world.navigation_signature()
		if follow_search != null and (follow_search_geometry != geometry or follow_search_cell != pawn_cell or follow_search.layout != world.layout or not follow_search.start.is_equal_approx(position)):
			follow_search = null
		if follow_search == null:
			clear_following()
			follow_search = new_follow_search()
			follow_search_started = began
			follow_search_work = 0
			follow_search_max_slice = 0
			follow_search_geometry = geometry
			follow_search_cell = pawn_cell
		if follow_search == null:
			return
		follow_search.advance(began + world.navigation_budget())
		var slice_usec := Time.get_ticks_usec() - began
		world.navigation_spent_usec += slice_usec
		follow_search_work += slice_usec
		follow_search_max_slice = maxi(follow_search_max_slice, slice_usec)
		if not follow_search.done:
			return
		route.assign(follow_search.result)
		var origin := position
		for point in route:
			if not safe_follow_segment(origin, point):
				follow_search = null
				return
			origin = point
	else:
		route = shortest_follow_route()
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
	pawn_moving = not world.pawn.portal_absorbed and not world.pawn.position.is_equal_approx(previous_pawn_position)
	# Render frames can occur between physics steps. Keep a real walking
	# action active across those frames rather than repeatedly restarting delay.
	if not world.pawn.portal_absorbed and world.pawn.is_physics_processing() and not world.pawn.chopping and not world.pawn.hammering:
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
		if not world.pawn.portal_absorbed and world.layout.cell_at(world.pawn.position) == world.layout.cell_at(position):
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
	if can_move and not fleeing and world.layout.cell_at(world.pawn.position) == world.layout.cell_at(position) and absf(world.ground_height(position) - world.ground_height(world.pawn.position)) <= 1.0:
		var movement: Vector2 = world.pawn.position - previous_pawn_position
		if movement.length_squared() > 0.001:
			approach_direction = movement.normalized()
		var target := escape_target()
		if target == position:
			if world.chicken_carry != null and world.chicken_carry.pickup(chicken_index, now):
				hide()
				set_process(false)
				return
		else:
			destination = target
			fleeing = true
			reset_grazing()
			face_destination()
	super.advance(delta, now)
