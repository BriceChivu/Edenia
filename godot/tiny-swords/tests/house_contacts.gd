extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func _initialize() -> void:
	var layout = Layout.new()
	var cell := Vector2i.ZERO
	for x in range(-2, 4):
		for y in range(-2, 4):
			layout.cells[Vector2i(x, y)] = "meadow"
	var anchor: Vector2 = layout.center(cell) + Vector2(32, 0)
	for requested in [Vector2(31, 31), Vector2(-31, -31), Vector2(31, -31), Vector2(-31, 31)]:
		check(layout.house_space_free(cell, Vector2i(-10, -10), 1, Vector2.INF, requested), "House accepts free offsets on level ground")
		var squares: Array[Vector2i] = layout.house_cells(cell, requested)
		for facing in 4:
			for point in layout.house_footprint(cell, facing, requested):
				check(layout.cell_at(point) in squares, "Foundation covers all rotations at the free pointer position")
	layout.elevations[cell + Vector2i.ONE] = 64
	check(not layout.house_space_free(cell, Vector2i(-10, -10)), "House cannot straddle foundation floor levels")
	layout.elevations.clear()
	for facing in 4:
		layout.houses[cell] = facing
		check(not layout.walkable_point(anchor + Vector2(0, 60)), "House interior blocks pawn")
		check(layout.walkable_point(anchor + Vector2(0, -40)), "Ground behind roof remains walkable")
		check(layout.house_blocks_contact(cell, anchor + Vector2(-80, 60), anchor + Vector2(80, 60)), "Sweep cannot tunnel through house")
	var side := layout.house_footprint(cell, 1)
	var opposite := layout.house_footprint(cell, 3)
	for i in side.size():
		check(is_equal_approx(side[i].x - anchor.x, anchor.x - opposite[i].x) and side[i].y == opposite[i].y, "Opposite side mirrors contact")
	layout.houses[cell] = 2
	check(layout.walkable_point(anchor + Vector2(0, 81), true), "Back wall recess remains clear")
	check(not layout.walkable_point(anchor + Vector2(-39, 81), true), "Back post still blocks")
	print("House contact checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
