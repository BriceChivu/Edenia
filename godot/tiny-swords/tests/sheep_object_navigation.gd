extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	seed(12345)
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.selected = "sheep"
	check(scene.apply_edit(Vector2i(1, 0)), "Place test sheep")
	var sheep = scene.asset_nodes[0]
	sheep.set_process(false)
	scene.layout.trees.clear()
	for count in range(1, 7):
		for direction in [Vector2i.RIGHT, Vector2i.DOWN]:
			scene.layout.cells.clear()
			scene.layout.elevations.clear()
			scene.layout.stair_directions.clear()
			scene.layout.log_piles.clear()
			for cell in [Vector2i.ZERO, direction, direction * 2]:
				scene.layout.cells[cell] = "meadow"
			scene.layout.log_piles[direction] = count
			sheep.position = scene.layout.center(Vector2i.ZERO)
			scene.layout.sheep[0] = sheep.position
			scene.pawn.position = sheep.position
			sheep.previous_pawn_position = sheep.position - Vector2(direction) * 10
			sheep.approach_direction = Vector2(direction)
			sheep.fleeing = false
			sheep.updated_at = 100.0
			scene.editing = false
			var target: Vector2 = scene.layout.center(direction * 2)
			sheep.advance(0.01, 100.0)
			check(sheep.fleeing, "Log tile permits escape for pile " + str(count))
			for tick in 300:
				var before: Vector2 = sheep.position
				sheep.advance(0.01, 100.0)
				check(scene.clear_segment(before, sheep.position, true), "Sheep stays on safe ground")
				check(not scene.layout.log_blocks_contact(direction, before, sheep.position), "Sheep never steps on log contact")
			check(sheep.position.distance_to(target) < 0.001, "Sheep passes pile " + str(count))
			var safe: Vector2 = sheep.tile_target(direction)
			var saved: Dictionary = scene.layout.snapshot()
			saved.sheep = [[safe.x, safe.y]]
			for stock_kind in saved.stock:
				saved.stock[stock_kind] = 0
			saved.stock.meadow = 18
			saved.stock.tree = 2
			saved.stock.bridge = 1
			saved.resources.wood = count
			var copy = Layout.new()
			check(copy.restore(saved) and copy.sheep[0] == safe, "Safe position in log tile survives reload")
			var contact := Vector2.ZERO
			for vertex in scene.layout.log_footprint(direction):
				contact += vertex / 4.0
			saved.sheep = [[contact.x, contact.y]]
			check(not copy.restore(saved), "Save rejects sheep on log contact")
	# Houses reserve their footprint, and neighboring grass stays available.
	scene.layout.log_piles.clear()
	scene.layout.houses[Vector2i.RIGHT] = 0
	check(not scene.layout.walkable_point(scene.layout.center(Vector2i.RIGHT), true), "House contact blocks sheep")
	check(scene.layout.walkable_point(scene.layout.center(Vector2i.ZERO), true), "Ground beside house remains usable")

	scene.queue_free()
	await process_frame
	print("Sheep object navigation checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
