extends RefCounted

const BridgeRules = preload("res://scripts/bridge_rules.gd")

const DecorationRules = preload("res://scripts/decoration_rules.gd")

const ORIGIN := Vector2(512, 176)
const SIZE := 64
const HOUSE_LOG_COST := 6
# All eight frames have opaque trunk/root pixels at atlas X 77..117.
# Include their full pixel widths at the tree's 0.8 scale (anchor X 96).
const TREE_OFFSET_X_MIN := -32.0 - (77 - 96) * 0.8
const TREE_OFFSET_X_MAX := 32.0 - (118 - 96) * 0.8
const TREE_LEGACY_OFFSET_LIMIT := 20.0
# The artwork's roots sit above its anchor, so the safe vertical range is lower.
const TREE_OFFSET_Y_MIN := 0.0
const TREE_OFFSET_Y_MAX := 28.0
const TREE_ART_OFFSET := Vector2(0, -112)
const FLOOR_PALETTES := [3, 1, 2, 4, 5]
const HOME := Vector2i(0, 0)
const MIN_CELL := Vector2i(-17, -9)
const MAX_CELL := Vector2i(19, 10)
const KINDS := ["meadow", "gold", "violet", "high_meadow", "high_gold", "stairs"]
const COLORS := {"meadow": 3, "gold": 3, "violet": 3, "high_meadow": 1, "high_gold": 1, "stairs": 1}
const REWARDS := {"meadow": 2, "gold": 1, "violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 2, "tree": 1, "bridge": 1, "sheep": 0, "chicken": 1, "house": 0}
# Total XP = 15 * level * (level - 1) / 2; each next upgrade costs 15 XP more.
const XP_THRESHOLDS := [0, 15, 45, 90, 150, 225, 315, 420, 540, 675]

static func level_for_xp(xp: int) -> int:
	var earned := 1
	for index in XP_THRESHOLDS.size():
		if xp >= XP_THRESHOLDS[index]:
			earned = index + 1
	return earned

const LEVEL_REWARDS := {
	2: {"meadow": 2, "gold": 1, "stairs": 1, "chicken": 1},
	3: {"violet": 1, "high_meadow": 1, "high_gold": 1, "stairs": 1, "tree": 1, "bridge": 1},
	4: {"meadow": 3, "tree": 1},
	5: {"meadow": 3, "sheep": 1, "house": 0},
	6: {"meadow": 3, "tree": 1},
	7: {"meadow": 3, "chicken": 1},
	8: {"meadow": 3, "sheep": 1},
	9: {"meadow": 3},
	10: {"meadow": 3},
}
const TREE_VARIANTS := ["tree", "tree2", "tree3", "tree4"]
const STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
const NAV_STEPS := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN, Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)]
var cells: Dictionary = {}
var bridges_enabled := BridgeRules.ENABLED
var bridges: Dictionary = {}
var free_house_grass := 0
var houses: Dictionary = {} # Cell -> four-way facing.
var house_offsets: Dictionary = {} # Cell -> chosen ground-plane offset.
var chickens: Array[Vector2] = [] # Ground-plane positions, like sheep.
var sheep: Array[Vector2] = [] # Ground-plane positions; rewards at levels five and eight.
var trees: Dictionary = {}
var tree_types: Dictionary = {}
var tree_stumps: Dictionary = {} # Cell -> Unix regrowth deadline.
var tree_cut_remaining: Dictionary = {} # Cell -> active cutting seconds left.
var resources := {"wood": 0}
var house_build: Dictionary = {} # Saved worker position and construction clock.
var house_bundle := 0 # Six reserved logs drawn as one carried log.
var carried_wood := 0
var log_piles: Dictionary = {} # Cell -> one to six deposited logs.
var next_tree_variant := "tree"
var stair_directions: Dictionary = {}
var elevations: Dictionary = {}
var manual_ground_elevation := false
var stock: Dictionary = {}
var flora := {Vector2i(0, 0): 1, Vector2i(1, 1): 2}
var decorations: Dictionary = {Vector2i(3, 2): {"kind": "land_rock", "variant": 1}}
var flora_rng := RandomNumberGenerator.new()
var level := 1
# Explicit extra-item accounting for local testing snapshots. Normal rewards
# remain conserved; this ledger survives editing, save/load and undo.
var playground_grants: Dictionary = {}
var unlocked: bool:
	get: return level >= 2

func _init() -> void:
	flora_rng.randomize()
	next_tree_variant = TREE_VARIANTS[flora_rng.randi_range(0, TREE_VARIANTS.size() - 1)]
	for cell in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(3, 2)]:
		cells[cell] = "meadow"
	for kind in KINDS + ["tree", "bridge", "sheep", "chicken", "house"]:
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

# Ground contact traced from the user's root outlines, in ground-anchor space.
# Variant names map to Tree1, Tree3, Tree2, Tree4 respectively. Canopies and
# translucent shadows never enlarge these footprints.
const TREE_CONTACT := {
	"tree": [Vector2(-20, -10), Vector2(-17, -18), Vector2(-7, -26), Vector2(0, -28), Vector2(8, -24), Vector2(15, -17), Vector2(22, -11), Vector2(12, -4), Vector2(0, -2), Vector2(-12, -4)],
	"tree3": [Vector2(-17, -13), Vector2(-8, -20), Vector2(0, -25), Vector2(7, -22), Vector2(15, -14), Vector2(17, -7), Vector2(7, -2), Vector2(-5, -2), Vector2(-15, -6)],
	"tree2": [Vector2(-9, 0), Vector2(-8, -5), Vector2(-3, -8), Vector2(4, -8), Vector2(9, -3), Vector2(10, 2), Vector2(5, 5), Vector2(-4, 5)],
	"tree4": [Vector2(-8, -1), Vector2(-6, -7), Vector2(-1, -9), Vector2(4, -6), Vector2(8, -1), Vector2(6, 3), Vector2(-3, 3)],
}

func tree_footprint(position: Vector2, kind := "tree") -> PackedVector2Array:
	var points := PackedVector2Array()
	for point in TREE_CONTACT.get(kind, TREE_CONTACT["tree"]):
		points.append(position + point)
	return points

func tree_blocks_point(position: Vector2, point: Vector2, kind := "tree") -> bool:
	return Geometry2D.is_point_in_polygon(point, tree_footprint(position, kind))

func tree_blocks_segment(cell: Vector2i, start: Vector2, end: Vector2) -> bool:
	var footprint := tree_footprint(tree_position(cell), tree_types.get(cell, "tree"))
	if Geometry2D.is_point_in_polygon(start, footprint) or Geometry2D.is_point_in_polygon(end, footprint):
		return true
	for index in footprint.size():
		if Geometry2D.segment_intersects_segment(start, end, footprint[index], footprint[(index + 1) % footprint.size()]) != null:
			return true
	return false

# Ground-plane contact of both soles across walking poses and either facing.
# Raised boots and the translucent shadow do not extend ground contact upwards.
const PAWN_LOG_FEET := Rect2(-20, -1, 40, 2)

func log_footprint(cell: Vector2i) -> PackedVector2Array:
	# Annotated contact patch in the 64px Wood Resource PNG, at its 0.9 scale.
	# Only the bottom row widens the parallelogram; upper logs add no ground area.
	var spread := (mini(int(log_piles.get(cell, 0)), 3) - 1) * 6.5
	var anchor := center(cell) + Vector2(0, 6)
	return PackedVector2Array([
		anchor + Vector2(-18 * 0.9 - spread, 14 * 0.9),
		anchor + Vector2(-6 * 0.9 + spread, 14 * 0.9),
		anchor + Vector2(21 * 0.9 + spread, 6 * 0.9),
		anchor + Vector2(9 * 0.9 - spread, 6 * 0.9),
	])

func log_blocks_contact(cell: Vector2i, start: Vector2, end: Vector2) -> bool:
	var patch := log_footprint(cell)
	if Geometry2D.is_point_in_polygon(start, patch) or Geometry2D.is_point_in_polygon(end, patch):
		return true
	for index in patch.size():
		if Geometry2D.segment_intersects_segment(start, end, patch[index], patch[(index + 1) % patch.size()]) != null:
			return true
	return false

func log_depth_y(cell: Vector2i, pawn_x: float) -> float:
	var patch := log_footprint(cell)
	var front_x := (patch[0].x + patch[1].x) * 0.5
	var back_x := (patch[2].x + patch[3].x) * 0.5
	# Left-side overlap uses the bottom edge; right-side overlap uses the top.
	# The centerline of the contact patch joins those references continuously.
	return lerpf(patch[0].y, patch[2].y, clampf((pawn_x - front_x) / (back_x - front_x), 0, 1))

func log_blocks_feet(cell: Vector2i, start: Vector2, end: Vector2) -> bool:
	var patch := log_footprint(cell)
	var feet_center := PAWN_LOG_FEET.get_center()
	var half_size := PAWN_LOG_FEET.size * 0.5
	var side := patch[3] - patch[0]
	var travel := end - start
	# Separating axes for the contact patch and the swept boot rectangle.
	var axes := [Vector2.RIGHT, Vector2.DOWN, Vector2(-side.y, side.x)]
	if not travel.is_zero_approx():
		axes.append(Vector2(-travel.y, travel.x))
	for axis: Vector2 in axes:
		var low := INF
		var high := -INF
		for vertex in patch:
			var projection := vertex.dot(axis)
			low = minf(low, projection)
			high = maxf(high, projection)
		var radius := absf(axis.x) * half_size.x + absf(axis.y) * half_size.y
		var first := (start + feet_center).dot(axis)
		var last := (end + feet_center).dot(axis)
		if maxf(first, last) + radius < low or minf(first, last) - radius > high:
			return false
	return true

func valid_tree_offset(offset: Vector2) -> bool:
	return offset.is_finite() and offset.x >= TREE_OFFSET_X_MIN and offset.x <= TREE_OFFSET_X_MAX and offset.y >= TREE_OFFSET_Y_MIN and offset.y <= TREE_OFFSET_Y_MAX

func spawn_cell() -> Vector2i:
	if cells.has(HOME) and not trees.has(HOME) and house_owner(HOME) == Vector2i(999, 999) and cells[HOME] != "stairs":
		return HOME
	for cell in cells:
		if not trees.has(cell) and house_owner(cell) == Vector2i(999, 999) and cells[cell] != "stairs":
			return cell
	return HOME

func random_respawn_cell() -> Vector2i:
	var candidates: Array[Vector2i] = []
	for cell in cells:
		if cells[cell] != "stairs" and not trees.has(cell) and house_owner(cell) == Vector2i(999, 999):
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

func duck_count() -> int:
	var count := 0
	for item in decorations.values():
		if item.kind == "ducks":
			count += 1
	return count

func has_ducks() -> bool:
	return duck_count() > 0

func add_flora(cell: Vector2i) -> void:
	# A placed tile gets one roll, never a fresh roll when it is rendered.
	prune_decorations()
	flora.erase(cell)
	decorations.erase(cell)
	var spaces := water_spaces(cell)
	var kind := DecorationRules.choose(flora_rng, not spaces.is_empty(), duck_count())
	if kind.is_empty():
		return
	var item := {"kind": kind, "variant": flora_rng.randi_range(1, DecorationRules.VARIANTS[kind])}
	if kind == "ducks":
		for existing in decorations.values():
			if existing.kind == "ducks":
				item.variant = 3 - existing.variant
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

func can_edit(cell: Vector2i, tool: String, occupied: Vector2i, ground_height: float = -1, tree_placement_offset: Vector2 = Vector2.ZERO, occupied_position: Vector2 = Vector2.INF, house_placement_offset: Vector2 = Vector2.ZERO) -> bool:
	if not unlocked or not in_bounds(cell):
		return false
	if log_piles.has(cell):
		return false
	if tool == "remove" and cells.get(cell) == "stairs" and log_piles.has(cell + stair_direction(cell)):
		return false
	if tool == "house":
		if level < 5:
			return false
		if houses.has(cell):
			return house_space_free(cell, occupied, (int(houses[cell]) + 1) % 4, occupied_position)
		return (stock.house > 0 or resources.wood >= HOUSE_LOG_COST) and stock.meadow >= house_foundation_cost(cell, house_placement_offset) and house_space_free(cell, occupied, 1 if house_bundle > 0 else 0, occupied_position, house_placement_offset)
	if tool == "chicken":
		return level >= 2 and stock.chicken > 0 and asset_ground_free(cell) and cell != occupied
	if tool == "sheep":
		return level >= 5 and stock.sheep > 0 and asset_ground_free(cell) and cell != occupied
	if house_owner(cell) != Vector2i(999, 999):
		return tool == "remove" and occupied not in house_cells(house_owner(cell)) and house_refund_cell(house_owner(cell), occupied) != Vector2i(999, 999)
	if (chicken_at(cell) >= 0):
		return tool == "remove" and cell != occupied
	if sheep_at(cell) >= 0:
		return tool == "remove" and cell != occupied
	if tool == "bridge":
		var start := BridgeRules.candidate(self, cell)
		return bridges_enabled and level >= 3 and stock.bridge > 0 and BridgeRules.valid(self, start) and occupied not in [start, start + Vector2i.RIGHT]
	if tool == "remove" and bridges.has(BridgeRules.owner(self, cell)):
		var start := BridgeRules.owner(self, cell)
		return occupied not in [start, start + Vector2i.RIGHT]
	if BridgeRules.touches(self, cell):
		return false
	if (tool in ["remove", "tree"] and tree_stumps.has(cell)) or (tool == "tree" and tree_cut_remaining.has(cell)):
		return false
	if tool == "remove":
		if not cells.has(cell) or cell == occupied:
			return false
		if cells[cell] == "stairs":
			var landing := cell + stair_direction(cell)
			if BridgeRules.touches(self, landing):
				return false
			if landing == occupied or trees.has(landing) or house_owner(landing) != Vector2i(999, 999) or (chicken_at(landing) >= 0) or sheep_at(landing) >= 0:
				return false
			# This landing may also be the foot of another stair bundle.
			# Collecting it must not leave that ramp connected to water.
			for other in stair_directions:
				if other != cell and landing == other - stair_direction(other):
					return false
		if not trees.has(cell) and house_owner(cell) == Vector2i(999, 999) and cells[cell] != "stairs":
			for step in [Vector2i.LEFT, Vector2i.RIGHT]:
				if cells.get(cell + step) == "stairs":
					return false
		return true
	if tool == "tree":
		if trees.has(cell):
			return true
		return valid_tree_offset(tree_placement_offset) and stock[tool] > 0 and cells.has(cell) and not trees.has(cell) and house_owner(cell) == Vector2i(999, 999) and cells[cell] != "stairs" and cell != HOME and cell != occupied
	if tool == "ground":
		if ground_height >= 0:
			var target := ground_target(cell, ground_height)
			if BridgeRules.touches(self, target) or log_piles.has(target) or house_owner(target) != Vector2i(999, 999) or (chicken_at(target) >= 0) or sheep_at(target) >= 0:
				return false
			var allowed: bool = ground_height in ground_options(cell) or (target != cell and cell != occupied and target != occupied)
			return allowed and (cells.has(cell) or ground_count() > 0)
		return can_raise_ground(cell) if cells.has(cell) else ground_count() > 0
	if tool == "stairs":
		if cells.get(cell) == "stairs":
			return can_reverse_stair(cell, occupied)
		var direction := available_stair_direction(cell)
		return stock.stairs > 0 and direction != Vector2i.ZERO and cell != occupied and cell + direction != occupied and not BridgeRules.touches(self, cell + direction) and not log_piles.has(cell + direction)
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
		for index in chickens.size():
			if cell_at(chickens[index]) == flat:
				chickens[index] += Vector2(0, SIZE)
		for index in sheep.size():
			if cell_at(sheep[index]) == flat:
				sheep[index] += Vector2(0, SIZE)
		for records in [trees, tree_types, tree_stumps, tree_cut_remaining, log_piles, houses, house_offsets, flora, decorations]:
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
		if cells.has(cell) and height <= height_at(cell) and not (height == 0 and height_at(cell) > 0):
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
		if log_piles.has(cell) or log_piles.has(target):
			return cell
		if trees.has(cell) and trees.has(target):
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
	for height in options:
		if height > height_at(cell):
			return height
	if ground_continuation_target(cell) != cell:
		return height_at(cell) + SIZE
	return 0.0 if 0.0 in options else -1.0

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

# Reverse within the existing ramp and landing, leaving surrounding ground alone.
func can_reverse_stair(cell: Vector2i, occupied: Vector2i) -> bool:
	var direction := stair_direction(cell)
	var landing := cell + direction
	var foot := landing + direction
	var height := height_at(cell)
	if direction == Vector2i.ZERO or occupied in [cell, landing]:
		return false
	if not cells.has(foot) or cells[foot] == "stairs" or height_at(foot) != height:
		return false
	for square in [cell, landing]:
		if not cells.has(square) or trees.has(square) or tree_stumps.has(square) or log_piles.has(square) or house_owner(square) != Vector2i(999, 999) or chicken_at(square) >= 0 or sheep_at(square) >= 0 or BridgeRules.touches(self, square):
			return false
		if height > height_at(square + Vector2i.DOWN):
			return false
		for other in stair_directions:
			if other != cell and square in [other - stair_direction(other), other + stair_direction(other)]:
				return false
	return true

# Shared by the committed edit and its rendering preview.
func reverse_stair(cell: Vector2i) -> void:
	var direction := stair_direction(cell)
	var landing := cell + direction
	var height := height_at(cell)
	decorations.erase(landing)
	cells[cell] = kind_at_height(height + SIZE)
	elevations[cell] = height + SIZE
	cells[landing] = "stairs"
	elevations[landing] = height
	stair_directions.erase(cell)
	stair_directions[landing] = -direction
	if flora.has(landing):
		flora[cell] = flora[landing]
		flora.erase(landing)

func available_stair_direction(cell: Vector2i) -> Vector2i:
	if cells.get(cell) == "stairs" or trees.has(cell) or house_owner(cell) != Vector2i(999, 999) or (chicken_at(cell) >= 0) or sheep_at(cell) >= 0:
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
		if not in_bounds(landing) or cells.get(landing) == "stairs" or trees.has(landing) or house_owner(landing) != Vector2i(999, 999) or (chicken_at(landing) >= 0) or sheep_at(landing) >= 0:
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

func walkable_point(point: Vector2, moving_sheep: bool = false) -> bool:
	var ground_offsets := [Vector2.ZERO] if moving_sheep else [Vector2(-7, -7), Vector2(7, -7), Vector2(-7, 7), Vector2(7, 7)]
	for offset in ground_offsets:
		if not cells.has(cell_at(point + offset)):
			return false
	for cell in trees:
		if tree_blocks_point(tree_position(cell), point, tree_types.get(cell, "tree")):
			return false
	for cell in houses:
		if house_blocks_contact(cell, point, point, moving_sheep):
			return false
	for cell in log_piles:
		if log_blocks_contact(cell, point, point) if moving_sheep else log_blocks_feet(cell, point, point):
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

# Apply the real edit to an isolated copy so terrain previews include every
# moved decoration, merged footprint, normalized terrace and stair join.
func terrain_edit_preview(cell: Vector2i, tool: String, ground_height: float = -1):
	var proposed = get_script().new()
	for field in ["cells", "elevations", "stair_directions", "flora", "decorations", "trees", "tree_types", "tree_stumps", "tree_cut_remaining", "log_piles", "houses", "house_offsets", "bridges", "stock", "resources", "house_build"]:
		proposed.set(field, get(field).duplicate(true))
	proposed.chickens = chickens.duplicate()
	proposed.sheep = sheep.duplicate()
	proposed.level = level
	proposed.bridges_enabled = bridges_enabled
	proposed.manual_ground_elevation = manual_ground_elevation
	proposed.free_house_grass = free_house_grass
	proposed.flora_rng.state = flora_rng.state
	return proposed if proposed.edit(cell, tool, Vector2i(999, 999), ground_height) else null

func edit(cell: Vector2i, tool: String, occupied: Vector2i, ground_height: float = -1, tree_placement_offset: Vector2 = Vector2.ZERO, log_source := Vector2i(999, 999), occupied_position: Vector2 = Vector2.INF, house_placement_offset: Vector2 = Vector2.ZERO) -> bool:
	if not can_edit(cell, tool, occupied, ground_height, tree_placement_offset, occupied_position, house_placement_offset):
		return false
	if tool == "remove" and house_owner(cell) != Vector2i(999, 999):
		cell = house_owner(cell)
	if tool == "house":
		if houses.has(cell):
			clear_house_occupants(cell, (int(houses[cell]) + 1) % 4, house_offsets.get(cell, Vector2.ZERO), center(occupied) if occupied_position == Vector2.INF else occupied_position)
			houses[cell] = (int(houses[cell]) + 1) % 4
		else:
			var placing_facing := 1 if house_bundle > 0 else 0
			if stock.house > 0 and house_bundle == 0:
				stock.house -= 1
			else:
				spend_wood(HOUSE_LOG_COST, log_source)
			for square in house_cells(cell, house_placement_offset):
				if not cells.has(square):
					cells[square] = "meadow"
					elevations[square] = height_at(cell)
					stock.meadow -= 1
			clear_house_occupants(cell, placing_facing, house_placement_offset, center(occupied) if occupied_position == Vector2.INF else occupied_position)
			houses[cell] = placing_facing
			house_offsets[cell] = house_placement_offset
			prune_decorations()
		return true
	if tool == "chicken":
		clear_generated_scenery(cell)
		chickens.append(center(cell))
		stock.chicken -= 1
		return true
	if tool == "remove" and (chicken_at(cell) >= 0):
		chickens.remove_at(chicken_at(cell))
		stock.chicken += 1
		return true
	if tool == "sheep":
		clear_generated_scenery(cell)
		sheep.append(center(cell))
		stock.sheep -= 1
		return true
	if tool == "remove" and houses.has(cell):
		var refund := house_refund_cell(cell, occupied)
		houses.erase(cell)
		house_offsets.erase(cell)
		clear_generated_scenery(refund)
		log_piles[refund] = HOUSE_LOG_COST
		resources.wood += HOUSE_LOG_COST
		return true
	if tool == "remove" and sheep_at(cell) >= 0:
		sheep.remove_at(sheep_at(cell))
		stock.sheep += 1
		return true
	if tool == "bridge":
		var start := BridgeRules.candidate(self, cell)
		bridges[start] = height_at(start + Vector2i.LEFT)
		stock.bridge -= 1
		return true
	if tool == "remove" and bridges.has(BridgeRules.owner(self, cell)):
		bridges.erase(BridgeRules.owner(self, cell))
		stock.bridge += 1
		return true
	if tool == "remove":
		if trees.has(cell):
			stock.tree += 1
			tree_types.erase(cell)
			tree_cut_remaining.erase(cell)
			trees.erase(cell)
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
		if trees.has(cell):
			var current := TREE_VARIANTS.find(tree_types.get(cell, "tree"))
			tree_types[cell] = TREE_VARIANTS[(current + 1) % TREE_VARIANTS.size()]
		else:
			clear_generated_scenery(cell)
			trees[cell] = tree_placement_offset
			tree_types[cell] = next_tree_variant
			var placed_variant := TREE_VARIANTS.find(next_tree_variant)
			var variant_step := flora_rng.randi_range(1, TREE_VARIANTS.size() - 1)
			next_tree_variant = TREE_VARIANTS[(placed_variant + variant_step) % TREE_VARIANTS.size()]
			stock[tool] -= 1
	elif tool == "stairs" and cells.get(cell) == "stairs":
		reverse_stair(cell)
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
				for records in [trees, tree_types, tree_stumps, tree_cut_remaining, log_piles, houses, house_offsets, flora, decorations]:
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
			clear_generated_scenery(cell)
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
	if not bridges_enabled and not bridges.is_empty():
		# Inactive placements must not restrict normal terrain edits. Reclaim
		# only those whose supports were changed while the experiment is off.
		var proposed = get_script().new()
		proposed.cells = cells
		proposed.elevations = elevations
		proposed.trees = trees
		for start in bridges.keys():
			if not BridgeRules.valid(proposed, start) or bridges[start] != height_at(start + Vector2i.LEFT):
				bridges.erase(start)
				stock.bridge += 1
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
		var neighbors: Array[Vector2i] = []
		for step in NAV_STEPS:
			var neighbor: Vector2i = cell + step
			if can_cross(cell, neighbor):
				neighbors.append(neighbor)
		for start in (bridges if bridges_enabled else {}):
			var banks := BridgeRules.ends(start)
			if cell in banks:
				neighbors.append(banks[1] if cell == banks[0] else banks[0])
		for neighbor in neighbors:
			if not previous.has(neighbor):
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
		saved_trees.append([cell.x, cell.y, offset.x, offset.y, tree_types.get(cell, "tree")])
	var saved_bridges: Array = []
	for start in bridges:
		saved_bridges.append([start.x, start.y, bridges[start]])
	var saved := {"version": 28, "free_house_grass": free_house_grass, "next_tree_variant": next_tree_variant, "bridges": saved_bridges, "tree_offsets": saved_trees, "tiles": tiles, "stock": stock.duplicate(), "level": level, "decorations": saved_decorations}
	saved.houses = []
	for cell in houses:
		var offset: Vector2 = house_offsets.get(cell, Vector2.ZERO)
		saved.houses.append([cell.x, cell.y, houses[cell], offset.x, offset.y])
	saved.chickens = []
	for point in chickens:
		saved.chickens.append([point.x, point.y])
	saved.sheep = []
	for point in sheep:
		saved.sheep.append([point.x, point.y])
	saved.house_build = house_build.duplicate(true)
	saved.house_bundle = house_bundle
	saved.carried_wood = carried_wood
	saved.log_piles = []
	for cell in log_piles:
		saved.log_piles.append([cell.x, cell.y, log_piles[cell]])
	saved.resources = resources.duplicate()
	saved.tree_stumps = []
	saved.tree_cut_remaining = []
	for cell in tree_stumps:
		saved.tree_stumps.append([cell.x, cell.y, tree_stumps[cell]])
	for cell in tree_cut_remaining:
		saved.tree_cut_remaining.append([cell.x, cell.y, tree_cut_remaining[cell]])
	if manual_ground_elevation:
		saved.manual_ground_elevation = true
	if not playground_grants.is_empty():
		saved.playground_grants = playground_grants.duplicate()
	return saved

func restore(data: Dictionary) -> bool:
	if int(data.get("version", 0)) not in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28] or not data.get("tiles") is Array or not data.get("stock") is Dictionary:
		return false
	var next_grants: Dictionary = {}
	if int(data.version) >= 24:
		if not data.get("playground_grants", {}) is Dictionary:
			return false
		for kind in data.get("playground_grants", {}):
			var amount = data.playground_grants[kind]
			if kind not in ["ground", "tree", "sheep", "chicken"] or not (amount is int or amount is float) or not is_finite(float(amount)) or amount < 0 or amount > 100000 or float(amount) != floorf(float(amount)):
				return false
			next_grants[kind] = int(amount)
	if not data.get("manual_ground_elevation", false) is bool:
		return false
	var saved_tree_variant: String = str(data.get("next_tree_variant", next_tree_variant))
	if saved_tree_variant not in TREE_VARIANTS:
		return false
	var next_level := int(data.get("level", 0)) if int(data.version) >= 6 else (3 if data.get("unlocked", false) else 1)
	if next_level < 1 or next_level > XP_THRESHOLDS.size():
		return false
	var next_cells := {}
	var next_trees := {}
	var next_tree_types := {}
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
			if not record is Array or record.size() != (5 if int(data.version) >= 14 else 4):
				return false
			for number in record.slice(0, 4):
				if not (number is int or number is float) or not is_finite(float(number)):
					return false
			var cell := Vector2i(int(record[0]), int(record[1]))
			var offset := Vector2(float(record[2]), float(record[3]))
			if int(data.version) < 12:
				# Validate the old range before moving high roots onto their tile.
				if absf(offset.x) > TREE_LEGACY_OFFSET_LIMIT or absf(offset.y) > TREE_LEGACY_OFFSET_LIMIT:
					return false
				offset.y = maxf(offset.y, TREE_OFFSET_Y_MIN)
			if int(data.version) < 13:
				# Retain valid old layouts, moving only overflowing trunks inward.
				if absf(offset.x) > TREE_LEGACY_OFFSET_LIMIT:
					return false
				offset.x = clampf(offset.x, TREE_OFFSET_X_MIN, TREE_OFFSET_X_MAX)
			if record[0] != cell.x or record[1] != cell.y or not next_trees.has(cell) or seen.has(cell) or not valid_tree_offset(offset) or next_cells[cell] == "stairs":
				return false
			next_trees[cell] = offset
			var kind: String = str(record[4]) if int(data.version) >= 14 else "tree"
			if kind not in TREE_VARIANTS:
				return false
			next_tree_types[cell] = kind
			seen[cell] = true
		if seen.size() != next_trees.size():
			return false
	var safe_spawn := false
	for cell in next_cells:
		if not next_trees.has(cell) and next_cells[cell] != "stairs":
			safe_spawn = true
	if not safe_spawn:
		return false
	for kind in KINDS + ["tree", "bridge", "sheep", "chicken", "house"]:
		var amount := int(data.stock.get(kind, (1 if next_level >= 3 else 0) if kind == "bridge" and int(data.version) < 11 else (0 if (kind in ["sheep", "house"] and int(data.version) < 18) or (kind == "stairs" and data.get("version") == 1) else -1)))
		if kind == "chicken" and int(data.version) < 20:
			amount = 1 if next_level >= 7 else 0
		var extra: int = int(next_grants.get("ground" if kind in KINDS else kind, 0))
		if amount < 0 or amount > maxi(13, 18 + (next_level - 4) * 3) + extra:
			return false
		next_stock[kind] = amount
		if kind == "sheep" and int(data.version) < 18 and next_level >= 5:
			next_stock[kind] = 1
	if int(data.version) == 14:
		var old_tree_stock := int(data.stock.get("tree2", 0))
		if old_tree_stock < 0 or old_tree_stock > 1:
			return false
		next_stock.tree += old_tree_stock
	var next_decorations := {}
	var water_claims := {}
	var duck_directions := {}
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
				if duck_directions.has(variant):
					return false
				duck_directions[variant] = true
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
	var expected_total: int = ({1: 5, 2: 10, 3: 15}[next_level] if next_level < 4 else 18 + (next_level - 4) * 3) if int(data.version) >= 6 else ((15 if int(data.version) >= 5 else (10 if int(data.version) == 1 else 13)) if next_level >= 3 else 5)
	var bonus = data.get("free_house_grass", 0) if int(data.version) >= 19 else 0
	if not (bonus is int or bonus is float) or not is_finite(float(bonus)) or bonus < 0 or float(bonus) != floorf(float(bonus)):
		return false
	if total != expected_total + int(bonus) + int(next_grants.get("ground", 0)):
		return false
	var tree_rewards := (0 if next_level < 3 else (1 if next_level == 3 else 2)) + (1 if int(data.version) >= 28 and next_level >= 6 else 0)
	if next_trees.size() + next_stock.tree != tree_rewards + int(next_grants.get("tree", 0)):
		return false
	# Grant the new level-six tree once to existing islands.
	if int(data.version) < 28 and next_level >= 6:
		next_stock.tree += 1
	var next_bridges := {}
	if int(data.version) >= 11:
		if not data.get("bridges") is Array:
			return false
		var proposed = get_script().new()
		proposed.cells = next_cells
		proposed.elevations = next_elevations
		proposed.trees = next_trees
		proposed.bridges = next_bridges
		for record in data.bridges:
			if not record is Array or record.size() != 3:
				return false
			for number in record:
				if not (number is int or number is float) or not is_finite(float(number)) or float(number) != int(number):
					return false
			var start := Vector2i(int(record[0]), int(record[1]))
			if not BridgeRules.valid(proposed, start) or record[2] != proposed.height_at(start + Vector2i.LEFT):
				return false
			next_bridges[start] = float(record[2])
	if next_bridges.size() + next_stock.bridge != (1 if next_level >= 3 else 0):
		return false
	if data.get("version") == 1 and data.get("unlocked", false):
		next_stock.meadow += 1
		next_stock.stairs += 2
	var next_resources := {"wood": 0}
	var next_stumps := {}
	var next_cut_remaining := {}
	if int(data.version) >= 16:
		if not data.get("resources") is Dictionary:
			return false
		var wood = data.resources.get("wood", -1)
		if not (wood is int or wood is float) or not is_finite(float(wood)) or wood < 0 or float(wood) != floorf(float(wood)):
			return false
		next_resources.wood = int(wood)
		for field in ["tree_stumps", "tree_cut_remaining"]:
			if not data.get(field) is Array:
				return false
			var records: Dictionary = next_stumps if field == "tree_stumps" else next_cut_remaining
			for record in data[field]:
				if not record is Array or record.size() != 3:
					return false
				for number in record:
					if not (number is int or number is float) or not is_finite(float(number)):
						return false
				var cell := Vector2i(int(record[0]), int(record[1]))
				if record[0] != cell.x or record[1] != cell.y or not next_trees.has(cell) or records.has(cell) or float(record[2]) <= 0 or next_level < 4:
					return false
				if field == "tree_cut_remaining" and (next_stumps.has(cell) or float(record[2]) > (300.0 if next_tree_types.get(cell, "tree") == "tree4" else 600.0)):
					return false
				records[cell] = minf(float(record[2]), 10.0) if field == "tree_cut_remaining" else float(record[2])
	var next_bundle = data.get("house_bundle", 0) if int(data.version) >= 21 else 0
	if not (next_bundle is int or next_bundle is float) or not is_finite(float(next_bundle)) or float(next_bundle) != floorf(float(next_bundle)) or int(next_bundle) not in [0, HOUSE_LOG_COST] or (next_bundle > 0 and next_level < 5):
		return false
	var next_carried := 0
	var next_logs := {}
	if int(data.version) >= 17:
		var carried = data.get("carried_wood", -1)
		# Earlier saves allowed larger packs. Retain those logs across migration
		# and subsequent saves; physical_wood below validates the resource total.
		# The harvesting rules enforce capacity for newly collected logs.
		if not (carried is int or carried is float) or not is_finite(float(carried)) or float(carried) != floorf(float(carried)) or carried < 0 or not data.get("log_piles") is Array:
			return false
		next_carried = int(carried)
		var physical_wood: int = next_carried + next_bundle
		for record in data.log_piles:
			if not record is Array or record.size() != 3:
				return false
			for number in record:
				if not (number is int or number is float) or not is_finite(float(number)) or float(number) != floorf(float(number)):
					return false
			var cell := Vector2i(int(record[0]), int(record[1]))
			if not next_cells.has(cell) or next_cells[cell] == "stairs" or next_trees.has(cell) or next_flora.has(cell) or next_decorations.has(cell) or next_logs.has(cell) or record[2] < 1 or record[2] > 6:
				return false
			next_logs[cell] = int(record[2])
			physical_wood += int(record[2])
		if physical_wood > next_resources.wood:
			return false
	var next_houses := {}
	var next_house_offsets := {}
	var next_sheep: Array[Vector2] = []
	if int(data.version) >= 18:
		if not data.get("houses") is Array or not data.get("sheep") is Array:
			return false
		for record in data.houses:
			if not record is Array or record.size() != (5 if int(data.version) >= 23 else 3):
				return false
			for index in record.size():
				var value = record[index]
				if not (value is int or value is float) or not is_finite(float(value)) or (index < 3 and float(value) != int(value)):
					return false
			var cell := Vector2i(int(record[0]), int(record[1]))
			var offset := Vector2(record[3], record[4]) if int(data.version) >= 23 else Vector2.ZERO
			if absf(offset.x) > 32 or absf(offset.y) > 32:
				return false
			# Older saves used a fixed foundation and clamped their offsets.
			if int(data.version) < 27:
				offset = legacy_house_placement_offset(offset)
			next_house_offsets[cell] = offset
			if next_level < 5 or not next_cells.has(cell) or next_cells[cell] == "stairs" or next_houses.has(cell) or int(record[2]) not in [0, 1, 2, 3]:
				return false
			if int(data.version) >= 19:
				for square in house_cells(cell, offset):
					if not in_bounds(square) or not next_cells.has(square) or next_cells[square] == "stairs" or next_elevations[square] != next_elevations[cell]:
						return false
					for owner in next_houses:
						if not Geometry2D.intersect_polygons(house_footprint(cell, int(record[2]), offset), house_footprint(owner, int(next_houses[owner]), next_house_offsets[owner])).is_empty():
							return false
			var contacts = get_script().new()
			contacts.cells = next_cells
			contacts.elevations = next_elevations
			contacts.trees = next_trees
			contacts.tree_types = next_tree_types
			contacts.log_piles = next_logs
			var patch := house_footprint(cell, int(record[2]), offset)
			for square in next_flora:
				if Geometry2D.is_point_in_polygon(center(square) + Vector2(0, 12), patch):
					return false
			for square in next_decorations:
				var item: Dictionary = next_decorations[square]
				if item.kind not in DecorationRules.WATER_KINDS and Geometry2D.is_point_in_polygon(center(square) + (Vector2(0, 12) if item.kind == "land_rock" else Vector2.ZERO), patch):
					return false
			for tree in next_trees:
				if not Geometry2D.intersect_polygons(patch, contacts.tree_footprint(contacts.tree_position(tree), next_tree_types.get(tree, "tree"))).is_empty():
					return false
			for pile in next_logs:
				if not Geometry2D.intersect_polygons(patch, contacts.log_footprint(pile)).is_empty():
					return false
			next_houses[cell] = int(record[2])
		for record in data.sheep:
			if not record is Array or record.size() != 2:
				return false
			for value in record:
				if not (value is int or value is float) or not is_finite(float(value)):
					return false
			var point := Vector2(float(record[0]), float(record[1]))
			var cell := cell_at(point)
			if next_level < 5 or not next_cells.has(cell):
				return false
			for owner in next_houses:
				if Geometry2D.is_point_in_polygon(point, house_footprint(owner, int(next_houses[owner]), next_house_offsets[owner])):
					return false
			var contact_layout = get_script().new()
			contact_layout.log_piles = next_logs
			for log_cell in next_logs:
				if contact_layout.log_blocks_contact(log_cell, point, point):
					return false
			for tree_cell in next_trees:
				if tree_blocks_point(center(tree_cell) + next_trees[tree_cell], point, next_tree_types.get(tree_cell, "tree")):
					return false
			next_sheep.append(point)
		var sheep_rewards := (1 if next_level >= 5 else 0) + (1 if int(data.version) >= 26 and next_level >= 8 else 0)
		if next_sheep.size() + next_stock.sheep != sheep_rewards + int(next_grants.get("sheep", 0)) or (next_level < 5 and next_stock.house > 0):
			return false
	# Grant the new level-eight reward once when upgrading older saves.
	if int(data.version) < 26 and next_level >= 8:
		next_stock.sheep += 1
	var next_chickens: Array[Vector2] = []
	if int(data.version) >= 20:
		if not data.get("chickens") is Array:
			return false
		for record in data.chickens:
			if not record is Array or record.size() != 2:
				return false
			for value in record:
				if not (value is int or value is float) or not is_finite(float(value)):
					return false
				if int(data.version) < 22 and float(value) != int(value):
					return false
			# Versions 20–21 used tile coordinates; version 22 saves the
			# continuous ground-plane position, including stairs and detours.
			var point := Vector2(float(record[0]), float(record[1]))
			if int(data.version) < 22:
				point = center(Vector2i(int(record[0]), int(record[1])))
			var cell := cell_at(point)
			# Two earned chickens can share a saved position. Movement separates
			# them on resume; inventory conservation below still rejects extras.
			if next_level < (7 if int(data.version) < 25 else 2) or not next_cells.has(cell):
				return false
			for owner in next_houses:
				if Geometry2D.is_point_in_polygon(point, house_footprint(owner, int(next_houses[owner]), next_house_offsets[owner])):
					return false
			var contact_layout = get_script().new()
			contact_layout.log_piles = next_logs
			for log_cell in next_logs:
				if contact_layout.log_blocks_contact(log_cell, point, point):
					return false
			for tree_cell in next_trees:
				if tree_blocks_point(center(tree_cell) + next_trees[tree_cell], point, next_tree_types.get(tree_cell, "tree")):
					return false
			next_chickens.append(point)
	var chicken_rewards := (1 if next_level >= 7 else 0) + (1 if int(data.version) >= 25 and next_level >= 2 else 0)
	if next_chickens.size() + next_stock.chicken != chicken_rewards + int(next_grants.get("chicken", 0)):
		return false
	# Older islands have not received the new level-two reward.
	if int(data.version) < 25 and next_level >= 2:
		next_stock.chicken += 1
	var next_build = data.get("house_build", {}) if int(data.version) >= 21 else {}
	if not next_build is Dictionary:
		return false
	if not next_build.is_empty():
		if next_build.keys().size() != 5:
			return false
		for key in ["x", "y", "started_at", "pawn_x", "pawn_y"]:
			var value = next_build.get(key)
			if not (value is int or value is float) or not is_finite(float(value)):
				return false
		var owner := Vector2i(int(next_build.x), int(next_build.y))
		if next_build.x != owner.x or next_build.y != owner.y or next_houses.get(owner, -1) != 1 or next_build.started_at <= 0 or next_bundle != 0:
			return false
	chickens = next_chickens
	playground_grants = next_grants
	house_build = next_build.duplicate(true)
	free_house_grass = int(bonus)
	houses = next_houses
	house_offsets = next_house_offsets
	sheep = next_sheep
	house_bundle = int(next_bundle)
	carried_wood = next_carried
	log_piles = next_logs
	resources = next_resources
	tree_stumps = next_stumps
	tree_cut_remaining = next_cut_remaining
	manual_ground_elevation = data.get("manual_ground_elevation", false)
	elevations = next_elevations
	bridges = next_bridges
	cells = next_cells
	trees = next_trees
	tree_types = next_tree_types
	next_tree_variant = saved_tree_variant
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

func can_pick_log(cell: Vector2i) -> bool:
	return carried_wood == 0 and int(log_piles.get(cell, 0)) > 0

func pick_log(cell: Vector2i) -> bool:
	if not can_pick_log(cell):
		return false
	log_piles[cell] -= 1
	if log_piles[cell] == 0:
		log_piles.erase(cell)
	carried_wood = 1
	return true

func clear_generated_scenery(cell: Vector2i) -> void:
	flora.erase(cell)
	decorations.erase(cell)

func can_drop_logs(cell: Vector2i) -> bool:
	return carried_wood > 0 and cells.has(cell) and cells[cell] != "stairs" and not trees.has(cell) and house_owner(cell) == Vector2i(999, 999) and not (chicken_at(cell) >= 0) and sheep_at(cell) < 0 and not flora.has(cell) and not decorations.has(cell) and not BridgeRules.touches(self, cell) and int(log_piles.get(cell, 0)) < 6

func drop_logs(cell: Vector2i) -> bool:
	if not can_drop_logs(cell):
		return false
	clear_generated_scenery(cell)
	var deposited := mini(carried_wood, 6 - int(log_piles.get(cell, 0)))
	log_piles[cell] = int(log_piles.get(cell, 0)) + deposited
	carried_wood -= deposited
	return true

func chicken_at(cell: Vector2i) -> int:
	for index in chickens.size():
		if cell_at(chickens[index]) == cell:
			return index
	return -1

func sheep_at(cell: Vector2i) -> int:
	for index in sheep.size():
		if cell_at(sheep[index]) == cell:
			return index
	return -1

func asset_ground_free(cell: Vector2i, moving_sheep: bool = false) -> bool:
	if not cells.has(cell):
		return false
	# Movement checks contact footprints and segment crossings, not occupied
	# tile ownership. Placement still reserves whole object/stair tiles.
	if moving_sheep:
		return true
	if cells[cell] == "stairs" or trees.has(cell) or house_owner(cell) != Vector2i(999, 999) or (chicken_at(cell) >= 0) or sheep_at(cell) >= 0 or log_piles.has(cell) or BridgeRules.touches(self, cell):
		return false
	# Keep stair connections clear.
	for stair in stair_directions:
		if cell in [stair - stair_direction(stair), stair + stair_direction(stair)]:
			return false
	return true

func house_refund_cell(owner: Vector2i, occupied: Vector2i) -> Vector2i:
	var nearest := Vector2i(999, 999)
	var distance := INF
	for candidate in cells:
		if candidate == occupied or cells[candidate] == "stairs" or trees.has(candidate) or log_piles.has(candidate) or chicken_at(candidate) >= 0 or sheep_at(candidate) >= 0 or BridgeRules.touches(self, candidate):
			continue
		var other_owner := house_owner(candidate)
		if other_owner != owner and other_owner != Vector2i(999, 999):
			continue
		var stair_landing := false
		for stair in stair_directions:
			if candidate in [stair - stair_direction(stair), stair + stair_direction(stair)]:
				stair_landing = true
		if stair_landing:
			continue
		var separation: float = Vector2(candidate - owner).length_squared()
		if separation < distance:
			distance = separation
			nearest = candidate
	return nearest

func house_foundation_cost(cell: Vector2i, offset: Vector2 = Vector2.INF) -> int:
	var missing := 0
	for square in house_cells(cell, offset):
		if not cells.has(square):
			missing += 1
	return missing

func house_cells(cell: Vector2i, offset: Vector2 = Vector2.INF) -> Array[Vector2i]:
	if offset == Vector2.INF:
		offset = house_offsets.get(cell, Vector2.ZERO)
	# Cover every facing at the exact pointer anchor. The ground stays tiled,
	# but its coverage grows when a freely positioned house crosses an edge.
	var minimum := Vector2.INF
	var maximum := -Vector2.INF
	for facing in 4:
		for point in house_footprint(cell, facing, offset):
			minimum = minimum.min(point)
			maximum = maximum.max(point)
	var first := cell_at(minimum + Vector2.ONE * 0.001)
	var last := cell_at(maximum - Vector2.ONE * 0.001)
	var foundation: Array[Vector2i] = []
	for y in range(first.y, last.y + 1):
		for x in range(first.x, last.x + 1):
			foundation.append(Vector2i(x, y))
	return foundation

func house_owner(cell: Vector2i) -> Vector2i:
	for owner in houses:
		if cell in house_cells(owner):
			return owner
	return Vector2i(999, 999)

# Source PNG coordinates traced from the three annotated ground-contact outlines.
# The fourth facing mirrors House2, exactly as the Sprite2D does.
const HOUSE_CONTACTS := [
	[Vector2(24, 68), Vector2(104, 68), Vector2(109, 176), Vector2(21, 176)],
	[Vector2(8, 148), Vector2(76, 116), Vector2(116, 147), Vector2(55, 176)],
	[Vector2(18, 124), Vector2(106, 124), Vector2(114, 176), Vector2(105, 180), Vector2(96, 174), Vector2(32, 174), Vector2(25, 180), Vector2(15, 177)],
]

func legacy_house_placement_offset(offset: Vector2) -> Vector2:
	# Keep every facing's ground contacts inside the same 2x2 foundation.
	# Roof overhang is visual only; rotation must not move the foundation.
	var minimum := Vector2(-SIZE / 2.0, -SIZE / 2.0)
	var maximum := Vector2(SIZE * 1.5, SIZE * 1.5)
	var lower := Vector2(-INF, -INF)
	var upper := Vector2(INF, INF)
	for facing in 4:
		for pixel in HOUSE_CONTACTS[1 if facing == 3 else facing]:
			var local: Vector2 = pixel - Vector2(64, 96)
			if facing == 3:
				local.x = -local.x
			local += Vector2(32, 0)
			lower = lower.max(minimum - local)
			upper = upper.min(maximum - local)
	return offset.clamp(lower, upper)

func house_footprint(cell: Vector2i, facing: int = -1, offset: Vector2 = Vector2.INF) -> PackedVector2Array:
	if facing < 0:
		facing = int(houses.get(cell, 0))
	if offset == Vector2.INF:
		offset = house_offsets.get(cell, Vector2.ZERO)
	var patch := PackedVector2Array()
	for pixel in HOUSE_CONTACTS[1 if facing == 3 else facing]:
		var local: Vector2 = pixel - Vector2(64, 96)
		if facing == 3:
			local.x = -local.x
		# Navigation uses the ground plane; rendering subtracts terrain elevation.
		patch.append(center(cell) + Vector2(32, 0) + local + offset)
	return patch

func house_blocks_contact(cell: Vector2i, start: Vector2, end: Vector2, moving_sheep: bool = false, facing: int = -1, offset: Vector2 = Vector2.INF) -> bool:
	var patch := house_footprint(cell, facing, offset)
	if moving_sheep:
		if Geometry2D.is_point_in_polygon(start, patch) or Geometry2D.is_point_in_polygon(end, patch):
			return true
		for i in patch.size():
			if Geometry2D.segment_intersects_segment(start, end, patch[i], patch[(i + 1) % patch.size()]) != null:
				return true
		return false
	var sweep := PackedVector2Array()
	for point in [start, end]:
		for sole_offset in [Vector2(-7, -7), Vector2(7, -7), Vector2(7, 7), Vector2(-7, 7)]:
			sweep.append(point + sole_offset)
	return not Geometry2D.intersect_polygons(patch, Geometry2D.convex_hull(sweep)).is_empty()

# Transient animation routes; durable positions are already safe for saves/undo.
var house_displacements: Array[Dictionary] = []

func house_escape_route(start: Vector2, patch: PackedVector2Array, pawn_point: Vector2) -> Array[Vector2]:
	var frontier: Array[Array] = [[start]]
	var visited := {cell_at(start): true}
	var cursor := 0
	while cursor < frontier.size():
		var route: Array = frontier[cursor]
		cursor += 1
		var point: Vector2 = route.back()
		if not Geometry2D.is_point_in_polygon(point, patch) and cells.get(cell_at(point)) != "stairs" and cell_at(point) != cell_at(pawn_point) and sheep_at(cell_at(point)) < 0 and chicken_at(cell_at(point)) < 0:
			var result: Array[Vector2] = []
			result.assign(route.slice(1))
			return result
		for step in STEPS:
			var next: Vector2i = cell_at(point) + step
			if visited.has(next) or not can_cross(cell_at(point), next):
				continue
			for offset in [Vector2.ZERO, Vector2(0, 20), Vector2(0, -20), Vector2(-20, 0), Vector2(20, 0)]:
				var target: Vector2 = center(next) + offset
				var clear := true
				for sample in range(1, 33):
					if not walkable_point(point.lerp(target, sample / 32.0), true):
						clear = false
						break
				if not clear:
					continue
				visited[next] = true
				var extended := route.duplicate()
				extended.append(target)
				frontier.append(extended)
				break
	return []

func clear_house_occupants(cell: Vector2i, facing: int, placement: Vector2, pawn_point: Vector2) -> void:
	house_displacements.clear()
	var previous_facing: int = houses.get(cell, -1)
	houses.erase(cell) # Allow occupants to leave the old footprint during rotation.
	var patch := house_footprint(cell, facing, placement)
	for kind in ["sheep", "chicken"]:
		var animals: Array[Vector2] = sheep if kind == "sheep" else chickens
		for index in range(animals.size() - 1, -1, -1):
			var start: Vector2 = animals[index]
			if not Geometry2D.is_point_in_polygon(start, patch):
				continue
			var route := house_escape_route(start, patch, pawn_point)
			if route.is_empty():
				animals.remove_at(index)
				stock[kind] += 1
				for displaced in house_displacements:
					if displaced.kind == kind:
						displaced.index -= 1
			else:
				animals[index] = route.back()
				house_displacements.append({"kind": kind, "index": index, "start": start, "route": route})
	if previous_facing >= 0:
		houses[cell] = previous_facing
	for square in flora.keys():
		if Geometry2D.is_point_in_polygon(center(square) + Vector2(0, 12), patch):
			flora.erase(square)
	for square in decorations.keys():
		if decorations[square].kind not in DecorationRules.WATER_KINDS and Geometry2D.is_point_in_polygon(center(square) + (Vector2(0, 12) if decorations[square].kind == "land_rock" else Vector2.ZERO), patch):
			decorations.erase(square)

func house_space_free(cell: Vector2i, occupied: Vector2i, facing: int = 0, occupied_position: Vector2 = Vector2.INF, offset: Vector2 = Vector2.INF) -> bool:
	var placement: Vector2 = house_offsets.get(cell, Vector2.ZERO) if offset == Vector2.INF else offset
	if not is_finite(placement.x) or not is_finite(placement.y) or absf(placement.x) > 32 or absf(placement.y) > 32:
		return false
	# Foundation tiles still supply and protect level ground, while objects use contacts.
	for square in house_cells(cell, placement):
		if not in_bounds(square) or cells.get(square) == "stairs" or BridgeRules.touches(self, square):
			return false
		if cells.has(square) and height_at(square) != height_at(cell):
			return false
		for stair in stair_directions:
			if square in [stair - stair_direction(stair), stair + stair_direction(stair)]:
				return false
	var patch := house_footprint(cell, facing, offset)
	var pawn_point := center(occupied) if occupied_position == Vector2.INF else occupied_position
	if house_blocks_contact(cell, pawn_point, pawn_point, false, facing, offset):
		return false
	for owner in houses:
		if owner != cell and not Geometry2D.intersect_polygons(patch, house_footprint(owner)).is_empty():
			return false
	for tree in trees:
		if not Geometry2D.intersect_polygons(patch, tree_footprint(tree_position(tree), tree_types.get(tree, "tree"))).is_empty():
			return false
	for pile in log_piles:
		if not Geometry2D.intersect_polygons(patch, log_footprint(pile)).is_empty():
			return false
	return true

func spend_wood(amount: int, preferred_pile := Vector2i(999, 999)) -> void:
	# Harvested wood is counted once in resources, including carried/deposited logs.
	resources.wood -= amount
	var reserved := mini(house_bundle, amount)
	house_bundle -= reserved
	amount -= reserved
	if amount == 0:
		return
	if log_piles.has(preferred_pile):
		var taken := mini(int(log_piles[preferred_pile]), amount)
		log_piles[preferred_pile] -= taken
		amount -= taken
		if log_piles[preferred_pile] == 0:
			log_piles.erase(preferred_pile)
	var from_pack := mini(carried_wood, amount)
	carried_wood -= from_pack
	amount -= from_pack
	for cell in log_piles.keys():
		var taken := mini(int(log_piles[cell]), amount)
		log_piles[cell] -= taken
		amount -= taken
		if log_piles[cell] == 0:
			log_piles.erase(cell)
		if amount == 0:
			break

func pick_house_bundle(cell: Vector2i) -> bool:
	if level < 5 or house_bundle != 0 or int(log_piles.get(cell, 0)) != HOUSE_LOG_COST:
		return false
	log_piles.erase(cell)
	house_bundle = HOUSE_LOG_COST
	return true
