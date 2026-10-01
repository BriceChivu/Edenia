extends "res://scripts/level_one.gd"

const Layout = preload("res://scripts/terrain_layout.gd")
const TerrainView = preload("res://scripts/terrain_view.gd")
const BuilderUI = preload("res://scripts/builder_ui.gd")
const UI_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_01.png")
const INVALID_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_03.png")
const BUILD_CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_04.png")
const SAVE_KEY := "edenia_tiny_swords_builder_preview_v1"
const DEFAULT_ZOOM := 0.8

var game_camera: Camera2D
var game_camera_center := Vector2(576, 248)

var world_pointer_down: InputEventMouseButton
var world_dragging := false
var world_drag_origin := Vector2.ZERO
var world_drag_threshold := 6.0

var layout = Layout.new()
var terrain
var ui
var editing := false
var selected := "ground"
var preserve_history_on_reopen := false
var history: Array[Dictionary] = []
var movement_generation := 0
var waypoints: Array[Vector2] = []
var tree_nodes: Array[Node] = []
var flora_nodes: Array[Node] = []
var preview_save_enabled := true
var build_cursor: Texture2D
var build_cursor_size := Vector2i.ZERO
var cursor_mode := ""
var pointer: Sprite2D
var pointer_inside := false
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
	get_window().mouse_exited.connect(func(): pointer_inside = false)
	ui.unlock_requested.connect(unlock_level)
	ui.edit_toggled.connect(toggle_editing)
	ui.tool_selected.connect(func(tool):
		selected = tool
		ui.collapsed = false
		ui.panel.accessibility_description = "Pick up tree first, then ground." if tool == "remove" else "Choose a square for " + BuilderUI.NAMES[tool] + "."
		refresh())
	ui.undo_requested.connect(undo)
	pawn.position = layout.center(layout.spawn_cell())
	pawn.walk_to(pawn.position)
	rebuild_decorations()
	refresh()
	game_camera = Camera2D.new()
	game_camera.position = game_camera_center
	game_camera.zoom = Vector2.ONE * DEFAULT_ZOOM
	add_child(game_camera)
	get_window().mouse_exited.connect(func():
		world_pointer_down = null
		world_dragging = false)

func refresh() -> void:
	update_cursor()
	terrain.editing = editing
	terrain.tool = selected
	ui.refresh(editing, selected, not history.is_empty())

func unlock_level_two() -> void:
	unlock_level(2)

func unlock_level(target_level: int) -> void:
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
	editing = not editing
	if editing:
		if not preserve_history_on_reopen:
			history.clear()
		preserve_history_on_reopen = false
	if water_phase == WaterPhase.READY:
		waypoints.clear()
		pawn.walk_to(pawn.position)
	refresh()

func _process(_delta: float) -> void:
	if terrain == null:
		return
	ui.launch.disabled = false
	ui.upgrade.disabled = water_phase != WaterPhase.READY
	ui.launch.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if water_phase == WaterPhase.READY or water_phase == WaterPhase.APPROACHING:
		pawn.sprite.position.y = -32.0 - ground_height(pawn.position)
		pawn.z_index = int(ceil(ground_height(pawn.position) / 64.0))
		if not waypoints.is_empty() and pawn.position.distance_to(pawn.destination) < 0.2:
			pawn.walk_to(waypoints.pop_front())
	if editing:
		terrain.preview_position = get_global_mouse_position()
		terrain.ground_preview_height = -1
		if selected == "ground":
			var option := ground_placement_at(terrain.preview_position)
			terrain.hover = option.cell
			terrain.ground_preview_height = option.height
		else:
			terrain.hover = clicked_cell(terrain.preview_position)
		terrain.valid = water_phase == WaterPhase.READY and (selected != "ground" or terrain.ground_preview_height >= 0) and layout.can_edit(terrain.hover, selected, layout.cell_at(pawn.position), terrain.ground_preview_height)
		if selected == "tree":
			terrain.valid = water_phase == WaterPhase.READY and can_place_tree(terrain.hover, tree_offset_at(terrain.hover, terrain.preview_position))
	update_cursor()

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE and editing and ui.celebration == null:
		toggle_editing()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseMotion:
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


func camera_command(command: String) -> void:
	match command:
		"in": game_camera.zoom = Vector2.ONE * minf(1.5, game_camera.zoom.x + 0.1)
		"out": game_camera.zoom = Vector2.ONE * maxf(0.5, game_camera.zoom.x - 0.1)
		"reset":
			game_camera.position = game_camera_center
			game_camera.zoom = Vector2.ONE * DEFAULT_ZOOM
	game_camera.position = game_camera.position.clamp(game_camera_center - Vector2(768, 512), game_camera_center + Vector2(768, 512))

func fit_build_cursor() -> void:
	# Use the same scene units in native Godot and in the browser.
	# Seven transparent border pixels leave a 64px span between outer corners.
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

func update_cursor() -> void:
	if pointer == null:
		return
	fit_build_cursor()
	var mode := "walk" if not editing else (("build" if selected == "remove" else "place") if terrain.valid else "invalid")
	var hovered := get_viewport().gui_get_hovered_control()
	if hovered != null and (hovered == ui.root or ui.root.is_ancestor_of(hovered)):
		mode = "invalid" if hovered is BaseButton and hovered.disabled else "ui"
	if mode != cursor_mode:
		cursor_mode = mode
		pointer.texture = UI_CURSOR if mode == "ui" else (CURSOR if mode == "walk" else (build_cursor if mode == "build" else INVALID_CURSOR))
	var hotspot := Vector2(35.5, 35.5) if mode == "build" else Vector2(24, 18)
	pointer.scale = Vector2.ONE
	pointer.position = pointer_position - hotspot
	pointer.visible = pointer_inside and mode != "place"

func clicked_cell(point: Vector2) -> Vector2i:
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
	return point + Vector2(0, layout.height_at(cell)) - layout.center(cell)

func can_place_tree(cell: Vector2i, offset: Vector2) -> bool:
	return layout.can_edit(cell, "tree", layout.cell_at(pawn.position), -1, offset) and not layout.tree_obstacle(layout.center(cell) + offset).has_point(pawn.position)

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
		var cell := clicked_cell(point)
		if editing:
			var height: float = ground_placement_at(point).height if selected == "ground" else -1.0
			if selected != "ground" or height >= 0:
				apply_edit(cell, height, tree_offset_at(cell, point) if selected == "tree" else Vector2.ZERO)
		elif layout.cells.has(cell):
			walk_on_land(cell, point + Vector2(0, ground_height(Vector2(point.x, layout.center(cell).y))))
		else:
			fall_into_water(point)

func apply_edit(cell: Vector2i, ground_height: float = -1, tree_placement_offset: Vector2 = Vector2.ZERO) -> bool:
	if water_phase != WaterPhase.READY:
		return false
	if selected == "tree" and not can_place_tree(cell, tree_placement_offset):
		return false
	var before: Dictionary = layout.snapshot()
	if not layout.edit(cell, selected, layout.cell_at(pawn.position), ground_height, tree_placement_offset):
		ui.panel.accessibility_description = "Move the pawn off this tile. Pick up stairs before their landing." if selected == "remove" else "That spot is unavailable. Try another square."
		return false
	history.append(before)
	if history.size() > 40:
		history.pop_front()
	rebuild_decorations()
	save_layout()
	if editing and selected not in ["remove", "ground"] and layout.ground_count() + layout.stock.stairs + layout.stock.tree == 0:
		editing = false
		preserve_history_on_reopen = true
	refresh()
	return true

func undo() -> void:
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
			backing.backing_height = height - 64
			backing.z_index = int(height / 64.0) - 2
			backing.set_meta("terrain_backing", true)
			add_child(backing)
		var shadows := TerrainView.new()
		shadows.layout = layout
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
			surface.piece = cell
			surface.z_index = maxi(0, int(layout.height_at(cell) / 64.0) - (0 if layout.cells[cell] == "stairs" else 1))
			surface.position = layout.ORIGIN + Vector2(cell) * 64
			surface.set_meta("terrain_occluder", true)
			$World.add_child(surface)
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
	for node in tree_nodes:
		node.queue_free()
	tree_nodes.clear()
	# Original foliage follows its tile and disappears when that tile is collected.
	for pair in [["MainBush", Vector2i(0, 0), 1], ["LeafyTuft", Vector2i(1, 1), 2], ["IsletBush", Vector2i(3, 2), 1]]:
		var node = $World.get_node(pair[0])
		node.visible = layout.flora.get(pair[1], 0) == pair[2]
		node.offset.y = -15 - layout.height_at(pair[1]) / node.scale.y
		node.z_index = int(layout.height_at(pair[1]) / 64.0)
		if pair[0] == "IsletBush":
			node.position = layout.center(pair[1])
	for cell in layout.flora:
		if {Vector2i(0, 0): 1, Vector2i(1, 1): 2, Vector2i(3, 2): 1}.get(cell) == layout.flora[cell]:
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
	for cell in layout.trees:
		var tree := Sprite2D.new()
		tree.texture = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
		tree.hframes = 8
		tree.scale = Vector2.ONE * 0.8
		tree.z_index = int(layout.height_at(cell) / 64.0)
		tree.position = layout.tree_position(cell)
		tree.offset = Layout.TREE_ART_OFFSET - Vector2(0, layout.height_at(cell) / 0.8)
		tree.set_script(preload("res://scripts/environment_sprite.gd"))
		$World.add_child(tree)
		tree_nodes.append(tree)

func walk_on_land(cell: Vector2i, point: Vector2) -> void:
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
	var path: Array[Vector2i] = layout.path(from, cell)
	if path.is_empty() and from != cell:
		return route
	var candidates: Array[Vector2] = [layout.center(from)]
	for step in path:
		candidates.append(layout.center(step))
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var target := point.clamp(origin + Vector2(12, 12), origin + Vector2(52, 52))
	candidates.append(target)
	if not layout.trees.is_empty():
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

func tree_navigation_path(start: Vector2, target: Vector2) -> Array[Vector2]:
	var result: Array[Vector2] = []
	if not layout.walkable_point(target):
		return result
	var source := Vector2i(((start - Layout.ORIGIN) / 8.0).floor())
	var goal := Vector2i(((target - Layout.ORIGIN) / 8.0).floor())
	var queue: Array[Vector2i] = [source]
	var previous: Dictionary = {source: source}
	var index := 0
	while index < queue.size():
		var current := queue[index]
		index += 1
		if current == goal:
			while current != source:
				result.push_front(Layout.ORIGIN + (Vector2(current) + Vector2.ONE * 0.5) * 8)
				current = previous[current]
			result.append(target)
			return result
		var current_point := Layout.ORIGIN + (Vector2(current) + Vector2.ONE * 0.5) * 8
		for step in Layout.NAV_STEPS:
			var next: Vector2i = current + step
			if previous.has(next):
				continue
			var next_point := Layout.ORIGIN + (Vector2(next) + Vector2.ONE * 0.5) * 8
			if not clear_segment(current_point, next_point):
				continue
			previous[next] = current
			queue.append(next)
	return result

func clear_segment(start: Vector2, end: Vector2) -> bool:
	var samples := maxi(1, ceili(start.distance_to(end) / 4.0))
	var previous: Vector2i = layout.cell_at(start)
	for i in range(samples + 1):
		var point := start.lerp(end, float(i) / samples)
		var current: Vector2i = layout.cell_at(point)
		if current != previous and not layout.can_cross(previous, current):
			return false
		previous = current
		if not layout.walkable_point(point):
			return false
	return true

func ground_height(point: Vector2) -> float:
	var cell: Vector2i = layout.cell_at(point)
	if layout.cells.get(cell) == "stairs":
		var direction: Vector2i = layout.stair_direction(cell)
		var progress: float = (point.x - layout.ORIGIN.x - cell.x * 64) / 64.0
		return layout.height_at(cell) + clampf(progress if direction.x > 0 else 1.0 - progress, 0.0, 1.0) * 64.0
	return layout.height_at(cell)

func fall_into_water(point: Vector2) -> void:
	# A raised face is not a water exit; descend using the existing stairs first.
	if ground_height(pawn.position) > 0:
		return
	var from: Vector2i = layout.cell_at(pawn.position)
	var best := INF
	var shore: Vector2i = from
	var direction := Vector2.RIGHT
	for cell in layout.cells:
		if layout.height_at(cell) > 0 or layout.cells[cell] == "stairs":
			continue
		if layout.trees.has(cell) or (cell != from and layout.path(from, cell).is_empty()):
			continue
		for step in Layout.STEPS:
			if layout.cells.has(cell + step):
				continue
			# Compare the complete route toward the click, including the actual
			# walk around obstacles. Proximity to the clicked water alone can
			# choose a distant shore and send the pawn on a needless detour.
			var exit: Vector2 = pawn.position if cell == from else layout.center(cell)
			var distance := 0.0
			if cell != from:
				var route := land_route(pawn.position, cell, exit)
				if route.is_empty():
					continue
				var previous: Vector2 = pawn.position
				for waypoint in route:
					distance += previous.distance_to(waypoint)
					previous = waypoint
			# The shared fall travels outward before the splash. Include the
			# remaining water distance so exits still follow the click direction.
			distance += 53.0 + (exit + Vector2(step) * 53.0).distance_to(point)
			if distance < best:
				best = distance
				shore = cell
				direction = Vector2(step)
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
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	super._exit_tree()
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_FORBIDDEN)
