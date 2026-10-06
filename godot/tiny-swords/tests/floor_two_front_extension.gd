extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func check(ok: bool, message: String) -> bool:
	if not ok:
		push_error(message)
		quit(1)
	return ok

func _initialize() -> void:
	var layout = Layout.new()
	layout.unlock(2)
	var upper := Vector2i(5, 0)
	var target := upper + Vector2i.DOWN
	var front := target + Vector2i.DOWN
	# The marked tile extends floor two toward an existing floor-one terrace.
	layout.cells = {upper:"high_meadow", target:"high_gold", front:"high_gold"}
	layout.elevations = {upper:128, target:64, front:64}
	layout.trees.clear()
	layout.flora = {target:1}
	layout.decorations.clear()
	layout.manual_ground_elevation = true
	for kind in layout.KINDS:
		if kind != "stairs":
			layout.stock[kind] = 0
	layout.stock.meadow = 10 - layout.cells.size() - layout.stock.stairs * 2
	var before: Dictionary = layout.snapshot()
	var stock: Dictionary = layout.stock.duplicate()
	if not check(layout.next_ground_height(target) == 128, "Floor two must be offered above a floor-one receiving terrace"):
		return
	if not check(layout.edit(target, "ground", Layout.HOME, 128), "The offered floor-two extension must build"):
		return
	if not check(layout.height_at(target) == 128 and layout.height_at(front) == 64 and layout.height_at(upper) == 128, "Build must retain a single cliff step and both neighbors"):
		return
	if not check(layout.stock == stock and layout.flora.get(target) == 1, "Raising must preserve inventory and scenery"):
		return
	if not check(layout.restore(layout.snapshot()) and layout.height_at(target) == 128, "Reload must preserve the new floor-two extension"):
		return
	if not check(layout.restore(before) and layout.height_at(target) == 64, "Restoring the prior snapshot must undo the extension"):
		return
	# A water-level or missing front tile must never permit two stacked cliffs.
	for missing in [false, true]:
		layout.elevations[front] = 0
		layout.cells[front] = "meadow"
		if missing:
			layout.cells.erase(front)
		if not check(128.0 not in layout.ground_options(target) and not layout.edit(target, "ground", Layout.HOME, 128), "Floor two must reject a missing or water-level receiving terrace"):
			return
	print("Floor-two front extension: PASS")
	quit()
