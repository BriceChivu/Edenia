extends RefCounted

const DecorationRules = preload("res://scripts/decoration_rules.gd")

const ORIGIN := Vector2(512, 176)
const SIZE := 64
const HOME := Vector2i(0, 0)
const MIN_CELL := Vector2i(-6, -2)
const MAX_CELL := Vector2i(8, 3)
const KINDS := ["meadow", "gold", "violet", "high_meadow", "high_gold", "stairs"]
const COLORS := {"meadow": 3, "gold": 3, "violet": 3, "high_meadow": 1, "high_gold": 1, "stairs": 1}
const REWARDS := {"meadow": 2, "gold": 1, "violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 2, "tree": 1}
const LEVEL_REWARDS := {
	2: {"meadow": 2, "gold": 1, "stairs": 1},
	3: {"violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 1, "tree": 1},
}
const STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
var cells: Dictionary = {}
var trees: Dictionary = {}
var stair_directions: Dictionary = {}
var stock: Dictionary = {}
var flora := {Vector2i(0, 0): 1, Vector2i(1, 1): 2, Vector2i(3, 2): 1}
var decorations: Dictionary = {}
var flora_rng := RandomNumberGenerator.new()
var level := 1
var unlocked: bool:
	get: return level >= 2

func _init() -> void:
	flora_rng.randomize()
	for cell in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(3, 2)]:
		cells[cell] = "meadow"
	for kind in KINDS + ["tree"]:
		stock[kind] = 0

func unlock(target_level: int = 2) -> bool:
	# Explicit targets make retries idempotent and prohibit skipping an upgrade.
	if target_level != level + 1 or not LEVEL_REWARDS.has(target_level):
		return false
	for kind in LEVEL_REWARDS[target_level]:
		stock[kind] += LEVEL_REWARDS[target_level][kind]
	level = target_level
	return true

func cell_at(point: Vector2) -> Vector2i:
	return Vector2i(floor((point.x - ORIGIN.x) / SIZE), floor((point.y - ORIGIN.y) / SIZE))

func center(cell: Vector2i) -> Vector2:
	return ORIGIN + Vector2(cell) * SIZE + Vector2.ONE * SIZE / 2.0

func height_at(cell: Vector2i) -> float:
	return 64.0 if str(cells.get(cell, "")).begins_with("high_") else 0.0

func spawn_cell() -> Vector2i:
	if cells.has(HOME) and not trees.has(HOME) and cells[HOME] != "stairs":
		return HOME
	for cell in cells:
		if not trees.has(cell) and cells[cell] != "stairs":
			return cell
	return HOME

func clear_water(cell: Vector2i) -> bool:
	if not in_bounds(cell) or cells.has(cell):
		return false
	# Raised tops and ramps occupy the screen square above their grid base.
	var below := cell + Vector2i.DOWN
	return height_at(below) == 0 and cells.get(below) != "stairs"

func water_spaces(cell: Vector2i) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for step in STEPS:
		var water: Vector2i = cell + step
		# Reserve the two original water-rock locations too.
		if not clear_water(water) or water in [Vector2i(-1, 1), Vector2i(4, 1)]:
			continue
		var taken := false
		for item in decorations.values():
			if item.kind in DecorationRules.WATER_KINDS and item.water == water:
				taken = true
		if not taken:
			result.append(water)
	return result

func has_ducks() -> bool:
	for item in decorations.values():
		if item.kind == "ducks":
			return true
	return false

func add_flora(cell: Vector2i) -> void:
	# A placed tile gets one roll, never a fresh roll when it is rendered.
	prune_decorations()
	flora.erase(cell)
	decorations.erase(cell)
	var spaces := water_spaces(cell)
	var kind := DecorationRules.choose(flora_rng, not spaces.is_empty(), has_ducks())
	if kind.is_empty():
		return
	var item := {"kind": kind, "variant": flora_rng.randi_range(1, DecorationRules.VARIANTS[kind])}
	if kind in DecorationRules.WATER_KINDS:
		item.water = spaces[flora_rng.randi_range(0, spaces.size() - 1)]
	decorations[cell] = item

func prune_decorations() -> void:
	for owner in decorations.keys():
		var item: Dictionary = decorations[owner]
		if not cells.has(owner) or cells[owner] == "stairs" or (item.kind in DecorationRules.WATER_KINDS and not clear_water(item.water)):
			decorations.erase(owner)

func in_bounds(cell: Vector2i) -> bool:
	return cell.x >= MIN_CELL.x and cell.x <= MAX_CELL.x and cell.y >= MIN_CELL.y and cell.y <= MAX_CELL.y

func can_edit(cell: Vector2i, tool: String, occupied: Vector2i) -> bool:
	if not unlocked or not in_bounds(cell):
		return false
	if tool == "remove":
		if not cells.has(cell) or cell == occupied:
			return false
		if cells[cell] == "stairs":
			var landing := cell + stair_direction(cell)
			if landing == occupied or trees.has(landing):
				return false
		if not trees.has(cell):
			for step in [Vector2i.LEFT, Vector2i.RIGHT]:
				if cells.get(cell + step) == "stairs":
					return false
		return true
	if tool == "tree":
		return stock.tree > 0 and cells.has(cell) and not trees.has(cell) and cells[cell] != "stairs" and cell != HOME and cell != occupied
	if tool == "ground":
		return ground_count() > 0 and not cells.has(cell)
	if tool == "stairs":
		var direction := available_stair_direction(cell)
		return stock.stairs > 0 and direction != Vector2i.ZERO and cell != occupied and cell + direction != occupied
	return tool in KINDS and stock.get(tool, 0) > 0 and not cells.has(cell)

func ground_count() -> int:
	var count := 0
	for kind in KINDS:
		if kind != "stairs":
			count += stock[kind]
	return count

func automatic_kind(cell: Vector2i) -> String:
	for step in STEPS:
		var neighbor: Vector2i = cell + step
		if height_at(neighbor) > 0:
			return "high_gold"
		if cells.get(neighbor) == "stairs" and neighbor + stair_direction(neighbor) == cell:
			return "high_gold"
	return "meadow"

# A horizontal stair starts beside flat land and establishes its high endpoint.
func proposed_stair_direction(cell: Vector2i) -> Vector2i:
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		var low: Vector2i = cell - direction
		var high: Vector2i = cell + direction
		if cells.has(low) and cells[low] != "stairs" and height_at(low) == 0 and (not cells.has(high) or height_at(high) == 64):
			return direction
	return Vector2i.ZERO

func available_stair_direction(cell: Vector2i) -> Vector2i:
	if cells.get(cell) == "stairs" or trees.has(cell):
		return Vector2i.ZERO
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		var low: Vector2i = cell - direction
		var landing: Vector2i = cell + direction
		if not cells.has(low) or cells[low] == "stairs" or height_at(low) != 0:
			continue
		if not in_bounds(landing) or cells.get(landing) == "stairs" or trees.has(landing):
			continue
		var shared := false
		for other in stair_directions:
			# Existing stair endpoints must retain their height and ownership.
			for endpoint in [other - stair_directions[other], other + stair_directions[other]]:
				if endpoint == cell or endpoint == landing:
					shared = true
		if not shared:
			return direction
	return Vector2i.ZERO

func spend_ground() -> void:
	for kind in KINDS:
		if kind != "stairs" and stock[kind] > 0:
			stock[kind] -= 1
			return

func walkable_point(point: Vector2) -> bool:
	for offset in [Vector2(-7, -7), Vector2(7, -7), Vector2(-7, 7), Vector2(7, 7)]:
		if not cells.has(cell_at(point + offset)):
			return false
	for cell in trees:
		# A small trunk obstacle leaves a walkable strip in front of the tree.
		if Rect2(center(cell) - Vector2(10, 10), Vector2(20, 18)).grow(7).has_point(point):
			return false
	return true

func stair_direction(cell: Vector2i) -> Vector2i:
	return stair_directions.get(cell, proposed_stair_direction(cell))

func can_cross(from: Vector2i, to: Vector2i) -> bool:
	if not cells.has(from) or not cells.has(to) or (to - from) not in STEPS:
		return false
	if cells[from] == "stairs":
		var direction := stair_direction(from)
		return direction != Vector2i.ZERO and cells[to] != "stairs" and ((to == from + direction and height_at(to) == 64) or (to == from - direction and height_at(to) == 0))
	if cells[to] == "stairs":
		var direction := stair_direction(to)
		return direction != Vector2i.ZERO and cells[from] != "stairs" and ((from == to + direction and height_at(from) == 64) or (from == to - direction and height_at(from) == 0))
	return height_at(from) == height_at(to)

func edit(cell: Vector2i, tool: String, occupied: Vector2i) -> bool:
	if not can_edit(cell, tool, occupied):
		return false
	if tool == "remove":
		if trees.has(cell):
			trees.erase(cell)
			stock.tree += 1
		else:
			if cells[cell] == "stairs":
				var landing := cell + stair_direction(cell)
				flora.erase(landing)
				cells.erase(landing)
			stock[cells[cell]] += 1
			stair_directions.erase(cell)
			flora.erase(cell)
			cells.erase(cell)
	elif tool == "tree":
		trees[cell] = true
		stock.tree -= 1
	elif tool == "ground":
		cells[cell] = automatic_kind(cell)
		add_flora(cell)
		spend_ground()
	else:
		if tool == "stairs":
			stair_directions[cell] = available_stair_direction(cell)
			var landing: Vector2i = cell + stair_directions[cell]
			if cells.has(landing):
				# The kit supplies the landing, returning the replaced plain tile.
				stock[cells[landing]] += 1
			if cells.has(cell):
				stock[cells[cell]] += 1
			flora.erase(cell)
			cells[cell] = "stairs"
			var new_landing: bool = not cells.has(landing)
			cells[landing] = "high_gold"
			if new_landing:
				add_flora(landing)
		cells[cell] = tool
		if tool != "stairs":
			add_flora(cell)
		stock[tool] -= 1
	prune_decorations()
	return true

func path(from: Vector2i, to: Vector2i) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if not cells.has(to):
		return result
	var queue: Array[Vector2i] = [from]
	var previous: Dictionary = {from: from}
	while not queue.is_empty():
		var cell: Vector2i = queue.pop_front()
		if cell == to:
			while cell != from:
				result.push_front(cell)
				cell = previous[cell]
			return result
		for step in STEPS:
			var neighbor: Vector2i = cell + step
			if can_cross(cell, neighbor) and not previous.has(neighbor):
				previous[neighbor] = cell
				queue.append(neighbor)
	return result

func snapshot() -> Dictionary:
	var tiles: Array = []
	for cell in cells:
		tiles.append([cell.x, cell.y, cells[cell], trees.has(cell), stair_direction(cell).x if cells[cell] == "stairs" else 0, flora.get(cell, 0)])
	var saved_decorations: Array = []
	for owner in decorations:
		var item: Dictionary = decorations[owner]
		var water: Vector2i = item.get("water", owner)
		saved_decorations.append([owner.x, owner.y, item.kind, item.variant, water.x, water.y])
	return {"version": 7, "tiles": tiles, "stock": stock.duplicate(), "level": level, "decorations": saved_decorations}

func restore(data: Dictionary) -> bool:
	if int(data.get("version", 0)) not in [1, 2, 3, 4, 5, 6, 7] or not data.get("tiles") is Array or not data.get("stock") is Dictionary:
		return false
	var next_level := int(data.get("level", 0)) if int(data.version) >= 6 else (3 if data.get("unlocked", false) else 1)
	if next_level not in [1, 2, 3]:
		return false
	var next_cells := {}
	var next_trees := {}
	var next_stairs := {}
	var next_flora := {}
	var next_stock := {}
	for tile in data.tiles:
		if not tile is Array or tile.size() != (6 if int(data.version) >= 4 else (5 if int(data.version) == 3 else 4)) or not tile[2] in KINDS:
			return false
		var cell := Vector2i(int(tile[0]), int(tile[1]))
		if not in_bounds(cell) or next_cells.has(cell):
			return false
		next_cells[cell] = tile[2]
		var decoration: int = int(tile[5]) if int(data.version) >= 4 else int({Vector2i(0, 0): 1, Vector2i(1, 1): 2, Vector2i(3, 2): 1}.get(cell, 0))
		if decoration < 0 or decoration > 2:
			return false
		if decoration > 0 and tile[2] != "stairs":
			next_flora[cell] = decoration
		if tile[2] == "stairs" and int(data.version) >= 3:
			if int(tile[4]) not in [-1, 1]:
				return false
			next_stairs[cell] = Vector2i(int(tile[4]), 0)
		if tile[3]:
			next_trees[cell] = true
	var safe_spawn := false
	for cell in next_cells:
		if not next_trees.has(cell) and next_cells[cell] != "stairs":
			safe_spawn = true
	if not safe_spawn:
		return false
	for kind in KINDS + ["tree"]:
		var amount := int(data.stock.get(kind, 0 if kind == "stairs" and data.get("version") == 1 else -1))
		if amount < 0 or amount > 13:
			return false
		next_stock[kind] = amount
	var next_decorations := {}
	var water_claims := {}
	var duck_count := 0
	if int(data.version) >= 7:
		if not data.get("decorations") is Array:
			return false
		for item in data.decorations:
			if not item is Array or item.size() != 6 or not item[2] in DecorationRules.VARIANTS:
				return false
			var owner := Vector2i(int(item[0]), int(item[1]))
			var water := Vector2i(int(item[4]), int(item[5]))
			if not next_cells.has(owner) or next_cells[owner] == "stairs" or next_decorations.has(owner) or next_flora.has(owner):
				return false
			var variant := int(item[3])
			if variant < 1 or variant > DecorationRules.VARIANTS[item[2]]:
				return false
			var record := {"kind": item[2], "variant": variant}
			if item[2] in DecorationRules.WATER_KINDS:
				if not in_bounds(water) or next_cells.has(water) or water_claims.has(water) or (water - owner) not in STEPS:
					return false
				water_claims[water] = true
				record.water = water
			if item[2] == "ducks":
				duck_count += 1
				if duck_count > 1:
					return false
			next_decorations[owner] = record
	# Migrate old previews without discarding placements or granting rewards twice.
	var total: int = next_cells.size()
	for kind in KINDS:
		total += next_stock[kind] * (2 if kind == "stairs" and int(data.version) >= 5 else 1)
	var expected_total: int = {1: 5, 2: 10, 3: 15}[next_level] if int(data.version) >= 6 else ((15 if int(data.version) >= 5 else (10 if int(data.version) == 1 else 13)) if next_level == 3 else 5)
	if total != expected_total:
		return false
	if next_trees.size() + next_stock.tree != (1 if next_level == 3 else 0):
		return false
	if data.get("version") == 1 and data.get("unlocked", false):
		next_stock.meadow += 1
		next_stock.stairs += 2
	cells = next_cells
	trees = next_trees
	flora = next_flora
	decorations = next_decorations
	stair_directions = next_stairs
	for cell in cells:
		if cells[cell] == "stairs" and not stair_directions.has(cell):
			stair_directions[cell] = proposed_stair_direction(cell)
	stock = next_stock
	level = next_level
	if int(data.version) < 5:
		var claimed := {}
		for cell in stair_directions.keys():
			var landing: Vector2i = cell + stair_directions[cell]
			if claimed.has(landing):
				cells.erase(cell)
				stair_directions.erase(cell)
				stock.stairs += 1
				continue
			claimed[landing] = true
			if cells.has(landing):
				stock[cells[landing]] += 1
			else:
				cells[landing] = "high_gold"
	return true
