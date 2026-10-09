extends "res://scripts/level_two_preview.gd"

const IslandPresentation = preload("res://scripts/island_presentation.gd")
var island_presentation = IslandPresentation.new()
var study_locale_callback: JavaScriptObject
var study_motion_callback: JavaScriptObject
var study_visibility_callback: JavaScriptObject
var study_size_callback: JavaScriptObject
var study_canvas_width := 1152.0
var study_camera_callback: JavaScriptObject
var study_save_callback: JavaScriptObject
var study_unlock_retry_elapsed := 0.0
var study_requires_save_acknowledgment := OS.has_feature("web")
var study_presented := true
var study_bridge_ready := false
var study_layout_restored := false
var study_restore_attempted := false
var study_startup_finishing := false
var study_presentation_ready := false
var study_poll_elapsed := 0.0
var study_celebrating := false
var study_editing := false

func _ready() -> void:
	# Select the canonical read-only scene before initializing gameplay or saves.
	if preload("res://scripts/conflict_preview.gd").requested():
		preview_save_enabled = false
		camera_save_enabled = false
		process_mode = Node.PROCESS_MODE_DISABLED
		get_tree().change_scene_to_file.call_deferred("res://scenes/conflict_preview.tscn")
		return
	# This integration has its own browser layout; standalone editor saves stay intact.
	preview_save_enabled = false
	study_claims_authoritative = true
	# Developer controls are a Godot decision; hosted releases never expose them.
	playground_enabled = OS.has_feature("web") and bool(JavaScriptBridge.eval("['localhost','127.0.0.1'].includes(location.hostname) && location.port === '8037'"))
	playground_ready = false
	super._ready()
	ui.max_preview_level = 1
	refresh()
	study_bridge_ready = true
	if OS.has_feature("web"):
		page_focus_requested.connect(func(): JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-game-focus-exit',session:window.edeniaStudySession},location.origin)"))
		study_motion_callback = JavaScriptBridge.create_callback(receive_reduced_motion)
		JavaScriptBridge.get_interface("window").edeniaReceiveReducedMotion = study_motion_callback
		GamePresentation.reduced_motion = bool(JavaScriptBridge.eval("window.edeniaReducedMotion === true"))
		study_locale_callback = JavaScriptBridge.create_callback(receive_locale)
		JavaScriptBridge.get_interface("window").edeniaReceiveLocale = study_locale_callback
		GameCopy.set_locale(str(JavaScriptBridge.eval("window.edeniaLocale || 'en'")))
		study_visibility_callback = JavaScriptBridge.create_callback(receive_host_visibility)
		JavaScriptBridge.get_interface("window").edeniaReceiveHostVisibility = study_visibility_callback
		study_size_callback = JavaScriptBridge.create_callback(receive_canvas_width)
		JavaScriptBridge.get_interface("window").edeniaReceiveCanvasWidth = study_size_callback
		study_canvas_width = maxf(1, float(JavaScriptBridge.eval("window.edeniaCanvasWidth || 1152")))
		get_viewport().size_changed.connect(update_drag_threshold)
		update_drag_threshold()
		study_camera_callback = JavaScriptBridge.create_callback(receive_camera_command)
		JavaScriptBridge.get_interface("window").edeniaReceiveCameraCommand = study_camera_callback
		study_save_callback = JavaScriptBridge.create_callback(receive_layout_saved)
		JavaScriptBridge.get_interface("window").edeniaReceiveLayoutSaved = study_save_callback
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-game-progression',thresholds:%s},location.origin)" % JSON.stringify(Layout.XP_THRESHOLDS))

func receive_reduced_motion(arguments: Array) -> void:
	if arguments.size() == 1 and arguments[0] is bool:
		GamePresentation.reduced_motion = arguments[0]

func receive_locale(arguments: Array) -> void:
	if arguments.size() == 1 and arguments[0] is String:
		GameCopy.set_locale(arguments[0])

func receive_host_visibility(arguments: Array) -> void:
	if arguments.size() != 1 or not arguments[0] is bool:
		return
	study_presented = arguments[0]
	if study_restore_attempted:
		island_presentation.set_presented(self, study_presented)

func receive_canvas_width(arguments: Array) -> void:
	if arguments.size() != 1 or not (arguments[0] is float or arguments[0] is int):
		return
	study_canvas_width = maxf(1, float(arguments[0]))
	update_drag_threshold()

func receive_camera_command(arguments: Array) -> void:
	if arguments.size() == 1 and arguments[0] is String:
		camera_command(arguments[0])

func update_drag_threshold() -> void:
	world_drag_threshold = 6.0 * get_viewport().get_visible_rect().size.x / study_canvas_width

func receive_layout_saved(arguments: Array) -> void:
	if arguments.size() == 2 and (arguments[0] is float or arguments[0] is int) and arguments[1] is bool:
		complete_level_unlock(int(arguments[0]), arguments[1])
		study_unlock_retry_elapsed = 0.0

func save_unlocked_level() -> void:
	# The host's durable acknowledgment opens the Godot celebration.
	if not study_requires_save_acknowledgment:
		super.save_unlocked_level()
		return
	study_unlock_retry_elapsed = 0.0
	save_layout()

func _process(delta: float) -> void:
	super._process(delta)
	if not study_bridge_ready or not OS.has_feature("web"):
		return
	study_poll_elapsed += delta
	if pending_unlock_level > 0:
		study_unlock_retry_elapsed += delta
		if study_unlock_retry_elapsed >= 2.0 and JavaScriptBridge.eval("window.edeniaSaveInFlight === null"):
			study_unlock_retry_elapsed = 0.0
			save_layout()
	if study_poll_elapsed < 0.2:
		return
	study_poll_elapsed = 0.0
	var commands = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.edeniaCameraCommands.splice(0))"))
	if commands is Array:
		for command in commands:
			if command is String:
				camera_command(command)
	JavaScriptBridge.eval("window.edeniaCamera = %s" % JSON.stringify({"x": game_camera.position.x, "y": game_camera.position.y, "zoom": game_camera.zoom.x, "width": get_viewport().get_visible_rect().size.x, "height": get_viewport().get_visible_rect().size.y, "pawnX": pawn.position.x, "pawnY": pawn.position.y, "editing": editing, "waterPhase": water_phase}))
	if study_celebrating != (ui.celebration != null) or study_editing != editing:
		study_celebrating = ui.celebration != null
		study_editing = editing
		JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-game-ui',celebrating:%s,editing:%s}, location.origin)" % [str(study_celebrating), str(study_editing)])
	var claimed_level := clampi(int(JavaScriptBridge.eval("window.edeniaStudyLevel || 1")), 1, Layout.XP_THRESHOLDS.size())
	if not study_layout_restored and JavaScriptBridge.eval("window.edeniaStudyReady === true"):
		var saved = JavaScriptBridge.eval("JSON.stringify(window.edeniaStudyLayout)")
		var data = JSON.parse_string(saved) if saved is String else null
		study_layout_restored = restore_study_layout(data)
		study_restore_attempted = true
		# Local testing can continue even when Edenia retains a rejected save.
		# Durable writes remain gated by study_layout_restored in save_layout().
		playground_ready = true
		JavaScriptBridge.eval("window.edeniaStudyReady=false")
		if not study_layout_restored:
			JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-tiny-restored',session:window.edeniaStudySession,accepted:false},location.origin)")
	if not study_layout_restored:
		if study_restore_attempted:
			island_presentation.set_presented(self, study_presented)
		return
	ui.max_preview_level = Layout.XP_THRESHOLDS.size() if playground_enabled else claimed_level
	apply_study_level(claimed_level)
	# Study claims and local playground upgrades share Godot's reward rules.
	if layout.level == 1:
		ui.launch.hide()
	JavaScriptBridge.eval("window.edeniaGameLevel = %s" % (playground.current_level() if playground != null else layout.level))
	island_presentation.set_presented(self, study_presented)
	if not study_startup_finishing:
		finish_study_startup()

func finish_study_startup() -> void:
	study_startup_finishing = true
	# Restoration and claimed-level application must be visible before Edenia
	# removes its loading cover and enables input. Shader/texture preparation can
	# make this first draw much slower than restoring the layout itself.
	await RenderingServer.frame_post_draw
	study_presentation_ready = true
	JavaScriptBridge.eval("window.parent.postMessage({type:'edenia-tiny-restored',session:window.edeniaStudySession,accepted:true},location.origin)")
	save_layout()

func restore_study_layout(data: Variant) -> bool:
	if data == null:
		return true
	return data is Dictionary and restore_saved_layout(data)

func save_layout(animal_checkpoint: bool = false) -> void:
	if study_bridge_ready and study_layout_restored and study_presentation_ready and OS.has_feature("web"):
		JavaScriptBridge.eval("window.edeniaQueueLayout(%s, %s)" % [JSON.stringify(saved_snapshot()), JSON.stringify(animal_checkpoint)])
