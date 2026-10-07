extends Node2D

# Order every overlapping actor against every terrain piece. Ramp overrides
# must preserve the relations to adjoining cliffs regardless of insertion order.
var previous_inputs: Array = []

func is_actor(node: Node) -> bool:
	return node == get_parent().pawn or node.has_method("animal_positions")

func is_terrain(node: Node) -> bool:
	return node.has_meta("terrain_occluder")

func is_ramp(node: Node) -> bool:
	return is_terrain(node) and node.display_layout().cells.get(node.piece) == "stairs"

func depth_y(node: Node2D) -> float:
	return node.position.y + (node.FOOT_DEPTH_Y if node == get_parent().pawn else 0.0)

func actor_in_front(actor: Node2D, terrain: Node2D) -> bool:
	if not is_ramp(terrain):
		return depth_y(actor) > depth_y(terrain)
	var layout = terrain.display_layout()
	var origin: Vector2 = layout.ORIGIN + Vector2(terrain.piece) * 64.0
	var progress := clampf((actor.position.x - origin.x) / 64.0, 0.0, 1.0)
	if layout.stair_direction(terrain.piece).x < 0:
		progress = 1.0 - progress
	var edge_y: float = origin.y - layout.height_at(terrain.piece) - progress * 64.0
	return actor.position.y - get_parent().ground_height(actor.position) > edge_y

func overlaps_terrain(actor: Node2D, terrain: Node2D) -> bool:
	var layout = terrain.display_layout()
	var origin: Vector2 = layout.ORIGIN + Vector2(terrain.piece) * 64.0
	var feet: Vector2 = actor.position - Vector2(0, get_parent().ground_height(actor.position))
	# Include the full pawn/sheep/chicken artwork around its ground anchor.
	return Rect2(origin - Vector2(64, layout.height_at(terrain.piece) + 80), Vector2(192, 272)).has_point(feet)

func _process(_delta: float) -> void:
	var nodes: Array[Node2D] = []
	var inputs: Array = []
	var ramps := false
	for child in get_children():
		if child is Node2D and not child.is_queued_for_deletion():
			nodes.append(child)
			ramps = ramps or is_ramp(child)
	if not ramps:
		y_sort_enabled = true
		previous_inputs.clear()
		return
	y_sort_enabled = false
	# Sorting changes sibling order, so cache inputs in stable instance order.
	var stable := nodes.duplicate()
	stable.sort_custom(func(a,b): return a.get_instance_id() < b.get_instance_id())
	inputs.clear()
	for node in stable:
		inputs.append_array([node.get_instance_id(), node.position, node.z_index])
		if is_ramp(node):
			inputs.append_array([node.display_layout().height_at(node.piece), node.display_layout().stair_direction(node.piece)])
	if inputs == previous_inputs:
		return
	previous_inputs = inputs
	nodes.sort_custom(func(a,b): return depth_y(a) < depth_y(b) if depth_y(a) != depth_y(b) else a.get_instance_id() < b.get_instance_id())
	var edges: Array = []
	var incoming: Array[int] = []
	for node in nodes:
		edges.append([])
		incoming.append(0)
	var actor_indices: Array[int] = []
	var terrain_indices: Array[int] = []
	for i in nodes.size():
		if is_actor(nodes[i]):
			actor_indices.append(i)
		elif is_terrain(nodes[i]):
			terrain_indices.append(i)
	# Explicit cliff relations keep a ramp constraint from pushing a lower
	# actor after a landing that happened to be created before the ramp.
	for terrain_index in terrain_indices:
		for actor_index in actor_indices:
			var actor = nodes[actor_index]
			var terrain = nodes[terrain_index]
			if actor.z_index != terrain.z_index or not overlaps_terrain(actor, terrain):
				continue
			var front := actor_in_front(actor, terrain)
			var first := terrain_index if front else actor_index
			var last := actor_index if front else terrain_index
			edges[first].append(last)
			incoming[last] += 1
	var pending: Array[int] = []
	for i in nodes.size():
		pending.append(i)
	var draw_index := 0
	while not pending.is_empty():
		var chosen: int = pending[0]
		for index in pending:
			if incoming[index] == 0:
				chosen = index
				break
		pending.erase(chosen)
		move_child(nodes[chosen], draw_index)
		draw_index += 1
		for index in edges[chosen]:
			incoming[index] -= 1
