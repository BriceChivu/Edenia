extends CanvasLayer

signal unlock_requested(target_level: int)
signal tool_selected(tool: String)
signal edit_toggled
signal undo_requested
signal reset_requested

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

func style(file: String, _margins: int = 64) -> StyleBoxTexture:
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
	else:
		assembled.resize(48, 48, Image.INTERPOLATE_NEAREST)
	var result := StyleBoxTexture.new()
	result.texture = ImageTexture.create_from_image(assembled)
	if is_button:
		# Repeat the straight edges and fill instead of shrinking their pixels.
		result.axis_stretch_horizontal = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
		result.axis_stretch_vertical = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]:
		result.set_texture_margin(side, 16)
		result.set_content_margin(side, 8)
	return result

func ribbon_texture() -> Texture2D:
	var source: Image = load("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Ribbons/BigRibbons.png").get_image()
	var assembled := Image.create(320, 128, false, Image.FORMAT_RGBA8)
	assembled.blit_rect(source, Rect2i(0, 256, 128, 128), Vector2i.ZERO)
	assembled.blit_rect(source, Rect2i(192, 256, 64, 128), Vector2i(128, 0))
	assembled.blit_rect(source, Rect2i(320, 256, 128, 128), Vector2i(192, 0))
	return ImageTexture.create_from_image(assembled)

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
			b.draw_line(Vector2(b.size.x / 2 - 12, b.size.y - 3), Vector2(b.size.x / 2 + 12, b.size.y - 3), Color("bd862d"), 3))
	return b

func action_icon(file: String) -> Texture2D:
	var texture: Texture2D = load("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/" + file)
	return atlas(texture, texture.get_image().get_used_rect())

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
	root.add_child(launch)
	upgrade = make_button("Try level 3", func(): unlock_requested.emit(3))
	root.add_child(upgrade)
	panel = PanelContainer.new()
	panel.add_theme_stylebox_override("panel", style("BigBlueButton_Regular.png"))
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
			b.accessibility_description = "Place beside flat ground. Adds its upper landing automatically.
One stair bundle includes its upper tile. Picking it up returns both."
		elif kind == "tree":
			b.icon = atlas(load("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png"), Rect2(0, 0, 192, 256))
		else:
			b.icon = atlas(load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % (3 if kind == "ground" else layout.COLORS[kind])), Rect2(512 if kind.begins_with("high_") else 192, 192, 64, 128 if kind.begins_with("high_") else 64))
		strip.add_child(b)
		buttons[kind] = b
	var pickup := make_icon_button("Pick up", func(): tool_selected.emit("remove"))
	pickup.icon = action_icon("Cursors/Cursor_02.png")
	strip.add_child(pickup)
	undo_button = make_icon_button("Undo", func(): undo_requested.emit())
	undo_button.icon = action_icon("Icons/Icon_08.png")
	strip.add_child(undo_button)
	done_button = make_icon_button("Return to walking", func(): edit_toggled.emit())
	done_button.icon = action_icon("Icons/Icon_07.png")
	strip.add_child(done_button)
	action_buttons.assign([pickup, undo_button, done_button])
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
		button.custom_minimum_size = Vector2(44, 44) if compact else Vector2(56, 48)
		button.add_theme_constant_override("icon_max_width", 36 if compact else 40)
	root.scale = Vector2.ONE * scale_ui
	var area := size / scale_ui
	launch.size = Vector2(140, 44)
	launch.position = area - launch.size - Vector2(14, 14)
	upgrade.size = Vector2(140, 44)
	upgrade.position = Vector2(14, area.y - upgrade.size.y - 14)
	panel.size = Vector2(290, 60) if compact else Vector2(362, 64)
	panel.position = Vector2(area.x - panel.size.x - 14, area.y - panel.size.y - 14)
	if celebration != null:
		var fit := minf(1.0, minf((area.x - 12) / 470.0, (area.y - 12) / 300.0))
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
	for kind in buttons:
		var count: int = layout.ground_count() if kind == "ground" else layout.stock[kind]
		buttons[kind].accessibility_name = "%s, %s available" % [NAMES[kind], count]
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
	launch.hide()
	upgrade.hide()
	panel.hide()
	celebration = Control.new()
	celebration.size = Vector2(470, 300)
	root.add_child(celebration)
	var paper := Panel.new()
	paper.position = Vector2(25, 56)
	paper.size = Vector2(420, 240)
	paper.add_theme_stylebox_override("panel", style("RegularPaper.png"))
	celebration.add_child(paper)
	var ribbon := TextureRect.new()
	ribbon.texture = ribbon_texture()
	ribbon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ribbon.size = Vector2(470, 118)
	celebration.add_child(ribbon)
	var heading := Label.new()
	heading.text = "LEVEL TWO!" if layout.level == 2 else "LEVEL THREE!"
	heading.position = Vector2(0, 34)
	heading.size = Vector2(470, 45)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 30)
	heading.add_theme_color_override("font_color", Color("fff3cf"))
	heading.add_theme_color_override("font_shadow_color", Color("62402b"))
	heading.add_theme_constant_override("shadow_offset_y", 2)
	celebration.add_child(heading)
	var message := Label.new()
	message.text = ("Congratulations! Start shaping your island.\n\n4 new items: 3 ground tiles + 1 stair bundle.\nThe stair includes its upper landing.\nYour island grows from here." if layout.level == 2 else "Congratulations! More room to create.\n\n5 new items: 3 ground tiles, 1 stair, 1 pine.\nThe stair includes its upper landing.\nEverything you built stays in place.")
	message.position = Vector2(40, 113)
	message.size = Vector2(390, 105)
	message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message.add_theme_font_size_override("font_size", 16)
	message.add_theme_color_override("font_color", Color("57452f"))
	celebration.add_child(message)
	var start := make_button("Start building" if layout.level == 2 else "Keep building", func():
		celebration.queue_free()
		celebration = null
		edit_toggled.emit())
	start.position = Vector2(145, 235)
	start.size = Vector2(180, 44)
	celebration.add_child(start)
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
