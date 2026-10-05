extends RefCounted

const Layout = preload("res://scripts/terrain_layout.gd")

static func fresh(level: int):
	var layout = Layout.new()
	for target in range(2, level + 1):
		layout.unlock(target)
	return layout

static func generate(source, seed_value: int):
	# Reclaim the owned pieces, then generate from a clean starting island.
	var layout = fresh(source.level)
	layout.playground_grants = source.playground_grants.duplicate(true)
	layout.free_house_grass = source.free_house_grass
	var total_ground: int = layout.cells.size() + layout.ground_count() + 2 * int(layout.stock.stairs) + source.free_house_grass + int(source.playground_grants.get("ground", 0))
	layout.stock.stairs = source.stock.stairs + source.stair_directions.size()
	for kind in Layout.KINDS:
		if kind != "stairs": layout.stock[kind] = 0
	layout.stock.meadow = total_ground - layout.cells.size() - 2 * int(layout.stock.stairs)
	layout.stock.tree = source.stock.tree + source.trees.size()
	layout.stock.sheep = source.stock.sheep + source.sheep.size()
	layout.stock.chicken = source.stock.chicken + source.chickens.size()
	layout.stock.bridge = source.stock.bridge + source.bridges.size()
	layout.stock.house = source.stock.house
	layout.resources.wood = source.resources.wood + source.houses.size() * Layout.HOUSE_LOG_COST
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	layout.flora_rng.seed = seed_value
	layout.next_tree_variant = Layout.TREE_VARIANTS[rng.randi_range(0, 3)]
	layout.manual_ground_elevation = true
	for attempt in range(4000):
		if layout.ground_count() <= 0:
			break
		var owners: Array = layout.cells.keys()
		var cell: Vector2i = owners[rng.randi_range(0, owners.size() - 1)] + Layout.STEPS[rng.randi_range(0, 3)]
		if not layout.in_bounds(cell) or layout.cells.has(cell):
			continue
		layout.edit(cell, "ground", Layout.HOME, 0)
	for attempt in range(1000):
		if layout.stock.stairs <= 0:
			break
		var owners: Array = layout.cells.keys()
		var foot: Vector2i = owners[rng.randi_range(0, owners.size() - 1)]
		var direction := Vector2i.RIGHT if rng.randi_range(0, 1) else Vector2i.LEFT
		var ramp := foot + direction
		if layout.cells.has(ramp) or layout.height_at(foot) != 0:
			continue
		layout.edit(ramp, "stairs", Layout.HOME)
	var candidates: Array = layout.cells.keys()
	# Seeded Fisher-Yates avoids the global RNG used by Array.shuffle().
	for index in range(candidates.size() - 1, 0, -1):
		var other := rng.randi_range(0, index)
		var value = candidates[index]
		candidates[index] = candidates[other]
		candidates[other] = value
	# Return harvested and reclaimed house logs to clear tiles on the new map.
	var remaining_wood: int = layout.resources.wood
	for cell: Vector2i in candidates:
		if remaining_wood <= 0: break
		if cell == Layout.HOME or not layout.asset_ground_free(cell): continue
		var amount := mini(6, remaining_wood)
		layout.log_piles[cell] = amount
		remaining_wood -= amount
	for kind in ["tree", "sheep", "chicken"]:
		for cell: Vector2i in candidates:
			if layout.stock[kind] <= 0:
				break
			if cell in [Layout.HOME, Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)] or layout.stair_endpoint(cell):
				continue
			layout.edit(cell, kind, Layout.HOME, -1, Vector2(0, rng.randf_range(0, 16)))
	return layout
