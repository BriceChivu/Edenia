extends "res://scripts/level_two_preview.gd"

# Disposable visualization of a saved island. Never loads native/browser saves,
# applies study claims, advances action clocks, or offers gameplay input.
func _ready() -> void:
	preview_save_enabled = false
	camera_save_enabled = false
	playground_enabled = false
	island_start_enabled = true
	process_mode = Node.PROCESS_MODE_DISABLED
	super._ready()
	ui.hide()
	pointer.hide()
	$Clouds.hide()
	$PassingCloud.hide()
	if arrival != null:
		arrival.root.hide()
	set_process_input(false)
	set_process_unhandled_input(false)

func save_layout(_animal_checkpoint: bool = false) -> void:
	pass

func house_placement_active() -> bool:
	return false

func capture_restore(snapshot: Dictionary) -> bool:
	if not restore_saved_layout(snapshot.duplicate(true), false):
		return false
	ui.hide()
	pointer.hide()
	$Clouds.hide()
	$PassingCloud.hide()
	if arrival != null:
		arrival.root.hide()
	return true
