@tool
extends Control

## Local design draft. All state is simulated, in memory only.
@export_range(1, 20) var preview_level := 5:
	set(value):
		preview_level = value
		if is_node_ready(): refresh_rows()
@export var achievement_titles := PackedStringArray(["Cut a tree", "Build a house", "Pick up a chicken", "Unlock the rubber duck", "Have a chicken lay an egg", "Disappear inside a black hole"]):
	set(value):
		achievement_titles = value
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

func _ready() -> void:
	refresh_rows()
	if Engine.is_editor_hint(): return
	$Modal.visible = start_open
	$AchievementButton.pressed.connect(func(): $Modal.visible = not $Modal.visible)
	$Modal/Sheet/Close.pressed.connect(func(): $Modal.hide())
	$Modal/Backdrop.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.pressed: $Modal.hide())
	$DraftControls/Level.value = preview_level
	$DraftControls/Level.value_changed.connect(func(value): preview_level = int(value))
	$DraftControls/AllDone.pressed.connect(func():
		completed = PackedByteArray([1, 1, 1, 1, 1, 1])
		preview_level = 20
		$DraftControls/Level.value = 20)
	$DraftControls/Reset.pressed.connect(func(): completed = PackedByteArray([0, 0, 0, 0, 0, 0]))
	for index in 6:
		$Modal/Sheet/Rows.get_child(index).pressed.connect(func():
			if index < completed.size():
				completed[index] = 0 if completed[index] else 1
				refresh_rows())
	resized.connect(arrange)
	arrange()

func arrange() -> void:
	var sheet := $Modal/Sheet
	var fit := minf(1.0, minf((size.x - 12.0) / sheet.size.x, (size.y - 12.0) / sheet.size.y))
	sheet.scale = Vector2.ONE * maxf(0.1, fit)
	sheet.position = (size - sheet.size * sheet.scale) / 2.0

func refresh_rows() -> void:
	var done_count := 0
	for index in 6:
		var row := $Modal/Sheet/Rows.get_child(index)
		var level: int = unlock_levels[index] if index < unlock_levels.size() else 1
		var done: bool = index < completed.size() and completed[index] != 0
		var locked := preview_level < level and not done
		row.get_node("Title").text = achievement_titles[index] if index < achievement_titles.size() else "Achievement"
		row.get_node("Title").modulate = Color("898579") if locked else Color("44392d")
		row.get_node("Status").text = "Level %d" % level if locked else ""
		row.get_node("Tick").visible = done
		row.disabled = locked
		done_count += 1 if done else 0
	$Modal/Sheet/Progress.text = "%d / 6 completed" % done_count
	$DraftControls/State.text = "Draft · level"

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		$Modal.hide()
		get_viewport().set_input_as_handled()
