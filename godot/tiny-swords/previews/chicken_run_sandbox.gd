extends "res://scripts/level_two_preview.gd"

## Local visual review fixture; every reload starts fresh.
func _ready() -> void:
	preview_save_enabled = false
	camera_save_enabled = false
	island_start_enabled = false
	super._ready()
	layout.level = 10
	layout.manual_ground_elevation = true
	layout.cells.clear()
	layout.elevations.clear()
	layout.stair_directions.clear()
	layout.trees.clear()
	layout.tree_types.clear()
	layout.flora.clear()
	layout.decorations.clear()
	layout.houses.clear()
	layout.sheep.clear()
	layout.chickens.clear()
	for y in range(-4, 5):
		for x in range(-6, 7):
			var cell := Vector2i(x, y)
			layout.cells[cell] = "meadow"
			if x >= 2 and y <= 1:
				layout.cells[cell] = "high_gold"
				layout.elevations[cell] = 64
	for y in [-2, 0]:
		var ramp := Vector2i(1, y)
		layout.cells[ramp] = "stairs"
		layout.stair_directions[ramp] = Vector2i.RIGHT
	layout.houses[Vector2i(-4, -2)] = 0
	layout.houses[Vector2i(4, -2)] = 1
	layout.house_colors[Vector2i(4, -2)] = 1
	var tree_cells := [Vector2i(-6, -3), Vector2i(-1, -3), Vector2i(6, -3), Vector2i(-5, 3), Vector2i(1, 3), Vector2i(5, 3)]
	for i in tree_cells.size():
		layout.trees[tree_cells[i]] = true
		layout.tree_types[tree_cells[i]] = Layout.TREE_VARIANTS[i % 4]
	for cell in [Vector2i(-2, 1), Vector2i(3, 1), Vector2i(5, -4), Vector2i(-6, 1)]:
		layout.decorations[cell] = {"kind": "land_rock", "variant": 1}
	for cell in [Vector2i(-3, 3), Vector2i(6, 1), Vector2i(0, -4)]:
		layout.decorations[cell] = {"kind": "bush", "variant": 2}
	layout.chickens.assign([layout.center(Vector2i(-2, 0)), layout.center(Vector2i(3, 0))])
	layout.sheep.assign([layout.center(Vector2i(-3, 2)), layout.center(Vector2i(4, 2))])
	pawn.position = layout.center(Vector2i.ZERO)
	pawn.walk_to(pawn.position)
	editing = false
	rebuild_decorations()
	refresh()
	game_camera.position = layout.center(Vector2i(0, 0)) - Vector2(0, 50)
	game_camera.zoom = Vector2.ONE * 0.95
