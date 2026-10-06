extends SceneTree

var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.construction.set_process(false)
	scene.layout.stock.tree += scene.layout.trees.size()
	scene.layout.trees.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.stock.chicken += scene.layout.chickens.size()
	scene.layout.chickens.clear()
	scene.layout.stock.sheep += scene.layout.sheep.size()
	scene.layout.sheep.clear()
	for x in range(-2, 5):
		for y in range(-2, 5):
			if not scene.layout.cells.has(Vector2i(x, y)):
				scene.layout.playground_grants.ground = int(scene.layout.playground_grants.get("ground", 0)) + 1
			scene.layout.cells[Vector2i(x, y)] = "meadow"
			scene.layout.elevations[Vector2i(x, y)] = 0
	scene.layout.resources.wood = 6
	scene.layout.house_bundle = 6
	scene.construction.open_placement()
	check(not scene.editing and not scene.ui.panel.visible and scene.pawn.visible, "House placement keeps inventory closed and pawn visible")
	scene.pawn.position = scene.layout.center(Vector2i(-1, 1))
	scene.pawn.walk_to(scene.pawn.position)
	var site := Vector2i(1, 1)
	var previous := Rect2()
	for dx in range(-31, 34):
		var point: Vector2 = scene.layout.center(site) + Vector2(dx, 31.25)
		scene.update_inventory_preview(point)
		check(scene.terrain.valid, "Free house preview stays valid on clear level ground")
		var area: Rect2 = scene.terrain.house_preview_rect()
		if dx > -31:
			check(area.position.is_equal_approx(previous.position + Vector2.RIGHT), "House follows each mouse pixel across grid boundaries at x=%s" % dx)
		previous = area
	for dy in range(-31, 34):
		var mouse: Vector2 = scene.layout.center(site) + Vector2(31.25, dy)
		scene.update_inventory_preview(mouse)
		var area: Rect2 = scene.terrain.house_preview_rect()
		if dy > -31:
			check(area.position.is_equal_approx(previous.position + Vector2.DOWN), "House follows each mouse pixel vertically across grid boundaries")
		previous = area
	var offset := Vector2(31.25, 31.25)
	var missing := Vector2i(2, 3)
	scene.layout.cells.erase(missing)
	scene.layout.elevations.erase(missing)
	scene.layout.stock.meadow += 1
	# Keep conservation valid while testing construction with no inventory grass.
	for index in int(scene.layout.stock.meadow):
		scene.layout.cells[Vector2i(-15 + index, 8)] = "meadow"
	scene.layout.stock.meadow = 0
	var grass_before: int = scene.layout.stock.meadow
	var free_before: int = scene.layout.free_house_grass
	check(scene.layout.house_foundation_cost(site, offset) == 1, "Free position includes its missing support tile in the grass cost")
	var point: Vector2 = scene.layout.center(site) + offset
	var before_hover: Dictionary = scene.layout.snapshot()
	scene.update_inventory_preview(point)
	var preview: Rect2 = scene.terrain.house_preview_rect()
	check(scene.terrain.valid, "Reachable free foundation is valid with no inventory grass")
	var foundation_preview = scene.terrain.terrain_render_layout()
	check(foundation_preview != null and foundation_preview.cells.has(missing), "House hover renders its future foundation through the terrain renderer")
	if foundation_preview != null:
		var expected = scene.Layout.new()
		check(expected.restore(scene.layout.snapshot()), "Copy island for foundation comparison")
		expected.add_house_foundation(site, offset)
		check(foundation_preview.cells == expected.cells and foundation_preview.elevations == expected.elevations, "Preview grass has exactly the committed foundation cells and elevations")
		var live = scene.terrain.layout
		scene.terrain.layout = foundation_preview
		var preview_region: Rect2 = scene.terrain.ground_region(missing, foundation_preview.cells[missing])
		scene.terrain.layout = expected
		check(scene.terrain.ground_region(missing, expected.cells[missing]) == preview_region, "Preview grass uses the committed neighbor joins and shoreline atlas")
		scene.terrain.layout = live
		check(not foundation_preview.houses.has(site), "Foundation terrain does not duplicate the held house artwork")
	check(scene.layout.snapshot() == before_hover, "House hover leaves terrain, inventory and occupants unchanged")
	scene.update_inventory_preview(point, false)
	check(scene.terrain.terrain_render_layout() == null and scene.terrain_preview_change.is_empty(), "Leaving the house preview restores the live terrain")
	scene.update_inventory_preview(point)
	var untouched: Dictionary = scene.layout.snapshot()
	check(scene.layout.can_edit(Vector2i(12, -7), "house", scene.layout.cell_at(scene.pawn.position)), "Disconnected site passes foundation rules before reachability check")
	check(scene.construction.placement_plan(Vector2i(12, -7)).is_empty(), "Disconnected free foundation has no reachable worker route")
	check(not scene.construction.build(Vector2i(12, -7)) and scene.layout.snapshot() == untouched, "Unreachable foundation cannot add grass or spend logs")
	scene.terrain.hover = Vector2i(12, -7)
	scene.terrain.preview_position = scene.layout.center(scene.terrain.hover)
	scene.terrain.valid = true
	scene.update_house_preview()
	check(not scene.terrain.valid and scene.layout.snapshot() == untouched, "Unreachable preview is invalid and adds no grass")
	# A freely positioned foundation may need six tiles. Only four are free.
	for square in scene.layout.house_cells(site, offset):
		if scene.layout.cells.has(square):
			scene.layout.cells.erase(square)
			scene.layout.elevations.erase(square)
			scene.layout.playground_grants.ground -= 1
	var missing_count: int = scene.layout.house_foundation_cost(site, offset)
	check(missing_count > 4, "Cap fixture needs more than four missing grass tiles")
	scene.update_inventory_preview(point)
	check(not scene.terrain.valid and scene.construction.placement_plan(site, offset).is_empty(), "More than four missing tiles is invalid without extra inventory")
	var paid: int = missing_count - 4
	scene.layout.stock.meadow = paid
	scene.layout.playground_grants.ground += paid
	scene.update_inventory_preview(point)
	check(scene.terrain.valid and scene.construction.build(site, offset), "Reachable larger foundation accepts inventory for tiles beyond four")
	check(scene.layout.free_house_grass == free_before + 4 and scene.layout.stock.meadow == 0, "Construction grants only four free tiles and spends the remainder")
	var capped_copy = scene.Layout.new()
	check(capped_copy.restore(scene.layout.snapshot()), "Capped foundation saves with conserved grass totals")
	check(capped_copy.edit(site, "house", capped_copy.cell_at(scene.pawn.position), -1, Vector2.ZERO, Vector2i(999, 999), scene.pawn.position, offset), "Finish capped foundation house for pickup")
	var created: Array = capped_copy.house_free_tiles[site].duplicate()
	var paid_squares: Array[Vector2i] = []
	for square in capped_copy.house_cells(site):
		if square not in created:
			paid_squares.append(square)
	var capped_house: Dictionary = capped_copy.snapshot()
	check(capped_copy.restore(JSON.parse_string(JSON.stringify(capped_house))) and capped_copy.house_free_tiles[site] == created, "Reload preserves exact per-house free tile ownership")
	var no_refund = scene.Layout.new()
	check(no_refund.restore(capped_house), "Restore house for blocked refund check")
	# Occupy every surviving tile; free tiles must never become a fallback.
	for square in no_refund.cells:
		if square not in created:
			no_refund.trees[square] = Vector2.ZERO
	var blocked_pickup: Dictionary = no_refund.snapshot()
	check(not no_refund.can_edit(site, "remove", Vector2i(-1, 1)) and not no_refund.edit(site, "remove", Vector2i(-1, 1)) and no_refund.snapshot() == blocked_pickup, "No surviving grass for logs blocks pickup without changing the house")
	var refund_cell: Vector2i = capped_copy.house_refund_cell(site, Vector2i(-1, 1))
	check(refund_cell not in created and capped_copy.edit(site, "remove", Vector2i(-1, 1)), "Pickup places logs on grass outside the free foundation")
	for square in created:
		check(not capped_copy.cells.has(square) and not capped_copy.elevations.has(square), "Pickup removes each free tile and elevation")
	for square in paid_squares:
		check(capped_copy.cells.has(square), "Pickup retains foundation tiles paid from inventory")
	check(capped_copy.log_piles.get(refund_cell) == 6 and capped_copy.cells.has(refund_cell) and capped_copy.free_house_grass == free_before and not capped_copy.house_free_tiles.has(site), "Pickup returns six logs on surviving grass and clears the free grant")
	check(capped_copy.restore(capped_copy.snapshot()), "Pickup snapshot conserves terrain and logs")
	check(capped_copy.restore(capped_house) and capped_copy.house_free_tiles[site] == created, "Undo pickup restores the house and exact free foundation")
	var malformed: Dictionary = capped_house.duplicate(true)
	malformed.house_free_tiles[0][2].append(malformed.house_free_tiles[0][2][0])
	check(not capped_copy.restore(malformed) and capped_copy.snapshot() == capped_house, "Malformed ownership is rejected without changing the island")
	var legacy: Dictionary = capped_house.duplicate(true)
	legacy.version = 29
	legacy.erase("house_free_tiles")
	check(capped_copy.restore(legacy) and capped_copy.house_free_tiles.is_empty() and capped_copy.free_house_grass == free_before + 4, "Legacy untracked free grass is preserved without guessing ownership")
	check(capped_copy.restore(scene.history.pop_back()) and capped_copy.free_house_grass == free_before and capped_copy.stock.meadow == paid, "Undo restores extra inventory and the four-tile grant")
	check(scene.layout.restore(untouched), "Restore original free-foundation scenario")
	scene.construction.phase = scene.construction.Phase.PLACING
	scene.waypoints.clear()
	scene.pawn.walk_to(scene.pawn.position)
	scene.update_inventory_preview(point)
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = scene.get_global_transform_with_canvas() * point
	scene.handle_world_click(click)
	check(scene.construction.phase == scene.construction.Phase.APPROACHING, "World click starts construction without opening inventory")
	check(scene.layout.cells.has(missing) and scene.layout.stock.meadow == grass_before and scene.layout.free_house_grass == free_before + 1, "Construction adds free support without spending inventory grass")
	check(scene.construction.target_offset.is_equal_approx(offset), "Construction retains the exact mouse position")
	scene.pawn.position = scene.waypoints.back() if not scene.waypoints.is_empty() else scene.pawn.destination
	scene.waypoints.clear()
	scene.pawn.walk_to(scene.pawn.position)
	scene.construction._process(0)
	check(scene.layout.house_offsets.get(site, Vector2.INF).is_equal_approx(offset), "Built house retains the exact mouse position")
	if scene.construction.house_sprite != null:
		var house = scene.construction.house_sprite
		check((house.position + house.offset - house.texture.get_size() / 2).is_equal_approx(preview.position), "Built artwork matches the free preview")
	var copy = scene.Layout.new()
	check(copy.restore(JSON.parse_string(JSON.stringify(scene.layout.snapshot()))) and copy.house_offsets.get(site, Vector2.INF).is_equal_approx(offset), "Save/reload keeps the unsnapped position")
	check(copy.edit(site, "house", Vector2i(-10, -10)) and copy.house_offsets.get(site, Vector2.INF).is_equal_approx(offset), "Rotation keeps the unsnapped position")
	check(copy.restore(scene.history.back()) and copy.free_house_grass == free_before and not copy.cells.has(missing) and copy.house_bundle == 6, "Undo restores the reserved bundle and removes generated foundation grass")

	scene.queue_free()
	await process_frame
	print("Free house placement checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
