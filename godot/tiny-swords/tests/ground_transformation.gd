extends SceneTree

func _initialize() -> void:
	var layout = load("res://scripts/terrain_layout.gd").new()
	layout.unlock(2)
	var occupied := Vector2i.ZERO
	assert(layout.edit(Vector2i(1, 0), "stairs", occupied))
	var target := Vector2i(1, 1)
	assert(not layout.can_edit(target, "ground", occupied), "Same-height grass cannot be replaced")
	assert(layout.edit(Vector2i(2, 1), "ground", occupied))
	var before: Dictionary = layout.stock.duplicate()
	layout.flora[target] = 1
	assert(layout.edit(target, "ground", occupied), "Existing grass extends the adjacent higher floor")
	assert(layout.height_at(target) == 64 and layout.stock == before, "Transformation is free")
	assert(layout.flora[target] == 1, "Transformation preserves decorations")
	assert(not layout.edit(target, "ground", occupied), "Equal-height overlay is rejected")
	assert(not layout.edit(Vector2i(1, 0), "ground", occupied), "Stairs cannot become grass")
	assert(layout.restore(layout.snapshot()), "Transformation preserves save inventory accounting")
	layout.cells[Vector2i(2, 1)] = "high_meadow"
	layout.elevations[Vector2i(2, 1)] = 128
	for kind in layout.KINDS:
		if kind != "stairs":
			layout.stock[kind] = 0
	assert(layout.edit(target, "ground", occupied) and layout.height_at(target) == 128, "Transformation works at higher floors with zero stock")
	assert(layout.ground_count() == 0)
	assert(not layout.edit(Vector2i(5, 2), "ground", occupied), "New ground still requires inventory")
	layout.elevations[Vector2i(3, 0)] = 128
	assert(not layout.edit(Vector2i(2, 0), "ground", occupied), "Stair landing height stays protected")
	print("Ground transformation: PASS")
	quit()
