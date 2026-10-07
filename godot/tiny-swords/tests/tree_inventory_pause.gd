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

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	var cell := Vector2i(1, 0)
	check(world.layout.edit(cell, "tree", Layout.HOME, -1, Vector2.ZERO), "Place tree")
	world.rebuild_decorations()
	var harvesting = world.harvesting
	check(harvesting.start(cell), "Start tree")
	world.toggle_editing()
	harvesting.advance(60, 1000)
	check(harvesting.phase == Harvesting.Phase.EQUIPPING and harvesting.equip_remaining == Harvesting.EQUIP_SECONDS, "Inventory also pauses equipping the axe")
	world.toggle_editing()
	harvesting.advance(1, 1000)
	var approach_position: Vector2 = world.pawn.position
	var approach_destination: Vector2 = world.pawn.destination
	world.toggle_editing()
	world.pawn._physics_process(1)
	harvesting.advance(60, 1000)
	check(world.pawn.position == approach_position and world.pawn.destination == approach_destination and harvesting.phase == Harvesting.Phase.APPROACHING, "Inventory pauses approach without losing the destination")
	world.toggle_editing()
	world.waypoints.clear()
	world.pawn.position = world.pawn.destination
	harvesting.advance(0, 1000)
	harvesting.advance(4, 1004)
	check(world.layout.tree_cut_remaining[cell] == 6, "Fixture has six seconds left")
	# Queue preservation does not depend on finding a second reachable tree.
	harvesting.pending_trees.append(Vector2i(2, 0))
	world.pawn.sprite.set_frame_and_progress(2, 0.5)
	world.toggle_editing()
	check(not world.pawn.sprite.is_playing(), "Inventory freezes the axe animation")
	world.pawn._physics_process(0.1)
	check(not world.pawn.sprite.is_playing(), "Physics keeps the axe paused")
	harvesting.advance(60, 1064)
	world.pawn.sprite.animation_looped.emit()
	check(world.layout.tree_cut_remaining.get(cell, -1) == 6, "Inventory preserves cutting progress across elapsed time")
	check(world.layout.resources.wood == 0 and not world.layout.tree_stumps.has(cell), "Inventory cannot finish the cut")
	check(harvesting.target == cell and harvesting.pending_trees == [Vector2i(2, 0)], "Inventory preserves target and queue")
	world.toggle_editing()
	check(world.pawn.sprite.is_playing() and world.pawn.sprite.frame == 2, "Closing inventory resumes the same swing")
	harvesting.advance(0, 1064)
	check(world.layout.tree_cut_remaining.get(cell, -1) == 6, "Resuming excludes inventory time")
	harvesting.advance(6, 1070)
	world.toggle_editing()
	world.pawn.sprite.animation_looped.emit()
	check(world.layout.resources.wood == 0 and not world.layout.tree_stumps.has(cell), "Inventory also pauses a cut awaiting its final swing")
	world.toggle_editing()
	world.pawn.sprite.animation_looped.emit()
	check(world.layout.resources.wood == 1 and world.layout.tree_stumps.has(cell), "Resumed cut finishes exactly once")
	world.queue_free()
	await process_frame
	print("Tree inventory pause checks: %d failures" % failures)
	quit(0 if failures == 0 else 1)
