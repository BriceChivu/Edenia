extends CanvasLayer

## Optional, Godot-owned rendering experiment. It never enters an island save.
var summary: Label
var compare: Button
var download: Button
var refresh_elapsed := 0.0
var motion_callback: JavaScriptObject
var motion_world: Node
var motion_start := Vector2.ZERO
var motion_destination := Vector2.ZERO
var motion_previous := Vector2.ZERO
var motion_distance := 0.0
var motion_running := false
var motion_outward := true

func _ready() -> void:
	set_process(false)
	if not OS.has_feature("web"):
		return
	var enabled = JavaScriptBridge.eval(FileAccess.get_file_as_string("res://scripts/frame_rate_test.js"))
	if not enabled:
		return
	motion_callback = JavaScriptBridge.create_callback(receive_motion)
	JavaScriptBridge.get_interface("window").edeniaFrameTestMotion = motion_callback
	layer = 100
	var panel := PanelContainer.new()
	panel.position = Vector2(8, 8)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.10, 0.14, 0.94)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var column := VBoxContainer.new()
	panel.add_child(column)
	summary = Label.new()
	summary.add_theme_font_size_override("font_size", 14)
	column.add_child(summary)
	var row := HBoxContainer.new()
	column.add_child(row)
	for fps in [30, 60]:
		var button := Button.new()
		button.text = "%s FPS" % fps
		button.add_theme_font_size_override("font_size", 14)
		button.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaFrameTest.setFps(%s)" % fps))
		row.add_child(button)
	compare = Button.new()
	compare.text = "Compare (48s)"
	compare.add_theme_font_size_override("font_size", 14)
	compare.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaFrameTest.startComparison()"))
	column.add_child(compare)
	download = Button.new()
	download.text = "Save report"
	download.add_theme_font_size_override("font_size", 14)
	download.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaFrameTest.download()"))
	column.add_child(download)
	set_process(true)
	refresh()

func _process(delta: float) -> void:
	if motion_running and is_instance_valid(motion_world):
		motion_distance += motion_world.pawn.position.distance_to(motion_previous)
		motion_previous = motion_world.pawn.position
		if motion_world.waypoints.is_empty() and motion_world.pawn.position.distance_to(motion_world.pawn.destination) < 0.2:
			motion_outward = not motion_outward
			var target := motion_destination if motion_outward else motion_start
			motion_world.walk_on_land(motion_world.layout.cell_at(target), target)
	refresh_elapsed += delta
	if refresh_elapsed < 0.5:
		return
	refresh_elapsed = 0.0
	refresh()

func refresh() -> void:
	var state = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.edeniaFrameTest.getState())"))
	if not state is Dictionary:
		return
	compare.disabled = state.running
	download.disabled = not state.report is Dictionary
	summary.text = "FPS test · %s FPS\n%s" % [state.targetFps, state.status]
	if state.report is Dictionary:
		summary.text += "\n60: %.1f FPS · late %.1f%%\n30: %.1f FPS · late %.1f%%\nLoop work: %.1f%% less" % [state.report.control.actualFps, state.report.control.missedDeadlinePct, state.report.trial.actualFps, state.report.trial.missedDeadlinePct, state.report.workReductionPct]

func receive_motion(arguments: Array) -> void:
	if arguments.is_empty():
		return
	var operation := str(arguments[0])
	if operation == "start":
		motion_world = get_tree().current_scene
		JavaScriptBridge.eval("window.edeniaFrameTestMotionReady = false")
		if not is_instance_valid(motion_world) or not motion_world.has_method("land_route"):
			return
		# Do not interrupt harvesting, construction, carrying or water actions.
		if motion_world.arrival.blocks_gameplay() or motion_world.harvesting.phase != 0 or motion_world.construction.phase != 0 or motion_world.water_phase != 0 or motion_world.layout.house_bundle > 0 or motion_world.pawn.carrying_chicken:
			return
		if not motion_world.waypoints.is_empty() or motion_world.pawn.position.distance_to(motion_world.pawn.destination) > 0.2:
			return
		motion_start = motion_world.pawn.position
		motion_distance = 0.0
		var best_distance := 16.0
		motion_destination = motion_start
		for cell in motion_world.layout.cells:
			var point: Vector2 = motion_world.layout.center(cell)
			var distance := point.distance_to(motion_start)
			if distance <= best_distance or not motion_world.layout.walkable_point(point):
				continue
			var route: Array[Vector2] = motion_world.land_route(motion_start, cell, point)
			var back: Array[Vector2] = motion_world.land_route(point, motion_world.layout.cell_at(motion_start), motion_start)
			if route.is_empty() or back.is_empty() or not route.back().is_equal_approx(point) or not back.back().is_equal_approx(motion_start):
				continue
			best_distance = distance
			motion_destination = point
		if best_distance <= 16.0:
			return
		motion_running = true
		JavaScriptBridge.eval("window.edeniaFrameTestMotionReady = true")
	if operation in ["start", "round"] and motion_running:
		# Repeat the same route from the same start during every warm-up.
		motion_world.pawn.position = motion_start
		motion_previous = motion_start
		motion_outward = true
		motion_world.walk_on_land(motion_world.layout.cell_at(motion_destination), motion_destination)
	if operation == "finish" and motion_running:
		motion_distance += motion_world.pawn.position.distance_to(motion_previous)
		JavaScriptBridge.eval("window.edeniaFrameTestMotionInfo = %s" % JSON.stringify({"distancePixels": motion_distance, "routeLengthPixels": motion_start.distance_to(motion_destination), "speedPixelsPerSecond": motion_world.pawn.speed}))
		motion_running = false
		motion_world.waypoints.clear()
		motion_world.pawn.position = motion_start
		motion_world.pawn.walk_to(motion_start)
