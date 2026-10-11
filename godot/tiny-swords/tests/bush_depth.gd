extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152, 496)
	var scene = load("res://previews/level_three.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.pawn.set_physics_process(false)
	scene.set_process(false)
	scene.editing = false
	scene.pawn.show()
	scene.layout.flora.clear()
	scene.layout.cells[Vector2i(1, 1)] = "stairs"
	scene.layout.stair_directions[Vector2i(1, 1)] = Vector2i.RIGHT
	var cell := Vector2i(0, 1)
	var center: Vector2 = scene.layout.center(cell)
	var world = scene.get_node("World")
	for ramps in [true, false]:
		if not ramps:
			for placed in scene.layout.cells.keys():
				if scene.layout.cells[placed] == "stairs":
					scene.layout.cells.erase(placed)
		for height in [0, 64, 128]:
			scene.layout.elevations[cell] = height
			for variant in [1, 2]:
				scene.layout.decorations = {cell: {"kind": "bush", "variant": variant}}
				scene.rebuild_decorations()
				var bush: Sprite2D = scene.flora_nodes[0]
				scene.pawn.z_index = int(height / 64.0)
				scene.pawn.sprite.position.y = -32 - height
				check(bush.get_parent() == world and bush.z_index == scene.pawn.z_index, "Bush and pawn share the elevation layer")
				check(bush.position + bush.offset * bush.scale == center - Vector2(0, 11.25 + height), "Changing bush depth preserves its artwork position")
				for front in [false, true]:
					scene.pawn.position = center + Vector2(0, 20 if front else 0)
					await process_frame
					await process_frame
					var pawn_in_front: bool = world.depth_y(scene.pawn) > world.depth_y(bush)
					check(pawn_in_front == front, "Bush must cover feet at tile center and let pawn pass in front beyond its contact edge")
					if OS.get_cmdline_user_args().has("--capture") and ramps and height == 0 and variant == 1:
						await RenderingServer.frame_post_draw
						root.get_texture().get_image().save_png("/tmp/edenia-bush-%s.png" % ("front" if front else "behind"))
					if ramps:
						check((scene.pawn.get_index() > bush.get_index()) == front, "Ramp ordering preserves bush/pawn overlap in both directions")
					else:
						check(world.y_sort_enabled, "Flat terrain uses native Y sorting")
	scene.queue_free()
	await process_frame
	print("Bush depth checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
