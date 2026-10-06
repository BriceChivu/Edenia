extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
func _initialize() -> void:
	var layout = Layout.new()
	assert(not layout.can_edit(Vector2i(1, 0), "chicken", Vector2i.ZERO))
	assert(layout.stock.chicken == 0)
	assert(layout.unlock(2) and layout.stock.chicken == 1)
	assert(not layout.unlock(2))
	var cell := Vector2i(1, 0)
	assert(layout.edit(cell, "chicken", Vector2i.ZERO))
	assert(layout.stock.chicken == 0 and layout.chicken_at(cell) == 0)
	var restored = Layout.new()
	assert(restored.restore(layout.snapshot()) and restored.chickens == layout.chickens)
	var before := restored.snapshot()
	var invalid := before.duplicate(true)
	invalid.chickens = []
	invalid.stock.chicken = 1
	invalid.house_build = {"started_at": -1}
	assert(not restored.restore(invalid))
	assert(restored.snapshot() == before, "Rejected construction must not mutate chickens or any live layout state")
	assert(restored.edit(cell, "remove", Vector2i.ZERO) and restored.stock.chicken == 1)
	var old := restored.snapshot()
	old.version = 19
	old.erase("chickens")
	old.stock.erase("chicken")
	assert(Layout.new().restore(old))
	for target in range(2, 11):
		var previous = Layout.new()
		for next_level in range(2, target + 1):
			assert(previous.unlock(next_level))
		var expected := 2 if target >= 7 else 1
		assert(previous.stock.chicken == expected, "Levels two and seven each grant one chicken")
		var legacy := previous.snapshot()
		legacy.version = 23
		# Version 23 predates the level-two chicken and level-six tree rewards.
		legacy.stock.chicken -= 1
		if target >= 6:
			legacy.stock.tree -= 1
		if target >= 8:
			legacy.stock.sheep -= 1
		var migrated = Layout.new()
		assert(migrated.restore(legacy) and migrated.stock.chicken == expected)
		assert(migrated.stock.tree == previous.stock.tree, "Legacy migration grants the level-six tree once")
		assert(migrated.restore(migrated.snapshot()) and migrated.stock.chicken == expected)
		assert(migrated.stock.tree == previous.stock.tree, "Reload retains migrated tree inventory")
	var forged := layout.snapshot()
	forged.stock.chicken += 1
	assert(not Layout.new().restore(forged), "New saves reject duplicate chickens")
	var scene = load("res://previews/level_one.tscn").instantiate()
	root.add_child.call_deferred(scene)
	await process_frame
	scene.layout.unlock(2)
	scene.ui.refresh(true, "chicken", false)
	assert(scene.ui.buttons.chicken.visible and not scene.ui.buttons.chicken.disabled)
	scene.ui.celebrate()
	assert(scene.ui.celebration.get_node("PineReward").visible)
	assert(scene.ui.celebration.get_node("PineReward").accessibility_name == "1 chicken")
	print("Chicken checks: PASS")
	quit()
