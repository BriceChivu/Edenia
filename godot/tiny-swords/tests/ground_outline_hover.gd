extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	level.editing = true
	level.selected = ""
	var l = level.layout
	var back := Vector2i.ZERO
	var front := Vector2i.DOWN
	l.cells = {back:"high_meadow", front:"high_gold"}
	l.elevations = {back:64, front:128}
	l.trees.clear()
	l.houses.clear()
	l.flora.clear()
	l.decorations.clear()
	l.chickens.clear()
	l.sheep.clear()
	l.manual_ground_elevation = true
	level.pawn.position = l.center(Vector2i(5, 5))
	var top: Vector2 = l.center(front) - Vector2(0, 128)
	var changes: Array[Dictionary] = level.inventory_changes()
	var hit: Dictionary = level.inventory_change_at(top, changes)
	check(not hit.is_empty() and hit.cell == front, "Overlapping outlined tops must hover the frontmost drawn grass")
	level.update_inventory_preview(top)
	check(level.terrain.transform_preview and level.terrain.hover == front, "Outlined top drives the actual inventory preview")
	l.cells = {front:"high_gold", back:"high_meadow"}
	check(level.inventory_change_at(top, level.inventory_changes()).get("cell") == front, "Hover is independent of dictionary insertion order")
	# A single raised tile has an outlined grass top, but no cliff outline.
	l.cells = {front:"high_gold"}
	l.elevations = {front:64}
	changes = level.inventory_changes()
	top = l.center(front) - Vector2(0, 64)
	hit = level.inventory_change_at(top, changes)
	check(not hit.is_empty() and hit.cell == front, "Outlined grass top must offer its terrain change")
	check(level.inventory_change_at(l.center(front), changes).is_empty(), "Unoutlined cliff face must not trigger a ground preview")
	level.update_inventory_preview(top)
	check(level.terrain.transform_preview and level.terrain.hover == front, "Raised outlined grass shows a replacement preview")
	level.update_inventory_preview(l.center(front))
	check(not level.terrain.transform_preview and not level.terrain.valid, "Moving from outlined grass onto its cliff clears the replacement preview")
	# A hidden flat tile must not draw an outline through an uneditable upper top.
	var hidden := Vector2i.ZERO
	var upper := Vector2i(0, 2)
	var upper_back := Vector2i(0, 1)
	var terrace := Vector2i(0, 3)
	l.cells = {hidden:"meadow", upper_back:"high_meadow", upper:"high_meadow", terrace:"high_gold"}
	l.elevations = {hidden:0, upper_back:128, upper:128, terrace:64}
	changes = level.inventory_changes()
	top = l.ground_surface_rect(upper).get_center()
	check(l.next_ground_height(hidden) >= 0, "Covered tile still has a legal edit in the terrain model")
	check(level.inventory_change_at(top, changes).is_empty(), "Visible upper tile cannot change at the covered tile's screen position")
	check(not changes.any(func(change): return change.tool == "ground" and change.cell == hidden), "Unclickable covered grass must not advertise an outline")
	# Removing the covering top makes that same lower tile clickable again.
	l.cells.erase(upper)
	changes = level.inventory_changes()
	check(changes.any(func(change): return change.tool == "ground" and change.cell == hidden), "Revealed editable grass regains its outline")
	level.queue_free()
	await process_frame
	print("Ground outline hover: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
