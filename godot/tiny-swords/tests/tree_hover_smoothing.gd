extends SceneTree

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
	level.editing = true
	level.selected = "tree"
	var cell := Vector2i(1, 0)
	var center: Vector2 = level.layout.center(cell)
	# Small movements across the old anchor margins must not switch cursors.
	for pair in [[Vector2(0, 0.5), Vector2(0, -0.5)], [Vector2(14, 10), Vector2(16, 10)], [Vector2(0, 27.5), Vector2(0, 28.5)]]:
		var first: Vector2 = pair[0]
		var second: Vector2 = pair[1]
		check(level.can_place_tree(cell, level.tree_offset_at(cell, center + first)) == level.can_place_tree(cell, level.tree_offset_at(cell, center + second)), "Tiny movements on clear grass keep a stable tree preview: %s" % str(pair))
	for height in [0, 64]:
		level.layout.elevations[cell] = height
		for x in range(-31, 32, 4):
			for y in range(-31, 32, 4):
				var point: Vector2 = center + Vector2(x, y - height)
				level.terrain.hover = level.clicked_cell(point)
				level.update_tree_preview(point)
				check(level.terrain.hover == cell and level.terrain.valid, "Clear grass remains plantable across its visible surface")
				var offset: Vector2 = level.tree_offset_at(cell, point)
				check(level.layout.valid_tree_offset(offset), "Snapped roots stay inside the safe margins")
				check(level.terrain.preview_position.is_equal_approx(point), "Tree preview follows the pointer even outside planting margins")
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = true
		var edge_point: Vector2 = center + Vector2(30, -20 - height)
		level.terrain.hover = cell
		level.update_tree_preview(edge_point)
		var planted: Vector2 = center + level.tree_offset_at(cell, edge_point) - Vector2(0, height)
		click.position = level.get_global_transform_with_canvas() * edge_point
		level.handle_world_click(click)
		check((level.layout.tree_position(cell) - Vector2(0, height)).is_equal_approx(planted), "Edge click keeps planted roots inside grass")
		level.undo()
	# Clamping must not make water, the home square or pawn overlap plantable.
	for target in [Vector2i(-10, -10), level.layout.HOME]:
		level.terrain.hover = target
		level.update_tree_preview(level.layout.center(target))
		check(not level.terrain.valid, "Unavailable squares remain blocked")
	level.pawn.position = center + level.tree_offset_at(cell, center + Vector2(-31, -level.layout.height_at(cell)))
	check(not level.can_place_tree(cell, level.tree_offset_at(cell, center + Vector2(-31, -level.layout.height_at(cell)))), "Snapped roots still cannot overlap the pawn")
	print("Tree hover smoothing checks: %s" % ("PASS" if failures == 0 else "FAIL (%d)" % failures))
	quit(0 if failures == 0 else 1)
