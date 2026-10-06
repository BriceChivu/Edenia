extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		var layout = Layout.new()
		layout.unlock(2)
		layout.unlock(3)
		var first := Vector2i(4, 0)
		var landing: Vector2i = first + direction
		var second: Vector2i = first + direction * 2
		var last: Vector2i = second + direction
		layout.cells = {first - direction: "meadow", Vector2i.ZERO: "meadow"}
		layout.flora.clear()
		check(layout.edit(first, "stairs", Vector2i.ZERO), "Place first stair bundle")
		for support in [landing + Vector2i.DOWN, second + Vector2i.DOWN, last + Vector2i.DOWN]:
			layout.cells[support] = "high_gold"
			layout.elevations[support] = 64
		check(layout.edit(second, "stairs", Vector2i.ZERO), "Second staircase uses the first bundle's landing as its lower endpoint")
		var before: Dictionary = layout.snapshot()
		check(not layout.can_edit(first, "remove", Vector2i.ZERO), "Hover blocks pickup of a bundle supporting another staircase")
		check(not layout.edit(first, "remove", Vector2i.ZERO), "Pickup cannot leave the other staircase ending at water")
		check(layout.snapshot() == before, "Rejected pickup preserves both bundles and inventory")
		check(layout.cells.has(landing) and layout.can_cross(landing, second), "Lower endpoint stays connected")
		check(layout.edit(second, "remove", Vector2i.ZERO), "Pick up dependent staircase first")
		check(layout.edit(first, "remove", Vector2i.ZERO), "Supporting bundle can then be picked up")
	print("Stair endpoint pickup: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
