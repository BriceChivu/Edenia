extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var layout = Layout.new()
	layout.level = 7
	layout.trees.clear()
	layout.log_piles.clear()
	layout.flora.clear()
	layout.decorations.clear()
	for x in range(-2, 4):
		for y in range(-2, 4):
			layout.cells[Vector2i(x, y)] = "meadow"
	for kind in layout.KINDS:
		layout.stock[kind] = 0
	layout.stock.tree = 2
	layout.stock.bridge = 1
	layout.stock.sheep = 0
	layout.stock.chicken = 0
	layout.free_house_grass = layout.cells.size() - 27
	layout.house_bundle = 6
	layout.resources.wood = 6
	var site := Vector2i.ZERO
	var inside: Vector2 = layout.center(site) + Vector2(32, 60)
	layout.sheep.assign([inside])
	layout.chickens.assign([inside + Vector2(5, 0)])
	layout.flora[site] = 1
	layout.flora[Vector2i.ONE] = 1
	layout.decorations[Vector2i.DOWN] = {"kind": "land_rock", "variant": 1}
	layout.decorations[Vector2i.RIGHT] = {"kind": "land_rock", "variant": 1}
	var before: Dictionary = layout.snapshot()
	check(layout.can_edit(site, "house", Vector2i(-2, -2)), "Animals and decorations permit house preview")
	check(layout.edit(site, "house", Vector2i(-2, -2)), "House builds on occupied ground")
	check(layout.flora.has(site) and layout.flora.has(Vector2i.ONE), "Bushes outside side-view ground contact stay on foundation")
	check(layout.decorations.has(Vector2i.DOWN) and layout.decorations.has(Vector2i.RIGHT), "Rocks outside side-view ground contact stay on foundation")
	check(layout.sheep.size() == 1 and layout.chickens.size() == 1, "Reachable animals stay in world")
	for point in layout.sheep + layout.chickens:
		check(layout.walkable_point(point, true), "Displaced animal has safe ground")
	check(layout.house_displacements.size() == 2, "Both animals have running animation routes")
	var copy = Layout.new()
	check(copy.restore(layout.snapshot()), "Displaced occupants survive save/load")
	check(copy.restore(before) and copy.sheep[0] == inside and copy.flora.has(Vector2i.ONE), "Undo restores occupants and cleared decoration")
	# An isolated piece of grass wholly covered by a new contact has no exit.
	var trapped = Layout.new()
	trapped.cells.clear()
	trapped.trees.clear()
	trapped.log_piles.clear()
	trapped.cells[Vector2i.ONE] = "meadow"
	trapped.sheep.assign([trapped.center(Vector2i.ONE)])
	trapped.chickens.assign([trapped.center(Vector2i.ONE)])
	var sheep_stock: int = trapped.stock.sheep
	var chicken_stock: int = trapped.stock.chicken
	trapped.clear_house_occupants(site, 0, Vector2.ZERO, trapped.center(Vector2i(-2, -2)))
	check(trapped.sheep.is_empty() and trapped.chickens.is_empty(), "Trapped occupants leave the world")
	check(trapped.stock.sheep == sheep_stock + 1 and trapped.stock.chicken == chicken_stock + 1, "Trapped animals return exactly one inventory item each")
	# Verify the visible nodes run while durable saved positions remain outside.
	var world = preload("res://previews/level_five.tscn").instantiate()
	world.camera_save_enabled = false
	root.add_child(world)
	world.editing = false
	await process_frame
	world.terrain.hide()
	world.layout = layout
	world.editing = true
	world.selected = ""
	world.history.clear()
	world.terrain.layout = layout
	world.rebuild_decorations()
	world.animate_house_displacements()
	var running := 0
	for node in world.asset_nodes:
		if node.has_method("animal_positions") and node.house_fleeing:
			running += 1
			var saved: Vector2 = node.animal_positions()[node.sheep_index]
			node.advance(0.1, node.updated_at + 0.1)
			check(node.position != inside and node.fleeing, "Animal runs during house placement")
			check(node.animal_positions()[node.sheep_index] == saved, "Escape animation preserves safe saved position")
			node.advance(5.0, node.updated_at + 5.0)
			check(node.position.is_equal_approx(saved), "Escape finishes at reserved destination")
	check(running == 2, "Sheep and chicken both animate evacuation")
	var front = Layout.new()
	check(front.restore(before), "Restore original occupants for front view")
	front.house_bundle = 0
	front.resources.wood = 0
	front.stock.house = 1
	check(front.edit(site, "house", Vector2i(-2, -2)), "Front-facing house accepts decorations")
	check(not front.flora.has(site) and not front.flora.has(Vector2i.ONE) and not front.decorations.has(Vector2i.DOWN), "Front contact clears bushes and rock beneath it")
	world.editing = false
	world.queue_free()
	await process_frame
	print("House occupant checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
