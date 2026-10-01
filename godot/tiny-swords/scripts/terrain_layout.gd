extends RefCounted

const DecorationRules = preload("res://scripts/decoration_rules.gd")

const ORIGIN := Vector2(512, 176)
const SIZE := 64
const TREE_OFFSET_LIMIT := 20.0
const TREE_ART_OFFSET := Vector2(0, -112)
const FLOOR_PALETTES := [3, 1, 2, 4, 5]
const HOME := Vector2i(0, 0)
const MIN_CELL := Vector2i(-12, -4)
const MAX_CELL := Vector2i(14, 5)
const KINDS := ["meadow", "gold", "violet", "high_meadow", "high_gold", "stairs"]
const COLORS := {"meadow": 3, "gold": 3, "violet": 3, "high_meadow": 1, "high_gold": 1, "stairs": 1}
const REWARDS := {"meadow": 2, "gold": 1, "violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 2, "tree": 1}
const LEVEL_REWARDS := {
	2: {"meadow": 2, "gold": 1, "stairs": 1},
	3: {"violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 1, "tree": 1},
}
const STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
const NAV_STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN, Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)]
var cells: Dictionary = {}
var trees: Dictionary = {}
var stair_directions: Dictionary = {}
var elevations: Dictionary = {}
var manual_ground_elevation := false
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
	return float(elevations.get(cell, 64 if str(cells.get(cell, "")).begins_with("high_") else 0))

func tree_offset(cell: Vector2i) -> Vector2:
	# Boolean records from older layouts and fixtures mean the original anchor.
	var value = trees.get(cell, Vector2.ZERO)
	return value if value is Vector2 else Vector2.ZERO

func tree_position(cell: Vector2i) -> Vector2:
	return center(cell) + tree_offset(cell)

func tree_obstacle(position: Vector2) -> Rect2:
	return Rect2(position - Vector2(10, 10), Vector2(20, 18)).grow(7)

func valid_tree_offset(offset: Vector2) -> bool:
	return offset.is_finite() and absf(offset.x) <= TREE_OFFSET_LIMIT and absf(offset.y) <= TREE_OFFSET_LIMIT

func spawn_cell() -> Vector2i:
	if cells.has(HOME) and not trees.has(HOME) and cells[HOME] != "stairs":
		return HOME
	for cell in cells:
		if not trees.has(cell) and cells[cell] != "stairs":
			return cell
	return HOME

func random_respawn_cell() -> Vector2i:
	var candidates: Array[Vector2i] = []
	for cell in cells:
		if cells[cell] != "stairs" and not trees.has(cell):
			candidates.append(cell)
	return candidates.pick_random() if not candidates.is_empty() else spawn_cell()

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

func can_edit(cell: Vector2i, tool: String, occupied: Vector2i, ground_height: float = -1, tree_placement_offset: Vector2 = Vector2.ZERO) -> bool:
	if not unlocked or not in_bounds(cell):
		return false
	if tool == "remove":
		if not cells.has(cell) or cell == occupied:
			return false
		if cells[cell] == "stairs":
			var landing := cell + stair_direction(cell)
			if landing == occupied or trees.has(landing):
				return false
			# This landing may also be the foot of another stair bundle.
			# Collecting it must not leave that ramp connected to water.
			for other in stair_directions:
				if other != cell and landing == other - stair_direction(other):
					return false
		if not trees.has(cell) and cells[cell] != "stairs":
			for step in [Vector2i.LEFT, Vector2i.RIGHT]:
				if cells.get(cell + step) == "stairs":
					return false
		return true
	if tool == "tree":
		return valid_tree_offset(tree_placement_offset) and stock.tree > 0 and cells.has(cell) and not trees.has(cell) and cells[cell] != "stairs" and cell != HOME and cell != occupied
	if tool == "ground":
		if ground_height >= 0:
			var target := ground_target(cell, ground_height)
			var allowed: bool = ground_height in ground_options(cell) or (target != cell and cell != occupied and target != occupied)
			return allowed and (cells.has(cell) or ground_count() > 0)
		return can_raise_ground(cell) if cells.has(cell) else ground_count() > 0
	if tool == "stairs":
		var direction := available_stair_direction(cell)
		return stock.stairs > 0 and direction != Vector2i.ZERO and cell != occupied and cell + direction != occupied
	return tool in KINDS and stock.get(tool, 0) > 0 and not cells.has(cell)

func can_raise_ground(cell: Vector2i) -> bool:
	if not cells.has(cell) or cells[cell] == "stairs" or automatic_height(cell) <= height_at(cell):
		return false
	# Stair endpoints must retain the height that connects them to the ramp.
	for stair in cells:
		if cells[stair] == "stairs":
			var direction := stair_direction(stair)
			if cell == stair - direction or cell == stair + direction:
				return false
	return true

func stair_endpoint(cell: Vector2i) -> bool:
	for stair in cells:
		if cells[stair] == "stairs":
			var direction := stair_direction(stair)
			if cell == stair - direction or cell == stair + direction:
				return true
	return false

func terrace_height(cell: Vector2i, proposed_height: float) -> float:
	var above := cell + Vector2i.UP
	var below := cell + Vector2i.DOWN
	if proposed_height > SIZE and cells.has(above) and cells[above] != "stairs" and height_at(above) == proposed_height and not stair_endpoint(cell):
		if not cells.has(below) or height_at(below) < proposed_height:
			return proposed_height - SIZE
	return proposed_height

func normalize_cliff_terraces() -> void:
	if not manual_ground_elevation:
		normalize_ground_continuations()
	# At the front of a tall plateau, the lower tile is one floor lower.
	# Its grass receives the upper cliff, and its own cliff ends at the shore.
	var ordered: Array = cells.keys()
	ordered.sort_custom(func(a, b): return a.y > b.y)
	for cell in ordered:
		if cells[cell] == "stairs":
			continue
		var height := terrace_height(cell, height_at(cell))
		if height != height_at(cell):
			elevations[cell] = height
			cells[cell] = kind_at_height(height)

func normalize_ground_continuations() -> void:
	# Compare visible tops: elevation shifts a top upward from its grid base.
	# Legacy layouts retain their existing migration. Once using repeated-click
	# building, water-level grass waits for a click to raise it.
	# Moving the flat tile's base down by the same amount preserves its top
	# position while joining the raised square immediately in front of it.
	for front in cells.keys():
		if cells[front] == "stairs" or height_at(front) != SIZE:
			continue
		var base: Vector2i = front + Vector2i.UP
		var flat: Vector2i = base + Vector2i.UP
		if cells.has(base) or not cells.has(flat) or cells[flat] == "stairs" or height_at(flat) != 0 or stair_endpoint(flat):
			continue
		cells.erase(flat)
		elevations.erase(flat)
		cells[base] = kind_at_height(SIZE)
		elevations[base] = SIZE
		for records in [trees, flora, decorations]:
			if records.has(flat):
				records[base] = records[flat]
				records.erase(flat)

func ground_count() -> int:
	var count := 0
	for kind in KINDS:
		if kind != "stairs":
			count += stock[kind]
	return count

func automatic_height(cell: Vector2i) -> float:
	var height := 0.0
	for step in STEPS:
		var neighbor: Vector2i = cell + step
		if cells.get(neighbor) != "stairs":
			height = maxf(height, height_at(neighbor))
	return terrace_height(cell, height)

# Valid grass elevations at one grid footprint. Inventory and unlock
# checks remain in can_edit().
func ground_options(cell: Vector2i) -> Array[float]:
	var result: Array[float] = []
	if not in_bounds(cell) or (cells.has(cell) and (cells[cell] == "stairs" or stair_endpoint(cell))):
		return result
	var candidates: Array[float] = [0.0]
	for step in STEPS:
		var neighbor: Vector2i = cell + step
		if cells.has(neighbor) and cells[neighbor] != "stairs":
			var height := height_at(neighbor)
			for option in [height, terrace_height(cell, height)]:
				if option not in candidates:
					candidates.append(option)
	var below := cell + Vector2i.DOWN
	var receiving_height := height_at(below) if cells.has(below) else 0.0
	var above := cell + Vector2i.UP
	for height in candidates:
		if cells.has(cell) and height <= height_at(cell):
			continue
		# A raised surface must step down by at most one cliff. Never offer
		# floor two over open water, even when a floor-two neighbor is close.
		if height > receiving_height + SIZE or terrace_height(cell, height) != height:
			continue
		# The new surface also receives the cliff immediately behind it.
		if cells.has(above) and cells[above] != "stairs" and height_at(above) > height + SIZE:
			continue
		result.append(height)
	result.sort()
	return result

# A grass top can visually touch a terrace while its water-level grid base
# is two rows behind it. On an explicit raise, continue that terrace by moving
# the base one row forward and raising one floor; the visible top stays put.
func ground_continuation_target(cell: Vector2i) -> Vector2i:
	if not cells.has(cell) or cells[cell] == "stairs" or stair_endpoint(cell):
		return cell
	var target := cell + Vector2i.DOWN
	var front := target + Vector2i.DOWN
	var height := height_at(cell) + SIZE
	if not in_bounds(target) or stair_endpoint(target):
		return cell
	if cells.has(target):
		# The receiving terrace can completely hide a flat destination.
		# Merge that redundant square, preserving its objects and accounting.
		if cells[target] == "stairs" or height_at(target) != height_at(cell):
			return cell
		if trees.has(cell) and trees.has(target):
			return cell
		if (flora.has(cell) or decorations.has(cell)) and (flora.has(target) or decorations.has(target)):
			return cell
	if not cells.has(front) or cells[front] == "stairs" or height_at(front) != height:
		return cell
	return target if height in ground_options(target) else cell

func ground_target(cell: Vector2i, height: float) -> Vector2i:
	if height in ground_options(cell) or height != height_at(cell) + SIZE:
		return cell
	return ground_continuation_target(cell)

# New grass starts at water level. Further clicks choose the lowest available
# higher extension, so pointer proximity never determines elevation.
func next_ground_height(cell: Vector2i) -> float:
	var options := ground_options(cell)
	if not cells.has(cell):
		return 0.0 if 0.0 in options else -1.0
	if not options.is_empty():
		return options[0]
	return height_at(cell) + SIZE if ground_continuation_target(cell) != cell else -1.0

func kind_at_height(height: float) -> String:
	return "meadow" if height == 0 else ("high_gold" if int(height / SIZE) % 2 == 1 else "high_meadow")

func palette_at_height(height: float) -> int:
	return FLOOR_PALETTES[int(height / SIZE) % FLOOR_PALETTES.size()]

func automatic_kind(cell: Vector2i) -> String:
	return kind_at_height(automatic_height(cell))

# A horizontal stair rises one floor from its lower endpoint.
func proposed_stair_direction(cell: Vector2i) -> Vector2i:
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		var low: Vector2i = cell - direction
		var high: Vector2i = cell + direction
		if cells.has(low) and cells[low] != "stairs" and (not cells.has(high) or height_at(high) == height_at(low) + SIZE):
			return direction
	return Vector2i.ZERO

func available_stair_direction(cell: Vector2i) -> Vector2i:
	if cells.get(cell) == "stairs" or trees.has(cell):
		return Vector2i.ZERO
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		var low: Vector2i = cell - direction
		var landing: Vector2i = cell + direction
		if not cells.has(low) or cells[low] == "stairs":
			continue
		# A ramp cannot sit on an exposed cliff: the front receiving floor
		# must cover its base. Flat ramps can still be placed over water.
		var below := cell + Vector2i.DOWN
		if height_at(low) > height_at(below):
			continue
		# The bundled landing rises one floor above the ramp. Its front
		# support must cover all lower tiers, leaving only that single cliff.
		if height_at(low) > height_at(landing + Vector2i.DOWN):
			continue
		if not in_bounds(landing) or cells.get(landing) == "stairs" or trees.has(landing):
			continue
		var shared := false
		for other in stair_directions:
			# Preserve ramp endpoints. Upper landings may be shared only
			# when the new approach reaches their existing floor.
			var foot: Vector2i = other - stair_directions[other]
			var top: Vector2i = other + stair_directions[other]
			if cell == foot or cell == top or landing == foot:
				shared = true
			if landing == top and height_at(top) != height_at(low) + SIZE:
				shared = true
		if not shared:
			return direction
	return Vector2i.ZERO

# Landing ownership follows the ramps, so either approach may be collected.
func landing_shared_by(landing: Vector2i, excluding: Vector2i) -> bool:
	for stair in stair_directions:
		if stair != excluding and stair + stair_direction(stair) == landing:
			return true
	return false

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
		if tree_obstacle(tree_position(cell)).has_point(point):
			return false
	return true

func stair_pickup_rects(cell: Vector2i) -> Array[Rect2]:
	# Three screen-grid squares: ramp, landing top, and landing cliff face.
	var origin := ORIGIN + Vector2(cell) * SIZE - Vector2(0, height_at(cell))
	var landing_origin := origin + Vector2(stair_direction(cell)) * SIZE - Vector2(0, SIZE)
	return [Rect2(origin, Vector2(SIZE, SIZE)), Rect2(landing_origin, Vector2(SIZE, SIZE * 2))]

func stair_direction(cell: Vector2i) -> Vector2i:
	return stair_directions.get(cell, proposed_stair_direction(cell))

func can_cross(from: Vector2i, to: Vector2i) -> bool:
	if not cells.has(from) or not cells.has(to):
		return false
	var delta := to - from
	if absi(delta.x) == 1 and absi(delta.y) == 1:
		# The two lower stair corners leave room for the pawn's feet between
		# equal-height grass tiles. Do not open other cliff or water corners.
		if cells[from] == "stairs" or cells[to] == "stairs" or height_at(from) != height_at(to):
			return false
		var side_x := from + Vector2i(delta.x, 0)
		var side_y := from + Vector2i(0, delta.y)
		return cells.get(side_x) == "stairs" and cells.get(side_y) == "stairs" and stair_direction(side_x) == Vector2i(delta.x, 0) and stair_direction(side_y) == Vector2i(-delta.x, 0) and height_at(side_x) == height_at(from) and height_at(side_y) == height_at(from)
	if delta not in STEPS:
		return false
	# Parallel adjoining ramps share the same height along their entire side.
	# Other stair sides still meet a cliff or a different slope.
	if cells[from] == "stairs" and cells[to] == "stairs":
		var direction := stair_direction(from)
		return direction != Vector2i.ZERO and to.x == from.x and stair_direction(to) == direction and height_at(from) == height_at(to)
	if cells[from] == "stairs":
		var direction := stair_direction(from)
		return direction != Vector2i.ZERO and cells[to] != "stairs" and ((to == from + direction and height_at(to) == height_at(from) + SIZE) or (to == from - direction and height_at(to) == height_at(from)))
	if cells[to] == "stairs":
		var direction := stair_direction(to)
		return direction != Vector2i.ZERO and cells[from] != "stairs" and ((from == to + direction and height_at(from) == height_at(to) + SIZE) or (from == to - direction and height_at(from) == height_at(to)))
	return height_at(from) == height_at(to)

func edit(cell: Vector2i, tool: String, occupied: Vector2i, ground_height: float = -1, tree_placement_offset: Vector2 = Vector2.ZERO) -> bool:
	if not can_edit(cell, tool, occupied, ground_height, tree_placement_offset):
		return false
	if tool == "remove":
		if trees.has(cell):
			trees.erase(cell)
			stock.tree += 1
		else:
			if cells[cell] == "stairs":
				var landing := cell + stair_direction(cell)
				if not landing_shared_by(landing, cell):
					flora.erase(landing)
					cells.erase(landing)
					elevations.erase(landing)
			stock[cells[cell]] += 1
			stair_directions.erase(cell)
			flora.erase(cell)
			cells.erase(cell)
			elevations.erase(cell)
	elif tool == "tree":
		trees[cell] = tree_placement_offset
		stock.tree -= 1
	elif tool == "ground":
		if ground_height >= 0:
			manual_ground_elevation = true
		var new_ground: bool = not cells.has(cell)
		if ground_height >= 0:
			var target := ground_target(cell, ground_height)
			if target != cell:
				if cells.has(target):
					stock[cells[cell]] += 1
				cells.erase(cell)
				elevations.erase(cell)
				# Aquatic decorations belong to an adjacent water square;
				# shifting their owner would leave a diagonal saved reference.
				if decorations.has(cell) and decorations[cell].kind in DecorationRules.WATER_KINDS:
					decorations.erase(cell)
				for records in [trees, flora, decorations]:
					if records.has(cell):
						records[target] = records[cell]
						records.erase(cell)
				cell = target
		elevations[cell] = ground_height if ground_height >= 0 else automatic_height(cell)
		cells[cell] = kind_at_height(elevations[cell])
		if new_ground:
			add_flora(cell)
			spend_ground()
	else:
		if tool == "stairs":
			stair_directions[cell] = available_stair_direction(cell)
			var landing: Vector2i = cell + stair_directions[cell]
			elevations[cell] = height_at(cell - stair_directions[cell])
			if cells.has(landing) and not landing_shared_by(landing, cell):
				# The kit supplies the landing, returning the replaced plain tile.
				stock[cells[landing]] += 1
			if cells.has(cell):
				stock[cells[cell]] += 1
			flora.erase(cell)
			cells[cell] = "stairs"
			var new_landing: bool = not cells.has(landing)
			elevations[landing] = height_at(cell) + SIZE
			cells[landing] = kind_at_height(height_at(landing))
			if new_landing:
				add_flora(landing)
		cells[cell] = tool
		if tool != "stairs":
			add_flora(cell)
		stock[tool] -= 1
	normalize_cliff_terraces()
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
		for step in NAV_STEPS:
			var neighbor: Vector2i = cell + step
			if can_cross(cell, neighbor) and not previous.has(neighbor):
				previous[neighbor] = cell
				queue.append(neighbor)
	return result

func snapshot() -> Dictionary:
	var tiles: Array = []
	for cell in cells:
		tiles.append([cell.x, cell.y, cells[cell], trees.has(cell), stair_direction(cell).x if cells[cell] == "stairs" else 0, flora.get(cell, 0), height_at(cell)])
	var saved_decorations: Array = []
	for owner in decorations:
		var item: Dictionary = decorations[owner]
		var water: Vector2i = item.get("water", owner)
		saved_decorations.append([owner.x, owner.y, item.kind, item.variant, water.x, water.y])
	var saved_trees: Array = []
	for cell in trees:
		var offset := tree_offset(cell)
		saved_trees.append([cell.x, cell.y, offset.x, offset.y])
	var saved := {"version": 10, "tree_offsets": saved_trees, "tiles": tiles, "stock": stock.duplicate(), "level": level, "decorations": saved_decorations}
	if manual_ground_elevation:
		saved.manual_ground_elevation = true
	return saved

func restore(data: Dictionary) -> bool:
	if int(data.get("version", 0)) not in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] or not data.get("tiles") is Array or not data.get("stock") is Dictionary:
		return false
	if not data.get("manual_ground_elevation", false) is bool:
		return false
	var next_level := int(data.get("level", 0)) if int(data.version) >= 6 else (3 if data.get("unlocked", false) else 1)
	if next_level not in [1, 2, 3]:
		return false
	var next_cells := {}
	var next_trees := {}
	var next_stairs := {}
	var next_elevations := {}
	var next_flora := {}
	var next_stock := {}
	for tile in data.tiles:
		if not tile is Array or tile.size() != (7 if int(data.version) >= 8 else (6 if int(data.version) >= 4 else (5 if int(data.version) == 3 else 4))) or not tile[2] in KINDS:
			return false
		var cell := Vector2i(int(tile[0]), int(tile[1]))
		if not in_bounds(cell) or next_cells.has(cell):
			return false
		next_cells[cell] = tile[2]
		if int(data.version) >= 8:
			var height := int(tile[6])
			if height < 0 or height > SIZE * 13 or height % SIZE != 0:
				return false
			next_elevations[cell] = height
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
			next_trees[cell] = Vector2.ZERO
	if int(data.version) >= 9:
		if not data.get("tree_offsets") is Array:
			return false
		var seen := {}
		for record in data.tree_offsets:
			if not record is Array or record.size() != 4:
				return false
			for number in record:
				if not (number is int or number is float) or not is_finite(float(number)):
					return false
			var cell := Vector2i(int(record[0]), int(record[1]))
			var offset := Vector2(float(record[2]), float(record[3]))
			if record[0] != cell.x or record[1] != cell.y or not next_trees.has(cell) or seen.has(cell) or not valid_tree_offset(offset) or next_cells[cell] == "stairs":
				return false
			next_trees[cell] = offset
			seen[cell] = true
		if seen.size() != next_trees.size():
			return false
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
	# Each stair kit still owns a landing even when two kits share its tile.
	if int(data.version) >= 5:
		var landings := {}
		for stair in next_stairs:
			var landing: Vector2i = stair + next_stairs[stair]
			if landings.has(landing):
				total += 1
			landings[landing] = true
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
	manual_ground_elevation = data.get("manual_ground_elevation", false)
	elevations = next_elevations
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
	normalize_cliff_terraces()
	return true
