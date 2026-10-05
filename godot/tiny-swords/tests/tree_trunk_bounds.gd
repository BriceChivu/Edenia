extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Source = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	var layout := Layout.new()
	layout.unlock(2)
	layout.unlock(3)
	var cell := Vector2i(1, 0)
	var image := Source.get_image()
	# Below atlas row 220 only the opaque trunk/roots remain, including
	# their dark outline. Inspect every animation frame, not the shadow.
	var left := 32.0
	var right := -32.0
	for y in range(220, image.get_height()):
		for x in image.get_width():
			if image.get_pixel(x, y).a == 1.0:
				left = minf(left, (x % 192 - 96) * 0.8)
				right = maxf(right, (x % 192 + 1 - 96) * 0.8)
	var minimum := -32.0 - left
	var maximum := 32.0 - right
	for edge in [minimum, maximum]:
		check(layout.can_edit(cell, "tree", Layout.HOME, -1, Vector2(edge, 15)), "Outermost trunk pixel may touch the tile edge")
	check(not layout.can_edit(cell, "tree", Layout.HOME, -1, Vector2(minimum - 0.01, 15)), "Left trunk pixel cannot cross the square")
	check(not layout.can_edit(cell, "tree", Layout.HOME, -1, Vector2(maximum + 0.01, 15)), "Right trunk pixel cannot cross the square")
	check(layout.edit(cell, "tree", Layout.HOME, -1, Vector2.ZERO), "Centered placement succeeds")
	var saved: Dictionary = layout.snapshot()
	for edge in [-20.0, 20.0]:
		var old: Dictionary = saved.duplicate(true)
		old.version = 12
		old.tree_offsets = [[1, 0, edge, 28]]
		check(layout.restore(old), "Existing edge tree loads without losing the layout")
		check(is_equal_approx(layout.tree_offset(cell).x, minimum if edge < 0 else maximum), "Existing edge tree moves just far enough to contain its trunk")
	var invalid: Dictionary = saved.duplicate(true)
	invalid.tree_offsets = [[1, 0, maximum + 0.01, 15]]
	var before := layout.snapshot()
	check(not layout.restore(invalid) and layout.snapshot() == before, "New saves reject out-of-square trunks atomically")
	print("Tree trunk bounds: %s (left %s, right %s)" % ["PASS" if failures == 0 else "FAIL", minimum, maximum])
	quit(0 if failures == 0 else 1)
