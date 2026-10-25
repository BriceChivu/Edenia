@tool
extends Control

## Local design draft. Completion is an authored fixture, never a player control.
@export_enum("en", "zh-Hant", "zh-Hans", "es", "fr") var preview_locale := "en":
	set(value):
		preview_locale = value
		if is_node_ready(): refresh_rows()
@export_range(1, 20) var preview_level := 5:
	set(value):
		preview_level = value
		if is_node_ready(): refresh_rows()
@export var achievement_keys := PackedStringArray(["achievementTree", "achievementHouse", "achievementChicken", "achievementDuck", "achievementEgg", "achievementBlackHole"]):
	set(value):
		achievement_keys = value
		if is_node_ready(): refresh_rows()
## Duck and egg levels are provisional: these do not have level gates in the game.
@export var unlock_levels := PackedInt32Array([4, 5, 2, 2, 2, 6]):
	set(value):
		unlock_levels = value
		if is_node_ready(): refresh_rows()
@export var completed := PackedByteArray([1, 0, 1, 0, 0, 0]):
	set(value):
		completed = value
		if is_node_ready(): refresh_rows()
@export var start_open := true
var editor_catalogs := {}

func _ready() -> void:
	if not Engine.is_editor_hint():
		var language := preview_locale
		if OS.has_feature("web"):
			language = str(JavaScriptBridge.eval("new URLSearchParams(location.search).get('locale') || 'en'"))
		GameCopy.set_locale(language)
		GameCopy.changed.connect(refresh_rows)
	refresh_rows()
	if Engine.is_editor_hint(): return
	$Modal.visible = start_open
	$AchievementButton.pressed.connect(func(): $Modal.visible = not $Modal.visible)
	$Modal/Sheet/Close.pressed.connect(func(): $Modal.hide())
	$Modal/Backdrop.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed: $Modal.hide())
	resized.connect(arrange)
	arrange()

func arrange() -> void:
	var sheet := $Modal/Sheet
	# A small popover immediately above the launcher; leave the island visible.
	var icon: Rect2 = $AchievementButton.get_rect()
	var fit := minf(0.85, minf((size.x - 12.0) / sheet.size.x, (icon.position.y - 8.0) / sheet.size.y))
	sheet.scale = Vector2.ONE * maxf(0.1, fit)
	sheet.position = Vector2(maxf(6.0, size.x - sheet.size.x * sheet.scale.x - 6.0), maxf(6.0, icon.position.y - 8.0 - sheet.size.y * sheet.scale.y))

func copy_text(key: String, params := {}) -> String:
	if not Engine.is_editor_hint(): return GameCopy.text(key, params)
	if not editor_catalogs.has(preview_locale):
		editor_catalogs[preview_locale] = JSON.parse_string(FileAccess.get_file_as_string("res://i18n/%s.json" % preview_locale))
	var result: String = editor_catalogs[preview_locale].get(key, key)
	for param in params: result = result.replace("{%s}" % param, str(params[param]))
	return result

func refresh_rows() -> void:
	if Engine.is_editor_hint():
		theme.default_font = load("res://fonts/EdeniaNotoTC.otf" if preview_locale == "zh-Hant" else "res://fonts/EdeniaNotoSC.otf" if preview_locale == "zh-Hans" else "res://fonts/MedievalSharp.ttf")
	else:
		GameCopy.theme(self)
	var title := copy_text("achievements")
	var heading: Label = $Modal/Sheet/Ribbon/Title
	heading.text = title
	# The reference uses a bold, centered title inside the original ribbon face.
	var heading_font := FontVariation.new()
	heading_font.base_font = theme.default_font
	heading_font.variation_embolden = 1.0
	heading.add_theme_font_override("font", heading_font)
	var heading_size := 56
	while heading_size > 28 and heading_font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, heading_size).x > heading.size.x - 12.0:
		heading_size -= 1
	heading.add_theme_font_size_override("font_size", heading_size)
	$AchievementButton.tooltip_text = title
	$AchievementButton.accessibility_name = title
	$Modal/Sheet/Close.tooltip_text = copy_text("closeAchievements")
	$Modal/Sheet/Close.accessibility_name = copy_text("closeAchievements")
	var done_count := 0
	for index in 6:
		var row := $Modal/Sheet/Rows.get_child(index)
		var level: int = unlock_levels[index] if index < unlock_levels.size() else 1
		var done: bool = index < completed.size() and completed[index] != 0
		var locked := preview_level < level and not done
		var label: Label = row.get_node("Title")
		label.text = copy_text(achievement_keys[index]) if index < achievement_keys.size() else ""
		label.modulate = Color("898579") if locked else Color("44392d")
		var font_size := 18
		while font_size > 14 and label.get_theme_font("font").get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > label.size.x:
			font_size -= 1
		label.add_theme_font_size_override("font_size", font_size)
		var status := copy_text("level", {"level": level}) if locked else ""
		row.get_node("Status").text = status
		row.get_node("Tick").visible = done
		row.accessibility_name = label.text
		row.accessibility_description = status if locked else copy_text("achievementCompleted" if done else "achievementPending")
		done_count += 1 if done else 0
	$Modal/Sheet/Progress.text = copy_text("achievementProgress", {"count": done_count, "total": 6})

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		$Modal.hide()
		get_viewport().set_input_as_handled()
