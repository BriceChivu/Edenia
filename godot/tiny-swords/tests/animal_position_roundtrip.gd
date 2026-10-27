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
	for kind in ["sheep", "chicken"]:
		for editing in [false, true]:
			var world = load("res://previews/level_seven.tscn").instantiate()
			world.starting_level = 8
			world.camera_save_enabled = false
			root.add_child(world)
			await process_frame
			world.set_process(false)
			world.pawn.set_physics_process(false)
			for node in world.asset_nodes: node.set_process(false)
			world.layout.flora.clear()
			world.layout.decorations.clear()
			var origin: Vector2 = world.layout.center(Vector2i.ZERO)
			var destination := origin + Vector2(16, 0)
			var positions: Array[Vector2] = world.layout.sheep if kind == "sheep" else world.layout.chickens
			positions.assign([origin])
			world.layout.stock[kind] -= 1
			world.pawn.position = origin + Vector2(-128, -128)
			world.pawn.destination = world.pawn.position
			world.water_phase = world.WaterPhase.READY
			world.editing = editing
			var animal = load("res://scripts/" + kind + "_visual.gd").new()
			animal.world = world
			world.get_node("World").add_child(animal)
			animal.set_process(false)
			animal.previous_pawn_position = world.pawn.position
			animal.updated_at = 100.0
			animal.destination = destination
			animal.fleeing = true
			animal.escape_route.assign([destination])
			animal.tile_destinations.assign([destination])
			if kind == "chicken": animal.wandering = true
			animal.advance(0.01 if editing else 1.0, 100.0)
			var label: String = kind + (" edit-settle" if editing else " route-finish")
			check(positions[0].is_equal_approx(destination), label + " reaches its safe resting point")
			var restored := Layout.new()
			check(restored.restore(world.saved_snapshot()), label + " snapshot is valid")
			var restored_positions: Array[Vector2] = restored.sheep if kind == "sheep" else restored.chickens
			check(restored_positions.size() == 1 and restored_positions[0].is_equal_approx(destination), label + " retains its actual position after reload")
			world.queue_free()
			await process_frame
	print("Animal position roundtrip checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
