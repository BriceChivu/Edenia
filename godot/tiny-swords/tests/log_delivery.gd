extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func click(world, cell: Vector2i) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = world.get_global_transform_with_canvas() * (world.layout.center(cell) - Vector2(0, world.layout.height_at(cell)))
	world.handle_world_click(event)

func arrive(world) -> void:
	while not world.waypoints.is_empty():
		world.pawn.position = world.pawn.destination
		world.pawn.walk_to(world.waypoints.pop_front())
	world.pawn.position = world.pawn.destination
	world._process(0)

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	var layout = world.layout
	var source := Vector2i(1, 0)
	var delivery := Vector2i(2, 0)
	if not layout.cells.has(delivery):
		layout.cells[delivery] = "meadow"
		layout.stock.meadow -= 1
	layout.flora.erase(delivery)
	layout.decorations.erase(delivery)
	check(layout.edit(source, "tree", Layout.HOME), "Place harvest source")
	layout.tree_types[source] = "tree"
	world.rebuild_decorations()
	check(world.harvesting.start(source), "Start two-log harvest")
	world.harvesting.advance(1, 1000)
	arrive(world)
	world.harvesting.advance(0, 1000)
	world.harvesting.advance(30, 1030)
	check(layout.carried_wood == 2 and layout.resources.wood == 2, "Harvest is carried without duplicating resources")
	check(world.pawn.sprite.animation == "wood_idle", "Harvest switches immediately to Wood idle PNG")
	check(not world.harvesting.start(source), "Cannot start another harvest while carrying")
	click(world, delivery)
	check(not layout.log_piles.has(delivery), "Click does not drop before arrival")
	world.pawn._physics_process(0.01)
	check(world.pawn.sprite.animation == "wood_run", "Delivery uses Wood run PNG")
	arrive(world)
	check(layout.log_piles.get(delivery) == 2 and layout.carried_wood == 0, "Arrival deposits both logs")
	check(layout.resources.wood == 2, "Delivery preserves harvested wood total")
	for count in [4, 6]:
		layout.carried_wood = 2
		layout.resources.wood += 2
		click(world, delivery)
		arrive(world)
		check(layout.log_piles.get(delivery) == count, "Pile grows to %d logs" % count)
	var pile: Node2D = world.flora_nodes.back()
	check(pile.get_child_count() == 6, "Six logs rendered using resource PNG")
	check(pile.get_child(0).position.x < pile.get_child(1).position.x and pile.get_child(1).position.x < pile.get_child(2).position.x and pile.get_child(2).position.x == pile.get_child(3).position.x and pile.get_child(3).position.x < pile.get_child(4).position.x and pile.get_child(4).position.x < pile.get_child(5).position.x and pile.get_child(0).position.y == pile.get_child(2).position.y and pile.get_child(2).position.y == pile.get_child(5).position.y and pile.get_child(1).position.y == pile.get_child(4).position.y and pile.get_child(3).position.y < pile.get_child(1).position.y and pile.get_child(1).position.y < pile.get_child(0).position.y, "Stack draws logs 1, 4, 2, 6, 5, 3 from back to front")
	layout.carried_wood = 1
	layout.resources.wood += 1
	check(not layout.can_drop_logs(delivery), "Full pile rejects more wood")
	check(not layout.can_drop_logs(source), "Stump rejects logs")
	check(not layout.can_drop_logs(Layout.HOME), "Bush rejects logs")
	check(not layout.can_drop_logs(Vector2i(3, 2)), "Rock rejects logs")
	check(not layout.can_drop_logs(Vector2i(10, 10)), "Water rejects logs")
	check(not layout.can_edit(delivery, "remove", Layout.HOME) and not layout.can_edit(delivery, "tree", Layout.HOME), "Pile is protected from terrain pickup and planting")
	var restored = Layout.new()
	var saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
	check(restored.restore(saved) and restored.carried_wood == 1 and restored.log_piles == layout.log_piles, "Carrying and piles survive JSON save")
	saved.log_piles[0][2] = 7
	check(not restored.restore(saved), "Reject oversized saved pile")
	var empty := Vector2i(2, 1)
	layout.cells[empty] = "meadow"
	layout.flora.erase(empty)
	layout.decorations.erase(empty)
	click(world, empty)
	world.toggle_editing()
	arrive(world)
	check(layout.carried_wood == 1 and not layout.log_piles.has(empty), "Opening Terrain cancels delivery without losing logs")
	world.toggle_editing()
	click(world, empty)
	click(world, Layout.HOME)
	arrive(world)
	check(layout.carried_wood == 1 and not layout.log_piles.has(empty), "New movement click cancels delivery")
	layout.cells[Vector2i(12, 8)] = "meadow"
	click(world, Vector2i(12, 8))
	arrive(world)
	check(layout.carried_wood == 1 and not layout.log_piles.has(Vector2i(12, 8)), "Unreachable grass cannot receive logs")
	# A five-log pyramid accepts its apex before the overflow is carried onward.
	layout.cells = {Layout.HOME: "meadow", Vector2i(1, 0): "meadow", Vector2i(2, 0): "meadow", Vector2i(3, 0): "meadow"}
	layout.trees.clear()
	layout.tree_stumps.clear()
	layout.flora = {Layout.HOME: 1}
	layout.decorations.clear()
	layout.log_piles = {Vector2i(1, 0): 5}
	layout.carried_wood = 2
	layout.resources.wood = 7
	world.pawn.position = layout.center(Layout.HOME)
	world.pawn.walk_to(world.pawn.position)
	world.waypoints.clear()
	world.rebuild_decorations()
	click(world, Vector2i(1, 0))
	check(layout.log_piles[Vector2i(1, 0)] == 5, "Overflow click waits for arrival")
	arrive(world)
	check(layout.log_piles[Vector2i(1, 0)] == 6 and layout.carried_wood == 1, "First arrival fills pyramid apex and retains overflow")
	check(world.log_delivery == Vector2i(2, 0) and world.pawn.carrying_wood, "Overflow targets nearest available grass with Wood animation")
	check(not layout.log_piles.has(Vector2i(2, 0)), "Overflow waits for second arrival")
	arrive(world)
	check(layout.log_piles.get(Vector2i(2, 0)) == 1 and layout.carried_wood == 0, "Second arrival deposits remaining log on nearest grass")
	check(layout.resources.wood == 7 and not layout.log_piles.has(Vector2i(3, 0)), "Overflow preserves total wood and leaves farther grass empty")
	# Occupied or disconnected grass cannot receive the automatic delivery.
	layout.log_piles = {Vector2i(1, 0): 5}
	layout.decorations[Vector2i(2, 0)] = {"kind": "land_rock", "variant": 1}
	layout.cells[Vector2i(1, -2)] = "meadow"
	layout.carried_wood = 2
	click(world, Vector2i(1, 0))
	arrive(world)
	check(world.log_delivery == Vector2i(3, 0), "Overflow skips blocked and unreachable grass")
	world.toggle_editing()
	arrive(world)
	check(layout.carried_wood == 1 and not layout.log_piles.has(Vector2i(3, 0)), "Cancelling overflow keeps remaining wood")
	world.toggle_editing()
	layout.log_piles = {Vector2i(1, 0): 5, Vector2i(3, 0): 6}
	layout.carried_wood = 2
	layout.resources.wood = 13
	click(world, Vector2i(1, 0))
	arrive(world)
	check(layout.log_piles[Vector2i(1, 0)] == 6 and layout.carried_wood == 1 and world.log_delivery == Vector2i(999, 999), "No available grass leaves overflow safely carried")
	var partial = Layout.new()
	partial.log_piles[Vector2i(1, 0)] = 5
	partial.carried_wood = 2
	partial.resources.wood = 7
	check(partial.drop_logs(Vector2i(1, 0)), "Layout accepts partial harvest")
	check(restored.restore(JSON.parse_string(JSON.stringify(partial.snapshot()))) and restored.carried_wood == 1 and restored.log_piles[Vector2i(1, 0)] == 6, "Partial delivery survives reload")
	world.queue_free()
	await process_frame
	print("Log delivery checks: %d failures" % failures)
	quit(0 if failures == 0 else 1)
