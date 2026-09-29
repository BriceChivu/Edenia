extends RefCounted

const ORIGIN := Vector2(512, 176)
const SIZE := 64
const HOME := Vector2i(0, 0)
const MIN_CELL := Vector2i(-6, -2)
const MAX_CELL := Vector2i(8, 3)
const KINDS := ["meadow", "gold", "violet", "high_meadow", "high_gold"]
const COLORS := {"meadow": 2, "gold": 1, "violet": 5, "high_meadow": 2, "high_gold": 1}
const STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
var cells: Dictionary = {}
var trees: Dictionary = {}
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
		stock[kind] += 1

func cell_at(point: Vector2) -> Vector2i:
	return Vector2i(floor((point.x - ORIGIN.x) / SIZE), floor((point.y - ORIGIN.y) / SIZE))

func center(cell: Vector2i) -> Vector2:
	return ORIGIN + Vector2(cell) * SIZE + Vector2.ONE * SIZE / 2.0

func height_at(cell: Vector2i) -> float:
	return 32.0 if str(cells.get(cell, "")).begins_with("high_") else 0.0

func in_bounds(cell: Vector2i) -> bool:
	return cell.x >= MIN_CELL.x and cell.x <= MAX_CELL.x and cell.y >= MIN_CELL.y and cell.y <= MAX_CELL.y

func can_edit(cell: Vector2i, tool: String, occupied: Vector2i) -> bool:
	if not unlocked or not in_bounds(cell):
		return false
	if tool == "remove":
		return cells.has(cell) and cell != HOME and cell != occupied
	if tool == "tree":
		return stock.tree > 0 and cells.has(cell) and not trees.has(cell) and cell != HOME and cell != occupied
	return tool in KINDS and stock.get(tool, 0) > 0 and not cells.has(cell)

func edit(cell: Vector2i, tool: String, occupied: Vector2i) -> bool:
	if not can_edit(cell, tool, occupied):
		return false
	if tool == "remove":
		if trees.has(cell):
			trees.erase(cell)
			stock.tree += 1
		else:
			stock[cells[cell]] += 1
			cells.erase(cell)
	elif tool == "tree":
		trees[cell] = true
		stock.tree -= 1
	else:
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
			if cells.has(neighbor) and not trees.has(neighbor) and not previous.has(neighbor):
				previous[neighbor] = cell
				queue.append(neighbor)
	return result

func snapshot() -> Dictionary:
	var tiles: Array = []
	for cell in cells:
		tiles.append([cell.x, cell.y, cells[cell], trees.has(cell)])
	return {"version": 1, "tiles": tiles, "stock": stock.duplicate(), "unlocked": unlocked}

func restore(data: Dictionary) -> bool:
	if data.get("version") != 1 or not data.get("tiles") is Array or not data.get("stock") is Dictionary:
		return false
	var next_cells := {}
	var next_trees := {}
	var next_stock := {}
	for tile in data.tiles:
		if not tile is Array or tile.size() != 4 or not tile[2] in KINDS:
			return false
		var cell := Vector2i(int(tile[0]), int(tile[1]))
		if not in_bounds(cell) or next_cells.has(cell):
			return false
		next_cells[cell] = tile[2]
		if tile[3]:
			next_trees[cell] = true
	if not next_cells.has(HOME) or next_trees.has(HOME):
		return false
	for kind in KINDS + ["tree"]:
		var amount := int(data.stock.get(kind, -1))
		if amount < 0 or amount > 10:
			return false
		next_stock[kind] = amount
	# The starter collection contains five original tiles, five rewards, one tree.
	var total: int = next_cells.size()
	for kind in KINDS:
		total += next_stock[kind]
	if total != (10 if data.get("unlocked", false) else 5):
		return false
	if next_trees.size() + next_stock.tree != (1 if data.get("unlocked", false) else 0):
		return false
	cells = next_cells
	trees = next_trees
	stock = next_stock
	unlocked = data.get("unlocked", false)
	return true
