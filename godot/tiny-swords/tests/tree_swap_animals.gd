extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_five.tscn").instantiate()
	level.camera_save_enabled = false
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	var l = level.layout
	var cell := Vector2i(1, 0)
	l.trees.clear()
	l.tree_types.clear()
	l.houses.clear()
	l.house_free_tiles.clear()
	l.cells[cell] = "meadow"
	l.elevations[cell] = 0
	l.stock.tree = 0
	level.editing = true
	for animal in ["sheep", "chicken"]:
		for selected in ["", "tree"]:
			l.sheep.clear()
			l.chickens.clear()
			var animals: Array[Vector2] = l.sheep if animal == "sheep" else l.chickens
			animals.append(l.center(cell) + Vector2(20, 0))
			l.trees[cell] = Vector2.ZERO
			l.tree_types[cell] = "tree2"
			level.selected = selected
			level.rebuild_decorations()
			var point := Vector2.INF
			for y in range(-80, -20):
				if point != Vector2.INF: break
				for x in range(-20, 21):
					var candidate: Vector2 = l.tree_position(cell) + Vector2(x, y)
					if level.tree_at(candidate) == cell:
						point = candidate
						break
			check(point != Vector2.INF, "Fixture has a visible tree canopy")
			level.update_inventory_preview(point)
			check(level.terrain.tool == "tree" and level.terrain.hover == cell and level.terrain.valid, "%s allows tree swap hover with tool '%s'" % [animal, selected])
			check(level.terrain.tree_preview_variant() == "tree3", "Preview offers the next tree type")
			var before: Dictionary = l.snapshot()
			var click := InputEventMouseButton.new()
			click.button_index = MOUSE_BUTTON_LEFT
			click.pressed = true
			click.position = level.get_global_transform_with_canvas() * point
			level.handle_world_click(click)
			check(l.tree_types[cell] == "tree3", "%s allows clicking the next tree type" % animal)
			check(l.stock == before.stock and l.trees[cell] == Vector2.ZERO, "Swap preserves stock and planted anchor")
			check(l.sheep.size() + l.chickens.size() == 1 and animals[0] == l.center(cell) + Vector2(20, 0), "Swap preserves the animal")
			check(not level.history.is_empty() and level.history.back() == before, "Swap records undo")
			l.tree_cut_remaining[cell] = 5.0
			check(not l.can_edit(cell, "tree", l.HOME), "Animal does not bypass partly cut tree protection")
			l.tree_cut_remaining.clear()
			l.tree_stumps[cell] = 100.0
			check(not l.can_edit(cell, "tree", l.HOME), "Animal does not bypass stump protection")
			l.tree_stumps.clear()
			l.trees.erase(cell)
			l.tree_types.erase(cell)
			l.stock.tree = 1
			check(not l.can_edit(cell, "tree", l.HOME), "Animal still blocks planting a new tree")
			l.stock.tree = 0
	print("Tree swap with animals: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
