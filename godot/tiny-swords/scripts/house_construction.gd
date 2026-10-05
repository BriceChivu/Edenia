extends Node

# The website showcase repeats the pack's three hammer poses at 10 fps.
# Its 24-frame showcase loop repeats throughout the 20-second build.
const NO_CELL := Vector2i(999, 999)
const BUILD_SECONDS := 20.0
const STRIKE_SCALE := Vector2(130.0 / 128.0, 0.98)
enum Phase { READY, PICKUP, PLACING, APPROACHING, HAMMERING }
var world
var phase := Phase.READY
var source := NO_CELL
var target := NO_CELL
var target_offset := Vector2.ZERO
var build_started_at := 0.0
var house_sprite: Sprite2D
var house_position := Vector2.ZERO
var house_offset := Vector2.ZERO

func _ready() -> void:
	world.pawn.sprite.frame_changed.connect(update_impact)
	world.pawn.sprite.animation_looped.connect(finish_swing)

func busy() -> bool:
	return phase in [Phase.PICKUP, Phase.APPROACHING, Phase.HAMMERING]

func pickup(cell: Vector2i) -> bool:
	if world.layout.house_bundle > 0:
		open_placement()
		return true
	var point: Vector2 = world.layout.center(cell)
	var route: Array[Vector2] = world.land_route(world.pawn.position, cell, point)
	if route.is_empty() or not route.back().is_equal_approx(point):
		return false
	world.walk_on_land(cell, point)
	source = cell
	phase = Phase.PICKUP
	return true

func open_placement() -> void:
	phase = Phase.PLACING
	world.selected = "house"
	world.editing = true
	world.ui.collapsed = false
	world.pawn.carrying_wood = true
	world.pawn.sprite.play("wood_idle")
	world.refresh()

func handle_click(cell: Vector2i, point: Vector2 = Vector2.INF) -> bool:
	if busy():
		return true
	if world.layout.house_bundle == 0:
		phase = Phase.READY
		return false
	if not world.editing or world.selected != "house":
		open_placement()
		return true
	if not world.layout.houses.has(cell):
		build(cell, point - world.layout.center(cell) + Vector2(0, world.layout.height_at(cell)) if point != Vector2.INF else Vector2.INF)
		return true
	return false

func placement_plan(cell: Vector2i, placement_offset: Vector2 = Vector2.ZERO) -> Dictionary:
	# Plan against the future foundation and house contacts, so the pawn
	# approaches the front-left door without walking through the building.
	var original = world.layout
	var planned = original.get_script().new()
	if not planned.restore(original.snapshot()):
		return {}
	if not planned.edit(cell, "house", original.cell_at(world.pawn.position), -1, Vector2.ZERO, NO_CELL, world.pawn.position, placement_offset):
		return {}
	planned.houses[cell] = 1
	var route: Array[Vector2] = []
	world.layout = planned
	for point in work_points(planned, cell, placement_offset):
		var candidate: Array[Vector2] = world.land_route(world.pawn.position, planned.cell_at(point), point)
		if not candidate.is_empty() and candidate.back().is_equal_approx(point):
			route = candidate
			break
	world.layout = original
	if route.is_empty():
		return {}
	return {"layout": planned, "route": route}

func on_house_floor(layout, cell: Vector2i, point: Vector2) -> bool:
	# Both soles must rest on level grass, never a neighboring cliff or ramp.
	for offset in [Vector2.ZERO, Vector2(-7, -7), Vector2(7, -7), Vector2(-7, 7), Vector2(7, 7)]:
		var square: Vector2i = layout.cell_at(point + offset)
		if not layout.cells.has(square) or layout.cells[square] == "stairs" or layout.height_at(square) != layout.height_at(cell):
			return false
	return true

func work_points(layout, cell: Vector2i, placement_offset: Vector2) -> Array[Vector2]:
	var points: Array[Vector2] = []
	for offset in [Vector2(-49, 68), Vector2(-24, 68), Vector2(-16, 68), Vector2(-8, 68)]:
		var point: Vector2 = layout.center(cell) + placement_offset + offset
		if on_house_floor(layout, cell, point) and layout.walkable_point(point):
			points.append(point)
	return points

func build(cell: Vector2i, placement_offset: Vector2 = Vector2.INF) -> bool:
	if placement_offset == Vector2.INF:
		placement_offset = world.terrain.placement_offset() if world.terrain.hover == cell else Vector2.ZERO
	placement_offset = world.layout.house_placement_offset(placement_offset)
	var plan := placement_plan(cell, placement_offset)
	if plan.is_empty():
		world.ui.panel.accessibility_description = "Choose a house site the pawn can reach."
		return false
	var original = world.layout
	var planned = plan.layout
	var route: Array[Vector2] = plan.route
	# Make the purchased foundation walkable while approaching; the actual house
	# and six-log cost are committed only on arrival.
	var before: Dictionary = original.snapshot()
	for square in planned.house_cells(cell):
		if not original.cells.has(square):
			original.cells[square] = planned.cells[square]
			original.elevations[square] = planned.elevations[square]
			original.stock.meadow -= 1
	world.history.append(before)
	world.preserve_history_on_reopen = true
	world.harvesting.cancel()
	world.waypoints = route
	world.pawn.walk_to(world.waypoints.pop_front())
	world.editing = false
	target = cell
	target_offset = placement_offset
	phase = Phase.APPROACHING
	world.rebuild_decorations()
	world.refresh()
	world.save_layout()
	return true

func _process(_delta: float) -> void:
	if phase == Phase.READY and not world.layout.house_build.is_empty():
		resume_build()
	if phase == Phase.HAMMERING:
		advance_build(Time.get_unix_time_from_system())
		return
	if not busy() or not world.waypoints.is_empty() or world.pawn.position.distance_to(world.pawn.destination) >= 0.2:
		return
	if phase == Phase.PICKUP:
		if world.layout.pick_house_bundle(source):
			# Remove the pile immediately, without a fade or dust effect.
			world.history.clear()
			world.rebuild_decorations()
			world.save_layout()
			open_placement()
		else:
			phase = Phase.READY
	elif phase == Phase.APPROACHING:
		if not on_house_floor(world.layout, target, world.pawn.position):
			open_placement()
			return
		if not world.layout.edit(target, "house", world.layout.cell_at(world.pawn.position), -1, Vector2.ZERO, NO_CELL, world.pawn.position, target_offset):
			open_placement()
			return
		world.layout.houses[target] = 1
		world.rebuild_decorations()
		world.animate_house_displacements()
		phase = Phase.HAMMERING
		build_started_at = Time.get_unix_time_from_system()
		world.layout.house_build = {"x": target.x, "y": target.y, "started_at": build_started_at, "pawn_x": world.pawn.position.x, "pawn_y": world.pawn.position.y}
		world.save_layout()
		world.pawn.carrying_wood = false
		world.pawn.hammering = true
		world.pawn.sprite.flip_h = false
		world.pawn.sprite.play("hammer_interact")
		world.pawn.sprite.set_frame_and_progress(0, 0.0)
		bind_house()
		house_sprite.modulate.a = 0.5

func bind_house() -> void:
	for node in world.asset_nodes:
		if node is Sprite2D and node.get_meta("house_cell", NO_CELL) == target:
			house_sprite = node
			house_position = node.position
			house_offset = node.offset
			return

func update_impact() -> void:
	if phase != Phase.HAMMERING:
		return
	if not is_instance_valid(house_sprite) or house_sprite.is_queued_for_deletion():
		bind_house()
	if not is_instance_valid(house_sprite):
		return
	var impact: bool = world.pawn.sprite.frame == 1
	house_sprite.scale = STRIKE_SCALE if impact else Vector2.ONE
	# Keep the bottom of the side-view PNG (y=178) anchored during squash.
	var pivot := house_offset + Vector2(0, 82)
	house_sprite.position = house_position + pivot - pivot * house_sprite.scale

func finish_swing() -> void:
	if phase == Phase.HAMMERING:
		advance_build(Time.get_unix_time_from_system())

func advance_build(now: float) -> void:
	if phase != Phase.HAMMERING:
		return
	if not is_instance_valid(house_sprite) or house_sprite.is_queued_for_deletion():
		bind_house()
	var progress := clampf((now - build_started_at) / BUILD_SECONDS, 0.0, 1.0)
	if is_instance_valid(house_sprite):
		house_sprite.modulate.a = lerpf(0.5, 1.0, progress)
	if progress < 1.0:
		return
	if is_instance_valid(house_sprite):
		house_sprite.scale = Vector2.ONE
		house_sprite.position = house_position
	world.pawn.hammering = false
	world.pawn.carrying_wood = world.layout.carried_wood > 0
	world.pawn.sprite.play("wood_idle" if world.pawn.carrying_wood else "idle")
	phase = Phase.READY
	world.layout.house_build.clear()
	world.save_layout()
	world.refresh()

func resume_build() -> void:
	var saved: Dictionary = world.layout.house_build
	if saved.is_empty():
		return
	target = Vector2i(saved.x, saved.y)
	build_started_at = saved.started_at
	var point := Vector2(saved.pawn_x, saved.pawn_y)
	if not on_house_floor(world.layout, target, point):
		# Older saves may have selected reachable grass below the house's cliff.
		var points := work_points(world.layout, target, world.layout.house_offsets.get(target, Vector2.ZERO))
		if points.is_empty():
			return
		point = points[0]
		saved.pawn_x = point.x
		saved.pawn_y = point.y
	world.pawn.position = point
	world.pawn.walk_to(world.pawn.position)
	world.pawn.hammering = true
	world.pawn.sprite.flip_h = false
	world.pawn.sprite.play("hammer_interact")
	phase = Phase.HAMMERING
	bind_house()
	advance_build(Time.get_unix_time_from_system())
