extends SceneTree

var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var level = load("res://previews/level_four.tscn").instantiate()
	level.camera_save_enabled = false
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	level.editing = true
	level.selected = ""
	var cell := Vector2i(1, 0)
	level.layout.cells[cell] = "meadow"
	level.layout.trees.clear()
	level.layout.tree_types.clear()
	level.layout.trees[cell] = Vector2.ZERO
	level.layout.tree_types[cell] = "tree2"
	for height in [0, 64]:
		level.layout.tree_types[cell] = "tree2"
		level.layout.elevations[cell] = height
		level.rebuild_decorations()
		var sprite: Sprite2D
		for node in level.tree_nodes:
			node.set_process(false)
			if node.get_meta("cell") == cell:
				sprite = node
		var anchor: Vector2 = level.layout.tree_position(cell) - Vector2(0, height)
		var points: Array[Vector2] = []
		for y in range(-48, -24):
			for x in range(-17, 17):
				var point := anchor + Vector2(x, y)
				if sprite.is_visual_pixel_opaque(sprite.to_local(point)) and level.layout.walkable_point(point + Vector2(0, height)):
					points.append(point)
		check(not points.is_empty(), "Fixture includes visible pine pixels above walkable ground")
		for point in points:
			level.update_inventory_preview(point)
			check(level.terrain.transform_preview and level.terrain.tool == "tree" and level.terrain.hover == cell, "Lower pine artwork offers its variant swap at height %d" % height)
		if not points.is_empty():
			var click := InputEventMouseButton.new()
			click.button_index = MOUSE_BUTTON_LEFT
			click.pressed = true
			click.position = level.get_global_transform_with_canvas() * points[0]
			level.handle_world_click(click)
			check(level.layout.tree_types[cell] == "tree3", "Click on lower pine commits the previewed variant")
			level.editing = false
			check(level.tree_at(points[0]) == level.Harvesting.NO_TREE, "Walking behind lower canopy remains available outside editing")
			level.editing = true
	print("Tree swap hover: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
