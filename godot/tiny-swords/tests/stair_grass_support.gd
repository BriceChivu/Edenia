extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		var layout = load("res://scripts/terrain_layout.gd").new()
		layout.unlock(2)
		layout.unlock(3)
		var stair := Vector2i(4, 0)
		var below := stair + Vector2i.DOWN
		layout.cells = {stair - direction: "meadow", Vector2i.ZERO: "meadow", Vector2i(0, 1): "meadow", Vector2i(0, 2): "meadow", Vector2i(0, 3): "meadow"}
		layout.flora.clear()
		check(layout.edit(stair, "stairs", Vector2i.ZERO), "Water below allows either stair orientation")
		check(layout.stair_direction(stair) == direction, "Stair retains its intended direction")
		check(not layout.cells.has(below), "Placing stairs leaves water below untouched")
		check(layout.can_cross(stair - direction, stair) and layout.can_cross(stair, stair + direction), "Stair still connects its foot and landing")
		check(layout.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))), "Stairs without grass below survive a save")
		check(layout.edit(below, "ground", Vector2i.ZERO), "Ground can be placed below stairs")
		check(layout.edit(below, "remove", Vector2i.ZERO), "Ground below stairs can be picked up independently")
		check(layout.edit(below, "ground", Vector2i.ZERO), "Ground can be restored below stairs")
		layout.cells[below - direction] = "meadow"
		check(layout.edit(below, "stairs", Vector2i.ZERO), "Ground below stairs can become another stair")
		check(layout.edit(stair, "remove", Vector2i.ZERO), "Upper stair can be picked up independently")
		check(layout.edit(stair, "stairs", Vector2i.ZERO), "Another stair below allows placement")
	var bundles = load("res://scripts/terrain_layout.gd").new()
	bundles.unlock(2)
	bundles.cells = {Vector2i(1,0): "stairs", Vector2i(2,0): "high_gold", Vector2i(2,-1): "stairs"}
	bundles.stair_directions[Vector2i(1,0)] = Vector2i.RIGHT
	check(bundles.edit(Vector2i(1,0), "remove", Vector2i.ZERO), "Bundle pickup can remove a landing below another stair")
	check(bundles.cells.get(Vector2i(2,-1)) == "stairs", "Bundle pickup preserves the stair above its landing")
	print("Stairs without grass support: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
