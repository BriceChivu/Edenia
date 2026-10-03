extends SceneTree

var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(condition: bool, label: String) -> void:
	if not condition:
		failures += 1
		push_error(label)

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	world.harvesting.set_process(false)
	var cell := Vector2i(1, 0)
	var center: Vector2 = world.layout.center(cell)
	world.layout.trees.clear()
	world.layout.flora.clear()
	world.layout.decorations.clear()
	for height in [0, 64, 128]:
		world.layout.elevations[cell] = height
		for count in range(1, 7):
			world.layout.log_piles = {cell: count}
			world.rebuild_decorations()
			var pile: Node2D
			for item in world.flora_nodes:
				if item.has_meta("log_pile") and not item.is_queued_for_deletion():
					pile = item
			pile.set_process(false)
			var patch: PackedVector2Array = world.layout.log_footprint(cell)
			var spread := (mini(count, 3) - 1) * 6.5
			check(patch[0].is_equal_approx(center + Vector2(-16.2 - spread, 18.6)), "Front left matches annotated log contact")
			check(patch[2].is_equal_approx(center + Vector2(18.9 + spread, 11.4)), "Back right matches annotated log contact")
			var original: Array[Vector2] = []
			for sprite in pile.get_children():
				original.append(sprite.global_position)
			for x in [-56, -44, 0, 44, 56, -56]:
				world.pawn.position = center + Vector2(x, 15)
				pile.update_depth()
				var depth: float = pile.position.y - world.pawn.FOOT_DEPTH_Y
				if x < -20:
					check(is_equal_approx(depth, patch[0].y), "Left side sorts from horizontal bottom edge")
					check(pile.position.y > world.pawn.position.y + world.pawn.FOOT_DEPTH_Y, "Left-side pawn stays behind at intermediate Y")
				elif x > 20:
					check(is_equal_approx(depth, patch[2].y), "Right side sorts from horizontal top edge")
					check(pile.position.y < world.pawn.position.y + world.pawn.FOOT_DEPTH_Y, "Right-side pawn stays in front at intermediate Y")
				else:
					check(depth > patch[2].y and depth < patch[0].y, "Depth joins the side references continuously")
				for index in pile.get_child_count():
					check(pile.get_child(index).global_position.is_equal_approx(original[index]), "Sorting preserves each log's artwork position at every elevation")
			check(pile.z_index == height / 64, "Contact sorting retains floor depth")
	print("Log contact/depth checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
