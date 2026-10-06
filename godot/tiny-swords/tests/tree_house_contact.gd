extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
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
	var layout = scene.layout
	layout.stock.tree += layout.trees.size()
	layout.trees.clear()
	layout.tree_types.clear()
	layout.flora.clear()
	layout.decorations.clear()
	layout.chickens.clear()
	layout.stock.chicken = 1
	layout.sheep.clear()
	layout.stock.sheep = 1
	var site := Vector2i(8, 4)
	layout.resources.wood = 6
	check(layout.edit(site, "house", Layout.HOME, -1, Vector2.ZERO, Vector2i(999, 999), scene.pawn.position, Vector2(0, 28)), "Build freely positioned house on its free foundation")
	layout.next_tree_variant = "tree"
	scene.editing = true
	scene.selected = "tree"
	var roots: PackedVector2Array = layout.tree_footprint(layout.center(site), "tree")
	check(Geometry2D.intersect_polygons(roots, layout.house_footprint(site)).is_empty(), "Behind-house fixture has separate ground contacts")
	scene.update_inventory_preview(layout.center(site))
	check(scene.terrain.valid, "Tree hover allows clear roots on a house foundation tile")
	check(scene.apply_edit(site), "Tree can be planted behind a house on the same owner tile")
	check(layout.houses.has(site) and layout.trees.has(site), "Tree planting preserves the house")
	var saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
	var copy = Layout.new()
	check(copy.restore(saved), "Tree and house sharing a foundation survive save/reload")
	check(not layout.can_edit(site, "tree", Layout.HOME), "Variant cycling rejects larger roots that clash with the house")
	check(not layout.edit(site, "tree", Layout.HOME) and layout.tree_types[site] == "tree", "Rejected variant leaves the planted tree unchanged")
	copy.houses[site] = 3
	copy.trees[site] = Vector2(0, 28)
	check(not copy.can_edit(site, "house", Layout.HOME), "House rotation rejects contact overlap with the planted tree")
	var foundation: Vector2i = site + Vector2i.DOWN
	check(not layout.can_edit(foundation, "remove", Layout.HOME), "House pickup waits for trees on disappearing free grass")
	scene.selected = "remove"
	check(scene.clicked_cell(layout.center(site) - Vector2(0, 35)) == site, "Exposed tree artwork remains selectable over the house rectangle")
	check(layout.pickup_cells(site) == [site], "Tree pickup reserves only its own tile")
	check(scene.apply_edit(site) and layout.houses.has(site) and not layout.trees.has(site), "Pickup removes the tree rather than the house sharing its anchor")
	scene.undo()
	check(layout.trees.has(site) and layout.houses.has(site), "Undo restores the tree behind the house")
	scene.selected = "remove"
	check(scene.apply_edit(site), "Collect the restored tree")
	scene.selected = "tree"
	layout.next_tree_variant = "tree2"
	var before: Dictionary = layout.snapshot()
	check(not scene.apply_edit(site) and layout.snapshot() == before, "Actual planting rejects clashing roots without spending inventory")
	layout.next_tree_variant = "tree"
	check(not scene.apply_edit(site, -1, Vector2(0, 28)), "Moving roots into the house blocks planting")
	check(layout.edit(foundation, "remove", Layout.HOME) and not layout.houses.has(site), "House can be collected after its foundation tree is removed")
	scene.queue_free()
	await process_frame
	print("Tree/house contact checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
