extends Node2D

# Order every overlapping actor against every terrain piece. Ramp overrides
# must preserve the relations to adjoining cliffs regardless of insertion order.
const Layout = preload("res://scripts/terrain_layout.gd")
var previous_inputs: Array = []
static var foliage_bottom_rows: Dictionary = {}

static func anchor_foliage(node: Sprite2D, height: float) -> void:
	# Horizontal animation sheets share their ground-contact row. Cache the
	# authored alpha bounds so rebuilding scenery does not read texture pixels.
	if not foliage_bottom_rows.has(node.texture):
		foliage_bottom_rows[node.texture] = node.texture.get_image().get_used_rect().end.y
	var shift: float = (node.get_rect().position.y + foliage_bottom_rows[node.texture]) * node.scale.y + height
	node.position.y += shift
	node.offset.y -= shift / node.scale.y

func is_actor(node: Node) -> bool:
	return node == get_parent().pawn or node.has_method("animal_positions")

func is_terrain(node: Node) -> bool:
	return node.has_meta("terrain_occluder") and node.has_method("display_layout")

func is_ramp(node: Node) -> bool:
	return is_terrain(node) and node.display_layout().cells.get(node.piece) == "stairs"

func depth_y(node: Node2D) -> float:
	return node.position.y + (node.FOOT_DEPTH_Y if node == get_parent().pawn else 0.0)

func actor_in_front(actor: Node2D, terrain: Node2D) -> bool:
	if terrain.has_meta("bush_contact_variant") and actor.has_method("bush_depth_offset"):
		return depth_y(actor) + actor.bush_depth_offset(terrain) > depth_y(terrain)
	if terrain.has_meta("rock_cell"):
		return depth_y(actor) > Layout.rock_depth_y(terrain.get_meta("rock_face"), actor.position.x)
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
	var needs_sort := false
	for child in get_children():
		if child is Node2D and not child.is_queued_for_deletion():
			nodes.append(child)
			needs_sort = needs_sort or is_ramp(child) or child.has_meta("rock_cell") or child.has_meta("bush_contact_variant")
	if not needs_sort:
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
		if node.has_method("bush_depth_offset"):
			inputs.append(node.flip_h)
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
		elif is_terrain(nodes[i]) or nodes[i].has_meta("foliage_depth"):
			terrain_indices.append(i)
	# Explicit cliff relations keep a ramp constraint from pushing a lower
	# actor after a landing that happened to be created before the ramp.
	for terrain_index in terrain_indices:
		for actor_index in actor_indices:
			var actor = nodes[actor_index]
			var terrain = nodes[terrain_index]
			if actor.z_index != terrain.z_index:
				continue
			# Keep foliage's contact order when ramp constraints delay an actor.
			if is_terrain(terrain) and not overlaps_terrain(actor, terrain):
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
