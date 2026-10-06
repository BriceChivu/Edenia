extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Harvesting = preload("res://scripts/tree_harvesting.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	var layout = world.layout
	var tree := Vector2i(0, 0)
	layout.cells = {tree: "grass", Vector2i(1, 0): "high_gold", Vector2i(1, 1): "high_gold", Vector2i(0, 1): "stairs", Vector2i(-1, 1): "grass", Vector2i(-1, 0): "grass"}
	layout.elevations.clear()
	layout.stair_directions = {Vector2i(0, 1): Vector2i.RIGHT}
	layout.trees = {tree: Vector2.ZERO}
	layout.tree_types = {tree: "tree"}
	layout.tree_stumps.clear()
	layout.log_piles.clear()
	layout.carried_wood = 0
	world.pawn.position = layout.center(Vector2i(1, 0))
	world.pawn.walk_to(world.pawn.position)
	check(world.harvesting.start(tree), "Tree is reachable by descending the stairs")
	check(not world.harvesting.route.is_empty() and is_equal_approx(world.ground_height(world.harvesting.route.back()), layout.height_at(tree)), "Cutting route ends on the tree's ground level")
	world.harvesting.advance(1, 1000)
	while not world.waypoints.is_empty():
		world.pawn.position = world.pawn.destination
		world.pawn.walk_to(world.waypoints.pop_front())
	world.pawn.position = world.pawn.destination
	world.harvesting.advance(0, 1000)
	check(world.harvesting.phase == Harvesting.Phase.CUTTING and is_equal_approx(world.ground_height(world.pawn.position), layout.height_at(tree)), "Pawn descends before starting to cut")
	world.harvesting.cancel()
	layout.tree_cut_remaining.clear()
	layout.cells.erase(Vector2i(0, 1))
	world.pawn.position = layout.center(Vector2i(1, 0))
	world.pawn.walk_to(world.pawn.position)
	check(not world.harvesting.start(tree), "Without stairs, the pawn cannot cut from the adjacent higher floor")
	world.queue_free()
	await process_frame
	print("Tree cutting elevation checks: %d failures" % failures)
	quit(0 if failures == 0 else 1)
