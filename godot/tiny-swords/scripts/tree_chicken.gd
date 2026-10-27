extends RefCounted

const NO_TREE := Vector2i(999, 999)
const REACH := 48.0
var world
var target := NO_TREE
var generation := -1
var planned_position := Vector2.INF
var hover_key: Array = []
var hover_until := 0
var hover_reachable := false

func cancel() -> void:
	target = NO_TREE

func eligible(cell: Vector2i) -> bool:
	return ProjectSettings.get_setting("gameplay/chicken_carry_enabled", false) and world.layout.trees.has(cell) and world.layout.tree_types.get(cell, "tree") == "tree" and not world.layout.tree_stumps.has(cell) and (world.layout.chicken_release_at > 0) != world.layout.tree_chickens.has(cell)

func in_reach(cell: Vector2i) -> bool:
	var anchor: Vector2 = world.layout.tree_position(cell)
	var near_root: Vector2 = anchor + (world.pawn.position - anchor).normalized() * 24.0
	return world.pawn.position.distance_to(anchor) <= REACH and absf(world.ground_height(world.pawn.position) - world.layout.height_at(cell)) <= 1.0 and world.clear_segment(world.pawn.position, near_root)

func route_to(cell: Vector2i) -> Array[Vector2]:
	var empty: Array[Vector2] = []
	if not eligible(cell): return empty
	if in_reach(cell): return [world.pawn.position]
	var anchor: Vector2 = world.layout.tree_position(cell)
	# As with chopping, stand beside the roots on supported grass.
	for reach in [44.0, 40.0, 36.0, 32.0, 28.0, 24.0]:
		var points := [anchor + Vector2(-reach, 0), anchor + Vector2(reach, 0)]
		points.sort_custom(func(a, b): return a.distance_squared_to(world.pawn.position) < b.distance_squared_to(world.pawn.position))
		for point in points:
			if not world.layout.walkable_point(point) or absf(world.ground_height(point) - world.layout.height_at(cell)) > 1.0: continue
			var route: Array[Vector2] = world.land_route(world.pawn.position, world.layout.cell_at(point), point)
			if not route.is_empty() and route.back().is_equal_approx(point): return route
	return empty

func hover_available(cell: Vector2i) -> bool:
	if not eligible(cell): return false
	var key := [cell, world.layout.cell_at(world.pawn.position), world.layout.tree_position(cell), world.inventory_art_revision, world.layout.chicken_release_at > 0]
	if key != hover_key or Time.get_ticks_msec() >= hover_until:
		hover_key = key
		hover_until = Time.get_ticks_msec() + 400
		hover_reachable = not route_to(cell).is_empty()
	return hover_reachable

func request(cell: Vector2i) -> bool:
	var route := route_to(cell)
	if route.is_empty(): return false
	world.harvesting.cancel()
	world.construction.phase = world.construction.Phase.READY
	world.pawn.hammering = false
	world.movement_generation += 1
	world.navigation_pending = false
	world.water_phase = world.WaterPhase.READY
	world.waypoints = route
	world.pawn.walk_to(world.waypoints.pop_front())
	target = cell
	generation = world.movement_generation
	planned_position = world.layout.tree_position(cell)
	return true

func transfer(cell: Vector2i, now: float) -> bool:
	if not eligible(cell) or not in_reach(cell): return false
	if world.layout.chicken_release_at > 0:
		world.layout.tree_chickens[cell] = true
		world.layout.chicken_release_at = 0.0
		world.pawn.carrying_chicken = false
	else:
		world.layout.tree_chickens.erase(cell)
		world.layout.chicken_release_at = now + world.chicken_carry.HOLD_SECONDS
		world.pawn.carrying_chicken = true
		world.layout.complete_achievement("pick_chicken")
	world.history.clear()
	world.rebuild_decorations.call_deferred()
	world.save_layout()
	return true

func advance(now: float) -> void:
	if target == NO_TREE: return
	if world.editing or world.pawn.portal_absorbed or world.water_phase != world.WaterPhase.READY or generation != world.movement_generation or not eligible(target) or not world.layout.tree_position(target).is_equal_approx(planned_position):
		cancel()
		return
	if in_reach(target):
		transfer(target, now)
		world.waypoints.clear()
		world.pawn.walk_to(world.pawn.position)
		cancel()
