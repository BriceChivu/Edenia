extends CanvasLayer

signal tool_selected(tool: String)
signal edit_toggled
signal undo_requested
signal reset_requested

const NAMES := {"meadow": "Meadow", "gold": "Golden", "violet": "Teal", "high_meadow": "High green", "high_gold": "High gold", "tree": "Tree", "stairs": "Stairs", "ground": "Ground", "bridge": "Bridge", "chicken": "Chicken", "sheep": "Sheep", "house": "House", "remove": "Pick up"}
var root: Control
var panel: Control
var launch: Button
var max_preview_level := preload("res://scripts/terrain_layout.gd").XP_THRESHOLDS.size()
var buttons := {}
var action_buttons: Array[Button] = []
var compact := false
var undo_button: Button
var done_button: Button
var celebration: Control
var layout
var editing := false
var collapsed := false
var scale_ui := 1.0

func _ready() -> void:
	layer = 20
	root = preload("res://scenes/terrain_ui.tscn").instantiate()
	add_child(root)
	launch = root.get_node("TerrainButton")
	panel = root.get_node("TerrainButton2")
	undo_button = root.get_node("TerrainButton2/Tools/UndoButton")
	done_button = root.get_node("TerrainButton2/CloseButton")
	launch.pressed.connect(func():
		if editing:
			collapsed = false
			refresh(editing, "", not undo_button.disabled)
		elif layout.unlocked: edit_toggled.emit())
	for kind in ["ground", "stairs", "tree", "bridge", "sheep", "house"]:
		var icon_parent := "TerrainButton2/Tools/" + ("TallIconsClip/" if kind in ["stairs", "tree", "tree2"] else "")
		var button: Button = root.get_node(icon_parent + kind.capitalize().replace(" ", "") + "Button")
		buttons[kind] = button
		button.pressed.connect(func(): tool_selected.emit(kind))
	var chicken: Button = buttons.sheep.duplicate(14)
	chicken.name = "ChickenButton"
	chicken.icon = preload("res://assets/chicken.png")
	chicken.tooltip_text = "Chicken"
	panel.get_node("Tools").add_child(chicken)
	chicken.pressed.connect(func(): tool_selected.emit("chicken"))
	buttons.chicken = chicken
	var pickup: Button = root.get_node("TerrainButton2/Tools/PickupButton")
	pickup.pressed.connect(func(): tool_selected.emit("remove"))
	undo_button.pressed.connect(func(): undo_requested.emit())
	done_button.pressed.connect(func(): edit_toggled.emit())
	action_buttons.assign([pickup, undo_button])
	panel.hide()
	get_viewport().size_changed.connect(arrange)
	arrange()

func arrange() -> void:
	var size := get_viewport().get_visible_rect().size
	var physical := Vector2(get_window().size)
	if OS.has_feature("web"):
		physical.x = float(JavaScriptBridge.eval("document.getElementById('canvas').getBoundingClientRect().width"))
	scale_ui = maxf(1.0, size.x / maxf(physical.x, 1))
	compact = physical.x < 500
	root.scale = Vector2.ONE * scale_ui
	var area := size / scale_ui
	root.size = area
	var extra := (34 if layout.level >= 5 else 0) + (34 if layout.level >= 2 else 0)
	panel.offset_left = (-274 if layout.bridges_enabled else -206) - extra
	var tools := root.get_node("TerrainButton2/Tools")
	tools.get_node("PickupButton").position.x = (252 if layout.bridges_enabled else 184) + extra
	buttons.sheep.position.x = 252 if layout.bridges_enabled else 184
	buttons.chicken.position.x = (252 if layout.bridges_enabled else 184) + (34 if layout.level >= 5 else 0)
	buttons.house.position.x = 286 if layout.bridges_enabled else 218
	undo_button.position.x = (285 if layout.bridges_enabled else 217) + extra
	if celebration != null:
		# Keep the paper corners and tiled middle at native pixel size.
		celebration.scale = Vector2.ONE
		celebration.position = (area - celebration.size) / 2

func refresh(is_editing: bool, selected: String, can_undo: bool) -> void:
	if not is_editing:
		collapsed = false
	editing = is_editing
	arrange()
	launch.accessibility_name = "Inventory" if editing and collapsed else "Terrain"
	launch.tooltip_text = launch.accessibility_name
	launch.visible = (not editing or collapsed) and celebration == null and layout.unlocked
	panel.visible = editing and not collapsed and celebration == null
	done_button.visible = panel.visible
	for kind in buttons:
		var unlocked := false
		for reward_level in layout.LEVEL_REWARDS:
			if reward_level <= layout.level:
				for reward_kind in layout.LEVEL_REWARDS[reward_level]:
					if reward_kind == kind or (kind == "ground" and reward_kind not in ["tree", "stairs", "bridge", "sheep", "chicken", "house"]):
						unlocked = true
		# Show the empty tree slot at level 2 as a hint of the next reward.
		buttons[kind].visible = kind != "house" and (unlocked or (kind == "tree" and layout.level >= 2)) and (kind != "bridge" or layout.bridges_enabled)
		var count: int = layout.ground_count() if kind == "ground" else (int(layout.stock.house) + int(layout.resources.wood) / layout.HOUSE_LOG_COST if kind == "house" else int(layout.stock[kind]))
		if kind == "house":
			buttons[kind].tooltip_text = "House: %s logs (%s available). Click a placed house to rotate." % [layout.HOUSE_LOG_COST, layout.resources.wood]
		buttons[kind].accessibility_name = "%s, %s available" % [NAMES[kind], count]
		buttons[kind].get_node("Remaining").text = "×%s" % count
		# Ground and trees stay selectable for free transformations.
		for state in ["normal", "hover", "pressed", "focus", "hover_pressed"]:
			buttons[kind].add_theme_color_override("icon_" + state + "_color", Color(1, 1, 1, 0.25 if count == 0 else 1.0))
		buttons[kind].disabled = (count == 0 and kind not in ["ground", "tree", "house", "stairs"]) or (kind == "bridge" and not layout.bridges_enabled)
		buttons[kind].mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if buttons[kind].disabled else Control.CURSOR_POINTING_HAND
		buttons[kind].set_meta("selected", kind == selected)
		buttons[kind].queue_redraw()
	action_buttons[0].set_meta("selected", selected == "remove")
	action_buttons[0].queue_redraw()
	undo_button.disabled = not can_undo
	undo_button.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if undo_button.disabled else Control.CURSOR_POINTING_HAND
	arrange()

func celebrate(target_level: int = 0) -> void:
	var popup_level := target_level if target_level > 0 else int(layout.level)
	done_button.hide()
	launch.hide()
	panel.hide()
	var popup_scene := preload("res://scenes/grass_level_popup.tscn") if popup_level >= 6 else preload("res://scenes/level_five_popup.tscn") if popup_level == 5 else preload("res://scenes/level_four_popup.tscn") if popup_level == 4 else preload("res://scenes/level_three_popup.tscn") if popup_level == 3 else preload("res://scenes/level_up_popup.tscn")
	celebration = popup_scene.instantiate()
	root.add_child(celebration)
	celebration.configure(popup_level, layout.bridges_enabled)
	celebration.get_node("BuildButton").pressed.connect(func():
		celebration.queue_free()
		celebration = null
		edit_toggled.emit())
	arrange()
	celebration.pivot_offset = celebration.size / 2
	celebration.modulate.a = 0
	var tween := create_tween().set_parallel(true)
	tween.tween_property(celebration, "modulate:a", 1.0, 0.35)
	for i in range(18):
		var spark := ColorRect.new()
		spark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spark.color = [Color("ffd67d"), Color("fff0c1"), Color("75b99c")][i % 3]
		spark.size = Vector2(6, 6)
		spark.position = Vector2(235, 60)
		celebration.add_child(spark)
		var burst := create_tween().set_parallel(true)
		burst.tween_property(spark, "position", Vector2(235 + randf_range(-230, 230), randf_range(-40, 250)), 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		burst.tween_property(spark, "modulate:a", 0.0, 1.2)
