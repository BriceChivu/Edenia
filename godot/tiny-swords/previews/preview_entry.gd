extends "res://scripts/level_two_preview.gd"

## Fresh editor entry points. Never load or write the persistent local preview.
enum StartMode { LEVEL_ONE, LEVEL_ONE_TO_TWO, LEVEL_TWO, LEVEL_TWO_TO_THREE, LEVEL_THREE }
@export var start_mode: StartMode = StartMode.LEVEL_ONE

func _ready() -> void:
	preview_save_enabled = false
	super._ready()
	ui.max_preview_level = 1 if start_mode == StartMode.LEVEL_ONE else (2 if start_mode in [StartMode.LEVEL_ONE_TO_TWO, StartMode.LEVEL_TWO] else 3)
	if start_mode in [StartMode.LEVEL_TWO, StartMode.LEVEL_TWO_TO_THREE, StartMode.LEVEL_THREE]:
		layout.unlock(2)
	if start_mode == StartMode.LEVEL_THREE:
		layout.unlock(3)
	if start_mode in [StartMode.LEVEL_TWO, StartMode.LEVEL_THREE]:
		toggle_editing()
	refresh()
