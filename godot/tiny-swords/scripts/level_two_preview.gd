extends "res://scripts/level_one.gd"

const Layout = preload("res://scripts/terrain_layout.gd")
const TerrainView = preload("res://scripts/terrain_view.gd")
const BuilderUI = preload("res://scripts/builder_ui.gd")
const UI_CURSOR := preload("res://art/builder/Cursor_01.png")
const INVALID_CURSOR := preload("res://art/builder/Cursor_03.png")
const BUILD_CURSOR := preload("res://art/builder/Cursor_04.png")
const SAVE_KEY := "edenia_tiny_swords_builder_preview_v1"
var layout = Layout.new()
var terrain
var ui
var editing := false
var selected := "meadow"
var history: Array[Dictionary] = []
var waypoints: Array[Vector2] = []
var tree_nodes: Array[Node] = []
var preview_save_enabled := true
var build_cursor: Texture2D
var grid_cursor: Node2D
var cursor_mode := ""

func _ready() -> void:
	super._ready()
	# Cursor 04 is drawn in world space so its corners match the tile at any zoom.
	var cursor_image := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	cursor_image.fill(Color.TRANSPARENT)
	build_cursor = ImageTexture.create_from_image(cursor_image)
	grid_cursor = Node2D.new()
	# Keep each original corner at 1:1 scale; only remove the empty gap between
	# quadrants, matching the stretchable cursor shown in the pack's UI demo.
	for y in range(2):
		for x in range(2):
			var corner := Sprite2D.new()
			var atlas := AtlasTexture.new()
			atlas.atlas = BUILD_CURSOR
			atlas.region = Rect2(x * 96, y * 96, 32, 32)
			corner.texture = atlas
			corner.centered = false
			corner.position = Vector2(x * 32 - 32, y * 32 - 32)
			grid_cursor.add_child(corner)
	grid_cursor.z_index = 15
	grid_cursor.hide()
	add_child(grid_cursor)
	for name in ["Islands", "IslandShadows", "ShoreFoam"]:
		get_node(name).hide()
	if preview_save_enabled:
		load_layout()
	terrain = TerrainView.new()
	terrain.layout = layout
	terrain.z_index = -16
	add_child(terrain)
	move_child(terrain, $World.get_index())
	ui = BuilderUI.new()
	ui.layout = layout
	add_child(ui)
	ui.unlock_requested.connect(unlock_level_two)
	ui.edit_toggled.connect(toggle_editing)
	ui.tool_selected.connect(func(tool):
		selected = tool
		ui.collapsed = true
		ui.status.text = "Pick up tree first, then ground." if tool == "remove" else "Choose a square for " + BuilderUI.NAMES[tool] + "."
		refresh())
	ui.undo_requested.connect(undo)
	pawn.position = layout.center(Layout.HOME)
	pawn.walk_to(pawn.position)
	rebuild_decorations()
	refresh()

func refresh() -> void:
	Input.set_custom_mouse_cursor(UI_CURSOR, Input.CURSOR_POINTING_HAND, Vector2(24, 18))
	Input.set_custom_mouse_cursor(INVALID_CURSOR, Input.CURSOR_FORBIDDEN, Vector2(24, 18))
	update_cursor()
	terrain.editing = editing
	terrain.tool = selected
	ui.refresh(editing, selected, not history.is_empty())

func unlock_level_two() -> void:
	if water_phase != WaterPhase.READY or layout.unlocked:
		return
	waypoints.clear()
	pawn.walk_to(pawn.position)
	layout.unlock()
	save_layout()
	ui.celebrate()

func toggle_editing() -> void:
	if water_phase != WaterPhase.READY:
		return
	editing = not editing
	if editing:
		history.clear()
	waypoints.clear()
	pawn.walk_to(pawn.position)
	refresh()

func _process(_delta: float) -> void:
	if terrain == null:
		return
	ui.launch.disabled = water_phase != WaterPhase.READY
	ui.launch.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if ui.launch.disabled else Control.CURSOR_POINTING_HAND
	if water_phase == WaterPhase.READY or water_phase == WaterPhase.APPROACHING:
		pawn.sprite.position.y = -32.0 - ground_height(pawn.position)
		if not waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
			pawn.walk_to(waypoints.pop_front())
	if editing:
		terrain.hover = clicked_cell(get_global_mouse_position())
		terrain.valid = layout.can_edit(terrain.hover, selected, layout.cell_at(pawn.position))
		grid_cursor.position = layout.center(terrain.hover) - Vector2(0, layout.height_at(terrain.hover))
		grid_cursor.visible = terrain.valid
		update_cursor()
	else:
		grid_cursor.hide()

func update_cursor() -> void:
	var mode := "walk" if not editing else ("build" if terrain.valid else "invalid")
	if mode == cursor_mode:
		return
	cursor_mode = mode
	var texture = CURSOR if mode == "walk" else (build_cursor if mode == "build" else INVALID_CURSOR)
	Input.set_custom_mouse_cursor(texture, Input.CURSOR_ARROW, Vector2.ZERO if mode == "build" else Vector2(24, 18))

func clicked_cell(point: Vector2) -> Vector2i:
	# Raised top faces are selectable where they are drawn, not beneath them.
	for cell in layout.cells:
		if layout.height_at(cell) > 0 and Rect2(layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, 32), Vector2(64, 64)).has_point(point):
			return cell
	return layout.cell_at(point)

func _unhandled_input(event: InputEvent) -> void:
	if ui == null or ui.celebration != null or water_phase != WaterPhase.READY:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var point: Vector2 = get_global_transform_with_canvas().affine_inverse() * event.position
		var cell := clicked_cell(point)
		if editing:
			apply_edit(cell)
		elif layout.cells.has(cell):
			walk_on_land(cell, point + Vector2(0, layout.height_at(cell)))
		else:
			fall_into_water(point)

func apply_edit(cell: Vector2i) -> bool:
	var before: Dictionary = layout.snapshot()
	if not layout.edit(cell, selected, layout.cell_at(pawn.position)):
		ui.status.text = "Keep home and the pawn's tile. Use an empty square." if selected == "remove" else "That spot is unavailable. Try another square."
		return false
	history.append(before)
	if history.size() > 40:
		history.pop_front()
	rebuild_decorations()
	save_layout()
	refresh()
	return true

func undo() -> void:
	if not editing or history.is_empty():
		return
	layout.restore(history.pop_back())
	rebuild_decorations()
	save_layout()
	refresh()

func rebuild_decorations() -> void:
	for node in tree_nodes:
		node.queue_free()
	tree_nodes.clear()
	# Original foliage follows its tile and disappears when that tile is collected.
	for pair in [["MainBush", Vector2i(0, 0)], ["LeafyTuft", Vector2i(1, 1)], ["IsletBush", Vector2i(3, 2)]]:
		var node = $World.get_node(pair[0])
		node.visible = layout.cells.has(pair[1]) and not layout.trees.has(pair[1])
		if pair[0] == "IsletBush":
			node.position = layout.center(pair[1])
	for cell in layout.trees:
		var tree := Sprite2D.new()
		tree.texture = preload("res://art/builder/Tree1.png")
		tree.hframes = 8
		tree.scale = Vector2.ONE * 0.8
		tree.position = layout.center(cell)
		tree.offset = Vector2(0, -112 - layout.height_at(cell) / 0.8)
		tree.set_script(preload("res://scripts/environment_sprite.gd"))
		$World.add_child(tree)
		tree_nodes.append(tree)

func walk_on_land(cell: Vector2i, point: Vector2) -> void:
	var from: Vector2i = layout.cell_at(pawn.position)
	var path: Array[Vector2i] = layout.path(from, cell)
	if layout.trees.has(cell) or (path.is_empty() and from != cell):
		return
	waypoints.clear()
	var candidates: Array[Vector2] = [layout.center(from)]
	for step in path:
		candidates.append(layout.center(step))
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	candidates.append(point.clamp(origin + Vector2(12, 12), origin + Vector2(52, 52)))
	# Keep only necessary bends. Clear stretches can be walked directly, without
	# pulling the pawn back to the center of its current square on every click.
	var start: Vector2 = pawn.position
	while not candidates.is_empty():
		var furthest := 0
		for i in range(candidates.size()):
			if clear_segment(start, candidates[i]):
				furthest = i
		var next: Vector2 = candidates[furthest]
		waypoints.append(next)
		candidates = candidates.slice(furthest + 1)
		start = next
	pawn.walk_to(waypoints.pop_front())

func clear_segment(start: Vector2, end: Vector2) -> bool:
	var samples := maxi(1, ceili(start.distance_to(end) / 4.0))
	for i in range(samples + 1):
		var point := start.lerp(end, float(i) / samples)
		for offset in [Vector2(-7, -7), Vector2(7, -7), Vector2(-7, 7), Vector2(7, 7)]:
			var cell: Vector2i = layout.cell_at(point + offset)
			if not layout.cells.has(cell) or layout.trees.has(cell):
				return false
	return true

func ground_height(point: Vector2) -> float:
	var cell: Vector2i = layout.cell_at(point)
	var base: float = layout.height_at(cell)
	var local: Vector2 = point - (layout.ORIGIN + Vector2(cell) * 64)
	var result := base
	for step in Layout.STEPS:
		var neighbor: Vector2i = cell + step
		if not layout.cells.has(neighbor):
			continue
		var distance: float = local.x if step == Vector2i.LEFT else (64 - local.x if step == Vector2i.RIGHT else (local.y if step == Vector2i.UP else 64 - local.y))
		if distance < 16:
			var blend: float = (16 - distance) / 32.0
			result += (layout.height_at(neighbor) - base) * blend
	return result

func fall_into_water(point: Vector2) -> void:
	var from: Vector2i = layout.cell_at(pawn.position)
	var best := INF
	var shore: Vector2i = from
	var direction := Vector2.RIGHT
	for cell in layout.cells:
		if layout.trees.has(cell) or (cell != from and layout.path(from, cell).is_empty()):
			continue
		for step in Layout.STEPS:
			if layout.cells.has(cell + step):
				continue
			var distance: float = layout.center(cell + step).distance_squared_to(point)
			if distance < best:
				best = distance
				shore = cell
				direction = Vector2(step)
	if best == INF:
		return
	var edge: Vector2 = layout.center(shore) + direction * 20
	walk_on_land(shore, edge)
	water_phase = WaterPhase.APPROACHING
	while not waypoints.is_empty() or pawn.position.distance_to(edge) > 0.2:
		await get_tree().physics_frame
	var height: float = layout.height_at(shore)
	var landing: Vector2 = layout.center(shore) + direction * 64
	water_phase = WaterPhase.FALLING
	pawn.set_physics_process(false)
	pawn.sprite.play("run")
	var step_off := create_tween()
	step_off.tween_method(func(progress: float) -> void:
		pawn.position = edge.lerp(landing, progress) + Vector2(0, -sin(progress * PI) * 16.0)
		pawn.sprite.position.y = -32 - height * (1 - progress)
	, 0.0, 1.0, 0.4)
	await step_off.finished
	water_phase = WaterPhase.SPLASH
	pawn.sprite.play("idle")
	splash.position = landing
	splash.frame = 0
	splash.show()
	splash.play("splash")
	splash_started.emit()
	var sink := create_tween().set_parallel(true)
	sink.tween_property(pawn.sprite, "position:y", -12.0, 0.2)
	sink.tween_property(pawn.sprite, "modulate:a", 0.0, 0.2)
	await splash.animation_finished
	splash.hide()
	water_phase = WaterPhase.WAITING
	await get_tree().create_timer(RESPAWN_DELAY).timeout
	water_phase = WaterPhase.RESPAWNING
	pawn.position = layout.center(Layout.HOME)
	pawn.destination = pawn.position
	pawn.sprite.position = Vector2(0, -32 - layout.height_at(Layout.HOME))
	var appear := create_tween()
	appear.tween_property(pawn.sprite, "modulate:a", 1.0, 0.25)
	await appear.finished
	pawn.set_physics_process(true)
	water_phase = WaterPhase.READY
	respawned.emit()

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
	super._exit_tree()
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_FORBIDDEN)
