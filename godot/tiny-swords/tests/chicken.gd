extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
func _initialize() -> void:
	var layout = Layout.new()
	for level in range(2, 7):
		assert(layout.unlock(level))
	assert(layout.stock.chicken == 0)
	assert(layout.unlock(7) and layout.stock.chicken == 1)
	assert(not layout.unlock(7))
	var cell := Vector2i(1, 0)
	assert(layout.edit(cell, "chicken", Vector2i.ZERO))
	assert(layout.stock.chicken == 0 and layout.chicken_at(cell) == 0)
	var restored = Layout.new()
	assert(restored.restore(layout.snapshot()) and restored.chickens == layout.chickens)
	assert(restored.edit(cell, "remove", Vector2i.ZERO) and restored.stock.chicken == 1)
	var old := restored.snapshot()
	old.version = 19
	old.erase("chickens")
	old.stock.erase("chicken")
	assert(Layout.new().restore(old))
	var scene = load("res://previews/level_one.tscn").instantiate()
	root.add_child.call_deferred(scene)
	await process_frame
	for level in range(2, 8):
		scene.layout.unlock(level)
	scene.ui.refresh(true, "chicken", false)
	assert(scene.ui.buttons.chicken.visible)
	scene.ui.celebrate()
	assert(scene.ui.celebration.get_node("PineReward").visible)
	print("Chicken checks: PASS")
	quit()
