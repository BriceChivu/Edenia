extends Sprite2D

const Art = preload("res://scripts/level_five_art.gd")
const IDLE_SECONDS := 2.4
const GRASS_SECONDS := 1.2
var world
var sheep_index := 0
var idle_texture: Texture2D = Art.SHEEP_IDLE
var grass_texture: Texture2D = Art.SHEEP_GRASS
var run_texture: Texture2D = Art.SHEEP_RUN
var art_scale := 1.0
var art_offset := Vector2(0, -8)
var faces_left := false
var destination := Vector2.ZERO
var fleeing := false
var house_fleeing := false
var escape_route: Array[Vector2] = []
var tile_destinations: Array[Vector2] = []
var animation_time := 0.0
var resting_time := 0.0
var previous_pawn_position := Vector2.ZERO
var approach_direction := Vector2.ZERO
var grazing_cycles := 0
var grazing_target := randi_range(10, 15)
var updated_at := 0.0

func _ready() -> void:
	texture = idle_texture
	hframes = 6
	scale = Vector2.ONE * art_scale
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	position = animal_positions()[sheep_index]
	var height: float = world.ground_height(position)
	offset = art_offset - Vector2(0, height / art_scale)
	z_index = int(ceil(height / 64.0))
	destination = position
	previous_pawn_position = world.pawn.position
	updated_at = Time.get_unix_time_from_system()

func animal_positions() -> Array[Vector2]:
	return world.layout.sheep

func tile_target(cell: Vector2i) -> Vector2:
	var center: Vector2 = world.layout.center(cell)
	# A tree's tile remains usable. Choose a resting point outside its actual
	# contact footprint, including variants planted off-center.
	for offset in [Vector2.ZERO, Vector2(0, 20), Vector2(0, -20), Vector2(-20, 0), Vector2(20, 0), Vector2(-20, 20), Vector2(20, 20), Vector2(-20, -20), Vector2(20, -20)]:
		var target: Vector2 = center + offset
		if world.layout.walkable_point(target, true):
			return target
	return Vector2.INF

func route_to_tile(start: Vector2, cell: Vector2i) -> Array[Vector2]:
	var target := tile_target(cell)
	var route: Array[Vector2] = []
	if not target.is_finite():
		return route
	if world.clear_segment(start, target, true):
		route.append(target)
	else:
		# Restrict the fine path to this one tile step so trunk detours do not
		# silently add uncounted tiles or enter a different escape direction.
		var allowed_cells: Array[Vector2i] = [world.layout.cell_at(start), cell]
		route = world.tree_navigation_path(start, target, allowed_cells, true)
	return route

func escape_target() -> Vector2:
	var layout = world.layout
	var origin: Vector2i = layout.cell_at(position)
	var away := approach_direction.normalized()
	if away == Vector2.ZERO:
		away = (position - world.pawn.position).normalized()
	var steps: Array[Vector2i] = []
	for step in layout.STEPS:
		steps.append(step)
	steps.sort_custom(func(a, b): return Vector2(a).dot(away) > Vector2(b).dot(away))
	escape_route.clear()
	tile_destinations.clear()
	var connections := {}
	# Prefer an initial step away, then sideways, then toward the approach.
	# Later steps may turn; escape distance counts tiles along the safe route.
	# Keep distinct paths to each cell, without revisiting tiles within a path.
	# A shortest-path-only search can miss longer safe routes around a corner.
	for minimum_alignment in [0.5, -0.01, -1.01]:
		var frontier: Array[Array] = [[origin]]
		var candidates: Array[Array] = []
		var cursor := 0
		while cursor < frontier.size():
			var path := frontier[cursor]
			var cell: Vector2i = path.back()
			cursor += 1
			if path.size() - 1 >= 5:
				continue
			for step in steps:
				if cell == origin and away != Vector2.ZERO and Vector2(step).dot(away) < minimum_alignment:
					continue
				var next: Vector2i = cell + step
				if path.has(next) or not layout.asset_ground_free(next, true):
					continue
				var key := Vector4i(cell.x, cell.y, next.x, next.y)
				if not connections.has(key):
					var start: Vector2 = position if cell == origin else tile_target(cell)
					connections[key] = route_to_tile(start, next)
				if connections[key].is_empty():
					continue
				var next_path := path.duplicate()
				next_path.append(next)
				frontier.append(next_path)
				candidates.append(next_path)
		if candidates.is_empty():
			continue
		var available_distances: Array[int] = []
		var farthest := 0
		for candidate in candidates:
			var distance: int = candidate.size() - 1
			farthest = maxi(farthest, distance)
			if distance >= 3 and not available_distances.has(distance):
				available_distances.append(distance)
		var chosen_distance: int = farthest if available_distances.is_empty() else available_distances.pick_random()
		var targets: Array[Array] = []
		var best_alignment := -2.0
		for candidate in candidates:
			if candidate.size() - 1 != chosen_distance:
				continue
			var end: Vector2i = candidate.back()
			var alignment := Vector2(end - origin).normalized().dot(away)
			if alignment > best_alignment + 0.001:
				targets.clear()
				best_alignment = alignment
			if absf(alignment - best_alignment) <= 0.001:
				targets.append(candidate)
		var chosen_path: Array = targets.pick_random()
		for index in range(1, chosen_path.size()):
			var from: Vector2i = chosen_path[index - 1]
			var to: Vector2i = chosen_path[index]
			escape_route.append_array(connections[Vector4i(from.x, from.y, to.x, to.y)])
			tile_destinations.append(tile_target(to))
		break
	return position if escape_route.is_empty() else escape_route[0]

func adjacent_grass_target() -> Vector2:
	var layout = world.layout
	var origin: Vector2i = layout.cell_at(position)
	var candidates: Array[Vector2] = []
	for step in layout.STEPS:
		var cell: Vector2i = origin + step
		if not layout.asset_ground_free(cell, true):
			continue
		if cell == layout.cell_at(world.pawn.position):
			continue
		var route := route_to_tile(position, cell)
		if not route.is_empty():
			candidates.append(route.back())
	return position if candidates.is_empty() else candidates.pick_random()

func reset_grazing() -> void:
	resting_time = 0.0
	grazing_cycles = 0
	grazing_target = randi_range(10, 15)

func face_destination() -> void:
	if absf(destination.x - position.x) > 0.001:
		flip_h = (destination.x > position.x) if faces_left else (destination.x < position.x)

func try_wandering() -> void:
	destination = adjacent_grass_target()
	reset_grazing()
	if destination != position:
		escape_route = route_to_tile(position, world.layout.cell_at(destination))
		if not escape_route.is_empty():
			tile_destinations.assign([escape_route.back()])
			destination = escape_route[0]
			fleeing = true
			face_destination()

func movement_segment_allowed(_start: Vector2, _target: Vector2) -> bool:
	return true

func movement_speed() -> float:
	return 110.0

func _process(delta: float) -> void:
	advance(delta, Time.get_unix_time_from_system())

func advance(delta: float, now: float) -> void:
	if not fleeing:
		house_fleeing = false
	var animals := animal_positions()
	if sheep_index >= animals.size():
		return
	# Hidden iframes and background tabs may suspend frames or clamp delta.
	var elapsed := maxf(delta, maxf(0.0, now - updated_at))
	updated_at = now
	var pawn_movement: Vector2 = world.pawn.position - previous_pawn_position
	if pawn_movement.length_squared() > 0.001:
		approach_direction = pawn_movement.normalized()
	previous_pawn_position = world.pawn.position
	var can_move: bool = house_fleeing or (not world.editing and world.water_phase == world.WaterPhase.READY)
	if can_move:
		if not fleeing and world.layout.cell_at(world.pawn.position) == world.layout.cell_at(position):
			destination = escape_target()
			fleeing = destination != position
			if fleeing:
				reset_grazing()
				face_destination()
		if not fleeing and grazing_cycles >= grazing_target:
			try_wandering()
	elif fleeing:
		# Finish this tile step at its safe resting point before editing changes
		# its ground. Fine navigation bends may lie on a tile boundary.
		var resting_point: Vector2 = tile_destinations[0] if not tile_destinations.is_empty() else tile_target(world.layout.cell_at(destination))
		if movement_segment_allowed(position, resting_point):
			position = resting_point
		destination = position
		animals[sheep_index] = position
		fleeing = false
		escape_route.clear()
		tile_destinations.clear()
		reset_grazing()
		world.save_layout()
	# Advance to animation/movement boundaries so a suspended frame counts every
	# complete eating loop and can cross several grazing destinations.
	while elapsed > 0.0:
		if fleeing:
			if not movement_segment_allowed(position, destination):
				fleeing = false
				escape_route.clear()
				tile_destinations.clear()
				destination = position
				reset_grazing()
				continue
			var travel_seconds := position.distance_to(destination) / movement_speed()
			var step := minf(elapsed, travel_seconds)
			position = position.move_toward(destination, step * movement_speed())
			if not house_fleeing:
				animals[sheep_index] = position
			animation_time += step
			elapsed -= step
			if step >= travel_seconds:
				position = destination
				if not house_fleeing:
					animals[sheep_index] = position
				if not tile_destinations.is_empty() and position.is_equal_approx(tile_destinations[0]):
					tile_destinations.pop_front()
				escape_route.pop_front()
				fleeing = not escape_route.is_empty()
				if fleeing:
					destination = escape_route[0]
					face_destination()
				else:
					reset_grazing()
					world.save_layout()
		else:
			var cycle_seconds := IDLE_SECONDS + GRASS_SECONDS
			var remaining := cycle_seconds - resting_time
			var step := minf(elapsed, remaining)
			resting_time += step
			elapsed -= step
			if remaining - step <= 0.000001:
				resting_time = 0.0
				grazing_cycles = mini(grazing_cycles + 1, grazing_target)
				if can_move and grazing_cycles >= grazing_target:
					try_wandering()
	frame = 0
	if fleeing:
		texture = run_texture
		hframes = 4
		frame = int(animation_time * 10) % hframes
	else:
		var grazing := resting_time >= IDLE_SECONDS
		texture = grass_texture if grazing else idle_texture
		hframes = 12 if grazing else 6
		var phase_time := resting_time - IDLE_SECONDS if grazing else resting_time
		frame = int(phase_time * 10) % hframes
	var height: float = world.ground_height(position)
	offset = art_offset - Vector2(0, height / art_scale)
	z_index = int(ceil(height / 64.0))

	var shadow := get_node_or_null("GroundShadow") as Polygon2D
	if shadow != null:
		shadow.position.y = -height / art_scale
