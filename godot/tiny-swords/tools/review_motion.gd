extends RefCounted

# Moving a prop changes its contact anchor and presentation, not the island's
# terrain or unrelated sprites/materials. Keep native nodes and animation poses.
func move(review, item: Dictionary, previous: Vector2) -> void:
	var point: Vector2 = review.item_point(item)
	var slot: Vector2i = review.layout.register_object(int(item.id),item.kind,point)
	var node = review.item_nodes.get(int(item.id))
	if not is_instance_valid(node): return
	var height: float = review.ground_height(point)
	var old_height: float = review.ground_height(previous)
	var delta := point-previous
	var floor_shift := old_height-height
	match item.kind:
		'pawn':
			node.position = point
			node.walk_to(point)
			node.sprite.position.y += floor_shift
			item.sprite_y = node.sprite.position.y
			node.z_index = int(ceil(height/64.0))
		'sheep','chicken':
			var positions: Array = review.layout.chickens if item.kind=='chicken' else review.layout.sheep
			positions[node.sheep_index] = point
			node.position = point
			node.destination = point
			node.fleeing = false
			node.escape_route.clear()
			node.tile_destinations.clear()
			node.previous_pawn_position = review.pawn.position
			node.offset = node.art_offset-Vector2(0,height/node.art_scale)
			node.z_index = int(ceil(height/64.0))
			var shadow = node.get_node_or_null('GroundShadow')
			if shadow != null: shadow.position.y = -height/node.art_scale
		'tree':
			node.position = point
			node.offset.y += floor_shift/node.scale.y
			node.z_index = int(height/64.0)
			var receivers: Dictionary = review.TreeArt.shadow_ground(review.layout,slot)
			# The authored shadows fit in this 5 x 5 receiver neighborhood.
			# Interior grass needs no pixel clipping or generated texture upload.
			if receivers.size()==25:
				node.texture = review.TreeArt.STUMPS[node.kind] if item.get('stump',false) else review.TreeArt.TEXTURES[node.kind]
			else:
				node.texture = review.TreeArt.texture_at(review.layout.tree_offset(slot),node.kind,item.get('stump',false),receivers)
		'house':
			node.position = Vector2(point.x+32,review.LevelFiveArt.house_depth_y(review.layout,slot,int(item.variant)-1))
			node.offset.y = point.y-node.position.y-height
			node.z_index = int(height/64.0)
		'logs':
			node.position += delta
			node.z_index = int(height/64.0)
			for log_sprite in node.get_children(): log_sprite.position.y += floor_shift
			move_log_shadow(review,slot,delta,floor_shift,height)
		'portal': review.portal_event.update_portal()
		_:
			node.position += delta
			if item.kind not in ['water_rock','ducks']:
				node.offset.y += floor_shift/node.scale.y
				node.z_index = int(height/64.0)
			if item.kind=='land_rock': node.set_meta('rock_face',review.layout.rock_footprint(slot))
	# Log depth depends on the pawn's horizontal contact with the whole pile.
	for pile in review.flora_nodes:
		if is_instance_valid(pile) and pile.has_method('update_depth'): pile.update_depth()
	review.get_node('World')._process(0)
	review.portal_event.previous.clear()
	review.portal_event.last_art_revision = review.inventory_art_revision
	review.portal_event._process(0)

func move_log_shadow(review, slot: Vector2i, delta: Vector2, floor_shift: float, height: float) -> void:
	for shadow in review.flora_nodes:
		if not is_instance_valid(shadow) or shadow.get_meta('log_shadow',Vector2i.ZERO)!=slot: continue
		shadow.position += delta
		shadow.z_index = int(height/64.0)
		var polygon: Polygon2D = shadow.get_child(0)
		var outline := polygon.polygon
		for i in outline.size(): outline[i].y += floor_shift
		polygon.polygon = outline
		var material: ShaderMaterial = polygon.material
		var centers: PackedVector2Array = material.get_shader_parameter('log_centers')
		for i in int(material.get_shader_parameter('log_count')): centers[i].y += floor_shift
		material.set_shader_parameter('log_centers',centers)
		var region: Rect2 = review.terrain.ground_region(slot,'meadow' if height==0 else review.layout.kind_at_height(height))
		material.set_shader_parameter('grass_atlas',review.terrain.floor_texture(height))
		material.set_shader_parameter('grass_region',Vector4(region.position.x,region.position.y,64,64))
		var local_from_world: Transform2D = review.global_transform.affine_inverse()
		material.set_shader_parameter('ground_origin',local_from_world.origin-(review.layout.center(slot)-Vector2(32,32+height)))
