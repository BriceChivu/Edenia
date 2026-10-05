extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var layout = level.layout
	var cell := Vector2i(1, 0)
	var offset := Vector2(14, 15)
	var anchor: Vector2 = layout.center(cell) + offset
	level.editing = true
	level.selected = "tree"
	level.terrain.hover = cell
	level.terrain.preview_position = anchor
	var ghost: Rect2 = level.terrain.tree_preview_rect()
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = level.get_global_transform_with_canvas() * anchor
	level.handle_world_click(click)
	check(layout.tree_position(cell).is_equal_approx(anchor), "Actual world click retains its sub-cell position")
	var tree = level.tree_nodes[0]
	check(tree.position.is_equal_approx(anchor), "Tree Y-sort anchor follows the trunk")
	var rendered := Rect2(tree.position + (tree.offset - tree.texture.get_size() / Vector2(16, 2)) * tree.scale, tree.texture.get_size() / Vector2(8, 1) * tree.scale)
	check(rendered.is_equal_approx(ghost), "Placed sprite exactly matches the cursor preview")
	check(not layout.walkable_point(anchor - Vector2(0, 14)), "Moved trunk blocks navigation")
	check(layout.walkable_point(layout.center(cell) - Vector2(10, 0)), "Grass beside the relocated trunk remains walkable")
	check(not level.tree_navigation_path(layout.center(Vector2i.ZERO), layout.center(Vector2i(1, 1))).is_empty(), "Navigation routes around the relocated trunk")
	var saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
	var restored := Layout.new()
	check(restored.restore(saved) and restored.tree_position(cell).is_equal_approx(anchor), "JSON save/load retains exact placement")
	var legacy: Dictionary = saved.duplicate(true)
	legacy.version = 8
	legacy.erase("tree_offsets")
	check(restored.restore(legacy) and restored.tree_position(cell) == restored.center(cell), "Old saves retain their original anchors")
	for bad in [[[1, 0, 21, 0]], [[1, 0, "bad", 0]], [[1, 0, 0, 0], [1, 0, 0, 0]], [], [[0, 0, 0, 0]]]:
		var broken: Dictionary = saved.duplicate(true)
		broken.tree_offsets = bad
		var before: Dictionary = restored.snapshot()
		check(not restored.restore(broken) and restored.snapshot() == before, "Malformed offsets reject atomically")
	var old_high: Dictionary = saved.duplicate(true)
	old_high.version = 11
	old_high.tree_offsets = [[1, 0, 14, -20]]
	check(restored.restore(old_high) and restored.tree_offset(cell) == Vector2(14, 0), "Old high tree placements move safely onto their square")
	level.undo()
	check(not layout.trees.has(cell) and layout.stock.tree == 1, "Undo returns the tree to inventory")
	check(not level.apply_edit(cell, -1, Vector2(21, 0)) and layout.stock.tree == 1, "Edge placement cannot spend inventory")
	level.pawn.position = layout.center(Vector2i.ZERO) + Vector2(39, -14)
	check(not level.apply_edit(cell, -1, Vector2(-16, 0)), "A trunk cannot overlap the pawn in a neighboring square")
	level.pawn.position = layout.center(Vector2i.ZERO)
	check(not level.apply_edit(cell, -1, Vector2(0, -20)) and layout.stock.tree == 1, "Tree cannot be planted above the safe root range")
	check(layout.can_edit(cell, "tree", Layout.HOME, -1, Vector2(0, 28)), "Bottom boundary is included")
	var lower_offset := Vector2(0, 27)
	anchor = layout.center(cell) + lower_offset
	click.position = level.get_global_transform_with_canvas() * anchor
	level.handle_world_click(click)
	check(layout.trees.has(cell) and layout.tree_offset(cell) == lower_offset, "World click can plant a tree near the bottom of its square")
	if layout.trees.has(cell):
		var lower_saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
		check(restored.restore(lower_saved) and restored.tree_offset(cell) == lower_offset, "Lower placement survives save/load")
		level.undo()
	check(not level.apply_edit(cell, -1, Vector2(0, 29)), "Tree cannot be planted past the bottom root margin")
	layout.elevations[cell] = 64
	layout.cells[cell] = "high_gold"
	anchor = layout.center(cell) + offset - Vector2(0, 64)
	level.terrain.preview_position = anchor
	ghost = level.terrain.tree_preview_rect()
	click.position = level.get_global_transform_with_canvas() * anchor
	level.handle_world_click(click)
	check(layout.tree_offset(cell).is_equal_approx(offset), "Raised-surface click converts into ground coordinates")
	tree = level.tree_nodes[0]
	rendered = Rect2(tree.position + (tree.offset - tree.texture.get_size() / Vector2(16, 2)) * tree.scale, tree.texture.get_size() / Vector2(8, 1) * tree.scale)
	check(rendered.is_equal_approx(ghost) and tree.z_index == 1, "Raised tree matches its preview and elevation layer")
	level.selected = "remove"
	check(level.clicked_cell(anchor) == cell and level.apply_edit(cell), "Pickup selects the relocated tree on its visible floor")
	check(not layout.trees.has(cell), "Pickup removes the tree")
	level.undo()
	check(layout.tree_offset(cell).is_equal_approx(offset) and level.tree_nodes[0].position.is_equal_approx(layout.center(cell) + offset), "Undo pickup restores its exact position")
	# Trees coexist with both original foliage and generated land decorations.
	for kind in ["bush", "land_rock"]:
		layout.flora.erase(cell)
		layout.decorations[cell] = {"kind": kind, "variant": 1}
		level.rebuild_decorations()
		check(level.flora_nodes.any(func(node): return node.get_meta("random_decoration", "") == kind and node.visible), "Tree preserves visible %s on its square" % kind)
		var coexist: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
		check(layout.restore(coexist), "Tree and %s coexist through save/load" % kind)
		level.rebuild_decorations()
		check(level.flora_nodes.any(func(node): return node.get_meta("random_decoration", "") == kind and node.visible), "Reload preserves rendered %s" % kind)
		level.selected = "remove"
		check(level.apply_edit(cell) and layout.decorations.has(cell), "Tree pickup preserves %s" % kind)
		level.undo()
		check(layout.trees.has(cell) and layout.decorations.has(cell), "Undo preserves tree and %s" % kind)
	level.selected = "remove"
	check(level.apply_edit(cell), "Pick up tree before testing original foliage")
	cell = Vector2i(1, 1)
	level.selected = "tree"
	check(level.apply_edit(cell, -1, offset), "Tree can share the original tuft square")
	check(level.get_node("World/LeafyTuft").visible, "Original foliage remains visible under a tree")
	layout.flora[cell] = 1
	level.rebuild_decorations()
	check(level.flora_nodes.any(func(node): return not node.has_meta("random_decoration") and node.visible), "Generated foliage remains visible under a tree")
	if "--capture" in OS.get_cmdline_user_args():
		level.editing = false
		level.refresh()
		await process_frame
		await RenderingServer.frame_post_draw
		DirAccess.make_dir_recursive_absolute("res://../../test-results/tiny-swords-preview")
		root.get_texture().get_image().save_png("res://../../test-results/tiny-swords-preview/tree-cursor-placement.png")
	print("Tree cursor placement checks: %s" % ("PASS" if failures == 0 else "FAIL (%d)" % failures))
	quit(0 if failures == 0 else 1)
