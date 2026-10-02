extends Node

## One pawn works on one tree. Cutting counts elapsed time while assigned, even
## when background frames are suspended; stump regrowth uses
## a saved wall-clock deadline and continues while the preview is closed.
const EQUIP_SECONDS := 0.35
const CutEffect = preload("res://scripts/tree_cut_effect.gd")
# Frame four meets the trunk 44 pixels from the pawn anchor.
const CUTTING_REACH := 44.0
const NO_TREE := Vector2i(999, 999)
enum Phase { READY, EQUIPPING, APPROACHING, CUTTING }
var world
var phase := Phase.READY
var target := NO_TREE
var route: Array[Vector2] = []
var equip_remaining := 0.0
var save_elapsed := 0.0
var cutting_updated_at := 0.0

static func duration(kind: String) -> float:
	return 15.0 if kind == "tree4" else 30.0

static func regrowth_duration(kind: String) -> float:
	return 300.0 if kind == "tree4" else 600.0

static func wood_yield(kind: String) -> int:
	return 1 if kind == "tree4" else 2

func available(cell: Vector2i) -> bool:
	return world.layout.carried_wood == 0 and world.layout.level >= 4 and world.layout.trees.has(cell) and not world.layout.tree_stumps.has(cell)

func start(cell: Vector2i) -> bool:
	if not available(cell) or world.water_phase != world.WaterPhase.READY:
		return false
	var anchor: Vector2 = world.layout.tree_position(cell)
	var best: Array[Vector2] = []
	var best_distance := INF
	# Prefer full axe reach. Narrow shores may only leave room closer to the
	# trunk; require a real, reachable endpoint rather than a point over water.
	for reach in [CUTTING_REACH, 40.0, 36.0, 32.0, 28.0, 24.0, 20.0]:
		for offset in [Vector2(-reach, 0), Vector2(reach, 0)]:
			var point: Vector2 = anchor + offset
			var origin: Vector2 = world.layout.center(cell) - Vector2(32, 32)
			point.y = clampf(point.y, origin.y + 12, origin.y + 56)
			var candidate: Array[Vector2] = world.land_route(world.pawn.position, world.layout.cell_at(point), point)
			if candidate.is_empty() or not candidate.back().is_equal_approx(point):
				continue
			var distance := 0.0
			var previous: Vector2 = world.pawn.position
			for step in candidate:
				distance += previous.distance_to(step)
				previous = step
			if distance < best_distance:
				best_distance = distance
				best = candidate
		if not best.is_empty():
			break
	if best.is_empty():
		return false
	cancel()
	world.movement_generation += 1
	world.waypoints.clear()
	world.pawn.walk_to(world.pawn.position)
	world.history.clear()
	target = cell
	route = best
	phase = Phase.EQUIPPING
	equip_remaining = EQUIP_SECONDS
	world.pawn.carrying_wood = false
	world.pawn.axe_equipped = true
	world.pawn.sprite.play("axe_idle")
	return true

func cancel() -> void:
	if phase == Phase.READY:
		return
	phase = Phase.READY
	target = NO_TREE
	route.clear()
	world.waypoints.clear()
	world.pawn.chopping = false
	world.pawn.axe_equipped = false
	world.pawn.walk_to(world.pawn.position)
	world.pawn.sprite.play("wood_idle" if world.layout.carried_wood > 0 else "idle")
	world.save_layout()

func _process(delta: float) -> void:
	advance(delta, Time.get_unix_time_from_system())

func advance(delta: float, now: float) -> void:
	var regrown := false
	for cell in world.layout.tree_stumps.keys():
		if now >= world.layout.tree_stumps[cell]:
			world.layout.tree_stumps.erase(cell)
			regrown = true
	if regrown:
		# Keep undo snapshots from restoring old resource/timer state.
		world.history.clear()
		world.rebuild_decorations()
		world.save_layout()
	if phase == Phase.READY:
		return
	if world.editing or not available(target) or world.water_phase != world.WaterPhase.READY:
		cancel()
		return
	if phase == Phase.EQUIPPING:
		equip_remaining -= delta
		if equip_remaining <= 0:
			phase = Phase.APPROACHING
			world.waypoints = route.duplicate()
			world.pawn.walk_to(world.waypoints.pop_front())
	elif phase == Phase.APPROACHING:
		if world.waypoints.is_empty() and world.pawn.position.distance_to(world.pawn.destination) < 0.2:
			phase = Phase.CUTTING
			cutting_updated_at = now
			world.pawn.chopping = true
			world.pawn.sprite.flip_h = world.layout.tree_position(target).x < world.pawn.position.x
			world.pawn.sprite.play("axe_interact")
			if not world.layout.tree_cut_remaining.has(target):
				world.layout.tree_cut_remaining[target] = duration(world.layout.tree_types.get(target, "tree"))
			world.save_layout()
	elif phase == Phase.CUTTING:
		# Browsers can suspend frames or clamp delta in a background tab.
		# Only an assigned cutting phase accrues this elapsed time.
		var clock_elapsed := maxf(0.0, now - cutting_updated_at)
		var elapsed := maxf(delta, clock_elapsed)
		cutting_updated_at = now
		var remaining: float = world.layout.tree_cut_remaining[target]
		world.layout.tree_cut_remaining[target] = maxf(0.0, remaining - elapsed)
		save_elapsed += elapsed
		if world.layout.tree_cut_remaining[target] <= 0:
			var kind: String = world.layout.tree_types.get(target, "tree")
			for tree in world.tree_nodes:
				if tree.get_meta("cell") == target:
					var effect := CutEffect.new()
					effect.setup(tree, world.layout.height_at(target))
					world.get_node("World").add_child(effect)
					break
			world.layout.resources.wood += wood_yield(kind)
			world.layout.carried_wood = wood_yield(kind)
			world.pawn.carrying_wood = true
			world.layout.tree_cut_remaining.erase(target)
			world.layout.tree_stumps[target] = now - maxf(0.0, clock_elapsed - remaining) + regrowth_duration(kind)
			world.history.clear()
			world.rebuild_decorations()
			cancel()
		elif save_elapsed >= 5.0:
			save_elapsed = 0.0
			world.save_layout()
