extends "res://scripts/level_two_preview.gd"

## Fresh editor entry points. Never load or write the persistent local preview.
enum StartMode { LEVEL_ONE, LEVEL_ONE_TO_TWO, LEVEL_TWO, LEVEL_TWO_TO_THREE, LEVEL_THREE, LEVEL_THREE_TO_FOUR, LEVEL_FOUR, LEVEL_FOUR_TO_FIVE, LEVEL_FIVE }
@export_range(0, 10) var starting_level := 0
@export var start_mode: StartMode = StartMode.LEVEL_ONE

func _ready() -> void:
	preview_save_enabled = false
	super._ready()
	ui.max_preview_level = 1 if start_mode == StartMode.LEVEL_ONE else (2 if start_mode in [StartMode.LEVEL_ONE_TO_TWO, StartMode.LEVEL_TWO] else (5 if start_mode >= StartMode.LEVEL_FOUR_TO_FIVE else (4 if start_mode >= StartMode.LEVEL_THREE_TO_FOUR else 3)))
	if start_mode in [StartMode.LEVEL_TWO, StartMode.LEVEL_TWO_TO_THREE, StartMode.LEVEL_THREE, StartMode.LEVEL_THREE_TO_FOUR, StartMode.LEVEL_FOUR, StartMode.LEVEL_FOUR_TO_FIVE, StartMode.LEVEL_FIVE]:
		layout.unlock(2)
	if start_mode >= StartMode.LEVEL_THREE:
		layout.unlock(3)
	if start_mode >= StartMode.LEVEL_FOUR:
		layout.unlock(4)
	if start_mode == StartMode.LEVEL_FIVE:
		layout.unlock(5)
	if start_mode in [StartMode.LEVEL_TWO, StartMode.LEVEL_THREE, StartMode.LEVEL_FOUR, StartMode.LEVEL_FIVE]:
		toggle_editing()
	if starting_level > 0:
		ui.max_preview_level = Layout.XP_THRESHOLDS.size()
		while layout.level < starting_level:
			layout.unlock(layout.level + 1)
		if starting_level >= 2 and not editing:
			toggle_editing()
	refresh()
