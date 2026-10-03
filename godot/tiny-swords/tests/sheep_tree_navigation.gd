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
	# The only connecting tile remains traversable for every tree variant,
	# approach axis, and an off-center trunk that intersects the direct path.
	for kind in ["tree", "tree2", "tree3", "tree4"]:
		for direction in [Vector2i.RIGHT, Vector2i.DOWN]:
			for trunk_offset in [Vector2.ZERO, Vector2(0, 12)]:
				scene.layout.cells.clear()
				scene.layout.elevations.clear()
				scene.layout.stair_directions.clear()
				scene.layout.trees.clear()
				for cell in [Vector2i.ZERO, direction, direction * 2]:
					scene.layout.cells[cell] = "meadow"
				scene.layout.trees[direction] = trunk_offset
				scene.layout.tree_types[direction] = kind
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
				check(sheep.fleeing, "Sheep enters tree tile: " + kind)
				for tick in 300:
					var before: Vector2 = sheep.position
					sheep.advance(0.01, 100.0)
					check(scene.clear_segment(before, sheep.position), "Every segment avoids tree contact: " + kind)
				check(sheep.position.distance_to(target) < 0.001, "Sheep reaches grass beyond tree: " + kind)
				check(not sheep.fleeing and sheep.texture == sheep.Art.SHEEP_IDLE, "Sheep stops after detour")
				var resting: Vector2 = sheep.tile_target(direction)
				scene.layout.sheep[0] = resting
				var saved: Dictionary = scene.layout.snapshot()
				for stock_kind in saved.stock:
					saved.stock[stock_kind] = 0
				saved.stock.meadow = 18
				saved.stock.tree = 1
				saved.stock.bridge = 1
				var copy = Layout.new()
				check(copy.restore(saved) and copy.sheep[0] == resting, "Safe position inside tree tile survives reload")

	scene.queue_free()
	await process_frame
	print("Sheep tree navigation checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
