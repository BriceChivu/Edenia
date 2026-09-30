extends "res://scripts/level_two_preview.gd"

var study_camera: Camera2D
var study_camera_center := Vector2(576, 248)

var study_bridge_ready := false
var study_layout_restored := false
var study_poll_elapsed := 0.0
var study_celebrating := false
var study_pointer_down: InputEventMouseButton
var study_dragging := false
var study_drag_origin := Vector2.ZERO
var study_drag_threshold := 6.0

func _ready() -> void:
	# This integration has its own browser layout; standalone editor saves stay intact.
	preview_save_enabled = false
	super._ready()
	ui.max_preview_level = 1
	refresh()
	study_camera = Camera2D.new()
	study_camera.position = study_camera_center
	study_camera.zoom = Vector2.ONE * 0.85
	add_child(study_camera)
	study_bridge_ready = true
	get_window().mouse_exited.connect(func():
		study_pointer_down = null
		study_dragging = false)

func _process(delta: float) -> void:
	super._process(delta)
	if not study_bridge_ready or not OS.has_feature("web"):
		return
	study_poll_elapsed += delta
	if study_poll_elapsed < 0.2:
		return
	study_poll_elapsed = 0.0
	var commands = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.edeniaCameraCommands.splice(0))"))
	if commands is Array:
		for command in commands:
			match command:
				"in": study_camera.zoom = Vector2.ONE * minf(1.5, study_camera.zoom.x + 0.1)
				"out": study_camera.zoom = Vector2.ONE * maxf(0.5, study_camera.zoom.x - 0.1)
				"reset":
					study_camera.position = study_camera_center
					study_camera.zoom = Vector2.ONE * 0.85
		study_camera.position = study_camera.position.clamp(study_camera_center - Vector2(768, 512), study_camera_center + Vector2(768, 512))
	JavaScriptBridge.eval("window.edeniaCamera = %s" % JSON.stringify({"x": study_camera.position.x, "y": study_camera.position.y, "zoom": study_camera.zoom.x, "width": get_viewport().get_visible_rect().size.x, "height": get_viewport().get_visible_rect().size.y, "pawnX": pawn.position.x, "pawnY": pawn.position.y, "editing": editing}))
	if study_celebrating != (ui.celebration != null):
		study_celebrating = ui.celebration != null
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-game-ui',celebrating:%s}, location.origin)" % str(study_celebrating))
	var claimed_level := clampi(int(JavaScriptBridge.eval("window.edeniaStudyLevel || 1")), 1, 3)
	if not study_layout_restored and JavaScriptBridge.eval("window.edeniaStudyReady === true"):
		study_layout_restored = true
		var saved = JavaScriptBridge.eval("JSON.stringify(window.edeniaStudyLayout || null)")
		if saved is String:
			var data = JSON.parse_string(saved)
			if data is Dictionary and int(data.get("level", 1)) <= claimed_level:
				layout.restore(data)
				rebuild_decorations()
				pawn.position = layout.center(layout.spawn_cell())
				pawn.walk_to(pawn.position)
				refresh()
	ui.max_preview_level = claimed_level
	if layout.level < claimed_level:
		unlock_level(layout.level + 1)
	# The parent XP bar owns level claiming; no game-only unlock shortcuts.
	ui.upgrade.hide()
	if layout.level == 1:
		ui.launch.hide()
	JavaScriptBridge.eval("window.edeniaGameLevel = %s" % layout.level)

func save_layout() -> void:
	if study_bridge_ready and OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-tiny-layout',layout:%s}, location.origin)" % JSON.stringify(layout.snapshot()))

func unlock_level(target_level: int) -> void:
	super.unlock_level(target_level)
	if target_level != 2 or layout.level != 2 or ui.celebration == null:
		return
	for child in ui.celebration.get_children():
		if child is Label:
			if child.text == "LEVEL TWO!":
				child.text = "Level 2"
			elif child.text.begins_with("Congratulations! Start shaping your island."):
				child.text = "4 new items: 3 ground tiles + 1 stair bundle."

func _input(event: InputEvent) -> void:
	super._input(event)
	if study_pointer_down == null:
		return
	if event is InputEventMouseMotion:
		var distance: Vector2 = event.position - study_pointer_down.position
		if distance.length() >= study_drag_threshold:
			study_dragging = true
		if study_dragging:
			study_camera.position = (study_drag_origin - distance / study_camera.zoom.x).clamp(study_camera_center - Vector2(768, 512), study_camera_center + Vector2(768, 512))
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		var click := study_pointer_down
		study_pointer_down = null
		if not study_dragging:
			super._unhandled_input(click)
		study_dragging = false
		get_viewport().set_input_as_handled()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and ui.celebration == null:
		# Defer world clicks until release, after distinguishing a click from a pan.
		# Godot GUI controls consume their own presses before this handler.
		study_pointer_down = event
		study_drag_origin = study_camera.position
		study_dragging = false
		if OS.has_feature("web"):
			study_drag_threshold = 6.0 * get_viewport().get_visible_rect().size.x / maxf(1, float(JavaScriptBridge.eval("document.getElementById('canvas').getBoundingClientRect().width")))
		get_viewport().set_input_as_handled()
		return
	super._unhandled_input(event)
