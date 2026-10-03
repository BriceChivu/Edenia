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
	check(Layout.level_for_xp(44) == 2 and Layout.level_for_xp(45) == 3 and Layout.level_for_xp(89) == 3 and Layout.level_for_xp(90) == 4, "Level four requires 45 additional XP")
	var fourth = Layout.new()
	fourth.flora_rng.seed = 4004
	fourth.unlock(2)
	fourth.unlock(3)
	var previous := fourth.snapshot()
	check(fourth.unlock(4), "Third upgrade succeeds")
	check(fourth.ground_count() == 9 and fourth.stock.tree == 2 and fourth.stock.stairs == 2, "Level four grants three grass and one different tree")
	check(fourth.cells == complete.cells, "Level four preserves existing island")
	check(fourth.edit(Vector2i(2, 0), "ground", Vector2i.ZERO), "Prepare tree tile")
	check(fourth.edit(Vector2i(2, 0), "tree", Vector2i.ZERO, -1, Vector2.ZERO), "Place new tree")
	var reloaded = Layout.new()
	check(reloaded.restore(fourth.snapshot()) and reloaded.tree_types == fourth.tree_types, "New tree type survives save roundtrip")
	check(reloaded.edit(Vector2i(2, 0), "remove", Vector2i.ZERO) and reloaded.stock.tree == 2, "Pickup returns correct tree variant")
	check(not fourth.unlock(4), "Level four rewards cannot be duplicated")
	var invalid := fourth.snapshot()
	invalid.tree_offsets[0][4] = "unknown"
	check(not reloaded.restore(invalid), "Unknown tree variants rejected")
	var old := previous.duplicate(true)
	old.version = 13
	old.stock.erase("tree2")
	check(reloaded.restore(old) and reloaded.level == 3 and reloaded.stock.tree == 1, "Level three save migrates without grants")
	var variants := {}
	for iteration in range(64):
		check(fourth.edit(Vector2i(2, 0), "remove", Vector2i.ZERO), "Pick up randomized tree")
		check(fourth.edit(Vector2i(2, 0), "tree", Vector2i.ZERO), "Place shared tree item")
		variants[fourth.tree_types[Vector2i(2, 0)]] = true
	check(variants.size() == 4, "Shared tree item can produce every tree variant")
	var cycling_stock: Dictionary = fourth.stock.duplicate()
	var original_type: String = fourth.tree_types[Vector2i(2, 0)]
	var original_offset: Vector2 = fourth.tree_offset(Vector2i(2, 0))
	fourth.stock.tree = 0
	for step in range(4):
		check(fourth.edit(Vector2i(2, 0), "tree", Vector2i(2, 0), -1, Vector2(999, 999)), "Existing tree cycles without placement restrictions or stock")
		check(fourth.tree_types[Vector2i(2, 0)] == Layout.TREE_VARIANTS[(Layout.TREE_VARIANTS.find(original_type) + step + 1) % 4], "Cycle follows all four variants in order")
		check(fourth.stock.tree == 0 and fourth.tree_offset(Vector2i(2, 0)) == original_offset, "Cycling preserves inventory and anchor")
	check(not fourth.edit(Vector2i(1, 0), "tree", Vector2i.ZERO), "Empty stock still rejects new trees")
	fourth.stock = cycling_stock
	check(reloaded.restore(fourth.snapshot()) and reloaded.tree_types == fourth.tree_types, "Cycled type survives saving")
	var version14 := fourth.snapshot()
	version14.version = 14
	version14.stock.tree = 0
	version14.stock.tree2 = 1
	check(reloaded.restore(version14) and reloaded.stock.tree == 1, "Previous level-four inventory migrates to shared trees")
	var extended = Layout.new()
	for target in range(2, 11):
		var before_ground: int = extended.ground_count()
		var before_cells: Dictionary = extended.cells.duplicate(true)
		check(extended.unlock(target), "Unlock level %s" % target)
		check(extended.ground_count() == before_ground + 3, "Every upgrade grants three grass tiles")
		check(extended.cells == before_cells, "Upgrade preserves placed terrain")
		var restored = Layout.new()
		check(restored.restore(extended.snapshot()) and restored.level == target and restored.stock == extended.stock, "Level %s save roundtrip" % target)
		check(not extended.unlock(target), "Upgrade cannot duplicate rewards")
		var threshold: int = Layout.XP_THRESHOLDS[target - 1]
		check(Layout.level_for_xp(threshold - 1) == target - 1 and Layout.level_for_xp(threshold) == target, "XP boundary for level %s" % target)
	check(not extended.unlock(11) and Layout.level_for_xp(99999) == 10, "Progression stops at level ten")
	var invalid_extended := extended.snapshot()
	invalid_extended.stock.meadow += 1
	check(not Layout.new().restore(invalid_extended), "Extended saves reject extra grass")
	print("Progression checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
