extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
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
	l.trees.clear()
	l.tree_types.clear()
	l.chickens.clear()
	l.sheep.clear()
	l.houses.clear()
	l.house_free_tiles.clear()
	l.tree_cut_remaining.clear()
	l.tree_stumps.clear()
	l.cells.clear()
	l.elevations.clear()
	l.stair_directions.clear()
	l.flora.clear()
	l.decorations.clear()
	for x in range(-2, 4):
		for y in range(-2, 4):
			l.cells[Vector2i(x, y)] = "meadow"
	var house := Vector2i(1, -1)
	l.houses[house] = 1
	var cell := Vector2i(1, 0)
	l.cells[cell] = "meadow"
	l.house_offsets[house] = Vector2(-4, 27)
	check(l.tree_house_space_free(l.center(cell), "tree3"), "Current pine roots fit beside house")
	check(not l.tree_house_space_free(l.center(cell), "tree4"), "Next variant roots overlap house")
	check(l.tree_house_space_free(l.center(cell), "tree"), "Another variant fits beside house")
	l.trees[cell] = Vector2.ZERO
	l.tree_types[cell] = "tree3"
	level.editing = true
	level.selected = ""
	level.rebuild_decorations()
	var point := Vector2.INF
	var anchor: Vector2 = l.tree_position(cell) - Vector2(0, l.height_at(cell))
	for y in range(-160, -30):
		if point != Vector2.INF: break
		for x in range(-40, 41):
			var candidate := anchor + Vector2(x, y)
			if level.tree_at(candidate) == cell and not level.LevelFiveArt.house_rect(l, house).has_point(candidate):
				point = candidate
				break
	check(level.tree_at(point) == cell, "Visible pine canopy is detected")
	level.update_inventory_preview(point)
	check(level.terrain.transform_preview and level.terrain.tool == "tree", "Pine beside house offers a swap")
	check(level.terrain.tree_preview_variant() == "tree4", "Preview offers the next type by shifting away from the house")
	var preview_anchor: Vector2 = level.terrain.tree_preview_position()
	check(preview_anchor != anchor, "Blocked next type previews a small shift")
	var before: Dictionary = l.snapshot()
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = level.get_global_transform_with_canvas() * point
	level.handle_world_click(click)
	check(l.tree_types[cell] == "tree4", "Click selects the next type instead of skipping it")
	check(l.stock == before.stock, "Swap does not consume tree inventory")
	check(l.tree_position(cell) == preview_anchor, "Click uses the exact preview anchor")
	check(l.tree_position(cell).distance_to(anchor) <= 16.0, "Shift stays within sixteen game pixels")
	check(l.tree_house_space_free(l.tree_position(cell), "tree4"), "Shifted roots clear the house and terrain")
	check(level.history.back() == before, "Swap records the original appearance for undo")
	var seen := {}
	for step in range(4):
		var plan: Dictionary = l.tree_swap_plan(cell)
		check(not plan.is_empty(), "Each type has a nearby safe position")
		if plan.is_empty(): break
		check(l.edit(cell, "tree", Vector2i(-10, -10)), "Cycle remains available beside the house")
		seen[l.tree_types[cell]] = true
		check(l.tree_house_space_free(l.tree_position(cell), l.tree_types[cell]), "Every cycled type retains safe roots")
	check(seen.size() == 4, "All four tree types can be reached beside the house")
	l.tree_cut_remaining[cell] = 5.0
	check(not l.can_edit(cell, "tree", Vector2i(-10, -10)), "Partly cut trees remain protected")
	l.tree_cut_remaining.clear()
	l.house_offsets[house] = Vector2(-32, 19)
	l.houses[cell] = 1
	l.house_offsets[cell] = Vector2.ZERO
	check(l.tree_swap_variant(cell).is_empty(), "No replacement offered when every other root footprint overlaps house")
	check(not l.can_edit(cell, "tree", Vector2i(-10, -10)), "Fully blocked cycle remains unavailable")
	# Open ground preserves the exact fractional anchor; no unnecessary movement.
	l.houses.clear()
	l.trees[cell] = Vector2(0.5, 12.5)
	var fixed: Vector2 = l.tree_position(cell)
	for step in range(4):
		check(l.edit(cell, "tree", Vector2i(-10, -10)), "Open ground cycles freely")
		check(l.tree_position(cell) == fixed, "Already fitting types never shift")
	# At a shoreline, the larger pine roots need a downward adjustment.
	l.cells.clear()
	l.cells[cell] = "meadow"
	l.trees[cell] = Vector2(0, 0)
	l.tree_types[cell] = "tree2"
	var shore_plan: Dictionary = l.tree_swap_plan(cell)
	check(shore_plan.get("kind") == "tree3", "Larger roots near a shoreline are nudged instead of skipped")
	check(l.edit(cell, "tree", Vector2i(-10, -10)), "Shoreline nudge commits")
	check(l.terrain_supports_contact(l.tree_footprint(l.tree_position(cell), "tree3"), 0), "Nudge keeps the complete roots on supported terrain")
	print("Tree swap beside house: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
