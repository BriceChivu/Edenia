extends RefCounted

# Cache the union of opaque pixels over every animation frame, so a wind pose
# cannot hide a portal that was clear when the tree was still.
static var bounds_cache: Dictionary = {}

static func frame_bounds(texture: Texture2D, columns: int, rows: int) -> Rect2:
	var key := [texture, columns, rows]
	if bounds_cache.has(key): return bounds_cache[key]
	var image := texture.get_image()
	var frame_size := Vector2i(texture.get_width() / columns, texture.get_height() / rows)
	var bounds := Rect2()
	for y in rows:
		for x in columns:
			var used := Rect2(image.get_region(Rect2i(Vector2i(x, y) * frame_size, frame_size)).get_used_rect())
			if used.has_area(): bounds = bounds.merge(used) if bounds.has_area() else used
	if bounds_cache.size() >= 32: bounds_cache.clear()
	bounds_cache[key] = bounds
	return bounds

static func sprite_bounds(world, sprite: Sprite2D) -> Rect2:
	return texture_bounds(world, sprite, sprite.texture, sprite.hframes, sprite.vframes)

static func texture_bounds(world, sprite, texture: Texture2D, columns: int, rows: int) -> Rect2:
	var bounds := frame_bounds(texture, columns, rows)
	var size := texture.get_size() / Vector2(columns, rows)
	if sprite.flip_h: bounds.position.x = size.x - bounds.end.x
	if sprite.flip_v: bounds.position.y = size.y - bounds.end.y
	bounds.position += sprite.offset - (size / 2.0 if sprite.centered else Vector2.ZERO)
	return (world.global_transform.affine_inverse() * sprite.global_transform) * bounds

static func clear(world, area: Rect2, floor_height: float) -> bool:
	var sprites: Array = world.tree_nodes + world.asset_nodes + world.flora_nodes
	for parent in world.flora_nodes:
		if is_instance_valid(parent) and not parent.is_queued_for_deletion(): sprites.append_array(parent.get_children())
	for node in sprites:
		if not is_instance_valid(node) or node.is_queued_for_deletion() or not node is Sprite2D: continue
		if node.has_method("animal_positions") or node.z_index < -16: continue
		if area.intersects(sprite_bounds(world, node).grow(4.0)): return false
	for cell: Vector2i in world.layout.cells:
		var height: float = world.layout.height_at(cell) + (64 if world.layout.cells[cell] == "stairs" else 0)
		if height <= floor_height: continue
		var origin: Vector2 = world.layout.ORIGIN + Vector2(cell) * world.layout.SIZE - Vector2(0, height)
		if area.intersects(Rect2(origin, Vector2(64, height - floor_height + 64))): return false
	return true
