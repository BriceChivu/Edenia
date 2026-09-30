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
		var stair := Vector2i(4, 0)
		var below := stair + Vector2i.DOWN
		layout.cells = {stair - direction: "meadow"}
		var before: Dictionary = layout.snapshot()
		check(not layout.edit(stair, "stairs", Vector2i.ZERO), "Water below blocks either stair orientation")
		check(layout.snapshot() == before, "Rejected stair preserves terrain and inventory")
		layout.cells[below] = "stairs"
		check(not layout.can_edit(stair, "stairs", Vector2i.ZERO), "Another stair does not count as grass below")
		layout.cells[below] = "meadow"
		check(layout.edit(stair, "stairs", Vector2i.ZERO), "Grass below allows either stair orientation")
		check(layout.stair_direction(stair) == direction, "Stair retains its intended direction")
		check(not layout.edit(below, "remove", Vector2i.ZERO), "Supporting grass cannot be picked up")
		check(not layout.can_edit(below, "stairs", Vector2i.ZERO), "Supporting grass cannot become stairs")
		layout.trees[below] = true
		check(layout.edit(below, "remove", Vector2i.ZERO) and layout.cells.has(below), "Tree pickup retains supporting grass")
		check(layout.edit(stair, "remove", Vector2i.ZERO), "Stair can be picked up")
		check(layout.edit(below, "remove", Vector2i.ZERO), "Grass can be picked up after its stair")
	var bundles = load("res://scripts/terrain_layout.gd").new()
	bundles.unlock(2)
	bundles.cells = {Vector2i(1,0): "stairs", Vector2i(2,0): "high_gold", Vector2i(2,-1): "stairs"}
	bundles.stair_directions[Vector2i(1,0)] = Vector2i.RIGHT
	check(not bundles.can_edit(Vector2i(1,0), "remove", Vector2i.ZERO), "Bundle pickup cannot remove another stair's supporting landing")
	print("Stair grass support: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
