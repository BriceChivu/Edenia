extends "res://scripts/level_two_preview.gd"

const PREVIEW_KEY := "edenia_black_hole_meadow_v1"
var demo_status: Label
var demo_controls: VBoxContainer

func _ready() -> void:
	playground_enabled = true
	camera_save_enabled = false
	island_start_enabled = false
	super._ready()
	if layout.black_hole.is_empty():
		portal_event.open()
	var layer := CanvasLayer.new()
	layer.layer = 22
	add_child(layer)
	var box := VBoxContainer.new()
	demo_controls = box
	box.position = Vector2(16, 12)
	layer.add_child(box)
	var row := HBoxContainer.new()
	box.add_child(row)
	for item in [["Next-day visit", preview_next_day], ["Send an animal", send_animal], ["Reset meadow", reset_meadow]]:
		var button := Button.new()
		button.text = item[0]
		button.pressed.connect(item[1])
		row.add_child(button)
	var camera_row := HBoxContainer.new()
	box.add_child(camera_row)
	for item in [["Focus portal", focus_portal], ["Show island", func(): camera_command("reset")]]:
		var button := Button.new()
		button.text = item[0]
		button.pressed.connect(item[1])
		camera_row.add_child(button)
	demo_status = Label.new()
	demo_status.add_theme_color_override("font_shadow_color", Color.BLACK)
	demo_status.add_theme_constant_override("shadow_offset_x", 1)
	demo_status.add_theme_constant_override("shadow_offset_y", 1)
	box.add_child(demo_status)

func _process(delta: float) -> void:
	super._process(delta)
	if demo_status == null: return
	demo_controls.scale = Vector2.ONE * ui.scale_ui
	demo_controls.position = Vector2(16, 12) * ui.scale_ui
	var event: Dictionary = layout.black_hole
	var phase: String = event.get("phase", "idle")
	demo_status.text = "%s · Inside: %d · Chickens: %d · Sheep: %d\nClick grass to walk the pawn. This preview saves across reloads." % [phase.capitalize(), event.get("occupants", []).size(), layout.chickens.size(), layout.sheep.size()]

func preview_next_day() -> void:
	portal_event.preview_tomorrow()
	focus_portal()

func focus_portal() -> void:
	if layout.black_hole.get("phase", "idle") == "idle": return
	game_camera.position = portal_event.center() - Vector2(0, ground_height(portal_event.center()) + 32)
	game_camera.zoom = Vector2.ONE * MAX_MOUSE_ZOOM

func send_animal() -> void:
	if editing or layout.black_hole.get("phase") != "hungry" or portal_event.effects_busy > 0: return
	var animals: Array[Node] = []
	for node in asset_nodes:
		if is_instance_valid(node) and not node.is_queued_for_deletion() and node.has_method("animal_positions"): animals.append(node)
	animals.sort_custom(func(a, b): return a.position.distance_squared_to(portal_event.center()) < b.position.distance_squared_to(portal_event.center()))
	for animal in animals:
		var route := tree_navigation_path(animal.position, portal_event.center(), [], true)
		if route.is_empty(): continue
		animal.escape_route.assign(route)
		animal.tile_destinations.assign(route)
		animal.destination = route[0]
		animal.fleeing = true
		animal.face_destination()
		return

func reset_meadow() -> void:
	var meadow = preload("res://scripts/black_hole_meadow.gd").create()
	playground.replace_island(meadow.snapshot())
	portal_event.open()
	focus_portal()
	save_layout()

func load_layout() -> void:
	var json = JavaScriptBridge.eval("localStorage.getItem('%s')" % PREVIEW_KEY) if OS.has_feature("web") else (FileAccess.get_file_as_string("user://black_hole_meadow.json") if FileAccess.file_exists("user://black_hole_meadow.json") else "")
	var saved = JSON.parse_string(json) if json is String and not json.is_empty() else null
	if saved is Dictionary and restore_saved_layout(saved): return
	layout = preload("res://scripts/black_hole_meadow.gd").create()
	island_started = true

func save_layout(_animal_checkpoint: bool = false) -> void:
	var json := JSON.stringify(saved_snapshot())
	if OS.has_feature("web"):
		JavaScriptBridge.eval("localStorage.setItem('%s', %s)" % [PREVIEW_KEY, JSON.stringify(json)])
	else:
		var file := FileAccess.open("user://black_hole_meadow.json", FileAccess.WRITE)
		if file: file.store_string(json)
