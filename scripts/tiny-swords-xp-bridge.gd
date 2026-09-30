extends "res://scripts/level_two_preview.gd"

var study_camera: Camera2D
var study_camera_center := Vector2(576, 248)

var study_bridge_ready := false
var study_layout_restored := false
var study_poll_elapsed := 0.0

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
				"left": study_camera.position.x -= 64 / study_camera.zoom.x
				"right": study_camera.position.x += 64 / study_camera.zoom.x
				"up": study_camera.position.y -= 64 / study_camera.zoom.x
				"down": study_camera.position.y += 64 / study_camera.zoom.x
				"in": study_camera.zoom = Vector2.ONE * minf(1.5, study_camera.zoom.x + 0.1)
				"out": study_camera.zoom = Vector2.ONE * maxf(0.5, study_camera.zoom.x - 0.1)
				"reset":
					study_camera.position = study_camera_center
					study_camera.zoom = Vector2.ONE * 0.85
		study_camera.position = study_camera.position.clamp(study_camera_center - Vector2(768, 512), study_camera_center + Vector2(768, 512))
	JavaScriptBridge.eval("window.edeniaCamera = %s" % JSON.stringify({"x": study_camera.position.x, "y": study_camera.position.y, "zoom": study_camera.zoom.x, "width": get_viewport().get_visible_rect().size.x, "height": get_viewport().get_visible_rect().size.y}))
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
