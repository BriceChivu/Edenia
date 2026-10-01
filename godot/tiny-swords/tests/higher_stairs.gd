extends SceneTree
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func _initialize() -> void:
	var l = load("res://scripts/terrain_layout.gd").new()
	l.unlock(2)
	l.unlock(3)
	var occupied := Vector2i(0,1)
	check(l.edit(Vector2i(1,0), "stairs", occupied), "First stair")
	check(l.edit(Vector2i(3,0), "ground", occupied), "Extend gold floor")
	check(l.edit(Vector2i(4,0), "ground", occupied) and l.height_at(Vector2i(4,0)) == 64, "Prepare existing higher ground")
	check(l.edit(Vector2i(4,1), "ground", occupied), "Place support below higher ramp")
	check(l.edit(Vector2i(5,1), "ground", occupied), "Place support below higher landing")
	check(l.edit(Vector2i(4,0), "stairs", occupied), "Stair replaces existing higher ground")
	check(l.height_at(Vector2i(4,0)) == 64 and l.height_at(Vector2i(5,0)) == 128, "Second stair rises one floor")
	check(l.palette_at_height(0) == 3 and l.palette_at_height(64) == 1 and l.palette_at_height(128) == 2, "Green gold teal floor palettes")
	for floor in range(15):
		check(l.palette_at_height(floor * 64) == [3, 1, 2, 4, 5][floor % 5], "All five palettes cycle by elevation: floor %s" % floor)
	check(l.can_cross(Vector2i(3,0), Vector2i(4,0)) and l.can_cross(Vector2i(4,0), Vector2i(5,0)), "Walk up second stair")
	check(l.can_cross(Vector2i(5,0), Vector2i(4,0)), "Walk down second stair")
	check(l.edit(Vector2i(6,0), "ground", occupied) and l.height_at(Vector2i(6,0)) == 128, "Ground extends highest neighboring floor")
	check(l.restore(l.snapshot()) and l.height_at(Vector2i(5,0)) == 128, "Save retains elevated floors and inventory")
	check(l.edit(Vector2i(4,0), "remove", occupied), "Pickup elevated bundle")
	check(not l.elevations.has(Vector2i(4,0)) and not l.elevations.has(Vector2i(5,0)), "Pickup clears elevation")
	check(l.restore(l.snapshot()), "Pickup conserves inventory")
	print("Higher stairs: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
