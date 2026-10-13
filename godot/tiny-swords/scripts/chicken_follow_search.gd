extends "res://scripts/obstacle_search.gd"

# Euclidean shortest-follow search, including the reserved pawn tile and bird
# spacing. Terrain contacts are request-local; completed routes are revalidated.
var bird
var pawn_cell := Vector2i.ZERO
var best_cost := INF
var best_node := Vector2i.ZERO
var best_target := Vector2.INF
var active_cost := 0.0
var target_index := 0
var smoothing := false
var pending_route: Array[Vector2] = []
var smooth_start := Vector2.ZERO
var smooth_index := 0
var smooth_furthest := 0

func _init(chicken, destinations: Array[Vector2]) -> void:
	bird = chicken
	pawn_cell = bird.world.layout.cell_at(bird.world.pawn.position)
	super(bird.world, bird.position, destinations[0], [], true, destinations.slice(1))
	best_node = source
	smooth_start = start

func heuristic(node: Vector2i) -> float:
	var point: Vector2 = start if node == source else layout.ORIGIN + Vector2(node) * 8.0
	return bird.follow_distance(point, targets)

func clear(origin: Vector2, target: Vector2) -> bool:
	return not bird.segment_enters_cell(origin, target, pawn_cell) and bird.clear_of_chickens(origin, target) and super.clear(origin, target)

func begin_smoothing() -> void:
	if not best_target.is_finite():
		done = true
		return
	var node := best_node
	while node != source:
		pending_route.push_front(layout.ORIGIN + Vector2(node) * 8.0)
		node = previous[node]
	pending_route.append(best_target)
	smoothing = true

func advance(deadline_usec: int) -> void:
	while not done and Time.get_ticks_usec() < deadline_usec:
		if smoothing:
			if pending_route.is_empty():
				done = true
				return
			if clear(smooth_start, pending_route[smooth_index]):
				smooth_furthest = smooth_index
			smooth_index += 1
			if smooth_index == pending_route.size():
				smooth_start = pending_route[smooth_furthest]
				result.append(smooth_start)
				pending_route = pending_route.slice(smooth_furthest + 1)
				smooth_index = 0
				smooth_furthest = 0
			continue
		if edge < 0:
			if heap.is_empty():
				begin_smoothing()
				continue
			var entry := pop()
			current = entry[2]
			active_cost = entry[1]
			if costs[current] != active_cost:
				continue
			if float(entry[0]) >= best_cost:
				begin_smoothing()
				continue
			expanded += 1
			current_point = start if current == source else layout.ORIGIN + Vector2(current) * 8.0
			edge = 0
			target_index = 0
		if target_index < targets.size():
			var target: Vector2 = targets[target_index]
			target_index += 1
			var cost := active_cost + current_point.distance_to(target)
			if cost < best_cost and clear(current_point, target):
				best_cost = cost
				best_node = current
				best_target = target
			continue
		var next: Vector2i = current + layout.NAV_STEPS[edge]
		edge += 1
		if edge == layout.NAV_STEPS.size():
			edge = -1
		var point: Vector2 = layout.ORIGIN + Vector2(next) * 8.0
		var cost := active_cost + current_point.distance_to(point)
		if cost >= float(costs.get(next, INF)) or not clear(current_point, point):
			continue
		costs[next] = cost
		previous[next] = current
		push([cost + heuristic(next), cost, next])
