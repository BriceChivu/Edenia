extends SceneTree

const OutlineBaker = preload("res://tools/inventory_outline_baker.gd")
var failures := 0
var scene
const TREE := Vector2i(-2, 1)
const HOUSE := Vector2i(3, 1)
const STAIR := Vector2i(0, 3)
const GROUND := Vector2i(5, 3)

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func click(point: Vector2) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = scene.get_global_transform_with_canvas() * point
	scene.handle_world_click(event)

func has_change(cell: Vector2i, tool: String) -> bool:
	for change in scene.inventory_changes():
		if change.cell == cell and change.tool == tool:
			return true
	return false

func capture(name: String) -> void:
	if not "--capture" in OS.get_cmdline_user_args():
		return
	await process_frame
	await RenderingServer.frame_post_draw
	var folder := ProjectSettings.globalize_path("res://../../output")
	DirAccess.make_dir_recursive_absolute(folder)
	check(root.get_texture().get_image().save_png(folder.path_join("inventory-" + name + ".png")) == OK, "Visual capture saved")

func run() -> void:
	root.size = Vector2i(1152, 640)
	scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	check(scene.editing and scene.selected == "", "Fresh inventory opens with no selected tool")
	for button in scene.ui.buttons.values() + scene.ui.action_buttons:
		check(not button.get_meta("selected", false), "No inventory button has a selection underline")
	scene.ui.tool_selected.emit("tree")
	scene.toggle_editing()
	scene.ui.launch.pressed.emit()
	check(scene.selected == "", "Reopening clears the previously selected tool")
	var l = scene.layout
	l.cells.clear()
	l.elevations.clear()
	l.flora.clear()
	l.decorations.clear()
	l.manual_ground_elevation = true
	for y in range(5):
		for x in range(-3, 8):
			l.cells[Vector2i(x, y)] = "meadow"
			l.elevations[Vector2i(x, y)] = 0
	for kind in l.KINDS:
		l.stock[kind] = 0
	l.stock.tree = 1
	l.free_house_grass = l.cells.size() - 21
	l.trees[TREE] = Vector2(0, 12)
	l.tree_types[TREE] = "tree"
	l.houses[HOUSE] = 0
	l.cells[STAIR] = "stairs"
	l.stair_directions[STAIR] = Vector2i.RIGHT
	l.cells[STAIR + Vector2i.RIGHT] = "high_gold"
	l.elevations[STAIR + Vector2i.RIGHT] = 64
	l.flora[STAIR + Vector2i.RIGHT] = 1
	l.cells[GROUND + Vector2i.LEFT] = "high_gold"
	l.elevations[GROUND + Vector2i.LEFT] = 64
	scene.pawn.position = l.center(Vector2i(-3, 4))
	scene.pawn.walk_to(scene.pawn.position)
	scene.game_camera.position = l.center(Vector2i(1, 1))
	scene.game_camera.force_update_scroll()
	scene.rebuild_decorations()
	for sprite in scene.tree_nodes:
		sprite.set_process(false)
	scene.refresh()
	scene.update_inventory_preview(Vector2.ZERO, false)
	for pair in [[TREE, "tree"], [HOUSE, "house"], [STAIR, "stairs"], [GROUND, "ground"]]:
		check(has_change(pair[0], pair[1]), "Inventory outlines available " + pair[1] + " changes")
	var cached: Array = scene.inventory_changes()
	for repeat in 120:
		check(is_same(cached, scene.inventory_changes()), "Unchanged inventory reuses its eligibility scan")
	l.chickens.append(l.center(STAIR) - Vector2(20, 0))
	check(not has_change(STAIR, "stairs"), "An animal entering a stair tile removes its change outline")
	cached = scene.inventory_changes()
	l.chickens[l.chickens.size() - 1] += Vector2(10, 0)
	check(is_same(cached, scene.inventory_changes()), "Animal movement inside its tile reuses terrain eligibility")
	l.chickens.pop_back()
	check(has_change(STAIR, "stairs"), "The outline returns when the animal leaves")
	var pawn_position: Vector2 = scene.pawn.position
	l.houses[HOUSE] = 1
	scene.pawn.position = l.center(HOUSE) + Vector2(-8, 0)
	check(has_change(HOUSE, "house"), "House rotation is offered outside the next facing's contact")
	var pawn_cell: Vector2i = l.cell_at(scene.pawn.position)
	scene.pawn.position += Vector2(0, 25)
	check(l.cell_at(scene.pawn.position) == pawn_cell and not has_change(HOUSE, "house"), "Pawn contact within the same tile invalidates house rotation")
	l.houses[HOUSE] = 0
	scene.pawn.position = pawn_position
	await capture("open")
	var before: Dictionary = l.snapshot().duplicate(true)
	check(l.get_script().new().restore(before), "Fixture is a valid saved layout")
	var tree_point: Vector2 = l.tree_position(TREE) - Vector2(0, 60)
	check(scene.tree_at(tree_point) == TREE, "Fixture pointer hits opaque tree artwork")
	scene.update_inventory_preview(tree_point)
	check(scene.terrain.transform_preview and scene.terrain.tool == "tree" and scene.terrain.tree_preview_variant() == "tree2", "Tree hover previews the next type without selecting its tool")
	check(scene.terrain.tree_preview_position() == l.tree_position(TREE), "Tree swap preview keeps the planted anchor")
	await capture("tree")
	check(l.snapshot() == before, "Hover previews leave layout and stock unchanged")
	click(tree_point)
	check(l.tree_types[TREE] == "tree2" and scene.selected == "" and scene.history.size() == 1, "Click swaps tree with undo and no selected tool")
	scene.undo()
	check(l.tree_types[TREE] == "tree", "Undo restores the tree type")
	var house_point: Vector2 = scene.LevelFiveArt.house_rect(l, HOUSE).get_center()
	for facing in 4:
		l.houses[HOUSE] = facing
		scene.rebuild_decorations()
		scene.update_inventory_preview(house_point)
		check(scene.terrain.transform_preview and scene.terrain.tool == "house" and scene.terrain.house_preview_rect() == scene.LevelFiveArt.house_rect(l, HOUSE), "All house facings preview at their existing anchor")
		if facing == 0:
			await capture("house")
		click(house_point)
		check(l.houses[HOUSE] == (facing + 1) % 4 and scene.selected == "", "House click rotates to the previewed facing")
	l.houses[HOUSE] = 0
	var stair_point: Vector2 = l.center(STAIR) - Vector2(0, 32)
	scene.update_inventory_preview(stair_point)
	check(scene.terrain.transform_preview and scene.terrain.tool == "stairs" and scene.terrain.placement_offset() == Vector2.ZERO, "Stair reversal preview stays anchored")
	var reversed = scene.terrain.terrain_render_layout()
	check(reversed.stair_direction(STAIR + Vector2i.RIGHT) == Vector2i.LEFT and reversed.cells[STAIR + Vector2i.RIGHT] == "stairs" and reversed.height_at(STAIR) == 64 and reversed.height_at(STAIR + Vector2i.RIGHT) == 0 and reversed.height_at(STAIR + Vector2i.LEFT) == 0, "Stair render preview swaps the same two squares")
	check(l.stair_direction(STAIR) == Vector2i.RIGHT and l.height_at(STAIR + Vector2i.RIGHT) == 64, "Stair hover leaves the saved ramp and landing unchanged")
	check(l.flora.has(STAIR + Vector2i.RIGHT) and not l.flora.has(STAIR) and reversed.flora.has(STAIR), "Reversal preview moves foliage without changing live state")
	await capture("stairs")
	click(stair_point)
	check(l.stair_direction(STAIR + Vector2i.RIGHT) == Vector2i.LEFT and l.height_at(STAIR) == 64 and l.height_at(STAIR + Vector2i.LEFT) == 0, "Click reverses within the previewed two squares")
	check(l.cells == reversed.cells and l.elevations == reversed.elevations and l.stair_directions == reversed.stair_directions and l.flora == reversed.flora, "Committed staircase exactly matches its preview")
	scene.undo()
	check(l.cells[STAIR] == "stairs" and l.height_at(STAIR + Vector2i.RIGHT) == 64, "Undo restores the original two-square bundle")
	scene.update_inventory_preview(stair_point)
	click(stair_point)
	var grass_point: Vector2 = l.center(GROUND)
	scene.update_inventory_preview(grass_point)
	check(scene.terrain.tool == "ground" and scene.terrain.ground_preview_height == 64, "Grass hover previews its next legal elevation")
	click(grass_point)
	check(l.height_at(GROUND) == 64 and scene.selected == "", "Direct grass change uses the previewed elevation")
	check(has_change(GROUND, "ground"), "Raised grass that can return to water level remains outlined")
	scene.update_inventory_preview(l.center(GROUND) - Vector2(0, 64))
	check(scene.terrain.ground_preview_height == 0, "Raised grass hover previews water-level grass")
	var lowered = scene.terrain.terrain_render_layout()
	check(lowered != null and lowered.height_at(GROUND) == 0 and l.height_at(GROUND) == 64, "Render preview replaces the old elevation without changing saved terrain")
	for node in scene.get_children():
		if node.has_meta("terrain_shadow") or node.has_meta("terrain_backing"):
			check(node.render_source == scene.terrain, "Cliff shadows and backing share the replacement preview")
	await capture("lower-ground")
	click(l.center(GROUND) - Vector2(0, 64))
	check(l.height_at(GROUND) == 0, "Outlined raised grass can be lowered to water level")
	var stock: Dictionary = l.stock.duplicate()
	var empty := Vector2i(10, 4)
	click(l.center(empty))
	check(not l.cells.has(empty) and l.stock == stock, "No tool selected means empty-space clicks cannot place inventory")
	l.tree_cut_remaining[TREE] = 8.0
	check(not has_change(TREE, "tree"), "Partly cut trees have no swap outline")
	cached = scene.inventory_changes()
	l.tree_cut_remaining[TREE] = 7.0
	check(is_same(cached, scene.inventory_changes()), "An active cutting clock does not repeat the eligibility scan")
	l.tree_cut_remaining.clear()
	l.tree_stumps[TREE] = Time.get_unix_time_from_system() + 300
	check(not has_change(TREE, "tree"), "Stumps have no swap outline")
	l.tree_stumps.clear()
	scene.pawn.position = l.center(STAIR)
	check(not has_change(STAIR, "stairs"), "Occupied stairs cannot advertise a reversal")
	for tool in ["ground", "stairs", "tree", "sheep", "house", "remove"]:
		scene.ui.tool_selected.emit(tool)
		check(scene.terrain.changes.is_empty(), "Selecting " + tool + " immediately hides all change outlines")
		scene.update_inventory_preview(tree_point)
		check(scene.terrain.changes.is_empty() and not scene.terrain.transform_preview, "Selected " + tool + " retains only its normal tool preview")
	scene.ui.tool_selected.emit("ground")
	await capture("selected")
	scene.selected = "remove"
	scene.update_inventory_preview(tree_point)
	check(not scene.terrain.transform_preview and scene.terrain.tool == "remove", "Explicit pickup keeps its pickup preview")
	scene.toggle_editing()
	check(scene.terrain.changes.is_empty() and not scene.terrain.transform_preview and scene.tree_nodes[0].visible, "Closing inventory removes outlines and restores normal artwork")
	await capture("closed")
	# Border generation follows silhouettes and omits the translucent shadow.
	var source := Image.create(12, 12, false, Image.FORMAT_RGBA8)
	source.set_pixel(4, 4, Color.WHITE)
	source.set_pixel(10, 10, Color(0, 0, 0, 0.2))
	var border := OutlineBaker.texture_for(ImageTexture.create_from_image(source), Rect2i(0, 0, 12, 12)).get_image()
	check(border.get_pixel(4, 6).a == 1 and border.get_pixel(6, 6).a == 0, "White outline sits outside opaque artwork")
	check(border.get_pixel(12, 11).a == 0, "Baked shadows do not get white outlines")
	scene.queue_free()
	await process_frame
	print("Inventory changes: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
