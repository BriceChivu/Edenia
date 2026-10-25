extends Control

const Rules = preload("res://scripts/achievement_rules.gd")
var layout
var launcher: Button

func _ready() -> void:
	$Modal.hide()
	$AchievementButton.pressed.connect(func(): set_open(not $Modal.visible))
	$Modal/Backdrop.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed:
			set_open(false)
			$Modal/Backdrop.accept_event())
	resized.connect(arrange)
	GameCopy.changed.connect(refresh)

func bind(island, terrain_launcher: Button) -> void:
	layout = island
	launcher = terrain_launcher
	layout.achievements_changed.connect(refresh)
	launcher.visibility_changed.connect(refresh)
	for state in ["normal", "hover", "pressed", "focus", "hover_pressed", "disabled"]:
		$AchievementButton.add_theme_color_override("icon_" + state + "_color", launcher.get_theme_color("icon_" + state + "_color"))
	refresh()

func set_open(open: bool) -> void:
	$Modal.visible = open and $AchievementButton.visible
	if $Modal.visible: refresh()

func is_open() -> bool:
	return $Modal.visible

func arrange() -> void:
	var sheet: Control = $Modal/Sheet
	var icon: Rect2 = $AchievementButton.get_rect()
	var fit := minf(0.85, minf((size.x - 12.0) / sheet.size.x, (icon.position.y - 8.0) / sheet.size.y))
	sheet.scale = Vector2.ONE * maxf(0.1, fit)
	sheet.position = Vector2(maxf(6.0, size.x - sheet.size.x * sheet.scale.x - 6.0), maxf(6.0, icon.position.y - 8.0 - sheet.size.y * sheet.scale.y))

func refresh() -> void:
	if layout == null: return
	$AchievementButton.visible = launcher.visible
	if not launcher.visible: $Modal.hide()
	GameCopy.theme(self)
	var title := GameCopy.text("achievements")
	var heading: Label = $Modal/Sheet/Ribbon/Title
	heading.text = title
	var heading_font := FontVariation.new()
	heading_font.base_font = theme.default_font
	heading_font.variation_embolden = 1.0
	heading.add_theme_font_override("font", heading_font)
	var heading_size := 56
	while heading_size > 28 and heading_font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, heading_size).x > heading.size.x - 12.0:
		heading_size -= 1
	heading.add_theme_font_size_override("font_size", maxi(24, roundi(heading_size * 0.92)))
	$AchievementButton.tooltip_text = title
	$AchievementButton.accessibility_name = title
	var done_count := 0
	for index in Rules.DEFINITIONS.size():
		var item: Dictionary = Rules.DEFINITIONS[index]
		var row: Control = $Modal/Sheet/Rows.get_child(index)
		var done: bool = layout.achievements.get(item.id, false)
		var unavailable: bool = item.level == 0
		var locked: bool = unavailable or layout.level < item.level
		var label: Label = row.get_node("Title")
		label.text = GameCopy.text(item.title)
		label.modulate = Color("898579") if locked and not done else Color("44392d")
		var font_size := 18
		while font_size > 14 and label.get_theme_font("font").get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > 292.0:
			font_size -= 1
		label.add_theme_font_size_override("font_size", font_size)
		var status := GameCopy.text("achievementComingSoon") if unavailable else GameCopy.text("level", {"level": item.level}) if locked and not done else ""
		row.get_node("Status").text = status
		row.get_node("Tick").visible = done
		row.accessibility_name = label.text
		row.accessibility_description = status if not status.is_empty() else GameCopy.text("achievementCompleted" if done else "achievementPending")
		done_count += 1 if done else 0
	$Modal/Sheet/Progress.text = GameCopy.text("achievementProgress", {"count": done_count, "total": Rules.DEFINITIONS.size()})
	arrange()
