extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)
func _initialize() -> void:
	for kind in ["tree", "sheep", "chicken"]:
		var layout = Layout.new()
		for level in range(2, 8): layout.unlock(level)
		var cell := Vector2i(3, 2)
		layout.decorations[cell] = {"kind": "land_rock", "variant": 0}
		if kind == "logs":
			layout.resources.wood = 1
			layout.carried_wood = 1
			check(layout.drop_logs(cell), "Logs can replace generated scenery")
		else:
			check(layout.edit(cell, kind, Layout.HOME), kind + " can replace generated scenery")
		check(not layout.decorations.has(cell), "Replaced scenery is removed")
		check(Layout.new().restore(layout.snapshot()), "Placement survives save validation")
	var layout = Layout.new()
	layout.unlock(2)
	layout.cells[Vector2i(3, 0)] = "meadow"
	layout.stock.meadow -= 1
	check(layout.edit(Vector2i(1, 0), "stairs", Vector2i(3, 2)), "Stair fixture placed")
	layout.decorations[Vector2i(2, 0)] = {"kind": "land_rock", "variant": 0}
	check(layout.edit(Vector2i(1, 0), "stairs", Vector2i(3, 2)), "Stair reverses through generated scenery")
	check(not layout.decorations.has(Vector2i(2, 0)), "Stair reversal clears ramp scenery")
	check(Layout.new().restore(layout.snapshot()), "Reversed stairs survive save validation")
	print("Scenery placement checks: %s failures" % failures)
	quit(1 if failures else 0)
