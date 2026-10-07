extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
var checks := 0

func check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(label)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	for direction in [Vector2i.LEFT, Vector2i.RIGHT]:
		for height in [0, 64, 128]:
			var l = Layout.new()
			l.cells.clear()
			l.flora.clear()
			l.decorations.clear()
			for x in range(-2, 3):
				for y in range(-2, 3):
					l.cells[Vector2i(x, y)] = "meadow"
					l.elevations[Vector2i(x, y)] = height
			l.cells[Vector2i.ZERO] = "stairs"
			l.cells[direction] = "high_gold"
			l.elevations[direction] = height + 64
			l.stair_directions = {Vector2i.ZERO: direction}
			var edge: Vector2 = l.center(direction) - Vector2(0, 32)
			check(not l.walkable_point(edge - Vector2(0, 1), true), "Animal feet cannot overlap the solid cliff from lower ground")
			check(not l.walkable_point(edge - Vector2(0, 3)), "Pawn feet cannot overlap the solid cliff from lower ground")
			check(l.walkable_point(edge - Vector2(0, 12), true), "Ground outside the solid contact remains usable")
			check(l.walkable_point(l.center(direction), true), "Upper surface remains usable")
			var tree_cell: Vector2i = direction + Vector2i.UP
			l.level = 3
			l.stock.tree = 1
			l.next_tree_variant = "tree2"
			check(not l.can_edit(tree_cell, "tree", Vector2i(-2, -2), -1, Vector2(0, 28)), "Tree roots cannot enter a neighbouring solid cliff")
			check(l.can_edit(tree_cell, "tree", Vector2i(-2, -2), -1, Vector2.ZERO), "Tree roots entirely outside the cliff remain placeable")
			check(not l.terrain_supports_contact(l.log_footprint(direction, 3), height), "A lower-floor log base cannot occupy the solid terrain")
			check(l.terrain_supports_contact(l.log_footprint(direction, 3), height + 64), "Log base fits on the upper surface")
			l.carried_wood = 3
			check(l.can_drop_logs(direction) and not l.can_drop_logs(Vector2i.ZERO), "Logs can be placed on top, while the ramp stays reserved")
			l.level = 5
			l.stock.house = 1
			check(not l.can_edit(tree_cell, "house", Vector2i(10, 10)), "A lower-floor house foundation cannot intersect the solid base")
			check(l.can_edit(Vector2i(-2, -2), "house", Vector2i(10, 10)), "A house outside the solid base remains placeable")
			l.cells[Vector2i.ZERO] = "meadow"
			l.stair_directions.clear()
			check(not l.walkable_point(edge - Vector2(0, 1), true), "Standalone raised terrain applies the same solid boundary to animals")
			check(not l.can_edit(tree_cell, "tree", Vector2i(-2, -2), -1, Vector2(0, 28)), "Standalone raised terrain applies the same solid boundary to roots")
	var l = Layout.new()
	for level in [2, 3, 4, 5]:
		l.unlock(level)
	l.manual_ground_elevation = true
	l.flora.clear()
	l.decorations.clear()
	check(l.edit(Vector2i(1, 0), "stairs", Vector2i(0, 1)), "Build the original staircase")
	check(l.edit(Vector2i(2, -1), "ground", Vector2i(0, 1), 0), "Build lower ground behind its landing")
	l.flora.clear()
	l.decorations.clear()
	var rear := Vector2i(2, -1)
	var edge: Vector2 = l.center(Vector2i(2, 0)) - Vector2(0, 32)
	# An old save could contain contacts protruding from this neighbouring tile.
	l.trees[rear] = Vector2(0, 28)
	l.tree_types[rear] = "tree2"
	l.stock.tree -= 1
	l.chickens.assign([edge + Vector2(20, -1)])
	l.stock.chicken -= 1
	l.sheep.assign([edge + Vector2(-20, -1)])
	l.stock.sheep -= 1
	var restored = Layout.new()
	check(restored.restore(JSON.parse_string(JSON.stringify(l.snapshot()))), "Accept and settle old contacts without losing the island")
	check(restored.trees.has(rear) and restored.terrain_supports_contact(restored.tree_footprint(restored.tree_position(rear), "tree2"), 0), "Restored roots fit outside the solid base")
	for animals in [restored.chickens, restored.sheep]:
		check(animals.size() == 1 and restored.cell_at(animals[0]) == rear and restored.terrain_feet_free(animals[0], true), "Restored animal stays on the same tile with its feet outside the base")
	var snapshot: Dictionary = restored.snapshot()
	check(restored.restore(snapshot) and restored.snapshot() == snapshot, "Settling is stable on the next save/load")
	# Reverse placement: roots already on level ground must prevent a new cliff
	# from being raised through their contact area.
	l = Layout.new()
	l.unlock(2)
	l.unlock(3)
	l.manual_ground_elevation = true
	l.flora.clear()
	l.decorations.clear()
	l.trees[Vector2i(1, 0)] = Vector2(0, 28)
	l.tree_types[Vector2i(1, 0)] = "tree2"
	l.stock.tree -= 1
	check(not l.can_edit(Vector2i(1, 1), "ground", Vector2i(-2, -2), 64), "Raising terrain cannot swallow neighbouring tree roots")
	var world = load("res://scenes/level_two_preview.tscn").instantiate()
	world.island_start_enabled = false
	world.preview_save_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	world.pawn.position = world.layout.center(Vector2i(-2, -2))
	world.layout = restored
	var upper: Vector2 = restored.center(Vector2i(2, 0))
	var lower: Vector2 = restored.center(rear)
	for script in [load("res://scripts/sheep_visual.gd"), load("res://scripts/chicken_visual.gd")]:
		var actor = script.new()
		actor.world = world
		world.get_node("World").add_child(actor)
		actor.set_process(false)
		actor.position = upper
		actor.destination = lower
		actor.fleeing = true
		actor.updated_at = 100.0
		actor.house_fleeing = true
		actor.advance(1.0, 101.0)
		check(actor.position == upper and not actor.fleeing, "Actual displacement movement cannot follow a stale route through a cliff")
		actor.queue_free()
		await process_frame
	world.queue_free()
	print("Terrain solid contacts: ", checks, " checks; failures=", failures)
	quit(0 if failures == 0 else 1)
