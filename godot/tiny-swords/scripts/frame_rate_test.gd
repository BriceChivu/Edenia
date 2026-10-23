extends CanvasLayer

## Optional, Godot-owned rendering experiment. It never enters an island save.
var summary: Label
var compare: Button
var download: Button
var panel: PanelContainer
var toggle: Button
var quick_mark: Button
var capture_summary: Label
var capture_buttons: Dictionary = {}
var capture_picker: OptionButton
var capture_ids: Array = []
var quick_stop: Button
var capture_activity_elapsed := 0.0
var menu_scroll: ScrollContainer
var menu_column: VBoxContainer
var refresh_elapsed := 0.0
var calibration_elapsed := 0.0
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
	# The experiment uses the same collision checks, avoiding a fine-grid search
	# when the complete walking segment is already known to be safe.
	ProjectSettings.set_setting("gameplay/direct_walk_routes_enabled", true)
	ProjectSettings.set_setting("gameplay/bounded_obstacle_search_enabled", true)
	JavaScriptBridge.eval("window.edeniaFrameTestNavigationFastPath = true; window.edeniaFrameTestBoundedNavigation = true")
	motion_callback = JavaScriptBridge.create_callback(receive_motion)
	JavaScriptBridge.get_interface("window").edeniaFrameTestMotion = motion_callback
	JavaScriptBridge.eval(FileAccess.get_file_as_string("res://scripts/lag_capture_package.js"))
	JavaScriptBridge.eval(FileAccess.get_file_as_string("res://scripts/lag_capture.js"))
	layer = 100
	panel = PanelContainer.new()
	# Keep diagnostics available on request without covering ordinary island play.
	panel.visible = JavaScriptBridge.eval("(() => { try { return new URLSearchParams(window.parent.location.search).get('tiny_swords_diagnostics') === '1'; } catch { return false; } })()")
	panel.position = Vector2(8, 8)
	panel.oversampling_with_scale = CanvasItem.OVERSAMPLING_WITH_SCALE_ENABLED
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.10, 0.14, 0.94)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var contents := VBoxContainer.new()
	panel.add_child(contents)
	toggle = Button.new()
	toggle.add_theme_font_size_override("font_size", 14)
	toggle.custom_minimum_size.y = 32
	var heading := HBoxContainer.new()
	contents.add_child(heading)
	heading.add_child(toggle)
	quick_mark = Button.new()
	quick_mark.text = "Mark lag"
	quick_mark.add_theme_font_size_override("font_size", 14)
	quick_mark.custom_minimum_size.y = 32
	quick_mark.visible = false
	quick_mark.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaLagCapture.mark()"))
	heading.add_child(quick_mark)
	quick_stop = Button.new()
	quick_stop.text = "Stop"
	quick_stop.add_theme_font_size_override("font_size", 14)
	quick_stop.custom_minimum_size.y = 32
	quick_stop.visible = false
	quick_stop.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaLagCapture.stop()"))
	heading.add_child(quick_stop)
	menu_scroll = ScrollContainer.new()
	menu_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	menu_scroll.visible = false
	contents.add_child(menu_scroll)
	var column := VBoxContainer.new()
	menu_column = column
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu_scroll.add_child(column)
	column.visible = false
	toggle.pressed.connect(func():
		column.visible = not column.visible
		menu_scroll.visible = column.visible
		refresh()
		panel.call_deferred("reset_size"))
	var tabs := HBoxContainer.new()
	column.add_child(tabs)
	var capture_column := VBoxContainer.new()
	var fps_column := VBoxContainer.new()
	for tab_name in ["Lag capture", "FPS compare"]:
		var tab := Button.new()
		tab.text = tab_name
		tab.add_theme_font_size_override("font_size", 14)
		tab.custom_minimum_size.y = 32
		tab.pressed.connect(func():
			capture_column.visible = tab_name == "Lag capture"
			fps_column.visible = not capture_column.visible
			panel.call_deferred("reset_size"))
		tabs.add_child(tab)
	column.add_child(fps_column)
	column.add_child(capture_column)
	fps_column.visible = false
	summary = Label.new()
	summary.add_theme_font_size_override("font_size", 14)
	summary.custom_minimum_size.x = 230
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	fps_column.add_child(summary)
	var row := HBoxContainer.new()
	fps_column.add_child(row)
	for fps in [30, 60]:
		var button := Button.new()
		button.text = "%s FPS" % fps
		button.add_theme_font_size_override("font_size", 14)
		button.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaFrameTest.setFps(%s)" % fps))
		row.add_child(button)
	compare = Button.new()
	compare.text = "Compare (48s)"
	compare.add_theme_font_size_override("font_size", 14)
	compare.pressed.connect(func():
		if JavaScriptBridge.eval("window.edeniaFrameTest.startComparison()"):
			column.visible = false
			panel.call_deferred("reset_size"))
	fps_column.add_child(compare)
	download = Button.new()
	download.text = "Save report"
	download.add_theme_font_size_override("font_size", 14)
	download.pressed.connect(func(): JavaScriptBridge.eval("window.edeniaFrameTest.download()"))
	fps_column.add_child(download)
	capture_summary = Label.new()
	capture_summary.add_theme_font_size_override("font_size", 14)
	capture_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	capture_summary.custom_minimum_size.x = 230
	capture_column.add_child(capture_summary)
	capture_picker = OptionButton.new()
	capture_picker.custom_minimum_size.y = 32
	capture_picker.add_theme_font_size_override("font_size", 14)
	capture_picker.item_selected.connect(func(index: int):
		JavaScriptBridge.eval("window.edeniaLagCapture.select(%s)" % JSON.stringify(capture_ids[index])))
	capture_column.add_child(capture_picker)
	var capture_grid := GridContainer.new()
	capture_grid.columns = 2
	capture_column.add_child(capture_grid)
	for action in ["Save package", "Delete selected", "Record + compare", "Log only", "Mark lag", "Stop & keep"]:
		var button := Button.new()
		button.text = action
		button.custom_minimum_size.y = 32
		button.add_theme_font_size_override("font_size", 14)
		button.pressed.connect(func():
			var commands := {"Log only": "start(false)", "Record + compare": "startComparison()", "Mark lag": "mark()", "Stop & keep": "stop()", "Save package": "savePackage()", "Delete selected": "deleteSelected()"}
			JavaScriptBridge.eval("window.edeniaLagCapture.%s" % commands[action])
			if action in ["Log only", "Record + compare"] and JavaScriptBridge.eval("window.edeniaLagCapture.getState().active"):
				column.visible = false
			refresh())
		capture_grid.add_child(button)
		capture_buttons[action] = button
	set_process(true)
	refresh()

func _process(delta: float) -> void:
	capture_activity_elapsed += delta
	if capture_activity_elapsed >= 0.5:
		capture_activity_elapsed = 0.0
		if JavaScriptBridge.eval("window.edeniaLagCapture.getState().active"):
			var world := get_tree().current_scene
			var activity := "idle"
			if world.editing:
				activity = "building"
			elif world.water_phase != 0:
				activity = "water"
			elif world.construction.phase != 0:
				activity = "construction"
			elif world.harvesting.phase != 0:
				activity = "harvesting"
			elif world.navigation_pending:
				activity = "planning-route"
			elif not world.waypoints.is_empty() or world.pawn.position.distance_to(world.pawn.destination) > 0.2:
				activity = "walking"
			elif world.pawn.carrying_chicken:
				activity = "carrying-chicken"
			JavaScriptBridge.eval("window.edeniaLagCapture.activity(%s)" % JSON.stringify(activity))
	calibration_elapsed += delta
	if calibration_elapsed >= 5.0:
		calibration_elapsed = 0.0
		JavaScriptBridge.eval("window.edeniaFrameTest.refreshDisplay()")
	if motion_running and is_instance_valid(motion_world):
		motion_distance += motion_world.pawn.position.distance_to(motion_previous)
		motion_previous = motion_world.pawn.position
		if not motion_world.navigation_pending and motion_world.waypoints.is_empty() and motion_world.pawn.position.distance_to(motion_world.pawn.destination) < 0.2:
			motion_outward = not motion_outward
			var target := motion_destination if motion_outward else motion_start
			walk_for_test(target)
	refresh_elapsed += delta
	if refresh_elapsed < 0.5:
		return
	refresh_elapsed = 0.0
	refresh()

func refresh() -> void:
	var state = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.edeniaFrameTest.getState())"))
	if not state is Dictionary:
		return
	var capture = JSON.parse_string(JavaScriptBridge.eval("JSON.stringify(window.edeniaLagCapture.getState())"))
	compare.disabled = state.running or capture.active or capture.busy
	capture_buttons["Log only"].visible = not capture.active
	capture_buttons["Record + compare"].visible = not capture.active
	capture_buttons["Mark lag"].visible = capture.active
	capture_buttons["Stop & keep"].visible = capture.active
	capture_buttons["Save package"].visible = not capture.active and capture.canSave
	capture_buttons["Delete selected"].visible = not capture.active and not capture.captures.is_empty()
	capture_buttons["Log only"].disabled = not capture.canStart or state.running
	capture_buttons["Record + compare"].disabled = capture_buttons["Log only"].disabled
	capture_buttons["Mark lag"].disabled = not capture.active
	capture_buttons["Stop & keep"].disabled = not capture.active
	capture_buttons["Save package"].disabled = not capture.canSave
	capture_buttons["Delete selected"].disabled = capture.busy
	capture_picker.visible = not capture.captures.is_empty() and not capture.active
	capture_picker.disabled = capture.busy
	var next_ids: Array = []
	for saved in capture.captures:
		next_ids.append(saved.id)
	if next_ids != capture_ids:
		capture_ids = next_ids
		capture_picker.clear()
		for saved in capture.captures:
			capture_picker.add_item("%s · %s run%s" % [str(saved.id).trim_prefix("tiny-swords-lag-").substr(5, 14).replace("T", " "), int(saved.runs), "s" if saved.runs != 1 else ""])
	var selected_index := capture_ids.find(capture.selectedId)
	if selected_index >= 0:
		capture_picker.select(selected_index)
	capture_summary.text = "%s%s" % [capture.status, "\n%ss left · %s pauses · %s marks\nPauses and actions logged automatically" % [int(capture.remainingSeconds), int(capture.stalls), int(capture.markers)] if capture.active else ("\n20s clip + 20s log · one ZIP" if capture.captures.is_empty() else "")]
	if not capture.active and capture.captures.size() >= 5:
		capture_summary.text += "\nFive kept · delete one to make room"
	download.disabled = not state.report is Dictionary
	var width := float(JavaScriptBridge.eval("document.getElementById('canvas').getBoundingClientRect().width"))
	var scale_ui := maxf(1.0, get_viewport().get_visible_rect().size.x / maxf(1, width))
	menu_scroll.visible = menu_column.visible
	var menu_height := maxf(40, get_viewport().get_visible_rect().size.y / scale_ui - 64)
	menu_scroll.custom_minimum_size = Vector2(230, minf(menu_height, menu_column.get_combined_minimum_size().y))
	panel.scale = Vector2.ONE * scale_ui
	panel.position = Vector2(8, 8) * scale_ui
	quick_mark.visible = capture.active
	quick_stop.visible = capture.active
	toggle.text = "FPS test · %s%s" % [state.status if state.running else "%s FPS" % state.targetFps, " · results" if state.report is Dictionary else ""]
	if capture.active:
		toggle.text = "%s · %ss left" % [("1/2 Record" if capture.paired else "Record") if capture.recording else ("2/2 Log" if capture.paired and capture.phase == "log-only" else "Log"), int(capture.remainingSeconds)]
	elif not capture.captures.is_empty():
		toggle.text = "Lag capture · %s saved" % capture.captures.size()
	summary.text = "FPS test · %s FPS\n%s" % [state.targetFps, state.status]
	if state.report is Dictionary:
		summary.text = "%s: %.1f FPS · late %.1f%%\n%s: %.1f FPS · late %.1f%%\nLoop work: %.1f%% less" % [state.report.control.targetFps, state.report.control.actualFps, state.report.control.missedDeadlinePct, state.report.trial.targetFps, state.report.trial.actualFps, state.report.trial.missedDeadlinePct, state.report.workReductionPct]
	# A top-level Container grows to its children but does not shrink itself
	# when they are hidden. Keep the closed test menu clear of the island.
	panel.call_deferred("reset_size")

func receive_motion(arguments: Array) -> void:
	if arguments.is_empty():
		return
	var operation := str(arguments[0])
	if operation in ["navigation-control", "navigation-trial"]:
		if motion_running:
			return
		var enabled := operation == "navigation-trial"
		ProjectSettings.set_setting("gameplay/bounded_obstacle_search_enabled", enabled)
		JavaScriptBridge.eval("window.edeniaFrameTestBoundedNavigation = %s" % str(enabled))
		return
	if operation in ["start", "start-obstacles"]:
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
			if operation == "start-obstacles" and arguments.size() >= 3 and cell != Vector2i(int(arguments[1]), int(arguments[2])):
				continue
			var point: Vector2 = motion_world.layout.center(cell)
			var distance := point.distance_to(motion_start)
			if distance <= best_distance or not motion_world.layout.walkable_point(point):
				continue
			if operation == "start-obstacles" and motion_world.clear_segment(motion_start, point):
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
	if operation in ["start", "start-obstacles", "round"] and motion_running:
		# Repeat the same route from the same start during every warm-up.
		motion_world.pawn.position = motion_start
		motion_previous = motion_start
		motion_outward = true
		walk_for_test(motion_destination)
	if operation == "finish" and motion_running:
		motion_distance += motion_world.pawn.position.distance_to(motion_previous)
		if OS.has_feature("web"):
			JavaScriptBridge.eval("window.edeniaFrameTestMotionInfo = %s" % JSON.stringify({"distancePixels": motion_distance, "routeLengthPixels": motion_start.distance_to(motion_destination), "speedPixelsPerSecond": motion_world.pawn.speed}))
		motion_running = false
		motion_world.movement_generation += 1
		motion_world.navigation_pending = false
		motion_world.waypoints.clear()
		motion_world.pawn.position = motion_start
		motion_world.pawn.walk_to(motion_start)

func walk_for_test(target: Vector2) -> void:
	var started := Time.get_ticks_usec()
	motion_world.walk_on_land(motion_world.layout.cell_at(target), target)
	var duration_ms := (Time.get_ticks_usec() - started) / 1000.0
	if duration_ms >= 10:
		JavaScriptBridge.eval("window.edeniaFrameTest.recordProbe('pawn-route', %s, Date.now() - %s)" % [duration_ms, duration_ms])
