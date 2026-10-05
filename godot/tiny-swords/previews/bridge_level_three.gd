extends "res://previews/preview_entry.gd"

## Fresh level-three sandbox with a two-square water gap ready for the bridge.
func _ready() -> void:
	start_mode = StartMode.LEVEL_THREE
	camera_save_enabled = false
	super._ready()
	layout.cells = {Vector2i(0, 0): "high_gold", Vector2i(3, 0): "high_gold", Vector2i(0, 1): "meadow", Vector2i(3, 1): "meadow", Vector2i(4, 1): "meadow"}
	layout.elevations.clear()
	layout.flora.clear()
	layout.decorations.clear()
	pawn.position = layout.center(Vector2i.ZERO)
	pawn.walk_to(pawn.position)
	game_camera.position = Vector2(672, 208)
	game_camera.zoom = Vector2.ONE
	selected = ""
	rebuild_decorations()
	refresh()
