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
	var world = load("res://previews/level_seven.tscn").instantiate()
	world.set_script(load("res://tests/animal_checkpoint_world.gd"))
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
	world.layout.sheep.assign([origin])
	world.layout.stock.sheep -= 1
	world.checkpoint_causes.clear()
	world.checkpoint_snapshots.clear()
	world.queue_animal_checkpoint(1000)
	for now in range(1001, 6000, 100):
		world.queue_animal_checkpoint(now)
		world.advance_animal_checkpoint(now)
	check(world.checkpoint_causes.is_empty(), "Settled movement coalesces without an immediate persistence request")
	world.layout.sheep[0] = origin + Vector2(15.25, 0)
	world.advance_animal_checkpoint(6000)
	check(world.checkpoint_causes == [true], "Continuous settled movement does not postpone the five-second deadline")
	var restored := Layout.new()
	check(restored.restore(world.checkpoint_snapshots.back()) and restored.sheep[0].is_equal_approx(world.layout.sheep[0]), "One coalesced save captures the exact latest valid position")
	check(not world.flush_animal_checkpoint(), "Flushing a clean scheduler cannot create a redundant save")
	world.queue_animal_checkpoint(6001)
	world.advance_animal_checkpoint(11000)
	check(world.checkpoint_causes.size() == 1, "A later motion batch gets its own five-second interval")
	world.advance_animal_checkpoint(11001)
	check(world.checkpoint_causes == [true, true], "Repeated dirty batches remain bounded and live")
	world.queue_animal_checkpoint(12000)
	world.layout.sheep[0] = origin + Vector2(7.125, 0)
	check(world.flush_animal_checkpoint(), "An explicit boundary flush sends pending movement before its deadline")
	check(world.checkpoint_causes == [true, true, true], "Explicit flush requests exactly one latest checkpoint")
	world.queue_animal_checkpoint(13000)
	world.save_layout()
	world.advance_animal_checkpoint(18000)
	check(world.checkpoint_causes == [true, true, true, false], "Meaningful gameplay saves immediately and absorbs pending movement")
	world.queue_animal_checkpoint(19000)
	var saved: Dictionary = world.saved_snapshot()
	check(world.restore_saved_layout(saved), "A valid replacement restores normally")
	world.advance_animal_checkpoint(24000)
	check(world.checkpoint_causes.size() == 4, "Accepted restoration retires the prior island's pending checkpoint")
	world.queue_animal_checkpoint(25000)
	check(not world.restore_saved_layout({"version": 999}), "Invalid restoration remains rejected")
	world.advance_animal_checkpoint(30000)
	check(world.checkpoint_causes == [true, true, true, false, true], "Rejected restoration does not erase pending motion from the retained island")
	world.queue_free()
	await process_frame
	print("Animal checkpoint scheduler checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
