extends "res://scripts/level_two_preview.gd"

var study_bridge_ready := false
var study_layout_restored := false
var study_poll_elapsed := 0.0
var study_celebrating := false

func _ready() -> void:
	# This integration has its own browser layout; standalone editor saves stay intact.
	preview_save_enabled = false
	super._ready()
	ui.max_preview_level = 1
	refresh()
	study_bridge_ready = true
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-game-progression',thresholds:%s},location.origin)" % JSON.stringify(Layout.XP_THRESHOLDS))

func _process(delta: float) -> void:
	super._process(delta)
	if not study_bridge_ready or not OS.has_feature("web"):
		return
	world_drag_threshold = 6.0 * get_viewport().get_visible_rect().size.x / maxf(1, float(JavaScriptBridge.eval("document.getElementById('canvas').getBoundingClientRect().width")))
	study_poll_elapsed += delta
	if study_poll_elapsed < 0.2:
		return
	study_poll_elapsed = 0.0
	var commands = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.edeniaCameraCommands.splice(0))"))
	if commands is Array:
		for command in commands:
			if command is String:
				camera_command(command)
	JavaScriptBridge.eval("window.edeniaCamera = %s" % JSON.stringify({"x": game_camera.position.x, "y": game_camera.position.y, "zoom": game_camera.zoom.x, "width": get_viewport().get_visible_rect().size.x, "height": get_viewport().get_visible_rect().size.y, "pawnX": pawn.position.x, "pawnY": pawn.position.y, "editing": editing, "waterPhase": water_phase}))
	if study_celebrating != (ui.celebration != null):
		study_celebrating = ui.celebration != null
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-game-ui',celebrating:%s}, location.origin)" % str(study_celebrating))
	var claimed_level := clampi(int(JavaScriptBridge.eval("window.edeniaStudyLevel || 1")), 1, Layout.XP_THRESHOLDS.size())
	if not study_layout_restored and JavaScriptBridge.eval("window.edeniaStudyReady === true"):
		var saved = JavaScriptBridge.eval("JSON.stringify(window.edeniaStudyLayout)")
		var data = JSON.parse_string(saved) if saved is String else null
		study_layout_restored = restore_study_layout(data)
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-tiny-restored',session:window.edeniaStudySession,accepted:%s},location.origin)" % str(study_layout_restored))
		JavaScriptBridge.eval("window.edeniaStudyReady=false")
		if study_layout_restored:
			save_layout()
	if not study_layout_restored:
		return
	ui.max_preview_level = claimed_level
	if layout.level < claimed_level:
		unlock_level(layout.level + 1)
	# The parent XP bar owns level claiming; no game-only unlock shortcuts.
	ui.upgrade.hide()
	if layout.level == 1:
		ui.launch.hide()
	JavaScriptBridge.eval("window.edeniaGameLevel = %s" % layout.level)

func restore_study_layout(data: Variant) -> bool:
	if data == null:
		return true
	return data is Dictionary and restore_saved_layout(data)

func save_layout() -> void:
	if study_bridge_ready and study_layout_restored and OS.has_feature("web"):
		JavaScriptBridge.eval("window.edeniaQueueLayout(%s)" % JSON.stringify(layout.snapshot()))
