extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)
func _initialize() -> void:
	var layout = Layout.new()
	check(layout.level == 1 and not layout.unlocked, "Fresh island starts at level one")
	check(not layout.unlock(3), "Cannot skip level two")
	check(layout.unlock(2), "First upgrade succeeds")
	check(layout.ground_count() == 3 and layout.stock.stairs == 1 and layout.stock.tree == 0, "Level two grants four items: three ground and one stair bundle")
	var once: Dictionary = layout.snapshot()
	check(not layout.unlock(2) and layout.snapshot() == once, "Retrying first upgrade grants nothing")
	check(layout.edit(Vector2i(2,1), "ground", Vector2i.ZERO), "Level two places required stair support")
	check(layout.edit(Vector2i(2,0), "stairs", Vector2i.ZERO), "Level two includes a usable stair bundle")
	check(layout.edit(Vector2i(4,0), "ground", Vector2i.ZERO), "Level two can extend its raised landing")
	var placements: Dictionary = layout.cells.duplicate()
	var plants: Dictionary = layout.flora.duplicate()
	var directions: Dictionary = layout.stair_directions.duplicate()
	var stock: Dictionary = layout.stock.duplicate()
	var second = Layout.new()
	check(second.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))) and second.level == 2, "Intermediate save roundtrip keeps earned level")
	check(second.unlock(3), "Second upgrade succeeds after reload")
	check(second.cells == placements and second.flora == plants and second.stair_directions == directions, "Upgrade preserves terrain, plants and stairs exactly")
	check(second.ground_count() == layout.ground_count() + 3 and second.stock.stairs == stock.stairs + 1 and second.stock.tree == 1 and second.stock.bridge == 1, "Level three adds six items including the bridge")
	once = second.snapshot()
	check(not second.unlock(3) and not second.unlock(2) and second.snapshot() == once, "Both upgrades remain idempotent at level three")
	check(second.restore(once) and second.snapshot() == once, "Level-three reload grants nothing")
	var complete = Layout.new()
	complete.unlock(2)
	complete.unlock(3)
	check(complete.stock == Layout.REWARDS, "Cumulative rewards include the level-three bridge")
	# Old fully unlocked snapshots retain every existing reward and placement.
	var legacy: Dictionary = second.snapshot()
	legacy.version = 5
	for tile in legacy.tiles:
		tile.resize(6)
	legacy.unlocked = true
	legacy.erase("level")
	var migrated = Layout.new()
	check(migrated.restore(legacy) and migrated.level == 3, "Old full unlock maps to level three")
	check(migrated.cells == second.cells and migrated.stock == second.stock and migrated.flora == second.flora, "Version-five migration preserves layout and inventory without grants")
	check(migrated.restore(migrated.snapshot()) and migrated.stock == second.stock, "Migration runs only once")
	for version in [1,2,3,4]:
		legacy = complete.snapshot()
		legacy.version = version
		legacy.unlocked = true
		legacy.erase("level")
		if version == 1:
			legacy.stock.meadow -= 1
			legacy.stock.erase("stairs")
		for tile in legacy.tiles:
			tile.resize(4 if version <= 2 else (5 if version == 3 else 6))
		check(migrated.restore(legacy) and migrated.level == 3 and migrated.stock == Layout.REWARDS, "Older preview migration retains full entitlement: v%s" % version)
	legacy = Layout.new().snapshot()
	legacy.version = 5
	for tile in legacy.tiles:
		tile.resize(6)
	legacy.unlocked = false
	legacy.erase("level")
	check(migrated.restore(legacy) and migrated.level == 1, "Old locked preview remains level one")
	print("Progression checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
