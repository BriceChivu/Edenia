extends RefCounted

const HOLD_SECONDS := 60.0
const SPACING := 32.0
var world
# A released bird stays on the ground until the pawn leaves its tile.
var released_cell := Vector2i(999, 999)
var released_height := 0.0

func contact_allowed(point: Vector2) -> bool:
	if released_cell != Vector2i(999, 999):
		if world.layout.cell_at(world.pawn.position) != released_cell or absf(world.ground_height(world.pawn.position) - released_height) > 1.0:
			released_cell = Vector2i(999, 999)
	return world.layout.chicken_release_at == 0.0 and (world.layout.cell_at(point) != released_cell or absf(world.ground_height(point) - released_height) > 1.0)

func pickup(index: int, now: float) -> bool:
	if not ProjectSettings.get_setting("gameplay/chicken_carry_enabled", false):
		return false
	if index < 0 or index >= world.layout.chickens.size() or not contact_allowed(world.layout.chickens[index]):
		return false
	if world.harvesting.phase != world.harvesting.Phase.READY:
		# Cutting pauses without spending or losing already harvested wood.
		world.harvesting.cancel()
	# Pending house approaches stop with their reserved logs intact. An already
	# started house retains its saved clock and resumes after carrying.
	if world.construction.phase != world.construction.Phase.HAMMERING:
		world.construction.phase = world.construction.Phase.READY
	world.layout.chickens.remove_at(index)
	world.layout.chicken_release_at = now + HOLD_SECONDS
	world.pawn.carrying_chicken = true
	world.history.clear()
	world.rebuild_decorations.call_deferred()
	world.save_layout()
	return true

func drop_target(excluded_cells: Array = []) -> Vector2:
	var layout = world.layout
	var origin: Vector2i = layout.cell_at(world.pawn.position)
	var candidates: Array[Vector2i] = []
	# Put it beside the pawn first; a one-tile island can use the same tile.
	for step in layout.STEPS:
		candidates.append(origin + step)
	candidates.append(origin)
	for cell in candidates:
		if cell in excluded_cells:
			continue
		if not layout.cells.has(cell) or layout.cells[cell] == "stairs":
			continue
		for offset in [Vector2.ZERO, Vector2(0, 24), Vector2(0, -24), Vector2(-24, 0), Vector2(24, 0)]:
			var point: Vector2 = layout.center(cell) + offset
			if not layout.walkable_point(point, true) or not world.clear_segment(world.pawn.position, point, true):
				continue
			var clear := true
			for other in layout.chickens + layout.sheep:
				if absf(world.ground_height(other) - world.ground_height(point)) <= 1.0 and point.distance_to(other) < SPACING:
					clear = false
			if clear:
				return point
	return Vector2.INF

func advance(now: float) -> void:
	world.pawn.carrying_chicken = world.layout.chicken_release_at > 0.0
	if not world.pawn.carrying_chicken:
		return
	# Disabled releases also recover birds already carried in saved islands.
	# Keep the normal safe-landing checks so a bird is never lost on a ramp/fall.
	if ProjectSettings.get_setting("gameplay/chicken_carry_enabled", false) and now < world.layout.chicken_release_at:
		return
	if world.water_phase == world.WaterPhase.READY:
		put_down()

func put_down(excluded_cells: Array = []) -> bool:
	if world.layout.chicken_release_at <= 0.0:
		return true
	# A fall carries the entire pose through sinking, waiting and respawn.
	if world.water_phase not in [world.WaterPhase.READY, world.WaterPhase.APPROACHING]:
		return false
	var point := drop_target(excluded_cells)
	if not point.is_finite():
		return false
	world.layout.chickens.append(point)
	world.layout.chicken_release_at = 0.0
	world.pawn.carrying_chicken = false
	released_cell = world.layout.cell_at(point)
	released_height = world.ground_height(point)
	world.history.clear()
	world.rebuild_decorations.call_deferred()
	world.save_layout()
	return true
