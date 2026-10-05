extends SceneTree

const Chicken = preload("res://scripts/chicken_visual.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = preload("res://previews/level_seven.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	for node in scene.asset_nodes:
		node.set_process(false)
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	scene.layout.stair_directions.clear()
	scene.layout.trees.clear()
	scene.layout.log_piles.clear()
	scene.layout.houses.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.sheep.clear()
	for x in range(-2, 7):
		for y in range(-2, 7):
			scene.layout.cells[Vector2i(x, y)] = "meadow"
	var start: Vector2 = scene.layout.center(Vector2i(-1, 0))
	scene.layout.chickens.assign([start])
	scene.pawn.position = scene.layout.center(Vector2i.ZERO)
	var chicken = Chicken.new()
	chicken.world = scene
	scene.get_node("World").add_child(chicken)
	chicken.set_process(false)
	chicken.updated_at = 100.0
	scene.editing = false
	var corner: Vector2 = scene.layout.center(Vector2i(3, 0))
	var finish: Vector2 = scene.layout.center(Vector2i(3, 3))
	var saw_run := false
	for tick in 240:
		var target: Vector2 = corner if tick < 55 else finish
		scene.pawn.position = scene.pawn.position.move_toward(target, scene.pawn.speed * 0.05)
		chicken.advance(0.05, 100.0 + (tick + 1) * 0.05)
		if tick < 60:
			check(chicken.position.is_equal_approx(start), "Wait three seconds before following")
		check(scene.layout.cell_at(chicken.position) != scene.layout.cell_at(scene.pawn.position), "Following never enters pawn tile")
		check(absf(chicken.position.y - start.y) < 0.01 or absf(chicken.position.x - corner.x) < 0.01, "Replay corner instead of cutting diagonally")
		saw_run = saw_run or chicken.texture == chicken.Art.CHICKEN_RUN
	check(saw_run, "Follow uses running animation")
	check(scene.layout.cell_at(chicken.position) == Vector2i(3, 2), "Stop on grass tile immediately before stationary pawn")
	check(scene.layout.chickens[0] == chicken.position, "Follow updates persisted ground position")
	# A pawn reversing onto the chicken still triggers the original escape.
	scene.pawn.position = chicken.position
	chicken.advance(0.01, 112.01)
	check(chicken.fleeing and not chicken.following and not chicken.escape_route.is_empty(), "Pawn contact overrides trail and runs away")
	scene.queue_free()
	await process_frame
	print("Chicken following checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
