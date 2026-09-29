extends RefCounted

const ORIGIN := Vector2(512, 176)
const SIZE := 64
const HOME := Vector2i(0, 0)
const MIN_CELL := Vector2i(-6, -2)
const MAX_CELL := Vector2i(8, 3)
const KINDS := ["meadow", "gold", "violet", "high_meadow", "high_gold", "stairs"]
const COLORS := {"meadow": 3, "gold": 3, "violet": 3, "high_meadow": 1, "high_gold": 1, "stairs": 1}
const REWARDS := {"meadow": 2, "gold": 1, "violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 2, "tree": 1}
const STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
var cells: Dictionary = {}
var trees: Dictionary = {}
var stair_directions: Dictionary = {}
var stock: Dictionary = {}
var unlocked := false

func _init() -> void:
	for cell in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(3, 2)]:
		cells[cell] = "meadow"
	for kind in KINDS + ["tree"]:
		stock[kind] = 0

func unlock() -> void:
	if unlocked:
		return
	unlocked = true
	for kind in KINDS + ["tree"]:
		stock[kind] += REWARDS[kind]

func cell_at(point: Vector2) -> Vector2i:
	return Vector2i(floor((point.x - ORIGIN.x) / SIZE), floor((point.y - ORIGIN.y) / SIZE))

func center(cell: Vector2i) -> Vector2:
	return ORIGIN + Vector2(cell) * SIZE + Vector2.ONE * SIZE / 2.0

func height_at(cell: Vector2i) -> float:
	return 64.0 if str(cells.get(cell, "")).begins_with("high_") else 0.0

func in_bounds(cell: Vector2i) -> bool:
	return cell.x >= MIN_CELL.x and cell.x <= MAX_CELL.x and cell.y >= MIN_CELL.y and cell.y <= MAX_CELL.y

func can_edit(cell: Vector2i, tool: String, occupied: Vector2i) -> bool:
	if not unlocked or not in_bounds(cell):
		return false
	if tool == "remove":
		if not cells.has(cell) or cell == HOME or cell == occupied:
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
		return stock.stairs > 0 and not cells.has(cell) and proposed_stair_direction(cell) != Vector2i.ZERO
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

func stair_direction(cell: Vector2i) -> Vector2i:
	return stair_directions.get(cell, proposed_stair_direction(cell))

func can_cross(from: Vector2i, to: Vector2i) -> bool:
	if not cells.has(from) or not cells.has(to) or trees.has(to) or (to - from) not in STEPS:
		return false
	if cells[from] == "stairs":
		var direction := stair_direction(from)
		return direction != Vector2i.ZERO and (to == from + direction or to == from - direction)
	if cells[to] == "stairs":
		var direction := stair_direction(to)
		return direction != Vector2i.ZERO and (from == to + direction or from == to - direction)
	return height_at(from) == height_at(to)

func edit(cell: Vector2i, tool: String, occupied: Vector2i) -> bool:
	if not can_edit(cell, tool, occupied):
		return false
	if tool == "remove":
		if trees.has(cell):
			trees.erase(cell)
			stock.tree += 1
		else:
			stock[cells[cell]] += 1
			stair_directions.erase(cell)
			cells.erase(cell)
	elif tool == "tree":
		trees[cell] = true
		stock.tree -= 1
	elif tool == "ground":
		cells[cell] = automatic_kind(cell)
		for kind in KINDS:
			if kind != "stairs" and stock[kind] > 0:
				stock[kind] -= 1
				break
	else:
		if tool == "stairs":
			stair_directions[cell] = proposed_stair_direction(cell)
		cells[cell] = tool
		stock[tool] -= 1
	return true

func path(from: Vector2i, to: Vector2i) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if not cells.has(to) or trees.has(to):
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
		tiles.append([cell.x, cell.y, cells[cell], trees.has(cell), stair_direction(cell).x if cells[cell] == "stairs" else 0])
	return {"version": 3, "tiles": tiles, "stock": stock.duplicate(), "unlocked": unlocked}

func restore(data: Dictionary) -> bool:
	if int(data.get("version", 0)) not in [1, 2, 3] or not data.get("tiles") is Array or not data.get("stock") is Dictionary:
		return false
	var next_cells := {}
	var next_trees := {}
	var next_stairs := {}
	var next_stock := {}
	for tile in data.tiles:
		if not tile is Array or tile.size() != (5 if int(data.version) == 3 else 4) or not tile[2] in KINDS:
			return false
		var cell := Vector2i(int(tile[0]), int(tile[1]))
		if not in_bounds(cell) or next_cells.has(cell):
			return false
		next_cells[cell] = tile[2]
		if tile[2] == "stairs" and int(data.version) == 3:
			if int(tile[4]) not in [-1, 1]:
				return false
			next_stairs[cell] = Vector2i(int(tile[4]), 0)
		if tile[3]:
			next_trees[cell] = true
	if not next_cells.has(HOME) or next_trees.has(HOME):
		return false
	for kind in KINDS + ["tree"]:
		var amount := int(data.stock.get(kind, 0 if kind == "stairs" and data.get("version") == 1 else -1))
		if amount < 0 or amount > 13:
			return false
		next_stock[kind] = amount
	# Migrate old previews without discarding placements or granting rewards twice.
	var total: int = next_cells.size()
	for kind in KINDS:
		total += next_stock[kind]
	if total != ((10 if data.get("version") == 1 else 13) if data.get("unlocked", false) else 5):
		return false
	if next_trees.size() + next_stock.tree != (1 if data.get("unlocked", false) else 0):
		return false
	if data.get("version") == 1 and data.get("unlocked", false):
		next_stock.meadow += 1
		next_stock.stairs += 2
	cells = next_cells
	trees = next_trees
	stair_directions = next_stairs
	for cell in cells:
		if cells[cell] == "stairs" and not stair_directions.has(cell):
			stair_directions[cell] = proposed_stair_direction(cell)
	stock = next_stock
	unlocked = data.get("unlocked", false)
	return true
