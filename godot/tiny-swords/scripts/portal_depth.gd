extends RefCounted

const Visibility = preload("res://scripts/portal_visibility.gd")
var overrides: Array[Dictionary] = []

static func effective_z(item: Node) -> int:
	var result := 0
	var current: Node = item
	while current is CanvasItem:
		result += current.z_index
		if not current.z_as_relative: break
		current = current.get_parent()
	return result

func restore() -> void:
	for entry in overrides:
		var actor = entry.actor.get_ref()
		# Movement may already have restored the actor's natural floor depth.
		if actor != null and actor.z_index == entry.raised:
			actor.z_index = entry.normal
	overrides.clear()

func update(world, portal: Sprite2D, effects: Array) -> void:
	restore()
	if not portal.visible or world.editing or not world.black_hole_enabled: return
	var area := Visibility.sprite_bounds(world, portal).grow(2.0)
	var actors: Array = [world.pawn]
	for node in world.asset_nodes:
		if is_instance_valid(node) and not node.is_queued_for_deletion() and node.has_method("animal_positions"):
			actors.append(node)
	actors.append_array(effects)
	var direction := 1.0 if portal.flip_h else -1.0
	for actor in actors:
		if not is_instance_valid(actor) or actor.is_queued_for_deletion() or not actor.visible: continue
		if (actor.position.x - portal.position.x) * direction < 0.0: continue
		var source = world.pawn.sprite if actor == world.pawn else actor
		var bounds := Rect2()
		if source is AnimatedSprite2D:
			var texture: Texture2D = source.sprite_frames.get_frame_texture(source.animation, source.frame)
			bounds = Visibility.texture_bounds(world, source, texture, 1, 1)
		elif source is Sprite2D:
			# Distorted copies can use the whole frame, beyond its original ink.
			bounds = (world.global_transform.affine_inverse() * source.global_transform) * source.get_rect() if effects.has(actor) else Visibility.sprite_bounds(world, source)
		if not area.intersects(bounds): continue
		var parent_depth := effective_z(actor.get_parent()) if actor.z_as_relative else 0
		var raised := effective_z(portal) + 1 - parent_depth
		overrides.append({"actor": weakref(actor), "normal": actor.z_index, "raised": raised})
		actor.z_index = raised
