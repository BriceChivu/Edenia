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
const CURSOR_PRESS_SHADER := preload("res://shaders/cursor_press.gdshader")
const Construction = preload("res://scripts/house_construction.gd")
const Harvesting = preload("res://scripts/tree_harvesting.gd")
const AXE_CURSOR := preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Tools/Tool_02.png")
const SAVE_KEY := "edenia_tiny_swords_builder_preview_v1"
const DEFAULT_ZOOM := 0.8
const MAX_MOUSE_ZOOM := 1.5
const MAX_TOUCH_ZOOM := 3.0
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
var chicken_carry
var construction
var log_pickup := Vector2i(999, 999)
var log_delivery := Vector2i(999, 999)
var asset_nodes: Array[Node] = []
var tree_nodes: Array[Node] = []
var flora_nodes: Array[Node] = []
var terrain_preview_change := {}
var inventory_layout_inputs: Array = []
var inventory_layout_revision := 0
var inventory_change_inputs: Array = []
var cached_inventory_changes: Array[Dictionary] = []
var inventory_preview_inputs: Array = []
var inventory_art_revision := 0
var preview_save_enabled := true
var build_cursor: Texture2D
var build_cursor_size := Vector2i.ZERO
var cursor_mode := ""
var pointer: Sprite2D
var cursor_press_material: ShaderMaterial
var cursor_press_tween: Tween
var touch_device := DisplayServer.is_touchscreen_available()
var camera_touches: Dictionary = {}
var pinch_distance := 0.0
var pinch_gesture := false
var pointer_inside := false
var pointer_focused := true
var pointer_position := Vector2.ZERO
var playground_manual_progression := false
var study_claims_authoritative := false
var playground_enabled := false
var playground_ready := true
var playground
var pending_unlock_level := 0
var saved_playground_checkpoint: Dictionary = {}
@export var island_start_enabled := false
var island_started := false
var arrival

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
	cursor_press_material = ShaderMaterial.new()
	cursor_press_material.shader = CURSOR_PRESS_SHADER
	pointer.hide()
	pointer_layer.add_child(pointer)
	Input.set_mouse_mode(Input.MOUSE_MODE_HIDDEN)
	get_window().mouse_entered.connect(func(): pointer_inside = true)
	get_window().mouse_exited.connect(func():
		pointer_inside = false
		set_cursor_pressed(false, true)
		pointer.hide())
	get_window().focus_exited.connect(func():
		pointer_focused = false
		set_cursor_pressed(false, true)
		world_pointer_down = null
		world_dragging = false
		pointer.hide())
	get_window().focus_entered.connect(func():
		pointer_focused = true
		Input.set_mouse_mode(Input.MOUSE_MODE_HIDDEN))
	ui.edit_toggled.connect(toggle_editing)
	ui.tool_selected.connect(func(tool):
		selected = tool
		house_log_source = Vector2i(999, 999)
		ui.collapsed = false
		ui.describe("pickupHelp" if tool == "remove" else "placementHelp", {} if tool == "remove" else {"item": tool})
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
	chicken_carry = preload("res://scripts/chicken_carry.gd").new()
	chicken_carry.world = self
	rebuild_decorations()
	construction.resume_build()
	refresh()
	game_camera = Camera2D.new()
	game_camera.position = pawn_view_center()
	game_camera.zoom = Vector2.ONE * DEFAULT_ZOOM
	add_child(game_camera)
	load_camera_view()
	if playground_enabled:
		playground = preload("res://scripts/playground.gd").new()
		playground.world = self
		add_child(playground)
	if island_start_enabled:
		arrival = preload("res://scripts/island_arrival.gd").new()
		arrival.world = self
		add_child(arrival)
	get_window().mouse_exited.connect(func():
		if world_dragging:
			save_camera_view()
		world_pointer_down = null
		world_dragging = false)

func house_placement_active() -> bool:
	return not editing and construction != null and construction.is_placing()

func refresh() -> void:
	if arrival == null or not arrival.blocks_gameplay():
		pawn.visible = not editing
	$Clouds.visible = not editing
	$PassingCloud.inventory_hidden = editing
	inventory_preview_inputs.clear()
	update_cursor()
	terrain.editing = editing or house_placement_active()
	terrain.tool = "house" if house_placement_active() else selected
	terrain.valid = false
	ui.refresh(editing, selected, not history.is_empty())

func apply_study_level(claimed_level: int) -> void:
	if arrival != null and arrival.blocks_gameplay():
		return
	if (study_claims_authoritative or not playground_manual_progression) and layout.level < claimed_level:
		unlock_level(layout.level + 1)

func unlock_level_two() -> void:
	unlock_level(2)

func unlock_level(target_level: int) -> void:
	if arrival != null and arrival.blocks_gameplay():
		return
	if pending_unlock_level > 0:
		return
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
	pending_unlock_level = target_level
	save_unlocked_level()

func save_unlocked_level() -> void:
	save_layout()
	complete_level_unlock(pending_unlock_level, true)

func complete_level_unlock(saved_level: int, persisted: bool) -> void:
	if not persisted or pending_unlock_level == 0 or saved_level != pending_unlock_level:
		return
	var unlocked_level := pending_unlock_level
	pending_unlock_level = 0
	ui.celebrate(unlocked_level)

func toggle_editing() -> void:
	if arrival != null and arrival.blocks_gameplay():
		return
	log_pickup = Vector2i(999, 999)
	log_delivery = Vector2i(999, 999)
	editing = not editing
	harvesting.set_inventory_open(editing)
	if not editing:
		house_log_source = Vector2i(999, 999)
		if house_placement_active():
			selected = "house"
	if editing:
		if not preserve_history_on_reopen:
			history.clear()
		preserve_history_on_reopen = false
		selected = ""
	refresh()
	update_inventory_preview(get_global_mouse_position(), false)

func begin_pawn_action(excluded_cells: Array = []) -> bool:
	return chicken_carry == null or chicken_carry.put_down(excluded_cells)

func _process(_delta: float) -> void:
	if terrain == null:
		return
	if arrival != null and arrival.blocks_gameplay():
		update_cursor()
		return
	chicken_carry.advance(Time.get_unix_time_from_system())
	if log_pickup != Vector2i(999, 999) and waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
		if not editing and water_phase == WaterPhase.READY and layout.can_pick_log(log_pickup) and begin_pawn_action() and layout.pick_log(log_pickup):
			history.clear()
			rebuild_decorations()
			save_layout()
		log_pickup = Vector2i(999, 999)
	pawn.carrying_wood = (layout.carried_wood > 0 or layout.house_bundle > 0) and not pawn.axe_equipped and not pawn.hammering
	if log_delivery != Vector2i(999, 999) and waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
		var delivered := not editing and water_phase == WaterPhase.READY and layout.can_drop_logs(log_delivery) and begin_pawn_action([log_delivery]) and layout.drop_logs(log_delivery)
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
func update_inventory_layout_revision() -> void:
	# Layout records are also changed by construction, harvesting and restore.
	# Compare their rule inputs instead of relying on every writer to emit a signal.
	# Copy only on change; active timer values and animal subpixel movement do not
	# alter the terrain rules. This inexpensive comparison replaces the full scan.
	var inputs: Array = [layout, layout.level, layout.cells, layout.elevations,
		layout.stair_directions, layout.manual_ground_elevation, layout.trees,
		layout.tree_types, layout.tree_stumps.keys(), layout.tree_cut_remaining.keys(),
		layout.houses, layout.house_offsets, layout.log_piles, layout.stock,
		layout.resources.wood, layout.carried_wood, layout.house_bundle, layout.free_house_grass,
		layout.playground_grants, layout.bridges_enabled, layout.bridges,
		layout.next_tree_variant, layout.flora, layout.decorations]
	if inputs != inventory_layout_inputs:
		inventory_layout_inputs = inputs.duplicate(true)
		inventory_layout_revision += 1

func inventory_occupied_cells() -> Array:
	var occupied: Array = []
	for positions in [layout.chickens, layout.sheep]:
		var cells: Array[Vector2i] = []
		for position in positions:
			cells.append(layout.cell_at(position))
		occupied.append(cells)
	return occupied

func inventory_changes() -> Array[Dictionary]:
	if not editing or selected != "" or ui.collapsed or ui.celebration != null:
		return []
	update_inventory_layout_revision()
	var inputs: Array = [inventory_layout_revision, layout.cell_at(pawn.position),
		pawn.position if not layout.houses.is_empty() else Vector2.ZERO, inventory_occupied_cells()]
	if inputs != inventory_change_inputs:
		cached_inventory_changes = build_inventory_changes()
		inventory_change_inputs = inputs
	return cached_inventory_changes

func build_inventory_changes() -> Array[Dictionary]:
	var changes: Array[Dictionary] = []
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
			# A covered grass top cannot be selected by clicking its outline.
			if layout.ground_surface_cell(layout.ground_surface_rect(cell).get_center()) != cell:
				continue
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
	# Ground outlines and clicks use the same visible grass top.
	var cell: Vector2i = layout.ground_surface_cell(point)
	for change in changes:
		if change.tool == "ground" and change.cell == cell:
			return change
	return {}

func update_inventory_preview(point: Vector2, allow_hover := true) -> void:
	var inputs := inventory_preview_key(point, allow_hover)
	if inputs == inventory_preview_inputs:
		return
	update_inventory_preview_state(point, allow_hover)
	var change := {"cell": terrain.hover, "tool": terrain.tool, "height": terrain.ground_preview_height} if terrain.transform_preview and terrain.tool in ["ground", "stairs"] else {}
	if terrain.tool == "house" and terrain.proposed_terrain != null:
		change = {"tool": "house", "cells": terrain.proposed_terrain.cells.duplicate(), "elevations": terrain.proposed_terrain.elevations.duplicate()}
	if change != terrain_preview_change:
		rebuild_decorations(terrain.terrain_render_layout())
		terrain_preview_change = change
		if change.is_empty():
			# Rebuilding restored object sprites; apply tree/house hiding to
			# those new nodes when moving directly off a terrain preview.
			update_inventory_preview_state(point, allow_hover)
	# Terrain previews can rebuild the artwork. Capture the resulting generation
	# so the new nodes stay hidden correctly without repeating the rebuild next frame.
	inventory_preview_inputs = inventory_preview_key(point, allow_hover).duplicate(true)

func inventory_preview_key(point: Vector2, allow_hover: bool) -> Array:
	var inputs: Array = [editing, house_placement_active(), selected, allow_hover, water_phase, ui.collapsed,
		ui.celebration != null, construction.busy(), inventory_art_revision]
	if not editing and not house_placement_active():
		return inputs
	update_inventory_layout_revision()
	inputs.append(inventory_layout_revision)
	inputs.append(pawn.position)
	inputs.append(inventory_occupied_cells())
	if allow_hover:
		inputs.append(point)
		inputs.append(get_viewport().get_canvas_transform())
		if selected in ["remove", "chicken", "sheep", "house"]:
			inputs.append(layout.chickens)
			inputs.append(layout.sheep)
		# A fixed pointer can cross the opaque silhouette as tree animation changes.
		if selected in ["", "tree", "remove"]:
			for tree in tree_nodes:
				inputs.append(tree.frame)
				inputs.append(tree.bend_angle)
	return inputs

func update_inventory_preview_state(point: Vector2, allow_hover := true) -> void:
	terrain.proposed_terrain = null
	terrain.changes = inventory_changes()
	terrain.outline_trees = tree_nodes
	terrain.transform_preview = false
	var tool := "house" if house_placement_active() else selected
	terrain.tool = tool
	terrain.valid = false
	terrain.ground_preview_height = -1
	# Restore any artwork hidden by the previous frame's swap preview.
	for sprite in tree_nodes:
		sprite.visible = true
	for sprite in asset_nodes:
		if sprite.has_meta("house_cell"):
			sprite.visible = true
	if (not editing and not house_placement_active()) or not allow_hover:
		return
	terrain.preview_position = point
	var change := inventory_change_at(point, terrain.changes) if tool != "remove" and layout.house_bundle == 0 else {}
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
	if tool == "":
		return
	if tool == "bridge":
		terrain.hover = bridge_placement_at(point)
	elif tool == "ground":
		var option := ground_placement_at(point)
		terrain.hover = option.cell
		terrain.ground_preview_height = option.height
	else:
		terrain.hover = clicked_cell(point)
	terrain.valid = (tool != "ground" or terrain.ground_preview_height >= 0) and layout.can_edit(terrain.hover, tool, layout.cell_at(pawn.position), terrain.ground_preview_height, Vector2.ZERO, pawn.position, terrain.placement_offset() if tool == "house" else Vector2.ZERO)
	if tool == "house":
		update_house_preview()
	if tool == "tree":
		update_tree_preview(point)

signal page_focus_requested

func _input(event: InputEvent) -> void:
	if handle_camera_touch(event):
		get_viewport().set_input_as_handled()
		return
	if pinch_gesture and event is InputEventMouse and event.device == InputEvent.DEVICE_ID_EMULATION:
		get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE and ui.celebration == null:
		if construction.cancel_placement():
			get_viewport().set_input_as_handled()
			return
		if editing:
			toggle_editing()
			get_viewport().set_input_as_handled()
			return
		page_focus_requested.emit()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseMotion:
		# Web canvases can be hovered without keyboard focus (including Edenia's
		# iframe). Native inactive windows still belong to the system pointer.
		if OS.has_feature("web"):
			pointer_focused = true
		pointer_inside = get_viewport().get_visible_rect().has_point(event.position)
		pointer_position = event.position

	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		set_cursor_pressed(false)
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
		if not world_dragging:
			handle_world_click(click)
		world_dragging = false
		get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if pinch_gesture and event is InputEventMouse and event.device == InputEvent.DEVICE_ID_EMULATION:
		return
	if arrival != null and arrival.blocks_gameplay():
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and ui.celebration == null:
		# Defer world clicks until release, after distinguishing a click from a pan.
		# Godot GUI controls consume their own presses before this handler.
		world_pointer_down = event
		world_drag_origin = game_camera.position
		world_dragging = false
		var point: Vector2 = get_global_transform_with_canvas().affine_inverse() * event.position
		if not editing and not house_placement_active() and water_phase in [WaterPhase.READY, WaterPhase.APPROACHING] and layout.cells.has(clicked_cell(point)) and not layout.bridges.has(Layout.BridgeRules.hit(layout, point)):
			set_cursor_pressed(true)
		get_viewport().set_input_as_handled()
		return
	handle_world_click(event)


# Keep pinch interpretation in Godot so native and embedded games share it.
# A completed pinch suppresses its emulated mouse release until a new touch.
func handle_camera_touch(event: InputEvent) -> bool:
	if event is InputEventScreenTouch:
		touch_device = true
		pointer.hide()
		if event.pressed:
			if camera_touches.is_empty():
				pinch_gesture = false
			camera_touches[event.index] = event.position
		else:
			camera_touches.erase(event.index)
			if pinch_gesture and camera_touches.is_empty():
				save_camera_view()
	elif event is InputEventScreenDrag:
		if not camera_touches.has(event.index):
			return false
		camera_touches[event.index] = event.position
	else:
		return false
	if camera_touches.size() == 2:
		var points := camera_touches.values()
		var distance: float = points[0].distance_to(points[1])
		if pinch_distance > 0.0 and event is InputEventScreenDrag:
			game_camera.zoom = Vector2.ONE * clampf(game_camera.zoom.x * distance / pinch_distance, preload("res://scripts/cloud_visual.gd").MIN_VIEW_ZOOM, max_camera_zoom())
		pinch_distance = distance
		pinch_gesture = true
		world_pointer_down = null
		world_dragging = false
		set_cursor_pressed(false, true)
	else:
		pinch_distance = 0.0
	return pinch_gesture

func pawn_view_center() -> Vector2:
	return pawn.position + Vector2(0, -32.0 - ground_height(pawn.position))

func max_camera_zoom() -> float:
	return MAX_TOUCH_ZOOM if touch_device else MAX_MOUSE_ZOOM

func camera_command(command: String) -> void:
	if touch_device and command in ["in", "out"]:
		return
	match command:
		"in": game_camera.zoom = Vector2.ONE * minf(max_camera_zoom(), game_camera.zoom.x + 0.1)
		"out": game_camera.zoom = Vector2.ONE * maxf(preload("res://scripts/cloud_visual.gd").MIN_VIEW_ZOOM, game_camera.zoom.x - 0.1)
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
	game_camera.zoom = Vector2.ONE * clampf(float(data.zoom), preload("res://scripts/cloud_visual.gd").MIN_VIEW_ZOOM, max_camera_zoom())

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
	if house_placement_active() and layout.houses.has(terrain.hover):
		terrain.valid = false
		return
	if terrain.valid and not layout.houses.has(terrain.hover):
		if layout.house_bundle > 0:
			var plan: Dictionary = construction.placement_plan(terrain.hover, terrain.placement_offset())
			terrain.valid = not plan.is_empty()
		if terrain.valid:
			# Render the real foundation, including its joins with existing grass.
			# The held house stays in the editor overlay until construction starts.
			terrain.proposed_terrain = layout.get_script().new()
			terrain.proposed_terrain.restore(layout.snapshot())
			terrain.proposed_terrain.add_house_foundation(terrain.hover, terrain.placement_offset())

func update_cursor() -> void:
	if pointer == null:
		return
	fit_build_cursor()
	var placing_house := house_placement_active()
	var mode := "walk" if not editing and not placing_house else (("build" if selected == "remove" else "place") if terrain.valid else ("ui" if selected == "" else "invalid"))
	if editing and selected == "":
		mode = "ui"
	if not editing and not placing_house and water_phase == WaterPhase.READY and ui.celebration == null and harvesting != null and harvesting.available(tree_at(get_global_mouse_position())):
		mode = "axe"
	if not editing and not placing_house and water_phase == WaterPhase.READY and ui.celebration == null and layout.can_pick_log(log_at(get_global_mouse_position())):
		mode = "ui"
	if not editing and not placing_house and water_phase == WaterPhase.READY and ui.celebration == null and layout.level >= 5 and int(layout.log_piles.get(log_at(get_global_mouse_position()), 0)) == 6:
		mode = "house"
	var hovered := get_viewport().gui_get_hovered_control()
	if arrival != null and arrival.blocks_gameplay():
		mode = "ui"
	if hovered != null and (hovered == ui.root or ui.root.is_ancestor_of(hovered)):
		mode = "invalid" if hovered is BaseButton and hovered.disabled else "ui"
	if mode != cursor_mode:
		set_cursor_pressed(false, true)
		cursor_mode = mode
		pointer.texture = HOUSE_CURSOR if mode == "house" else AXE_CURSOR if mode == "axe" else UI_CURSOR if mode == "ui" or mode == "place" else (CURSOR if mode == "walk" else (build_cursor if mode == "build" else INVALID_CURSOR))
		pointer.material = cursor_press_material if mode == "walk" else null
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
	pointer.visible = pointer_inside and pointer_focused and not touch_device

func set_cursor_pressed(pressed: bool, immediate: bool = false) -> void:
	if cursor_press_material == null or (pressed and cursor_mode != "walk"):
		return
	if cursor_press_tween != null:
		cursor_press_tween.kill()
	if immediate:
		cursor_press_material.set_shader_parameter("press", 0.0)
		return
	var current := float(cursor_press_material.get_shader_parameter("press"))
	var target := 1.0 if pressed else 0.0
	if is_equal_approx(current, target):
		return
	cursor_press_tween = create_tween()
	# Mouse-down settles into this pose; only release starts the return tween.
	cursor_press_tween.tween_method(func(value: float): cursor_press_material.set_shader_parameter("press", value), current, target, 0.055 if pressed else 0.125).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT if pressed else Tween.EASE_IN_OUT)

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
		# Walking may target ground behind the canopy; inventory edits target
		# the visible tree artwork instead.
		if not editing and behind.has_point(point) and layout.walkable_point(point + Vector2(0, layout.height_at(cell))):
			continue
		if sprite.is_visual_pixel_opaque(sprite.to_local(point)):
			return cell
	return Harvesting.NO_TREE

func clicked_cell(point: Vector2) -> Vector2i:
	if editing and selected in ["tree", "remove"]:
		for index in range(tree_nodes.size() - 1, -1, -1):
			var sprite := tree_nodes[index] as Sprite2D
			if sprite.is_visual_pixel_opaque(sprite.to_local(point)):
				return sprite.get_meta("cell")
	if house_placement_active() or (editing and selected in ["house", "sheep", "chicken", "remove"]):
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
	terrain.valid = can_place_tree(terrain.hover, offset)

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
	if arrival != null and arrival.blocks_gameplay():
		return
	if ui == null or ui.celebration != null or (not editing and water_phase not in [WaterPhase.READY, WaterPhase.APPROACHING]):
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var point: Vector2 = get_global_transform_with_canvas().affine_inverse() * event.position
		var change := inventory_change_at(point, inventory_changes()) if editing and selected != "remove" and layout.house_bundle == 0 else {}
		var cell: Vector2i = change.cell if not change.is_empty() else clicked_cell(point)
		if (not editing or (selected == "house" and water_phase == WaterPhase.READY and not construction.busy())) and construction.handle_click(cell, point):
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
				if not route.is_empty() and route.back().is_equal_approx(destination) and begin_pawn_action():
					walk_on_land(pile, destination)
					log_pickup = pile
				return
			if layout.can_drop_logs(cell):
				var destination: Vector2 = layout.center(cell)
				var delivery_route := land_route(pawn.position, cell, destination)
				if not delivery_route.is_empty() and delivery_route.back().is_equal_approx(destination) and begin_pawn_action([cell]):
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
	if selected == "tree" and not can_place_tree(cell, tree_placement_offset):
		return false
	var before: Dictionary = layout.snapshot()
	var picked_cells: Array[Vector2i] = []
	if selected == "remove":
		picked_cells = layout.pickup_cells(cell)
	if not layout.edit(cell, selected, layout.cell_at(pawn.position), ground_height, tree_placement_offset, house_log_source, pawn.position, terrain.placement_offset() if selected == "house" and not layout.houses.has(cell) else Vector2.ZERO):
		ui.describe("pickupUnavailable" if selected == "remove" else "spotUnavailable")
		return false
	reconcile_inventory_work()
	if selected == "remove":
		relocate_pawn_after_pickup(picked_cells)
	history.append(before)
	if history.size() > 40:
		history.pop_front()
	rebuild_decorations()
	if selected == "house":
		animate_house_displacements()
	save_layout()
	if editing and selected not in ["remove", "ground", "tree", "house", "stairs"] and layout.ground_count() + layout.stock.stairs + layout.stock.tree + (layout.stock.bridge if layout.bridges_enabled else 0) == 0:
		editing = false
		preserve_history_on_reopen = true
	refresh()
	return true

func relocate_pawn_after_pickup(picked_cells: Array[Vector2i]) -> void:
	# An ongoing fall already resolves its respawn against the edited layout.
	if water_phase not in [WaterPhase.READY, WaterPhase.APPROACHING]:
		return
	var occupied := layout.cell_at(pawn.position)
	if occupied not in picked_cells and layout.walkable_point(pawn.position):
		return
	var destination := Vector2.INF
	var distance := INF
	# Prefer surviving ground outside the collected object's footprint. A
	# house refund can leave logs on the pawn's tile, so check actual contacts.
	for allow_picked in [false, true]:
		for cell in layout.cells:
			if layout.cells[cell] == "stairs" or (not allow_picked and cell in picked_cells):
				continue
			for offset in [Vector2.ZERO, Vector2(0, -20), Vector2(-20, 0), Vector2(20, 0), Vector2(0, 20)]:
				var point: Vector2 = layout.center(cell) + offset
				if point.is_equal_approx(pawn.position) or not layout.walkable_point(point):
					continue
				var separation: float = pawn.position.distance_squared_to(point)
				if separation < distance:
					distance = separation
					destination = point
		if destination != Vector2.INF:
			break
	if destination == Vector2.INF:
		return
	harvesting.cancel()
	movement_generation += 1
	water_phase = WaterPhase.READY
	waypoints.clear()
	walking_bridges.clear()
	pawn.position = destination
	pawn.walk_to(destination)
	pawn.sprite.position.y = -32.0 - ground_height(destination)
	pawn.z_index = int(ceil(ground_height(destination) / 64.0))

func undo() -> void:
	if not editing or history.is_empty():
		return
	layout.restore(history.pop_back())
	reconcile_inventory_work()
	if water_phase == WaterPhase.READY and not layout.cells.has(layout.cell_at(pawn.position)):
		pawn.position = layout.center(layout.spawn_cell())
		pawn.walk_to(pawn.position)
	rebuild_decorations()
	save_layout()
	refresh()

func reconcile_inventory_work() -> void:
	# Edits elsewhere preserve work. Removing or undoing its target ends it.
	if harvesting.phase != harvesting.Phase.READY and (not harvesting.available(harvesting.target) or (harvesting.phase == harvesting.Phase.CUTTING and not layout.tree_cut_remaining.has(harvesting.target))):
		harvesting.cancel()
	construction.reconcile_inventory_edit()

func animate_house_displacements() -> void:
	for displaced in layout.house_displacements:
		for node in asset_nodes:
			if not node.has_method("animal_positions") or node.is_queued_for_deletion():
				continue
			var kind := "chicken" if node.get_script() == preload("res://scripts/chicken_visual.gd") else "sheep"
			if kind == displaced.kind and node.sheep_index == displaced.index:
				node.position = displaced.start
				node.escape_route.assign(displaced.route)
				node.tile_destinations.assign([displaced.route.back()])
				node.destination = node.escape_route[0]
				node.house_fleeing = true
				node.fleeing = true
				node.reset_grazing()
				node.face_destination()
	layout.house_displacements.clear()

func rebuild_decorations(display_layout = null) -> void:
	if $World.get_script() == null:
		$World.set_script(preload("res://scripts/terrain_depth.gd"))
		$World.set_process(true)
		$World.process_priority = 100 # Sort after actor animations and movement.
	inventory_art_revision += 1
	inventory_preview_inputs.clear()
	var render_layout = display_layout if display_layout != null else layout
	if display_layout == null:
		terrain_preview_change = {}
	for node in get_children():
		if node.has_meta("terrain_shadow") or node.has_meta("terrain_backing"):
			remove_child(node)
			node.queue_free()
	var shadow_heights: Dictionary = {}
	for cell in render_layout.cells:
		var casting_height: float = render_layout.height_at(cell) + (64 if render_layout.cells[cell] == "stairs" else 0)
		for height in range(64, int(casting_height) + 1, 64):
			shadow_heights[float(height)] = true
	for height in shadow_heights:
		if height > 64:
			var backing := TerrainView.new()
			backing.layout = render_layout
			backing.render_source = terrain
			backing.backing_height = height - 64
			backing.z_index = int(height / 64.0) - 2
			backing.set_meta("terrain_backing", true)
			add_child(backing)
		var shadows := TerrainView.new()
		shadows.layout = render_layout
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
	for cell in render_layout.cells:
		if render_layout.height_at(cell) > 0 or render_layout.cells[cell] == "stairs":
			var surface := TerrainView.new()
			surface.layout = render_layout
			surface.render_source = terrain
			surface.piece = cell
			surface.z_index = maxi(0, int(render_layout.height_at(cell) / 64.0) - (0 if render_layout.cells[cell] == "stairs" else 1))
			# Solid cliffs cover lower-floor actors behind their near edge.
			# TerrainDepth compares each actor with the ramp's sloped edge.
			surface.position = render_layout.ORIGIN + Vector2(cell) * 64 + Vector2(0, 64)
			surface.set_meta("terrain_occluder", true)
			$World.add_child(surface)
	for start in (render_layout.bridges if render_layout.bridges_enabled else {}):
		var bridge := Sprite2D.new()
		bridge.texture = Layout.BridgeRules.TEXTURE
		bridge.centered = false
		bridge.position = Layout.BridgeRules.art_rect(render_layout, start).position
		bridge.z_index = int(render_layout.bridges[start] / 64.0) - 1
		bridge.set_meta("terrain_occluder", true)
		$World.add_child(bridge)
	for rock in $WaterRocks.get_children():
		rock.visible = true
		for cell in render_layout.cells:
			var height: float = render_layout.height_at(cell) + 64.0 if render_layout.cells[cell] == "stairs" else render_layout.height_at(cell)
			var occupied_area := Rect2(render_layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, height), Vector2(64, 64 + height))
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
		node.visible = render_layout.flora.get(pair[1], 0) == pair[2]
		node.offset.y = -15 - render_layout.height_at(pair[1]) / node.scale.y
		node.z_index = int(render_layout.height_at(pair[1]) / 64.0)
	for cell in render_layout.flora:
		if {Vector2i(0, 0): 1, Vector2i(1, 1): 2}.get(cell) == render_layout.flora[cell]:
			continue
		var plant := Sprite2D.new()
		plant.texture = preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Bushes/Bushe1.png") if render_layout.flora[cell] == 1 else preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Bushes/Bushe4.png")
		plant.hframes = 8
		plant.scale = Vector2.ONE * 0.75
		plant.z_index = int(render_layout.height_at(cell) / 64.0)
		plant.position = render_layout.center(cell) + Vector2(0, 12)
		plant.offset = Vector2(0, -15 - render_layout.height_at(cell) / 0.75)
		plant.set_script(preload("res://scripts/environment_sprite.gd"))
		$World.add_child(plant)
		flora_nodes.append(plant)
	for cell in render_layout.decorations:
		var item: Dictionary = render_layout.decorations[cell]
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
				decoration.scale = Vector2.ONE * 0.8
				decoration.flip_h = item.variant == 2
		decoration.position = render_layout.center(item.water if in_water else cell)
		if item.kind == "land_rock":
			# Sort from the near edge like foliage, without moving the artwork.
			decoration.position.y += 12
			decoration.offset.y -= 12 / decoration.scale.y
		decoration.z_index = -17 if in_water else int(render_layout.height_at(cell) / 64.0)
		if not in_water:
			decoration.offset.y -= render_layout.height_at(cell) / decoration.scale.y
		if decoration.hframes > 1:
			decoration.set_script(preload("res://scripts/environment_sprite.gd"))
			decoration.phase = float(cell.x * 7 + cell.y * 11) / 5.0
		decoration.set_meta("random_decoration", item.kind)
		$World.add_child(decoration)
		flora_nodes.append(decoration)
	for cell in render_layout.log_piles:
		var pile := Node2D.new()
		# Keep the whole pile together while its depth follows the contact patch.
		pile.set_script(preload("res://scripts/log_pile.gd"))
		pile.layout = render_layout
		pile.cell = cell
		pile.pawn = pawn
		pile.position = render_layout.center(cell) + Vector2(0, 12)
		pile.y_sort_enabled = false
		pile.set_meta("log_pile", cell)
		pile.z_index = int(render_layout.height_at(cell) / 64.0)
		# Bottom row fills first, then the middle row, then the apex.
		var positions := [Vector2(-13, 0), Vector2(0, 0), Vector2(13, 0), Vector2(-6.5, -14), Vector2(6.5, -14), Vector2(0, -28)]
		# Center incomplete bottom rows, including the two-log harvest.
		if render_layout.log_piles[cell] == 1:
			positions[0] = Vector2.ZERO
		elif render_layout.log_piles[cell] == 2:
			positions[0] = Vector2(-6.5, 0)
			positions[1] = Vector2(6.5, 0)
		var ground_shadow := Node2D.new()
		# Ground shadows sort before every pawn position on this grass tile.
		ground_shadow.position = render_layout.center(cell) - Vector2(0, 32)
		ground_shadow.z_index = pile.z_index
		ground_shadow.set_meta("log_shadow", cell)
		var shadow_material := ShaderMaterial.new()
		shadow_material.shader = LOG_SHADOW_SHADER
		var height: float = render_layout.height_at(cell)
		var grass_region: Rect2 = terrain.ground_region(cell, "meadow" if height == 0 else render_layout.kind_at_height(height))
		shadow_material.set_shader_parameter("grass_atlas", terrain.floor_texture(height))
		shadow_material.set_shader_parameter("grass_region", Vector4(grass_region.position.x, grass_region.position.y, 64, 64))
		var local_from_world := global_transform.affine_inverse()
		shadow_material.set_shader_parameter("ground_axes", Vector4(local_from_world.x.x, local_from_world.y.x, local_from_world.x.y, local_from_world.y.y))
		shadow_material.set_shader_parameter("ground_origin", local_from_world.origin - (render_layout.center(cell) - Vector2(32, 32 + height)))
		# Render the union once so intersecting log silhouettes never darken.
		var shadow_centers := PackedVector2Array()
		for index in int(render_layout.log_piles[cell]):
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
			if index >= int(render_layout.log_piles[cell]):
				continue
			var log_sprite := Sprite2D.new()
			log_sprite.texture = LOG_TEXTURE
			log_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			log_sprite.scale = Vector2.ONE * 0.9
			log_sprite.position = positions[index] - Vector2(0, 6 + render_layout.height_at(cell))
			pile.add_child(log_sprite)
		$World.add_child(pile)
		flora_nodes.append(pile)
	for cell in render_layout.houses:
		var house := Sprite2D.new()
		var facing: int = render_layout.houses[cell]
		house.texture = LevelFiveArt.HOUSE_TEXTURES[facing]
		house.flip_h = facing == 3
		house.scale = Vector2.ONE
		house.position = Vector2(render_layout.center(cell).x + 32 + render_layout.house_offsets.get(cell, Vector2.ZERO).x, LevelFiveArt.house_depth_y(render_layout, cell, facing))
		# Move the sorting anchor without moving the house artwork.
		house.offset = Vector2(0, render_layout.center(cell).y + render_layout.house_offsets.get(cell, Vector2.ZERO).y - house.position.y - render_layout.height_at(cell))
		house.set_meta("house_cell", cell)
		house.z_index = int(render_layout.height_at(cell) / 64)
		$World.add_child(house)
		asset_nodes.append(house)
	for chicken_index in render_layout.chickens.size():
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
	for index in render_layout.sheep.size():
		var sheep_sprite := Sprite2D.new()
		sheep_sprite.set_script(preload("res://scripts/sheep_visual.gd"))
		sheep_sprite.world = self
		sheep_sprite.sheep_index = index
		$World.add_child(sheep_sprite)
		asset_nodes.append(sheep_sprite)
	for cell in render_layout.trees:
		var tree := Sprite2D.new()
		var kind: String = render_layout.tree_types.get(cell, "tree")
		var stump: bool = render_layout.tree_stumps.has(cell)
		tree.texture = TreeArt.texture_at(render_layout.tree_offset(cell), kind, stump, TreeArt.shadow_ground(render_layout, cell))
		tree.set_meta("cell", cell)
		tree.hframes = 1 if stump else 8
		tree.scale = Vector2.ONE * TreeArt.SCALE
		tree.z_index = int(render_layout.height_at(cell) / 64.0)
		tree.position = render_layout.tree_position(cell)
		tree.offset = (TreeArt.stump_offset(kind) if stump else TreeArt.art_offset(kind)) - Vector2(0, render_layout.height_at(cell) / TreeArt.SCALE)
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

func tree_navigation_path(start: Vector2, target: Vector2, allowed_cells: Array[Vector2i] = [], moving_sheep: bool = false, alternative_targets: Array[Vector2] = []) -> Array[Vector2]:
	var result: Array[Vector2] = []
	var targets: Array[Vector2] = []
	for point in [target] + alternative_targets:
		if layout.walkable_point(point, moving_sheep):
			targets.append(point)
	if targets.is_empty():
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
		for point in targets:
			if current_point.distance_squared_to(point) <= 144 and clear_segment(current_point, point, moving_sheep):
				while current != source:
					result.push_front(Layout.ORIGIN + Vector2(current) * 8)
					current = previous[current]
				result.append(point)
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
	return terrain_clear_segment(start, end, moving_sheep)

func terrain_clear_segment(start: Vector2, end: Vector2, moving_animal: bool = false) -> bool:
	var samples := maxi(1, ceili(start.distance_to(end) / 4.0))
	var previous: Vector2i = layout.cell_at(start)
	for i in range(samples + 1):
		var point := start.lerp(end, float(i) / samples)
		var current: Vector2i = layout.cell_at(point)
		if current != previous and not layout.can_cross(previous, current):
			return false
		previous = current
		if not layout.terrain_feet_free(point, moving_animal):
			return false
	return true

func ground_height(point: Vector2) -> float:
	var cell: Vector2i = layout.cell_at(point)
	for bridge in walking_bridges:
		if layout.bridges_enabled and layout.bridges.has(bridge) and cell in [bridge, bridge + Vector2i.RIGHT] and absf(point.y - layout.center(bridge).y) <= 7:
			return Layout.BridgeRules.height(layout, bridge, point.x)
	return layout.surface_height(point)

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


func respawn_location(spawn: Vector2, _spawn_height: float) -> Dictionary:
	# Inventory edits can remove, raise, or occupy the chosen tile during a fall.
	var cell: Vector2i = layout.cell_at(spawn)
	if not layout.cells.has(cell) or layout.cells[cell] == "stairs" or layout.trees.has(cell) or layout.house_owner(cell) != Vector2i(999, 999):
		cell = layout.random_respawn_cell()
	return {"position": layout.center(cell), "height": layout.height_at(cell)}

func saved_snapshot() -> Dictionary:
	var data: Dictionary = layout.snapshot()
	data["island_started"] = island_started if island_start_enabled else true
	if playground_manual_progression:
		data["playground_manual_progression"] = true
	var saved: Dictionary = playground.checkpoint_snapshot() if playground != null else saved_playground_checkpoint
	if not saved.is_empty():
		data["playground_checkpoint"] = saved
	return data

func save_layout(_animal_checkpoint: bool = false) -> void:
	if not preview_save_enabled:
		return
	var json := JSON.stringify(saved_snapshot())
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
			restore_saved_layout(data)

func restore_saved_layout(data: Dictionary, restore_checkpoint: bool = true) -> bool:
	# Saves predating the arrival sequence already contain a playable island.
	if not data.get("island_started", true) is bool:
		return false
	if not layout.restore(data):
		return false
	island_started = data.get("island_started", true)
	playground_manual_progression = playground_enabled and data.get("playground_manual_progression", false) == true
	if restore_checkpoint:
		var saved = data.get("playground_checkpoint", {})
		saved_playground_checkpoint = saved.duplicate(true) if saved is Dictionary else {}
		if playground != null:
			playground.load_checkpoint(saved_playground_checkpoint)
	# Native startup initializes actors below load_layout; an integrated frame
	# receives its profile snapshot after those same actors are ready.
	if construction != null:
		rebuild_decorations()
		pawn.position = layout.center(layout.spawn_cell())
		pawn.walk_to(pawn.position)
		if layout.house_bundle > 0:
			construction.open_placement()
		construction.resume_build()
		refresh()
		if arrival != null:
			arrival.restore()
	return true

func _exit_tree() -> void:
	if harvesting != null:
		harvesting.cancel()
	save_camera_view()
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	super._exit_tree()
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_FORBIDDEN)
