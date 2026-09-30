extends CanvasLayer

signal unlock_requested(target_level: int)
signal tool_selected(tool: String)
signal edit_toggled
signal undo_requested
signal reset_requested

const REFERENCE_UI_SCALE := 920.0 / 1600.0
const STRIP_SIZE := Vector2(180, 44)

const NAMES := {"meadow": "Meadow", "gold": "Golden", "violet": "Teal", "high_meadow": "High green", "high_gold": "High gold", "tree": "Pine", "stairs": "Stairs", "ground": "Ground"}
var root: Control
var panel: PanelContainer
var launch: Button
var upgrade: Button
var max_preview_level := 3
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

func atlas(texture: Texture2D, region: Rect2) -> AtlasTexture:
	var result := AtlasTexture.new()
	result.atlas = texture
	result.region = region
	return result

func style(file: String, art_scale: float = 1.0) -> StyleBoxTexture:
	# The pack supplies separated 64px nine-slice patches, with 64px gutters.
	var source: Image = load("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/" + ("Buttons/" if file.begins_with("BigBlueButton") else "Papers/") + file).get_image()
	var assembled := Image.create(192, 192, false, Image.FORMAT_RGBA8)
	for y in range(3):
		for x in range(3):
			assembled.blit_rect(source, Rect2i(x * 128, y * 128, 64, 64), Vector2i(x * 64, y * 64))
	var is_button := file.begins_with("BigBlueButton")
	if is_button:
		# Remove only transparent outer padding; retain every painted source pixel.
		assembled = assembled.get_region(assembled.get_used_rect())
		if art_scale != 1.0:
			assembled.resize(roundi(assembled.get_width() * art_scale), roundi(assembled.get_height() * art_scale), Image.INTERPOLATE_NEAREST)
	else:
		assembled.resize(48, 48, Image.INTERPOLATE_NEAREST)
	var result := StyleBoxTexture.new()
	result.texture = ImageTexture.create_from_image(assembled)
	if is_button:
		# Repeat the straight edges and fill instead of shrinking their pixels.
		result.axis_stretch_horizontal = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
		result.axis_stretch_vertical = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]:
		result.set_texture_margin(side, roundi(16 * art_scale))
		result.set_content_margin(side, 6 if art_scale < 1.0 else 8)
	return result

func make_button(text: String, action: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	b.add_theme_stylebox_override("normal", style("BigBlueButton_Regular.png"))
	b.add_theme_stylebox_override("hover", style("BigBlueButton_Regular.png"))
	b.add_theme_stylebox_override("pressed", style("BigBlueButton_Pressed.png"))
	b.add_theme_stylebox_override("disabled", style("BigBlueButton_Pressed.png"))
	b.add_theme_font_size_override("font_size", 16)
	b.add_theme_color_override("font_color", Color("fff3d3"))
	b.add_theme_color_override("font_disabled_color", Color("a8b9b5"))
	b.custom_minimum_size = Vector2(100, 40)
	b.pressed.connect(action)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	return b

func make_icon_button(label: String, action: Callable) -> Button:
	var b := Button.new()
	b.accessibility_name = label
	b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	b.add_theme_color_override("icon_normal_color", Color.WHITE)
	b.add_theme_color_override("icon_disabled_color", Color(1, 1, 1, 0.25))
	b.pressed.connect(action)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.draw.connect(func():
		if not b.disabled and (b.get_meta("selected", false) or b.has_focus()):
			b.draw_line(Vector2(3 if b.has_node("Remaining") else b.size.x / 2 - 12, b.size.y - 3), Vector2(9 if b.has_node("Remaining") else b.size.x / 2 + 12, b.size.y - 3), Color("bd862d"), 3))
	return b

func action_icon(file: String) -> Texture2D:
	var texture: Texture2D = load("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/" + file)
	return atlas(texture, texture.get_image().get_used_rect())

func pickup_icon() -> Texture2D:
	var source := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_04.png").get_image()
	var assembled := Image.create(72, 72, false, Image.FORMAT_RGBA8)
	for y in range(2):
		for x in range(2):
			assembled.blit_rect(source, Rect2i(x * 96, y * 96, 32, 32), Vector2i(x * 40, y * 40))
	return ImageTexture.create_from_image(assembled)

func _ready() -> void:
	layer = 20
	root = Control.new()
	root.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var ui_theme := Theme.new()
	var ui_font = load("res://fonts/MedievalSharp.ttf").duplicate()
	ui_font.multichannel_signed_distance_field = true
	var weighted_font := FontVariation.new()
	weighted_font.base_font = ui_font
	weighted_font.variation_embolden = 0.5
	ui_theme.default_font = weighted_font
	root.theme = ui_theme
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	launch = make_button("Try level 2", func():
		if editing:
			collapsed = false
			refresh(editing, "", not undo_button.disabled)
		elif layout.unlocked: edit_toggled.emit()
		else: unlock_requested.emit(2))
	launch.custom_minimum_size = Vector2(110, 32)
	launch.add_theme_font_size_override("font_size", 12)
	for state in ["normal", "hover", "pressed", "disabled"]:
		launch.add_theme_stylebox_override(state, style("BigBlueButton_Pressed.png" if state in ["pressed", "disabled"] else "BigBlueButton_Regular.png", REFERENCE_UI_SCALE))
	root.add_child(launch)
	upgrade = make_button("Try level 3", func(): unlock_requested.emit(3))
	root.add_child(upgrade)
	panel = PanelContainer.new()
	panel.add_theme_stylebox_override("panel", style("BigBlueButton_Regular.png", REFERENCE_UI_SCALE))
	root.add_child(panel)
	var strip := HBoxContainer.new()
	strip.add_theme_constant_override("separation", 2)
	panel.add_child(strip)
	for kind in ["ground", "stairs", "tree"]:
		var b := make_icon_button(NAMES[kind], func(): tool_selected.emit(kind))
		b.custom_minimum_size = Vector2(128, 54)
		b.expand_icon = true
		b.add_theme_constant_override("icon_max_width", 38)
		if kind == "stairs":
			b.icon = atlas(load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png"), Rect2(0, 256, 64, 128))
			b.accessibility_description = "Requires a grass tile in the square directly below. Place beside any ground level. Adds a landing one level higher automatically.
One stair bundle includes its upper tile. Picking it up returns both."
		elif kind == "tree":
			b.icon = atlas(load("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png"), Rect2(29, 32, 136, 224))
		else:
			b.icon = atlas(load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % (3 if kind == "ground" else layout.COLORS[kind])), Rect2(512 if kind.begins_with("high_") else 192, 192, 64, 128 if kind.begins_with("high_") else 64))
		strip.add_child(b)
		buttons[kind] = b
		var remaining := Label.new()
		remaining.name = "Remaining"
		remaining.mouse_filter = Control.MOUSE_FILTER_IGNORE
		remaining.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		remaining.add_theme_font_size_override("font_size", 10)
		remaining.add_theme_color_override("font_color", Color("fff3d3"))
		remaining.add_theme_color_override("font_outline_color", Color("243c41"))
		remaining.add_theme_constant_override("outline_size", 3)
		b.add_child(remaining)
		remaining.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
		remaining.offset_left = -24
		remaining.offset_top = -13
		remaining.offset_right = -1
		remaining.offset_bottom = 0

	var pickup := make_icon_button("Pick up", func(): tool_selected.emit("remove"))
	pickup.icon = pickup_icon()
	strip.add_child(pickup)
	undo_button = make_icon_button("Undo", func(): undo_requested.emit())
	undo_button.icon = action_icon("Icons/Icon_08.png")
	strip.add_child(undo_button)
	done_button = make_icon_button("Return to walking", func(): edit_toggled.emit())
	done_button.icon = action_icon("Icons/Icon_09.png")
	done_button.custom_minimum_size = Vector2(24, 24)
	done_button.expand_icon = true
	done_button.add_theme_constant_override("icon_max_width", 14)
	root.add_child(done_button)
	action_buttons.assign([pickup, undo_button])
	for button in action_buttons:
		button.expand_icon = true
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
	for button in buttons.values() + action_buttons:
		button.custom_minimum_size = Vector2(32, 32)
		button.add_theme_constant_override("icon_max_width", roundi(button.icon.get_width() * REFERENCE_UI_SCALE) if button in action_buttons else 25)
	action_buttons[0].add_theme_constant_override("icon_max_width", 28)
	undo_button.add_theme_constant_override("icon_max_width", 25)
	root.scale = Vector2.ONE * scale_ui
	var area := size / scale_ui
	launch.size = Vector2(110, 32)
	launch.position = area - launch.size - Vector2(14, 14)
	upgrade.size = Vector2(140, 44)
	upgrade.position = Vector2(14, area.y - upgrade.size.y - 14)
	panel.size = STRIP_SIZE
	panel.position = Vector2(area.x - panel.size.x - 14, area.y - panel.size.y - 14)
	done_button.size = Vector2(24, 24)
	done_button.position = panel.position + Vector2(panel.size.x - 18, -12)
	if celebration != null:
		var fit := minf(1.0, minf((area.x - 12) / celebration.size.x, (area.y - 12) / celebration.size.y))
		celebration.scale = Vector2.ONE * fit
		celebration.position = (area - celebration.size) / 2

func refresh(is_editing: bool, selected: String, can_undo: bool) -> void:
	if not is_editing:
		collapsed = false
	editing = is_editing
	arrange()
	launch.text = "Inventory" if editing and collapsed else ("Build island" if layout.unlocked else "Try level 2")
	launch.visible = (not editing or collapsed) and celebration == null and (layout.unlocked or max_preview_level > 1)
	upgrade.visible = layout.level == 2 and max_preview_level >= 3 and celebration == null and not editing
	panel.visible = editing and not collapsed and celebration == null
	done_button.visible = panel.visible
	for kind in buttons:
		var count: int = layout.ground_count() if kind == "ground" else layout.stock[kind]
		buttons[kind].accessibility_name = "%s, %s available" % [NAMES[kind], count]
		buttons[kind].get_node("Remaining").text = "×%s" % count
		buttons[kind].disabled = count == 0
		buttons[kind].mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if buttons[kind].disabled else Control.CURSOR_POINTING_HAND
		buttons[kind].set_meta("selected", kind == selected)
		buttons[kind].queue_redraw()
	action_buttons[0].set_meta("selected", selected == "remove")
	action_buttons[0].queue_redraw()
	undo_button.disabled = not can_undo
	undo_button.mouse_default_cursor_shape = Control.CURSOR_FORBIDDEN if undo_button.disabled else Control.CURSOR_POINTING_HAND
	arrange()

func celebrate() -> void:
	done_button.hide()
	launch.hide()
	upgrade.hide()
	panel.hide()
	celebration = preload("res://scenes/level_up_popup.tscn").instantiate()
	root.add_child(celebration)
	celebration.configure(layout.level)
	celebration.get_node("BuildButton").pressed.connect(func():
		celebration.queue_free()
		celebration = null
		edit_toggled.emit())
	arrange()
	celebration.pivot_offset = celebration.size / 2
	var final_scale: Vector2 = celebration.scale
	celebration.scale = final_scale * 0.65
	celebration.modulate.a = 0
	var tween := create_tween().set_parallel(true)
	tween.tween_property(celebration, "scale", final_scale, 0.7).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
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
