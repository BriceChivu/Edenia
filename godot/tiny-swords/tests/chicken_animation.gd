extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Chicken = preload("res://scripts/chicken_visual.gd")
const Sheep = preload("res://scripts/sheep_visual.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var layout = Layout.new()
	for level in range(2, 8):
		layout.unlock(level)
	layout.flora.clear()
	layout.decorations.clear()
	var cell := Vector2i(1, 0)
	check(layout.edit(cell, "chicken", Vector2i.ZERO), "Place chicken")
	var saved: Dictionary = layout.snapshot()
	for version in [20, 21]:
		var legacy := saved.duplicate(true)
		legacy.version = version
		legacy.chickens = [[cell.x, cell.y]]
		var migrated = Layout.new()
		check(migrated.restore(legacy) and migrated.chickens[0] == layout.center(cell), "Migrate cell coordinates from version " + str(version))
	layout.chickens[0] += Vector2(3.25, -4.5)
	var restored = Layout.new()
	check(restored.restore(layout.snapshot()) and restored.chickens == layout.chickens, "Exact position persists")
	check(restored.chicken_at(cell) == 0 and restored.edit(cell, "remove", Vector2i.ZERO), "Moving chicken remains pickable")
	var invalid := layout.snapshot()
	invalid.chickens = [[INF, 0]]
	check(not Layout.new().restore(invalid), "Reject non-finite saved position")
	invalid.chickens = [[10000, 10000]]
	check(not Layout.new().restore(invalid), "Reject saved position over water")

	var scene = preload("res://previews/level_seven.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	scene.layout.stair_directions.clear()
	scene.layout.trees.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	for x in range(-6, 7):
		scene.layout.cells[Vector2i(x, 0)] = "meadow"
	var origin: Vector2 = scene.layout.center(Vector2i.ZERO)
	scene.layout.sheep.assign([origin])
	scene.layout.chickens.assign([origin])
	var chicken = Chicken.new()
	chicken.world = scene
	scene.get_node("World").add_child(chicken)
	chicken.set_process(false)
	var sheep = Sheep.new()
	sheep.world = scene
	scene.get_node("World").add_child(sheep)
	sheep.set_process(false)
	scene.editing = false
	scene.pawn.position = scene.layout.center(Vector2i(8, 8))
	for animal in [chicken, sheep]:
		animal.previous_pawn_position = scene.pawn.position
		animal.updated_at = 100.0
		animal.grazing_target = 10
	# Identical seeds must produce identical timing, route choice and movement.
	var seen := {}
	for tick in 1200:
		seed(tick + 12345)
		sheep.advance(0.1, 100.0)
		scene.layout.sheep[0] = scene.layout.center(Vector2i(8, 8))
		seed(tick + 12345)
		chicken.advance(0.1, 100.0)
		check(chicken.position.is_equal_approx(sheep.position) and chicken.fleeing == sheep.fleeing and chicken.grazing_cycles == sheep.grazing_cycles and is_equal_approx(chicken.resting_time, sheep.resting_time) and chicken.grazing_target == sheep.grazing_target, "Chicken matches sheep state at tick " + str(tick))
		seen[chicken.texture] = true
	check(seen.has(chicken.Art.CHICKEN_IDLE) and seen.has(chicken.Art.CHICKEN_EATING) and seen.has(chicken.Art.CHICKEN_RUN), "All three sheets play during real behavior")
	chicken.position = origin
	scene.layout.chickens[0] = origin
	scene.layout.sheep[0] = origin + Vector2(-10, 0)
	chicken.fleeing = false
	chicken.escape_route.clear()
	chicken.tile_destinations.clear()
	chicken.advance(0.01, 100.0)
	check(chicken.fleeing and chicken.tile_destinations.size() == 1 and scene.layout.cell_at(chicken.tile_destinations[0]) == Vector2i.RIGHT, "Sheep sharing tile sends chicken one grass tile away")
	chicken.advance(0.6, 100.0)
	check(not chicken.fleeing and scene.layout.cell_at(chicken.position) == Vector2i.RIGHT and scene.layout.chickens[0] == chicken.position, "Sheep escape stops and persists after one tile")
	chicken.position = origin
	chicken.fleeing = false
	scene.layout.cells.erase(Vector2i.RIGHT)
	scene.layout.cells.erase(Vector2i.LEFT)
	chicken.advance(0.01, 100.0)
	check(not chicken.fleeing and chicken.position == origin, "Chicken stays safely when no adjacent grass is reachable")
	scene.layout.cells[Vector2i.RIGHT] = "meadow"
	scene.layout.cells[Vector2i.LEFT] = "meadow"
	for animal in [chicken, sheep]:
		animal.position = origin
		animal.fleeing = false
		animal.escape_route.clear()
		animal.tile_destinations.clear()
		animal.previous_pawn_position = origin - Vector2(10, 0)
		animal.updated_at = 100.0
	scene.layout.chickens[0] = origin
	scene.layout.sheep[0] = origin
	scene.pawn.position = origin
	seed(12345)
	sheep.advance(0.01, 100.0)
	seed(12345)
	chicken.advance(0.01, 100.0)
	check(chicken.escape_route == sheep.escape_route and chicken.tile_destinations.size() in [3, 4, 5], "Same 3–5-step escape opposite pawn approach")
	check(chicken.flip_h and not sheep.flip_h, "Different source facing produces correct mirrored run")
	scene.editing = true
	chicken.advance(0.01, 100.0)
	check(not chicken.fleeing and scene.layout.chickens[0] == chicken.position, "Building settles at safe next step")
	scene.editing = false
	for descending in [false, true]:
		scene.layout.cells.clear()
		scene.layout.elevations.clear()
		for x in 4:
			var stair_cell := Vector2i(x, 0)
			scene.layout.cells[stair_cell] = "stairs" if x == 1 else "meadow"
			scene.layout.elevations[stair_cell] = 64 if (x == 0 if descending else x >= 2) else 0
		scene.layout.stair_directions[Vector2i.RIGHT] = Vector2i.LEFT if descending else Vector2i.RIGHT
		chicken.position = origin
		scene.layout.chickens[0] = origin
		chicken.previous_pawn_position = origin - Vector2(10, 0)
		chicken.fleeing = false
		chicken.escape_route.clear()
		chicken.tile_destinations.clear()
		chicken.updated_at = 100.0
		scene.pawn.position = origin
		chicken.advance(0.59, 100.0)
		check(chicken.fleeing and scene.layout.cell_at(chicken.position) == Vector2i.RIGHT, "Chicken enters connected stair")
		check(chicken.offset.y < -39 and chicken.offset.y > -39 - 64 / chicken.art_scale and chicken.z_index == 1, "Chicken artwork follows stair slope")
		chicken.advance(1.2, 100.0)
		check(not chicken.fleeing and scene.layout.cell_at(chicken.position) == Vector2i(3, 0), "Chicken crosses stairs in both orientations")
		scene.layout.stair_directions.clear()
	scene.queue_free()
	await process_frame
	print("Chicken animation checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
