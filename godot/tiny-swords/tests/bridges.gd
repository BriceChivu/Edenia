extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)
func _initialize() -> void:
	run.call_deferred()
func fixture(grass: bool):
	var layout = Layout.new()
	layout.bridges_enabled = true
	layout.unlock(2)
	layout.unlock(3)
	layout.cells = {Vector2i(0, 0): "high_gold", Vector2i(3, 0): "high_gold", Vector2i(0, 1): "meadow", Vector2i(3, 1): "meadow", Vector2i(4, 1): "meadow"}
	if grass:
		layout.cells[Vector2i(1, 0)] = "meadow"
		layout.cells[Vector2i(2, 0)] = "meadow"
		layout.stock.meadow -= 2
	layout.elevations.clear()
	layout.flora.clear()
	return layout
func run() -> void:
	var early = Layout.new()
	early.unlock(2)
	check(early.stock.bridge == 0, "Level two has no bridge reward")
	for grass in [false, true]:
		var layout = fixture(grass)
		var gap := Vector2i(1, 0)
		var left := Vector2i.ZERO
		var right := Vector2i(3, 0)
		check(layout.path(left, right).is_empty(), "Raised banks are disconnected before bridge")
		var before: Dictionary = layout.snapshot()
		check(layout.edit(gap + Vector2i.RIGHT, "bridge", left), "Either gap square places one bridge")
		check(layout.stock.bridge == 0 and layout.bridges.size() == 1 and layout.cells == fixture(grass).cells, "Placement spends one bridge and preserves lower terrain")
		check(layout.path(left, right) == [right] and layout.path(right, left) == [left], "Bridge connects both raised banks")
		check(not layout.can_edit(left, "remove", right) and not layout.can_edit(right, "ground", left), "Supporting banks cannot be removed or raised")
		check(not layout.can_edit(gap, "remove", gap + Vector2i.RIGHT), "Occupied bridge cannot be picked up")
		var saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
		var restored = Layout.new()
		check(restored.restore(saved) and restored.bridges == layout.bridges and restored.stock.bridge == 0, "JSON roundtrip retains bridge with no duplicate reward")
		var invalid: Dictionary = saved.duplicate(true)
		invalid.bridges[0][2] = 128
		check(not restored.restore(invalid) and restored.snapshot() == layout.snapshot(), "Invalid bridge rejects atomically")
		check(layout.edit(gap, "remove", left) and layout.stock.bridge == 1 and layout.path(left, right).is_empty(), "Pickup refunds bridge and disconnects upper banks")
		check(layout.restore(before) and layout.stock.bridge == 1, "Undo restores the pre-placement inventory")
	var legacy: Dictionary = fixture(true).snapshot()
	legacy.version = 10
	legacy.erase("bridges")
	legacy.stock.erase("bridge")
	var migrated = Layout.new()
	check(migrated.restore(legacy) and migrated.stock.bridge == 1, "Existing level-three saves receive the bridge")
	check(migrated.restore(migrated.snapshot()) and migrated.stock.bridge == 1, "Bridge migration grants only once")
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.layout.bridges_enabled = true
	level.refresh()
	check(level.ui.buttons.bridge.visible and not level.ui.buttons.bridge.disabled, "Actual level-three inventory exposes bridge")
	level.layout.cells = fixture(false).cells
	level.layout.flora.clear()
	level.layout.elevations.clear()
	level.layout.trees.clear()
	level.layout.decorations.clear()
	level.pawn.position = level.layout.center(Vector2i.ZERO)
	level.pawn.walk_to(level.pawn.position)
	level.selected = "bridge"
	var pos: Vector2 = level.layout.ORIGIN + Vector2(64, -32)
	check(level.bridge_placement_at(pos) == Vector2i(1, 0), "Placement uses upper-height mouse coordinates")
	check(level.apply_edit(Vector2i(1, 0)), "Real builder places bridge")
	var route: Array[Vector2] = level.land_route(level.pawn.position, Vector2i(3, 0), level.layout.center(Vector2i(3, 0)))
	check(not route.is_empty() and route.back() == level.layout.center(Vector2i(3, 0)), "Actual movement crosses a water gap")
	var middle: Vector2 = level.layout.center(Vector2i(1, 0)) + Vector2(32, 0)
	check(is_equal_approx(level.ground_height(middle), 44.0), "Pawn feet dip twenty pixels through midpoint")
	level.pawn.position = middle
	check(not level.apply_edit(Vector2i(1, 0)), "Occupied bridge cannot be replaced")
	level.selected = "remove"
	check(not level.apply_edit(Vector2i(1, 0)), "Actual builder protects crossing pawn")
	level.pawn.position = level.layout.center(Vector2i.ZERO)
	check(level.apply_edit(Vector2i(1, 0)) and level.layout.stock.bridge == 1, "Actual pickup returns inventory")
	level.undo()
	check(level.layout.bridges.size() == 1 and level.layout.stock.bridge == 0, "Undo pickup restores bridge")
	level.free()
	print("Bridge checks: ", failures, " failures")
	quit(0 if failures == 0 else 1)
