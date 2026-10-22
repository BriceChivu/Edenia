extends RefCounted

## One request, with immutable contact caches and incremental A* edge expansion.
## The caller owns the frame budget and invalidates on navigation geometry changes.
const Layout = preload("res://scripts/terrain_layout.gd")
var layout
var bridges: Array[Vector2i] = []
var moving_animal := false
var contact_half_size := Vector2.ZERO
var allowed: Array[Vector2i] = []
var targets: Array[Vector2] = []
var start := Vector2.ZERO
var source := Vector2i.ZERO
var heap: Array = []
var previous: Dictionary = {}
var costs: Dictionary = {}
var point_contacts: Dictionary = {}
var crossings: Dictionary = {}
var footprints: Array = []
var bounds: Array = []
var result: Array[Vector2] = []
var done := false
var current := Vector2i.ZERO
var current_point := Vector2.ZERO
var current_cost := 0
var edge := -1
var expanded := 0
var nearest := false
var requested_target := Vector2.ZERO
var closest_node := Vector2i.ZERO
var closest_point := Vector2.ZERO
var closest_distance := INF
var closest_cost := 0

func _init(world, origin: Vector2, target: Vector2, cells: Array, animal: bool, alternatives: Array, allow_nearest := false) -> void:
	layout = world.layout
	bridges.assign(world.walking_bridges)
	start = origin
	moving_animal = animal
	allowed.assign(cells)
	nearest = allow_nearest
	requested_target = target
	var choices: Array = [target] + alternatives
	if nearest and not layout.walkable_point(target, animal):
		choices = layout.walk_click_targets(target)
	for point in choices:
		if layout.walkable_point(point, animal):
			targets.append(point)
	if targets.is_empty():
		if not nearest:
			done = true
			return
		# An unreachable exact goal still guides the search of reachable grass.
		targets.append(target)
	for cell in layout.trees:
		var footprint: PackedVector2Array = layout.tree_footprint(layout.tree_position(cell), layout.tree_types.get(cell, "tree"))
		footprints.append(footprint)
		var rect := Rect2(footprint[0], Vector2.ZERO)
		for point in footprint:
			rect = rect.expand(point)
		bounds.append(rect)
	source = Vector2i(((start - Layout.ORIGIN) / 8.0).floor())
	previous[source] = source
	costs[source] = 0
	push([heuristic(source), 0, source])

func heuristic(node: Vector2i) -> float:
	var distance := INF
	for target in targets:
		var delta: Vector2 = (Layout.ORIGIN + Vector2(node) * 8 - target).abs() / 8.0
		distance = minf(distance, maxf(0, maxf(delta.x, delta.y) - 1.5))
	return distance

func advance(deadline_usec: int) -> void:
	while not done and Time.get_ticks_usec() < deadline_usec:
		# Check the clock between edges, rather than between whole expansions.
		if edge < 0:
			if heap.is_empty():
				if nearest and closest_distance < INF and not closest_point.is_equal_approx(start):
					finish(closest_node, closest_point)
				done = true
				return
			var entry := pop()
			current = entry[2]
			current_cost = entry[1]
			if costs[current] != current_cost:
				continue
			expanded += 1
			current_point = start if current == source else Layout.ORIGIN + Vector2(current) * 8
			for point in targets:
				if current_point.distance_squared_to(point) <= 144 and (not nearest or layout.walkable_point(point, moving_animal)) and clear(current_point, point):
					finish(current, point)
					return
			if nearest:
				consider_closest(current, current_point, current_cost)
			edge = 0
		var next: Vector2i = current + Layout.NAV_STEPS[edge]
		edge += 1
		if edge == Layout.NAV_STEPS.size():
			edge = -1
		var cost := current_cost + 1
		if costs.has(next) and costs[next] <= cost:
			continue
		var point := Layout.ORIGIN + Vector2(next) * 8
		if not allowed.is_empty() and not layout.cell_at(point) in allowed:
			continue
		if not clear(current_point, point):
			continue
		costs[next] = cost
		previous[next] = current
		push([cost + heuristic(next), cost, next])

func less(a: Array, b: Array) -> bool:
	return a[0] < b[0] or (a[0] == b[0] and a[1] > b[1])

func push(item: Array):
	heap.append(item)
	var i = heap.size() - 1
	while i > 0:
		var parent = (i - 1) / 2
		if not less(heap[i], heap[parent]): break
		var swap = heap[i]; heap[i] = heap[parent]; heap[parent] = swap
		i = parent

func pop() -> Array:
	var item = heap[0]
	var last = heap.pop_back()
	if not heap.is_empty():
		heap[0] = last
		var i = 0
		while 2 * i + 1 < heap.size():
			var child = 2 * i + 1
			if child + 1 < heap.size() and less(heap[child + 1], heap[child]): child += 1
			if not less(heap[child], heap[i]): break
			var swap = heap[i]; heap[i] = heap[child]; heap[child] = swap
			i = child
	return item

func clear(start: Vector2, end: Vector2) -> bool:
	for bridge in bridges:
		if layout.bridges.has(bridge) and layout.BridgeRules.spans(layout,bridge,start,end): return true
	for index in footprints.size():
		var footprint = footprints[index]
		var rect = bounds[index]
		if maxf(start.x,end.x) < rect.position.x or minf(start.x,end.x) > rect.end.x or maxf(start.y,end.y) < rect.position.y or minf(start.y,end.y) > rect.end.y: continue
		if Geometry2D.is_point_in_polygon(start,footprint) or Geometry2D.is_point_in_polygon(end,footprint): return false
		for i in footprint.size():
			if Geometry2D.segment_intersects_segment(start,end,footprint[i],footprint[(i+1)%footprint.size()]) != null: return false
	if layout.rocks_block_segment(start, end, moving_animal): return false
	for cell in layout.log_piles:
		if (layout.log_blocks_contact(cell,start,end) if moving_animal else layout.log_blocks_feet(cell,start,end)): return false
	for cell in layout.houses:
		if layout.house_blocks_contact(cell,start,end,moving_animal): return false
	var samples = maxi(1,ceili(start.distance_to(end)/4.0))
	var previous = layout.cell_at(start)
	for i in range(samples+1):
		var point = start.lerp(end,float(i)/samples)
		var current = layout.cell_at(point)
		if current != previous:
			var key = Vector4i(previous.x,previous.y,current.x,current.y)
			if not crossings.has(key): crossings[key] = layout.can_cross(previous,current)
			if not crossings[key]: return false
		previous = current
		if not point_contacts.has(point): point_contacts[point] = layout.terrain_feet_free(point,moving_animal,contact_half_size)
		if not point_contacts[point]: return false
	return true

func finish(node: Vector2i, point: Vector2) -> void:
	while node != source:
		result.append(Layout.ORIGIN + Vector2(node) * 8)
		node = previous[node]
	result.reverse()
	result.append(point)
	done = true

func consider_closest(node: Vector2i, point: Vector2, cost: int) -> void:
	var distance := point.distance_to(requested_target)
	if distance > closest_distance + 12.0:
		return
	# Refine the last grid step continuously up to the collision boundary.
	# Every candidate stays connected to an already reached navigation node.
	var end := point.move_toward(requested_target, 12.0)
	var low := 0.0
	var high := 1.0
	if clear(point, end):
		low = 1.0
	else:
		for iteration in range(8):
			var middle := (low + high) * 0.5
			if clear(point, point.lerp(end, middle)):
				low = middle
			else:
				high = middle
	var candidate := point.lerp(end, low)
	var remaining := candidate.distance_to(requested_target)
	if remaining < closest_distance - 0.001 or (absf(remaining - closest_distance) <= 0.001 and cost < closest_cost):
		closest_distance = remaining
		closest_node = node
		closest_point = candidate
		closest_cost = cost
