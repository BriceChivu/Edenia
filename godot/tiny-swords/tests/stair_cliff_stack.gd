extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		for height in [64, 128]:
			var layout = load("res://scripts/terrain_layout.gd").new()
			layout.unlock(2)
			layout.unlock(3)
			var stair := Vector2i(4, 0)
			var below := stair + Vector2i.DOWN
			layout.cells = {stair - direction: layout.kind_at_height(height)}
			layout.elevations = {stair - direction: height}
			layout.flora.clear()
			for support in [-1, 0, height - 64]:
				if support >= 0:
					layout.cells[below] = layout.kind_at_height(support)
					layout.elevations[below] = support
				var before: Dictionary = layout.snapshot()
				check(layout.available_stair_direction(stair) == Vector2i.ZERO, "Preview rejects a ramp above an exposed cliff")
				check(not layout.edit(stair, "stairs", Vector2i.ZERO), "Placement rejects a ramp above an exposed cliff")
				check(layout.snapshot() == before, "Rejected stairs preserve terrain and inventory")
			layout.cells[below] = layout.kind_at_height(height)
			layout.elevations[below] = height
			var landing_below: Vector2i = stair + direction + Vector2i.DOWN
			for support in [-1, 0, height - 64]:
				if support >= 0:
					layout.cells[landing_below] = layout.kind_at_height(support)
					layout.elevations[landing_below] = support
				var before: Dictionary = layout.snapshot()
				check(layout.available_stair_direction(stair) == Vector2i.ZERO, "Preview rejects stacked cliffs under the landing")
				check(not layout.edit(stair, "stairs", Vector2i.ZERO), "Placement rejects stacked cliffs under the landing")
				check(layout.snapshot() == before, "Rejected landing preserves terrain and inventory")
			layout.cells[landing_below] = layout.kind_at_height(height)
			layout.elevations[landing_below] = height
			check(layout.edit(stair, "stairs", Vector2i.ZERO), "Receiving ground at ramp height allows elevated stairs")
	print("Stair cliff stacking: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
