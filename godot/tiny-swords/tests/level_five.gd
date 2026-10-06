extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var layout = Layout.new()
	for level in [2, 3, 4]:
		layout.unlock(level)
	var grass: int = layout.ground_count()
	check(layout.unlock(5) and layout.ground_count() == grass + 3 and layout.stock.sheep == 1, "Level five grants three grass and one sheep")
	check(not layout.unlock(5) and layout.stock.sheep == 1, "Reward cannot repeat")
	check(Layout.level_for_xp(149) == 4 and Layout.level_for_xp(150) == 5, "Level five XP boundary")
	layout.flora.clear()
	layout.decorations.clear()
	var house_cell := Vector2i(1, 1)
	layout.resources.wood = 5
	check(not layout.edit(house_cell, "house", Layout.HOME), "House rejects five logs")
	layout.resources.wood = 6
	layout.carried_wood = 2
	layout.log_piles[Vector2i(0, 1)] = 4
	var before := layout.snapshot()
	check(layout.edit(house_cell, "house", Layout.HOME), "House builds with exactly six logs")
	check(layout.resources.wood == 0 and layout.carried_wood == 0 and layout.log_piles.values().reduce(func(a, b): return a + b, 0) == 0, "House consumes actual logs without double counting")
	for facing in [1, 2, 3, 0]:
		check(layout.edit(house_cell, "house", Layout.HOME) and layout.houses[house_cell] == facing and layout.resources.wood == 0, "Repeated click rotates for free")
	check(not layout.edit(house_cell, "ground", Layout.HOME), "House protects supporting grass")
	check(not layout.walkable_point(layout.center(house_cell)), "House footprint blocks walking")
	var copy = Layout.new()
	check(copy.restore(layout.snapshot()) and copy.snapshot() == layout.snapshot(), "House, resource spending and facing reload")
	check(layout.restore(before) and layout.resources.wood == 6 and layout.houses.is_empty(), "Undo restores spent logs")
	layout.log_piles.clear()
	layout.carried_wood = 0
	check(layout.edit(house_cell, "sheep", Layout.HOME) and layout.stock.sheep == 0, "Place one sheep")
	check(not layout.edit(Vector2i(1, 0), "sheep", Layout.HOME), "Cannot duplicate sheep")
	check(copy.restore(layout.snapshot()) and copy.sheep == layout.sheep, "Sheep persists")
	check(layout.edit(house_cell, "remove", Layout.HOME) and layout.stock.sheep == 1, "Pickup returns sheep")
	var water_house = Layout.new()
	for target in [2, 3, 4, 5]:
		water_house.unlock(target)
	water_house.resources.wood = 6
	var water_origin := Vector2i(8, 4)
	var water_before := water_house.snapshot()
	var foundation_stock: int = water_house.stock.meadow
	check(water_house.edit(water_origin, "house", Layout.HOME), "House builds directly on four water squares")
	check(water_house.free_house_grass == 4 and water_house.stock.meadow == foundation_stock and water_house.resources.wood == 0, "Water foundation adds four free grass tiles and spends six logs")
	for square in water_house.house_cells(water_origin):
		check(water_house.cells.get(square) == "meadow" and not water_house.can_edit(square, "ground", Layout.HOME), "Every foundation tile is grass and protected")
	check(copy.restore(water_house.snapshot()) and copy.snapshot() == water_house.snapshot(), "Water foundation survives reload")
	check(water_house.edit(water_origin, "remove", Layout.HOME), "Water house pickup returns logs")
	check(water_house.stock.meadow == foundation_stock and water_house.free_house_grass == 0 and not water_house.cells.has(water_origin), "Pickup removes free foundation without changing inventory")
	water_house.stock.meadow = 0
	check(water_house.edit(Vector2i(10, 4), "house", Layout.HOME) and water_house.stock.meadow == 0 and water_house.free_house_grass == 4, "Layout can add another free foundation with empty inventory")
	check(water_house.restore(water_before) and water_house.free_house_grass == 0 and not water_house.cells.has(water_origin), "Undo removes free foundation and restores logs")
	layout.resources.wood = 6
	layout.flora[Vector2i(2, 1)] = 1
	layout.decorations[Vector2i(1, 2)] = {"kind": "rocks", "variant": 1}
	check(layout.edit(house_cell, "house", Layout.HOME) and not layout.flora.has(Vector2i(2, 1)) and not layout.decorations.has(Vector2i(1, 2)), "Construction clears bushes and rocks across footprint")
	check(layout.restore(before), "Restore before footprint blocking checks")
	layout.trees[Vector2i(2, 1)] = Vector2.ZERO
	check(not layout.can_edit(house_cell, "house", Layout.HOME), "Tree on any footprint square prevents construction")
	layout.trees.erase(Vector2i(2, 1))
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.selected = "sheep"
	check(scene.apply_edit(Vector2i(1, 0)), "Runtime sheep placement")
	scene.toggle_editing()
	scene.pawn.position = scene.layout.center(Vector2i(1, 0))
	scene.pawn.walk_to(scene.pawn.position)
	var sheep = scene.asset_nodes[0]
	check(not sheep.fleeing, "Sheep begins idle")
	sheep._process(0.1)
	check(sheep.fleeing and sheep.texture == sheep.Art.SHEEP_RUN, "Pawn on same tile triggers run")
	scene.pawn.position = scene.layout.center(Vector2i(3, 2))
	for i in 60:
		sheep._process(0.1)
	check(not sheep.fleeing and sheep.texture == sheep.Art.SHEEP_IDLE and scene.layout.cell_at(sheep.position) != Vector2i(1, 0), "Sheep returns to idle on safe grass")
	check(copy.restore(scene.layout.snapshot()), "Fled sheep reloads")
	var saved_layout: Dictionary = scene.layout.snapshot()
	scene.layout.cells.clear()
	scene.layout.stair_directions.clear()
	scene.layout.trees.clear()
	scene.layout.houses.clear()
	scene.layout.log_piles.clear()
	for x in 6:
		scene.layout.cells[Vector2i(x, 0)] = "meadow"
	sheep.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.sheep[0] = sheep.position
	scene.pawn.position = sheep.position
	sheep.approach_direction = Vector2.RIGHT
	for attempt in 20:
		sheep.escape_target()
		var escape_cell: Vector2i = scene.layout.cell_at(sheep.escape_route.back())
		check(escape_cell.x >= 3 and escape_cell.x <= 5, "Sheep chooses a destination three to five tiles away")
	for x in range(3, 6):
		scene.layout.cells.erase(Vector2i(x, 0))
	sheep.escape_target()
	check(scene.layout.cell_at(sheep.escape_route.back()) == Vector2i(2, 0), "Small island escape reaches the farthest safe tile")
	scene.layout.cells.erase(Vector2i(2, 0))
	for x in range(-5, 0):
		scene.layout.cells[Vector2i(x, 0)] = "meadow"
	sheep.escape_target()
	check(scene.layout.cell_at(sheep.escape_route.back()) == Vector2i(1, 0), "One tile opposite approach wins over five tiles toward the pawn")
	scene.layout.cells.erase(Vector2i(1, 0))
	scene.layout.cells[Vector2i(0, 1)] = "meadow"
	sheep.escape_target()
	check(scene.layout.cell_at(sheep.escape_route.back()) == Vector2i(0, 1), "Sideways escape wins over running toward the approach")
	scene.layout.cells.erase(Vector2i(0, 1))
	sheep.escape_target()
	check(scene.layout.cell_at(sheep.escape_route.back()).x <= -3, "Escape toward approach is allowed only when trapped")
	scene.layout.cells.clear()
	for cell in [Vector2i.ZERO, Vector2i(1, 0), Vector2i(1, 1), Vector2i(2, 1), Vector2i(2, 2), Vector2i(1, 2)]:
		scene.layout.cells[cell] = "meadow"
	for attempt in 20:
		sheep.escape_target()
		check(sheep.escape_route.size() >= 3 and sheep.escape_route.size() <= 5, "Winding escape counts three to five route tiles")
		check(scene.layout.cell_at(sheep.escape_route[0]) == Vector2i(1, 0), "Winding escape begins opposite the approach")
		for index in range(1, sheep.escape_route.size()):
			var step: Vector2i = scene.layout.cell_at(sheep.escape_route[index]) - scene.layout.cell_at(sheep.escape_route[index - 1])
			check(step in scene.layout.STEPS, "Winding escape follows adjacent safe tiles")
	# Different routes to the same cell must remain available: a diagonal
	# approach on four grass tiles still has a three-step winding escape.
	sheep.set_process(false)
	scene.layout.cells.clear()
	for cell in [Vector2i.ZERO, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.ONE]:
		scene.layout.cells[cell] = "meadow"
	scene.layout.flora[Vector2i.RIGHT] = 1
	scene.layout.decorations[Vector2i.DOWN] = {"kind": "land_rock", "variant": 1}
	check(not scene.layout.asset_ground_free(Vector2i.RIGHT) and not scene.layout.asset_ground_free(Vector2i.DOWN), "Bushes and rocks still block asset placement")
	sheep.approach_direction = Vector2.ONE.normalized()
	for attempt in 20:
		sheep.escape_target()
		check(sheep.escape_route.size() == 3, "Diagonal escape uses three steps before falling back to two")
		var visited := [Vector2i.ZERO]
		for point in sheep.escape_route:
			var cell: Vector2i = scene.layout.cell_at(point)
			check(not visited.has(cell), "Winding escape never revisits a tile")
			visited.append(cell)
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	# A leftward run keeps its facing when the next waypoint is vertical.
	scene.layout.cells.clear()
	for cell in [Vector2i.ZERO, Vector2i.LEFT, Vector2i(-1, 1), Vector2i(-1, 2)]:
		scene.layout.cells[cell] = "meadow"
	sheep.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.sheep[0] = sheep.position
	scene.pawn.position = sheep.position
	sheep.previous_pawn_position = sheep.position + Vector2(10, 0)
	sheep.fleeing = false
	sheep.escape_route.clear()
	sheep.updated_at = 100.0
	sheep.advance(0.59, 100.0)
	check(sheep.fleeing and sheep.flip_h and sheep.destination.x == sheep.position.x, "Leftward escape retains facing through a vertical turn")
	# Stairs connect floors in either orientation; animation follows the slope.
	for descending in [false, true]:
		scene.layout.cells.clear()
		scene.layout.elevations.clear()
		for x in 4:
			var cell := Vector2i(x, 0)
			scene.layout.cells[cell] = "stairs" if x == 1 else "meadow"
			scene.layout.elevations[cell] = 64 if (x == 0 if descending else x >= 2) else 0
		scene.layout.stair_directions[Vector2i.RIGHT] = Vector2i.LEFT if descending else Vector2i.RIGHT
		sheep.position = scene.layout.center(Vector2i.ZERO)
		scene.layout.sheep[0] = sheep.position
		scene.pawn.position = sheep.position
		sheep.previous_pawn_position = sheep.position - Vector2(10, 0)
		sheep.fleeing = false
		sheep.escape_route.clear()
		sheep.updated_at = 100.0
		sheep.advance(0.59, 100.0)
		check(sheep.fleeing and scene.layout.cell_at(sheep.position) == Vector2i.RIGHT, "Sheep enters connected ramp")
		check(sheep.offset.y < -8 and sheep.offset.y > -72 and sheep.z_index == 1, "Sheep height and depth follow stair slope")
		sheep.advance(1.2, 100.0)
		check(not sheep.fleeing and scene.layout.cell_at(sheep.position) == Vector2i(3, 0), "Sheep crosses stair and reaches opposite floor")
		scene.layout.stair_directions.clear()
	# A trunk blocks the direct route, but adjacent grass provides a detour.
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	for cell in [Vector2i.ZERO, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.ONE, Vector2i(2, 1), Vector2i(2, 0)]:
		scene.layout.cells[cell] = "meadow"
	scene.layout.trees[Vector2i.RIGHT] = Vector2.ZERO
	sheep.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.sheep[0] = sheep.position
	sheep.approach_direction = Vector2.RIGHT
	sheep.escape_target()
	check(sheep.escape_route.size() >= 3, "Escape finds a route past the tree contact")
	var route_start: Vector2 = sheep.position
	for point in sheep.escape_route:
		check(scene.clear_segment(route_start, point), "Tree detour keeps every segment clear of the trunk")
		route_start = point
	scene.layout.trees.clear()
	check(scene.layout.restore(saved_layout), "Restore layout after limited escape check")
	for ramp in scene.layout.stair_directions:
		var ramp_save := saved_layout.duplicate(true)
		var ramp_point: Vector2 = scene.layout.center(ramp)
		ramp_save.sheep = [[ramp_point.x, ramp_point.y]]
		check(copy.restore(ramp_save) and copy.sheep[0] == ramp_point, "Sheep resting on stairs survives reload")
		break
	scene.layout.sheep[0] = scene.layout.center(Vector2i(1, 0))
	sheep.position = scene.layout.sheep[0]
	scene.layout.resources.wood = 8
	scene.layout.carried_wood = 2
	var pile_cell := Vector2i(0, 1)
	scene.layout.log_piles[pile_cell] = 6
	scene.rebuild_decorations()
	var pile_point := Vector2.ZERO
	for node in scene.flora_nodes:
		if node.get_meta("log_pile", Vector2i(999, 999)) == pile_cell:
			for sprite in node.get_children():
				var candidate: Vector2 = sprite.global_position
				if scene.log_at(candidate) == pile_cell:
					pile_point = candidate
	check(pile_point != Vector2.ZERO, "Full pyramid is hittable")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = scene.get_global_transform_with_canvas() * pile_point
	scene.handle_world_click(click)
	check(scene.construction.phase == scene.construction.Phase.PICKUP and scene.layout.log_piles.has(pile_cell), "Full pyramid click begins approach without removing logs")
	scene.waypoints.clear()
	scene.pawn.position = scene.layout.center(pile_cell)
	scene.pawn.walk_to(scene.pawn.position)
	scene.construction._process(0.0)
	check(scene.editing and scene.selected == "house" and scene.layout.house_bundle == 6, "Arrival reserves full pyramid and opens house placement")
	scene.editing = true
	scene.selected = "house"
	scene.terrain.hover = Vector2i(1, 1)
	scene.terrain.preview_position = scene.layout.center(scene.terrain.hover)
	check(scene.apply_edit(Vector2i(1, 1)), "Runtime house placement")
	check(not scene.layout.log_piles.has(pile_cell) and scene.layout.carried_wood == 2 and scene.layout.house_bundle == 0, "Construction consumes reserved pyramid before carried logs")
	check(not scene.ui.buttons.house.visible, "House stays outside the inventory")
	check(scene.apply_edit(Vector2i(1, 1)), "Runtime house rotation")
	scene.layout.level = 5
	scene.ui.celebrate()
	check(scene.ui.celebration.get_node("Title").text == "LEVEL 5" and not scene.ui.celebration.get_node("PineReward").visible, "Level five reward popup")
	scene.queue_free()
	await process_frame
	print("Level five checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
