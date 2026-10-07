extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	for direction in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
		for side in [-1, 1]:
			var layout = Layout.new()
			for level in [2, 3, 4, 5]:
				layout.unlock(level)
			layout.cells.clear()
			layout.trees.clear()
			layout.flora.clear()
			layout.decorations.clear()
			var stair := Vector2i(4, 4)
			var landing: Vector2i = stair + direction * side
			layout.cells[stair] = "stairs"
			layout.stair_directions[stair] = direction
			layout.cells[landing] = "meadow"
			layout.elevations[landing] = 64 if side == 1 else 0
			check(not layout.can_edit(stair, "chicken", Layout.HOME), "Ramp itself still rejects chicken")
			check(not layout.can_edit(landing, "chicken", landing), "Pawn tile still rejects chicken")
			layout.trees[landing] = Vector2.ZERO
			check(not layout.can_edit(landing, "chicken", Layout.HOME), "Tree still blocks chicken on landing")
			layout.trees.erase(landing)
			check(layout.edit(landing, "chicken", Layout.HOME), "Place chicken on either stair connection in every direction")
			check(layout.chickens == [layout.center(landing)] and layout.stock.chicken == 0, "Placement stores chicken and consumes inventory")
	print("Chicken stair placement checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
