extends RefCounted

const Sheep = preload("res://scripts/sheep_visual.gd")
const Calendar = preload("res://scripts/black_hole_state.gd")
const REACH := 48.0
var world
var target: Sprite2D
var generation := -1
var planned_position := Vector2.INF
var retry_at := 0.0
var hit_images: Dictionary = {}
var hover_key: Array = []
var hover_until := 0
var hover_reachable := false

func cancel() -> void:
	target = null

func eligible(index: int) -> bool:
	return index >= 0 and index < world.layout.sheep.size() and ProjectSettings.get_setting("gameplay/chicken_carry_enabled", false) and (world.layout.chicken_release_at > 0) != world.layout.sheep_chickens.has(index)

func hit(point: Vector2) -> Sprite2D:
	var result: Sprite2D
	var front := -INF
	for node in world.asset_nodes:
		if not is_instance_valid(node) or node.get_script() != Sheep or not eligible(node.sheep_index):
			continue
		# Use opaque artwork, including the perched chicken, on raised grass too.
		var local: Vector2 = node.to_local(point) - node.offset + Vector2(64, 64)
		if node.flip_h: local.x = 128.0 - local.x
		if not hit_images.has(node.texture): hit_images[node.texture] = node.texture.get_image()
		if Rect2(0, 0, 128, 128).has_point(local) and hit_images[node.texture].get_pixel(int(local.x) + node.frame * 128, int(local.y)).a > 0.1 and node.position.y > front:
			result = node
			front = node.position.y
	return result

func in_reach(sheep: Sprite2D) -> bool:
	return world.pawn.position.distance_to(sheep.position) <= REACH and absf(world.ground_height(world.pawn.position) - world.ground_height(sheep.position)) <= 1.0 and world.clear_segment(world.pawn.position, sheep.position)

func route_to(sheep: Sprite2D) -> Array[Vector2]:
	var empty: Array[Vector2] = []
	if not eligible(sheep.sheep_index): return empty
	if in_reach(sheep): return [world.pawn.position]
	var directions: Array[Vector2] = []
	for i in 8: directions.append(Vector2.from_angle(i * TAU / 8.0))
	directions.sort_custom(func(a, b): return (sheep.position + a * 44.0).distance_squared_to(world.pawn.position) < (sheep.position + b * 44.0).distance_squared_to(world.pawn.position))
	for direction in directions:
		var point: Vector2 = sheep.position + direction * 44.0
		if not world.layout.walkable_point(point) or absf(world.ground_height(point) - world.ground_height(sheep.position)) > 1.0 or not world.clear_segment(point, sheep.position): continue
		var route: Array[Vector2] = world.land_route(world.pawn.position, world.layout.cell_at(point), point)
		if not route.is_empty() and route.back().is_equal_approx(point): return route
	return empty

func hover_available(point: Vector2) -> bool:
	var sheep := hit(point)
	if sheep == null: return false
	var key := [sheep.get_instance_id(), world.layout.cell_at(sheep.position), world.layout.cell_at(world.pawn.position), world.inventory_art_revision, world.layout.chicken_release_at > 0]
	if key != hover_key or Time.get_ticks_msec() >= hover_until:
		hover_key = key
		hover_until = Time.get_ticks_msec() + 400
		hover_reachable = not route_to(sheep).is_empty()
	return hover_reachable

func request(sheep: Sprite2D) -> void:
	var route := route_to(sheep)
	if route.is_empty(): return
	world.harvesting.cancel()
	world.construction.phase = world.construction.Phase.READY
	world.pawn.hammering = false
	world.movement_generation += 1
	world.navigation_pending = false
	world.water_phase = world.WaterPhase.READY
	world.waypoints = route
	world.pawn.walk_to(world.waypoints.pop_front())
	target = sheep
	generation = world.movement_generation
	planned_position = sheep.position
	retry_at = Time.get_unix_time_from_system() + 0.35

func transfer(sheep: Sprite2D, now: float, day: int = Calendar.today()) -> bool:
	if not eligible(sheep.sheep_index) or not in_reach(sheep): return false
	var index: int = sheep.sheep_index
	if world.layout.chicken_release_at > 0:
		world.layout.sheep_chickens[index] = day
		world.layout.chicken_release_at = 0.0
		world.pawn.carrying_chicken = false
	else:
		world.layout.sheep_chickens.erase(index)
		world.layout.chicken_release_at = now + world.chicken_carry.HOLD_SECONDS
		world.pawn.carrying_chicken = true
		world.layout.complete_achievement("pick_chicken")
	world.history.clear()
	world.save_layout()
	return true

func advance(now: float, day: int = Calendar.today()) -> void:
	# Expired birds wait safely on their sheep if no landing is available.
	for index in world.layout.sheep_chickens.keys():
		if day <= world.layout.sheep_chickens[index]: continue
		var point: Vector2 = world.chicken_carry.drop_target([], world.layout.sheep[index])
		if not point.is_finite(): continue
		world.layout.chickens.append(point)
		world.layout.sheep_chickens.erase(index)
		world.history.clear()
		world.rebuild_decorations.call_deferred()
		world.save_layout()
	if not is_instance_valid(target):
		cancel()
		return
	if world.editing or world.pawn.portal_absorbed or world.water_phase != world.WaterPhase.READY or generation != world.movement_generation or not eligible(target.sheep_index):
		cancel()
		return
	if in_reach(target):
		transfer(target, now, day)
		world.waypoints.clear()
		world.pawn.walk_to(world.pawn.position)
		cancel()
	elif now >= retry_at and (target.position.distance_to(planned_position) > 12.0 or (world.waypoints.is_empty() and world.pawn.position.distance_to(world.pawn.destination) < 0.2)):
		var sheep := target
		cancel()
		request(sheep)
