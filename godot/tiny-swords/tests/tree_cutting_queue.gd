extends SceneTree

const Harvesting = preload("res://scripts/tree_harvesting.gd")
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func arrive(world, now: float) -> void:
	world.harvesting.advance(1, now)
	while not world.waypoints.is_empty():
		world.pawn.position = world.pawn.destination
		world.pawn.walk_to(world.waypoints.pop_front())
	world.pawn.position = world.pawn.destination
	world.harvesting.advance(0, now)

func click_tree(world, cell: Vector2i) -> void:
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	var point: Vector2 = world.layout.tree_position(cell)
	for sprite in world.tree_nodes:
		if sprite.get_meta("cell") != cell:
			continue
		var image: Image = sprite.texture.get_image()
		var found := false
		for y in image.get_height():
			for x in range(80, 112):
				if image.get_pixel(x, y).a == 1.0:
					point = sprite.position + (Vector2(x + 0.5, y + 0.5) - Vector2(192, image.get_height()) / 2 + sprite.offset) * sprite.scale
					found = true
					break
			if found:
				break
	check(world.tree_at(point) == cell, "Fixture click hits requested tree")
	click.position = world.get_global_transform_with_canvas() * point
	world.handle_world_click(click)

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	var layout = world.layout
	layout.cells.clear()
	layout.elevations.clear()
	layout.trees.clear()
	layout.tree_types.clear()
	layout.tree_stumps.clear()
	layout.tree_cut_remaining.clear()
	layout.log_piles.clear()
	layout.carried_wood = 0
	layout.resources.wood = 0
	for x in range(-1, 5):
		for y in range(-1, 2):
			layout.cells[Vector2i(x, y)] = "grass"
	var first := Vector2i(1, 0)
	var second := Vector2i(2, 0)
	var third := Vector2i(3, 0)
	var removed := Vector2i(4, 0)
	for cell in [first, second, third, removed]:
		layout.trees[cell] = Vector2.ZERO
		layout.tree_types[cell] = "tree"
	world.rebuild_decorations()
	world.pawn.position = layout.center(Layout.HOME)
	world.pawn.walk_to(world.pawn.position)
	var harvesting = world.harvesting
	check(harvesting.start(first), "Start first tree")
	click_tree(world, second)
	check(harvesting.target == first and harvesting.pending_trees == [second], "Click during approach queues without replacing target")
	arrive(world, 1000)
	harvesting.advance(4, 1004)
	click_tree(world, first)
	click_tree(world, second)
	click_tree(world, removed)
	click_tree(world, third)
	check(harvesting.pending_trees == [second, removed, third], "Clicks preserve order and deduplicate active and pending trees")
	check(harvesting.phase == Harvesting.Phase.CUTTING and layout.tree_cut_remaining[first] == 6, "Queueing preserves current swing and progress")
	layout.trees.erase(removed)
	layout.tree_types.erase(removed)
	harvesting.advance(6, 1010)
	check(harvesting.target == first and layout.carried_wood == 0, "Queue waits for final axe swing")
	world.pawn.sprite.animation_looped.emit()
	check(harvesting.target == second and harvesting.pending_trees == [removed, third], "Next tree starts automatically in order")
	check(layout.carried_wood == 1, "First log retained during next cut")
	world._process(0)
	world.pawn._physics_process(0)
	check(world.pawn.sprite.animation == "axe_idle" and not world.pawn.carrying_wood, "Queued cutting keeps axe animation while logs are retained")
	arrive(world, 1010)
	harvesting.advance(10, 1020)
	world.pawn.sprite.animation_looped.emit()
	check(harvesting.target == third and harvesting.pending_trees.is_empty(), "Removed entry is skipped and third tree starts")
	arrive(world, 1020)
	harvesting.advance(10, 1030)
	world.pawn.sprite.animation_looped.emit()
	check(harvesting.phase == Harvesting.Phase.READY and layout.carried_wood == 3 and layout.resources.wood == 3, "Queue completes with all logs awarded once")
	check(world.pawn.carrying_wood and world.pawn.sprite.animation == "wood_idle", "Finished queue returns to wood carrying pose")
	layout.tree_stumps.clear()
	world.rebuild_decorations()
	check(harvesting.start(first), "Another cut can start with existing carried logs")
	arrive(world, 1040)
	harvesting.advance(3, 1043)
	click_tree(world, second)
	var walk := InputEventMouseButton.new()
	walk.button_index = MOUSE_BUTTON_LEFT
	walk.pressed = true
	walk.position = world.get_global_transform_with_canvas() * layout.center(Layout.HOME)
	world.handle_world_click(walk)
	check(harvesting.phase == Harvesting.Phase.READY and harvesting.pending_trees.is_empty(), "Walking or delivery cancels current assignment and queue")
	check(layout.tree_cut_remaining[first] == 7 and layout.carried_wood == 3, "Cancellation retains partial work and logs")
	world.queue_free()
	await process_frame
	print("Tree cutting queue checks: %d failures" % failures)
	quit(0 if failures == 0 else 1)
