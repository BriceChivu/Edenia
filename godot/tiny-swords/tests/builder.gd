extends SceneTree

var failures := 0
func _initialize() -> void:
	run.call_deferred()
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func run() -> void:
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.preview_save_enabled = false
	root.add_child(level)
	await process_frame
	var layout = level.layout
	check(level.get_node("WaterRocks").z_index < level.terrain.z_index, "New terrain covers water rocks")
	check(layout.COLORS.stairs == layout.COLORS.high_gold and layout.COLORS.meadow != layout.COLORS.high_gold, "Stairs match the upper floor and floor colors differ")
	check(not layout.can_edit(Vector2i(2, 0), "meadow", Vector2i.ZERO), "Locked before level two")
	layout.cells[Vector2i(4, 1)] = "meadow"
	level.rebuild_decorations()
	check(not level.get_node("WaterRocks/EastRock").visible, "Building over a water rock removes the whole decoration")
	layout.cells.erase(Vector2i(4, 1))
	level.rebuild_decorations()
	check(level.get_node("WaterRocks/EastRock").visible, "Picking the covering ground back up restores the water decoration")
	level.unlock_level_two()
	check(level.ui.celebration != null, "Level two ribbon shown")
	layout.unlock()
	layout.unlock(3)
	check(layout.stock.meadow == 2 and layout.stock.stairs == 2 and layout.stock.tree == 1, "Reward granted once")
	level.ui.celebration.queue_free()
	level.ui.celebration = null
	level.toggle_editing()
	check(level.editing, "Build mode entered")
	level.ui.tool_selected.emit("remove")
	check(level.ui.collapsed and not level.ui.panel.visible, "Pick up hides inventory so covered cells are accessible")
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(610, 274)
	level._input(motion)
	level._process(0)
	var first_pointer: Vector2 = level.pointer.position
	motion = InputEventMouseMotion.new()
	motion.position = Vector2(621, 281)
	level._input(motion)
	level._process(0)
	check(level.pointer.position - first_pointer == Vector2(11, 7), "Pointer follows small movements within one cell without snapping")
	check(level.UI_CURSOR.get_size() == level.CURSOR.get_size() and level.INVALID_CURSOR.get_size() == level.CURSOR.get_size(), "Cursors one, two and three retain equal original dimensions")
	check(not level.apply_edit(Vector2i.ZERO), "Home protected")
	check(level.apply_edit(Vector2i(3, 2)), "Isolated island collected")
	check(layout.stock.meadow == 3, "Collected grass credited")
	level.selected = "meadow"
	check(level.apply_edit(Vector2i(2, 0)), "Grass extends main island")
	level.selected = "high_gold"
	check(level.apply_edit(Vector2i(4, 0)), "Raised gold terrain placed")
	check(layout.height_at(Vector2i(4, 0)) == 64, "Raised terrain has height")
	check(layout.path(Vector2i.ZERO, Vector2i(4, 0)).is_empty(), "Raised land cannot be climbed without stairs")
	check(not layout.can_edit(Vector2i(6, 0), "stairs", Vector2i.ZERO), "Stairs require low and high land")
	level.selected = "stairs"
	check(level.apply_edit(Vector2i(3, 0)), "Stairs connect flat and raised land")
	check(not layout.path(Vector2i.ZERO, Vector2i(4, 0)).is_empty(), "Raised land is reachable via stairs")
	check(level.terrain.joined(Vector2i(4, 0), Vector2i.LEFT), "Upper terrain opens its edge at the stair landing")
	check(level.terrain.joined(Vector2i(2, 0), Vector2i.RIGHT), "Flat terrain opens its edge at the stair foot")
	check(level.clicked_cell(layout.center(Vector2i(3, 0)) - Vector2(0, 32)) == Vector2i(3, 0), "Stair ramp can be selected at its visible height")
	check(not layout.can_cross(Vector2i(2, 0), Vector2i(4, 0)), "Cannot jump across cells")
	check(not layout.can_edit(Vector2i(2, 0), "remove", Vector2i.ZERO), "Remove stairs before their supporting land")
	level.walk_on_land(Vector2i(4, 0), layout.center(Vector2i(4, 0)))
	check(level.waypoints.is_empty(), "Straight clear land does not force tile-center stops")
	level.waypoints.clear()
	level.pawn.walk_to(level.pawn.position)
	var boundary: Vector2 = layout.ORIGIN + Vector2(4 * 64, 32)
	check(abs(level.ground_height(boundary - Vector2(0.1, 0)) - level.ground_height(boundary + Vector2(0.1, 0))) < 1, "Height changes smoothly across tile borders")
	level.selected = "tree"
	check(level.apply_edit(Vector2i(2, 0)), "Tree placed")
	check(not layout.path(Vector2i.ZERO, Vector2i(4, 0)).is_empty(), "Tree leaves room to pass through its tile")
	check(not layout.walkable_point(layout.center(Vector2i(2, 0))), "Trunk remains an obstacle")
	var in_front: Vector2 = layout.center(Vector2i(2, 0)) + Vector2(0, 20)
	level.walk_on_land(Vector2i(2, 0), in_front)
	await create_timer(3.0).timeout
	check(level.pawn.position.distance_to(in_front) < 1, "Pawn can walk into the free strip in front of the tree")
	check(level.pawn.position.y > level.tree_nodes[0].position.y, "Pawn in front draws above the tree through Y sorting")
	level.waypoints.clear()
	level.pawn.position = layout.center(Vector2i.ZERO)
	level.pawn.walk_to(level.pawn.position)
	level.undo()
	check(layout.stock.tree == 1 and not layout.trees.has(Vector2i(2, 0)), "Undo restores tree inventory and route")
	var restored = load("res://scripts/terrain_layout.gd").new()
	check(restored.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))), "Layout survives JSON save roundtrip")
	restored.unlock()
	check(restored.stock.high_gold == layout.stock.high_gold, "Reload cannot grant a second reward")
	# Old saves gain exactly one flat piece and two stairs, retaining all tiles.
	var old = load("res://scripts/terrain_layout.gd").new()
	old.unlock()
	old.unlock(3)
	old.stock.meadow -= 1
	old.stock.stairs = 0
	var legacy: Dictionary = old.snapshot()
	legacy.version = 1
	legacy.unlocked = true
	legacy.erase("level")
	legacy.stock.erase("stairs")
	for tile in legacy.tiles:
		tile.resize(4)
	check(restored.restore(legacy), "Old preview saves migrate")
	check(restored.stock.meadow == 2 and restored.stock.stairs == 2, "Migration grants only the new pieces")
	check(restored.restore(restored.snapshot()) and restored.stock.stairs == 2, "Migration cannot grant twice")
	var automatic = load("res://scripts/terrain_layout.gd").new()
	automatic.unlock()
	automatic.unlock(3)
	check(automatic.ground_count() == 6, "One pooled inventory contains six ground tiles")
	check(automatic.edit(Vector2i(2, 0), "stairs", Vector2i.ZERO), "Stair and upper landing are created together")
	check(automatic.ground_count() == 6 and automatic.stock.stairs == 1, "Stair bundle includes its landing without spending ground")
	check(not automatic.edit(Vector2i(3, 0), "ground", Vector2i.ZERO), "Automatic landing is already occupied")
	check(automatic.cells[Vector2i(3, 0)] == "high_gold", "Ground at the high end is automatically elevated and gold")
	check(automatic.edit(Vector2i(4, 0), "ground", Vector2i.ZERO) and automatic.height_at(Vector2i(4, 0)) == 64, "An upper floor extends at the same height")
	check(automatic.edit(Vector2i(-1, 0), "ground", Vector2i.ZERO) and automatic.height_at(Vector2i(-1, 0)) == 0, "Base ground extends at water level")
	check(automatic.ground_count() == 4, "Any ground height uses the same inventory")
	check(automatic.restore(JSON.parse_string(JSON.stringify(automatic.snapshot()))), "Automatic stair direction survives a save")
	var empty_stock = load("res://scripts/terrain_layout.gd").new()
	empty_stock.unlock()
	empty_stock.unlock(3)
	for kind in empty_stock.KINDS:
		if kind != "stairs":
			empty_stock.stock[kind] = 0
	check(empty_stock.edit(Vector2i(2, 0), "stairs", Vector2i.ZERO), "Stair bundle works with no ground in inventory")
	check(empty_stock.height_at(Vector2i(3, 0)) == 64, "Bundled upper landing is created")
	check(empty_stock.edit(Vector2i(2, 0), "remove", Vector2i.ZERO), "Picking up a stair returns its bundle")
	check(not empty_stock.cells.has(Vector2i(3, 0)) and empty_stock.stock.stairs == 2, "Picking up the bundle removes its landing without duplication")
	var plants = load("res://scripts/terrain_layout.gd").new()
	plants.unlock()
	plants.unlock(3)
	check(plants.edit(Vector2i.ZERO, "remove", Vector2i(1, 0)), "Bush-covered original tile can be collected once pawn moves away")
	check(not plants.flora.has(Vector2i.ZERO) and plants.spawn_cell() != Vector2i.ZERO, "Bush disappears and respawn moves to existing land")
	check(plants.restore(JSON.parse_string(JSON.stringify(plants.snapshot()))), "Island without original home survives reload")
	plants.flora_rng.seed = 17
	var planted := 0
	for i in range(64):
		plants.edit(Vector2i(-2, -1), "ground", Vector2i(1, 0))
		if plants.flora.has(Vector2i(-2, -1)):
			planted += 1
		var saved_flora: Dictionary = plants.flora.duplicate()
		check(plants.restore(plants.snapshot()) and plants.flora == saved_flora, "Plants persist without rerolling")
		plants.edit(Vector2i(-2, -1), "remove", Vector2i(1, 0))
	check(planted > 0 and planted < 20, "Plants appear rarely rather than on every new tile")
	check(level.splash.get_parent() == level.pawn.get_parent() and level.splash.z_index == 0, "Splash shares tree and pawn Y sorting")
	level.toggle_editing()
	level.walk_on_land(Vector2i(4, 0), layout.center(Vector2i(4, 0)))
	await create_timer(5.5).timeout
	check(level.pawn.position.distance_to(layout.center(Vector2i(4, 0))) < 1, "Pawn walks onto expanded raised land")
	check(level.pawn.sprite.position.y < -60, "Pawn stands on raised ground")
	level.fall_into_water(layout.center(Vector2i(-3, 0)))
	await create_timer(0.1).timeout
	check(level.water_phase == level.WaterPhase.APPROACHING, "Distant water click starts a cancellable approach")
	var redirect := InputEventMouseButton.new()
	redirect.button_index = MOUSE_BUTTON_LEFT
	redirect.pressed = true
	redirect.position = layout.center(Vector2i(4, 0)) - Vector2(0, 64)
	level._unhandled_input(redirect)
	await create_timer(0.5).timeout
	check(level.water_phase == level.WaterPhase.READY and level.pawn.position.distance_to(layout.center(Vector2i(4, 0))) < 1, "Latest click cancels water approach and redirects pawn")
	level.fall_into_water(layout.center(Vector2i(5, 0)))
	await level.splash_started
	check(level.pawn.sprite.rotation == 0, "Upright splash still works on edited land")
	await level.respawned
	check(level.pawn.position == layout.center(Vector2i.ZERO), "Respawn uses protected home")
	print("Builder checks: ", "PASS" if failures == 0 else "FAIL (%s)" % failures)
	quit(0 if failures == 0 else 1)
