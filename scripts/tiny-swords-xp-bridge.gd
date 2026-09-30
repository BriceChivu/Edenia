extends "res://scripts/level_two_preview.gd"

var study_bridge_ready := false
var study_layout_restored := false
var study_poll_elapsed := 0.0

func _ready() -> void:
	# This integration has its own browser layout; standalone editor saves stay intact.
	preview_save_enabled = false
	super._ready()
	ui.max_preview_level = 1
	refresh()
	study_bridge_ready = true

func _process(delta: float) -> void:
	super._process(delta)
	if not study_bridge_ready or not OS.has_feature("web"):
		return
	study_poll_elapsed += delta
	if study_poll_elapsed < 0.2:
		return
	study_poll_elapsed = 0.0
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
