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
			var foot_below: Vector2i = stair - direction + Vector2i.DOWN
			if height > 64:
				layout.cells[foot_below + Vector2i.DOWN] = layout.kind_at_height(height - 64)
				layout.elevations[foot_below + Vector2i.DOWN] = height - 64
			for support in [-1, 0, height - 64]:
				if support >= 0:
					layout.cells[foot_below] = layout.kind_at_height(support)
					layout.elevations[foot_below] = support
				var before: Dictionary = layout.snapshot()
				check(layout.available_stair_direction(stair) == Vector2i.ZERO, "Preview rejects a lower entrance on an exposed cliff")
				check(layout.terrain_edit_preview(stair, "stairs") == null, "Terrain preview rejects a lower entrance on an exposed cliff")
				check(not layout.edit(stair, "stairs", Vector2i.ZERO), "Placement rejects a lower entrance on an exposed cliff")
				check(layout.snapshot() == before, "Rejected lower entrance preserves terrain and inventory")
			layout.cells[foot_below] = layout.kind_at_height(height)
			layout.elevations[foot_below] = height
			check(layout.edit(stair, "stairs", Vector2i.ZERO), "Receiving ground at ramp height allows elevated stairs")
			check(layout.height_at(foot_below) == height, "Placement normalization retains the supported lower entrance")
			var protected := [foot_below, below, landing_below]
			if height > 64:
				protected.append(foot_below + Vector2i.DOWN)
			for receiving in protected:
				var before: Dictionary = layout.snapshot()
				check(not layout.edit(receiving, "remove", Vector2i.ZERO), "Pickup cannot expose a cliff under an existing staircase")
				check(0.0 not in layout.ground_options(receiving), "Lowering preview cannot expose a cliff under an existing staircase")
				check(layout.terrain_edit_preview(receiving, "ground", 0) == null, "Terrain preview preserves the receiving terrace")
				check(not layout.edit(receiving, "ground", Vector2i.ZERO, 0), "Lowering cannot expose a cliff under an existing staircase")
				check(layout.snapshot() == before, "Rejected support edits preserve terrain and inventory")
			var opposite_foot: Vector2i = stair + direction * 2
			layout.cells[opposite_foot] = layout.kind_at_height(height)
			layout.elevations[opposite_foot] = height
			if height > 64:
				layout.cells[opposite_foot + Vector2i.DOWN * 2] = layout.kind_at_height(height - 64)
				layout.elevations[opposite_foot + Vector2i.DOWN * 2] = height - 64
			for support in [-1, 0, height - 64]:
				var receiving := opposite_foot + Vector2i.DOWN
				if support >= 0:
					layout.cells[receiving] = layout.kind_at_height(support)
					layout.elevations[receiving] = support
				var before: Dictionary = layout.snapshot()
				check(not layout.can_reverse_stair(stair, Vector2i.ZERO), "Reversal preview rejects a lower entrance above a cliff")
				check(not layout.edit(stair, "stairs", Vector2i.ZERO), "Reversal rejects a lower entrance above a cliff")
				check(layout.snapshot() == before, "Rejected reversal preserves terrain and inventory")
			layout.cells[opposite_foot + Vector2i.DOWN] = layout.kind_at_height(height)
			layout.elevations[opposite_foot + Vector2i.DOWN] = height
			check(layout.edit(stair, "stairs", Vector2i.ZERO), "Supported opposite entrance allows reversal")
	print("Stair cliff stacking: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
