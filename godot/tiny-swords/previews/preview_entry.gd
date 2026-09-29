extends "res://scripts/level_two_preview.gd"

## Fresh editor entry points. Never load or write the persistent local preview.
enum StartMode { LEVEL_ONE, LEVEL_ONE_TO_TWO, LEVEL_TWO }
@export var start_mode: StartMode = StartMode.LEVEL_ONE

func _ready() -> void:
	preview_save_enabled = false
	super._ready()
	if start_mode == StartMode.LEVEL_TWO:
		layout.unlock()
		toggle_editing()

func refresh() -> void:
	super.refresh()
	if start_mode == StartMode.LEVEL_ONE:
		ui.launch.hide()

func unlock_level_two() -> void:
	if start_mode != StartMode.LEVEL_ONE:
		# The transition entry uses the same rewards and animated ribbon as Edenia.
		super.unlock_level_two()
