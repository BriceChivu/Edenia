extends SceneTree

var failures := 0
var scene

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		push_error(message)
		failures += 1

# Compare the clipped pixels actually retained by the rendered shadow layers.
func shadow_pixels() -> Dictionary:
	var result := {}
	for node in scene.get_children():
		if node.has_meta("terrain_shadow"):
			var layer := {}
			for index in node.shadow_textures.size():
				layer[node.shadow_positions[index]] = node.shadow_textures[index].get_image().get_data()
			result[node.shadow_height] = layer
	return result

func shadow_ids() -> Array:
	var result := []
	for node in scene.get_children():
		if node.has_meta("terrain_shadow"):
			for texture in node.shadow_textures:
				result.append(texture.get_instance_id())
	return result

func run() -> void:
	scene = load("res://previews/level_three.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.editing = true
	scene.selected = ""
	var l = scene.layout
	var source := Vector2i(1, -1)
	var target := Vector2i(1, 0)
	var front := Vector2i(1, 1)
	l.cells = {Vector2i.ZERO: "high_meadow", Vector2i.DOWN: "high_gold", front: "high_gold", source: "meadow"}
	l.elevations = {Vector2i.ZERO: 128, Vector2i.DOWN: 64, front: 64, source: 0}
	l.trees.clear()
	l.flora = {source: 2}
	l.decorations.clear()
	l.manual_ground_elevation = true
	l.stock.meadow += 1
	scene.pawn.position = l.center(Vector2i(8, 8))
	scene.rebuild_decorations()
	var before: Dictionary = l.snapshot().duplicate(true)
	await process_frame
	await RenderingServer.frame_post_draw
	var original_shadows := shadow_pixels()
	check(not shadow_ids().is_empty(), "Shadow fixture renders clipped textures")
	var point: Vector2 = l.center(source)
	scene.update_inventory_preview(point)
	var proposed = scene.terrain.terrain_render_layout()
	check(proposed != null and proposed.height_at(target) == 64, "Visible terrace extension has a proposed layout")
	check(proposed.flora.get(target) == 2 and not proposed.flora.has(source), "Terrace preview moves foliage with its grass")
	var target_surface: Node
	for node in scene.get_node("World").get_children():
		if node.has_meta("terrain_occluder") and node.piece == target:
			target_surface = node
	check(target_surface != null and target_surface.layout == proposed, "Replacement is rendered by a normal terrain surface at the proposed elevation")
	check(target_surface != null and target_surface.z_index == 0, "Replacement uses the committed terrain depth")
	var plant: Sprite2D = scene.flora_nodes[0]
	check(plant.position == l.center(target) + Vector2(0, 12) and is_equal_approx(plant.offset.y, -15 - 64 / 0.75), "Preview foliage uses its committed position")
	await process_frame
	await RenderingServer.frame_post_draw
	var preview_shadows := shadow_pixels()
	var preview_ids := shadow_ids()
	check(preview_shadows != original_shadows, "Terrace preview replaces the original shadow footprint")
	scene.update_inventory_preview(point)
	check(is_same(proposed, scene.terrain.terrain_render_layout()), "Stationary hover retains the proposed layout")
	await process_frame
	await RenderingServer.frame_post_draw
	check(shadow_ids() == preview_ids and shadow_pixels() == preview_shadows, "Stationary preview and ordinary redraw reuse the same clipped textures")
	check(is_instance_valid(target_surface) and not target_surface.is_queued_for_deletion(), "Repeated hover retains terrain nodes")
	check(l.snapshot() == before, "Hover leaves saved terrain, inventory and decorations unchanged")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = scene.get_global_transform_with_canvas() * point
	scene.handle_world_click(click)
	check(l.cells == proposed.cells and l.elevations == proposed.elevations and l.flora == proposed.flora and l.stock == proposed.stock, "Click commits the same terrain, foliage and inventory as the preview")
	scene.update_inventory_preview(point, false)
	await process_frame
	await RenderingServer.frame_post_draw
	var committed: Dictionary = l.snapshot().duplicate(true)
	check(shadow_pixels() == preview_shadows, "Committed terrain renders the exact preview shadows")
	check(scene.terrain_preview_change.is_empty(), "Leaving the island clears the terrain transformation")
	scene.undo()
	check(l.snapshot() == before, "Undo restores the original terrace footprint and foliage")
	await process_frame
	await RenderingServer.frame_post_draw
	check(shadow_pixels() == original_shadows, "Undo restores the original shadow pixels")
	check(scene.restore_saved_layout(committed), "Edited snapshot restores successfully")
	await process_frame
	await RenderingServer.frame_post_draw
	check(shadow_pixels() == preview_shadows, "Restore replaces shadows with the saved edited footprint")
	check(scene.restore_saved_layout(before), "Original snapshot restores successfully")
	# Moving directly from a terrain preview onto a tree must hide the restored
	# sprite, so the next variant is the only tree drawn at that anchor.
	var tree := Vector2i(4, 1)
	l.cells[tree] = "meadow"
	l.trees[tree] = Vector2(0, 12)
	l.tree_types[tree] = "tree"
	scene.rebuild_decorations()
	scene.update_inventory_preview(point)
	var tree_point: Vector2 = l.tree_position(tree) - Vector2(0, 60)
	scene.update_inventory_preview(tree_point)
	check(scene.terrain.transform_preview and scene.terrain.tool == "tree", "Moving off terrain selects the tree variant preview")
	for sprite in scene.tree_nodes:
		if sprite.get_meta("cell") == tree:
			check(not sprite.visible, "The restored current tree is hidden behind its replacement preview")
	scene.update_inventory_preview(point, false)
	for sprite in scene.tree_nodes:
		check(sprite.visible, "Cancelling the preview restores tree artwork")
	scene.queue_free()
	await process_frame
	print("Terrain transform preview: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
