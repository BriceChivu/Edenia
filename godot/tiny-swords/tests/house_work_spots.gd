extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.construction.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.layout.stock.tree += scene.layout.trees.size()
	scene.layout.trees.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	# A narrow approach and staircase feed a small raised platform. A house
	# can cut off its front work spots while the side of its door stays reachable.
	for square in [Vector2i(2, 1), Vector2i(3, 1), Vector2i(6, 1), Vector2i(6, 2), Vector2i(7, 1), Vector2i(7, 2)]:
		check(scene.layout.edit(square, "ground", Vector2i(-10, -10), 0), "Add fixture grass")
	check(scene.layout.edit(Vector2i(4, 2), "stairs", Vector2i(-10, -10)), "Add the platform staircase")
	scene.layout.manual_ground_elevation = true
	for square in [Vector2i(5, 2), Vector2i(6, 1), Vector2i(6, 2), Vector2i(7, 1), Vector2i(7, 2)]:
		scene.layout.cells[square] = "high_gold"
		scene.layout.elevations[square] = 64
	scene.layout.resources.wood = 6
	scene.layout.house_bundle = 6
	scene.editing = true
	scene.selected = "house"
	scene.pawn.position = scene.layout.center(Vector2i(0, 0))
	scene.pawn.walk_to(scene.pawn.position)
	var before: Dictionary = scene.layout.snapshot()
	var point := Vector2(928, 240)
	var site := Vector2i(6, 2)
	var offset := Vector2(0, -32)
	check(scene.layout.can_edit(site, "house", Vector2i(0, 0), -1, Vector2.ZERO, scene.pawn.position, offset), "The site has a valid foundation and clear contacts")
	var plan: Dictionary = scene.construction.placement_plan(site, offset)
	check(not plan.is_empty(), "House planner finds a reachable work spot beside the door")
	if not plan.is_empty():
		check(scene.construction.on_house_floor(plan.layout, site, plan.route.back()), "Both soles stay on the house floor")
		check(plan.layout.walkable_point(plan.route.back()), "Work spot stays outside house contacts")
		check(plan.route.back().y < scene.layout.center(site).y + offset.y + 68, "Narrow approach uses a work spot above the disconnected front spots")
	for dy in [-8, -1, 0, 1, 8, 16, 24]:
		scene.update_inventory_preview(point + Vector2(0, dy))
		check(scene.terrain.valid, "Free preview stays valid beside the reachable door at y=%s" % (point.y + dy))
	check(scene.layout.snapshot() == before, "Planning and preview do not change the live island")
	check(scene.construction.build(site, offset), "The preview site starts a real construction approach")
	if not scene.waypoints.is_empty():
		scene.pawn.position = scene.waypoints.back()
		scene.waypoints.clear()
		scene.pawn.walk_to(scene.pawn.position)
		scene.construction._process(0)
		check(scene.pawn.hammering and scene.layout.houses.has(site), "The reachable work spot starts hammering")
		check(scene.layout.house_offsets.get(site) == offset, "Construction retains the exact preview position")
	check(scene.layout.restore(before), "Restore the unbuilt fixture")
	scene.layout.cells.erase(Vector2i(3, 1))
	scene.layout.elevations.erase(Vector2i(3, 1))
	scene.layout.stock.meadow += 1
	scene.pawn.position = scene.layout.center(Vector2i(0, 0))
	scene.pawn.walk_to(scene.pawn.position)
	check(scene.construction.placement_plan(site, offset).is_empty(), "A genuinely disconnected platform still rejects placement")
	scene.queue_free()
	await process_frame
	print("House work spot checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
