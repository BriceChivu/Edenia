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
	scene.layout.stock.tree += scene.layout.trees.size()
	scene.layout.trees.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.stock.chicken += scene.layout.chickens.size()
	scene.layout.chickens.clear()
	scene.layout.stock.sheep += scene.layout.sheep.size()
	scene.layout.sheep.clear()
	for x in range(-2, 5):
		for y in range(-2, 5):
			if not scene.layout.cells.has(Vector2i(x, y)):
				scene.layout.playground_grants.ground = int(scene.layout.playground_grants.get("ground", 0)) + 1
			scene.layout.cells[Vector2i(x, y)] = "meadow"
			scene.layout.elevations[Vector2i(x, y)] = 0
	scene.layout.resources.wood = 6
	scene.layout.house_bundle = 6
	scene.editing = true
	scene.selected = "house"
	scene.pawn.position = scene.layout.center(Vector2i(-1, 1))
	scene.pawn.walk_to(scene.pawn.position)
	var site := Vector2i(1, 1)
	var previous := Rect2()
	for dx in range(-31, 34):
		var point: Vector2 = scene.layout.center(site) + Vector2(dx, 31.25)
		scene.update_inventory_preview(point)
		check(scene.terrain.valid, "Free house preview stays valid on clear level ground")
		var area: Rect2 = scene.terrain.house_preview_rect()
		if dx > -31:
			check(area.position.is_equal_approx(previous.position + Vector2.RIGHT), "House follows each mouse pixel across grid boundaries at x=%s" % dx)
		previous = area
	for dy in range(-31, 34):
		var mouse: Vector2 = scene.layout.center(site) + Vector2(31.25, dy)
		scene.update_inventory_preview(mouse)
		var area: Rect2 = scene.terrain.house_preview_rect()
		if dy > -31:
			check(area.position.is_equal_approx(previous.position + Vector2.DOWN), "House follows each mouse pixel vertically across grid boundaries")
		previous = area
	var offset := Vector2(31.25, 31.25)
	var missing := Vector2i(2, 3)
	scene.layout.cells.erase(missing)
	scene.layout.elevations.erase(missing)
	scene.layout.stock.meadow += 1
	var grass_before: int = scene.layout.stock.meadow
	check(scene.layout.house_foundation_cost(site, offset) == 1, "Free position includes its missing support tile in the grass cost")
	var point: Vector2 = scene.layout.center(site) + offset
	scene.update_inventory_preview(point)
	var preview: Rect2 = scene.terrain.house_preview_rect()
	check(scene.construction.build(site, offset), "Free mouse position starts construction")
	check(scene.layout.cells.has(missing) and scene.layout.stock.meadow == grass_before - 1, "Construction adds and pays for the free position support tile")
	check(scene.construction.target_offset == offset, "Construction retains the exact mouse position")
	scene.pawn.position = scene.waypoints.back() if not scene.waypoints.is_empty() else scene.pawn.destination
	scene.waypoints.clear()
	scene.pawn.walk_to(scene.pawn.position)
	scene.construction._process(0)
	check(scene.layout.house_offsets.get(site) == offset, "Built house retains the exact mouse position")
	if scene.construction.house_sprite != null:
		var house = scene.construction.house_sprite
		check((house.position + house.offset - house.texture.get_size() / 2).is_equal_approx(preview.position), "Built artwork matches the free preview")
	var copy = scene.Layout.new()
	check(copy.restore(JSON.parse_string(JSON.stringify(scene.layout.snapshot()))) and copy.house_offsets.get(site) == offset, "Save/reload keeps the unsnapped position")
	check(copy.edit(site, "house", Vector2i(-10, -10)) and copy.house_offsets.get(site) == offset, "Rotation keeps the unsnapped position")
	scene.queue_free()
	await process_frame
	print("Free house placement checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
