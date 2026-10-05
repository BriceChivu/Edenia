extends "res://scripts/level_one.gd"

const LevelFiveArt = preload("res://scripts/level_five_art.gd")
const Layout = preload("res://scripts/terrain_layout.gd")
const TreeArt = preload("res://scripts/tree_art.gd")
const LOG_TEXTURE = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Wood Resource/Wood Resource.png")
const LOG_SHADOW_SHADER = preload("res://shaders/log_shadow.gdshader")
const TerrainView = preload("res://scripts/terrain_view.gd")
const BuilderUI = preload("res://scripts/builder_ui.gd")
const HOUSE_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Icons/Icon_01.png")
const UI_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_01.png")
const INVALID_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_03.png")
const BUILD_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_04.png")
const Construction = preload("res://scripts/house_construction.gd")
const Harvesting = preload("res://scripts/tree_harvesting.gd")
const AXE_CURSOR := preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Tools/Tool_02.png")
const SAVE_KEY := "edenia_tiny_swords_builder_preview_v1"
const DEFAULT_ZOOM := 0.8
const CAMERA_SAVE_KEY := "edenia_tiny_swords_camera_v1"

var game_camera: Camera2D
var game_camera_center := Vector2(576, 248)
var camera_save_enabled := true
var camera_save_path := "user://camera_view.json"

var world_pointer_down: InputEventMouseButton
var world_dragging := false
var world_drag_origin := Vector2.ZERO
var world_drag_threshold := 6.0

var layout = Layout.new()
var terrain
var ui
var editing := false
var selected := ""
var house_log_source := Vector2i(999, 999)
var preserve_history_on_reopen := false
var history: Array[Dictionary] = []
var walking_bridges: Array[Vector2i] = []
var movement_generation := 0
var waypoints: Array[Vector2] = []
var harvesting
var construction
var log_pickup := Vector2i(999, 999)
var log_delivery := Vector2i(999, 999)
var asset_nodes: Array[Node] = []
var tree_nodes: Array[Node] = []
var flora_nodes: Array[Node] = []
var preview_save_enabled := true
var build_cursor: Texture2D
var build_cursor_size := Vector2i.ZERO
var cursor_mode := ""
var pointer: Sprite2D
var pointer_inside := false
var pointer_focused := true
var pointer_position := Vector2.ZERO

func _ready() -> void:
	super._ready()
	for name in ["Islands", "IslandShadows", "ShoreFoam"]:
		get_node(name).hide()
	# Player-built land and stairs cover water decorations naturally.
	$WaterRocks.z_index = -17
	if preview_save_enabled:
		load_layout()
	terrain = TerrainView.new()
	terrain.layout = layout
	terrain.z_index = -16
	add_child(terrain)
	move_child(terrain, $World.get_index())
	var build_overlay := TerrainView.new()
	build_overlay.layout = layout
	build_overlay.editor_source = terrain
	build_overlay.z_index = 101
	add_child(build_overlay)
	ui = BuilderUI.new()
	ui.layout = layout
	add_child(ui)
	var pointer_layer := CanvasLayer.new()
	pointer_layer.layer = 100
	add_child(pointer_layer)
	pointer = Sprite2D.new()
	pointer.centered = false
	pointer.hide()
	pointer_layer.add_child(pointer)
	Input.set_mouse_mode(Input.MOUSE_MODE_HIDDEN)
	get_window().mouse_entered.connect(func(): pointer_inside = true)
	get_window().mouse_exited.connect(func():
		pointer_inside = false
		pointer.hide())
	get_window().focus_exited.connect(func():
		pointer_focused = false
		pointer.hide())
	get_window().focus_entered.connect(func():
		pointer_focused = true
		Input.set_mouse_mode(Input.MOUSE_MODE_HIDDEN))
	ui.unlock_requested.connect(unlock_level)
	ui.edit_toggled.connect(toggle_editing)
	ui.tool_selected.connect(func(tool):
		if construction != null and construction.busy():
			return
		selected = tool
		house_log_source = Vector2i(999, 999)
		ui.collapsed = false
		ui.panel.accessibility_description = "Pick up tree first, then ground." if tool == "remove" else "Choose a square for " + BuilderUI.NAMES[tool] + "."
		refresh()
		update_inventory_preview(get_global_mouse_position(), false))
	ui.undo_requested.connect(undo)
	pawn.position = layout.center(layout.spawn_cell())
	pawn.walk_to(pawn.position)
	harvesting = Harvesting.new()
	harvesting.world = self
	add_child(harvesting)
	construction = Construction.new()
	construction.world = self
	add_child(construction)
	if layout.house_bundle > 0:
		construction.open_placement()
	rebuild_decorations()
	construction.resume_build()
	refresh()
	game_camera = Camera2D.new()
	game_camera.position = pawn_view_center()
	game_camera.zoom = Vector2.ONE * DEFAULT_ZOOM
	add_child(game_camera)
	load_camera_view()
	get_window().mouse_exited.connect(func():
		if world_dragging:
			save_camera_view()
		world_pointer_down = null
		world_dragging = false)

func refresh() -> void:
	update_cursor()
	terrain.editing = editing
	terrain.tool = selected
	terrain.valid = false
	ui.refresh(editing, selected, not history.is_empty())

func unlock_level_two() -> void:
	unlock_level(2)

func unlock_level(target_level: int) -> void:
	if construction != null and construction.busy():
		return
	if water_phase != WaterPhase.READY or ui.celebration != null or target_level > ui.max_preview_level:
		return
	if not layout.unlock(target_level):
		return
	# An upgrade only credits inventory: never replace the island or pawn.
	waypoints.clear()
	pawn.walk_to(pawn.position)
	editing = false
	preserve_history_on_reopen = false
	history.clear() # Undo must not restore a snapshot from before the reward grant.
	selected = "ground"
	ui.collapsed = false
	refresh()
	save_layout()
	ui.celebrate()

func toggle_editing() -> void:
	if construction != null and construction.busy():
		return
	log_pickup = Vector2i(999, 999)
	log_delivery = Vector2i(999, 999)
	# Opening inventory changes input tools, not the pawn's current work.
	editing = not editing
	if not editing:
		house_log_source = Vector2i(999, 999)
	if editing:
		if not preserve_history_on_reopen:
			history.clear()
		preserve_history_on_reopen = false
		selected = ""
	refresh()
	update_inventory_preview(get_global_mouse_position(), false)

func _process(_delta: float) -> void:
	if terrain == null:
		return
	if log_pickup != Vector2i(999, 999) and waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
		if not editing and water_phase == WaterPhase.READY and layout.pick_log(log_pickup):
			history.clear()
			rebuild_decorations()
			save_layout()
		log_pickup = Vector2i(999, 999)
	pawn.carrying_wood = (layout.carried_wood > 0 or layout.house_bundle > 0) and not pawn.axe_equipped and not pawn.hammering
	if log_delivery != Vector2i(999, 999) and waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
		var delivered := not editing and water_phase == WaterPhase.READY and layout.drop_logs(log_delivery)
		log_pickup = Vector2i(999, 999)
		log_delivery = Vector2i(999, 999)
		if delivered:
			pawn.carrying_wood = (layout.carried_wood > 0 or layout.house_bundle > 0) and not pawn.axe_equipped and not pawn.hammering
			history.clear()
			rebuild_decorations()
			save_layout()
			if layout.carried_wood > 0:
				continue_log_delivery()
	ui.launch.disabled = false
	ui.upgrade.disabled = water_phase != WaterPhase.READY
	ui.launch.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if water_phase == WaterPhase.READY or water_phase == WaterPhase.APPROACHING:
		pawn.sprite.position.y = -32.0 - ground_height(pawn.position)
		pawn.z_index = int(ceil(ground_height(pawn.position) / 64.0))
		if not waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
			pawn.walk_to(waypoints.pop_front())
	var over_ui := get_viewport().gui_get_hovered_control() != null
	update_inventory_preview(get_global_mouse_position(), pointer_inside and pointer_focused and not over_ui and not world_dragging)
	update_cursor()

# Existing-object changes use the same rule checks and edit path as tools.
# The toolbar selection stays independent of the object under the pointer.
func inventory_changes() -> Array[Dictionary]:
	var changes: Array[Dictionary] = []
	if not editing or selected != "" or water_phase != WaterPhase.READY or ui.collapsed or ui.celebration != null or construction.busy():
		return changes
	var occupied: Vector2i = layout.cell_at(pawn.position)
	for cell in layout.houses:
		if layout.can_edit(cell, "house", occupied, -1, Vector2.ZERO, pawn.position):
			changes.append({"cell": cell, "tool": "house", "height": -1.0})
	for cell in layout.trees:
		if layout.can_edit(cell, "tree", occupied):
			changes.append({"cell": cell, "tool": "tree", "height": -1.0})
	for cell in layout.cells:
		if layout.cells[cell] == "stairs":
			if layout.can_edit(cell, "stairs", occupied):
				changes.append({"cell": cell, "tool": "stairs", "height": -1.0})
		else:
			var height: float = layout.next_ground_height(cell)
			if height >= 0 and layout.can_edit(cell, "ground", occupied, height, Vector2.ZERO, pawn.position):
				changes.append({"cell": cell, "tool": "ground", "height": height})
	return changes

func inventory_change_at(point: Vector2, changes: Array[Dictionary]) -> Dictionary:
	# Artwork takes precedence over the terrain beneath it.
	var tree := tree_at(point)
	for change in changes:
		if change.tool == "house" and LevelFiveArt.house_rect(layout, change.cell).has_point(point):
			return change
		if change.tool == "tree" and change.cell == tree:
			return change
	for change in changes:
		if change.tool == "stairs":
			for area in layout.stair_pickup_rects(change.cell):
				if area.has_point(point):
					return change
	var cell := surface_cell(point)
	for change in changes:
		if change.tool == "ground" and change.cell == cell:
			return change
	return {}

func update_inventory_preview(point: Vector2, allow_hover := true) -> void:
	terrain.proposed_terrain = null
	terrain.changes = inventory_changes()
	terrain.outline_trees = tree_nodes
	terrain.transform_preview = false
	terrain.tool = selected
	terrain.valid = false
	terrain.ground_preview_height = -1
	# Restore any artwork hidden by the previous frame's swap preview.
	for sprite in tree_nodes:
		sprite.visible = true
	for sprite in asset_nodes:
		if sprite.has_meta("house_cell"):
			sprite.visible = true
	if not editing or not allow_hover:
		return
	terrain.preview_position = point
	var change := inventory_change_at(point, terrain.changes) if selected != "remove" and layout.house_bundle == 0 else {}
	if not change.is_empty():
		terrain.transform_preview = true
		terrain.tool = change.tool
		terrain.hover = change.cell
		terrain.ground_preview_height = change.height
		terrain.preview_position = layout.center(change.cell) - Vector2(0, layout.height_at(change.cell))
		terrain.valid = true
		if change.tool == "tree":
			for sprite in tree_nodes:
				if sprite.get_meta("cell") == change.cell:
					sprite.hide()
		elif change.tool == "house":
			for sprite in asset_nodes:
				if sprite.get_meta("house_cell", Vector2i(999, 999)) == change.cell:
					sprite.hide()
		return
	if selected == "":
		return
	if selected == "bridge":
		terrain.hover = bridge_placement_at(point)
	elif selected == "ground":
		var option := ground_placement_at(point)
		terrain.hover = option.cell
		terrain.ground_preview_height = option.height
	else:
		terrain.hover = clicked_cell(point)
	terrain.valid = water_phase == WaterPhase.READY and (selected != "ground" or terrain.ground_preview_height >= 0) and layout.can_edit(terrain.hover, selected, layout.cell_at(pawn.position), terrain.ground_preview_height, Vector2.ZERO, pawn.position, terrain.placement_offset() if selected == "house" else Vector2.ZERO)
	if selected == "house":
		update_house_preview()
	if selected == "tree":
		update_tree_preview(point)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE and editing and ui.celebration == null:
		toggle_editing()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseMotion:
		# Web canvases can be hovered without keyboard focus (including Edenia's
		# iframe). Native inactive windows still belong to the system pointer.
		if OS.has_feature("web"):
			pointer_focused = true
		pointer_inside = get_viewport().get_visible_rect().has_point(event.position)
		pointer_position = event.position

	if world_pointer_down == null:
		return
	if event is InputEventMouseMotion:
		var distance: Vector2 = event.position - world_pointer_down.position
		if distance.length() >= world_drag_threshold:
			world_dragging = true
		if world_dragging:
			game_camera.position = (world_drag_origin - distance / game_camera.zoom.x).clamp(game_camera_center - Vector2(768, 512), game_camera_center + Vector2(768, 512))
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		var click := world_pointer_down
		world_pointer_down = null
		if world_dragging:
			save_camera_view()
		if not world_dragging and (not editing or water_phase == WaterPhase.READY):
			handle_world_click(click)
		world_dragging = false
		get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and ui.celebration == null:
		# Defer world clicks until release, after distinguishing a click from a pan.
		# Godot GUI controls consume their own presses before this handler.
		world_pointer_down = event
		world_drag_origin = game_camera.position
		world_dragging = false
		get_viewport().set_input_as_handled()
		return
	handle_world_click(event)


func pawn_view_center() -> Vector2:
	return pawn.position + Vector2(0, -32.0 - ground_height(pawn.position))

func camera_command(command: String) -> void:
	match command:
		"in": game_camera.zoom = Vector2.ONE * minf(1.5, game_camera.zoom.x + 0.1)
		"out": game_camera.zoom = Vector2.ONE * maxf(0.5, game_camera.zoom.x - 0.1)
		"reset":
			game_camera.position = pawn_view_center()
			game_camera.zoom = Vector2.ONE * DEFAULT_ZOOM
			save_camera_view()
			return
	save_camera_view()

func save_camera_view() -> void:
	if not camera_save_enabled or game_camera == null:
		return
	var json := JSON.stringify({"x": game_camera.position.x, "y": game_camera.position.y, "zoom": game_camera.zoom.x})
	if OS.has_feature("web"):
		JavaScriptBridge.eval("localStorage.setItem('%s', %s)" % [CAMERA_SAVE_KEY, JSON.stringify(json)])
	else:
		var file := FileAccess.open(camera_save_path, FileAccess.WRITE)
		if file:
			file.store_string(json)

func load_camera_view() -> void:
	if not camera_save_enabled:
		return
	var json = null
	if OS.has_feature("web"):
		json = JavaScriptBridge.eval("localStorage.getItem('%s')" % CAMERA_SAVE_KEY)
	elif FileAccess.file_exists(camera_save_path):
		json = FileAccess.get_file_as_string(camera_save_path)
	if not json is String:
		return
	var data = JSON.parse_string(json)
	if not data is Dictionary:
		return
	for field in ["x", "y", "zoom"]:
		if not data.get(field) is float and not data.get(field) is int:
			return
		if not is_finite(float(data[field])):
			return
	game_camera.position = Vector2(data.x, data.y)
	game_camera.zoom = Vector2.ONE * clampf(float(data.zoom), 0.5, 1.5)

func fit_build_cursor() -> void:
	# Assemble one grid square at 1x; camera zoom scales the whole pickup cursor.
	# Seven transparent border pixels sit outside the 64px grid span.
	var size := Vector2i(71, 71)
	if size == build_cursor_size:
		return
	build_cursor_size = size
	var source := BUILD_CURSOR.get_image()
	var assembled := Image.create(size.x, size.y, false, Image.FORMAT_RGBA8)
	for y in range(2):
		for x in range(2):
			assembled.blend_rect(source, Rect2i(x * 96, y * 96, 32, 32), Vector2i(x * (size.x - 32), y * (size.y - 32)))
	build_cursor = ImageTexture.create_from_image(assembled)
	cursor_mode = ""

func update_house_preview() -> void:
	if terrain.valid and layout.house_bundle > 0 and not layout.houses.has(terrain.hover):
		terrain.valid = not construction.placement_plan(terrain.hover, terrain.placement_offset()).is_empty()

func update_cursor() -> void:
	if pointer == null:
		return
	fit_build_cursor()
	var mode := "walk" if not editing else (("build" if selected == "remove" else "place") if terrain.valid else ("ui" if selected == "" else "invalid"))
	if editing and selected == "":
		mode = "ui"
	if not editing and water_phase == WaterPhase.READY and ui.celebration == null and harvesting != null and harvesting.available(tree_at(get_global_mouse_position())):
		mode = "axe"
	if not editing and water_phase == WaterPhase.READY and ui.celebration == null and layout.can_pick_log(log_at(get_global_mouse_position())):
		mode = "ui"
	if not editing and water_phase == WaterPhase.READY and ui.celebration == null and layout.level >= 5 and int(layout.log_piles.get(log_at(get_global_mouse_position()), 0)) == 6:
		mode = "house"
	var hovered := get_viewport().gui_get_hovered_control()
	if hovered != null and (hovered == ui.root or ui.root.is_ancestor_of(hovered)):
		mode = "invalid" if hovered is BaseButton and hovered.disabled else "ui"
	if mode != cursor_mode:
		cursor_mode = mode
		pointer.texture = HOUSE_CURSOR if mode == "house" else AXE_CURSOR if mode == "axe" else UI_CURSOR if mode == "ui" or mode == "place" else (CURSOR if mode == "walk" else (build_cursor if mode == "build" else INVALID_CURSOR))
	var hotspot := Vector2(build_cursor_size) / 2.0 if mode == "build" else (Vector2(32, 32) if mode == "axe" or mode == "house" else Vector2(24, 18))
	pointer.scale = (game_camera.zoom if game_camera != null else Vector2.ONE * DEFAULT_ZOOM) if mode == "build" else Vector2.ONE
	# The original handle faces left; mirror it when the pawn is on the right.
	pointer.flip_h = false
	if mode == "axe" or mode == "house":
		var zoom := game_camera.zoom.x if game_camera != null else DEFAULT_ZOOM
		var tool_scale := lerpf(0.9, 1.0, clampf((zoom - 0.5) / (DEFAULT_ZOOM - 0.5), 0.0, 1.0)) if zoom < DEFAULT_ZOOM else lerpf(1.0, 1.2, clampf((zoom - DEFAULT_ZOOM) / (1.5 - DEFAULT_ZOOM), 0.0, 1.0))
		pointer.scale = Vector2.ONE * tool_scale
		if mode == "axe":
			pointer.flip_h = pawn.sprite.get_global_transform_with_canvas().origin.x > pointer_position.x
		else:
			# The hammer artwork fills twice the span of the white hand.
			pointer.scale *= 0.5
	pointer.position = pointer_position - hotspot * pointer.scale
	pointer.visible = pointer_inside and pointer_focused

func bridge_placement_at(point: Vector2) -> Vector2i:
	for bank in layout.cells:
		var start: Vector2i = bank + Vector2i.RIGHT
		if Layout.BridgeRules.valid(layout, start):
			var top: Vector2 = Layout.ORIGIN + Vector2(start) * 64 - Vector2(0, layout.height_at(bank))
			if Rect2(top, Vector2(128, 64)).has_point(point):
				return start
	return layout.cell_at(point)

func tree_at(point: Vector2) -> Vector2i:
	for index in range(tree_nodes.size() - 1, -1, -1):
		var sprite := tree_nodes[index] as Sprite2D
		var cell: Vector2i = sprite.get_meta("cell")
		var anchor: Vector2 = layout.tree_position(cell) - Vector2(0, layout.height_at(cell))
		var behind := Rect2(anchor - Vector2(17, 48), Vector2(34, 24))
		if behind.has_point(point) and layout.walkable_point(point + Vector2(0, layout.height_at(cell))):
			continue
		if sprite.is_visual_pixel_opaque(sprite.to_local(point)):
			return cell
	return Harvesting.NO_TREE

func clicked_cell(point: Vector2) -> Vector2i:
	if editing and selected in ["house", "sheep", "chicken", "remove"]:
		for cell in layout.houses:
			if selected in ["house", "remove"] and LevelFiveArt.house_rect(layout, cell).has_point(point):
				return cell
		for point_on_ground in layout.chickens:
			var cell: Vector2i = layout.cell_at(point_on_ground)
			var chicken_rect := LevelFiveArt.chicken_rect(layout, cell)
			chicken_rect.position += point_on_ground - layout.center(cell)
			chicken_rect.position.y += layout.height_at(cell) - ground_height(point_on_ground)
			if selected == "remove" and chicken_rect.has_point(point):
				return cell
		for sheep_position in layout.sheep:
			var cell: Vector2i = layout.cell_at(sheep_position)
			if selected == "remove" and LevelFiveArt.sheep_rect(layout, cell).has_point(point):
				return cell
	if editing and selected in ["tree", "remove"]:
		for index in range(tree_nodes.size() - 1, -1, -1):
			var sprite := tree_nodes[index] as Sprite2D
			if sprite.is_visual_pixel_opaque(sprite.to_local(point)):
				return sprite.get_meta("cell")
	if editing and selected == "bridge":
		return bridge_placement_at(point)
	var bridge := Layout.BridgeRules.hit(layout, point)
	if layout.bridges.has(bridge):
		if editing and selected == "remove":
			return bridge
		if not editing:
			var banks := Layout.BridgeRules.ends(bridge)
			# A click on the deck walks to its opposite bank.
			return banks[1] if pawn.position.x < layout.center(bridge).x + 32 else banks[0]
	var cell := visual_cell(point)
	if editing and selected == "remove" and not layout.trees.has(cell):
		for stair in layout.stair_directions:
			for area in layout.stair_pickup_rects(stair):
				if area.has_point(point):
					var landing: Vector2i = stair + layout.stair_direction(stair)
					return landing if layout.trees.has(landing) else stair
			if stair + layout.stair_direction(stair) == cell:
				return stair
	return cell

func tree_offset_at(cell: Vector2i, point: Vector2) -> Vector2:
	# Mouse is on the visible surface; navigation and Y sorting use ground space.
	var offset := point + Vector2(0, layout.height_at(cell)) - layout.center(cell)
	return Vector2(clampf(offset.x, Layout.TREE_OFFSET_X_MIN, Layout.TREE_OFFSET_X_MAX), clampf(offset.y, Layout.TREE_OFFSET_Y_MIN, Layout.TREE_OFFSET_Y_MAX))

func update_tree_preview(point: Vector2) -> void:
	var offset := tree_offset_at(terrain.hover, point)
	# Like grass, the held artwork follows the pointer; only the click anchor
	# is constrained to the selected tile's safe planting margins.
	terrain.preview_position = point
	terrain.valid = water_phase == WaterPhase.READY and can_place_tree(terrain.hover, offset)

func can_place_tree(cell: Vector2i, offset: Vector2) -> bool:
	if layout.trees.has(cell):
		return layout.can_edit(cell, "tree", layout.cell_at(pawn.position))
	return layout.can_edit(cell, selected, layout.cell_at(pawn.position), -1, offset) and not layout.tree_blocks_point(layout.center(cell) + offset, pawn.position, layout.next_tree_variant)

func ground_placement_at(point: Vector2) -> Dictionary:
	var cell := surface_cell(point)
	var height: float = layout.next_ground_height(cell)
	if height >= 0 and not layout.can_edit(cell, "ground", layout.cell_at(pawn.position), height):
		height = -1.0
	return {"cell": cell, "height": height}

func visual_cell(point: Vector2) -> Vector2i:
	return ground_placement_at(point).cell if editing and selected == "ground" else surface_cell(point)

func surface_cell(point: Vector2) -> Vector2i:
	for cell in layout.cells:
		if layout.cells[cell] == "stairs":
			var height := ground_height(Vector2(point.x, layout.center(cell).y))
			if Rect2(layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, height), Vector2(64, 64)).has_point(point):
				return cell
	# Raised top faces are selectable where they are drawn, not beneath them.
	for cell in layout.cells:
		if layout.height_at(cell) > 0 and Rect2(layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, layout.height_at(cell)), Vector2(64, 64)).has_point(point):
			return cell

	return layout.cell_at(point)

func handle_world_click(event: InputEvent) -> void:
	if ui == null or ui.celebration != null or water_phase not in [WaterPhase.READY, WaterPhase.APPROACHING]:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var point: Vector2 = get_global_transform_with_canvas().affine_inverse() * event.position
		var change := inventory_change_at(point, inventory_changes()) if editing and selected != "remove" and layout.house_bundle == 0 else {}
		var cell: Vector2i = change.cell if not change.is_empty() else clicked_cell(point)
		if construction.handle_click(cell, point):
			return
		log_pickup = Vector2i(999, 999)
		log_delivery = Vector2i(999, 999)
		if not editing:
			var pile := log_at(point)
			if layout.level >= 5 and int(layout.log_piles.get(pile, 0)) == 6:
				construction.pickup(pile)
				return
			if layout.can_pick_log(pile):
				var destination: Vector2 = layout.center(pile)
				var route := land_route(pawn.position, pile, destination)
				if not route.is_empty() and route.back().is_equal_approx(destination):
					walk_on_land(pile, destination)
					log_pickup = pile
				return
			if layout.can_drop_logs(cell):
				var destination: Vector2 = layout.center(cell)
				var delivery_route := land_route(pawn.position, cell, destination)
				if not delivery_route.is_empty() and delivery_route.back().is_equal_approx(destination):
					walk_on_land(cell, destination)
					log_delivery = cell
				return
			var tree := tree_at(point)
			if harvesting.available(tree):
				harvesting.start(tree)
				return
			harvesting.cancel()
		if editing:
			if not change.is_empty():
				var held_tool := selected
				selected = change.tool
				apply_edit(cell, change.height)
				selected = held_tool
				refresh()
				update_inventory_preview(point)
				return
			var height: float = ground_placement_at(point).height if selected == "ground" else -1.0
			if selected != "ground" or height >= 0:
				apply_edit(cell, height, tree_offset_at(cell, point) if selected == "tree" else Vector2.ZERO)
		elif layout.cells.has(cell):
			var bridge := Layout.BridgeRules.hit(layout, point)
			if layout.bridges.has(bridge):
				point = layout.center(cell) - Vector2(0, layout.height_at(cell))
			walk_on_land(cell, point + Vector2(0, ground_height(Vector2(point.x, layout.center(cell).y))))
		else:
			fall_into_water(point)

func apply_edit(cell: Vector2i, ground_height: float = -1, tree_placement_offset: Vector2 = Vector2.ZERO) -> bool:
	if water_phase != WaterPhase.READY:
		return false
	if construction != null and construction.busy():
		return false
	if selected == "tree" and not can_place_tree(cell, tree_placement_offset):
		return false
	var before: Dictionary = layout.snapshot()
	if not layout.edit(cell, selected, layout.cell_at(pawn.position), ground_height, tree_placement_offset, house_log_source, pawn.position, terrain.placement_offset() if selected == "house" and not layout.houses.has(cell) else Vector2.ZERO):
		ui.panel.accessibility_description = "Move the pawn off this tile. Pick up stairs before their landing." if selected == "remove" else "That spot is unavailable. Try another square."
		return false
	history.append(before)
	if history.size() > 40:
		history.pop_front()
	rebuild_decorations()
	save_layout()
	if editing and selected not in ["remove", "ground", "tree", "house", "stairs"] and layout.ground_count() + layout.stock.stairs + layout.stock.tree + (layout.stock.bridge if layout.bridges_enabled else 0) == 0:
		editing = false
		preserve_history_on_reopen = true
	refresh()
	return true

func undo() -> void:
	if construction != null and construction.busy():
		return
	if water_phase != WaterPhase.READY or not editing or history.is_empty():
		return
	layout.restore(history.pop_back())
	if not layout.cells.has(layout.cell_at(pawn.position)):
		pawn.position = layout.center(layout.spawn_cell())
		pawn.walk_to(pawn.position)
	rebuild_decorations()
	save_layout()
	refresh()

func rebuild_decorations() -> void:
	for node in get_children():
		if node.has_meta("terrain_shadow") or node.has_meta("terrain_backing"):
			remove_child(node)
			node.queue_free()
	var shadow_heights: Dictionary = {}
	for cell in layout.cells:
		var casting_height: float = layout.height_at(cell) + (64 if layout.cells[cell] == "stairs" else 0)
		for height in range(64, int(casting_height) + 1, 64):
			shadow_heights[float(height)] = true
	for height in shadow_heights:
		if height > 64:
			var backing := TerrainView.new()
			backing.layout = layout
			backing.render_source = terrain
			backing.backing_height = height - 64
			backing.z_index = int(height / 64.0) - 2
			backing.set_meta("terrain_backing", true)
			add_child(backing)
		var shadows := TerrainView.new()
		shadows.layout = layout
		shadows.render_source = terrain
		shadows.shadow_height = height
		# After World at the receiving surface's depth, before its characters
		# and the casting floor. Keep the authored one-tile downward offset.
		shadows.z_index = int(height / 64.0) - 2
		shadows.set_meta("terrain_shadow", true)
		add_child(shadows)
	for node in $World.get_children():
		if node.has_meta("terrain_occluder"):
			$World.remove_child(node)
			node.queue_free()
	for cell in layout.cells:
		if layout.height_at(cell) > 0 or layout.cells[cell] == "stairs":
			var surface := TerrainView.new()
			surface.layout = layout
			surface.render_source = terrain
			surface.piece = cell
			surface.z_index = maxi(0, int(layout.height_at(cell) / 64.0) - (0 if layout.cells[cell] == "stairs" else 1))
			surface.position = layout.ORIGIN + Vector2(cell) * 64
			surface.set_meta("terrain_occluder", true)
			$World.add_child(surface)
	for start in (layout.bridges if layout.bridges_enabled else {}):
		var bridge := Sprite2D.new()
		bridge.texture = Layout.BridgeRules.TEXTURE
		bridge.centered = false
		bridge.position = Layout.BridgeRules.art_rect(layout, start).position
		bridge.z_index = int(layout.bridges[start] / 64.0) - 1
		bridge.set_meta("terrain_occluder", true)
		$World.add_child(bridge)
	for rock in $WaterRocks.get_children():
		rock.visible = true
		for cell in layout.cells:
			var height: float = layout.height_at(cell) + 64.0 if layout.cells[cell] == "stairs" else layout.height_at(cell)
			var occupied_area := Rect2(layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, height), Vector2(64, 64 + height))
			if occupied_area.has_point(rock.position):
				rock.hide()
				break
	for plant in flora_nodes:
		plant.queue_free()
	flora_nodes.clear()
	for node in asset_nodes:
		node.queue_free()
	asset_nodes.clear()
	for node in tree_nodes:
		node.queue_free()
	tree_nodes.clear()
	# Original foliage follows its tile and disappears when that tile is collected.
	$World/IsletRock.hide() # Editable layouts render the rock through decorations.
	for pair in [["MainBush", Vector2i(0, 0), 1], ["LeafyTuft", Vector2i(1, 1), 2]]:
		var node = $World.get_node(pair[0])
		node.visible = layout.flora.get(pair[1], 0) == pair[2]
		node.offset.y = -15 - layout.height_at(pair[1]) / node.scale.y
		node.z_index = int(layout.height_at(pair[1]) / 64.0)
	for cell in layout.flora:
		if {Vector2i(0, 0): 1, Vector2i(1, 1): 2}.get(cell) == layout.flora[cell]:
			continue
		var plant := Sprite2D.new()
		plant.texture = preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Bushes/Bushe1.png") if layout.flora[cell] == 1 else preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Bushes/Bushe4.png")
		plant.hframes = 8
		plant.scale = Vector2.ONE * 0.75
		plant.z_index = int(layout.height_at(cell) / 64.0)
		plant.position = layout.center(cell) + Vector2(0, 12)
		plant.offset = Vector2(0, -15 - layout.height_at(cell) / 0.75)
		plant.set_script(preload("res://scripts/environment_sprite.gd"))
		$World.add_child(plant)
		flora_nodes.append(plant)
	for cell in layout.decorations:
		var item: Dictionary = layout.decorations[cell]
		var in_water: bool = item.kind in Layout.DecorationRules.WATER_KINDS
		var decoration := Sprite2D.new()
		var directory := "res://Tiny Swords (Free Pack)/Terrain/Decorations/"
		match item.kind:
			"flowers", "bush":
				var variant: int = item.variant + (2 if item.kind == "flowers" else 0)
				decoration.texture = load(directory + "Bushes/Bushe%d.png" % variant)
				decoration.hframes = 8
				decoration.scale = Vector2.ONE * 0.75
				decoration.offset.y = -15
			"land_rock":
				decoration.texture = load(directory + "Rocks/Rock%d.png" % item.variant)
			"water_rock":
				decoration.texture = load(directory + "Rocks in the Water/Water Rocks_%02d.png" % item.variant)
				decoration.hframes = 16
			"ducks":
				decoration.texture = load(directory + "Rubber Duck/Rubber duck.png")
				decoration.hframes = 3
				decoration.flip_h = item.variant == 2
		decoration.position = layout.center(item.water if in_water else cell)
		if item.kind == "land_rock":
			# Sort from the near edge like foliage, without moving the artwork.
			decoration.position.y += 12
			decoration.offset.y -= 12 / decoration.scale.y
		decoration.z_index = -17 if in_water else int(layout.height_at(cell) / 64.0)
		if not in_water:
			decoration.offset.y -= layout.height_at(cell) / decoration.scale.y
		if decoration.hframes > 1:
			decoration.set_script(preload("res://scripts/environment_sprite.gd"))
			decoration.phase = float(cell.x * 7 + cell.y * 11) / 5.0
		decoration.set_meta("random_decoration", item.kind)
		$World.add_child(decoration)
		flora_nodes.append(decoration)
	for cell in layout.log_piles:
		var pile := Node2D.new()
		# Keep the whole pile together while its depth follows the contact patch.
		pile.set_script(preload("res://scripts/log_pile.gd"))
		pile.layout = layout
		pile.cell = cell
		pile.pawn = pawn
		pile.position = layout.center(cell) + Vector2(0, 12)
		pile.y_sort_enabled = false
		pile.set_meta("log_pile", cell)
		pile.z_index = int(layout.height_at(cell) / 64.0)
		# Bottom row fills first, then the middle row, then the apex.
		var positions := [Vector2(-13, 0), Vector2(0, 0), Vector2(13, 0), Vector2(-6.5, -14), Vector2(6.5, -14), Vector2(0, -28)]
		# Center incomplete bottom rows, including the two-log harvest.
		if layout.log_piles[cell] == 1:
			positions[0] = Vector2.ZERO
		elif layout.log_piles[cell] == 2:
			positions[0] = Vector2(-6.5, 0)
			positions[1] = Vector2(6.5, 0)
		var ground_shadow := Node2D.new()
		# Ground shadows sort before every pawn position on this grass tile.
		ground_shadow.position = layout.center(cell) - Vector2(0, 32)
		ground_shadow.z_index = pile.z_index
		ground_shadow.set_meta("log_shadow", cell)
		var shadow_material := ShaderMaterial.new()
		shadow_material.shader = LOG_SHADOW_SHADER
		var height: float = layout.height_at(cell)
		var grass_region: Rect2 = terrain.ground_region(cell, "meadow" if height == 0 else layout.kind_at_height(height))
		shadow_material.set_shader_parameter("grass_atlas", terrain.floor_texture(height))
		shadow_material.set_shader_parameter("grass_region", Vector4(grass_region.position.x, grass_region.position.y, 64, 64))
		var local_from_world := global_transform.affine_inverse()
		shadow_material.set_shader_parameter("ground_axes", Vector4(local_from_world.x.x, local_from_world.y.x, local_from_world.x.y, local_from_world.y.y))
		shadow_material.set_shader_parameter("ground_origin", local_from_world.origin - (layout.center(cell) - Vector2(32, 32 + height)))
		# Render the union once so intersecting log silhouettes never darken.
		var shadow_centers := PackedVector2Array()
		for index in int(layout.log_piles[cell]):
			shadow_centers.append(Vector2(positions[index].x, 44 + positions[index].y * 0.25 - height))
		shadow_material.set_shader_parameter("log_texture", LOG_TEXTURE)
		shadow_material.set_shader_parameter("log_count", shadow_centers.size())
		shadow_centers.resize(6)
		shadow_material.set_shader_parameter("log_centers", shadow_centers)
		var shadow := Polygon2D.new()
		var half_size := Vector2(LOG_TEXTURE.get_size()) * 0.45
		shadow.polygon = PackedVector2Array([
			Vector2(-13 - half_size.x, 37 - height - half_size.y),
			Vector2(13 + half_size.x, 37 - height - half_size.y),
			Vector2(13 + half_size.x, 44 - height + half_size.y),
			Vector2(-13 - half_size.x, 44 - height + half_size.y),
		])
		shadow.material = shadow_material
		ground_shadow.add_child(shadow)
		$World.add_child(ground_shadow)
		flora_nodes.append(ground_shadow)
		# Back-to-front: logs 1, 4, 2, 6, 5, 3 (numbered by rows).
		for index in [0, 3, 1, 5, 4, 2]:
			if index >= int(layout.log_piles[cell]):
				continue
			var log_sprite := Sprite2D.new()
			log_sprite.texture = LOG_TEXTURE
			log_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			log_sprite.scale = Vector2.ONE * 0.9
			log_sprite.position = positions[index] - Vector2(0, 6 + layout.height_at(cell))
			pile.add_child(log_sprite)
		$World.add_child(pile)
		flora_nodes.append(pile)
	for cell in layout.houses:
		var house := Sprite2D.new()
		var facing: int = layout.houses[cell]
		house.texture = LevelFiveArt.HOUSE_TEXTURES[facing]
		house.flip_h = facing == 3
		house.scale = Vector2.ONE
		house.position = Vector2(layout.center(cell).x + 32 + layout.house_offsets.get(cell, Vector2.ZERO).x, LevelFiveArt.house_depth_y(layout, cell, facing))
		# Move the sorting anchor without moving the house artwork.
		house.offset = Vector2(0, layout.center(cell).y + layout.house_offsets.get(cell, Vector2.ZERO).y - house.position.y - layout.height_at(cell))
		house.set_meta("house_cell", cell)
		house.z_index = int(layout.height_at(cell) / 64)
		$World.add_child(house)
		asset_nodes.append(house)
	for chicken_index in layout.chickens.size():
		var chicken := Sprite2D.new()
		chicken.set_script(preload("res://scripts/chicken_visual.gd"))
		chicken.world = self
		chicken.chicken_index = chicken_index
		var shadow := Polygon2D.new()
		shadow.name = "GroundShadow"
		var outline := PackedVector2Array()
		for index in range(32):
			var angle := TAU * index / 32.0
			outline.append(Vector2(cos(angle) * 25, -4 + sin(angle) * 8))
		shadow.polygon = outline
		shadow.color = Color(0, 0, 0, 0.2)
		shadow.show_behind_parent = true
		chicken.add_child(shadow)
		$World.add_child(chicken)
		asset_nodes.append(chicken)
	for index in layout.sheep.size():
		var sheep_sprite := Sprite2D.new()
		sheep_sprite.set_script(preload("res://scripts/sheep_visual.gd"))
		sheep_sprite.world = self
		sheep_sprite.sheep_index = index
		$World.add_child(sheep_sprite)
		asset_nodes.append(sheep_sprite)
	for cell in layout.trees:
		var tree := Sprite2D.new()
		var kind: String = layout.tree_types.get(cell, "tree")
		var stump: bool = layout.tree_stumps.has(cell)
		tree.texture = TreeArt.texture_at(layout.tree_offset(cell), kind, stump, TreeArt.shadow_ground(layout, cell))
		tree.set_meta("cell", cell)
		tree.hframes = 1 if stump else 8
		tree.scale = Vector2.ONE * TreeArt.SCALE
		tree.z_index = int(layout.height_at(cell) / 64.0)
		tree.position = layout.tree_position(cell)
		tree.offset = (TreeArt.stump_offset(kind) if stump else TreeArt.art_offset(kind)) - Vector2(0, layout.height_at(cell) / TreeArt.SCALE)
		tree.set_script(preload("res://scripts/tree_visual.gd"))
		tree.world = self
		tree.kind = kind
		$World.add_child(tree)
		tree_nodes.append(tree)

func log_at(point: Vector2) -> Vector2i:
	for node in flora_nodes:
		if not node.has_meta("log_pile") or node.is_queued_for_deletion():
			continue
		for sprite in node.get_children():
			var pixel: Vector2 = sprite.to_local(to_global(point)) + LOG_TEXTURE.get_size() / 2.0
			if Rect2(Vector2.ZERO, LOG_TEXTURE.get_size()).has_point(pixel) and LOG_TEXTURE.get_image().get_pixelv(Vector2i(pixel)).a > 0.1:
				return node.get_meta("log_pile")
	return Vector2i(999, 999)

func continue_log_delivery() -> void:
	var nearest := Vector2i(999, 999)
	var nearest_distance := INF
	for cell in layout.cells:
		if not layout.can_drop_logs(cell):
			continue
		var destination: Vector2 = layout.center(cell)
		var distance: float = pawn.position.distance_squared_to(destination)
		if distance >= nearest_distance:
			continue
		var route := land_route(pawn.position, cell, destination)
		if route.is_empty() or not route.back().is_equal_approx(destination):
			continue
		nearest = cell
		nearest_distance = distance
	if nearest != Vector2i(999, 999):
		walk_on_land(nearest, layout.center(nearest))
		log_delivery = nearest

func walk_on_land(cell: Vector2i, point: Vector2) -> void:
	log_pickup = Vector2i(999, 999)
	log_delivery = Vector2i(999, 999)
	harvesting.cancel()
	movement_generation += 1
	if water_phase == WaterPhase.APPROACHING:
		water_phase = WaterPhase.READY
		waypoints.clear()
		pawn.walk_to(pawn.position)
	waypoints = land_route(pawn.position, cell, point)
	if not waypoints.is_empty():
		pawn.walk_to(waypoints.pop_front())

func land_route(start_point: Vector2, cell: Vector2i, point: Vector2) -> Array[Vector2]:
	var route: Array[Vector2] = []
	var from: Vector2i = layout.cell_at(start_point)
	# When a crossing is redirected midspan, reconnect its elevated lane to
	# the nearest bank; the grass below remains a separate ordinary route.
	var crossing_start := Vector2i(999, 999)
	for start in walking_bridges:
		if layout.bridges.has(start) and from in [start, start + Vector2i.RIGHT]:
			crossing_start = start
			var banks := Layout.BridgeRules.ends(start)
			from = banks[0] if start_point.x < layout.center(start).x + 32 else banks[1]
	walking_bridges.clear()
	if layout.bridges.has(crossing_start):
		walking_bridges.append(crossing_start)
	var path: Array[Vector2i] = layout.path(from, cell)
	if path.is_empty() and from != cell:
		return route
	var previous_cell := from
	for step in path:
		for start in layout.bridges:
			var banks := Layout.BridgeRules.ends(start)
			if previous_cell in banks and step in banks and previous_cell != step and start not in walking_bridges:
				walking_bridges.append(start)
		previous_cell = step
	var candidates: Array[Vector2] = [layout.center(from)]
	for step in path:
		candidates.append(layout.center(step))
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	# At a tree's front edge, retain only the eight-pixel foot margin;
	# a wider inset can pull a click below its roots back into the trunk.
	var bottom_margin := 8.0 if layout.trees.has(cell) else 12.0
	var target := point.clamp(origin + Vector2(12, 12), origin + Vector2(52, 64 - bottom_margin))
	# Preserve reachable ground near trunks, including the seam behind their roots.
	# Tile insets otherwise move a click across that seam into the obstacle.
	if (not layout.trees.is_empty() or not layout.log_piles.is_empty() or not layout.houses.is_empty()) and layout.walkable_point(point):
		target = point
	candidates.append(target)
	if not layout.trees.is_empty() or not layout.log_piles.is_empty() or not layout.houses.is_empty():
		candidates = tree_navigation_path(start_point, target)
		if candidates.is_empty():
			return route
	# Keep only necessary bends. Clear stretches can be walked directly, without
	# pulling the pawn back to the center of its current square on every click.
	var start: Vector2 = start_point
	while not candidates.is_empty():
		var furthest := 0
		for i in range(candidates.size()):
			if clear_segment(start, candidates[i]):
				furthest = i
		var next: Vector2 = candidates[furthest]
		route.append(next)
		candidates = candidates.slice(furthest + 1)
		start = next
	return route

func tree_navigation_path(start: Vector2, target: Vector2, allowed_cells: Array[Vector2i] = [], moving_sheep: bool = false) -> Array[Vector2]:
	var result: Array[Vector2] = []
	if not layout.walkable_point(target, moving_sheep):
		return result
	var source := Vector2i(((start - Layout.ORIGIN) / 8.0).floor())
	var queue: Array[Vector2i] = [source]
	var previous: Dictionary = {source: source}
	var index := 0
	while index < queue.size():
		var current := queue[index]
		index += 1
		var current_point: Vector2 = start if current == source else Layout.ORIGIN + Vector2(current) * 8
		# A valid cursor target can lie beside a blocked grid sample at a root
		# or shore. Connect the last short segment to the exact target.
		if current_point.distance_squared_to(target) <= 144 and clear_segment(current_point, target, moving_sheep):
			while current != source:
				result.push_front(Layout.ORIGIN + Vector2(current) * 8)
				current = previous[current]
			result.append(target)
			return result
		for step in Layout.NAV_STEPS:
			var next: Vector2i = current + step
			if previous.has(next):
				continue
			var next_point := Layout.ORIGIN + Vector2(next) * 8
			if not allowed_cells.is_empty() and not layout.cell_at(next_point) in allowed_cells:
				continue
			if not clear_segment(current_point, next_point, moving_sheep):
				continue
			previous[next] = current
			queue.append(next)
	return result

func clear_segment(start: Vector2, end: Vector2, moving_sheep: bool = false) -> bool:
	for bridge in walking_bridges:
		if layout.bridges.has(bridge) and Layout.BridgeRules.spans(layout, bridge, start, end):
			return true
	# Sweep both boots over the whole segment, including between terrain samples.
	for cell in layout.trees:
		if layout.tree_blocks_segment(cell, start, end):
			return false
	for cell in layout.log_piles:
		if layout.log_blocks_contact(cell, start, end) if moving_sheep else layout.log_blocks_feet(cell, start, end):
			return false
	for cell in layout.houses:
		if layout.house_blocks_contact(cell, start, end, moving_sheep):
			return false
	var samples := maxi(1, ceili(start.distance_to(end) / 4.0))
	var previous: Vector2i = layout.cell_at(start)
	for i in range(samples + 1):
		var point := start.lerp(end, float(i) / samples)
		var current: Vector2i = layout.cell_at(point)
		if current != previous and not layout.can_cross(previous, current):
			return false
		previous = current
		if not layout.walkable_point(point, moving_sheep):
			return false
	return true

func ground_height(point: Vector2) -> float:
	var cell: Vector2i = layout.cell_at(point)
	for bridge in walking_bridges:
		if layout.bridges_enabled and layout.bridges.has(bridge) and cell in [bridge, bridge + Vector2i.RIGHT] and absf(point.y - layout.center(bridge).y) <= 7:
			return Layout.BridgeRules.height(layout, bridge, point.x)
	if layout.cells.get(cell) == "stairs":
		var direction: Vector2i = layout.stair_direction(cell)
		var progress: float = (point.x - layout.ORIGIN.x - cell.x * 64) / 64.0
		return layout.height_at(cell) + clampf(progress if direction.x > 0 else 1.0 - progress, 0.0, 1.0) * 64.0
	return layout.height_at(cell)

func fall_into_water(point: Vector2) -> void:
	harvesting.cancel()
	# A raised face is not a water exit; descend using the existing stairs first.
	if ground_height(pawn.position) > 0:
		return
	var from: Vector2i = layout.cell_at(pawn.position)
	var best := INF
	var shore: Vector2i = from
	var direction := Vector2.RIGHT
	# Rank exits by a lower bound before searching obstacle routes. A route
	# cannot be shorter than the straight-line walk, so exits whose bound
	# exceeds the best complete route cannot win.
	var exits: Array[Dictionary] = []
	for cell in layout.cells:
		if layout.height_at(cell) > 0 or layout.cells[cell] == "stairs" or layout.trees.has(cell):
			continue
		var exit: Vector2 = pawn.position if cell == from else layout.center(cell)
		for step in Layout.STEPS:
			if layout.cells.has(cell + step):
				continue
			var water_distance := 53.0 + (exit + Vector2(step) * 53.0).distance_to(point)
			exits.append({"cell": cell, "step": step, "point": exit,
				"water_distance": water_distance,
				"bound": pawn.position.distance_to(exit) + water_distance})
	exits.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.bound < b.bound)
	var route_distances: Dictionary = {from: 0.0}
	for exit in exits:
		if float(exit.bound) >= best:
			break
		var cell: Vector2i = exit.cell
		if not route_distances.has(cell):
			var route := land_route(pawn.position, cell, exit.point)
			var distance := INF if route.is_empty() else 0.0
			var previous: Vector2 = pawn.position
			for waypoint in route:
				distance += previous.distance_to(waypoint)
				previous = waypoint
			route_distances[cell] = distance
		var distance: float = route_distances[cell] + float(exit.water_distance)
		if distance < best:
			best = distance
			shore = cell
			direction = Vector2(exit.step)
	if best == INF:
		return
	var edge: Vector2 = layout.center(shore)
	if from == shore:
		# Already on the shoreline tile: do not walk back to its center merely
		# to align the reference animation. Translate its origin to the pawn.
		movement_generation += 1
		waypoints.clear()
		edge = pawn.position
		pawn.walk_to(edge)
	else:
		walk_on_land(shore, edge)
	water_phase = WaterPhase.APPROACHING
	var generation := movement_generation
	while not waypoints.is_empty() or pawn.position.distance_to(edge) > 0.2:
		await get_tree().physics_frame
		if generation != movement_generation or water_phase != WaterPhase.APPROACHING:
			return
	var height: float = ground_height(edge)
	var spawn_cell: Vector2i = layout.random_respawn_cell()
	await perform_water_fall(edge, direction, height, layout.center(spawn_cell), layout.height_at(spawn_cell))


func save_layout() -> void:
	if not preview_save_enabled:
		return
	var json := JSON.stringify(layout.snapshot())
	if OS.has_feature("web"):
		JavaScriptBridge.eval("localStorage.setItem('%s', %s)" % [SAVE_KEY, JSON.stringify(json)])
	else:
		var file := FileAccess.open("user://builder_preview.json", FileAccess.WRITE)
		if file: file.store_string(json)

func load_layout() -> void:
	var json = null
	if OS.has_feature("web"):
		json = JavaScriptBridge.eval("localStorage.getItem('%s')" % SAVE_KEY)
	elif FileAccess.file_exists("user://builder_preview.json"):
		json = FileAccess.get_file_as_string("user://builder_preview.json")
	if json is String:
		var data = JSON.parse_string(json)
		if data is Dictionary:
			layout.restore(data)

func _exit_tree() -> void:
	if harvesting != null:
		harvesting.cancel()
	save_camera_view()
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	super._exit_tree()
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_FORBIDDEN)
