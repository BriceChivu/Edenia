extends SceneTree

var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var layout = level.layout
	var cell := Vector2i(1, 0)
	layout.cells.erase(Vector2i(1, 1)) # Exposed front edge, with water below.
	for height in [0, 64]:
		for ground in layout.cells:
			layout.elevations[ground] = height
		for offset_y in [0, 15, 28]:
			layout.trees[cell] = Vector2(0, offset_y)
			level.rebuild_decorations()
			var anchor: Vector2 = layout.tree_position(cell)
			# Visible roots end about six scene pixels above the sprite anchor.
			var target := anchor - Vector2(0, 4)
			check(layout.walkable_point(target), "Grass immediately below roots is walkable at height %d, offset %d" % [height, offset_y])
			check(not layout.walkable_point(anchor - Vector2(0, 14)), "The visible trunk still blocks movement")
			level.pawn.position = layout.center(layout.HOME)
			level.pawn.walk_to(level.pawn.position)
			level.editing = false
			var click := InputEventMouseButton.new()
			click.button_index = MOUSE_BUTTON_LEFT
			click.pressed = true
			click.position = level.get_global_transform_with_canvas() * (target - Vector2(0, height))
			level.handle_world_click(click)
			var destination: Vector2 = level.waypoints.back() if not level.waypoints.is_empty() else level.pawn.destination
			check(destination.is_equal_approx(target), "Click below roots sends pawn to that spot at height %d, offset %d" % [height, offset_y])
			await create_timer(1.8).timeout
			check(level.pawn.position.is_equal_approx(target), "Pawn reaches the grass below the roots")
	check(not layout.walkable_point(layout.ORIGIN + Vector2(64, 1)), "Water edge retains the pawn foot margin")
	print("Tree root navigation checks: %s" % ("PASS" if failures == 0 else "FAIL (%d)" % failures))
	quit(0 if failures == 0 else 1)
