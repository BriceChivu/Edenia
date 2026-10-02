extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func _initialize() -> void:
	var layout = Layout.new()
	layout.unlock(2)
	layout.unlock(3)
	layout.unlock(4)
	var cell := Vector2i(1, 0)
	assert(layout.edit(cell, "tree", Layout.HOME))
	layout.tree_cut_remaining[cell] = 12.0
	if not layout.edit(cell, "remove", Layout.HOME):
		push_error("Partly cut standing tree must be collectible")
		quit(1)
		return
	assert(not layout.tree_cut_remaining.has(cell))
	assert(not layout.trees.has(cell))
	assert(layout.resources.wood == 0)
	var restored = Layout.new()
	assert(restored.restore(layout.snapshot()))
	print("Tree pickup checks passed")
	quit()
